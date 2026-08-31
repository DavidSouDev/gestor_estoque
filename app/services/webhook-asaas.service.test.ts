// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { Prisma } from "@prisma/client";
import { webhookAsaasService } from "./webhook-asaas.service";
import { redigirEnvelope } from "@/lib/billing/asaas/eventos";
import {
  envelopeAssinatura,
  envelopeCheckout,
  envelopePagamento,
} from "@/tests/helpers/asaas";
import { avaliarAcesso, DIAS_DE_CARENCIA } from "@/lib/avaliar-acesso";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";
import { acessoService } from "@/app/services/acesso.service";
import { asaasClient } from "@/lib/billing/asaas/client";

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

/**
 * Os eventos de pagamento continuam na fila ate a Task 2 deste plano ligar
 * `aplicarPagamentoConfirmado` ao despacho. `SUBSCRIPTION_CREATED` e
 * `CHECKOUT_PAID` sairam desta lista na Task 1: eles agora tem handler.
 */
const EVENTOS_MUTADORES = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"];

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
    // na fila de retrabalho `WHERE processadoEm IS NULL` (Fase 5 / WRK-01).
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

  it.each(EVENTOS_MUTADORES)(
    "wave 2 — %s fica na fila `processadoEm IS NULL`, nunca marcado como concluído",
    async (evento) => {
      prismaMock.eventoWebhookAsaas.findUnique.mockResolvedValue(
        linhaDoLedger({ evento }) as never
      );
      prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

      await webhookAsaasService.processar("evt-1");

      const chamadas = chamadasDeUpdate();
      expect(chamadas).toHaveLength(1);
      expect(chamadas[0].data).toHaveProperty("erro");
      // Asserção de AUSÊNCIA: marcarProcessado nunca é chamado nesta wave.
      for (const chamada of chamadas) {
        expect(chamada.data).not.toHaveProperty("processadoEm");
      }
      expect(prismaMock.empresa.update).not.toHaveBeenCalled();
      expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
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
    prismaMock.empresa.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ id: "empresa-3" } as never);
    prismaMock.checkoutAsaas.findUnique.mockResolvedValue(null as never);

    await expect(
      webhookAsaasService.resolverEmpresaId({
        subscription: "sub_x",
        checkoutId: "chk_x",
        customer: "cus_1",
      })
    ).resolves.toBe("empresa-3");

    expect(prismaMock.empresa.findFirst).toHaveBeenLastCalledWith({
      where: { asaasCustomerId: "cus_1", deletedAt: null },
      select: { id: true },
    });
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
  it("Pitfall 8: grava o sub_… e o cus_… na empresa resolvida e conclui o evento", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({ id: "empresa-1" } as never);
    prismaMock.empresa.update.mockResolvedValue({} as never);
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

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

  it("empresa não resolvida: marcarErro e NENHUMA escrita em Empresa", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null as never);
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

    await webhookAsaasService.capturarAssinatura("evt-1", assinaturaDoFixture());

    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
    const chamadas = chamadasDeUpdate();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].data).toHaveProperty("erro");
    // O evento fica na fila `processadoEm IS NULL` para a Fase 5.
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
    prismaMock.empresa.findFirst.mockResolvedValue({ id: "empresa-1" } as never);
    prismaMock.empresa.update.mockResolvedValue({} as never);
    prismaMock.eventoWebhookAsaas.update.mockResolvedValue({} as never);

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
