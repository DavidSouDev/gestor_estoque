// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { HttpError } from "@/lib/http-error";

/**
 * `vi.hoisted` + `redirect` que LANÇA: mesma forma de
 * `app/[slug]/admin/bloqueado/page.test.ts`. `register` termina em
 * `redirect(redirectTo)` FORA do `try`, e o `redirect` real do Next sinaliza
 * lançando `NEXT_REDIRECT` — um mock que apenas registrasse a chamada deixaria a
 * função seguir executando código que, em produção, nunca roda.
 */
const {
  redirectMock,
  createAdminSessionMock,
  registerComUsuarioMock,
  empresaUpdateMock,
  uploadImageMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  createAdminSessionMock: vi.fn(),
  registerComUsuarioMock: vi.fn(),
  empresaUpdateMock: vi.fn(),
  uploadImageMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/session", () => ({
  createAdminSession: createAdminSessionMock,
}));

vi.mock("@/app/services/empresa.service", () => ({
  empresaService: { registerComUsuario: registerComUsuarioMock, update: empresaUpdateMock },
}));

vi.mock("@/lib/storage/r2", () => ({
  uploadImage: uploadImageMock,
}));

import { headers } from "next/headers";
import { register } from "./actions";

const TERMO_VIGENTE_ID = "termo-1";

/**
 * Um `FormData` que passa em TODAS as validações. Cada caso só remove ou altera
 * o campo que quer exercitar — sem isto, um caso que testa a prova de aceite
 * falharia antes, numa validação anterior da cadeia, e passaria pelo motivo
 * errado.
 */
function formValido(overrides: Record<string, string | null> = {}) {
  const base: Record<string, string> = {
    nomeEmpresa: "Minha Loja",
    nomeResponsavel: "Responsável",
    email: "responsavel@teste.com",
    senha: "senha-plana",
    confirmarSenha: "senha-plana",
    modoInterface: "COMPLETO",
    termosAceitos: "true",
    termoId: TERMO_VIGENTE_ID,
  };

  const formData = new FormData();

  for (const [chave, valor] of Object.entries({ ...base, ...overrides })) {
    // `null` no override significa "este campo não vem no payload", que é
    // diferente de "vem vazio" — os dois estados existem de verdade e o
    // servidor precisa recusar ambos.
    if (valor !== null) {
      formData.set(chave, valor);
    }
  }

  return formData;
}

const empresaCriada = {
  id: "empresa-1",
  slug: "minha-loja",
};

const usuarioCriado = {
  id: "usuario-1",
  email: "responsavel@teste.com",
  role: "ADMIN",
};

beforeEach(() => {
  vi.clearAllMocks();
  registerComUsuarioMock.mockResolvedValue({ empresa: empresaCriada, usuario: usuarioCriado });
});

describe("register — validações existentes", () => {
  // Os seis erros que já existiam continuam com o MESMO texto e na MESMA ordem:
  // a cadeia nova entra no fim dela, nunca no meio.
  it.each([
    [{ nomeEmpresa: "" }, "Informe o nome da empresa."],
    [{ nomeResponsavel: "" }, "Informe seu nome."],
    [{ email: "nao-e-email" }, "Informe um email válido."],
    [{ senha: "123", confirmarSenha: "123" }, "A senha deve ter pelo menos 6 caracteres."],
    [{ confirmarSenha: "outra-senha" }, "As senhas não coincidem."],
    [{ modoInterface: "QUALQUER" }, "Selecione um modo de uso."],
  ])("recusa %o com a mensagem existente", async (override, mensagem) => {
    const resultado = await register({}, formValido(override));

    expect(resultado).toEqual({ error: mensagem });
    expect(registerComUsuarioMock).not.toHaveBeenCalled();
  });
});

/**
 * D-11 — a metade SERVER da validação dupla.
 *
 * A metade CLIENT é o gate do modal: `termosAceitos` só recebe valor no submit
 * que ocorre DEPOIS do clique em "Li e aceito, criar minha loja". As duas
 * metades, sempre: um formulário submetido com JS desabilitado ou por cliente
 * próprio não passa pela primeira, e "nunca confiar só no client" é o padrão
 * que este mesmo arquivo já aplica a email e senha.
 */
