"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/session";
import { promocaoService, PromocaoItemDTO } from "@/app/services/promocao.service";
import { produtoService } from "@/app/services/produto.service";
import { comboService } from "@/app/services/combo.service";
import { assertBelongsToEmpresa } from "../../_lib/guards";

export interface PromocaoFormState {
  error?: string;
}

function parseDatas(formData: FormData) {
  return {
    dataInicio: new Date(String(formData.get("dataInicio") ?? "")),
    dataFim: new Date(String(formData.get("dataFim") ?? "")),
  };
}

function parseItens(formData: FormData): PromocaoItemDTO[] {
  const itens: PromocaoItemDTO[] = [];

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("item-produto-") && value === "on") {
      const produtoId = key.slice("item-produto-".length);
      const preco = Number(formData.get(`preco-produto-${produtoId}`));

      if (Number.isFinite(preco) && preco >= 0) {
        itens.push({ produtoId, preco });
      }
    } else if (key.startsWith("item-combo-") && value === "on") {
      const comboId = key.slice("item-combo-".length);
      const preco = Number(formData.get(`preco-combo-${comboId}`));

      if (Number.isFinite(preco) && preco >= 0) {
        itens.push({ comboId, preco });
      }
    }
  }

  return itens;
}

// Mesma lógica de defesa usada em combos: nunca aceitar produtoId/comboId
// vindo do form sem confirmar que pertence à empresa da sessão.
async function itensValidosDaEmpresa(itens: PromocaoItemDTO[], empresaId: string) {
  const [produtos, combos] = await Promise.all([
    produtoService.list(empresaId),
    comboService.list(empresaId),
  ]);

  const produtoIds = new Set(produtos.map((produto) => produto.id));
  const comboIds = new Set(combos.map((combo) => combo.id));

  return itens.filter((item) =>
    item.produtoId ? produtoIds.has(item.produtoId) : item.comboId ? comboIds.has(item.comboId) : false
  );
}

function validar(nome: string, dataInicio: Date, dataFim: Date): string | null {
  if (!nome) {
    return "Informe o nome da promoção.";
  }

  if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
    return "Informe datas de início e fim válidas.";
  }

  if (dataFim <= dataInicio) {
    return "A data final precisa ser depois da data inicial.";
  }

  return null;
}

export async function createPromocao(
  slug: string,
  _prevState: PromocaoFormState,
  formData: FormData
): Promise<PromocaoFormState> {
  const auth = await requireAdminSession(slug);
  const nome = String(formData.get("nome") ?? "").trim();
  const { dataInicio, dataFim } = parseDatas(formData);
  const erro = validar(nome, dataInicio, dataFim);

  if (erro) {
    return { error: erro };
  }

  const itens = await itensValidosDaEmpresa(parseItens(formData), auth.empresaId);

  if (itens.length === 0) {
    return { error: "Selecione ao menos um produto ou combo." };
  }

  await promocaoService.create({ empresaId: auth.empresaId, nome, dataInicio, dataFim, itens });

  revalidatePath(`/${slug}/admin/promocoes`);
  revalidatePath(`/${slug}`);
  redirect(`/${slug}/admin/promocoes`);
}

export async function updatePromocao(
  slug: string,
  id: string,
  _prevState: PromocaoFormState,
  formData: FormData
): Promise<PromocaoFormState> {
  const auth = await requireAdminSession(slug);
  await assertBelongsToEmpresa(await promocaoService.findById(id), auth.empresaId);

  const nome = String(formData.get("nome") ?? "").trim();
  const { dataInicio, dataFim } = parseDatas(formData);
  const erro = validar(nome, dataInicio, dataFim);

  if (erro) {
    return { error: erro };
  }

  const itens = await itensValidosDaEmpresa(parseItens(formData), auth.empresaId);

  if (itens.length === 0) {
    return { error: "Selecione ao menos um produto ou combo." };
  }

  await promocaoService.update(id, { nome, dataInicio, dataFim });
  await promocaoService.updateItens(id, itens);

  revalidatePath(`/${slug}/admin/promocoes`);
  revalidatePath(`/${slug}/admin/promocoes/${id}`);
  revalidatePath(`/${slug}`);
  redirect(`/${slug}/admin/promocoes`);
}

export async function deletePromocao(slug: string, id: string) {
  const auth = await requireAdminSession(slug);
  await assertBelongsToEmpresa(await promocaoService.findById(id), auth.empresaId);

  await promocaoService.delete(id);

  revalidatePath(`/${slug}/admin/promocoes`);
  revalidatePath(`/${slug}`);
}
