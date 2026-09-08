// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { CausaTransicaoAcesso, Prisma } from "@prisma/client";
import { webhookAsaasService } from "./webhook-asaas.service";
import { EVENTOS_ASSINADOS, redigirEnvelope } from "@/lib/billing/asaas/eventos";
import { acessoAteAposPagamento } from "@/lib/billing/asaas/datas";
import {
  envelopeAssinatura,
  envelopeCheckout,
  envelopePagamento,
} from "@/tests/helpers/asaas";
import { avaliarAcesso, DIAS_DE_CARENCIA } from "@/lib/avaliar-acesso";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";
import { acessoService } from "@/app/services/acesso.service";
import { asaasClient, AsaasApiError } from "@/lib/billing/asaas/client";

/**
 * O compare-and-swap de auditoria da Fase 2 e chamado, nunca reimplementado —
 * aqui ele e mockado para que as assercoes sejam sobre a CHAMADA (empresaId,
 * anterior, novo, causa), que e o contrato que este arquivo precisa honrar.
 */
vi.mock("@/app/services/acesso.service", () => ({
  acessoService: { registrarTransicao: vi.fn() },
}));

/**
 * O cliente do gateway e mockado por MODULO (nao por spy) porque o re-fetch
 * autoritativo e um controle de seguranca: os testes precisam provar tanto a
 * ORDEM de invocacao quanto o comportamento sob rejeicao, sem nunca tocar a
 * rede. `importOriginal` preserva `AsaasApiError`, que o teste de falha usa.
 */
vi.mock("@/lib/billing/asaas/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/billing/asaas/client")>();

  return {
    ...real,
    asaasClient: {
      criarCheckout: vi.fn(),
      buscarPagamento: vi.fn(),
      buscarAssinatura: vi.fn(),
    },
  };
});

const acessoMock = vi.mocked(acessoService);
const asaasMock = vi.mocked(asaasClient);

/**
 * Os 8 eventos de OBSERVACAO (Pattern 4). Nenhum deles pode escrever um fato de
 * billing. A lista vive aqui duplicada de proposito: se alguem mover um evento
 * para o grupo dos mutadores no service sem atualizar este teste, o caso falha.
 */
const EVENTOS_SEM_MUTACAO = [
  "PAYMENT_OVERDUE",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "CHECKOUT_EXPIRED",
  "CHECKOUT_CANCELED",
  "SUBSCRIPTION_INACTIVATED",
  "SUBSCRIPTION_DELETED",
];

/** Os dois eventos que estendem `acessoAte` — o unico caminho de dinheiro. */
const EVENTOS_DE_PAGAMENTO = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"];

function linhaDoLedger(overrides: Record<string, unknown> = {}) {
  return {
    eventoId: "evt-1",
    evento: "PAYMENT_OVERDUE",
    payload: {},
    processadoEm: null,
    ...overrides,
  };
}

function erroPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError("erro do banco", {
    code,
    clientVersion: "0.0.0",
  });
}

/** Args de `eventoWebhookAsaas.update` sem o ruido dos genericos do Prisma. */
function chamadasDeUpdate(): Array<{ data: Record<string, unknown> }> {
  return prismaMock.eventoWebhookAsaas.update.mock.calls.map(
    ([args]) => args as unknown as { data: Record<string, unknown> }
  );
}

/** `data` de cada `empresa.update`, sem o ruido dos genericos do Prisma. */
function dadosDeEmpresaUpdate(): Array<Record<string, unknown>> {
  return prismaMock.empresa.update.mock.calls.map(
    ([args]) => (args as unknown as { data: Record<string, unknown> }).data
  );
}

/** Sub-objeto `subscription` do fixture de `SUBSCRIPTION_CREATED`. */
function assinaturaDoFixture(overrides: Record<string, unknown> = {}) {
  const bruto = envelopeAssinatura().subscription as Record<string, unknown>;
  return { ...bruto, ...overrides };
}

/** Sub-objeto `checkout` do fixture de `CHECKOUT_PAID` (com a armadilha do Pitfall 8). */
function checkoutDoFixture(overrides: Record<string, unknown> = {}) {
  const bruto = envelopeCheckout().checkout as Record<string, unknown>;
  return { ...bruto, ...overrides };
}

