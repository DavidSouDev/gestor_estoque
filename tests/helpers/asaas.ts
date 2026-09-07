/**
 * Fixtures de envelope de webhook do Asaas, reusaveis por toda a Fase 03.
 *
 * Formato de factory com overrides, espelhando `tests/helpers/fixtures.ts`.
 *
 * IMPORTANTE — nao-vacuidade dos testes de redacao: `envelopePagamento()` inclui
 * DELIBERADAMENTE os campos sensiveis que `redigirEnvelope` precisa remover
 * (`creditCard`, `customerData.cpfCnpj`, `invoiceUrl`, `transactionReceiptUrl`,
 * `pixTransaction`, `bankSlipUrl`). Sem eles no fixture, o teste de redacao passaria
 * trivialmente mesmo com uma implementacao quebrada. Nao remova esses campos.
 */

/** Envelope de exemplo do Asaas — estrutura em docs.asaas.com/docs/webhook-para-cobrancas. */
export type EnvelopeAsaas = Record<string, unknown>;

/**
 * `PAYMENT_CONFIRMED` — o evento que efetivamente estende o acesso (GTW-03).
 * Contem campos sensiveis de proposito (ver nota de nao-vacuidade acima).
 */
export function envelopePagamento(
  overrides: Partial<EnvelopeAsaas> = {}
): EnvelopeAsaas {
  return {
    id: "evt_05b708f961d739ea7eba7e4db318f621&368604920",
    event: "PAYMENT_CONFIRMED",
    dateCreated: "2026-09-01 16:45:03",
    account: { id: "47ed0d25-0000-0000-0000-000000000000", ownerId: null },
    payment: {
      object: "payment",
      id: "pay_080225913252",
      subscription: "sub_VXJBYgP2u0eO",
      customer: "cus_000006297983",
      status: "CONFIRMED",
      dueDate: "2026-09-01",
      value: 29.9,
      netValue: 28.52,
      billingType: "CREDIT_CARD",
      externalReference: "empresa-1",
      // --- Abaixo: dados sensiveis que NUNCA podem ser persistidos (GTW-01, Pitfall 9) ---
      creditCard: {
        creditCardNumber: "8829",
        creditCardBrand: "MASTERCARD",
        creditCardToken: "a75a1d98-c52d-4a6b-a413-71e00b193c99",
      },
      customerData: {
        name: "Fulano de Tal",
        cpfCnpj: "12345678901",
        email: "fulano@example.com",
        phone: "11999999999",
        postalCode: "01310100",
        address: "Avenida Paulista",
      },
      pixTransaction: { id: "pixt_123", qrCode: "00020126..." },
      pixQrCodeId: "pixqr_123",
      bankSlipUrl: "https://asaas.com/b/pdf/080225913252",
      invoiceUrl: "https://asaas.com/i/080225913252",
      transactionReceiptUrl: "https://asaas.com/comprovantes/080225913252",
    },
    ...overrides,
  };
}

/**
 * `CHECKOUT_PAID`.
 *
 * ARMADILHA REPRODUZIDA DE PROPOSITO (Pitfall 8): `checkout.subscription` contem
 * apenas a CONFIGURACAO da recorrencia (`cycle`, `nextDueDate`, `endDate`) e
 * **nao** o id `sub_...` da assinatura criada. Qualquer codigo que tente ler
 * `checkout.subscription.id` deve falhar em teste, nao em producao.
 * O `sub_...` real chega pelo evento `SUBSCRIPTION_CREATED`.
 */
export function envelopeCheckout(
  overrides: Partial<EnvelopeAsaas> = {}
): EnvelopeAsaas {
  return {
    id: "evt_ch_9f1c2b3a4d5e6f7a8b9c0d1e2f3a4b5c&368604921",
    event: "CHECKOUT_PAID",
    dateCreated: "2026-09-01 16:44:10",
    account: { id: "47ed0d25-0000-0000-0000-000000000000", ownerId: null },
    checkout: {
      id: "chk_7b2f4c8e9a1d",
      customer: "cus_000006297983",
      status: "PAID",
      externalReference: "empresa-1",
      // Pitfall 8: SEM `id` aqui — so configuracao da recorrencia.
      subscription: {
        cycle: "MONTHLY",
        nextDueDate: "2026-10-01",
        endDate: null,
      },
      // Campos sensiveis/irrelevantes que a redacao deve descartar.
      customerData: {
        name: "Fulano de Tal",
        cpfCnpj: "12345678901",
        email: "fulano@example.com",
      },
      link: "https://asaas.com/checkoutSession/show?id=chk_7b2f4c8e9a1d",
    },
    ...overrides,
  };
}

/**
 * `SUBSCRIPTION_CREATED` — a unica origem confiavel do id `sub_...` (Pitfall 8).
 */
export function envelopeAssinatura(
  overrides: Partial<EnvelopeAsaas> = {}
): EnvelopeAsaas {
  return {
    id: "evt_sub_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d&368604922",
    event: "SUBSCRIPTION_CREATED",
    dateCreated: "2026-09-01 16:44:12",
    account: { id: "47ed0d25-0000-0000-0000-000000000000", ownerId: null },
    subscription: {
      object: "subscription",
      id: "sub_VXJBYgP2u0eO",
      customer: "cus_000006297983",
      status: "ACTIVE",
      externalReference: "empresa-1",
      cycle: "MONTHLY",
      value: 29.9,
      nextDueDate: "2026-10-01",
      billingType: "CREDIT_CARD",
    },
    ...overrides,
  };
}
