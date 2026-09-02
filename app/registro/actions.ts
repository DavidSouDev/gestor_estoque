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
  // Sem `String(...)`: um checkbox desmarcado simplesmente NÃO é enviado pelo
  // browser, e a diferença entre `null` e `"on"` é o que a validação abaixo lê.
  const aceiteTermos = formData.get("aceiteTermos");
  const termoId = String(formData.get("termoId") ?? "").trim();

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

  // D-11 — a metade SERVER da validação dupla de TERM-01. A metade CLIENT é o
  // `required` do checkbox (plano 06-07), e as duas existem sempre: "nunca
  // confiar só no client" é o padrão que este mesmo arquivo já aplica a email e
  // senha, e um formulário submetido com JS desabilitado ou por cliente próprio
  // não passa pela primeira metade.
  //
  // `"on"` é o valor nativo de um checkbox marcado; a copy é a E3 da UI-SPEC,
  // literal.
  if (aceiteTermos !== "on") {
    return { error: "É preciso aceitar os Termos de Uso para criar a conta." };
  }

  // MESMA mensagem de propósito. O hidden input viaja junto do checkbox, então a
  // ausência dele só acontece com formulário adulterado ou renderizado num estado
  // impossível — expor uma mensagem técnica ao usuário não o ajudaria a agir.
  if (!termoId) {
    return { error: "É preciso aceitar os Termos de Uso para criar a conta." };
  }

  let redirectTo: string;

  try {
    const { empresa, usuario } = await empresaService.registerComUsuario({
      nomeEmpresa,
      nomeResponsavel,
      email,
      senha,
      modoInterface: modoInterfaceRaw as ModoInterface,
      // O id que o USUÁRIO viu no formulário. O service compara por igualdade
      // contra o vigente do servidor antes de abrir a transação (Pitfall 4) e
      // grava sempre o dele — este valor nunca chega ao banco por si só.
      termoAceitoId: termoId,
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
