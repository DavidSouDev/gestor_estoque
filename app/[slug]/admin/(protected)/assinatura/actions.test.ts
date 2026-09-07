// @vitest-environment node
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { redirectMock, getVerifiedSessionMock, cancelarMock } = vi.hoisted(() => {
  // Mesmo molde de `_lib/assinatura-actions.test.ts`: o mock LANÇA, porque o
  // `redirect` real lança `NEXT_REDIRECT`. Aqui ele existe apenas para provar a
  // AUSÊNCIA de redirect — esta action devolve estado, nunca navega.
  const redirectMock = vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });

  return {
    redirectMock,
    getVerifiedSessionMock: vi.fn(),
    cancelarMock: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/session", () => ({
  getVerifiedSession: getVerifiedSessionMock,
}));

vi.mock("@/app/services/assinatura.service", () => ({
  assinaturaService: { cancelar: cancelarMock },
}));

import { cancelarAssinatura } from "./actions";

const SLUG = "empresa-teste";

const sessao = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: SLUG,
  email: "admin@teste.com",
  role: "ADMIN" as const,
};

/** Copy travada pela UI-SPEC § Error strings. */
const E2 = "Não foi possível cancelar agora. Tente novamente em instantes.";
const E4 = "Sessão inválida.";

describe("cancelarAssinatura", () => {
  let erroSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    erroSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("D-05: a função exportada tem aridade 1 — o único parâmetro é o slug", () => {
    // Esta é a prova EXECUTÁVEL de D-05 no nível de assinatura de função. Um
    // segundo parâmetro (`assinaturaId`, `subscriptionId`, `customerId`, ou um
    // objeto que os carregasse) é exatamente o cenário nomeado pelo
    // `PITFALLS.md` § Pitfall 11 — "Cancel-subscription action taking an
    // assinaturaId from the form body" — e quebraria este caso.
    expect(cancelarAssinatura.length).toBe(1);
  });

  it("com sessão válida, chama o service com o empresaId DA SESSÃO e devolve {}", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    cancelarMock.mockResolvedValue(undefined);

    await expect(cancelarAssinatura(SLUG)).resolves.toEqual({});

    expect(cancelarMock).toHaveBeenCalledTimes(1);
    expect(cancelarMock).toHaveBeenCalledWith("empresa-1");
  });

  it("o empresaId entregue ao service acompanha a sessão, nunca o argumento", async () => {
    // Se a implementação passasse o `slug` (ou qualquer coisa vinda do cliente)
    // adiante, este caso quebraria: a sessão declara outro `empresaId`.
    getVerifiedSessionMock.mockResolvedValue({ ...sessao, empresaId: "empresa-da-sessao" });
    cancelarMock.mockResolvedValue(undefined);

    await cancelarAssinatura(SLUG);

    expect(cancelarMock).toHaveBeenCalledWith("empresa-da-sessao");
    expect(cancelarMock).not.toHaveBeenCalledWith(SLUG);
  });

  it("sem sessão, devolve E4 e NÃO chama o service", async () => {
    getVerifiedSessionMock.mockResolvedValue(null);

    await expect(cancelarAssinatura(SLUG)).resolves.toEqual({ error: E4 });
    expect(cancelarMock).not.toHaveBeenCalled();
  });

  it("com sessão de outro tenant (slug divergente), devolve E4 e NÃO chama o service", async () => {
    // T-07-28: a divergência sai ANTES de qualquer I/O.
    getVerifiedSessionMock.mockResolvedValue({ ...sessao, empresaSlug: "outra-empresa" });

    await expect(cancelarAssinatura(SLUG)).resolves.toEqual({ error: E4 });
    expect(cancelarMock).not.toHaveBeenCalled();
  });

  it("quando o service lança, devolve E2 — a mensagem genérica, não a do gateway", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    cancelarMock.mockRejectedValue(
      Object.assign(new Error("Não foi possível cancelar agora. Tente novamente."), { status: 502 })
    );

    await expect(cancelarAssinatura(SLUG)).resolves.toEqual({ error: E2 });
  });

  it("T-07-29: a mensagem original do erro NÃO aparece no objeto devolvido", async () => {
    // O corpo de erro do Asaas pode carregar PII do pagador. Só as duas strings
    // genéricas da UI-SPEC chegam à tela.
    getVerifiedSessionMock.mockResolvedValue(sessao);
    cancelarMock.mockRejectedValue(
      new Error("Asaas: invalid customer cus_000123 <maria@exemplo.com>")
    );

    const resultado = await cancelarAssinatura(SLUG);

    expect(JSON.stringify(resultado)).not.toContain("cus_000123");
    expect(JSON.stringify(resultado)).not.toContain("maria@exemplo.com");
    expect(JSON.stringify(resultado)).not.toContain("Asaas");
    expect(resultado).toEqual({ error: E2 });
  });

  it("quando o service lança, a mensagem original vai para o console.error com prefixo [assinatura]", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    const erro = new Error("Asaas: invalid customer cus_000123");
    cancelarMock.mockRejectedValue(erro);

    await cancelarAssinatura(SLUG);

    expect(erroSpy).toHaveBeenCalledTimes(1);
    expect(String(erroSpy.mock.calls[0][0])).toMatch(/^\[assinatura\]/);
    expect(erroSpy.mock.calls[0]).toContain(erro);
  });

  it("no caminho feliz não loga nada e não redireciona", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    cancelarMock.mockResolvedValue(undefined);

    await cancelarAssinatura(SLUG);

    expect(erroSpy).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("nenhum caminho redireciona — a view de confirmação precisa do erro em linha", async () => {
    getVerifiedSessionMock.mockResolvedValue(null);
    await cancelarAssinatura(SLUG);

    getVerifiedSessionMock.mockResolvedValue(sessao);
    cancelarMock.mockRejectedValue(new Error("falhou"));
    await cancelarAssinatura(SLUG);

    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("C-08: ignora qualquer segundo argumento — o tenant vem só da sessão", async () => {
    // Um `FormData` entregue como segundo argumento (o que o React faz quando a
    // action é ligada a um `<form>`) não pode influenciar nada. Aqui ele carrega
    // um `empresaId` invasor de propósito.
    getVerifiedSessionMock.mockResolvedValue(sessao);
    cancelarMock.mockResolvedValue(undefined);

    const formData = new FormData();
    formData.set("empresaId", "empresa-invasora");
    formData.set("assinaturaId", "sub_invasora");

    const comCorpo = cancelarAssinatura as unknown as (
      slug: string,
      formData: FormData
    ) => Promise<{ error?: string }>;

    await expect(comCorpo(SLUG, formData)).resolves.toEqual({});
    expect(cancelarMock).toHaveBeenCalledWith("empresa-1");
  });
});