let erroLogado: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();

  // `clearAllMocks` zera as CHAMADAS, mas preserva as implementações — então um
  // `mockResolvedValue` definido num `describe` continua valendo nos seguintes.
  // O mock do Prisma tem `mockReset` próprio (tests/setup/prisma-mock.ts); o do
  // cliente do Asaas não tinha, e a consequência era um teste passar por
  // vazamento do bloco anterior em vez de pelo próprio arranjo. Descoberto ao
  // introduzir o re-fetch de `capturarAssinatura` no plano 03-07.
  asaasMock.buscarPagamento.mockReset();
  asaasMock.buscarAssinatura.mockReset();

  // Default: fallback por `asaasCustomerId` (passo 3 de `resolverEmpresaId`)
  // não acha ninguém, a menos que o teste sobrescreva. Sem isto, todo teste
  // cujo caminho chega a este passo sem mockar `findMany` explicitamente
  // quebraria em `Cannot read properties of undefined` — o `mockReset` do
  // `prismaMock` (tests/setup/prisma-mock.ts) não dá nenhum valor default a
  // `findMany`.
  prismaMock.empresa.findMany.mockResolvedValue([]);

  erroLogado = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("webhookAsaasService.registrarEvento", () => {
  it("persiste eventoId, evento e o payload REDIGIDO — asserção exata", async () => {
    prismaMock.eventoWebhookAsaas.create.mockResolvedValue({} as never);
    const envelope = envelopePagamento();

    await webhookAsaasService.registrarEvento(
      "evt-1",
      "PAYMENT_CONFIRMED",
      envelope
    );

    // Asserção EXATA (não `objectContaining`): é ela que prova que nenhum campo
    // extra — em particular o envelope bruto — entra na linha do ledger.
    expect(prismaMock.eventoWebhookAsaas.create).toHaveBeenCalledWith({
      data: {
        eventoId: "evt-1",
        evento: "PAYMENT_CONFIRMED",
        payload: redigirEnvelope(envelope),
      },
    });
  });

  it('devolve "NOVO" quando o insert resolve', async () => {
    prismaMock.eventoWebhookAsaas.create.mockResolvedValue({} as never);

    await expect(
      webhookAsaasService.registrarEvento("evt-1", "PAYMENT_CONFIRMED", {})
    ).resolves.toBe("NOVO");
  });

  it('P2002 é o caminho FELIZ: devolve "DUPLICADO" sem lançar', async () => {
    prismaMock.eventoWebhookAsaas.create.mockRejectedValue(erroPrisma("P2002"));

    await expect(
      webhookAsaasService.registrarEvento("evt-1", "PAYMENT_CONFIRMED", {})
    ).resolves.toBe("DUPLICADO");
  });

  it("re-lança qualquer outro erro do Prisma — o route handler precisa saber que a persistência falhou", async () => {
    prismaMock.eventoWebhookAsaas.create.mockRejectedValue(erroPrisma("P1001"));

    await expect(
      webhookAsaasService.registrarEvento("evt-1", "PAYMENT_CONFIRMED", {})
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it("GTW-01: o payload gravado não carrega dado de cartão nem CPF/CNPJ", async () => {
    prismaMock.eventoWebhookAsaas.create.mockResolvedValue({} as never);

    // O fixture contém esses campos DE PROPÓSITO (ver nota de não-vacuidade em
    // tests/helpers/asaas.ts): sem eles a asserção passaria trivialmente.
    await webhookAsaasService.registrarEvento(
      "evt-1",
      "PAYMENT_CONFIRMED",
      envelopePagamento()
    );

    const gravado = JSON.stringify(
      prismaMock.eventoWebhookAsaas.create.mock.calls[0][0]
    );

    expect(gravado).not.toContain("creditCard");
    expect(gravado).not.toContain("cpfCnpj");
    expect(gravado).not.toContain("invoiceUrl");
    expect(gravado).not.toContain("transactionReceiptUrl");
  });
});

describe("webhookAsaasService.marcarProcessado", () => {
  it("preenche processadoEm, limpa erro e não toca empresaId quando ele não é informado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await webhookAsaasService.marcarProcessado("evt-1");

    expect(prismaMock.eventoWebhookAsaas.update).toHaveBeenCalledWith({
      where: { eventoId: "evt-1" },
      data: { processadoEm: new Date("2026-09-01T12:00:00.000Z"), erro: null },
    });
  });

  it("grava empresaId quando o tenant já foi resolvido", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await webhookAsaasService.marcarProcessado("evt-1", "empresa-1");

    expect(prismaMock.eventoWebhookAsaas.update).toHaveBeenCalledWith({
      where: { eventoId: "evt-1" },
      data: {
        processadoEm: new Date("2026-09-01T12:00:00.000Z"),
        erro: null,
        empresaId: "empresa-1",
      },
    });
  });
});

describe("webhookAsaasService.marcarErro", () => {
  it("Pitfall 10: grava o erro e incrementa tentativas SEM preencher processadoEm", async () => {
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await webhookAsaasService.marcarErro("evt-1", "banco indisponível");

    // Asserção EXATA: a ausência de `processadoEm` aqui é o que mantém o evento
    // na fila de retrabalho `WHERE processadoEm IS NULL`. Essa fila hoje não tem
    // consumidor: o worker diário da Fase 5 não a toca (D-06 do 05-CONTEXT.md).
    expect(prismaMock.eventoWebhookAsaas.update).toHaveBeenCalledWith({
      where: { eventoId: "evt-1" },
      data: { erro: "banco indisponível", tentativas: { increment: 1 } },
    });
  });

  it("trunca a mensagem em 500 caracteres", async () => {
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await webhookAsaasService.marcarErro("evt-1", "x".repeat(600));

    expect(chamadasDeUpdate()[0].data.erro).toBe("x".repeat(500));
  });
});

describe("webhookAsaasService.processar", () => {
  it("evento ausente do ledger: retorna sem lançar e sem nenhuma escrita", async () => {
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(null as never);

    await expect(
      webhookAsaasService.processar("evt-inexistente")
    ).resolves.toBeUndefined();

    expect(prismaMock.eventoWebhookAsaas.update).not.toHaveBeenCalled();
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
  });

  it("segunda barreira de idempotência: evento já processado não é reprocessado", async () => {
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({ processadoEm: new Date("2026-09-01T12:00:00.000Z") }) as never
    );

    await webhookAsaasService.processar("evt-1");

    expect(prismaMock.eventoWebhookAsaas.update).not.toHaveBeenCalled();
  });

  it.each(EVENTOS_SEM_MUTACAO)(
    "Pattern 4 — %s é no-op de estado: nenhum fato de billing é escrito",
    async (evento) => {
      prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
        linhaDoLedger({ evento }) as never
      );
      prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

      await webhookAsaasService.processar("evt-1");

      // As três asserções de ausência que provam a invariante do Pattern 4:
      // observar um atraso NÃO é um comando de escrita (Pitfall 4).
      expect(prismaMock.empresa.update).not.toHaveBeenCalled();
      expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();

      // Mas o evento É concluído: ele não pode ficar na fila de retrabalho.
      expect(chamadasDeUpdate()[0].data).toHaveProperty("processadoEm");
    }
  );

  it("evento desconhecido: 200-equivalente — loga com prefixo, marca como processado e NÃO lança", async () => {
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({ evento: "EVENTO_QUE_NAO_EXISTE_AINDA" }) as never
    );
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await expect(webhookAsaasService.processar("evt-1")).resolves.toBeUndefined();

    expect(erroLogado).toHaveBeenCalledWith(
      expect.stringContaining("[webhook-asaas]"),
      "evt-1",
      "EVENTO_QUE_NAO_EXISTE_AINDA"
    );
    expect(chamadasDeUpdate()[0].data).toHaveProperty("processadoEm");
  });

  it("uma falha dentro de um ramo é capturada e gravada via marcarErro, nunca propagada", async () => {
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({ evento: "PAYMENT_OVERDUE" }) as never
    );
    prismaMock.eventoWebhookAsaas.update
      .mockRejectedValueOnce(new Error("banco caiu"))
      .mockResolvedValue({} as never);

    await expect(webhookAsaasService.processar("evt-1")).resolves.toBeUndefined();

    const chamadas = chamadasDeUpdate();
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1].data.erro).toContain("banco caiu");
    expect(chamadas[1].data).not.toHaveProperty("processadoEm");
  });

  it("nem a falha de gravar o erro propaga — processar roda depois do 200, uma rejeição não teria para onde ir", async () => {
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({ evento: "PAYMENT_OVERDUE" }) as never
    );
    prismaMock.eventoWebhookAsaas.update.mockRejectedValue(new Error("banco caiu"));

    await expect(webhookAsaasService.processar("evt-1")).resolves.toBeUndefined();
  });

  it("falha na leitura do ledger também não propaga", async () => {
    prismaMock.eventoWebhookAsaas.findUnique.mockRejectedValue(
      new Error("conexão perdida")
    );
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await expect(webhookAsaasService.processar("evt-1")).resolves.toBeUndefined();
  });
});

describe("Pattern 4 — encaixe com o motor de acesso da Fase 2", () => {
  it("depois de um PAYMENT_OVERDUE que não escreveu nada, avaliarAcesso já devolve CARENCIA por conta própria", async () => {
    // `acessoAte` é, por construção (D-01), a meia-noite de São Paulo do dia de
    // vencimento da cobrança não paga.
    const acessoAte = new Date("2026-09-01T03:00:00.000Z");

    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({ evento: "PAYMENT_OVERDUE" }) as never
    );
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await webhookAsaasService.processar("evt-1");

    // Nada foi escrito na Empresa — os fatos continuam exatamente os mesmos.
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();

    // `avaliarAcesso` REAL (não mock): a carência de 10 dias já começou sozinha
    // no instante em que `acessoAte` venceu. É por isso que escrever aqui seria
    // redundante e perigoso.
    const resultado = avaliarAcesso(
      {
        acessoAte,
        trialFim: null,
        canceladoEm: null,
        acessoVitalicio: false,
      },
      new Date("2026-09-05T12:00:00.000Z")
    );

    expect(resultado.status).toBe("CARENCIA");
    expect(resultado.carenciaAte).toEqual(
      meiaNoiteEmSaoPaulo(acessoAte, DIAS_DE_CARENCIA)
    );
    // Literal, para tornar a asserção acima não-vacua: acessoAte + 10 dias.
    expect(resultado.carenciaAte).toEqual(new Date("2026-09-11T03:00:00.000Z"));
  });
});

