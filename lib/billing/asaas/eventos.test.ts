// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  EVENTOS_ASSINADOS,
  assinaturaSchema,
  checkoutSchema,
  envelopeSchema,
  pagamentoSchema,
  redigirEnvelope,
} from "@/lib/billing/asaas/eventos";
import {
  envelopeAssinatura,
  envelopeCheckout,
  envelopePagamento,
} from "@/tests/helpers/asaas";

describe("envelopeSchema", () => {
  it("aceita campo desconhecido do Asaas sem invalidar (Pitfall 3)", () => {
    const resultado = envelopeSchema.safeParse({
      id: "evt_a&1",
      event: "PAYMENT_CONFIRMED",
      campoNovoDoAsaas: true,
    });

    expect(resultado.success).toBe(true);
  });

  it("rejeita envelope sem id, sem lancar excecao", () => {
    let resultado: ReturnType<typeof envelopeSchema.safeParse> | undefined;

    expect(() => {
      resultado = envelopeSchema.safeParse({ event: "PAYMENT_CONFIRMED" });
    }).not.toThrow();

    expect(resultado?.success).toBe(false);
  });

  it("rejeita id nao-string", () => {
    expect(envelopeSchema.safeParse({ id: 123, event: "X" }).success).toBe(false);
  });

  it("rejeita entrada que nao e objeto, sem lancar", () => {
    let resultado: ReturnType<typeof envelopeSchema.safeParse> | undefined;

    expect(() => {
      resultado = envelopeSchema.safeParse("nao e objeto");
    }).not.toThrow();

    expect(resultado?.success).toBe(false);
  });
});

describe("pagamentoSchema", () => {
  it("aceita um objeto payment com 40 campos extras e devolve os campos declarados", () => {
    const extras: Record<string, unknown> = {};
    for (let i = 0; i < 40; i += 1) extras[`campoExtra${i}`] = i;

    const resultado = pagamentoSchema.safeParse({
      id: "pay_1",
      status: "CONFIRMED",
      dueDate: "2026-09-01",
      ...extras,
    });

    expect(resultado.success).toBe(true);
    expect(resultado.data).toMatchObject({
      id: "pay_1",
      status: "CONFIRMED",
      dueDate: "2026-09-01",
    });
  });

  it("rejeita payment sem dueDate (campo consumido por GTW-03)", () => {
    const resultado = pagamentoSchema.safeParse({
      id: "pay_1",
      status: "CONFIRMED",
    });

    expect(resultado.success).toBe(false);
  });

  it("aceita o objeto payment do fixture realista", () => {
    const envelope = envelopePagamento();
    const resultado = pagamentoSchema.safeParse(
      (envelope as { payment: unknown }).payment
    );

    expect(resultado.success).toBe(true);
    expect(resultado.data?.subscription).toBe("sub_VXJBYgP2u0eO");
  });
});

describe("checkoutSchema e assinaturaSchema", () => {
  it("checkoutSchema aceita o checkout do fixture", () => {
    const envelope = envelopeCheckout();
    const resultado = checkoutSchema.safeParse(
      (envelope as { checkout: unknown }).checkout
    );

    expect(resultado.success).toBe(true);
    expect(resultado.data?.status).toBe("PAID");
  });

  it("assinaturaSchema exige customer e aceita a assinatura do fixture", () => {
    const envelope = envelopeAssinatura();
    const resultado = assinaturaSchema.safeParse(
      (envelope as { subscription: unknown }).subscription
    );

    expect(resultado.success).toBe(true);
    expect(resultado.data?.id).toBe("sub_VXJBYgP2u0eO");

    expect(
      assinaturaSchema.safeParse({ id: "sub_1", status: "ACTIVE" }).success
    ).toBe(false);
  });
});

