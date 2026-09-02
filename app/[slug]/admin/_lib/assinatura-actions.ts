"use server";

import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";
import { revalidarConta } from "@/lib/auth-guard";
import { acessoBloqueado } from "@/lib/avaliar-acesso";
import { assinaturaService } from "@/app/services/assinatura.service";

/**
 * Caminho de pagamento acionável a partir da UI do admin (D-01).
 *
 * Por que Server Action e não uma chamada do browser para
 * `POST /api/assinaturas/checkout`: `requireAuth` lê exclusivamente o cabeçalho
 * `Authorization: Bearer`, e a sessão do navegador é o cookie `admin_session`
 * com `httpOnly: true` — o JavaScript do cliente não tem como lê-lo e portanto
 * não tem como autenticar aquela rota. As duas saídas alternativas são piores:
 * expor o JWT ao JS do cliente é regressão de segurança direta, e ensinar
 * `requireAuth` a aceitar cookie amplia a superfície da função mais crítica do
 * sistema e abre um vetor de CSRF onde hoje não existe nenhum. Server Actions
 * já vêm com proteção de CSRF embutida (POST-only + comparação `Origin` vs
 * `Host`), então este é o formato que preserva o modelo de auth do projeto —
 * que, aliás, não tem NENHUMA chamada de rede partindo de client component.
 * (T-04-09; o endpoint da Fase 3 continua existindo e continua canônico, só
 * não é ele quem serve o botão.)
 */
export async function iniciarPagamento(slug: string): Promise<void> {
  // Deliberadamente a variante que NÃO bloqueia por status de acesso: esta é a
  // única superfície do admin que uma empresa suspensa ainda pode percorrer, e
  // barrá-la aqui trancaria o cliente do lado de fora sem meio de voltar —
  // exatamente o modo de falha que a fase existe para evitar (T-04-10).
  const session = await getVerifiedSession();

  // C-08 / T-04-17: o tenant sai da sessão e de mais lugar nenhum. O `FormData`
  // que o React entrega junto nunca é lido, e o `slug` da URL só serve para
  // confirmar que a sessão pertence a ESTA empresa antes de qualquer I/O.
  if (!session || session.empresaSlug !== slug) {
    redirect(`/${slug}/admin/login`);
  }

  let url: string | null = null;

  try {
    const checkout = await assinaturaService.criarCheckout(session.empresaId);
    url = checkout.url;
  } catch (erro) {
    // T-04-16: só o log do servidor. A mensagem do gateway não é repassada ao
    // usuário — ele vê uma frase genérica e a URL ganha apenas `?erro=checkout`.
    console.error("[assinatura] falha ao iniciar checkout", erro);
  }

  // FORA do `try` de propósito: `redirect()` sinaliza lançando `NEXT_REDIRECT`,
  // e o `catch` acima o engoliria — a navegação simplesmente não aconteceria.
  // Mesma convenção documentada em `lib/session.ts` e já seguida por `login`.
  redirect(url ?? `/${slug}/admin/bloqueado?erro=checkout`);
}

/**
 * Leitura autoritativa de "o painel já destravou?" para o polling pós-checkout
 * (D-01). Chamada por `PollerDeStatus` a cada tick do backoff.
 *
 * A pergunta NÃO é "a assinatura existe no gateway?" — são perguntas diferentes
 * e só esta importa. Três proibições, cada uma uma linha plausível que nenhum
 * teste pegaria:
 *
 * 1. `asaasClient` NÃO pode ser importado por este arquivo. O polling lê fatos
 *    LOCAIS. Consultar o gateway a cada tick multiplicaria 7 requests por
 *    pagador contra uma quota de 25.000/12 h (RESEARCH § Pitfall 3) e ainda
 *    responderia a pergunta errada: `Empresa.asaasSubscriptionId` está NULO
 *    justamente nos segundos em que esta action mais roda, porque a homologação
 *    [03-07] provou que `PAYMENT_CONFIRMED` chega ANTES de
 *    `SUBSCRIPTION_CREATED`, que é quem escreve o id (§ Achado 2). Consultar o
 *    gateway aqui é literalmente impossível nesse instante. Gate estático
 *    candidato do plano 07-07.
 *
 * 2. `ultimoStatusAuditado` NÃO pode ser lido. O status é sempre derivado por
 *    `avaliarAcesso` via `revalidarConta` (BILL-01); aquele campo é bookkeeping
 *    do compare-and-swap da auditoria, nunca fonte de decisão.
 *
 * 3. O booleano é derivado por `acessoBloqueado`, nunca por comparação de
 *    rótulo escrita à mão — comparar com `EM_DIA` por desigualdade derrubaria
 *    `TRIAL`, `CARENCIA` e `VITALICIO` junto (T-04-15).
 *
 * Devolve `{ liberado }`, e não o `StatusAcesso` cru: o cliente não tem — e não
 * pode ganhar — autoridade para reinterpretar o rótulo. É também o que mantém a
 * resposta sem nenhum fato de billing (T-07-07).
 */
export async function consultarStatusAcesso(slug: string): Promise<{ liberado: boolean }> {
  const session = await getVerifiedSession();

  // Devolve ESTADO, não `redirect()`: esta action é chamada por um `setTimeout`
  // de cliente, e um redirect a partir dali não teria destino coerente. O
  // `slug` só serve para confirmar que a sessão pertence a ESTA empresa —
  // nenhum id atravessa a fronteira cliente→servidor (T-07-06).
  if (!session || session.empresaSlug !== slug) {
    return { liberado: false };
  }

  const conta = await revalidarConta(session.sub, session.empresaId);

  // `revalidarConta` é fail-closed por construção: devolve `null` tanto para
  // conta revogada quanto para erro de banco. Traduzir isso em `false` é o que
  // impede o fail-open de T-07-11.
  if (!conta) {
    return { liberado: false };
  }

  return { liberado: !acessoBloqueado(conta.statusAcesso) };
}
