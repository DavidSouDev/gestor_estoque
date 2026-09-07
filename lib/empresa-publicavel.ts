import { avaliarAcesso, podePublicarCatalogo, type FatosDeAcesso } from "@/lib/avaliar-acesso";

/**
 * Módulo NEUTRO de propósito.
 *
 * Ele existe fora de `app/services/empresa.service.ts` porque `produto.service`
 * e `combo.service` precisam da mesma projeção e do mesmo predicado para gatear
 * suas leituras por id — e `empresa.service` já importa `produtoService`,
 * `comboService` e `promocaoService`. Publicar daqui é o que evita o ciclo de
 * import.
 */

/**
 * Projeção mínima para decidir publicação: o `id` (o que o chamador realmente
 * quer) mais os 4 fatos de billing (BILL-01).
 *
 * O status NÃO é filtrado em SQL. Escrever `WHERE acessoAte > now()` duplicaria
 * a regra de negócio de `avaliarAcesso` e a aritmética de fuso de
 * `meiaNoiteEmSaoPaulo` dentro do banco, violando BILL-01, e apagaria D-03 (a
 * carência continua publicando o catálogo, e um `WHERE` ingênuo a derrubaria).
 */
export const EMPRESA_PUBLICAVEL_SELECT = {
  id: true,
  acessoAte: true,
  trialFim: true,
  canceladoEm: true,
  acessoVitalicio: true,
} as const;

/** O que `EMPRESA_PUBLICAVEL_SELECT` devolve, tipado. */
export interface FatosPublicaveis extends FatosDeAcesso {
  id: string;
}

/**
 * ACC-03 / D-07. Decide em MEMÓRIA, sobre uma linha já lida, se o catálogo
 * daquela empresa pode ser servido.
 *
 * `null` / `undefined` devolvem `false`: "não existe", "removida por soft
 * delete" e "bloqueada" convergem no mesmo desfecho, e é isso que torna os três
 * indistinguíveis para um visitante anônimo (T-04-01).
 *
 * PROIBIDO envolver qualquer leitura que chegue aqui em `unstable_cache` ou
 * `'use cache'` (T-04-08): os dois são cross-request. A empresa paga, o webhook
 * da Fase 3 estende `acessoAte`, e o catálogo continuaria fora do ar até o cache
 * expirar — ACC-04 quebrado. Só `React.cache` (por request) é permitido, que é
 * a decisão `[01-02]` do STATE.md aplicada ao catálogo.
 */
export function empresaPodePublicar(
  empresa: FatosDeAcesso | null | undefined,
  agora: Date
): boolean {
  if (!empresa) {
    return false;
  }

  return podePublicarCatalogo(avaliarAcesso(empresa, agora).status);
}
