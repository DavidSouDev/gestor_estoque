/**
 * Validacao e redacao do payload de webhook do Asaas.
 *
 * ============================================================================
 * REGRA ESTRUTURANTE DESTE ARQUIVO — leia antes de alterar qualquer schema.
 * ============================================================================
 *
 * O Asaas avisa formalmente que novos atributos entram no payload sem aviso
 * previo, e que excecoes causadas por isso INTERROMPEM A FILA DE SINCRONIZACAO:
 *
 *   "e possivel que novos atributos sejam incluidos no Webhook. E muito
 *    importante que seu codigo esteja preparado para nao gerar excecoes...
 *    pois isso podera causar interrupcao na fila de sincronizacao"
 *   — docs.asaas.com/docs/webhook-para-cobrancas
 *
 * O custo concreto: 15 falhas consecutivas pausam a fila, e eventos parados por
 * mais de 14 dias sao APAGADOS PERMANENTEMENTE. Um cliente que pagou nunca teria
 * `acessoAte` estendido e seria bloqueado por um defeito nosso.
 *
 * Consequencias inegociaveis:
 *   1. Nenhum schema deste arquivo usa modo estrito (nem o metodo encadeado,
 *      nem `z.strictObject`).
 *   2. Nenhum consumidor usa a variante de parse que LANCA — apenas `safeParse`,
 *      que devolve `{ success: false }` em vez de lancar.
 *   3. Cada schema declara SO os campos que o processamento realmente consome.
 *
 * As regras 1 e 2 sao verificadas por gate de grep no plano 03-03, entao a
 * propria prosa destes comentarios evita as sequencias literais correspondentes:
 * o gate precisa continuar sendo um sinal real sobre o codigo.
 *
 * Os schemas existem para ESTREITAR TIPO, nao para policiar o fornecedor.
 *
 * Nota sobre o modo dos objetos: usamos `z.object()`, que no zod 4 e nao-estrito
 * (campos desconhecidos NAO invalidam — e o que a regra acima exige) e ainda
 * remove os campos desconhecidos do resultado. Essa remocao e defesa em
 * profundidade para GTW-01: mesmo que um valor parseado vaze para um log, ele
 * nao carrega PII que o Asaas tenha adicionado sem aviso.
 */
import { z } from "zod";

/** Envelope minimo comum a todo evento. Nada alem disto e obrigatorio. */
export const envelopeSchema = z.object({
  id: z.string(),
  event: z.string(),
});

/** Objeto `payment`. `dueDate` e obrigatorio: GTW-03 deriva `acessoAte` dele. */
export const pagamentoSchema = z.object({
  id: z.string(),
  status: z.string(),
  dueDate: z.string(),
  subscription: z.string().nullish(),
  customer: z.string().nullish(),
  externalReference: z.string().nullish(),
  billingType: z.string().nullish(),
  value: z.number().nullish(),
});

/** Objeto `checkout`. Ver Pitfall 8: `checkout.subscription` NAO traz o `sub_...`. */
export const checkoutSchema = z.object({
  id: z.string(),
  status: z.string(),
  customer: z.string().nullish(),
  externalReference: z.string().nullish(),
});

/** Objeto `subscription`. Unica origem confiavel do id `sub_...` (Pitfall 8). */
export const assinaturaSchema = z.object({
  id: z.string(),
  customer: z.string(),
  status: z.string(),
  externalReference: z.string().nullish(),
});

/**
 * Os 12 eventos registrados no Asaas pelo plano 03-07.
 *
 * ATENCAO: esta lista NAO e um filtro de rejeicao. Um evento fora dela e
 * registrado no ledger e respondido com 200 + log — nunca com erro. Eventos
 * novos aparecem sem aviso, e rejeita-los reintroduziria exatamente a falha
 * que pausa a fila de sincronizacao.
 */
export const EVENTOS_ASSINADOS = [
  "CHECKOUT_PAID",
  "CHECKOUT_EXPIRED",
  "CHECKOUT_CANCELED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_INACTIVATED",
  "SUBSCRIPTION_DELETED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
] as const satisfies readonly string[];

/** Campos do topo do envelope que podem ser persistidos. */
const CAMPOS_TOPO = ["id", "event", "dateCreated"] as const;

/** Campos de `payment` que a Fase 5 reconcilia — e mais nenhum. */
const CAMPOS_PAGAMENTO = [
  "id",
  "status",
  "value",
  "dueDate",
  "subscription",
  "externalReference",
  "billingType",
] as const;

/** Campos de `checkout` permitidos. */
const CAMPOS_CHECKOUT = [
  "id",
  "status",
  "customer",
  "externalReference",
] as const;

/** Campos de `subscription` permitidos. */
const CAMPOS_ASSINATURA = [
  "id",
  "status",
  "customer",
  "externalReference",
] as const;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Copia do objeto de origem apenas as chaves permitidas que existem. */
function copiarPermitidos(
  origem: unknown,
  permitidos: readonly string[]
): Record<string, unknown> | undefined {
  if (!ehObjeto(origem)) return undefined;

  const destino: Record<string, unknown> = {};
  for (const chave of permitidos) {
    if (origem[chave] !== undefined) destino[chave] = origem[chave];
  }
  return destino;
}

/**
 * Devolve uma versao do envelope segura para persistir e logar.
 *
 * ============================================================================
 * ALLOWLIST POSITIVA — NUNCA DENYLIST. Nao inverta esta logica.
 * ============================================================================
 *
 * Constroi um objeto NOVO copiando apenas as chaves explicitamente permitidas.
 * Nada e "removido"; o que nao esta na lista simplesmente nunca e copiado.
 *
 * Por que allowlist: uma denylist FALHA ABERTA. No dia em que o Asaas adicionar
 * um campo sensivel novo — e a doc deles diz que isso vai acontecer sem aviso —
 * a denylist nao o conhece e o deixa passar. O custo desse erro nao e um bug
 * comum: e dado de cartao e CPF/CNPJ dentro do nosso banco e dos nossos backups,
 * de forma permanente, violando GTW-01 diretamente (Pitfall 9).
 *
 * Campos que ficam de fora por construcao: `creditCard`, `customerData`
 * (CPF/CNPJ, endereco, telefone), `pixTransaction`, `pixQrCodeId`,
 * `bankSlipUrl`, `invoiceUrl`, `transactionReceiptUrl` — e tudo que o Asaas
 * inventar depois.
 *
 * `dateCreated` permanece STRING, sem conversao para `Date`: e metadado do
 * fornecedor, nao fato de billing, e converte-lo aqui reintroduziria a
 * ambiguidade de fuso do Pitfall 6.
 */
export function redigirEnvelope(bruto: unknown): Record<string, unknown> {
  if (!ehObjeto(bruto)) return {};

  const seguro = copiarPermitidos(bruto, CAMPOS_TOPO) ?? {};

  const pagamento = copiarPermitidos(bruto.payment, CAMPOS_PAGAMENTO);
  if (pagamento) seguro.payment = pagamento;

  const checkout = copiarPermitidos(bruto.checkout, CAMPOS_CHECKOUT);
  if (checkout) seguro.checkout = checkout;

  const assinatura = copiarPermitidos(bruto.subscription, CAMPOS_ASSINATURA);
  if (assinatura) seguro.subscription = assinatura;

  return seguro;
}
