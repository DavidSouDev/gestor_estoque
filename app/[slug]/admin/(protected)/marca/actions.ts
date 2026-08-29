"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { empresaService } from "@/app/services/empresa.service";

export interface BrandingFormState {
  error?: string;
  success?: boolean;
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

  await empresaService.update(auth.empresaId, {
    nome,
    descricao: String(formData.get("descricao") ?? "").trim() || undefined,
    logo: String(formData.get("logo") ?? "").trim() || undefined,
    telefone: String(formData.get("telefone") ?? "").trim() || undefined,
    instagram: String(formData.get("instagram") ?? "").trim() || undefined,
    primaryColor: String(formData.get("primaryColor") ?? "").trim() || undefined,
    accentColor: String(formData.get("accentColor") ?? "").trim() || undefined,
  });

  revalidatePath(`/${slug}/admin`);
  revalidatePath(`/${slug}/admin/marca`);
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/admin/login`);

  return { success: true };
}
