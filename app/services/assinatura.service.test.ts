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
    asaasClient: {
      criarCheckout: vi.fn(),
      // SUB-02: `cancelar` distingue o 404 de "já estava cancelada" por
      // `instanceof AsaasApiError` — e é o `...original` acima que mantém a
      // classe REAL disponível para isso.
      removerAssinatura: vi.fn(),
      buscarAssinatura: vi.fn(),
    },
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

/**
 * Só os campos que o `select` do service pede — nada de `usuarios`.
 *
 * `canceladoEm: null` é explícito de propósito (Pitfall 6): o ramo de reativação
 * de `criarCheckout` compara `!== null`, e um `undefined` vindo de fixture
 * incompleta faria o caso "não emite update" passar por acidente em vez de por
 * regra.
 */
const empresaSelecionada = {
  id: "empresa-1",
  nome: "Empresa Teste",
  slug: "empresa-teste",
  trialFim: TRIAL_FIM,
  asaasCustomerId: null,
  canceladoEm: null,
};

/** Projeção de `EMPRESA_ASSINATURA_SELECT` — os 4 fatos + o id da assinatura. */
const empresaAssinatura = {
  id: "empresa-1",
  asaasSubscriptionId: "sub_000000000001",
  canceladoEm: null,
  acessoAte: new Date("2026-10-15T03:00:00.000Z"),
  trialFim: null,
  acessoVitalicio: false,
};

/** Objeto `AsaasSubscription` como o gateway devolve em `GET /subscriptions/{id}`. */
const assinaturaDoAsaas = {
  id: "sub_000000000001",
  customer: "cus_000000000001",
  status: "ACTIVE",
  cycle: "MONTHLY",
  nextDueDate: "2026-10-15",
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
        // Pitfall 6: lido só para decidir se a reativação precisa limpar o campo.
        canceladoEm: true,
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

/**
 * Pitfall 6 / Open Question 2 da pesquisa, resolvida por este plano: `criarCheckout`
 * é o único momento em que a intenção do cliente de VOLTAR é inequívoca, e é
 * escrita local sem I/O de gateway envolvido.
 *
 * Sem isto, nenhum caminho do sistema limpa `canceladoEm` — `aplicarPagamentoConfirmado`
 * só mexe em `acessoAte` — e o bug fica latente por meses: D-09 mascara o efeito
 * enquanto o acesso pago estiver vigente, e só quando o cliente reincidente para de
 * pagar é que a auditoria rotula `CANCELADO` em vez de `BLOQUEADO`.
 */
describe("assinaturaService.criarCheckout — reativação de cliente que havia cancelado", () => {
  it("limpa `canceladoEm` depois do 2xx do gateway quando a empresa estava cancelada", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      ...empresaSelecionada,
      canceladoEm: new Date("2026-07-01T03:00:00.000Z"),
    } as never);

    await assinaturaService.criarCheckout("empresa-1");

    expect(prismaMock.empresa.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      data: { canceladoEm: null },
    });
  });

  it("não emite nenhum `empresa.update` quando `canceladoEm` já é nulo", async () => {
    await assinaturaService.criarCheckout("empresa-1");

    // A guarda `!== null` existe para não gravar uma linha a cada checkout de
    // cliente que nunca cancelou.
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
  });

  it("não limpa `canceladoEm` quando o gateway rejeita — a fronteira D-07 vale para esta escrita também", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      ...empresaSelecionada,
      canceladoEm: new Date("2026-07-01T03:00:00.000Z"),
    } as never);

    vi.mocked(asaasClient.criarCheckout).mockRejectedValue(
      new AsaasApiError("Não foi possível falar com o gateway de pagamento.", 503)
    );

    await expect(assinaturaService.criarCheckout("empresa-1")).rejects.toBeInstanceOf(HttpError);

    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
  });
});

describe("assinaturaService.fatosDeAssinatura", () => {
  beforeEach(() => {
    prismaMock.empresa.findFirst.mockResolvedValue(empresaAssinatura as never);
  });

  it("devolve os 4 fatos de billing mais o `asaasSubscriptionId`, sem o `id` da empresa", async () => {
    const fatos = await assinaturaService.fatosDeAssinatura("empresa-1");

    // Asserção EXATA: o objeto que a página recebe é o contrato, e um campo a
    // mais aqui é um campo a mais atravessando a fronteira servidor→cliente.
    expect(fatos).toEqual({
      asaasSubscriptionId: "sub_000000000001",
      acessoAte: new Date("2026-10-15T03:00:00.000Z"),
      trialFim: null,
      canceladoEm: null,
      acessoVitalicio: false,
    });
  });

  it("devolve `null` para empresa inexistente ou soft-deletada", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);

    await expect(assinaturaService.fatosDeAssinatura("empresa-fantasma")).resolves.toBeNull();
  });

  it("não toca no gateway: é a leitura que decide o estado da tela ANTES de qualquer I/O externo", async () => {
    await assinaturaService.fatosDeAssinatura("empresa-1");

    expect(asaasClient.buscarAssinatura).not.toHaveBeenCalled();
    expect(asaasClient.removerAssinatura).not.toHaveBeenCalled();
  });

  it("C-07: usa `select` explícito com os 6 campos, filtra `deletedAt` e nunca usa `include`", async () => {
    await assinaturaService.fatosDeAssinatura("empresa-1");

    expect(prismaMock.empresa.findFirst).toHaveBeenCalledWith({
      // `deletedAt: null` no MESMO `where` do id: uma empresa soft-deletada não
      // pode devolver fatos de billing. É também por isso que o método usa
      // `findFirst` e não `findUnique({ where: { id } })`.
      where: { id: "empresa-1", deletedAt: null },
      select: {
        id: true,
        asaasSubscriptionId: true,
        canceladoEm: true,
        acessoAte: true,
        trialFim: true,
        acessoVitalicio: true,
      },
    });

    const [argumento] = prismaMock.empresa.findFirst.mock.calls[0] as [Record<string, unknown>];

    // `include` arrastaria `usuarios` e, com eles, `senhaHash` — e esta é a
    // leitura de toda renderização da página de assinatura.
    expect(argumento).not.toHaveProperty("include");
  });
});

