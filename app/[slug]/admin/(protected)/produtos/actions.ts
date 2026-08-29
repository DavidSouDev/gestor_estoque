"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { assertBelongsToEmpresa } from "../../_lib/guards";

export interface ProdutoFormState {
  error?: string;
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
    fotoCapa: String(formData.get("fotoCapa") ?? "").trim() || undefined,
    destaque: formData.get("destaque") === "on",
    visivelCatalogo: formData.get("visivelCatalogo") === "on",
  };
}

function validarProduto(dados: ReturnType<typeof parseProdutoForm>): string | null {
  if (!dados.nome) {
    return "Informe o nome do produto.";
  }

  if (Number.isNaN(dados.precoVarejo)) {
    return "Informe um preço de varejo válido.";
  }

  if (dados.precoAtacado !== undefined && Number.isNaN(dados.precoAtacado)) {
    return "Informe um preço de atacado válido.";
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

  const codigo = dados.codigo || (await produtoService.generateUniqueCodigo(auth.empresaId, dados.nome));
  const precoAtacado = dados.precoAtacado ?? dados.precoVarejo;

  try {
    await produtoService.create({
      ...dados,
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

  try {
    await produtoService.update(id, {
      ...dados,
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
  await assertBelongsToEmpresa(await produtoService.findById(id), auth.empresaId);

  await produtoService.delete(id);

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