describe("webhookAsaasService.resolverEmpresaId", () => {
  it("passo 1 — resolve pelo asaasSubscriptionId, que é uma coluna gravada por NÓS", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({ id: "empresa-1" } as never);

    await expect(
      webhookAsaasService.resolverEmpresaId({ subscription: "sub_1" })
    ).resolves.toBe("empresa-1");

    // Asserção EXATA: o `where` cita apenas a coluna do mapa local e o filtro de
    // soft delete. Nenhum identificador afirmado pelo payload vira autorização.
    expect(prismaMock.empresa.findFirst).toHaveBeenCalledWith({
      where: { asaasSubscriptionId: "sub_1", deletedAt: null },
      select: { id: true },
    });
  });

  it("passo 2 — resolve pelo CheckoutAsaas quando a assinatura ainda não existe", async () => {
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue({
      empresaId: "empresa-2",
    } as never);

    await expect(
      webhookAsaasService.resolverEmpresaId({ checkoutId: "chk_1" })
    ).resolves.toBe("empresa-2");

    expect(prismaMock.checkoutAsaas.findUnique).toHaveBeenCalledWith({
      where: { asaasCheckoutId: "chk_1" },
      select: { empresaId: true },
    });
  });

  it("precedência: o mapa de assinatura é consultado ANTES do mapa de checkout", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue({
      empresaId: "empresa-2",
    } as never);

    await expect(
      webhookAsaasService.resolverEmpresaId({
        subscription: "sub_1",
        checkoutId: "chk_1",
      })
    ).resolves.toBe("empresa-2");

    expect(
      prismaMock.empresa.findFirst.mock.invocationCallOrder[0]
    ).toBeLessThan(prismaMock.checkoutAsaas.findUnique.mock.invocationCallOrder[0]);
  });

  it("o mapa de checkout nem é consultado quando a assinatura já resolveu", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({ id: "empresa-1" } as never);

    await expect(
      webhookAsaasService.resolverEmpresaId({
        subscription: "sub_1",
        checkoutId: "chk_1",
      })
    ).resolves.toBe("empresa-1");

    expect(prismaMock.checkoutAsaas.findUnique).not.toHaveBeenCalled();
  });

  it("passo 3 — cai para o asaasCustomerId só depois que assinatura e checkout falharam", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue(null as never);
    prismaMock.empresa.findMany.mockResolvedValue([{ id: "empresa-3" }] as never);

    await expect(
      webhookAsaasService.resolverEmpresaId({
        subscription: "sub_x",
        checkoutId: "chk_x",
        customer: "cus_1",
      })
    ).resolves.toBe("empresa-3");

    expect(prismaMock.empresa.findMany).toHaveBeenCalledWith({
      where: { asaasCustomerId: "cus_1", deletedAt: null },
      select: { id: true },
      take: 2,
    });
  });

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * `asaasCustomerId` não é `@unique` no schema. Se duas empresas um dia
   * compartilharem o mesmo valor, resolver por "a primeira que aparecer"
   * estenderia acesso para o tenant ERRADO. A resolução tem que se recusar a
   * escolher e devolver `null` (fail-closed), nunca adivinhar.
   */
  it("passo 3 — recusa resolver quando o asaasCustomerId é ambíguo entre duas empresas", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue(null as never);
    prismaMock.empresa.findMany.mockResolvedValue([
      { id: "empresa-3" },
      { id: "empresa-4" },
    ] as never);

    await expect(
      webhookAsaasService.resolverEmpresaId({
        subscription: "sub_x",
        checkoutId: "chk_x",
        customer: "cus_ambiguo",
      })
    ).resolves.toBeNull();

    expect(erroLogado).toHaveBeenCalledWith(
      expect.stringContaining("[webhook-asaas]"),
      expect.objectContaining({ customer: "cus_ambiguo" })
    );
  });

  it("C-08: externalReference sozinho NUNCA resolve — nenhuma consulta sequer acontece", async () => {
    // Este é o caso de IDOR. Se um identificador afirmado pelo payload pudesse
    // resolver o tenant, qualquer um que forjasse um webhook escolheria a
    // empresa alvo. A autoridade é sempre uma coluna que NÓS gravamos.
    await expect(
      webhookAsaasService.resolverEmpresaId({ externalReference: "empresa-9" })
    ).resolves.toBeNull();

    expect(prismaMock.empresa.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.empresa.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.checkoutAsaas.findUnique).not.toHaveBeenCalled();
  });

  it("C-08: externalReference divergente é só cross-check — loga e o mapa local prevalece", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({ id: "empresa-1" } as never);

    await expect(
      webhookAsaasService.resolverEmpresaId({
        subscription: "sub_1",
        externalReference: "empresa-9",
      })
    ).resolves.toBe("empresa-1");

    expect(erroLogado).toHaveBeenCalledWith(
      expect.stringContaining("[webhook-asaas]"),
      expect.objectContaining({
        mapaLocal: "empresa-1",
        referenciaExterna: "empresa-9",
      })
    );
  });

  it("externalReference coincidente não gera log de divergência", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({ id: "empresa-1" } as never);

    await webhookAsaasService.resolverEmpresaId({
      subscription: "sub_1",
      externalReference: "empresa-1",
    });

    expect(erroLogado).not.toHaveBeenCalled();
  });

  it("nada resolve: devolve null e NÃO cria empresa nem adivinha", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue(null as never);
    prismaMock.empresa.findMany.mockResolvedValue([] as never);

    await expect(
      webhookAsaasService.resolverEmpresaId({
        subscription: "sub_x",
        checkoutId: "chk_x",
        customer: "cus_x",
        externalReference: "empresa-9",
      })
    ).resolves.toBeNull();

    expect(prismaMock.empresa.create).not.toHaveBeenCalled();
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
  });
});

