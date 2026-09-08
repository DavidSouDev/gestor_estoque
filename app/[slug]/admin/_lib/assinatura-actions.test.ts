// @vitest-environment node
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { redirectMock, getVerifiedSessionMock, criarCheckoutMock, revalidarContaMock } = vi.hoisted(
  () => {
    // Mesmo molde de `lib/session.test.ts`: o mock LANÇA, porque o `redirect` real
    // lança `NEXT_REDIRECT`. Um mock que apenas registrasse a chamada deixaria o
    // código seguir depois do redirect e esconderia exatamente o bug que estes
    // testes existem para pegar.
    const redirectMock = vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });

    return {
      redirectMock,
      getVerifiedSessionMock: vi.fn(),
      criarCheckoutMock: vi.fn(),
      revalidarContaMock: vi.fn(),
    };
  }
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/session", () => ({
  getVerifiedSession: getVerifiedSessionMock,
}));

vi.mock("@/app/services/assinatura.service", () => ({
  assinaturaService: { criarCheckout: criarCheckoutMock },
}));

// `@/lib/auth-guard` é mockado porque `revalidarConta` fala com o Postgres.
// `@/lib/avaliar-acesso` fica DELIBERADAMENTE REAL: é função pura, e mocká-la
// esconderia justamente a regra que estes casos existem para provar — que
// `CANCELADO` bloqueia e que `TRIAL`/`CARENCIA`/`VITALICIO` não bloqueiam.
vi.mock("@/lib/auth-guard", () => ({
  revalidarConta: revalidarContaMock,
}));

import { StatusAcesso } from "@prisma/client";
import { consultarStatusAcesso, iniciarPagamento } from "./assinatura-actions";

const SLUG = "empresa-teste";

const sessao = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: SLUG,
  email: "admin@teste.com",
  role: "ADMIN" as const,
  iat: 1_700_000_000,
};

describe("iniciarPagamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sem sessão, manda para o login e não toca no gateway", async () => {
    getVerifiedSessionMock.mockResolvedValue(null);

    await expect(iniciarPagamento(SLUG)).rejects.toThrow(`REDIRECT:/${SLUG}/admin/login`);
    expect(criarCheckoutMock).not.toHaveBeenCalled();
  });

  it("com sessão de outro tenant, manda para o login e não toca no gateway", async () => {
    getVerifiedSessionMock.mockResolvedValue({ ...sessao, empresaSlug: "outra-empresa" });

    await expect(iniciarPagamento(SLUG)).rejects.toThrow(`REDIRECT:/${SLUG}/admin/login`);
    expect(criarCheckoutMock).not.toHaveBeenCalled();
  });

  it("com sessão válida de empresa bloqueada, cria o checkout mesmo assim", async () => {
    // O caminho de pagamento é o único que uma empresa suspensa ainda percorre
    // (T-04-10): a action não pode consultar `statusAcesso` para barrar ninguém.
    getVerifiedSessionMock.mockResolvedValue(sessao);
    criarCheckoutMock.mockResolvedValue({ url: "https://checkout.asaas.com/c/abc", checkoutId: "c1" });

    await expect(iniciarPagamento(SLUG)).rejects.toThrow("REDIRECT:https://checkout.asaas.com/c/abc");
    expect(criarCheckoutMock).toHaveBeenCalledTimes(1);
    expect(criarCheckoutMock).toHaveBeenCalledWith("empresa-1");
  });

  it("no sucesso, redireciona para a URL absoluta externa devolvida pelo service", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    criarCheckoutMock.mockResolvedValue({
      url: "https://sandbox.asaas.com/checkoutSession/show?id=xyz",
      checkoutId: "c2",
    });

    await expect(iniciarPagamento(SLUG)).rejects.toThrow(
      "REDIRECT:https://sandbox.asaas.com/checkoutSession/show?id=xyz"
    );
    expect(redirectMock).toHaveBeenCalledWith("https://sandbox.asaas.com/checkoutSession/show?id=xyz");
  });

  it("quando o gateway falha, loga com prefixo [assinatura] e volta para a tela de bloqueio", async () => {
    const erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getVerifiedSessionMock.mockResolvedValue(sessao);
    criarCheckoutMock.mockRejectedValue(
      Object.assign(new Error("Não foi possível iniciar o pagamento. Tente novamente."), { status: 502 })
    );

    await expect(iniciarPagamento(SLUG)).rejects.toThrow(
      `REDIRECT:/${SLUG}/admin/bloqueado?erro=checkout`
    );

    expect(erroSpy).toHaveBeenCalledTimes(1);
    expect(String(erroSpy.mock.calls[0][0])).toMatch(/^\[assinatura\]/);
  });

  it("ignora o corpo do request: o tenant vem só da sessão", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    criarCheckoutMock.mockResolvedValue({ url: "https://checkout.asaas.com/c/abc", checkoutId: "c3" });

    // A action é ligada com `.bind(null, slug)` e o React ainda entrega o
    // `FormData` do form como segundo argumento. C-08: nada dele é lido.
    const formData = new FormData();
    formData.set("empresaId", "empresa-invasora");
    formData.set("slug", "outra-empresa");

    const comCorpo = iniciarPagamento as unknown as (
      slug: string,
      formData: FormData
    ) => Promise<void>;

    await expect(comCorpo(SLUG, formData)).rejects.toThrow("REDIRECT:https://checkout.asaas.com/c/abc");
    expect(criarCheckoutMock).toHaveBeenCalledWith("empresa-1");
  });
});

