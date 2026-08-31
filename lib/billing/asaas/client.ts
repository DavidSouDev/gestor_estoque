import { asaasApiKey, asaasApiUrl } from "./config";
import type {
  AsaasCheckout,
  AsaasPayment,
  AsaasSubscription,
  CriarCheckoutInput,
} from "./tipos";

/**
 * Cliente da API v3 do Asaas.
 *
 * É o ÚNICO arquivo do projeto que conhece a URL, o header de autenticação e o
 * formato de corpo do Asaas. Todo o resto fala com o gateway por aqui.
 */

/**
 * Uma chamada pendurada dentro de um `after()` prende a invocação serverless
 * até o limite da plataforma. O timeout é obrigatório, não opcional (T-03-09).
 */
const TIMEOUT_MS = 15_000;

/**
 * O corpo de erro do Asaas pode conter dados do pagador. Só um prefixo curto vai
 * para o log, o suficiente para diagnosticar sem virar retenção de PII (T-03-07).
 */
const MAX_CARACTERES_DE_LOG = 500;

export class AsaasApiError extends Error {
  status: number;
  codigos: string[];

  constructor(message: string, status: number, codigos: string[] = []) {
    super(message);
    this.name = "AsaasApiError";
    this.status = status;
    this.codigos = codigos;
  }
}

/** Erros do Asaas vêm como `{ errors: [{ code, description }] }`. */
function extrairCodigos(corpo: string): string[] {
  try {
    const json = JSON.parse(corpo) as { errors?: Array<{ code?: unknown }> };

    if (!Array.isArray(json?.errors)) {
      return [];
    }

    return json.errors
      .map((e) => e?.code)
      .filter((code): code is string => typeof code === "string");
  } catch {
    // Nem todo erro do gateway devolve JSON (502 de proxy, HTML de manutenção).
    return [];
  }
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const metodo = init?.method ?? "GET";

  // Lidos ANTES do try: uma variável de ambiente ausente é erro de configuração
  // e precisa subir como tal, não ser mascarada como falha de rede.
  const url = `${asaasApiUrl()}${caminho}`;
  const chave = asaasApiKey();

  let resposta: Response;

  try {
    resposta = await fetch(url, {
      ...init,
      headers: {
        // O header de autenticação da API é `access_token`. Não é um esquema de
        // bearer token, e mandar a chave em outro header devolve 401.
        access_token: chave,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (erro) {
    // Só o nome da exception, nunca a exception inteira: mensagens de rede podem
    // carregar a URL completa com query string.
    console.error(
      `[asaas] ${metodo} ${caminho} → falha de transporte`,
      erro instanceof Error ? erro.name : "desconhecida"
    );

    throw new AsaasApiError("Não foi possível falar com o gateway de pagamento.", 0);
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");

    console.error(
      `[asaas] ${metodo} ${caminho} → ${resposta.status}`,
      detalhe.slice(0, MAX_CARACTERES_DE_LOG)
    );

    throw new AsaasApiError(
      "Não foi possível falar com o gateway de pagamento.",
      resposta.status,
      extrairCodigos(detalhe)
    );
  }

  return (await resposta.json()) as T;
}

class AsaasClient {
  /**
   * Cria um checkout hospedado com assinatura recorrente.
   *
   * A captura do cartão acontece 100% nas páginas do Asaas (D-01/D-06): não há
   * — e não pode haver — nenhum método de tokenização neste cliente. É o que
   * mantém o projeto fora do escopo PCI SAQ-A-EP.
   */
  async criarCheckout(input: CriarCheckoutInput): Promise<AsaasCheckout> {
    const corpo = {
      // Recorrência exige cartão de crédito.
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 60,
      // Cross-check apenas (A3): a autorização vem sempre do mapa local.
      externalReference: input.empresaId,
      callback: {
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiredUrl: input.expiredUrl,
      },
      items: [
        {
          name: input.nomeItem,
          description: input.descricaoItem,
          quantity: 1,
          value: input.valor,
        },
      ],
      subscription: {
        cycle: "MONTHLY",
        // D-03: a primeira cobrança cai no fim do trial.
        nextDueDate: input.nextDueDate,
        // `endDate` é OMITIDO de propósito: assinatura aberta até o
        // cancelamento (SUB-02, Fase 7). Ver A5 do Assumptions Log da pesquisa
        // da Fase 3 — se o campo for obrigatório na prática, a criação falha
        // ruidosamente no primeiro teste de sandbox.
      },
    };

    return chamar<AsaasCheckout>("/checkouts", {
      method: "POST",
      body: JSON.stringify(corpo),
    });
  }

  async buscarPagamento(id: string): Promise<AsaasPayment> {
    return chamar<AsaasPayment>(`/payments/${id}`);
  }

  async buscarAssinatura(id: string): Promise<AsaasSubscription> {
    return chamar<AsaasSubscription>(`/subscriptions/${id}`);
  }
}

export const asaasClient = new AsaasClient();
