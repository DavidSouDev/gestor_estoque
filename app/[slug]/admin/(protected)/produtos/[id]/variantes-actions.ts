"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { produtoVarianteService } from "@/app/services/produto-variante.service";
import { assertBelongsToEmpresa } from "../../../_lib/guards";
import { uploadImage, deleteImage, UploadError } from "@/lib/storage/r2";

export interface VarianteFormState {
  error?: string;
}

function revalidarProduto(slug: string, produtoId: string) {
  revalidatePath(`/${slug}/admin/produtos/${produtoId}`);
  revalidatePath(`/${slug}/admin/produtos`);
  revalidatePath(`/${slug}/admin/estoque`);
  revalidatePath(`/${slug}/produtos/${produtoId}`);
  revalidatePath(`/${slug}`);
}

/**
 * Upload de UMA imagem por chamada — não existe endpoint de upload em lote.
 * O componente de galeria da variante dispara uma chamada desta action por
 * arquivo escolhido, em sequência (nunca `Promise.all`: Next.js despacha
 * Server Actions do mesmo cliente uma de cada vez). Isso também evita
 * qualquer risco de estourar `serverActions.bodySizeLimit` (5MB em
 * next.config.ts) — cada request carrega só 1 arquivo, já validado em até
 * 4MB por `uploadImage`.
 *
 * Não grava nada no banco: só sobe pro R2 e devolve a URL pública, que fica
 * em estado local no cliente até o formulário da variante ser salvo.
 */
export async function uploadImagemVariante(
  slug: string,
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  const auth = await requireAdminSession(slug);
  const file = formData.get("arquivo");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione uma imagem." };
  }

  try {
    const url = await uploadImage(file, auth.empresaId, "produtos/variantes");
    return { url };
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "Erro ao enviar imagem." };
  }
}

function parseVarianteForm(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  const precoVarejoRaw = String(formData.get("precoVarejo") ?? "").trim();
  const precoAtacadoRaw = String(formData.get("precoAtacado") ?? "").trim();
  const estoqueRaw = String(formData.get("estoque") ?? "").trim();

  const atributoNomes = formData.getAll("atributoNome").map(String);
  const atributoValores = formData.getAll("atributoValor").map(String);
  const atributos = atributoNomes
    .map((nomeAtributo, index) => ({
      nome: nomeAtributo.trim(),
      valor: (atributoValores[index] ?? "").trim(),
    }))
    .filter((atributo) => atributo.nome && atributo.valor);

  const imagemUrls = formData.getAll("imagemUrl").map(String);
  const imagemAlts = formData.getAll("imagemAlt").map(String);
  const imagens = imagemUrls
    .map((url, index) => ({
      url: url.trim(),
      alt: (imagemAlts[index] ?? "").trim() || undefined,
    }))
    .filter((imagem) => imagem.url);

  return {
    nome,
    precoVarejo: precoVarejoRaw ? Number(precoVarejoRaw) : null,
    precoAtacado: precoAtacadoRaw ? Number(precoAtacadoRaw) : null,
    estoque: estoqueRaw ? Number(estoqueRaw) : 0,
    atributos,
    imagens,
  };
}

function validarVariante(dados: ReturnType<typeof parseVarianteForm>): string | null {
  if (!dados.nome) {
    return "Informe um nome para a variante.";
  }

  if (
    dados.precoVarejo !== null &&
    (!Number.isFinite(dados.precoVarejo) || dados.precoVarejo <= 0)
  ) {
    return "Informe um preço de varejo válido, ou deixe em branco para usar o do produto.";
  }

  if (
    dados.precoAtacado !== null &&
    (!Number.isFinite(dados.precoAtacado) || dados.precoAtacado <= 0)
  ) {
    return "Informe um preço de atacado válido, ou deixe em branco para usar o do produto.";
  }

  if (!Number.isFinite(dados.estoque) || dados.estoque < 0) {
    return "Informe um estoque válido.";
  }

  if (dados.atributos.length === 0) {
    return "Adicione ao menos um atributo (ex: Tamanho: P).";
  }

  return null;
}

export async function createVariante(
  slug: string,
  produtoId: string,
  _prevState: VarianteFormState,
  formData: FormData
): Promise<VarianteFormState> {
  const auth = await requireAdminSession(slug);
  await assertBelongsToEmpresa(await produtoService.findById(produtoId), auth.empresaId);

  const dados = parseVarianteForm(formData);
  const erro = validarVariante(dados);

  if (erro) {
    return { error: erro };
  }

  await produtoVarianteService.create({
    produtoId,
    nome: dados.nome,
    atributos: dados.atributos,
    precoVarejo: dados.precoVarejo,
    precoAtacado: dados.precoAtacado,
    estoque: dados.estoque,
    imagens: dados.imagens,
  });

  revalidarProduto(slug, produtoId);

  return {};
}

export async function updateVariante(
  slug: string,
  varianteId: string,
  _prevState: VarianteFormState,
  formData: FormData
): Promise<VarianteFormState> {
  const auth = await requireAdminSession(slug);
  const variante = await produtoVarianteService.findById(varianteId);
  await assertBelongsToEmpresa(variante?.produto, auth.empresaId);

  const dados = parseVarianteForm(formData);
  const erro = validarVariante(dados);

  if (erro) {
    return { error: erro };
  }

  const urlsNovas = new Set(dados.imagens.map((imagem) => imagem.url));
  const urlsRemovidas = variante!.imagens
    .map((imagem) => imagem.url)
    .filter((url) => !urlsNovas.has(url));

  await produtoVarianteService.update(varianteId, {
    nome: dados.nome,
    atributos: dados.atributos,
    precoVarejo: dados.precoVarejo,
    precoAtacado: dados.precoAtacado,
    estoque: dados.estoque,
    imagens: dados.imagens,
  });

  await Promise.all(urlsRemovidas.map((url) => deleteImage(url, auth.empresaId)));

  revalidarProduto(slug, variante!.produtoId);

  return {};
}

export async function deleteVariante(slug: string, varianteId: string) {
  const auth = await requireAdminSession(slug);
  const variante = await produtoVarianteService.findById(varianteId);
  await assertBelongsToEmpresa(variante?.produto, auth.empresaId);

  await produtoVarianteService.delete(varianteId);

  await Promise.all(
    (variante?.imagens ?? []).map((imagem) => deleteImage(imagem.url, auth.empresaId))
  );

  revalidarProduto(slug, variante!.produtoId);
}

export async function toggleVarianteAtivo(slug: string, varianteId: string) {
  const auth = await requireAdminSession(slug);
  const variante = await produtoVarianteService.findById(varianteId);
  await assertBelongsToEmpresa(variante?.produto, auth.empresaId);

  await produtoVarianteService.toggleAtivo(varianteId);

  revalidarProduto(slug, variante!.produtoId);
}

export async function reorderVariante(slug: string, produtoId: string, varianteId: string, ordem: number) {
  const auth = await requireAdminSession(slug);
  const variante = await produtoVarianteService.findById(varianteId);
  await assertBelongsToEmpresa(variante?.produto, auth.empresaId);

  await produtoVarianteService.reorder(varianteId, ordem);

  revalidarProduto(slug, produtoId);
}
