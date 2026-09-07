"use server";

import { getVerifiedSession } from "@/lib/session";
import { assinaturaService } from "@/app/services/assinatura.service";

/**
 * Cancelamento de assinatura acionável a partir da tela `/assinatura` (SUB-02).
 *
 * ## D-05 — esta função não tem, e não pode ganhar, um parâmetro de id
 *
 * `PITFALLS.md` § Pitfall 11 nomeia, palavra por palavra, o cenário que esta
 * assinatura de função existe para tornar impossível: *"Cancel-subscription
 * action taking an `assinaturaId` from the form body instead of deriving it
 * from `session.empresaId` → one company cancels another's plan"*.
 *
 * A defesa não é uma checagem — é uma AUSÊNCIA. O único argumento é o `slug`, e
 * ele serve exclusivamente para confirmar que a sessão pertence a ESTA empresa
 * antes de qualquer I/O. O `empresaId` sai de `getVerifiedSession()`, e o
 * identificador da assinatura no gateway é lido da própria Empresa lá dentro de
 * `assinaturaService.cancelar`. Nenhum identificador atravessa a fronteira
 * cliente→servidor.
 *
 * Proibido, e verificável por grep (gate estático candidato do plano 07-07):
 * um parâmetro, uma leitura de corpo de request, ou um campo de objeto de
 * entrada chamado `assinaturaId`, `asaasSubscriptionId`, `subscriptionId` ou
 * `customerId`. A aridade 1 é afirmada por teste
 * (`expect(cancelarAssinatura.length).toBe(1)`).
 *
 * Consequência direta, registrada no plano 07-04: o 404 que o Asaas devolve no
 * `DELETE` pode ser lido como "já removida" sem risco. A doc do fornecedor usa
 * o mesmo 404 para "não existe" e para "não pertence à conta autenticada", mas
 * o segundo caso é inalcançável por construção justamente porque o id nunca
 * veio daqui.
 *
 * ## Por que devolve estado em vez de terminar navegando
 *
 * Convenção INVERSA à de `iniciarPagamento` (`admin/_lib/assinatura-actions.ts`),
 * e a diferença é deliberada — não padronizar as duas depois. Lá o desfecho é
 * uma navegação para o checkout, e a chamada que a dispara precisa ficar FORA do
 * `try`, porque ela sinaliza LANÇANDO e o `catch` a engoliria — a navegação
 * simplesmente não aconteceria. Aqui o desfecho é uma mensagem que a view de
 * confirmação precisa renderizar EM LINHA, mantendo a tela aberta: fechá-la numa
 * falha leria como sucesso (T-07-30). Como esta função não navega em nenhum
 * caminho — nem importa o utilitário de navegação do `next/navigation` —, o
 * `try/catch` pode envolver tudo sem o risco que a outra convenção evita. É
 * também o que torna o gate estático "esta action nunca navega" verificável por
 * grep no plano 07-07.
 *
 * Sem `revalidatePath`: a re-renderização é disparada por `router.refresh()` no
 * cliente, e a page é dinâmica por construção (`cookies()` via
 * `requireAdminSession` + Prisma sem `unstable_cache`).
 *
 * A mensagem do gateway nunca chega ao usuário (T-04-16 / T-07-29): só as duas
 * strings genéricas abaixo, ambas literais da UI-SPEC § Error strings (E2 e E4).
 * O corpo de erro do Asaas pode carregar PII do pagador e fica só no log.
 */
export async function cancelarAssinatura(slug: string): Promise<{ error?: string }> {
  const session = await getVerifiedSession();

  // T-07-28: a divergência de tenant sai antes de qualquer I/O.
  if (!session || session.empresaSlug !== slug) {
    return { error: "Sessão inválida." };
  }

  try {
    await assinaturaService.cancelar(session.empresaId);
    return {};
  } catch (erro) {
    console.error("[assinatura] falha ao cancelar assinatura", erro);
    return { error: "Não foi possível cancelar agora. Tente novamente em instantes." };
  }
}