/** Conta mínima devolvida por `revalidarConta`, parametrizada pelo status. */
function contaCom(statusAcesso: StatusAcesso) {
  return {
    usuarioId: "user-1",
    empresaId: "empresa-1",
    empresaSlug: SLUG,
    email: "admin@teste.com",
    role: "ADMIN" as const,
    statusAcesso,
    acessoExpiraEm: null,
    carenciaAte: null,
    termosPendentes: false,
  };
}

describe("consultarStatusAcesso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("com sessão válida e empresa EM_DIA, devolve { liberado: true }", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(contaCom(StatusAcesso.EM_DIA));

    await expect(consultarStatusAcesso(SLUG)).resolves.toEqual({ liberado: true });
    expect(revalidarContaMock).toHaveBeenCalledWith("user-1", "empresa-1", 1_700_000_000);
  });

  it("com sessão válida e empresa BLOQUEADO, devolve { liberado: false }", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(contaCom(StatusAcesso.BLOQUEADO));

    await expect(consultarStatusAcesso(SLUG)).resolves.toEqual({ liberado: false });
  });

  it("com empresa CANCELADO, devolve { liberado: false } — o predicado único trata CANCELADO igual a BLOQUEADO", async () => {
    // D-06: o rótulo distinto existe só para a trilha de auditoria. Se este caso
    // passasse a devolver `true`, o poller devolveria ao painel alguém que o
    // `requireAdminSession` manda de volta para `/bloqueado` — loop visível.
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(contaCom(StatusAcesso.CANCELADO));

    await expect(consultarStatusAcesso(SLUG)).resolves.toEqual({ liberado: false });
  });

  it("com TRIAL, CARENCIA ou VITALICIO, devolve { liberado: true }", async () => {
    // T-04-15: comparar com EM_DIA por desigualdade derrubaria os três juntos.
    getVerifiedSessionMock.mockResolvedValue(sessao);

    for (const status of [StatusAcesso.TRIAL, StatusAcesso.CARENCIA, StatusAcesso.VITALICIO]) {
      revalidarContaMock.mockResolvedValue(contaCom(status));
      await expect(consultarStatusAcesso(SLUG)).resolves.toEqual({ liberado: true });
    }
  });

  it("sem sessão, devolve { liberado: false } sem lançar e sem redirect", async () => {
    // Fail-closed. A action é chamada por um `setTimeout` de cliente: um
    // `redirect()` a partir dali não teria destino coerente.
    getVerifiedSessionMock.mockResolvedValue(null);

    await expect(consultarStatusAcesso(SLUG)).resolves.toEqual({ liberado: false });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(revalidarContaMock).not.toHaveBeenCalled();
  });

  it("com sessão de outro tenant, devolve { liberado: false } sem chamar revalidarConta", async () => {
    getVerifiedSessionMock.mockResolvedValue({ ...sessao, empresaSlug: "outra-empresa" });

    await expect(consultarStatusAcesso(SLUG)).resolves.toEqual({ liberado: false });
    expect(revalidarContaMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("com revalidarConta devolvendo null (conta revogada ou erro de banco), devolve { liberado: false }", async () => {
    // `revalidarConta` é fail-closed por construção; a action só traduz o `null`.
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(null);

    await expect(consultarStatusAcesso(SLUG)).resolves.toEqual({ liberado: false });
  });
});
