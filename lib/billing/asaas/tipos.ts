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
  /**
   * Definido por nós como `empresaId`. Serve só como cross-check — e a
   * homologação do plano 03-07 provou que aqui ele vem SEMPRE `null`: a
   * referência externa do checkout NÃO propaga para as cobranças (A3 refutada).
   */
  externalReference?: string | null;
  billingType?: string | null;
  /**
   * Id do checkout que originou a cobrança. **É a única ponte confiável de volta
   * ao nosso mapa local** quando a assinatura ainda não foi capturada.
   *
   * Descoberto na homologação contra o sandbox (03-07): sem ele, a primeira
   * cobrança de um checkout recorrente é indissolúvel — `externalReference` vem
   * nulo e o mapa por `sub_…` só existe depois de `SUBSCRIPTION_CREATED`, que
   * por sua vez chega DEPOIS do pagamento. Ver `resolverEmpresaId`.
   */
  checkoutSession?: string | null;
}

/** Assinatura recorrente criada pelo checkout. */
export interface AsaasSubscription {
  id: string;
  customer: string;
  status: string;
  cycle: string;
  nextDueDate: string;
  /** Também sempre `null` na prática — ver a nota em `AsaasPayment` (A3). */
  externalReference?: string | null;
  /** Id do checkout que criou a assinatura. Mesma ponte de `AsaasPayment`. */
  checkoutSession?: string | null;
}

/**
 * Webhook registrado no Asaas (`GET`/`POST`/`PUT` em `/webhooks`).
 *
 * `authToken` NÃO é declarado de propósito: ele volta na resposta do Asaas, e
 * qualquer campo tipado aqui vira caminho possível para um `console.log` ou uma
 * persistência acidental do segredo (T-03-44). Sem tipo, o compilador recusa.
 */
export interface AsaasWebhook {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  interrupted: boolean;
  apiVersion: number;
  sendType: string;
  events: string[];
  /**
   * Contador de entregas penalizadas — 15 consecutivas pausam a fila. Opcional
   * porque não aparece na documentação de referência do objeto: o script de
   * registro reporta "não informado" em vez de inventar um zero tranquilizador.
   */
  penalizedRequestsCount?: number | null;
}

/** Envelope de listagem paginada do Asaas. */
export interface AsaasLista<T> {
  data: T[];
  hasMore?: boolean;
  totalCount?: number;
}

/**
 * Entrada de `criarWebhook`/`atualizarWebhook`.
 *
 * `sendType` é do chamador (o script de registro), não default do cliente: a
 * escolha do modo de entrega é decisão de operação, e escondê-la num default
 * aqui a tornaria invisível para quem lê o script.
 */
export interface RegistrarWebhookInput {
  name: string;
  url: string;
  /** Endereço que recebe o aviso do Asaas quando a fila de entrega pausa. */
  email: string;
  authToken: string;
  sendType: string;
  events: readonly string[];
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
