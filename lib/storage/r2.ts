import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 4 * 1024 * 1024;

export class UploadError extends Error {}

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    });
  }

  return client;
}

export async function uploadImage(file: File, folder: string): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new UploadError("Formato inválido. Envie uma imagem JPG, PNG ou WEBP.");
  }

  if (file.size > MAX_SIZE_BYTES) {
    throw new UploadError("Imagem muito grande. O tamanho máximo é 4MB.");
  }

  const ext = file.type.split("/")[1];
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await getClient().send(
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
 */
export async function deleteImage(url: string): Promise<void> {
  const publicUrl = process.env.R2_PUBLIC_URL ?? "";
  const prefix = `${publicUrl}/`;

  if (!publicUrl || !url.startsWith(prefix)) {
    return;
  }

  const key = url.slice(prefix.length);

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