describe("redigirEnvelope — allowlist positiva (GTW-01, Pitfall 9)", () => {
  it("nao deixa nenhum campo sensivel sobreviver, em nenhuma profundidade", () => {
    const serializado = JSON.stringify(redigirEnvelope(envelopePagamento()));

    expect(serializado).not.toContain("creditCard");
    expect(serializado).not.toContain("cpfCnpj");
    expect(serializado).not.toContain("customerData");
    expect(serializado).not.toContain("invoiceUrl");
    expect(serializado).not.toContain("transactionReceiptUrl");
    expect(serializado).not.toContain("pixTransaction");
    expect(serializado).not.toContain("bankSlipUrl");
    // Valores, nao so as chaves.
    expect(serializado).not.toContain("12345678901");
    expect(serializado).not.toContain("MASTERCARD");
  });

  it("preserva exatamente os campos que a Fase 5 reconcilia", () => {
    const redigido = redigirEnvelope(envelopePagamento());

    expect(redigido.event).toBe("PAYMENT_CONFIRMED");
    expect(redigido.dateCreated).toBe("2026-09-01 16:45:03");
    // dateCreated continua string (Pitfall 6: metadado do fornecedor, nao fato de billing).
    expect(typeof redigido.dateCreated).toBe("string");

    expect(redigido.payment).toEqual({
      id: "pay_080225913252",
      status: "CONFIRMED",
      value: 29.9,
      dueDate: "2026-09-01",
      subscription: "sub_VXJBYgP2u0eO",
      externalReference: "empresa-1",
      billingType: "CREDIT_CARD",
    });
  });

  it("sobre envelope de checkout preserva so id, status, customer e externalReference", () => {
    const redigido = redigirEnvelope(envelopeCheckout());

    expect(redigido.checkout).toEqual({
      id: "chk_7b2f4c8e9a1d",
      status: "PAID",
      customer: "cus_000006297983",
      externalReference: "empresa-1",
    });

    const serializado = JSON.stringify(redigido);
    expect(serializado).not.toContain("cpfCnpj");
    expect(serializado).not.toContain("customerData");
  });

  it("sobre entrada que nao e objeto devolve {} sem lancar", () => {
    expect(() => redigirEnvelope("nao e objeto")).not.toThrow();
    expect(redigirEnvelope("nao e objeto")).toEqual({});
    expect(redigirEnvelope(null)).toEqual({});
    expect(redigirEnvelope(undefined)).toEqual({});
    expect(redigirEnvelope(42)).toEqual({});
  });

  it("e allowlist, nao denylist: um campo sensivel novo do Asaas nao vaza", () => {
    // Simula o Asaas adicionando um campo sensivel que nenhuma denylist previu.
    const envelope = envelopePagamento();
    const payment = (envelope as { payment: Record<string, unknown> }).payment;
    payment.campoSensivelInventadoAmanha = "SEGREDO-NAO-PREVISTO";
    (envelope as Record<string, unknown>).outroCampoNovoNoTopo = "TAMBEM-SEGREDO";

    const serializado = JSON.stringify(redigirEnvelope(envelope));

    expect(serializado).not.toContain("SEGREDO-NAO-PREVISTO");
    expect(serializado).not.toContain("TAMBEM-SEGREDO");
  });
});

describe("EVENTOS_ASSINADOS", () => {
  it("contem exatamente os 12 eventos registrados no Asaas", () => {
    expect(EVENTOS_ASSINADOS).toHaveLength(12);

    expect(EVENTOS_ASSINADOS.filter((e) => e.startsWith("CHECKOUT_"))).toHaveLength(3);
    expect(EVENTOS_ASSINADOS.filter((e) => e.startsWith("SUBSCRIPTION_"))).toHaveLength(3);
    expect(EVENTOS_ASSINADOS.filter((e) => e.startsWith("PAYMENT_"))).toHaveLength(6);

    expect(EVENTOS_ASSINADOS).toContain("PAYMENT_CONFIRMED");
    expect(EVENTOS_ASSINADOS).toContain("PAYMENT_OVERDUE");
    expect(EVENTOS_ASSINADOS).toContain("CHECKOUT_PAID");
    expect(EVENTOS_ASSINADOS).toContain("SUBSCRIPTION_CREATED");
  });
});

describe("fixtures (nao-vacuidade e Pitfall 8)", () => {
  it("envelopePagamento contem os campos sensiveis que tornam o teste de redacao real", () => {
    const serializado = JSON.stringify(envelopePagamento());

    expect(serializado).toContain("creditCard");
    expect(serializado).toContain("cpfCnpj");
  });

  it("checkout.subscription NAO tem id — o sub_... so vem no SUBSCRIPTION_CREATED (Pitfall 8)", () => {
    const envelope = envelopeCheckout();
    const checkout = (envelope as { checkout: Record<string, unknown> }).checkout;
    const assinaturaDoCheckout = checkout.subscription as Record<string, unknown>;

    expect(assinaturaDoCheckout).not.toHaveProperty("id");
    expect(assinaturaDoCheckout).toHaveProperty("cycle");

    // O id real da assinatura vem por outro evento.
    const assinatura = envelopeAssinatura();
    expect(
      (assinatura as { subscription: Record<string, unknown> }).subscription.id
    ).toBe("sub_VXJBYgP2u0eO");
  });
});
