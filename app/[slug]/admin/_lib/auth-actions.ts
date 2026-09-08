"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { usuarioService } from "@/app/services/usuario.service";
import { createAdminSession, destroySession } from "@/lib/session";
import { HttpError } from "@/lib/http-error";
import { extrairIpDoChamador } from "@/lib/client-ip";

export interface LoginState {
  error?: string;
}

export async function login(
  slug: string,
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { error: "Informe email e senha." };
  }

  const ip = extrairIpDoChamador(await headers());

  let usuario;

  try {
    usuario = await usuarioService.validatePassword(email, senha, ip);
  } catch (error) {
    if (error instanceof HttpError) {
      return { error: error.message };
    }

    throw error;
  }

  // Mesma condição que o DAL aplica na revalidação: quem for rejeitado lá no
  // request seguinte já é rejeitado aqui na entrada, sem criar sessão. Checagem
  // por veracidade (e não `!== null`) para tratar o campo ausente como
  // "não removida". Mensagem única — não distinguir o motivo da rejeição.
  if (!usuario || !usuario.ativo || usuario.empresa.deletedAt) {
    return { error: "Email ou senha inválidos." };
  }

  // Vínculo tenant: o usuário precisa pertencer exatamente à empresa deste slug,
  // nunca apenas "estar autenticado" em alguma empresa.
  if (usuario.empresa.slug !== slug) {
    return { error: "Este usuário não pertence a esta empresa." };
  }

  await createAdminSession({
    sub: usuario.id,
    empresaId: usuario.empresaId,
    empresaSlug: slug,
    email: usuario.email,
    role: usuario.role,
  });

  redirect(`/${slug}/admin`);
}

export async function logout(slug: string) {
  await destroySession();
  redirect(`/${slug}/admin/login`);
}
