/**
 * Leitura do segredo que autentica o agendador externo contra o worker diário.
 *
 * DUPLICAÇÃO DELIBERADA: a helper `obrigatorio` abaixo é uma cópia local da que
 * existe em `lib/billing/asaas/config.ts`. Importá-la de lá acoplaria o worker
 * ao módulo das credenciais do gateway — um arquivo que, por D-06, o worker
 * inteiro não pode tocar (ele não chama o gateway, não reprocessa webhook e não
 * tem nenhuma razão para carregar `ASAAS_API_KEY` no mesmo grafo de módulos).
 * A helper tem 8 linhas; o acoplamento custaria mais do que a repetição.
 *
 * ACESSOR, não `const` de nível de módulo: `app/api/cron/reconciliacao-diaria/route.ts`
 * é importado pelo seu próprio `route.test.ts`, e um throw no import tornaria
 * impossível testar o caminho de 401 sem configurar o ambiente inteiro. Mesma
 * decisão registrada nas linhas 11-17 de `lib/billing/asaas/config.ts`. A
 * semântica fail-fast é preservada — muda o MOMENTO (primeira leitura em vez de
 * import), não a rigidez.
 *
 * FAIL-CLOSED e deliberado: com o segredo ausente o endpoint fica quebrado e
 * devolve 500, nunca 200. Coalescer para `""` seria fail-OPEN — a comparação
 * rodaria contra string vazia e qualquer requisição com `Bearer ` autenticaria.
 * É o defeito que a Fase 3 registrou não repetir (T-03-06 / T-05-03).
 */

function obrigatorio(nome: string): string {
  const valor = process.env[nome];

  // String vazia é tratada como ausente de propósito: `CRON_SECRET=` num
  // `.env` mal preenchido é indistinguível, na prática, de não ter o segredo.
  if (valor === undefined || valor === "") {
    throw new Error(`[cron] variável de ambiente ausente: ${nome}`);
  }

  return valor;
}

/**
 * Segredo estático compartilhado com o agendador (D-08).
 *
 * O nome `CRON_SECRET` não é escolha estética: é a env var que o Vercel Cron lê
 * para preencher automaticamente o header `Authorization: Bearer` da requisição
 * que dispara o job, e é trivial de reproduzir num crontab de VPS com
 * `curl -H "Authorization: Bearer $CRON_SECRET"`. Qualquer outro nome, ou um
 * header customizado, quebraria o critério de sucesso #3 desta fase ("funciona
 * igual nos dois hosts sem mudança de código").
 *
 * Como gerar: `openssl rand -hex 32`. O valor não vem de painel nenhum — é
 * nosso, e precisa existir no `.env` local, no env do job e2e do CI e no painel
 * do host quando o deploy acontecer (D-07 adia a escolha do host).
 */
export function cronSecret(): string {
  return obrigatorio("CRON_SECRET");
}
