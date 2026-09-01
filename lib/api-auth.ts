import { AuthTokenPayload, verifyAuthToken } from "@/lib/jwt";
import { revalidarConta } from "@/lib/auth-guard";
import { acessoBloqueado } from "@/lib/avaliar-acesso";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Código HTTP devolvido quando o acesso é negado EXCLUSIVAMENTE porque a
 * assinatura venceu.
 *
 * 402 Payment Required é o mais específico para esse caso, em oposição a 403
 * Forbidden — que significa "autenticado, mas sem permissão", uma situação em
 * que pagar não resolveria nada. Aqui o chamador já está autenticado como a
 * própria empresa inadimplente, então esta resposta não vaza nada sobre outro
 * tenant, e D-05 pede um erro claro em vez de um 401 ambíguo.
 *
 * Ressalva honesta: a MDN ainda classifica 402 como não-padrão / reservado para
 * uso futuro, sem convenção acordada entre implementações. Isto é decisão do
 * planner, não fato normativo — trocar para 403 custa esta linha e nada mais,
 * porque os 29 handlers de `app/api` propagam `error.status` genericamente.
 */
export const STATUS_ASSINATURA_SUSPENSA = 402;

/**
 * Opções de `requireAuth`. Hoje existe exatamente uma.
 */
export interface OpcoesDeAuth {
  /**
   * Deixa passar empresa suspensa por falta de pagamento. Existe para UM caso e
   * só um: o endpoint de checkout.
   *
   * Bloquear o caminho de pagamento junto com o resto tranca o cliente do lado
   * de fora sem como voltar — ele quer pagar e literalmente não consegue
   * (Pitfall 1 / T-04-10). É uma negação de serviço auto-infligida, e
   * contraintuitiva justamente porque o gate foi feito para ser total.
   *
   * Qualquer SEGUNDA ocorrência desta flag no código de produção é um bug. O
   * gate de grep do plano 04-09 prova que a ocorrência é única (T-04-13).
   *
   * A flag dispensa a checagem de assinatura e SÓ ela: conta inativa, empresa
   * removida e erro de banco continuam recusados, com 401.
   */
  permitirEmpresaBloqueada?: boolean;
}

/**
 * Guarda de autenticação de todas as rotas `app/api/*`.
 *
 * Além de verificar a assinatura do Bearer token, confirma no banco que a
 * conta ainda existe e está ativa — a janela de 7 dias do JWT não autoriza
 * sozinha. O banco só é consultado depois de a assinatura ser válida, para
 * que a auth não vire vetor de carga no Postgres.
 *
 * O retorno continua sendo o payload do token (não a conta fresca): a
 * assinatura pública é consumida por todas as rotas. Quem precisar dos dados
 * frescos chama `revalidarConta` diretamente — sai de graça, o `React.cache`
 * já tem o resultado no mesmo request.
 *
 * ---
 *
 * ACC-02: confirmada a conta, a assinatura da empresa também é conferida, e uma
 * empresa suspensa recebe `STATUS_ASSINATURA_SUSPENSA`. Isso cobre as 43
 * chamadas desta função sem editar um único dos 29 handlers, porque todos eles
 * já devolvem `{ status: error.status }` — nenhum hardcoda 401.
 *
 * O segundo parâmetro tem default `{}` de propósito: é o que torna a guarda
 * fail-CLOSED, de modo que uma rota nova nasça protegida sem ninguém lembrar de
 * nada. O anti-padrão descartado foi criar um `requireAuthComAssinatura`
 * separado e adotá-lo rota a rota: aquilo é fail-OPEN por default, e a próxima
 * rota escrita nasceria sem gate.
 *
 * ACC-04 (reativação automática): o status é derivado por `revalidarConta` a
 * cada request e memoizado apenas por `React.cache`, que é por request e nunca
 * cross-request. Consequência desejada: assim que o webhook estende `acessoAte`
 * no banco, o MESMO Bearer token que acabou de ser recusado volta a ser aceito
 * no request seguinte — sem novo login, sem invalidar nada à mão, sem esperar
 * expirar cache nenhum. Envolver esta leitura em `unstable_cache` ou em
 * `'use cache'` congelaria a autorização e quebraria exatamente essa
 * propriedade (T-04-08); a decisão `[01-02]` do STATE.md já proíbe.
 *
 * `POST /api/webhooks/asaas` fica fora desta guarda por construção, não por
 * exceção: ele não passa por aqui, autentica com comparação resistente a tempo
 * do seu próprio token (D-05). Um webhook de pagamento gateado por status de
 * pagamento seria um impasse — a empresa bloqueada nunca poderia ser
 * desbloqueada.
 */
export async function requireAuth(
  request: Request,
  opcoes: OpcoesDeAuth = {}
): Promise<AuthTokenPayload> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new AuthError("Não autenticado.");
  }

  let payload: AuthTokenPayload;

  try {
    payload = await verifyAuthToken(token);
  } catch {
    throw new AuthError("Token inválido ou expirado.");
  }

  const conta = await revalidarConta(payload.sub, payload.empresaId);

  if (!conta) {
    // Mensagem única e genérica: cobre conta inativa, empresa removida E erro
    // de banco (D-01). Não vazar qual dos três é ao cliente.
    throw new AuthError("Sessão inválida.", 401);
  }

  // ACC-02 / D-06: os dois rótulos de suspensão são tratados igual; a distinção
  // entre eles é trilha de auditoria, nunca regra de acesso. Fica DEPOIS da
  // revalidação de propósito — o opt-out abaixo nunca dispensa o 401.
  if (!opcoes.permitirEmpresaBloqueada && acessoBloqueado(conta.statusAcesso)) {
    throw new AuthError(
      "Assinatura suspensa por falta de pagamento.",
      STATUS_ASSINATURA_SUSPENSA
    );
  }

  return payload;
}
