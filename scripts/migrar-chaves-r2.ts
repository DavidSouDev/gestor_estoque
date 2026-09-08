/**
 * Migra objetos da R2 da key ANTIGA (`folder/uuid.ext`, sem tenant) para a
 * NOVA (`empresaId/folder/uuid.ext`) introduzida junto da correção de exclusão
 * cross-tenant de imagens (`lib/storage/r2.ts`).
 *
 * POR QUE ISTO EXISTE: `deleteImage(url, empresaId)` só apaga um objeto cuja
 * URL comece com `${R2_PUBLIC_URL}/${empresaId}/`. Qualquer produto, combo ou
 * logo cuja imagem foi enviada ANTES dessa correção tem uma URL no formato
 * antigo — sem esse prefixo — e portanto nunca mais será apagável pela
 * aplicação: trocar a foto, ou excluir o produto/combo, deixa o objeto velho
 * ÓRFÃO na R2 para sempre (silencioso: nenhum erro visível, o `deleteImage`
 * simplesmente não faz nada porque a URL não bate no prefixo esperado).
 *
 * Rodar com `npm run r2:migrar-chaves` — por padrão em modo DRY RUN, que só
 * lista o que seria migrado. Passar `--apply` para migrar de verdade.
 *
 * O QUE O SCRIPT FAZ, por produto/combo/logo com URL no formato antigo:
 * 1. copia o objeto para a key nova (`CopyObjectCommand`, sem baixar/reenviar
 *    o arquivo — a cópia acontece dentro da própria R2);
 * 2. atualiza a URL gravada no banco para a nova key;
 * 3. só então apaga o objeto antigo.
 *
 * ORDEM DELIBERADA: copiar-atualizar-apagar, nunca apagar antes de confirmar
 * que a cópia e a escrita no banco tiveram sucesso — uma falha no meio do
 * caminho deixa o objeto ANTIGO ainda no ar (órfão nunca é pior que perdido) e
 * pode ser corrigida rodando o script de novo (idempotente: uma URL que já
 * está no formato novo é ignorada em qualquer execução seguinte).
 */
import { S3Client, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";

const APLICAR = process.argv.includes("--apply");

function variavelObrigatoria(nome: string): string {
  const valor = process.env[nome];

  if (!valor) {
    console.error(`[r2:migrar-chaves] variável de ambiente ausente: ${nome}`);
    process.exit(1);
  }

  return valor;
}

function montarCliente(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${variavelObrigatoria("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: variavelObrigatoria("R2_ACCESS_KEY_ID"),
      secretAccessKey: variavelObrigatoria("R2_SECRET_ACCESS_KEY"),
    },
  });
}

interface RegistroComImagem {
  tabela: "produto" | "combo" | "empresa";
  id: string;
  empresaId: string;
  campo: "fotoCapa" | "logo";
  url: string;
}

async function listarRegistrosComImagem(): Promise<RegistroComImagem[]> {
  const [produtos, combos, empresas] = await Promise.all([
    prisma.produto.findMany({
      where: { fotoCapa: { not: null } },
      select: { id: true, empresaId: true, fotoCapa: true },
    }),
    prisma.combo.findMany({
      where: { fotoCapa: { not: null } },
      select: { id: true, empresaId: true, fotoCapa: true },
    }),
    prisma.empresa.findMany({
      where: { logo: { not: null } },
      select: { id: true, logo: true },
    }),
  ]);

  return [
    ...produtos.map((p) => ({
      tabela: "produto" as const,
      id: p.id,
      empresaId: p.empresaId,
      campo: "fotoCapa" as const,
      url: p.fotoCapa!,
    })),
    ...combos.map((c) => ({
      tabela: "combo" as const,
      id: c.id,
      empresaId: c.empresaId,
      campo: "fotoCapa" as const,
      url: c.fotoCapa!,
    })),
    ...empresas.map((e) => ({
      tabela: "empresa" as const,
      id: e.id,
      empresaId: e.id,
      campo: "logo" as const,
      url: e.logo!,
    })),
  ];
}

async function principal(): Promise<void> {
  const publicUrl = variavelObrigatoria("R2_PUBLIC_URL");
  const bucket = variavelObrigatoria("R2_BUCKET");
  const registros = await listarRegistrosComImagem();

  const prefixo = `${publicUrl}/`;
  const client = APLICAR ? montarCliente() : null;
  let pendentes = 0;
  let migrados = 0;
  let ignoradosForaDoBucket = 0;

  for (const registro of registros) {
    if (!registro.url.startsWith(prefixo)) {
      // URL que nunca foi da nossa R2 (ex: digitada manualmente antes da
      // migração para R2) — `deleteImage` já ignora esses casos também.
      ignoradosForaDoBucket += 1;
      continue;
    }

    const keyAtual = registro.url.slice(prefixo.length);

    if (keyAtual.startsWith(`${registro.empresaId}/`)) {
      // Já está no formato novo (upload feito depois da correção).
      continue;
    }

    pendentes += 1;
    const keyNova = `${registro.empresaId}/${keyAtual}`;
    const urlNova = `${publicUrl}/${keyNova}`;

    console.log(
      `[r2:migrar-chaves] ${registro.tabela} ${registro.id}: ${keyAtual} -> ${keyNova}`
    );

    if (!APLICAR || !client) {
      continue;
    }

    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${keyAtual}`,
        Key: keyNova,
      })
    );

    switch (registro.tabela) {
      case "produto":
        await prisma.produto.update({ where: { id: registro.id }, data: { fotoCapa: urlNova } });
        break;
      case "combo":
        await prisma.combo.update({ where: { id: registro.id }, data: { fotoCapa: urlNova } });
        break;
      case "empresa":
        await prisma.empresa.update({ where: { id: registro.id }, data: { logo: urlNova } });
        break;
    }

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keyAtual }));

    migrados += 1;
  }

  console.log(
    `[r2:migrar-chaves] ${APLICAR ? "aplicado" : "dry run"}: ` +
      `${pendentes} pendentes, ${migrados} migrados, ${ignoradosForaDoBucket} fora do bucket.`
  );

  if (!APLICAR && pendentes > 0) {
    console.log("[r2:migrar-chaves] rode com --apply para migrar de verdade.");
  }
}

principal()
  .catch((erro: unknown) => {
    console.error("[r2:migrar-chaves] falha:", erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