describe("register — aceite dos termos (TERM-01 / D-11)", () => {
  const COPY_E3 = "É preciso aceitar os Termos de Uso para criar a conta.";

  it("recusa quando `termosAceitos` não vem no payload, sem chamar o service", async () => {
    const resultado = await register({}, formValido({ termosAceitos: null }));

    expect(resultado).toEqual({ error: COPY_E3 });
    expect(registerComUsuarioMock).not.toHaveBeenCalled();
    expect(createAdminSessionMock).not.toHaveBeenCalled();
  });

  it("recusa quando `termosAceitos` vem vazio (hidden input nunca escrito)", async () => {
    // Estado REAL de quem não clicou no modal: o hidden input é sempre enviado
    // pelo browser, mas com o `defaultValue=""` que o componente renderiza.
    const resultado = await register({}, formValido({ termosAceitos: "" }));

    expect(resultado).toEqual({ error: COPY_E3 });
    expect(registerComUsuarioMock).not.toHaveBeenCalled();
    expect(createAdminSessionMock).not.toHaveBeenCalled();
  });

  it("recusa quando `termosAceitos` vem com valor forjado", async () => {
    // `"on"` era o valor do antigo checkbox de aceite. Usá-lo como payload
    // forjado documenta a migração dentro do próprio teste: quem repetir o
    // formato antigo é recusado como qualquer outro valor arbitrário.
    const resultado = await register({}, formValido({ termosAceitos: "on" }));

    expect(resultado).toEqual({ error: COPY_E3 });
    expect(registerComUsuarioMock).not.toHaveBeenCalled();
  });

  it("recusa quando `termoId` não vem no payload", async () => {
    // Mesma mensagem de propósito: o hidden input do termo viaja junto do da
    // prova de aceite, e sua ausência só acontece com formulário adulterado ou
    // renderizado num estado impossível. Uma mensagem técnica não ajudaria o
    // usuário a agir.
    const resultado = await register({}, formValido({ termoId: null }));

    expect(resultado).toEqual({ error: COPY_E3 });
    expect(registerComUsuarioMock).not.toHaveBeenCalled();
  });

  it("recusa quando `termoId` vem vazio ou só com espaços", async () => {
    const resultado = await register({}, formValido({ termoId: "   " }));

    expect(resultado).toEqual({ error: COPY_E3 });
    expect(registerComUsuarioMock).not.toHaveBeenCalled();
  });

  it("repassa o `termoId` do formulário como `termoAceitoId` do DTO", async () => {
    // Esta asserção é o que amarra o contrato de NOME DE CAMPO com o markup do
    // plano 06-07: renomear qualquer um dos dois lados quebra aqui.
    await expect(register({}, formValido())).rejects.toThrow("REDIRECT:/minha-loja/admin");

    expect(registerComUsuarioMock).toHaveBeenCalledWith({
      nomeEmpresa: "Minha Loja",
      nomeResponsavel: "Responsável",
      email: "responsavel@teste.com",
      senha: "senha-plana",
      modoInterface: "COMPLETO",
      telefone: undefined,
      instagram: undefined,
      termoAceitoId: TERMO_VIGENTE_ID,
    });
  });
});

describe("register — telefone e instagram (opcionais)", () => {
  it("repassa telefone e instagram preenchidos para o service", async () => {
    await expect(
      register(
        {},
        formValido({ telefone: "(11) 99999-9999", instagram: "mercearia" })
      )
    ).rejects.toThrow("REDIRECT:/minha-loja/admin");

    expect(registerComUsuarioMock).toHaveBeenCalledWith(
      expect.objectContaining({
        telefone: "(11) 99999-9999",
        instagram: "mercearia",
      })
    );
  });

  it("não envia telefone/instagram quando os campos vêm vazios", async () => {
    await expect(
      register({}, formValido({ telefone: "", instagram: "" }))
    ).rejects.toThrow("REDIRECT:/minha-loja/admin");

    expect(registerComUsuarioMock).toHaveBeenCalledWith(
      expect.objectContaining({ telefone: undefined, instagram: undefined })
    );
  });
});