describe("webhookAsaasService.capturarAssinatura", () => {
  /**
   * Objeto AUTORITATIVO devolvido por `GET /v3/subscriptions/{id}`.
   *
   * Os valores reproduzem o que a homologação do plano 03-07 mediu contra o
   * sandbox, e o que importa é o que NÃO tem: `externalReference` é `null` (A3
   * refutada), e `checkoutSession` é o único campo que liga a assinatura de volta
   * a uma linha nossa de `CheckoutAsaas`.
   */
  function assinaturaAutoritativa(overrides: Record<string, unknown> = {}) {
    return {
      id: "sub_VXJBYgP2u0eO",
      customer: "cus_000006297983",
      status: "ACTIVE",
      cycle: "MONTHLY",
      nextDueDate: "2026-09-01",
      externalReference: null,
      checkoutSession: "chk_7b2f4c8e9a1d",
      ...overrides,
    };
  }

  /** Assinatura re-buscada com sucesso e checkout nosso encontrado no mapa. */
  function prepararAssinaturaResolvida(overrides: Record<string, unknown> = {}) {
    asaasMock.buscarAssinatura.mockResolvedValue(
      assinaturaAutoritativa(overrides) as never
    );
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue({
      empresaId: "empresa-1",
    } as never);
    prismaMock.empresa.update.mockResolvedValue({} as never);
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);
  }

  it("Pitfall 8: grava o sub_… e o cus_… na empresa resolvida e conclui o evento", async () => {
    prepararAssinaturaResolvida();

    await webhookAsaasService.capturarAssinatura("evt-1", assinaturaDoFixture());

    // Asserção EXATA: este é o ÚNICO evento que entrega o id `sub_…`. Sem
    // capturá-lo aqui, nenhuma cobrança futura da assinatura seria reconhecida.
    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      data: {
        asaasSubscriptionId: "sub_VXJBYgP2u0eO",
        asaasCustomerId: "cus_000006297983",
      },
    });
    expect(chamadasDeUpdate()[0].data).toMatchObject({
      empresaId: "empresa-1",
      erro: null,
    });
    expect(chamadasDeUpdate()[0].data).toHaveProperty("processadoEm");
  });

  it("03-07: resolve pelo checkoutSession do objeto RE-BUSCADO, não pelo payload", async () => {
    prepararAssinaturaResolvida();

    // O payload do webhook NÃO traz `checkoutSession` — é justamente por isso
    // que o re-fetch existe neste ramo.
    const payload = assinaturaDoFixture();
    expect(payload).not.toHaveProperty("checkoutSession");

    await webhookAsaasService.capturarAssinatura("evt-1", payload);

    expect(asaasMock.buscarAssinatura).toHaveBeenCalledWith("sub_VXJBYgP2u0eO");
    // A ponte é o mapa local por checkout, alimentado pelo campo autoritativo.
    expect(prismaMock.checkoutAsaas.findUnique).toHaveBeenCalledWith({
      where: { asaasCheckoutId: "chk_7b2f4c8e9a1d" },
      select: { empresaId: true },
    });
    // E o re-fetch acontece ANTES de qualquer consulta de resolução.
    expect(asaasMock.buscarAssinatura.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.checkoutAsaas.findUnique.mock.invocationCallOrder[0]
    );
  });

  it("03-07: o caso REAL — externalReference null e nenhum mapa prévio ainda resolve", async () => {
    prepararAssinaturaResolvida({ externalReference: null });
    // Nenhuma empresa tem `asaasSubscriptionId` nem `asaasCustomerId` gravado:
    // é o estado do primeiro pagamento de um cliente novo, medido no sandbox.
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);

    await webhookAsaasService.capturarAssinatura("evt-1", assinaturaDoFixture());

    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      data: {
        asaasSubscriptionId: "sub_VXJBYgP2u0eO",
        asaasCustomerId: "cus_000006297983",
      },
    });
    // Concluído, não deixado na fila de retrabalho: é a regressão que a
    // homologação pegou — antes do checkoutSession este caso ficava preso.
    expect(chamadasDeUpdate()[0].data).toHaveProperty("processadoEm");
    expect(chamadasDeUpdate()[0].data).toMatchObject({ erro: null });
  });

  it("03-07: falha do gateway no re-fetch → marcarErro, sem escrita e sem propagar", async () => {
    asaasMock.buscarAssinatura.mockRejectedValue(
      new AsaasApiError("gateway fora do ar", 503)
    );
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await expect(
      webhookAsaasService.capturarAssinatura("evt-1", assinaturaDoFixture())
    ).resolves.toBeUndefined();

    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    expect(prismaMock.checkoutAsaas.findUnique).not.toHaveBeenCalled();
    const chamadas = chamadasDeUpdate();
    expect(chamadas[0].data).toHaveProperty("erro");
    expect(chamadas[0].data).not.toHaveProperty("processadoEm");
  });

  it("empresa não resolvida: marcarErro e NENHUMA escrita em Empresa", async () => {
    asaasMock.buscarAssinatura.mockResolvedValue(
      assinaturaAutoritativa({ checkoutSession: null }) as never
    );
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue(null as never);
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await webhookAsaasService.capturarAssinatura("evt-1", assinaturaDoFixture());

    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    const chamadas = chamadasDeUpdate();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].data).toHaveProperty("erro");
    // A ausência de `processadoEm` mantém o evento na fila de retrabalho
    // `WHERE processadoEm IS NULL` — fila que hoje não tem consumidor: o worker
    // diário da Fase 5 não a toca (D-06 do 05-CONTEXT.md).
    expect(chamadas[0].data).not.toHaveProperty("processadoEm");
  });

  it("payload sem os campos exigidos: marcarErro, sem exceção e sem escrita", async () => {
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await expect(
      webhookAsaasService.capturarAssinatura("evt-1", { id: "sub_1" })
    ).resolves.toBeUndefined();

    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    expect(chamadasDeUpdate()[0].data).toHaveProperty("erro");
  });

  it("idempotente: duas execuções com o mesmo payload produzem escritas idênticas", async () => {
    prepararAssinaturaResolvida();

    await webhookAsaasService.capturarAssinatura("evt-1", assinaturaDoFixture());
    await webhookAsaasService.capturarAssinatura("evt-1", assinaturaDoFixture());

    const [primeira, segunda] = dadosDeEmpresaUpdate();
    expect(segunda).toEqual(primeira);
  });
});

describe("webhookAsaasService.capturarCheckoutPago", () => {
  function prepararCheckoutResolvido() {
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue({
      empresaId: "empresa-1",
    } as never);
    prismaMock.checkoutAsaas.update.mockResolvedValue({} as never);
    prismaMock.empresa.update.mockResolvedValue({} as never);
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);
  }

  it("atualiza o status do CheckoutAsaas e grava o cus_… na empresa resolvida", async () => {
    prepararCheckoutResolvido();

    await webhookAsaasService.capturarCheckoutPago("evt-1", checkoutDoFixture());

    expect(prismaMock.checkoutAsaas.update).toHaveBeenCalledWith({
      where: { asaasCheckoutId: "chk_7b2f4c8e9a1d" },
      data: { status: "PAID" },
    });
    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      data: { asaasCustomerId: "cus_000006297983" },
    });
    expect(chamadasDeUpdate()[0].data).toMatchObject({ empresaId: "empresa-1" });
  });

  it("Pitfall 8: o id da assinatura NUNCA sai do sub-objeto de recorrência do checkout", async () => {
    // O fixture reproduz a armadilha de propósito: o sub-objeto de recorrência
    // traz apenas `cycle`/`nextDueDate`/`endDate`, sem `id`. Qualquer tentativa
    // de extrair um `sub_…` daqui gravaria `undefined`.
    prepararCheckoutResolvido();

    await webhookAsaasService.capturarCheckoutPago("evt-1", checkoutDoFixture());

    for (const dados of dadosDeEmpresaUpdate()) {
      expect(dados).not.toHaveProperty("asaasSubscriptionId");
    }
  });

  it("este ramo NÃO estende acessoAte — quem paga o acesso é o PAYMENT_CONFIRMED", async () => {
    prepararCheckoutResolvido();

    await webhookAsaasService.capturarCheckoutPago("evt-1", checkoutDoFixture());

    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    for (const dados of dadosDeEmpresaUpdate()) {
      expect(dados).not.toHaveProperty("acessoAte");
    }
  });

  it("checkout sem customer: nada é escrito em Empresa", async () => {
    prepararCheckoutResolvido();

    await webhookAsaasService.capturarCheckoutPago("evt-1", {
      id: "chk_7b2f4c8e9a1d",
      status: "PAID",
    });

    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    expect(prismaMock.checkoutAsaas.update).toHaveBeenCalled();
  });

  it("empresa não resolvida: marcarErro, sem tocar CheckoutAsaas nem Empresa", async () => {
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue(null as never);
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await webhookAsaasService.capturarCheckoutPago("evt-1", checkoutDoFixture());

    expect(prismaMock.checkoutAsaas.update).not.toHaveBeenCalled();
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    expect(chamadasDeUpdate()[0].data).not.toHaveProperty("processadoEm");
  });
});

