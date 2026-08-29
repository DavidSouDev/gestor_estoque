"use server";

import { redirect } from "next/navigation";
import { usuarioService } from "@/app/services/usuario.service";
import { createAdminSession, destroySession } from "@/lib/session";

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

  const usuario = await usuarioService.validatePassword(email, senha);

  if (!usuario || !usuario.ativo) {
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
