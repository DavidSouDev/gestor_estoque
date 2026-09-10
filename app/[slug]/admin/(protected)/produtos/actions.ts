"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { assertBelongsToEmpresa } from "../../_lib/guards";
import { uploadImage, deleteImage, UploadError } from "@/lib/storage/r2";

export interface ProdutoFormState {
  error?: string;
}

/**
 * Retorna `null` (não `undefined`) para "remover": `undefined` num `data` do
 * Prisma significa "não mexe nesse campo" — a coluna antiga sobreviveria à
 * remoção. `null` é o único valor que de fato limpa `fotoCapa` no update.
 */
async function resolveFotoCapa(formData: FormData, empresaId: string): Promise<string | null | undefined> {
  const atual = String(formData.get("fotoCapa") ?? "").trim() || undefined;
  const file = formData.get("fotoCapaFile");

  if (file instanceof File && file.size > 0) {
    const nova = await uploadImage(file, empresaId, "produtos");

    if (atual) {
      await deleteImage(atual, empresaId);
    }

    return nova;
  }

  if (formData.get("removerFotoCapa") === "on") {
    if (atual) {
      await deleteImage(atual, empresaId);
    }

    return null;
  }

  return atual;
}

function parseProdutoForm(formData: FormData) {
  const precoVarejo = Number(formData.get("precoVarejo"));
  const precoAtacadoRaw = String(formData.get("precoAtacado") ?? "").trim();
  const estoque = Number(formData.get("estoque") ?? 0);

  return {
    codigo: String(formData.get("codigo") ?? "").trim() || undefined,
    nome: String(formData.get("nome") ?? "").trim(),
    descricao: String(formData.get("descricao") ?? "").trim() || undefined,
    categoria: String(formData.get("categoria") ?? "").trim() || "Geral",
    precoVarejo,
    precoAtacado: precoAtacadoRaw ? Number(precoAtacadoRaw) : undefined,
    estoque: Number.isNaN(estoque) ? 0 : estoque,
    destaque: formData.get("destaque") === "on",
    visivelCatalogo: formData.get("visivelCatalogo") === "on",
  };
}

function validarProduto(dados: ReturnType<typeof parseProdutoForm>): string | null {
  if (!dados.nome) {
    return "Informe o nome do produto.";
  }

  // `!Number.isFinite` cobre NaN E os dois infinitos de uma vez; `<= 0` fecha
  // o buraco que só barrava NaN e deixava preço zero/negativo passar direto
  // pro Prisma — visível na vitrine pública via `PRODUTO_CATALOGO_SELECT`.
  // Mesmo piso que `criarProdutoSimples` já aplica em `simples-actions.ts`.
  if (!Number.isFinite(dados.precoVarejo) || dados.precoVarejo <= 0) {
    return "Informe um preço de varejo válido.";
  }

  if (
    dados.precoAtacado !== undefined &&
    (!Number.isFinite(dados.precoAtacado) || dados.precoAtacado <= 0)
  ) {
    return "Informe um preço de atacado válido.";
  }

  if (!Number.isFinite(dados.estoque) || dados.estoque < 0) {
    return "Informe um estoque válido.";
  }

  return null;
}

export async function createProduto(
  slug: string,
  _prevState: ProdutoFormState,
  formData: FormData
): Promise<ProdutoFormState> {
  const auth = await requireAdminSession(slug);
  const dados = parseProdutoForm(formData);
  const erro = validarProduto(dados);

  if (erro) {
    return { error: erro };
  }

  let fotoCapa: string | null | undefined;

  try {
    fotoCapa = await resolveFotoCapa(formData, auth.empresaId);
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "Erro ao enviar imagem." };
  }

  const codigo = dados.codigo || (await produtoService.generateUniqueCodigo(auth.empresaId, dados.nome));
  const precoAtacado = dados.precoAtacado ?? dados.precoVarejo;

  try {
    await produtoService.create({
      ...dados,
      fotoCapa,
      codigo,
      precoAtacado,
      empresaId: auth.empresaId,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Já existe um produto com esse código. Tente novamente." };
    }

    throw error;
  }

  revalidatePath(`/${slug}/admin/produtos`);
  revalidatePath(`/${slug}`);
  redirect(`/${slug}/admin/produtos`);
}

export async function updateProduto(
  slug: string,
  id: string,
  _prevState: ProdutoFormState,
  formData: FormData
): Promise<ProdutoFormState> {
  const auth = await requireAdminSession(slug);
  await assertBelongsToEmpresa(await produtoService.findById(id), auth.empresaId);

  const dados = parseProdutoForm(formData);
  const erro = validarProduto(dados);

  if (erro) {
    return { error: erro };
  }

  let fotoCapa: string | null | undefined;

  try {
    fotoCapa = await resolveFotoCapa(formData, auth.empresaId);
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "Erro ao enviar imagem." };
  }

  try {
    await produtoService.update(id, {
      ...dados,
      fotoCapa,
      precoAtacado: dados.precoAtacado ?? dados.precoVarejo,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Já existe um produto com esse código." };
    }

    throw error;
  }

  revalidatePath(`/${slug}/admin/produtos`);
  revalidatePath(`/${slug}/admin/produtos/${id}`);
  revalidatePath(`/${slug}`);
  redirect(`/${slug}/admin/produtos`);
}

export async function deleteProduto(slug: string, id: string) {
  const auth = await requireAdminSession(slug);
  const produto = await produtoService.findById(id);
  await assertBelongsToEmpresa(produto, auth.empresaId);

  await produtoService.delete(id);

  if (produto?.fotoCapa) {
    await deleteImage(produto.fotoCapa, auth.empresaId);
  }

  revalidatePath(`/${slug}/admin/produtos`);
  revalidatePath(`/${slug}`);
}

export async function toggleProdutoCatalogo(slug: string, id: string) {
  const auth = await requireAdminSession(slug);
  await assertBelongsToEmpresa(await produtoService.findById(id), auth.empresaId);

  await produtoService.toggleCatalogo(id);

  revalidatePath(`/${slug}/admin/produtos`);
  revalidatePath(`/${slug}`);
}

export async function toggleProdutoDestaque(slug: string, id: string) {
  const auth = await requireAdminSession(slug);
  await assertBelongsToEmpresa(await produtoService.findById(id), auth.empresaId);

  await produtoService.toggleDestaque(id);

  revalidatePath(`/${slug}/admin/produtos`);
  revalidatePath(`/${slug}`);
}
