import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 4 * 1024 * 1024;

export class UploadError extends Error {}

/**
 * DUPLICAÇÃO DELIBERADA do `obrigatorio` de `lib/billing/asaas/config.ts` —
 * mesmo motivo documentado em `lib/billing/cron-config.ts`: acoplar módulos
 * sem razão de compartilhar grafo de import custa mais que repetir 8 linhas.
 *
 * Antes disto, as credenciais do R2 eram lidas com `?? ""` — exatamente a
 * coalescência silenciosa para string vazia que o projeto já identificou como
 * bug (T-03-06, ver `lib/billing/asaas/config.ts:4-9`): uma env var ausente
 * virava uma chamada autenticada com credencial em branco, que falhava lá na
 * frente com um erro do SDK sem relação nenhuma com a causa real.
 */
function obrigatorio(nome: string): string {
  const valor = process.env[nome];

  // String vazia é tratada como ausente de propósito: `R2_ACCESS_KEY_ID=` num
  // `.env` mal preenchido é indistinguível, na prática, de não ter a chave.
  if (valor === undefined || valor === "") {
    throw new Error(`[r2] variável de ambiente ausente: ${nome}`);
  }

  return valor;
}

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${obrigatorio("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: obrigatorio("R2_ACCESS_KEY_ID"),
        secretAccessKey: obrigatorio("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  return client;
}

/**
 * `empresaId` entra na PRIMEIRA posição da key (`empresaId/folder/uuid.ext`),
 * não por organização — é o que permite a `deleteImage` recusar apagar um
 * objeto de outro tenant só olhando o prefixo da URL, sem precisar consultar o
 * banco. Nunca gerar a key sem esse prefixo.
 */
export async function uploadImage(file: File, empresaId: string, folder: string): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new UploadError("Formato inválido. Envie uma imagem JPG, PNG ou WEBP.");
  }

  if (file.size > MAX_SIZE_BYTES) {
    throw new UploadError("Imagem muito grande. O tamanho máximo é 4MB.");
  }

  const ext = file.type.split("/")[1];
  const key = `${empresaId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // `getClient()` FORA do `try`: um erro de configuração (env var ausente) não
  // pode virar o mesmo `UploadError` genérico de uma falha real de rede/SDK —
  // isso mascararia um deploy mal configurado atrás de uma mensagem que manda
  // o usuário "tentar de novo", quando tentar de novo nunca vai funcionar.
  const cliente = getClient();

  try {
    await cliente.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    );
  } catch {
    throw new UploadError("Erro ao enviar imagem. Tente novamente.");
  }

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

/**
 * Best-effort: nunca deixa uma falha ao apagar o objeto antigo derrubar a
 * ação principal (salvar/atualizar/excluir). Ignora URLs que não são do
 * nosso bucket (ex: URLs digitadas manualmente antes dessa migração).
 *
 * `empresaId` é OBRIGATÓRIO e não é apenas documentação: a URL a apagar quase
 * sempre chega influenciada por input do chamador (campo oculto do form,
 * argumento de Server Action), então ela nunca é confiável por si só. Exigir o
 * `empresaId` da SESSÃO e comparar contra o prefixo da key (ver `uploadImage`)
 * é o que impede um admin da empresa A de apagar uma imagem da empresa B só
 * por conhecer/adivinhar a URL pública dela — a checagem de posse mora aqui,
 * no único lugar que fala com a R2, em vez de depender de cada chamador
 * lembrar de revalidar contra o banco.
 */
export async function deleteImage(url: string, empresaId: string): Promise<void> {
  const publicUrl = process.env.R2_PUBLIC_URL ?? "";
  const prefix = `${publicUrl}/${empresaId}/`;

  if (!publicUrl || !url.startsWith(prefix)) {
    return;
  }

  const key = url.slice(`${publicUrl}/`.length);

  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      })
    );
  } catch {
    // Best-effort — o objeto pode ficar órfão, mas isso não deve quebrar o fluxo principal.
  }
}
