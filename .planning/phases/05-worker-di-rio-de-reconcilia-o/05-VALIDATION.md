---
phase: 5
slug: worker-di-rio-de-reconcilia-o
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-01
approved: 2026-09-01
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit/component) + Playwright 1.62.1 (e2e) |
| **Config file** | `vitest.config.mts` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run app/api/cron app/services/reconciliacao.service.test.ts lib/billing/cron-config.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30s (unit) |

Setup relevante: `tests/setup/vitest.setup.ts` → `tests/setup/prisma-mock.ts` (mock profundo de `PrismaClient`). Mockar `app/services/acesso.service` (não o Prisma bruto) para as asserções de "quem foi transicionado" — deixa a asserção legível e evita depender do shape interno do `$transaction`. `@vitest-environment node` obrigatório no handler (default do projeto é jsdom; precedente: webhook do Asaas).

---

## Sampling Rate

- **After every task commit:** `npx vitest run <arquivos de teste tocados>` (< 30s)
- **After every plan wave:** `npm test && npm run lint && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite verde + e2e + gate SQL do enum (`npx prisma db execute --file prisma/checks/worker-diario-enum.sql`) + `npm run gates:fase-04` + `npm run gates:fase-05`

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 05-01 | 1 | WRK-01 | T-05-11, T-05-12 | Migration enum-only: nenhum DML usa `WORKER_DIARIO` na mesma transação (Pitfall 7); causa própria e distinta na trilha de auditoria | grep + estático | `test -f prisma/checks/worker-diario-enum.sql && grep -q "WORKER_DIARIO" prisma/schema.prisma && ls prisma/migrations/*_add_worker_diario_causa/migration.sql` | ✅ existe | ✅ passed |
| 05-01-02 | 05-01 | 1 | WRK-01 | T-05-13 | O valor existe no catálogo do Postgres alvo, provado por `pg_enum`, e o Client regenerado o expõe | integração (Postgres real) | `npx prisma db execute --file prisma/checks/worker-diario-enum.sql && node -e "…CausaTransicaoAcesso.WORKER_DIARIO…" && npx tsc --noEmit && npm test` | ✅ existe | ✅ passed |
| 05-01-03 | 05-01 | 1 | WRK-01 | — | Nenhuma promessa órfã de dreno da fila `processadoEm IS NULL` sobrevive (D-06 / D-10) | unit + grep | `npx vitest run app/services/webhook-asaas.service.test.ts && npx prisma validate` | ✅ existe | ✅ passed |
| 05-02-01 | 05-02 | 1 | WRK-02 | T-05-03 | `cronSecret()` lança quando `CRON_SECRET` está ausente ou vazia; nunca coalesce para `""` (fail-closed) | unit | `npx vitest run lib/billing/cron-config.test.ts` | ✅ existe | ✅ passed |
| 05-02-02 | 05-02 | 1 | WRK-01, WRK-02 | T-05-04, T-05-09, T-05-15 | Passada pura: uma `avaliarAcesso` por empresa, zero I/O, relógio injetado; freio composto decidido antes de qualquer escrita; `ultimoStatusAuditado` só como comparador do CAS | estático + tipos | `npx tsc --noEmit && npm run lint` | ✅ existe | ✅ passed |
| 05-02-03 | 05-02 | 1 | WRK-02 | T-05-04, T-05-14, T-05-15 | Freio composto (>20% E ≥5) provado em ambas as direções; `BLOQUEADO→CANCELADO` fora do numerador (D-02); `TRIAL→CARENCIA` preservada com o freio armado (D-03); denominador zero sem `NaN` | unit (função pura) | `npx vitest run app/services/reconciliacao.service.test.ts` | ✅ existe | ✅ passed |
| 05-03-01 | 05-03 | 2 | WRK-01, WRK-02 | T-05-01, T-05-02, T-05-05, T-05-06, T-05-08, T-05-16, T-05-17 | Gate SHA-256 + `timingSafeEqual`; 401 sem corpo; um único `agora`; `deletedAt: null`; lotes de 5 com `allSettled`; resposta aguardada, nunca agendada | estático + tipos | `npx tsc --noEmit && npm run lint` | ✅ existe | ✅ passed |
| 05-03-02 | 05-03 | 2 | WRK-01, WRK-02 | T-05-01, T-05-02, T-05-07 | Sem header / segredo errado de mesmo comprimento / de outro comprimento → 401 sem query; trial vencido há 30 dias → UMA transição `TRIAL→BLOQUEADO` com causa `WORKER_DIARIO`; segunda execução sem escrita | unit | `npx vitest run app/api/cron/reconciliacao-diaria/route.test.ts` | ✅ existe | ✅ passed |
| 05-03-03 | 05-03 | 2 | WRK-01, WRK-02 | T-05-04, T-05-05, T-05-06, T-05-16 | Falha por empresa isolada em lote e entre lotes (D-05); `erros[]` só com `error.message` (D-04); contrato exato de chaves do corpo; freio ponta a ponta com o par acima/abaixo do limiar | unit | `npx vitest run app/api/cron/reconciliacao-diaria/route.test.ts` | ✅ existe | ✅ passed |
| 05-04-01 | 05-04 | 3 | WRK-02 | T-05-03, T-05-20 | `CRON_SECRET` existe no ambiente lido pela aplicação, com ≥16 caracteres, sem o valor aparecer em log ou no chat | integração (env) | `node -e "…loadEnvConfig… process.env.CRON_SECRET…"` | ✅ existe | ✅ passed |
| 05-04-02 | 05-04 | 3 | WRK-01 | T-05-18, T-05-21 | Flag `--auditado` produz transição pendente sem alterar o default; guarda de `NODE_ENV=production` intocada; CI e Playwright leem o mesmo segredo | unit + estático | `npx tsc --noEmit && npm run lint && npm test` | ✅ existe | ✅ passed |
| 05-04-03 | 05-04 | 3 | WRK-01 | — | Extração de `seedFatosBilling` não regride o e2e da Fase 4 | e2e (Postgres real) | `npm run test:e2e -- bloqueio-por-inadimplencia` | ✅ existe | ✅ passed |
| 05-04-04 | 05-04 | 3 | WRK-01, WRK-02 | T-05-04, T-05-07, T-05-21 | Contra Postgres real: 401 sem segredo e com segredo errado de mesmo comprimento; empresa sem request autenticado transicionada por uma chamada; segunda chamada sem transição | e2e (Postgres real) | `npm run test:e2e -- worker-reconciliacao` | ✅ existe | ✅ passed |
| 05-05-01 | 05-05 | 4 | WRK-01, WRK-02 | T-05-05, T-05-09, T-05-17, T-05-22, T-05-23, T-05-24, T-05-SC | Seis gates estáticos executáveis: neutralidade de plataforma, ausência de `agendarPosResposta` e do Asaas no worker, forma do handler, allowlist de `ultimoStatusAuditado`, contagem de pacotes | gate estático | `npm run gates:fase-05 && npm run gates:fase-04` | ✅ existe | ✅ passed |
| 05-05-02 | 05-05 | 4 | WRK-01, WRK-02 | todos | Suíte inteira verde no mesmo estado do repositório: lint, tipos, unit, e2e, os dois conjuntos de gates e o gate SQL do enum | gate de fase | `npm run lint && npx tsc --noEmit && npm test && npm run test:e2e && npm run gates:fase-04 && npm run gates:fase-05 && npx prisma db execute --file prisma/checks/worker-diario-enum.sql` | ✅ existe | ✅ passed |

Mapeamento requisito→comportamento completo em `05-RESEARCH.md` §Validation Architecture → Phase Requirements → Test Map (19 linhas). Registro de ameaças completo nos blocos `<threat_model>` dos cinco planos.

---

## Wave 0 Requirements

Os seis artefatos existem em disco (verificado por `ls` em 2026-09-01, no mesmo estado do
repositório em que os oito comandos de fechamento saíram verdes):

- [x] `lib/billing/cron-config.test.ts` — cobre o accessor fail-closed de `CRON_SECRET` (plano 05-02, task 05-02-01)
- [x] `app/services/reconciliacao.service.test.ts` — cobre o freio de segurança composto (20% + piso de 5) como função pura testável sem Postgres (plano 05-02, task 05-02-03)
- [x] `app/api/cron/reconciliacao-diaria/route.test.ts` — cobre WRK-02 (auth) e WRK-01 (aplicação de transições, isolamento por empresa, contrato de resposta) (plano 05-03, tasks 05-03-02 e 05-03-03)
- [x] `e2e/worker-reconciliacao.spec.ts` — end-to-end contra Postgres real, empresa semeada com transição **pendente** via a flag `--auditado` de `scripts/seed-fatos-billing.ts` (plano 05-04, tasks 05-04-02 e 05-04-04)
- [x] `prisma/checks/worker-diario-enum.sql` — gate SQL de regressão do valor de enum contra o banco real (plano 05-01, task 05-01-01)
- [x] `scripts/gates-fase-05.mjs` — os seis gates estáticos da fase (plano 05-05, task 05-05-01)
- [x] Instalação de framework: nenhuma — Vitest e Playwright já configurados, e a fase declara não instalar nenhum pacote (confirmado pelo Gate 6 dos DOIS conjuntos: 11 deps / 20 devDeps, iguais ao início da Fase 4)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Comportamento real atrás de um agendador externo (Vercel Cron ou crontab) | WRK-02 (critério de sucesso #3) | Depende de infraestrutura de deploy que não existe ainda neste projeto | Quando o hosting for decidido (fora desta fase, D-07), configurar o agendador real e confirmar uma execução disparada por ele, não só por `curl` manual. Confirmar no histórico um **200** com o corpo JSON esperado — nunca um 3xx (cron não segue redirect, e o job termina sem executar nada) nem um 404 (path errado ainda é cobrado e falha em silêncio) |
| Volume real de empresas nunca testado contra o freio composto | D-01 | Threshold escolhido (20% + piso 5) é uma estimativa; comportamento real só se confirma com dados de produção crescendo | Revisitar o piso absoluto quando a base de empresas crescer significativamente. `npm run acesso:contagem` imprime o TOTAL e a distribuição por status — é o insumo dessa revisão |
| `CRON_SECRET` no painel do host | WRK-02 | Nenhum host existe ainda (D-07) | No dia do deploy: criar a env var com o nome exato `CRON_SECRET` (no Vercel isso já faz o Cron enviar `Authorization: Bearer` automaticamente) e confirmar que o valor é o mesmo usado pelo agendador |
| **Execução disparada por um agendador REAL (verificação DIFERIDA ao dia do deploy)** | WRK-02 (critério de sucesso #3) | Continua **sem verificação** ao fim desta fase porque o hosting não existe (D-07). Tudo o que esta fase pôde provar é estático (`npm run gates:fase-05` Gate 1: nenhum acoplamento de plataforma em `app/`, `lib/`, e nenhum `vercel.json`) ou por `curl`/Playwright contra o dev server — nenhum dos dois exercita um agendador de verdade | No dia do deploy, nesta ordem: (1) configurar o agendador (Vercel Cron com `"crons"` no painel/projeto, ou um crontab de VPS com `curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://APP_BASE_URL/api/cron/reconciliacao-diaria`); (2) disparar UMA execução **por ele**, nunca por `curl` manual — é o disparo pela plataforma que está sendo verificado; (3) confirmar no histórico do agendador um **200** com o corpo JSON esperado (as sete chaves de D-04). Um **3xx** significa path com barra final ou redirect de host: o job termina sem executar nada e sem erro visível, porque cron não segue redirect. Um **404** significa path errado: a execução ainda é cobrada e falha em silêncio. Nenhum dos dois aparece como falha em lugar nenhum além desse histórico |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (2026-09-01) — `npm test` **916 testes em 89 arquivos**, `npm run test:e2e`
**24 specs**, `npx tsc --noEmit` **0**, `npm run lint` **0 erros**, `npm run gates:fase-04` **6/6**,
`npm run gates:fase-05` **6/6**. Números medidos, não estimados: transcritos da saída dos comandos
rodados no mesmo estado do repositório.

## Estado final da fase

Os oito comandos abaixo foram rodados **nesta ordem e no mesmo estado do repositório**, depois do
commit da task 05-05-01. Cada linha transcreve a saída real.

| # | Comando | Resultado |
|---|---------|-----------|
| 1 | `npm run lint` | exit 0 — 0 erros, 2 warnings (`app/registro/page.tsx` `Link` não usado, decisão registrada em 01-04; `app/services/reconciliacao.service.test.ts` `fatosDeTrial` não usado, vindo do plano 05-02) |
| 2 | `npx tsc --noEmit` | exit 0 — nenhuma saída |
| 3 | `npm test` | exit 0 — **916 testes passaram em 89 arquivos** (linha de base da Fase 4: 876 em 86; +40 testes e +3 arquivos vindos de 05-02, 05-03 e 05-04) |
| 4 | `npm run test:e2e` | exit 0 — **24 specs**, 23 verdes de primeira e 1 flaky (`e2e/combo-crud.spec.ts` "cria um combo com produto selecionado…", spec pré-existente da Fase 2, verde no retry). Linha de base da Fase 4: 22 specs; as 2 novas são de `e2e/worker-reconciliacao.spec.ts` |
| 5 | `npm run gates:fase-04` | exit 0 — **6/6 gates OK** |
| 6 | `npm run gates:fase-05` | exit 0 — **6/6 gates OK** |
| 7 | `npx prisma db execute --file prisma/checks/worker-diario-enum.sql` | exit 0 — `Script executed successfully.` (o `RAISE EXCEPTION` do gate não disparou: `WORKER_DIARIO` existe no `pg_enum` do banco alvo) |
| 8 | `npx prisma migrate status` | exit 0 — 10 migrations encontradas, `Database schema is up to date!`, nenhuma pendente |

Verificações pontuais das linhas do Per-Task Verification Map que não são cobertas por um comando
agregado acima:

| Linha | Verificação | Resultado |
|-------|-------------|-----------|
| 05-01-01 | `test -f prisma/checks/worker-diario-enum.sql && grep -q "WORKER_DIARIO" prisma/schema.prisma && ls prisma/migrations/*_add_worker_diario_causa/migration.sql` | exit 0 — `prisma/migrations/20260901195303_add_worker_diario_causa/migration.sql` |
| 05-01-02 | `CausaTransicaoAcesso.WORKER_DIARIO` exposto pelo Prisma Client | `WORKER_DIARIO` |
| 05-01-03 | `npx prisma validate` | `The schema at prisma/schema.prisma is valid` |
| 05-04-01 | `CRON_SECRET` no ambiente lido pela aplicação (`loadEnvConfig`) | presente, **64 caracteres** (≥16). O valor NÃO foi impresso — só o comprimento (T-05-20) |
