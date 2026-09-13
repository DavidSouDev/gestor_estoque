"use server";

import { revalidatePath } from "next/cache";
import { TipoMovimentacao } from "@prisma/client";
import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { movimentacaoEstoqueService } from "@/app/services/movimentacao-estoque.service";

export interface MovimentacaoFormState {
  error?: string;
}

export async function registrarMovimentacao(
  slug: string,
  _prevState: MovimentacaoFormState,
  formData: FormData
): Promise<MovimentacaoFormState> {
  const auth = await requireAdminSession(slug);

  const produtoId = String(formData.get("produtoId") ?? "");
  const produtoVarianteId = String(formData.get("produtoVarianteId") ?? "").trim() || undefined;
  const tipo = String(formData.get("tipo") ?? "") as TipoMovimentacao;
  const quantidade = Number(formData.get("quantidade"));
  const motivo = String(formData.get("motivo") ?? "").trim() || undefined;

  if (!produtoId || !Object.values(TipoMovimentacao).includes(tipo)) {
    return { error: "Selecione um produto e um tipo de movimentação válidos." };
  }

  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    return { error: "Informe uma quantidade maior que zero." };
  }

  // O service já confere produto.empresaId === empresaId internamente, mas
  // validar aqui primeiro dá uma mensagem de erro limpa em vez de um throw genérico.
  const produto = await produtoService.findById(produtoId);

  if (!produto || produto.empresaId !== auth.empresaId) {
    return { error: "Produto não encontrado." };
  }

  if (produto.controlaEstoquePorVariante && !produtoVarianteId) {
    return { error: "Este produto controla estoque por variante — selecione uma variante." };
  }

  try {
    await movimentacaoEstoqueService.create({
      produtoId,
      produtoVarianteId,
      usuarioId: auth.sub,
      empresaId: auth.empresaId,
      tipo,
      quantidade,
      motivo,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao registrar movimentação." };
  }

  revalidatePath(`/${slug}/admin/estoque`);
  revalidatePath(`/${slug}/admin/produtos`);
  revalidatePath(`/${slug}/admin/produtos/${produtoId}`);
  revalidatePath(`/${slug}`);

  return {};
}
