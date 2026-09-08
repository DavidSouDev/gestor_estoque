"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { empresaService } from "@/app/services/empresa.service";
import { usuarioService } from "@/app/services/usuario.service";
import type { ModoInterface } from "@prisma/client";
import { uploadImage, deleteImage, UploadError } from "@/lib/storage/r2";

export interface BrandingFormState {
  error?: string;
  success?: boolean;
}

async function resolveLogo(formData: FormData, empresaId: string): Promise<string | undefined> {
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

    return undefined;
  }

  return atual;
}

export async function updateBranding(
  slug: string,
  _prevState: BrandingFormState,
  formData: FormData
): Promise<BrandingFormState> {
  const auth = await requireAdminSession(slug);

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

  let logo: string | undefined;

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

  await usuarioService.update(auth.sub, { nome: nomeUsuario });

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}/admin/marca`);
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/admin/login`);

  return { success: true };
}