describe("assinaturaService.consultarAssinatura", () => {
  it("com o gateway respondendo, devolve origem `asaas` com a próxima cobrança e o ciclo", async () => {
    vi.mocked(asaasClient.buscarAssinatura).mockResolvedValue(assinaturaDoAsaas);

    const status = await assinaturaService.consultarAssinatura("sub_000000000001");

    expect(status).toEqual({
      origem: "asaas",
      // `nextDueDate` cru, no formato "YYYY-MM-DD" do gateway.
      proximaCobranca: "2026-10-15",
      ciclo: "MONTHLY",
    });

    expect(asaasClient.buscarAssinatura).toHaveBeenCalledWith("sub_000000000001");
  });

  it("D-02b: com o gateway fora do ar, degrada para `indisponivel` em vez de lançar", async () => {
    vi.mocked(asaasClient.buscarAssinatura).mockRejectedValue(
      new AsaasApiError("Não foi possível falar com o gateway de pagamento.", 0)
    );

    // NÃO lança: a página não pode cair por indisponibilidade do gateway.
    await expect(
      assinaturaService.consultarAssinatura("sub_000000000001")
    ).resolves.toEqual({
      // E nenhum valor antigo é devolvido como se fosse atual.
      origem: "indisponivel",
      proximaCobranca: null,
      ciclo: null,
    });
  });

  it("BILL-01: nunca expõe o `status` do Asaas — nem no caminho feliz, nem no degradado", async () => {
    vi.mocked(asaasClient.buscarAssinatura).mockResolvedValue(assinaturaDoAsaas);

    const ok = await assinaturaService.consultarAssinatura("sub_000000000001");

    // O objeto do gateway TEM `status: "ACTIVE"`; o nosso contrato não. Exibir o
    // enum do fornecedor criaria uma segunda autoridade de status ao lado de
    // `avaliarAcesso` — e o usuário não sabe interpretar ACTIVE/EXPIRED/INACTIVE.
    expect(assinaturaDoAsaas).toHaveProperty("status");
    expect(ok).not.toHaveProperty("status");

    vi.mocked(asaasClient.buscarAssinatura).mockRejectedValue(
      new AsaasApiError("Não foi possível falar com o gateway de pagamento.", 500)
    );

    const degradado = await assinaturaService.consultarAssinatura("sub_000000000001");

    expect(degradado).not.toHaveProperty("status");
  });

  it("C-05: o log da indisponibilidade traz [asaas] e o status — nunca o corpo do gateway", async () => {
    const corpoSensivel = "cpfCnpj 12345678901 do pagador";

    vi.mocked(asaasClient.buscarAssinatura).mockRejectedValue(
      new AsaasApiError(corpoSensivel, 503)
    );

    await assinaturaService.consultarAssinatura("sub_000000000001");

    const registrado = vi.mocked(console.error).mock.calls[0].map(String).join(" ");

    expect(registrado).toContain("[asaas]");
    expect(registrado).toContain("503");
    expect(registrado).not.toContain(corpoSensivel);
  });
});

