"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/session";
import { comboService } from "@/app/services/combo.service";
import { produtoService } from "@/app/services/produto.service";
import { assertBelongsToEmpresa } from "../../_lib/guards";
import { uploadImage, deleteImage, UploadError } from "@/lib/storage/r2";

export interface ComboFormState {
  error?: string;
}

async function resolveFotoCapa(formData: FormData): Promise<string | undefined> {
  const atual = String(formData.get("fotoCapa") ?? "").trim() || undefined;
  const file = formData.get("fotoCapaFile");

  if (file instanceof File && file.size > 0) {
    const nova = await uploadImage(file, "combos");

    if (atual) {
      await deleteImage(atual);
    }

    return nova;
  }

  if (formData.get("removerFotoCapa") === "on") {
    if (atual) {
      await deleteImage(atual);
    }

    return undefined;
  }

  return atual;
}

function parseComboForm(formData: FormData) {
  return {
    nome: String(formData.get("nome") ?? "").trim(),
    descricao: String(formData.get("descricao") ?? "").trim() || undefined,
    preco: Number(formData.get("preco")),
    destaque: formData.get("destaque") === "on",
    visivel: formData.get("visivel") === "on",
  };
}

function parseItens(formData: FormData) {
  const itens: { produtoId: string; quantidade: number }[] = [];

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("item-") && value === "on") {
      const produtoId = key.slice("item-".length);
      const quantidadeRaw = Number(formData.get(`qty-${produtoId}`));

      itens.push({
        produtoId,
        quantidade: Number.isFinite(quantidadeRaw) && quantidadeRaw > 0 ? quantidadeRaw : 1,
      });
    }
  }

  return itens;
}

// O checkbox só manda o produtoId — nunca confiar nele sem confirmar que o
// produto realmente pertence à empresa da sessão (evita referenciar produto
// de outra empresa dentro de um combo via formulário adulterado).
async function itensValidosDaEmpresa(
  itens: { produtoId: string; quantidade: number }[],
  empresaId: string
) {
  const produtos = await produtoService.list(empresaId);
  const idsValidos = new Set(produtos.map((produto) => produto.id));

  return itens.filter((item) => idsValidos.has(item.produtoId));
}

function validarCombo(dados: ReturnType<typeof parseComboForm>): string | null {
  if (!dados.nome) {
    return "Informe o nome do combo.";
  }

  if (Number.isNaN(dados.preco)) {
    return "Informe um preço válido.";
  }

  return null;
}

export async function createCombo(
  slug: string,
  _prevState: ComboFormState,
  formData: FormData
): Promise<ComboFormState> {
  const auth = await requireAdminSession(slug);
  const dados = parseComboForm(formData);
  const erro = validarCombo(dados);

  if (erro) {
    return { error: erro };
  }

  let fotoCapa: string | undefined;

  try {
    fotoCapa = await resolveFotoCapa(formData);
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "Erro ao enviar imagem." };
  }

  const itens = await itensValidosDaEmpresa(parseItens(formData), auth.empresaId);

  if (itens.length === 0) {
    return { error: "Selecione ao menos um produto para o combo." };
  }

  const combo = await comboService.create({ ...dados, fotoCapa, empresaId: auth.empresaId });
  await comboService.updateItens(combo.id, itens);

  revalidatePath(`/${slug}/admin/combos`);
  revalidatePath(`/${slug}`);
  redirect(`/${slug}/admin/combos`);
}

export async function updateCombo(
  slug: string,
  id: string,
  _prevState: ComboFormState,
  formData: FormData
): Promise<ComboFormState> {
  const auth = await requireAdminSession(slug);
  await assertBelongsToEmpresa(await comboService.findById(id), auth.empresaId);

  const dados = parseComboForm(formData);
  const erro = validarCombo(dados);

  if (erro) {
    return { error: erro };
  }

  let fotoCapa: string | undefined;

  try {
    fotoCapa = await resolveFotoCapa(formData);
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "Erro ao enviar imagem." };
  }

  const itens = await itensValidosDaEmpresa(parseItens(formData), auth.empresaId);

  if (itens.length === 0) {
    return { error: "Selecione ao menos um produto para o combo." };
  }

  await comboService.update(id, { ...dados, fotoCapa });
  await comboService.updateItens(id, itens);

  revalidatePath(`/${slug}/admin/combos`);
  revalidatePath(`/${slug}/admin/combos/${id}`);
  revalidatePath(`/${slug}`);
  redirect(`/${slug}/admin/combos`);
}

export async function deleteCombo(slug: string, id: string) {
  const auth = await requireAdminSession(slug);
  const combo = await comboService.findById(id);
  await assertBelongsToEmpresa(combo, auth.empresaId);

  await comboService.delete(id);

  if (combo?.fotoCapa) {
    await deleteImage(combo.fotoCapa);
  }

  revalidatePath(`/${slug}/admin/combos`);
  revalidatePath(`/${slug}`);
}

export async function toggleComboCatalogo(slug: string, id: string) {
  const auth = await requireAdminSession(slug);
  await assertBelongsToEmpresa(await comboService.findById(id), auth.empresaId);

  await comboService.toggleCatalogo(id);

  revalidatePath(`/${slug}/admin/combos`);
  revalidatePath(`/${slug}`);
}

export async function toggleComboDestaque(slug: string, id: string) {
  const auth = await requireAdminSession(slug);
  await assertBelongsToEmpresa(await comboService.findById(id), auth.empresaId);

  await comboService.toggleDestaque(id);

  revalidatePath(`/${slug}/admin/combos`);
  revalidatePath(`/${slug}`);
}
