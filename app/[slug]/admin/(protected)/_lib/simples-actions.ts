"use server";

import { revalidatePath } from "next/cache";
import { Prisma, TipoMovimentacao } from "@prisma/client";
import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { movimentacaoEstoqueService } from "@/app/services/movimentacao-estoque.service";
import { promocaoService } from "@/app/services/promocao.service";
import { comboService } from "@/app/services/combo.service";
import { uploadImage, deleteImage, UploadError } from "@/lib/storage/r2";

export interface SimplesActionState {
  error?: string;
  success?: boolean;
}

export async function uploadImagemProduto(
  slug: string,
  formData: FormData
): Promise<{ url?: string; error?: string }> {
  const auth = await requireAdminSession(slug);

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione uma imagem." };
  }

  try {
    const url = await uploadImage(file, auth.empresaId, "produtos");
    return { url };
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "Erro ao enviar imagem." };
  }
}

export async function removerImagemProduto(slug: string, url: string): Promise<void> {
  const auth = await requireAdminSession(slug);
  await deleteImage(url, auth.empresaId);
}

export async function criarProdutoSimples(
  slug: string,
  data: { nome: string; precoVarejo: number; estoque: number; fotoCapa?: string }
): Promise<SimplesActionState> {
  const auth = await requireAdminSession(slug);

  const nome = data.nome.trim();

  if (!nome) {
    return { error: "Informe o nome do produto." };
  }

  if (!Number.isFinite(data.precoVarejo) || data.precoVarejo <= 0) {
    return { error: "Informe um preço válido." };
  }

  const estoque = Number.isFinite(data.estoque) && data.estoque >= 0 ? data.estoque : 0;
  const codigo = await produtoService.generateUniqueCodigo(auth.empresaId, nome);

  try {
    await produtoService.create({
      empresaId: auth.empresaId,
      codigo,
      nome,
      precoVarejo: data.precoVarejo,
      precoAtacado: data.precoVarejo,
      estoque,
      fotoCapa: data.fotoCapa?.trim() || undefined,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Já existe um produto com esse código. Tente novamente." };
    }

    throw error;
  }

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}`);

  return { success: true };
}

export async function registrarMovimentacaoSimples(
  slug: string,
  data: { produtoId: string; quantidade: number; tipo: "ENTRADA" | "SAIDA" }
): Promise<SimplesActionState> {
  const auth = await requireAdminSession(slug);

  if (!data.produtoId) {
    return { error: "Selecione um produto." };
  }

  if (!Number.isFinite(data.quantidade) || data.quantidade <= 0) {
    return { error: "Informe uma quantidade válida." };
  }

  const produto = await produtoService.findById(data.produtoId);

  if (!produto || produto.empresaId !== auth.empresaId) {
    return { error: "Produto não encontrado." };
  }

  try {
    await movimentacaoEstoqueService.create({
      produtoId: data.produtoId,
      usuarioId: auth.sub,
      empresaId: auth.empresaId,
      tipo: data.tipo === "ENTRADA" ? TipoMovimentacao.ENTRADA : TipoMovimentacao.SAIDA,
      quantidade: data.quantidade,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao registrar a movimentação." };
  }

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}`);

  return { success: true };
}

export async function criarPromocaoSimples(
  slug: string,
  data: { produtoId: string; preco: number; dataInicio: string; dataFim: string }
): Promise<SimplesActionState> {
  const auth = await requireAdminSession(slug);

  if (!data.produtoId) {
    return { error: "Selecione um produto." };
  }

  if (!Number.isFinite(data.preco) || data.preco <= 0) {
    return { error: "Informe um preço válido." };
  }

  const inicio = new Date(`${data.dataInicio}T00:00:00`);
  const fim = new Date(`${data.dataFim}T23:59:59`);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    return { error: "Informe datas válidas." };
  }

  if (fim <= inicio) {
    return { error: "A data final precisa ser depois da data inicial." };
  }

  const produto = await produtoService.findById(data.produtoId);

  if (!produto || produto.empresaId !== auth.empresaId) {
    return { error: "Produto não encontrado." };
  }

  await promocaoService.create({
    empresaId: auth.empresaId,
    nome: `Promoção ${produto.nome}`,
    dataInicio: inicio,
    dataFim: fim,
    itens: [{ produtoId: data.produtoId, preco: data.preco }],
  });

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}`);

  return { success: true };
}

export async function criarComboSimples(
  slug: string,
  data: { nome: string; preco: number; produtoIds: string[] }
): Promise<SimplesActionState> {
  const auth = await requireAdminSession(slug);

  const nome = data.nome.trim();

  if (!nome) {
    return { error: "Informe o nome do combo." };
  }

  if (!Number.isFinite(data.preco) || data.preco <= 0) {
    return { error: "Informe um preço válido." };
  }

  if (data.produtoIds.length === 0) {
    return { error: "Selecione ao menos um produto." };
  }

  // Nunca confiar nos ids vindos do client — confirma que pertencem à empresa da sessão.
  const produtos = await produtoService.list(auth.empresaId);
  const idsValidos = new Set(produtos.map((produto) => produto.id));
  const itens = data.produtoIds
    .filter((id) => idsValidos.has(id))
    .map((produtoId) => ({ produtoId, quantidade: 1 }));

  if (itens.length === 0) {
    return { error: "Selecione ao menos um produto válido." };
  }

  const combo = await comboService.create({ empresaId: auth.empresaId, nome, preco: data.preco });
  await comboService.updateItens(combo.id, itens, auth.empresaId);

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}`);

  return { success: true };
}