describe("processar — despacho dos eventos de captura (03-06)", () => {
  it("SUBSCRIPTION_CREATED sai da fila de retrabalho e captura o sub_…", async () => {
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({
        evento: "SUBSCRIPTION_CREATED",
        payload: redigirEnvelope(envelopeAssinatura()),
      }) as never
    );
    // O ramo re-busca a assinatura antes de resolver (03-07): sem este stub o
    // teste passaria a depender do arranjo de outro `describe`.
    asaasMock.buscarAssinatura.mockResolvedValue({
      id: "sub_VXJBYgP2u0eO",
      customer: "cus_000006297983",
      status: "ACTIVE",
      cycle: "MONTHLY",
      nextDueDate: "2026-09-01",
      externalReference: null,
      checkoutSession: "chk_7b2f4c8e9a1d",
    } as never);
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue({
      empresaId: "empresa-1",
    } as never);
    prismaMock.empresa.findFirst.mockResolvedValue({ id: "empresa-1" } as never);
    prismaMock.empresa.update.mockResolvedValue({} as never);
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await webhookAsaasService.processar("evt-1");

    expect(dadosDeEmpresaUpdate()[0]).toMatchObject({
      asaasSubscriptionId: "sub_VXJBYgP2u0eO",
    });
    expect(chamadasDeUpdate()[0].data).toHaveProperty("processadoEm");
    // Capturar identificador não é fato de billing: nada de auditoria aqui.
    expect(acessoMock.registrarTransicao).not.toHaveBeenCalled();
    expect(asaasMock.buscarPagamento).not.toHaveBeenCalled();
  });

  it("CHECKOUT_PAID sai da fila de retrabalho e atualiza o CheckoutAsaas", async () => {
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({
        evento: "CHECKOUT_PAID",
        payload: redigirEnvelope(envelopeCheckout()),
      }) as never
    );
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue({
      empresaId: "empresa-1",
    } as never);
    prismaMock.checkoutAsaas.update.mockResolvedValue({} as never);
    prismaMock.empresa.update.mockResolvedValue({} as never);
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await webhookAsaasService.processar("evt-1");

    expect(prismaMock.checkoutAsaas.update).toHaveBeenCalledWith({
      where: { asaasCheckoutId: "chk_7b2f4c8e9a1d" },
      data: { status: "PAID" },
    });
    expect(chamadasDeUpdate()[0].data).toHaveProperty("processadoEm");
    expect(acessoMock.registrarTransicao).not.toHaveBeenCalled();
    expect(asaasMock.buscarPagamento).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GTW-03 / GTW-04 — aplicarPagamentoConfirmado
// ===========================================================================

/** Instante do `acessoAte` derivado de `dueDate: "2026-09-01"`. */
const ACESSO_ATE_DE_SETEMBRO = new Date("2026-10-01T03:00:00.000Z");

/** Fatos de billing de uma empresa que acabou de sair do trial sem pagar. */
const FATOS_EM_CARENCIA = {
  acessoAte: null,
  trialFim: new Date("2026-08-20T03:00:00.000Z"),
  canceladoEm: null,
  acessoVitalicio: false,
  ultimoStatusAuditado: "CARENCIA",
};

/** Resposta do re-fetch autoritativo (`GET /v3/payments/{id}`). */
function pagamentoAutoritativo(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay_080225913252",
    status: "CONFIRMED",
    value: 29.9,
    dueDate: "2026-09-01",
    subscription: "sub_VXJBYgP2u0eO",
    customer: "cus_000006297983",
    externalReference: "empresa-1",
    billingType: "CREDIT_CARD",
    ...overrides,
  };
}

/** Sub-objeto `payment` do envelope, já redigido — é o que o ledger guarda. */
function pagamentoDoLedger(overrides: Record<string, unknown> = {}) {
  const bruto = redigirEnvelope(envelopePagamento()).payment as Record<
    string,
    unknown
  >;
  return { ...bruto, ...overrides };
}

function prepararPagamento(
  opcoes: {
    autoritativo?: Record<string, unknown>;
    fatos?: Record<string, unknown> | null;
    count?: number;
  } = {}
) {
  const {
    autoritativo = pagamentoAutoritativo(),
    fatos = FATOS_EM_CARENCIA,
    count = 1,
  } = opcoes;

  asaasMock.buscarPagamento.mockResolvedValue(autoritativo as never);
  prismaMock.empresa.findFirst.mockResolvedValue({ id: "empresa-1" } as never);
  prismaMock.empresa.findUnique.mockResolvedValue(fatos as never);
  prismaMock.empresa.updateMany.mockResolvedValue({ count } as never);
  prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);
  acessoMock.registrarTransicao.mockResolvedValue(null as never);
}

