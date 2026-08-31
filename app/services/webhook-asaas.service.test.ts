// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { Prisma } from "@prisma/client";
import { webhookAsaasService } from "./webhook-asaas.service";
import { redigirEnvelope } from "@/lib/billing/asaas/eventos";
import { envelopePagamento } from "@/tests/helpers/asaas";
import { avaliarAcesso, DIAS_DE_CARENCIA } from "@/lib/avaliar-acesso";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";

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

/** Os 4 eventos que MUTAM estado — deliberadamente nao processados nesta wave. */
const EVENTOS_MUTADORES = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "SUBSCRIPTION_CREATED",
  "CHECKOUT_PAID",
];

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
      expect(chamadas[0].data.erro).toContain("03-06");
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
