import * as nextEnv from "@next/env";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Carrega o `.env` no PROCESSO DO PLAYWRIGHT, antes de qualquer outra coisa.
 *
 * Duas razões, nenhuma delas cosmética:
 *
 * (a) O spec do worker (`e2e/worker-reconciliacao.spec.ts`) monta o header
 *     `Authorization` a partir de `process.env.CRON_SECRET`, e o processo de
 *     teste não lê o `.env` sozinho — só o `next dev` que subimos abaixo lê. Sem
 *     esta linha, o servidor conhece o segredo e o teste não, e o spec recebe 401
 *     em toda chamada.
 *
 * (b) Tem que ser o MESMO leitor da aplicação (`@next/env`), e não `dotenv` ou
 *     `--env-file`. Ele passa o arquivo por `dotenv-expand`, que trata `$` como
 *     início de referência a outra variável: ler por outro caminho produz valores
 *     DIFERENTES para a mesma linha do arquivo. O cabeçalho de
 *     `scripts/resolvedor-ts.mjs` registra o incidente que custou horas de
 *     diagnóstico (a chave do Asaas virando string vazia dentro do `next dev`).
 *     Um único leitor elimina a classe inteira de bug.
 *
 * No CI a chamada é inerte: `.env` não existe lá, e o carregador não sobrescreve
 * variável já presente em `process.env` — o bloco `env:` do workflow, que define
 * `CRON_SECRET`, continua valendo.
 *
 * Import de namespace, e não default: `@next/env` é CommonJS empacotado com
 * `__esModule: true` e SEM `default`, então a forma default vira `undefined` sob
 * a transformação para CJS que o Playwright aplica a este arquivo (em `.mjs`
 * real, como no resolvedor, o loader do Node ignora aquela marca e a default
 * funciona — daí a diferença).
 */
nextEnv.loadEnvConfig(path.resolve(__dirname), true, { info: () => {}, error: console.error });

const PORT = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