describe("webhookAsaasService.aplicarPagamentoConfirmado — re-fetch autoritativo", () => {
  it("T-03-32: reconfere a cobrança na API do Asaas ANTES de qualquer escrita em Empresa", async () => {
    prepararPagamento();

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    // A ORDEM é a prova: o re-fetch é controle de segurança, não redundância.
    // Um payload forjado (o Asaas não assina o corpo) não sobrevive a ele.
    expect(asaasMock.buscarPagamento.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.empresa.updateMany.mock.invocationCallOrder[0]
    );
    expect(asaasMock.buscarPagamento).toHaveBeenCalledWith("pay_080225913252");
  });

  /**
   * O cenário que a homologação do plano 03-07 mediu e que nenhum mock anterior
   * reproduzia — o PRIMEIRO pagamento de todo cliente novo:
   *
   *   1. `PAYMENT_CONFIRMED` é ENTREGUE ANTES de `SUBSCRIPTION_CREATED` (o
   *      `sendType` sequencial ordena dentro de cada recurso, não entre eles);
   *   2. logo `Empresa.asaasSubscriptionId` ainda é null — o mapa por `sub_…`
   *      não existe;
   *   3. `Empresa.asaasCustomerId` também é null — nada o gravou ainda;
   *   4. `externalReference` vem `null` na cobrança (A3 refutada com evidência).
   *
   * Sem `checkoutSession`, os quatro juntos são um impasse: o evento fica na
   * fila de retrabalho para sempre e um cliente que pagou é bloqueado. Foi o que
   * aconteceu no primeiro pagamento real do sandbox.
   */
  it("03-07: primeira cobrança sem mapa por sub_… resolve pelo checkoutSession autoritativo", async () => {
    prepararPagamento({
      autoritativo: pagamentoAutoritativo({
        externalReference: null,
        checkoutSession: "chk_7b2f4c8e9a1d",
      }),
    });
    // Nem assinatura nem cliente estão mapeados: estado real do 1º pagamento.
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue({
      empresaId: "empresa-1",
    } as never);

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    expect(prismaMock.checkoutAsaas.findUnique).toHaveBeenCalledWith({
      where: { asaasCheckoutId: "chk_7b2f4c8e9a1d" },
      select: { empresaId: true },
    });
    // O que importa: o acesso FOI concedido, não adiado para a fila.
    expect(prismaMock.empresa.updateMany).toHaveBeenCalledWith({
      where: {
        id: "empresa-1",
        OR: [{ acessoAte: null }, { acessoAte: { lt: ACESSO_ATE_DE_SETEMBRO } }],
      },
      data: { acessoAte: ACESSO_ATE_DE_SETEMBRO },
    });
    expect(acessoMock.registrarTransicao).toHaveBeenCalled();
  });

  it("03-07: o checkoutSession vem do RE-FETCH, nunca do payload do webhook", async () => {
    prepararPagamento({
      autoritativo: pagamentoAutoritativo({
        externalReference: null,
        checkoutSession: "chk_autoritativo",
      }),
    });
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue({
      empresaId: "empresa-1",
    } as never);

    // Um atacante que capture o bearer estático pode forjar o corpo inteiro.
    // Se o `checkoutSession` do PAYLOAD fosse aceito, ele escolheria o tenant
    // alvo — IDOR direto (C-08). A resolução tem que ignorá-lo.
    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger({ checkoutSession: "chk_forjado_pelo_atacante" })
    );

    expect(prismaMock.checkoutAsaas.findUnique).toHaveBeenCalledWith({
      where: { asaasCheckoutId: "chk_autoritativo" },
      select: { empresaId: true },
    });
    expect(prismaMock.checkoutAsaas.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { asaasCheckoutId: "chk_forjado_pelo_atacante" },
      })
    );
  });

  it("03-07: sem checkoutSession e sem mapa, continua na fila de retrabalho", async () => {
    prepararPagamento({
      autoritativo: pagamentoAutoritativo({
        externalReference: null,
        checkoutSession: null,
      }),
    });
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue(null as never);

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    // A ponte nova não afrouxa a regra: sem âncora local, não há escrita.
    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
    expect(acessoMock.registrarTransicao).not.toHaveBeenCalled();
    expect(chamadasDeUpdate()[0].data).not.toHaveProperty("processadoEm");
  });

  it("o dueDate que vira acessoAte vem do RE-FETCH, nunca do payload do webhook", async () => {
    // O payload afirma um vencimento muito posterior; o gateway diz setembro.
    // Se o payload vencesse, forjar um webhook compraria anos de acesso.
    prepararPagamento();

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger({ dueDate: "2030-01-01" })
    );

    const [args] = prismaMock.empresa.updateMany.mock.calls[0] as unknown as [
      { data: { acessoAte: Date } },
    ];
    expect(args.data.acessoAte).toEqual(ACESSO_ATE_DE_SETEMBRO);
  });

  it.each(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"])(
    "status %s do gateway é aceito como pagamento",
    async (status) => {
      prepararPagamento({ autoritativo: pagamentoAutoritativo({ status }) });

      await webhookAsaasService.aplicarPagamentoConfirmado(
        "evt-1",
        pagamentoDoLedger()
      );

      expect(prismaMock.empresa.updateMany).toHaveBeenCalled();
    }
  );

  it.each(["PENDING", "OVERDUE", "REFUNDED", "AWAITING_RISK_ANALYSIS"])(
    "status %s do gateway NÃO concede acesso: zero escrita, evento marcado com erro",
    async (status) => {
      prepararPagamento({ autoritativo: pagamentoAutoritativo({ status }) });

      await webhookAsaasService.aplicarPagamentoConfirmado(
        "evt-1",
        pagamentoDoLedger()
      );

      expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.empresa.update).not.toHaveBeenCalled();
      expect(acessoMock.registrarTransicao).not.toHaveBeenCalled();
      expect(chamadasDeUpdate()[0].data).toHaveProperty("erro");
      expect(chamadasDeUpdate()[0].data).not.toHaveProperty("processadoEm");
    }
  );

  it("T-03-37: falha do gateway não escreve nada, não propaga e deixa o evento na fila", async () => {
    prepararPagamento();
    asaasMock.buscarPagamento.mockRejectedValue(
      new AsaasApiError("Não foi possível falar com o gateway de pagamento.", 502)
    );

    await expect(
      webhookAsaasService.aplicarPagamentoConfirmado("evt-1", pagamentoDoLedger())
    ).resolves.toBeUndefined();

    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
    expect(acessoMock.registrarTransicao).not.toHaveBeenCalled();
    expect(chamadasDeUpdate()[0].data).toHaveProperty("erro");
    expect(chamadasDeUpdate()[0].data).not.toHaveProperty("processadoEm");
  });

  it("payload de pagamento sem os campos exigidos: marcarErro sem sequer chamar o gateway", async () => {
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await expect(
      webhookAsaasService.aplicarPagamentoConfirmado("evt-1", { id: "pay_1" })
    ).resolves.toBeUndefined();

    expect(asaasMock.buscarPagamento).not.toHaveBeenCalled();
    expect(chamadasDeUpdate()[0].data).toHaveProperty("erro");
  });

  it("empresa não resolvida: marcarErro, nenhuma escrita, nenhuma empresa criada", async () => {
    prepararPagamento();
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue(null as never);

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.empresa.create).not.toHaveBeenCalled();
    expect(chamadasDeUpdate()[0].data).not.toHaveProperty("processadoEm");
  });

  it("empresa some entre a resolução e a leitura dos fatos: marcarErro, sem escrita", async () => {
    prepararPagamento({ fatos: null });

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
    expect(chamadasDeUpdate()[0].data).toHaveProperty("erro");
  });

  it("C-07: a leitura dos fatos usa select explícito dos 4 fatos + o bookkeeping de auditoria", async () => {
    prepararPagamento();

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    expect(prismaMock.empresa.findUnique).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      select: {
        acessoAte: true,
        trialFim: true,
        canceladoEm: true,
        acessoVitalicio: true,
        ultimoStatusAuditado: true,
      },
    });
  });
});

