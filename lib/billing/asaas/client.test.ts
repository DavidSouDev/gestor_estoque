// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsaasApiError, asaasClient } from "./client";
import type { CriarCheckoutInput } from "./tipos";

const API_URL = "https://api-sandbox.asaas.com/v3";
const API_KEY = "chave-de-api-ficticia";

const fetchMock = vi.fn();

function respostaOk(corpo: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => corpo,
    text: async () => JSON.stringify(corpo),
  } as unknown as Response;
}

function respostaErro(status: number, corpo: string) {
  return {
    ok: false,
    status,
    json: async () => JSON.parse(corpo),
    text: async () => corpo,
  } as unknown as Response;
}

/** Argumentos com que o `fetch` global foi chamado na n-ésima vez. */
function chamada(indice = 0) {
  const [url, init] = fetchMock.mock.calls[indice] as [string, RequestInit];
  return {
    url,
    init,
    headers: (init.headers ?? {}) as Record<string, string>,
    corpo: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined,
  };
}

const entradaDeCheckout: CriarCheckoutInput = {
  empresaId: "emp_123",
  nomeItem: "Plano mensal",
  descricaoItem: "Assinatura mensal do painel",
  valor: 29.9,
  nextDueDate: "2026-09-15 00:00:00",
  successUrl: "https://app.exemplo.com/loja/admin",
  cancelUrl: "https://app.exemplo.com/loja/admin",
  expiredUrl: "https://app.exemplo.com/loja/admin",
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ASAAS_API_URL", API_URL);
  vi.stubEnv("ASAAS_API_KEY", API_KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("autenticação e transporte", () => {
  it("envia a API key no header access_token, nunca num header de bearer", async () => {
    fetchMock.mockResolvedValue(respostaOk({ id: "pay_1", status: "CONFIRMED" }));

    await asaasClient.buscarPagamento("pay_1");

    expect(chamada().headers.access_token).toBe(API_KEY);
    expect(Object.keys(chamada().headers).map((k) => k.toLowerCase())).not.toContain(
      "authorization"
    );
  });

  it("envia um AbortSignal de timeout em toda chamada", async () => {
    fetchMock.mockResolvedValue(respostaOk({ id: "pay_1", status: "CONFIRMED" }));

    await asaasClient.buscarPagamento("pay_1");

    expect(chamada().init.signal).toBeInstanceOf(AbortSignal);
    expect(chamada().init.signal?.aborted).toBe(false);
  });

  it("devolve o JSON tipado numa resposta 2xx", async () => {
    fetchMock.mockResolvedValue(
      respostaOk({ id: "pay_1", status: "CONFIRMED", value: 29.9, dueDate: "2026-09-15" })
    );

    const pagamento = await asaasClient.buscarPagamento("pay_1");

    expect(pagamento).toEqual({
      id: "pay_1",
      status: "CONFIRMED",
      value: 29.9,
      dueDate: "2026-09-15",
    });
  });
});

describe("tradução de falhas", () => {
  it("converte 4xx em AsaasApiError com o status e os códigos de errors[].code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(
      respostaErro(
        400,
        JSON.stringify({
          errors: [
            { code: "invalid_value", description: "Valor inválido" },
            { code: "invalid_customer", description: "Cliente inválido" },
          ],
        })
      )
    );

    const erro = await asaasClient.criarCheckout(entradaDeCheckout).catch((e) => e);

    expect(erro).toBeInstanceOf(AsaasApiError);
    expect(erro.status).toBe(400);
    expect(erro.codigos).toEqual(["invalid_value", "invalid_customer"]);
  });

  it("converte falha de rede em AsaasApiError com status 0 sem vazar a exception original", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED detalhe interno da rede"));

    const erro = await asaasClient.buscarPagamento("pay_1").catch((e) => e);

    expect(erro).toBeInstanceOf(AsaasApiError);
    expect(erro.status).toBe(0);
    expect(erro.message).not.toContain("ECONNREFUSED");
    expect(erro.message).not.toContain("detalhe interno da rede");
  });

  it("loga 429 com o prefixo [asaas] antes de lançar", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(respostaErro(429, JSON.stringify({ errors: [] })));

    await expect(asaasClient.buscarAssinatura("sub_1")).rejects.toBeInstanceOf(AsaasApiError);

    const linha = String(spy.mock.calls[0][0]);
    expect(linha).toContain("[asaas]");
    expect(linha).toContain("429");
  });

  it("nunca loga o corpo de resposta inteiro — no máximo 500 caracteres", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const corpoEnorme = JSON.stringify({ recheio: "x".repeat(4000) });
    fetchMock.mockResolvedValue(respostaErro(500, corpoEnorme));

    await expect(asaasClient.buscarPagamento("pay_1")).rejects.toBeInstanceOf(AsaasApiError);

    const argumentos = spy.mock.calls[0];
    expect(String(argumentos[0])).toContain("[asaas]");

    const detalhe = String(argumentos[1]);
    expect(detalhe.length).toBeLessThanOrEqual(500);
    expect(corpoEnorme.length).toBeGreaterThan(500);
  });
});

