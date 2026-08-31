// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { HttpError } from "@/lib/http-error";

/**
 * O cliente do Asaas é substituído, mas `AsaasApiError` continua sendo a classe
 * real: o service distingue falha de gateway de erro inesperado por `instanceof`,
 * e uma cópia local da classe faria o teste passar por engano.
 */
vi.mock("@/lib/billing/asaas/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/billing/asaas/client")>();

  return {
    ...original,
    asaasClient: { criarCheckout: vi.fn() },
  };
});

import { AsaasApiError, asaasClient } from "@/lib/billing/asaas/client";
import { assinaturaService } from "./assinatura.service";

const APP_BASE_URL = "http://localhost:3000";
const CHECKOUT_BASE_URL = "https://sandbox.asaas.com/checkoutSession/show";

/**
 * `trialFim` num futuro distante de propósito: `primeiraCobrancaEmSaoPaulo` cai
 * no relógio corrente quando o trial já venceu, e a data esperada deixaria de
 * ser um literal estável.
 */
const TRIAL_FIM = new Date("2099-01-01T03:00:00.000Z");

/** Só os 5 campos que o `select` do service pede — nada de `usuarios`. */
const empresaSelecionada = {
  id: "empresa-1",
  nome: "Empresa Teste",
  slug: "empresa-teste",
  trialFim: TRIAL_FIM,
  asaasCustomerId: null,
};

const checkoutDoAsaas = {
  id: "chk_7b2f4c8e9a1d",
  link: "https://sandbox.asaas.com/checkoutSession/show?id=chk_7b2f4c8e9a1d",
  status: "ACTIVE",
};

const linhaCheckout = {
  id: "checkout-local-1",
  asaasCheckoutId: checkoutDoAsaas.id,
  empresaId: "empresa-1",
  status: "ACTIVE",
  createdAt: new Date("2026-08-31T03:00:00.000Z"),
  updatedAt: new Date("2026-08-31T03:00:00.000Z"),
};

let ambienteOriginal: NodeJS.ProcessEnv;

beforeEach(() => {
  ambienteOriginal = { ...process.env };
  process.env.APP_BASE_URL = APP_BASE_URL;
  process.env.ASAAS_CHECKOUT_BASE_URL = CHECKOUT_BASE_URL;

  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});

  prismaMock.empresa.findFirst.mockResolvedValue(empresaSelecionada as never);
  prismaMock.checkoutAsaas.create.mockResolvedValue(linhaCheckout as never);
  vi.mocked(asaasClient.criarCheckout).mockResolvedValue(checkoutDoAsaas);
});

afterEach(() => {
  process.env = ambienteOriginal;
  vi.restoreAllMocks();
});