describe("webhookAsaasService.aplicarPagamentoConfirmado — escrita monotônica (GTW-04)", () => {
  it("a guarda de monotonicidade mora no WHERE do updateMany — asserção EXATA", async () => {
    prepararPagamento();

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    // A exatidão é o que prova a invariante: um `if` em memória equivalente
    // passaria neste teste se a asserção fosse `objectContaining`, e perderia a
    // corrida entre DUAS entregas de webhook concorrentes do Asaas em produção.
    // É o `OR: [{ acessoAte: null }, { acessoAte: { lt: ... } }]` no WHERE do
    // updateMany que resolve essa corrida. O worker da Fase 5 não entra aqui:
    // ele não escreve `acessoAte`, só `ultimoStatusAuditado` via
    // `registrarTransicao`.
    expect(prismaMock.empresa.updateMany).toHaveBeenCalledWith({
      where: {
        id: "empresa-1",
        OR: [{ acessoAte: null }, { acessoAte: { lt: ACESSO_ATE_DE_SETEMBRO } }],
      },
      data: { acessoAte: ACESSO_ATE_DE_SETEMBRO },
    });
  });

  it("GTW-04: count === 0 (evento antigo fora de ordem) não gera auditoria, mas conclui o evento", async () => {
    prepararPagamento({ count: 0 });

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    expect(acessoMock.registrarTransicao).not.toHaveBeenCalled();
    // O evento foi TRATADO corretamente; apenas não havia o que mudar. Marcar
    // `processadoEm` é o que impede o evento de ficar eternamente pendente numa
    // fila de retrabalho que ninguém drena.
    expect(chamadasDeUpdate()[0].data).toMatchObject({ empresaId: "empresa-1" });
    expect(chamadasDeUpdate()[0].data).toHaveProperty("processadoEm");
  });

  it("count === 1 registra a transição com causa WEBHOOK_PAGAMENTO — asserção EXATA", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
    prepararPagamento();

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    expect(acessoMock.registrarTransicao).toHaveBeenCalledWith({
      empresaId: "empresa-1",
      anterior: "CARENCIA",
      novo: "EM_DIA",
      causa: CausaTransicaoAcesso.WEBHOOK_PAGAMENTO,
    });
  });

  it("o `novo` é DERIVADO por avaliarAcesso, nunca um literal: trial vigente continua TRIAL", async () => {
    // Mesma escrita de `acessoAte`, fatos diferentes. Um `if (pago) …` fixo
    // devolveria o status de pagante; a derivação devolve TRIAL, porque D-05 diz
    // que quem paga durante o trial não perde os dias restantes.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
    prepararPagamento({
      fatos: {
        acessoAte: null,
        trialFim: new Date("2026-09-20T03:00:00.000Z"),
        canceladoEm: null,
        acessoVitalicio: false,
        ultimoStatusAuditado: null,
      },
    });

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    expect(acessoMock.registrarTransicao).toHaveBeenCalledWith({
      empresaId: "empresa-1",
      anterior: null,
      novo: "TRIAL",
      causa: CausaTransicaoAcesso.WEBHOOK_PAGAMENTO,
    });
  });

  it("a auditoria passa pelo CAS da Fase 2, nunca por escrita direta na tabela", async () => {
    prepararPagamento();

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    expect(acessoMock.registrarTransicao).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditoriaAcesso.create).not.toHaveBeenCalled();
  });

  it("Pitfall 5: acessoAte é função PURA do dueDate — dois relógios distintos, o mesmo instante", async () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-09-02T00:00:00.000Z"));
    prepararPagamento();
    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );
    const primeiro = (
      prismaMock.empresa.updateMany.mock.calls[0] as unknown as [
        { data: { acessoAte: Date } },
      ]
    )[0].data.acessoAte;

    vi.clearAllMocks();
    vi.setSystemTime(new Date("2027-04-17T23:59:59.000Z"));
    prepararPagamento();
    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-2",
      pagamentoDoLedger()
    );
    const segundo = (
      prismaMock.empresa.updateMany.mock.calls[0] as unknown as [
        { data: { acessoAte: Date } },
      ]
    )[0].data.acessoAte;

    // Derivar de `new Date()` faria cada reentrega avançar o acesso e desalinhar
    // permanentemente o nosso calendário do calendário de cobrança.
    expect(segundo).toEqual(primeiro);
    expect(primeiro).toEqual(acessoAteAposPagamento("2026-09-01"));
    // Literal, para a asserção acima não ser vácua.
    expect(primeiro).toEqual(ACESSO_ATE_DE_SETEMBRO);
  });

  it("GTW-03: depois da escrita, avaliarAcesso REAL devolve EM_DIA e encerra a carência sem coluna nenhuma", async () => {
    prepararPagamento();

    await webhookAsaasService.aplicarPagamentoConfirmado(
      "evt-1",
      pagamentoDoLedger()
    );

    const [args] = prismaMock.empresa.updateMany.mock.calls[0] as unknown as [
      { data: { acessoAte: Date } },
    ];

    const resultado = avaliarAcesso(
      {
        acessoAte: args.data.acessoAte,
        trialFim: FATOS_EM_CARENCIA.trialFim,
        canceladoEm: null,
        acessoVitalicio: false,
      },
      new Date("2026-09-15T12:00:00.000Z")
    );

    expect(resultado.status).toBe("EM_DIA");
    // A carência em curso é encerrada como EFEITO da derivação: não existe
    // coluna de carência para limpar (BILL-01 / D-16).
    expect(resultado.carenciaAte).toBeNull();
  });
});

describe("processar — despacho dos eventos de pagamento (GTW-03)", () => {
  it.each(EVENTOS_DE_PAGAMENTO)(
    "%s estende acessoAte e sai da fila de retrabalho",
    async (evento) => {
      prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
        linhaDoLedger({
          evento,
          payload: redigirEnvelope(envelopePagamento({ event: evento })),
        }) as never
      );
      prepararPagamento();

      await webhookAsaasService.processar("evt-1");

      expect(prismaMock.empresa.updateMany).toHaveBeenCalledWith({
        where: {
          id: "empresa-1",
          OR: [{ acessoAte: null }, { acessoAte: { lt: ACESSO_ATE_DE_SETEMBRO } }],
        },
        data: { acessoAte: ACESSO_ATE_DE_SETEMBRO },
      });
      expect(chamadasDeUpdate()[0].data).toHaveProperty("processadoEm");
    }
  );

  it("idempotência de valor: PAYMENT_RECEIVED do mesmo dueDate vira count 0 depois do CONFIRMED", async () => {
    // Primeira entrega: CONFIRMED aplica.
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({
        evento: "PAYMENT_CONFIRMED",
        payload: redigirEnvelope(envelopePagamento()),
      }) as never
    );
    prepararPagamento();

    await webhookAsaasService.processar("evt-1");

    const primeiro = (
      prismaMock.empresa.updateMany.mock.calls[0] as unknown as [
        { data: { acessoAte: Date } },
      ]
    )[0].data.acessoAte;

    // Segunda entrega: RECEIVED do MESMO dueDate. O banco já tem o valor, então
    // a guarda do WHERE não casa nenhuma linha.
    vi.clearAllMocks();
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({
        evento: "PAYMENT_RECEIVED",
        payload: redigirEnvelope(envelopePagamento({ event: "PAYMENT_RECEIVED" })),
      }) as never
    );
    prepararPagamento({
      autoritativo: pagamentoAutoritativo({ status: "RECEIVED" }),
      count: 0,
    });

    await webhookAsaasService.processar("evt-2");

    const segundo = (
      prismaMock.empresa.updateMany.mock.calls[0] as unknown as [
        { data: { acessoAte: Date } },
      ]
    )[0].data.acessoAte;

    expect(segundo).toEqual(primeiro);
    expect(acessoMock.registrarTransicao).not.toHaveBeenCalled();
    expect(chamadasDeUpdate()[0].data).toHaveProperty("processadoEm");
  });
});

// ===========================================================================
// GTW-04 — matriz de terminação, reentrega e fora-de-ordem
// ===========================================================================

/** Os 12 eventos registrados no Asaas mais um que ainda não existe. */
const MATRIZ_DE_EVENTOS = [...EVENTOS_ASSINADOS, "EVENTO_QUE_NAO_EXISTE_AINDA"];

