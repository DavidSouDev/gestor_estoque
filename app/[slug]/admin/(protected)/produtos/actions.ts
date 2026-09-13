"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { assertBelongsToEmpresa } from "../../_lib/guards";
import { uploadImage, deleteImage, UploadError } from "@/lib/storage/r2";
import { sincronizarFotosDoProduto } from "../_lib/sincronizar-fotos-produto";

export interface ProdutoFormState {
  error?: string;
}

/**
 * Upload de UMA foto por chamada — o campo de fotos do produto
 * (`MultiImageUploadField`) faz upload imediato por arquivo, nunca em lote.
 * As URLs resultantes chegam no submit do formulário como `imagemUrl`
 * repetido (`formData.getAll`), lidas em `parseFotos` abaixo.
 */
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

function parseFotos(formData: FormData): string[] {
  return formData
    .getAll("imagemUrl")
    .map(String)
    .map((url) => url.trim())
    .filter(Boolean);
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
    controlaEstoquePorVariante: formData.get("controlaEstoquePorVariante") === "on",
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

  const fotos = parseFotos(formData);
  const codigo = dados.codigo || (await produtoService.generateUniqueCodigo(auth.empresaId, dados.nome));
  const precoAtacado = dados.precoAtacado ?? dados.precoVarejo;

  let produtoCriado;

  try {
    produtoCriado = await produtoService.create({
      ...dados,
      fotoCapa: fotos[0]?.trim() || undefined,
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

  // 2+ fotos escolhidas de uma vez viram uma variante cada — ver
  // sincronizar-fotos-produto.ts (mesma regra do modo SIMPLES).
  await sincronizarFotosDoProduto(produtoCriado.id, fotos, auth.empresaId);

  revalidatePath(`/${slug}/admin/produtos`);
  revalidatePath(`/${slug}`);
  // Vai direto pra tela de edição (não pra listagem): é lá que mora a seção
  // "Variantes" (pra configurar atributos/preço/estoque por variante, se
  // quiser ir além do que a foto sozinha resolve).
  redirect(`/${slug}/admin/produtos/${produtoCriado.id}`);
}

export async function updateProduto(
  slug: string,
  id: string,
  _prevState: ProdutoFormState,
  formData: FormData
): Promise<ProdutoFormState> {
  const auth = await requireAdminSession(slug);
  const produto = await assertBelongsToEmpresa(await produtoService.findById(id), auth.empresaId);

  const dados = parseProdutoForm(formData);
  const erro = validarProduto(dados);

  if (erro) {
    return { error: erro };
  }

  const fotos = parseFotos(formData);

  try {
    await produtoService.update(id, {
      ...dados,
      fotoCapa: fotos[0]?.trim() || undefined,
      precoAtacado: dados.precoAtacado ?? dados.precoVarejo,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Já existe um produto com esse código." };
    }

    throw error;
  }

  await sincronizarFotosDoProduto(id, fotos, auth.empresaId, produto.fotoCapa);

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

  const imagensParaRemover = [
    ...(produto?.fotoCapa ? [produto.fotoCapa] : []),
    // O cascade do banco apaga as linhas de ProdutoVariante/Imagem, mas o
    // bucket R2 não sabe nada disso — precisa ser limpo explicitamente aqui,
    // senão os objetos ficam órfãos.
    ...(produto?.variantes.flatMap((variante) => variante.imagens.map((imagem) => imagem.url)) ?? []),
  ];

  await Promise.all(imagensParaRemover.map((url) => deleteImage(url, auth.empresaId)));

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