describe("assinaturaService.cancelar", () => {
  beforeEach(() => {
    prismaMock.empresa.findFirst.mockResolvedValue(empresaAssinatura as never);
    vi.mocked(asaasClient.removerAssinatura).mockResolvedValue({
      deleted: true,
      id: "sub_000000000001",
    });
  });

  it("empresa inexistente (ou removida): 404 e o Asaas nem chega a ser chamado", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);

    await expect(assinaturaService.cancelar("empresa-fantasma")).rejects.toMatchObject({
      status: 404,
    });

    expect(asaasClient.removerAssinatura).not.toHaveBeenCalled();
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
  });

  it("empresa sem `asaasSubscriptionId`: 409 sem tocar no gateway", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      ...empresaAssinatura,
      asaasSubscriptionId: null,
    } as never);

    await expect(assinaturaService.cancelar("empresa-1")).rejects.toMatchObject({
      status: 409,
      message: "Nenhuma assinatura ativa para cancelar.",
    });

    expect(asaasClient.removerAssinatura).not.toHaveBeenCalled();
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
  });

  it("com o gateway confirmando, grava `canceladoEm` exatamente uma vez", async () => {
    await assinaturaService.cancelar("empresa-1");

    expect(asaasClient.removerAssinatura).toHaveBeenCalledTimes(1);
    expect(asaasClient.removerAssinatura).toHaveBeenCalledWith("sub_000000000001");

    expect(prismaMock.empresa.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      data: { canceladoEm: expect.any(Date) },
    });
  });

  it("D-04: quando o Asaas rejeita o cancelamento, NENHUMA linha é gravada no nosso banco", async () => {
    vi.mocked(asaasClient.removerAssinatura).mockRejectedValue(
      new AsaasApiError("Não foi possível falar com o gateway de pagamento.", 502)
    );

    await expect(assinaturaService.cancelar("empresa-1")).rejects.toMatchObject({
      status: 502,
      message: "Não foi possível cancelar agora. Tente novamente.",
    });

    // Asserção de AUSÊNCIA: é a prova executável da ordem gateway→banco. Sem ela,
    // uma implementação que gravasse `canceladoEm` antes da chamada passaria — e
    // produziria o pior estado possível: a UI diz "cancelado" e o cartão continua
    // sendo cobrado todo mês.
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.auditoriaAcesso.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("Pitfall 4: 404 do gateway não é falha — grava `canceladoEm` mesmo assim", async () => {
    vi.mocked(asaasClient.removerAssinatura).mockRejectedValue(
      new AsaasApiError("Não foi possível falar com o gateway de pagamento.", 404)
    );

    // O DELETE não é idempotente: a segunda chamada devolve 404. Sem este ramo,
    // um duplo-clique deixaria a cobrança parada no gateway e o sistema achando
    // que o cliente continua assinante.
    await expect(assinaturaService.cancelar("empresa-1")).resolves.toBeUndefined();

    expect(prismaMock.empresa.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      data: { canceladoEm: expect.any(Date) },
    });
  });

  it("empresa já cancelada é no-op: não chama o gateway e não reescreve a data", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      ...empresaAssinatura,
      canceladoEm: new Date("2026-08-01T03:00:00.000Z"),
    } as never);

    await expect(assinaturaService.cancelar("empresa-1")).resolves.toBeUndefined();

    expect(asaasClient.removerAssinatura).not.toHaveBeenCalled();
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
  });

  it("C-05: o log da falha traz o prefixo [asaas], o empresaId e o status — nunca o corpo do gateway", async () => {
    const corpoSensivel = "cpfCnpj 12345678901 do pagador";

    vi.mocked(asaasClient.removerAssinatura).mockRejectedValue(
      new AsaasApiError(corpoSensivel, 401)
    );

    await expect(assinaturaService.cancelar("empresa-1")).rejects.toBeInstanceOf(HttpError);

    expect(console.error).toHaveBeenCalledTimes(1);

    const registrado = vi.mocked(console.error).mock.calls[0].map(String).join(" ");

    expect(registrado).toContain("[asaas]");
    expect(registrado).toContain("empresa-1");
    expect(registrado).toContain("401");
    expect(registrado).not.toContain(corpoSensivel);
  });

  it("C-05: o 404 engolido não vira log de erro — não é falha", async () => {
    vi.mocked(asaasClient.removerAssinatura).mockRejectedValue(
      new AsaasApiError("Não foi possível falar com o gateway de pagamento.", 404)
    );

    await assinaturaService.cancelar("empresa-1");

    // Um duplo-clique é fluxo normal, não incidente. Logar como erro treinaria
    // quem opera o sistema a ignorar o log.
    expect(console.error).not.toHaveBeenCalled();
  });

  it("C-07: lê a Empresa com `select` explícito e `deletedAt: null`, sem `include`", async () => {
    await assinaturaService.cancelar("empresa-1");

    expect(prismaMock.empresa.findFirst).toHaveBeenCalledWith({
      where: { id: "empresa-1", deletedAt: null },
      select: {
        id: true,
        asaasSubscriptionId: true,
        canceladoEm: true,
        acessoAte: true,
        trialFim: true,
        acessoVitalicio: true,
      },
    });

    const [argumento] = prismaMock.empresa.findFirst.mock.calls[0] as [Record<string, unknown>];

    expect(argumento).not.toHaveProperty("include");
  });

  it("D-06: não encurta o acesso já pago nem grava linha de auditoria", async () => {
    await assinaturaService.cancelar("empresa-1");

    const [chamada] = prismaMock.empresa.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];

    // `canceladoEm` e mais NADA: mexer em `acessoAte` aqui tiraria do cliente o
    // período que ele já pagou, contra a promessa de SUB-02.
    expect(Object.keys(chamada.data)).toEqual(["canceladoEm"]);

    // Com `acessoAte` ainda no futuro, o status derivado continua `EM_DIA` — não
    // há transição a registrar. Quem registra a ida para `CANCELADO` é
    // `revalidarConta` ou o worker diário, quando o período expirar.
    expect(prismaMock.auditoriaAcesso.create).not.toHaveBeenCalled();
  });
});