describe("register — logo enviada no cadastro (best-effort)", () => {
  function formComLogo(file: File) {
    const formData = formValido();
    formData.set("logoFile", file);
    return formData;
  }

  it("faz upload da logo e atualiza a empresa recém-criada quando o formulário traz logoFile", async () => {
    uploadImageMock.mockResolvedValue("https://bucket.r2.dev/empresa-1/empresas/logos/x.png");
    empresaUpdateMock.mockResolvedValue({});

    const logo = new File(["conteudo"], "logo.png", { type: "image/png" });

    await expect(register({}, formComLogo(logo))).rejects.toThrow("REDIRECT:/minha-loja/admin");

    expect(uploadImageMock).toHaveBeenCalledWith(logo, empresaCriada.id, "empresas/logos");
    expect(empresaUpdateMock).toHaveBeenCalledWith(empresaCriada.id, {
      logo: "https://bucket.r2.dev/empresa-1/empresas/logos/x.png",
    });
  });

  it("não chama upload quando nenhum arquivo é enviado", async () => {
    await expect(register({}, formValido())).rejects.toThrow("REDIRECT:/minha-loja/admin");

    expect(uploadImageMock).not.toHaveBeenCalled();
    expect(empresaUpdateMock).not.toHaveBeenCalled();
  });

  it("não falha o cadastro quando o upload da logo lança erro — best-effort", async () => {
    uploadImageMock.mockRejectedValue(new Error("R2 fora do ar"));
    const logo = new File(["conteudo"], "logo.png", { type: "image/png" });

    // A conta já foi criada com sucesso antes do upload rodar — uma falha
    // aqui não pode virar um erro de cadastro nem impedir o redirect.
    await expect(register({}, formComLogo(logo))).rejects.toThrow("REDIRECT:/minha-loja/admin");

    expect(empresaUpdateMock).not.toHaveBeenCalled();
    expect(createAdminSessionMock).toHaveBeenCalled();
  });
});

describe("register — erros do service e sucesso", () => {
  it.each([
    [
      new HttpError(
        "Não foi possível abrir o cadastro agora. Tente novamente em alguns instantes.",
        503
      ),
    ],
    [
      new HttpError(
        "Os termos foram atualizados. Leia a nova versão e aceite novamente para criar sua conta.",
        409
      ),
    ],
    [new HttpError("Este email já está em uso.", 409)],
  ])("devolve a mensagem do HttpError do service intacta", async (erro) => {
    // As copies E2 e E4 moram no service (Task 1) e chegam aqui sem reescrita —
    // é por isso que o `catch` existente não precisou mudar.
    registerComUsuarioMock.mockRejectedValue(erro);

    const resultado = await register({}, formValido());

    expect(resultado).toEqual({ error: erro.message });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("cria a sessão e redireciona para o admin da empresa no sucesso", async () => {
    await expect(register({}, formValido())).rejects.toThrow("REDIRECT:/minha-loja/admin");

    expect(createAdminSessionMock).toHaveBeenCalledWith({
      sub: usuarioCriado.id,
      empresaId: empresaCriada.id,
      empresaSlug: empresaCriada.slug,
      email: usuarioCriado.email,
      role: usuarioCriado.role,
    });
  });
});

/**
 * ⚠️ CASO CRÍTICO — não remova nem relaxe.
 *
 * IP dedicado ("203.0.113.9", faixa de documentação TEST-NET-3) e não
 * reutilizado por nenhum outro teste deste arquivo: o freio de
 * `lib/registro-rate-limit.ts` é um Map module-level, chaveado por IP — os
 * demais testes deste arquivo não enviam `x-forwarded-for` e caem todos no
 * balde `"desconhecido"`, que fica bem abaixo do limiar (só 2 sucessos no
 * arquivo inteiro). Reaproveitar aquele balde aqui contaminaria a contagem.
 */
describe("register — freio contra criação em massa (item 5)", () => {
  it("bloqueia novas criações do mesmo IP após exceder o limite, sem chamar o service", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.9" }));

    for (let i = 0; i < 30; i += 1) {
      await expect(register({}, formValido())).rejects.toThrow("REDIRECT:/minha-loja/admin");
    }

    registerComUsuarioMock.mockClear();

    const resultado = await register({}, formValido());

    expect(resultado).toEqual({
      error: "Muitas tentativas de cadastro. Tente novamente em alguns minutos.",
    });
    expect(registerComUsuarioMock).not.toHaveBeenCalled();
  });
});