export async function atualizarProdutoSimples(
  slug: string,
  id: string,
  data: { nome: string; precoVarejo: number; estoque: number; fotoCapa?: string }
): Promise<SimplesActionState> {
  const auth = await requireAdminSession(slug);
  const produto = await produtoService.findById(id);

  if (!produto || produto.empresaId !== auth.empresaId) {
    return { error: "Produto não encontrado." };
  }

  const nome = data.nome.trim();

  if (!nome) {
    return { error: "Informe o nome do produto." };
  }

  if (!Number.isFinite(data.precoVarejo) || data.precoVarejo <= 0) {
    return { error: "Informe um preço válido." };
  }

  const estoque = Number.isFinite(data.estoque) && data.estoque >= 0 ? data.estoque : 0;

  await produtoService.update(id, {
    nome,
    precoVarejo: data.precoVarejo,
    precoAtacado: data.precoVarejo,
    estoque,
    fotoCapa: data.fotoCapa?.trim() || undefined,
  });

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}`);

  return { success: true };
}

export async function removerProdutoSimples(slug: string, id: string): Promise<SimplesActionState> {
  const auth = await requireAdminSession(slug);
  const produto = await produtoService.findById(id);

  if (!produto || produto.empresaId !== auth.empresaId) {
    return { error: "Produto não encontrado." };
  }

  await produtoService.delete(id);

  if (produto.fotoCapa) {
    await deleteImage(produto.fotoCapa, auth.empresaId);
  }

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}`);

  return { success: true };
}

export async function atualizarComboSimples(
  slug: string,
  id: string,
  data: { nome: string; preco: number; produtoIds: string[] }
): Promise<SimplesActionState> {
  const auth = await requireAdminSession(slug);
  const combo = await comboService.findById(id);

  if (!combo || combo.empresaId !== auth.empresaId) {
    return { error: "Combo não encontrado." };
  }

  const nome = data.nome.trim();

  if (!nome) {
    return { error: "Informe o nome do combo." };
  }

  if (!Number.isFinite(data.preco) || data.preco <= 0) {
    return { error: "Informe um preço válido." };
  }

  if (data.produtoIds.length === 0) {
    return { error: "Selecione ao menos um produto." };
  }

  const produtos = await produtoService.list(auth.empresaId);
  const idsValidos = new Set(produtos.map((produto) => produto.id));
  const itens = data.produtoIds
    .filter((produtoId) => idsValidos.has(produtoId))
    .map((produtoId) => ({ produtoId, quantidade: 1 }));

  if (itens.length === 0) {
    return { error: "Selecione ao menos um produto válido." };
  }

  await comboService.update(id, { nome, preco: data.preco });
  await comboService.updateItens(id, itens, auth.empresaId);

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}`);

  return { success: true };
}

export async function removerComboSimples(slug: string, id: string): Promise<SimplesActionState> {
  const auth = await requireAdminSession(slug);
  const combo = await comboService.findById(id);

  if (!combo || combo.empresaId !== auth.empresaId) {
    return { error: "Combo não encontrado." };
  }

  await comboService.delete(id);

  if (combo.fotoCapa) {
    await deleteImage(combo.fotoCapa, auth.empresaId);
  }

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}`);

  return { success: true };
}

export async function atualizarPromocaoSimples(
  slug: string,
  id: string,
  data: { produtoId: string; preco: number; dataInicio: string; dataFim: string }
): Promise<SimplesActionState> {
  const auth = await requireAdminSession(slug);
  const promocao = await promocaoService.findById(id);

  if (!promocao || promocao.empresaId !== auth.empresaId) {
    return { error: "Promoção não encontrada." };
  }

  if (!data.produtoId) {
    return { error: "Selecione um produto." };
  }

  if (!Number.isFinite(data.preco) || data.preco <= 0) {
    return { error: "Informe um preço válido." };
  }

  const inicio = new Date(`${data.dataInicio}T00:00:00`);
  const fim = new Date(`${data.dataFim}T23:59:59`);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    return { error: "Informe datas válidas." };
  }

  if (fim <= inicio) {
    return { error: "A data final precisa ser depois da data inicial." };
  }

  const produto = await produtoService.findById(data.produtoId);

  if (!produto || produto.empresaId !== auth.empresaId) {
    return { error: "Produto não encontrado." };
  }

  await promocaoService.update(id, {
    nome: `Promoção ${produto.nome}`,
    dataInicio: inicio,
    dataFim: fim,
  });
  await promocaoService.updateItens(
    id,
    [{ produtoId: data.produtoId, preco: data.preco }],
    auth.empresaId
  );

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}`);

  return { success: true };
}

export async function removerPromocaoSimples(slug: string, id: string): Promise<SimplesActionState> {
  const auth = await requireAdminSession(slug);
  const promocao = await promocaoService.findById(id);

  if (!promocao || promocao.empresaId !== auth.empresaId) {
    return { error: "Promoção não encontrada." };
  }

  await promocaoService.delete(id);

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}`);

  return { success: true };
}