describe("assinaturaService.criarCheckout", () => {
  it("chama o Asaas exatamente uma vez, com o plano mensal recorrente e as URLs de retorno do admin", async () => {
    await assinaturaService.criarCheckout("empresa-1");

    expect(asaasClient.criarCheckout).toHaveBeenCalledTimes(1);

    // Asserção EXATA (não `objectContaining`): é ela que prova que nenhum campo
    // extra — em especial nada vindo do pagador — entra no corpo do checkout.
    expect(asaasClient.criarCheckout).toHaveBeenCalledWith({
      empresaId: "empresa-1",
      nomeItem: "Plano mensal",
      descricaoItem: "Assinatura mensal do painel",
      // D-02: o preço vem de `VALOR_PLANO_MENSAL`, nunca de um literal no service.
      valor: 29.9,
      // D-03: primeira cobrança no fim do trial, derivada de `empresa.trialFim`.
      nextDueDate: "2099-01-01 00:00:00",
      successUrl: `${APP_BASE_URL}/empresa-teste/admin`,
      cancelUrl: `${APP_BASE_URL}/empresa-teste/admin`,
      expiredUrl: `${APP_BASE_URL}/empresa-teste/admin`,
    });
  });

  it("D-03: sem trial vigente, a primeira cobrança não fica presa a uma data passada", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      ...empresaSelecionada,
      trialFim: null,
    } as never);

    await assinaturaService.criarCheckout("empresa-1");

    const [input] = vi.mocked(asaasClient.criarCheckout).mock.calls[0];

    // Formato `"YYYY-MM-DD HH:mm:ss"` exigido pelo objeto `subscription`.
    expect(input.nextDueDate).toMatch(/^\d{4}-\d{2}-\d{2} 00:00:00$/);
    expect(input.nextDueDate >= "2026-01-01 00:00:00").toBe(true);
  });

  it("D-07: quando o Asaas rejeita, NENHUMA linha é gravada no nosso banco", async () => {
    vi.mocked(asaasClient.criarCheckout).mockRejectedValue(
      new AsaasApiError("Não foi possível falar com o gateway de pagamento.", 400, ["invalid_value"])
    );

    await expect(assinaturaService.criarCheckout("empresa-1")).rejects.toBeInstanceOf(HttpError);

    // Asserção de AUSÊNCIA: é a prova executável da ordem D-07. Sem ela, uma
    // implementação que gravasse "checkout pendente" antes da chamada passaria.
    expect(prismaMock.checkoutAsaas.create).not.toHaveBeenCalled();
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.auditoriaAcesso.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("traduz a falha do gateway em HttpError 502 com mensagem genérica", async () => {
    vi.mocked(asaasClient.criarCheckout).mockRejectedValue(
      new AsaasApiError("Não foi possível falar com o gateway de pagamento.", 503)
    );

    await expect(assinaturaService.criarCheckout("empresa-1")).rejects.toMatchObject({
      status: 502,
      message: "Não foi possível iniciar o pagamento. Tente novamente.",
    });
  });

  it("C-05: o log da falha traz o prefixo [asaas], o empresaId e o status — nunca o corpo do gateway", async () => {
    const corpoSensivel = "cpfCnpj 12345678901 do pagador";

    vi.mocked(asaasClient.criarCheckout).mockRejectedValue(
      new AsaasApiError(corpoSensivel, 401)
    );

    await expect(assinaturaService.criarCheckout("empresa-1")).rejects.toBeInstanceOf(HttpError);

    expect(console.error).toHaveBeenCalledTimes(1);

    const registrado = vi.mocked(console.error).mock.calls[0].map(String).join(" ");

    expect(registrado).toContain("[asaas]");
    expect(registrado).toContain("empresa-1");
    expect(registrado).toContain("401");
    expect(registrado).not.toContain(corpoSensivel);
  });

  it("Pitfall 8: grava o mapa CheckoutAsaas com exatamente asaasCheckoutId, empresaId e status", async () => {
    await assinaturaService.criarCheckout("empresa-1");

    // Asserção EXATA: o mapa é a única associação certa entre checkout e empresa,
    // e nenhum outro campo — muito menos dados do pagador — pode entrar nele.
    expect(prismaMock.checkoutAsaas.create).toHaveBeenCalledWith({
      data: {
        asaasCheckoutId: "chk_7b2f4c8e9a1d",
        empresaId: "empresa-1",
        status: "ACTIVE",
      },
    });
  });

  it("devolve o `link` do Asaas quando ele não vem nulo", async () => {
    const resultado = await assinaturaService.criarCheckout("empresa-1");

    expect(resultado).toEqual({
      url: "https://sandbox.asaas.com/checkoutSession/show?id=chk_7b2f4c8e9a1d",
      checkoutId: "chk_7b2f4c8e9a1d",
    });
  });

  it("A1: monta a URL a partir de ASAAS_CHECKOUT_BASE_URL quando `link` vem nulo", async () => {
    vi.mocked(asaasClient.criarCheckout).mockResolvedValue({
      ...checkoutDoAsaas,
      link: null,
    });

    const resultado = await assinaturaService.criarCheckout("empresa-1");

    expect(resultado).toEqual({
      url: `${CHECKOUT_BASE_URL}?id=chk_7b2f4c8e9a1d`,
      checkoutId: "chk_7b2f4c8e9a1d",
    });
  });

  it("empresa inexistente (ou removida): 404 e o Asaas nem chega a ser chamado", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);

    await expect(assinaturaService.criarCheckout("empresa-fantasma")).rejects.toMatchObject({
      status: 404,
    });

    expect(asaasClient.criarCheckout).not.toHaveBeenCalled();
    expect(prismaMock.checkoutAsaas.create).not.toHaveBeenCalled();
  });

  it("C-07: a leitura da Empresa filtra deletedAt e usa select explícito, sem nenhum campo de Usuario", async () => {
    await assinaturaService.criarCheckout("empresa-1");

    expect(prismaMock.empresa.findFirst).toHaveBeenCalledWith({
      where: { id: "empresa-1", deletedAt: null },
      select: {
        id: true,
        nome: true,
        slug: true,
        trialFim: true,
        asaasCustomerId: true,
      },
    });

    const [argumento] = prismaMock.empresa.findFirst.mock.calls[0] as [Record<string, unknown>];

    // `include` arrastaria `usuarios` e, com eles, `senhaHash`.
    expect(argumento).not.toHaveProperty("include");
  });

  it("GTW-01: nenhum dado de pagamento chega ao Prisma em nenhum argumento", async () => {
    await assinaturaService.criarCheckout("empresa-1");

    const argumentos = JSON.stringify([
      ...prismaMock.empresa.findFirst.mock.calls,
      ...prismaMock.checkoutAsaas.create.mock.calls,
    ]);

    for (const proibido of ["creditCard", "cpfCnpj", "customerData", "creditCardToken"]) {
      expect(argumentos).not.toContain(proibido);
    }
  });

  it("não escreve nada em Empresa: asaasCustomerId/asaasSubscriptionId são do webhook (03-06)", async () => {
    await assinaturaService.criarCheckout("empresa-1");

    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
  });
});
