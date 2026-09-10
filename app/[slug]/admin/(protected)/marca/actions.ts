"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession, updateSelfAndRenewSession } from "@/lib/session";
import { empresaService } from "@/app/services/empresa.service";
import { usuarioService } from "@/app/services/usuario.service";
import type { ModoInterface } from "@prisma/client";
import { uploadImage, deleteImage, UploadError } from "@/lib/storage/r2";

export interface BrandingFormState {
  error?: string;
  success?: boolean;
}

/**
 * Retorna `null` (não `undefined`) para "remover": `undefined` num `data` do
 * Prisma (ou no allowlist de `EmpresaService.update`, que só grava campos
 * `!== undefined`) significa "não mexe nesse campo" — a logo antiga
 * sobreviveria à remoção. `null` é o único valor que de fato limpa `logo`.
 */
async function resolveLogo(formData: FormData, empresaId: string): Promise<string | null | undefined> {
  const atual = String(formData.get("logo") ?? "").trim() || undefined;
  const file = formData.get("logoFile");

  if (file instanceof File && file.size > 0) {
    const nova = await uploadImage(file, empresaId, "empresas/logos");

    if (atual) {
      await deleteImage(atual, empresaId);
    }

    return nova;
  }

  if (formData.get("removerLogo") === "on") {
    if (atual) {
      await deleteImage(atual, empresaId);
    }

    return null;
  }

  return atual;
}

export async function updateBranding(
  slug: string,
  _prevState: BrandingFormState,
  formData: FormData
): Promise<BrandingFormState> {
  const auth = await requireAdminSession(slug);
  const usuarioAtual = await usuarioService.findById(auth.sub);

  const nome = String(formData.get("nome") ?? "").trim();

  if (!nome) {
    return { error: "Informe o nome da empresa." };
  }

  const nomeUsuario = String(formData.get("nomeUsuario") ?? "").trim();

  if (!nomeUsuario) {
    return { error: "Informe seu nome." };
  }

  const modoInterfaceRaw = String(formData.get("modoInterface") ?? "");

  if (modoInterfaceRaw !== "SIMPLES" && modoInterfaceRaw !== "COMPLETO") {
    return { error: "Selecione um modo de uso válido." };
  }

  let logo: string | null | undefined;

  try {
    logo = await resolveLogo(formData, auth.empresaId);
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "Erro ao enviar imagem." };
  }

  await empresaService.update(auth.empresaId, {
    nome,
    descricao: String(formData.get("descricao") ?? "").trim() || undefined,
    logo,
    telefone: String(formData.get("telefone") ?? "").trim() || undefined,
    instagram: String(formData.get("instagram") ?? "").trim() || undefined,
    primaryColor: String(formData.get("primaryColor") ?? "").trim() || undefined,
    accentColor: String(formData.get("accentColor") ?? "").trim() || undefined,
    modoInterface: modoInterfaceRaw as ModoInterface,
  });

  // Só grava em `Usuario` quando o nome realmente mudou (evita um write
  // gratuito a cada submissão, já que o formulário sempre reenvia o nome
  // atual). Quando muda, `updateSelfAndRenewSession` (lib/session.ts) reemite
  // o cookie na mesma escrita — sem isso, a escrita autoinvalidaria a própria
  // sessão de quem salvou (ver o JSDoc da função para o mecanismo completo).
  if (nomeUsuario !== usuarioAtual?.nome) {
    await updateSelfAndRenewSession(auth, { nome: nomeUsuario });
  }

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}/admin/marca`);
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/admin/login`);

  return { success: true };
}