describe("endpoints", () => {
  it("criarCheckout faz POST em /checkouts com assinatura recorrente no cartão", async () => {
    fetchMock.mockResolvedValue(respostaOk({ id: "chk_1", link: null, status: "ACTIVE" }));

    const checkout = await asaasClient.criarCheckout(entradaDeCheckout);

    expect(checkout).toEqual({ id: "chk_1", link: null, status: "ACTIVE" });
    expect(chamada().url).toBe(`${API_URL}/checkouts`);
    expect(chamada().init.method).toBe("POST");

    const corpo = chamada().corpo!;
    expect(corpo.billingTypes).toEqual(["CREDIT_CARD"]);
    expect(corpo.chargeTypes).toEqual(["RECURRENT"]);
    expect(corpo.minutesToExpire).toBe(60);
    expect(corpo.externalReference).toBe("emp_123");
    expect(corpo.callback).toEqual({
      successUrl: entradaDeCheckout.successUrl,
      cancelUrl: entradaDeCheckout.cancelUrl,
      expiredUrl: entradaDeCheckout.expiredUrl,
    });
    expect(corpo.items).toEqual([
      {
        name: "Plano mensal",
        description: "Assinatura mensal do painel",
        quantity: 1,
        value: 29.9,
      },
    ]);
    expect(corpo.subscription).toEqual({
      cycle: "MONTHLY",
      nextDueDate: "2026-09-15 00:00:00",
    });
  });

  it("criarCheckout omite endDate de propósito (assinatura aberta até cancelamento, A5)", async () => {
    fetchMock.mockResolvedValue(respostaOk({ id: "chk_1", link: null, status: "ACTIVE" }));

    await asaasClient.criarCheckout(entradaDeCheckout);

    const assinatura = chamada().corpo!.subscription as Record<string, unknown>;
    expect("endDate" in assinatura).toBe(false);
  });

  it("buscarPagamento faz GET em /payments/{id}", async () => {
    fetchMock.mockResolvedValue(respostaOk({ id: "pay_x", status: "RECEIVED" }));

    await asaasClient.buscarPagamento("pay_x");

    expect(chamada().url).toBe(`${API_URL}/payments/pay_x`);
    expect(chamada().init.method ?? "GET").toBe("GET");
  });

  it("buscarAssinatura faz GET em /subscriptions/{id}", async () => {
    fetchMock.mockResolvedValue(respostaOk({ id: "sub_x", status: "ACTIVE" }));

    await asaasClient.buscarAssinatura("sub_x");

    expect(chamada().url).toBe(`${API_URL}/subscriptions/sub_x`);
    expect(chamada().init.method ?? "GET").toBe("GET");
  });
});

describe("removerAssinatura (D-04, SUB-02)", () => {
  it("faz DELETE em /subscriptions/{id}", async () => {
    fetchMock.mockResolvedValue(respostaOk({ deleted: true, id: "sub_1" }));

    await asaasClient.removerAssinatura("sub_1");

    expect(chamada().url).toBe(`${API_URL}/subscriptions/sub_1`);
    expect(chamada().init.method).toBe("DELETE");
  });

  it("leva o header access_token, nunca um header de bearer", async () => {
    fetchMock.mockResolvedValue(respostaOk({ deleted: true, id: "sub_1" }));

    await asaasClient.removerAssinatura("sub_1");

    expect(chamada().headers.access_token).toBe(API_KEY);
    expect(Object.keys(chamada().headers).map((k) => k.toLowerCase())).not.toContain(
      "authorization"
    );
  });

  it("não envia corpo — a remoção é identificada só pelo caminho", async () => {
    fetchMock.mockResolvedValue(respostaOk({ deleted: true, id: "sub_1" }));

    await asaasClient.removerAssinatura("sub_1");

    expect(chamada().init.body).toBeUndefined();
  });

  it("devolve a resposta tipada com os dois campos", async () => {
    fetchMock.mockResolvedValue(respostaOk({ deleted: true, id: "sub_1" }));

    const removida = await asaasClient.removerAssinatura("sub_1");

    expect(removida).toEqual({ deleted: true, id: "sub_1" });
  });

  // Não-idempotência: a segunda remoção da MESMA assinatura devolve 404, não 200.
  // Este arquivo só traduz HTTP — quem decide que 404 é "já estava cancelada" é
  // `assinaturaService.cancelar`.
  it("propaga o 404 do gateway como AsaasApiError com status 404 (endpoint NÃO é idempotente)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(respostaOk({ deleted: true, id: "sub_1" }))
      .mockResolvedValueOnce(
        respostaErro(404, JSON.stringify({ errors: [{ code: "not_found" }] }))
      );

    await asaasClient.removerAssinatura("sub_1");
    const erro = await asaasClient.removerAssinatura("sub_1").catch((e) => e);

    expect(erro).toBeInstanceOf(AsaasApiError);
    expect(erro.status).toBe(404);
  });

  it("propaga o 401 do gateway como AsaasApiError com status 401", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(respostaErro(401, JSON.stringify({ errors: [] })));

    const erro = await asaasClient.removerAssinatura("sub_1").catch((e) => e);

    expect(erro).toBeInstanceOf(AsaasApiError);
    expect(erro.status).toBe(401);
  });

  it("herda o AbortSignal de timeout de chamar(), sem montar requisição própria", async () => {
    fetchMock.mockResolvedValue(respostaOk({ deleted: true, id: "sub_1" }));

    await asaasClient.removerAssinatura("sub_1");

    expect(chamada().init.signal).toBeInstanceOf(AbortSignal);
  });
});
