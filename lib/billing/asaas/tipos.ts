/**
 * Tipos dos objetos do Asaas que este projeto consome.
 *
 * REGRA (GTW-01, T-03-08): declarar apenas os campos efetivamente usados, nunca
 * o DTO inteiro do fornecedor. Os payloads reais trazem dados do pagador —
 * bandeira e últimos dígitos do cartão, documento, endereço, telefone, URLs de
 * comprovante. Nada disso tem tipo aqui, e sem tipo não existe caminho acidental
 * para persistência ou para um log: o compilador recusa qualquer tentativa.
 */

/** Resposta de `POST /checkouts`. `link` pode vir nulo (Open Question #1). */
export interface AsaasCheckout {
  id: string;
  link: string | null;
  status: string;
}

/** Cobrança. `status` é o enum textual do Asaas (CONFIRMED, RECEIVED, ...). */
export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  /** Data-calendário `"YYYY-MM-DD"` — sempre passar por `comoDiaEmSaoPaulo`. */
  dueDate: string;
  /** Id `sub_…` da assinatura de origem, quando a cobrança é recorrente. */
  subscription?: string | null;
  /** Id `cus_…` do cliente no Asaas. Nunca é autoridade de autorização. */
  customer?: string | null;
  /** Definido por nós como `empresaId`; serve só como cross-check (A3). */
  externalReference?: string | null;
  billingType?: string | null;
}

/** Assinatura recorrente criada pelo checkout. */
export interface AsaasSubscription {
  id: string;
  customer: string;
  status: string;
  cycle: string;
  nextDueDate: string;
  externalReference?: string | null;
}

/** Entrada de `asaasClient.criarCheckout`, em termos do nosso domínio. */
export interface CriarCheckoutInput {
  empresaId: string;
  nomeItem: string;
  descricaoItem: string;
  valor: number;
  /** Formato `"YYYY-MM-DD HH:mm:ss"` — use `primeiraCobrancaEmSaoPaulo`. */
  nextDueDate: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
}
