/**
 * Hook de resolução para rodar os scripts `.ts` deste diretório direto no Node.
 *
 * POR QUE ISTO EXISTE: o Node 22+ já executa TypeScript sozinho (type stripping
 * nativo), então nenhum runner precisou ser instalado — o `<threat_model>` do
 * plano 03-07 registra que esta fase não adiciona pacote nenhum. O que o Node
 * NÃO faz é as duas coisas que o resto do projeto assume:
 *
 *   1. resolver o alias `@/…` do `tsconfig.json` (a convenção de import do
 *      projeto: nenhum arquivo usa caminho relativo entre diretórios);
 *   2. adivinhar a extensão de um import relativo sem extensão — a resolução
 *      ESM é estrita, e `lib/billing/asaas/client.ts` importa `"./config"`.
 *
 * A alternativa seria reescrever os imports da `lib/` com extensão explícita só
 * para agradar um script de setup, ou duplicar o `fetch` do cliente do Asaas
 * dentro do script. As duas trocam uma dificuldade de execução por uma dívida
 * no código de produção; este arquivo mantém a dívida no lugar certo.
 *
 * Escopo: só é carregado via `--import` pelos scripts de `package.json`. Não
 * participa do build do Next, dos testes, nem do runtime da aplicação.
 */
// CommonJS: só a exportação default é confiável a partir de um `.mjs`.
import nextEnv from "@next/env";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(import.meta.dirname, "..");

/**
 * O `.env` é carregado pelo MESMO leitor que o `next dev` usa, de propósito —
 * não por `--env-file` do Node.
 *
 * Os dois discordam, e a divergência custou horas de diagnóstico na homologação
 * do plano 03-07: o `@next/env` passa o arquivo por `dotenv-expand`, que trata
 * `$` como início de referência a outra variável. Uma `ASAAS_API_KEY` do Asaas
 * começa com `$` (`$aact_…`), então dentro do Next ela virava STRING VAZIA — sem
 * erro, sem aviso — enquanto por `--env-file` chegava intacta. O sintoma era um
 * 502 que só existia atrás do `next dev` e desaparecia em qualquer teste isolado.
 * A correção no arquivo é escapar (`\$aact_…`), e aí o `--env-file` passava a
 * entregar a barra invertida literal — quebrando o script na direção oposta.
 *
 * Um único leitor elimina a classe inteira de bug: o que o script vê é, por
 * construção, o que a aplicação vê. Nenhum pacote novo entra por isto —
 * `@next/env` é o leitor de ambiente do próprio `next`, que já é dependência.
 */
nextEnv.loadEnvConfig(RAIZ, true, { info: () => {}, error: console.error });

/** Mesma ordem que o `moduleResolution: "bundler"` do tsconfig tentaria. */
const EXTENSOES = [".ts", ".tsx", ".js", "/index.ts", "/index.tsx"];

registerHooks({
  resolve(especificador, contexto, proximo) {
    const alvo = especificador.startsWith("@/")
      ? pathToFileURL(path.join(RAIZ, especificador.slice(2))).href
      : especificador;

    try {
      return proximo(alvo, contexto);
    } catch (erro) {
      if (erro?.code !== "ERR_MODULE_NOT_FOUND") throw erro;

      for (const extensao of EXTENSOES) {
        try {
          return proximo(alvo + extensao, contexto);
        } catch {
          // Próxima extensão. Se nenhuma resolver, o erro original sobe abaixo
          // — ele nomeia o especificador que o autor escreveu, não o candidato.
        }
      }

      throw erro;
    }
  },
});