/** Payload redigido coerente com a família do evento. */
function payloadPara(evento: string): Record<string, unknown> {
  if (evento.startsWith("CHECKOUT_")) {
    return redigirEnvelope(envelopeCheckout({ event: evento }));
  }
  if (evento.startsWith("SUBSCRIPTION_")) {
    return redigirEnvelope(envelopeAssinatura({ event: evento }));
  }
  if (evento.startsWith("PAYMENT_")) {
    return redigirEnvelope(envelopePagamento({ event: evento }));
  }
  return {};
}

/** Deixa TODOS os caminhos de mutação viáveis, para isolar a terminação. */
function prepararTodosOsCaminhos() {
  prepararPagamento();
  prismaMock.checkoutAsaas.findUnique.mockResolvedValue({
    empresaId: "empresa-1",
  } as never);
  prismaMock.checkoutAsaas.update.mockResolvedValue({} as never);
  prismaMock.empresa.update.mockResolvedValue({} as never);
}

describe("processar — invariante de terminação sobre a matriz de eventos", () => {
  it.each(MATRIZ_DE_EVENTOS)(
    "%s: nunca rejeita e termina com processadoEm OU erro, nunca com nenhum dos dois",
    async (evento) => {
      prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
        linhaDoLedger({ evento, payload: payloadPara(evento) }) as never
      );
      prepararTodosOsCaminhos();

      await expect(
        webhookAsaasService.processar("evt-1")
      ).resolves.toBeUndefined();

      const chamadas = chamadasDeUpdate();
      expect(chamadas.length).toBeGreaterThan(0);

      const terminal = chamadas[chamadas.length - 1].data;
      const concluido = "processadoEm" in terminal;
      const comErro =
        terminal.erro !== null && terminal.erro !== undefined;

      // Um evento sem `processadoEm` e sem `erro` seria invisível tanto para a
      // fila de retrabalho quanto para o operador: o Asaas não reenvia (o 200 já
      // foi respondido) e ninguém saberia que ele existiu.
      expect(concluido || comErro).toBe(true);

      // Nenhum evento cai mais no marcador provisório do plano 03-05.
      expect(JSON.stringify(chamadas)).not.toContain("pendente");
    }
  );

  it("reentrega: evento já processado não escreve nada e não chega a falar com o gateway", async () => {
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({
        evento: "PAYMENT_CONFIRMED",
        payload: redigirEnvelope(envelopePagamento()),
        processadoEm: new Date("2026-09-01T12:00:00.000Z"),
      }) as never
    );
    prepararTodosOsCaminhos();

    await webhookAsaasService.processar("evt-1");

    expect(asaasMock.buscarPagamento).not.toHaveBeenCalled();
    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    expect(prismaMock.eventoWebhookAsaas.update).not.toHaveBeenCalled();
  });
});

describe("GTW-04 — cenário completo de evento fora de ordem", () => {
  it("um PAYMENT_CONFIRMED de 2026-08-01 reentregue depois do de 2026-10-01 não reduz acessoAte", async () => {
    // --- Entrega 1: a cobrança de outubro estende o acesso até 01/11. ---
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({
        evento: "PAYMENT_CONFIRMED",
        payload: redigirEnvelope(envelopePagamento()),
      }) as never
    );
    prepararPagamento({
      autoritativo: pagamentoAutoritativo({
        id: "pay_outubro",
        dueDate: "2026-10-01",
      }),
    });

    await webhookAsaasService.processar("evt-outubro");

    const acessoDeNovembro = (
      prismaMock.empresa.updateMany.mock.calls[0] as unknown as [
        { data: { acessoAte: Date } },
      ]
    )[0].data.acessoAte;

    expect(acessoDeNovembro).toEqual(new Date("2026-11-01T03:00:00.000Z"));
    expect(acessoMock.registrarTransicao).toHaveBeenCalledTimes(1);

    // --- Entrega 2: o evento ANTIGO de agosto é reentregue. ---
    vi.clearAllMocks();
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({
        evento: "PAYMENT_CONFIRMED",
        payload: redigirEnvelope(envelopePagamento()),
      }) as never
    );
    prepararPagamento({
      autoritativo: pagamentoAutoritativo({
        id: "pay_agosto",
        dueDate: "2026-08-01",
      }),
      fatos: { ...FATOS_EM_CARENCIA, acessoAte: acessoDeNovembro },
      // O banco já está em novembro: a guarda do WHERE não casa nenhuma linha.
      count: 0,
    });

    await webhookAsaasService.processar("evt-agosto");

    const [tentativa] = prismaMock.empresa.updateMany.mock.calls[0] as unknown as [
      { where: { OR: unknown[] }; data: { acessoAte: Date } },
    ];

    // O valor CALCULADO é o de setembro — menor que o corrente. É a guarda do
    // WHERE, e não um `if`, que transforma isso num no-op.
    expect(tentativa.data.acessoAte).toEqual(new Date("2026-09-01T03:00:00.000Z"));
    expect(tentativa.where.OR).toEqual([
      { acessoAte: null },
      { acessoAte: { lt: new Date("2026-09-01T03:00:00.000Z") } },
    ]);

    // Nenhuma auditoria nova, e o evento antigo é concluído (não fica na fila).
    expect(acessoMock.registrarTransicao).not.toHaveBeenCalled();
    expect(chamadasDeUpdate()[0].data).toHaveProperty("processadoEm");

    // E o fato de billing continua sendo o de novembro: uma empresa em dia NÃO
    // pode ser bloqueada por reentrega. `avaliarAcesso` aqui é o real.
    const resultado = avaliarAcesso(
      {
        acessoAte: acessoDeNovembro,
        trialFim: FATOS_EM_CARENCIA.trialFim,
        canceladoEm: null,
        acessoVitalicio: false,
      },
      new Date("2026-10-15T12:00:00.000Z")
    );

    expect(resultado.status).toBe("EM_DIA");
    expect(resultado.carenciaAte).toBeNull();
  });

  it("Pitfall 4: PAYMENT_OVERDUE chegando DEPOIS do PAYMENT_CONFIRMED do mesmo mês não altera fato nenhum", async () => {
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({
        evento: "PAYMENT_CONFIRMED",
        payload: redigirEnvelope(envelopePagamento()),
      }) as never
    );
    prepararPagamento();

    await webhookAsaasService.processar("evt-confirmado");
    expect(prismaMock.empresa.updateMany).toHaveBeenCalledTimes(1);

    // Agora o atraso, do MESMO mês, entregue fora de ordem.
    vi.clearAllMocks();
    prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
      linhaDoLedger({
        evento: "PAYMENT_OVERDUE",
        payload: redigirEnvelope(envelopePagamento({ event: "PAYMENT_OVERDUE" })),
      }) as never
    );
    prepararTodosOsCaminhos();

    await webhookAsaasService.processar("evt-atrasado");

    // As três asserções de ausência: observar um atraso não é comando de
    // escrita. Encurtar a carência de quem já pagou seria o pior desfecho.
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(acessoMock.registrarTransicao).not.toHaveBeenCalled();
    expect(asaasMock.buscarPagamento).not.toHaveBeenCalled();
    expect(chamadasDeUpdate()[0].data).toHaveProperty("processadoEm");
  });
});
