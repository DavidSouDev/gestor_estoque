"use server";

import { redirect } from "next/navigation";
import { empresaService } from "@/app/services/empresa.service";
import { createAdminSession } from "@/lib/session";
import { HttpError } from "@/lib/http-error";
import type { ModoInterface } from "@prisma/client";

export interface RegisterState {
  error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const nomeEmpresa = String(formData.get("nomeEmpresa") ?? "").trim();
  const nomeResponsavel = String(formData.get("nomeResponsavel") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const confirmarSenha = String(formData.get("confirmarSenha") ?? "");
  const modoInterfaceRaw = String(formData.get("modoInterface") ?? "");

  if (!nomeEmpresa) {
    return { error: "Informe o nome da empresa." };
  }

  if (!nomeResponsavel) {
    return { error: "Informe seu nome." };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { error: "Informe um email válido." };
  }

  if (senha.length < 6) {
    return { error: "A senha deve ter pelo menos 6 caracteres." };
  }

  if (senha !== confirmarSenha) {
    return { error: "As senhas não coincidem." };
  }

  if (modoInterfaceRaw !== "SIMPLES" && modoInterfaceRaw !== "COMPLETO") {
    return { error: "Selecione um modo de uso." };
  }

  let redirectTo: string;

  try {
    const { empresa, usuario } = await empresaService.registerComUsuario({
      nomeEmpresa,
      nomeResponsavel,
      email,
      senha,
      modoInterface: modoInterfaceRaw as ModoInterface,
    });

    await createAdminSession({
      sub: usuario.id,
      empresaId: empresa.id,
      empresaSlug: empresa.slug,
      email: usuario.email,
      role: usuario.role,
    });

    redirectTo = `/${empresa.slug}/admin`;
  } catch (error) {
    if (error instanceof HttpError) {
      return { error: error.message };
    }

    console.error(error);

    return { error: "Não foi possível concluir o cadastro. Tente novamente." };
  }

  redirect(redirectTo);
}
