import { after } from "next/server";

/**
 * Agenda um efeito colateral para rodar **depois** que a resposta foi enviada.
 *
 * Por que `after` do `next/server` e não as alternativas:
 *
 * - **Não é um temporizador do runtime.** Em ambiente serverless a invocação é
 *   congelada assim que a resposta sai; qualquer trabalho pendente num
 *   temporizador morre junto com ela, sem log e sem retentativa.
 * - **Não é uma promise solta.** Uma promise disparada e não aguardada some do
 *   rastro de erro (vira `unhandledRejection` no melhor caso) e ninguém a drena
 *   no encerramento do processo.
 * - O Next, ao contrário dos dois, **drena os callbacks de `after` pendentes**
 *   no `SIGTERM`, e os executa mesmo quando o render falha, redireciona ou
 *   devolve 404 — exatamente a semântica que a trilha de auditoria precisa.
 *
 * O trabalho sai do caminho do response: escrever auditoria dentro do render de
 * um layout/page bloquearia o TTFB de toda tela do admin (T-02-17).
 *
 * `after` é estável desde o Next 15.1 — sem prefixo `unstable_` e sem flag
 * experimental.
 *
 * @param tarefa efeito assíncrono a executar após a resposta. Uma rejeição dela
 *   é sempre capturada e logada com prefixo `[acesso]`: a falha da auditoria
 *   **não pode** derrubar o request que a originou (ASVS V7).
 */
export function agendarPosResposta(tarefa: () => Promise<unknown>): void {
  // WR-01: `Promise.resolve().then(tarefa)` em vez de `tarefa()` direto —
  // `.then` também captura um `throw` SÍNCRONO de `tarefa`, não só uma promise
  // rejeitada. Sem isso, um throw síncrono escaparia de `seguro()` e, no
  // caminho de fallback (`void seguro()` abaixo), propagaria para dentro do
  // caller de `agendarPosResposta` — quebrando a garantia de "nunca derruba o
  // request" (ASVS V7).
  const seguro = () =>
    Promise.resolve()
      .then(tarefa)
      .catch((erro) =>
        console.error("[acesso] efeito pós-resposta falhou:", erro)
      );

  try {
    after(seguro);
  } catch (erro) {
    // Fora de escopo de request do Next (Vitest, worker HTTP da Fase 5, script
    // de manutenção) o `after` lança `E468` — "was called outside a request
    // scope" — porque o `AsyncLocalStorage` de que ele depende só existe
    // durante o processamento de um request. Executa inline em vez de perder o
    // efeito, e principalmente em vez de propagar a exceção para quem chamou.
    //
    // WR-02: qualquer OUTRA causa de falha de `after()` (bug interno do Next,
    // argumento inválido etc.) também cai neste fallback, mas nesse caso
    // estaríamos DENTRO de um request de verdade e silenciosamente perdendo a
    // garantia de que a auditoria roda fora do caminho crítico do response
    // (T-02-17). Loga para tornar essa anomalia observável em vez de mascará-la
    // do mesmo jeito que o caso esperado E468.
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (!mensagem.includes("outside a request scope")) {
      console.error(
        "[acesso] after() falhou por motivo inesperado, executando inline:",
        erro
      );
    }

    void seguro();
  }
}
