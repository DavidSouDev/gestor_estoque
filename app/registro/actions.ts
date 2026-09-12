"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { empresaService } from "@/app/services/empresa.service";
import { createAdminSession } from "@/lib/session";
import { HttpError } from "@/lib/http-error";
import { registroBloqueado, registrarCriacaoDeEmpresa } from "@/lib/registro-rate-limit";
import { extrairIpDoChamador } from "@/lib/client-ip";
import { uploadImage } from "@/lib/storage/r2";
import { documentoValido, normalizarDocumento } from "@/lib/cpf-cnpj";
import type { ModoInterface } from "@prisma/client";

export interface RegisterState {
  error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Numa Server Action o Next não expõe `request.ip` — `extrairIpDoChamador`
 * (`lib/client-ip.ts`) é o único sinal disponível, lido dos headers da
 * requisição atual.
 */
async function ipDoChamador(): Promise<string> {
  return extrairIpDoChamador(await headers());
}

export async function register(
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const ip = await ipDoChamador();

  if (await registroBloqueado(ip)) {
    return { error: "Muitas tentativas de cadastro. Tente novamente em alguns minutos." };
  }

  const nomeEmpresa = String(formData.get("nomeEmpresa") ?? "").trim();
  const nomeResponsavel = String(formData.get("nomeResponsavel") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const confirmarSenha = String(formData.get("confirmarSenha") ?? "");
  const modoInterfaceRaw = String(formData.get("modoInterface") ?? "");
  const cpfCnpj = normalizarDocumento(String(formData.get("cpfCnpj") ?? ""));
  const telefone = String(formData.get("telefone") ?? "").trim() || undefined;
  const instagram = String(formData.get("instagram") ?? "").trim() || undefined;
  const logoFile = formData.get("logoFile");
  // `String(... ?? "")` colapsa os três estados de fracasso num só: campo
  // ausente do payload, campo presente e vazio (o hidden input existe mas nunca
  // foi escrito) e campo forjado com outro valor. Todos viram uma string
  // diferente de `"true"` e caem na mesma recusa, sem ramificação extra.
  const termosAceitos = String(formData.get("termosAceitos") ?? "");
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

  if (!documentoValido(cpfCnpj)) {
    return { error: "Informe um CPF ou CNPJ válido." };
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
  // gate do modal: este campo só recebe valor no submit que ocorre DEPOIS do
  // clique em "Li e aceito, criar minha loja", de modo que no DOM real não
  // existe caminho para ele chegar preenchido sem o aceite explícito.
  //
  // As duas metades existem sempre: "nunca confiar só no client" é o padrão que
  // este mesmo arquivo já aplica a email e senha, e um formulário submetido com
  // JS desabilitado ou por cliente próprio não passa pela primeira.
  //
  // A copy é a E3 da UI-SPEC, literal.
  if (termosAceitos !== "true") {
    return { error: "É preciso aceitar os Termos de Uso para criar a conta." };
  }

  // MESMA mensagem de propósito. O hidden input do termo viaja junto do da prova
  // de aceite, então a ausência dele só acontece com formulário adulterado ou
  // renderizado num estado impossível — expor uma mensagem técnica ao usuário
  // não o ajudaria a agir.
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
      cpfCnpj,
      modoInterface: modoInterfaceRaw as ModoInterface,
      telefone,
      instagram,
      // O id que o USUÁRIO viu no formulário. O service compara por igualdade
      // contra o vigente do servidor antes de abrir a transação (Pitfall 4) e
      // grava sempre o dele — este valor nunca chega ao banco por si só.
      termoAceitoId: termoId,
    });

    // Best-effort, de propósito: o upload precisa do `empresaId` (só existe
    // depois do create acima), então não pode entrar na mesma transação. Uma
    // falha aqui NÃO pode derrubar um cadastro que já foi concluído com
    // sucesso — a pior consequência é a loja nascer sem logo, corrigível
    // depois em "Minha Loja" (mesmo caminho de `marca/actions.ts`).
    if (logoFile instanceof File && logoFile.size > 0) {
      try {
        const url = await uploadImage(logoFile, empresa.id, "empresas/logos");
        await empresaService.update(empresa.id, { logo: url });
      } catch (error) {
        console.error("[registro] falha ao enviar logo no cadastro (best-effort)", error);
      }
    }

    await registrarCriacaoDeEmpresa(ip);

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
