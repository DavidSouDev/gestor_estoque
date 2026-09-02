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
const { redirectMock, createAdminSessionMock, registerComUsuarioMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  createAdminSessionMock: vi.fn(),
  registerComUsuarioMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/session", () => ({
  createAdminSession: createAdminSessionMock,
}));

vi.mock("@/app/services/empresa.service", () => ({
  empresaService: { registerComUsuario: registerComUsuarioMock },
}));

import { register } from "./actions";

const TERMO_VIGENTE_ID = "termo-1";

/**
 * Um `FormData` que passa em TODAS as validações. Cada caso só remove ou altera
 * o campo que quer exercitar — sem isto, um caso que testa o checkbox falharia
 * antes, numa validação anterior da cadeia, e passaria pelo motivo errado.
 */
function formValido(overrides: Record<string, string | null> = {}) {
  const base: Record<string, string> = {
    nomeEmpresa: "Minha Loja",
    nomeResponsavel: "Responsável",
    email: "responsavel@teste.com",
    senha: "senha-plana",
    confirmarSenha: "senha-plana",
    modoInterface: "COMPLETO",
    aceiteTermos: "on",
    termoId: TERMO_VIGENTE_ID,
  };

  const formData = new FormData();

  for (const [chave, valor] of Object.entries({ ...base, ...overrides })) {
    // `null` no override significa "este campo não vem no payload", que é
    // diferente de "vem vazio" — um checkbox desmarcado simplesmente não é
    // enviado pelo browser.
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
 * A metade CLIENT é o `required` do checkbox (plano 06-07). As duas, sempre: um
 * formulário submetido com JS desabilitado ou por cliente próprio não passa pela
 * primeira metade, e "nunca confiar só no client" é o padrão que este mesmo
 * arquivo já aplica a email e senha.
 */
describe("register — aceite dos termos (TERM-01 / D-11)", () => {
  const COPY_E3 = "É preciso aceitar os Termos de Uso para criar a conta.";

  it("recusa quando `aceiteTermos` não vem no payload, sem chamar o service", async () => {
    const resultado = await register({}, formValido({ aceiteTermos: null }));

    expect(resultado).toEqual({ error: COPY_E3 });
    expect(registerComUsuarioMock).not.toHaveBeenCalled();
    expect(createAdminSessionMock).not.toHaveBeenCalled();
  });

  it("recusa quando `aceiteTermos` vem com valor diferente de \"on\"", async () => {
    // `"on"` é o valor nativo de um checkbox marcado. Qualquer outra coisa é
    // payload forjado.
    const resultado = await register({}, formValido({ aceiteTermos: "true" }));

    expect(resultado).toEqual({ error: COPY_E3 });
    expect(registerComUsuarioMock).not.toHaveBeenCalled();
  });

  it("recusa quando `termoId` não vem no payload", async () => {
    // Mesma mensagem de propósito: o hidden input viaja junto do checkbox, e sua
    // ausência só acontece com formulário adulterado ou renderizado num estado
    // impossível. Uma mensagem técnica não ajudaria o usuário a agir.
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
      termoAceitoId: TERMO_VIGENTE_ID,
    });
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
