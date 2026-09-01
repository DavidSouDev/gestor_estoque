---
phase: 5
slug: worker-di-rio-de-reconcilia-o
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-01
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
| 05-01-01 | 05-01 | 1 | WRK-01 | T-05-11, T-05-12 | Migration enum-only: nenhum DML usa `WORKER_DIARIO` na mesma transação (Pitfall 7); causa própria e distinta na trilha de auditoria | grep + estático | `test -f prisma/checks/worker-diario-enum.sql && grep -q "WORKER_DIARIO" prisma/schema.prisma && ls prisma/migrations/*_add_worker_diario_causa/migration.sql` | ❌ Wave 0 | ⬜ pending |
| 05-01-02 | 05-01 | 1 | WRK-01 | T-05-13 | O valor existe no catálogo do Postgres alvo, provado por `pg_enum`, e o Client regenerado o expõe | integração (Postgres real) | `npx prisma db execute --file prisma/checks/worker-diario-enum.sql && node -e "…CausaTransicaoAcesso.WORKER_DIARIO…" && npx tsc --noEmit && npm test` | ❌ Wave 0 | ⬜ pending |
| 05-01-03 | 05-01 | 1 | WRK-01 | — | Nenhuma promessa órfã de dreno da fila `processadoEm IS NULL` sobrevive (D-06 / D-10) | unit + grep | `npx vitest run app/services/webhook-asaas.service.test.ts && npx prisma validate` | ✅ arquivo existe | ⬜ pending |
| 05-02-01 | 05-02 | 1 | WRK-02 | T-05-03 | `cronSecret()` lança quando `CRON_SECRET` está ausente ou vazia; nunca coalesce para `""` (fail-closed) | unit | `npx vitest run lib/billing/cron-config.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-02-02 | 05-02 | 1 | WRK-01, WRK-02 | T-05-04, T-05-09, T-05-15 | Passada pura: uma `avaliarAcesso` por empresa, zero I/O, relógio injetado; freio composto decidido antes de qualquer escrita; `ultimoStatusAuditado` só como comparador do CAS | estático + tipos | `npx tsc --noEmit && npm run lint` | ❌ Wave 0 | ⬜ pending |
| 05-02-03 | 05-02 | 1 | WRK-02 | T-05-04, T-05-14, T-05-15 | Freio composto (>20% E ≥5) provado em ambas as direções; `BLOQUEADO→CANCELADO` fora do numerador (D-02); `TRIAL→CARENCIA` preservada com o freio armado (D-03); denominador zero sem `NaN` | unit (função pura) | `npx vitest run app/services/reconciliacao.service.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-03-01 | 05-03 | 2 | WRK-01, WRK-02 | T-05-01, T-05-02, T-05-05, T-05-06, T-05-08, T-05-16, T-05-17 | Gate SHA-256 + `timingSafeEqual`; 401 sem corpo; um único `agora`; `deletedAt: null`; lotes de 5 com `allSettled`; resposta aguardada, nunca agendada | estático + tipos | `npx tsc --noEmit && npm run lint` | ❌ Wave 0 | ⬜ pending |
| 05-03-02 | 05-03 | 2 | WRK-01, WRK-02 | T-05-01, T-05-02, T-05-07 | Sem header / segredo errado de mesmo comprimento / de outro comprimento → 401 sem query; trial vencido há 30 dias → UMA transição `TRIAL→BLOQUEADO` com causa `WORKER_DIARIO`; segunda execução sem escrita | unit | `npx vitest run app/api/cron/reconciliacao-diaria/route.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-03-03 | 05-03 | 2 | WRK-01, WRK-02 | T-05-04, T-05-05, T-05-06, T-05-16 | Falha por empresa isolada em lote e entre lotes (D-05); `erros[]` só com `error.message` (D-04); contrato exato de chaves do corpo; freio ponta a ponta com o par acima/abaixo do limiar | unit | `npx vitest run app/api/cron/reconciliacao-diaria/route.test.ts` | ❌ Wave 0 | ⬜ pending |
| 05-04-01 | 05-04 | 3 | WRK-02 | T-05-03, T-05-20 | `CRON_SECRET` existe no ambiente lido pela aplicação, com ≥16 caracteres, sem o valor aparecer em log ou no chat | integração (env) | `node -e "…loadEnvConfig… process.env.CRON_SECRET…"` | ❌ Wave 0 | ⬜ pending |
| 05-04-02 | 05-04 | 3 | WRK-01 | T-05-18, T-05-21 | Flag `--auditado` produz transição pendente sem alterar o default; guarda de `NODE_ENV=production` intocada; CI e Playwright leem o mesmo segredo | unit + estático | `npx tsc --noEmit && npm run lint && npm test` | ✅ arquivo existe | ⬜ pending |
| 05-04-03 | 05-04 | 3 | WRK-01 | — | Extração de `seedFatosBilling` não regride o e2e da Fase 4 | e2e (Postgres real) | `npm run test:e2e -- bloqueio-por-inadimplencia` | ✅ arquivo existe | ⬜ pending |
| 05-04-04 | 05-04 | 3 | WRK-01, WRK-02 | T-05-04, T-05-07, T-05-21 | Contra Postgres real: 401 sem segredo e com segredo errado de mesmo comprimento; empresa sem request autenticado transicionada por uma chamada; segunda chamada sem transição | e2e (Postgres real) | `npm run test:e2e -- worker-reconciliacao` | ❌ Wave 0 | ⬜ pending |
| 05-05-01 | 05-05 | 4 | WRK-01, WRK-02 | T-05-05, T-05-09, T-05-17, T-05-22, T-05-23, T-05-24, T-05-SC | Seis gates estáticos executáveis: neutralidade de plataforma, ausência de `agendarPosResposta` e do Asaas no worker, forma do handler, allowlist de `ultimoStatusAuditado`, contagem de pacotes | gate estático | `npm run gates:fase-05 && npm run gates:fase-04` | ❌ Wave 0 | ⬜ pending |
| 05-05-02 | 05-05 | 4 | WRK-01, WRK-02 | todos | Suíte inteira verde no mesmo estado do repositório: lint, tipos, unit, e2e, os dois conjuntos de gates e o gate SQL do enum | gate de fase | `npm run lint && npx tsc --noEmit && npm test && npm run test:e2e && npm run gates:fase-04 && npm run gates:fase-05 && npx prisma db execute --file prisma/checks/worker-diario-enum.sql` | ✅ arquivo existe | ⬜ pending |

Mapeamento requisito→comportamento completo em `05-RESEARCH.md` §Validation Architecture → Phase Requirements → Test Map (19 linhas). Registro de ameaças completo nos blocos `<threat_model>` dos cinco planos.

---

## Wave 0 Requirements

- [ ] `lib/billing/cron-config.test.ts` — cobre o accessor fail-closed de `CRON_SECRET` (plano 05-02, task 05-02-01)
- [ ] `app/services/reconciliacao.service.test.ts` — cobre o freio de segurança composto (20% + piso de 5) como função pura testável sem Postgres (plano 05-02, task 05-02-03)
- [ ] `app/api/cron/reconciliacao-diaria/route.test.ts` — cobre WRK-02 (auth) e WRK-01 (aplicação de transições, isolamento por empresa, contrato de resposta) (plano 05-03, tasks 05-03-02 e 05-03-03)
- [ ] `e2e/worker-reconciliacao.spec.ts` — end-to-end contra Postgres real, empresa semeada com transição **pendente** via a flag `--auditado` de `scripts/seed-fatos-billing.ts` (plano 05-04, tasks 05-04-02 e 05-04-04)
- [ ] `prisma/checks/worker-diario-enum.sql` — gate SQL de regressão do valor de enum contra o banco real (plano 05-01, task 05-01-01)
- [ ] `scripts/gates-fase-05.mjs` — os seis gates estáticos da fase (plano 05-05, task 05-05-01)
- [ ] Instalação de framework: nenhuma — Vitest e Playwright já configurados, e a fase declara não instalar nenhum pacote

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Comportamento real atrás de um agendador externo (Vercel Cron ou crontab) | WRK-02 (critério de sucesso #3) | Depende de infraestrutura de deploy que não existe ainda neste projeto | Quando o hosting for decidido (fora desta fase, D-07), configurar o agendador real e confirmar uma execução disparada por ele, não só por `curl` manual. Confirmar no histórico um **200** com o corpo JSON esperado — nunca um 3xx (cron não segue redirect, e o job termina sem executar nada) nem um 404 (path errado ainda é cobrado e falha em silêncio) |
| Volume real de empresas nunca testado contra o freio composto | D-01 | Threshold escolhido (20% + piso 5) é uma estimativa; comportamento real só se confirma com dados de produção crescendo | Revisitar o piso absoluto quando a base de empresas crescer significativamente. `npm run acesso:contagem` imprime o TOTAL e a distribuição por status — é o insumo dessa revisão |
| `CRON_SECRET` no painel do host | WRK-02 | Nenhum host existe ainda (D-07) | No dia do deploy: criar a env var com o nome exato `CRON_SECRET` (no Vercel isso já faz o Cron enviar `Authorization: Bearer` automaticamente) e confirmar que o valor é o mesmo usado pelo agendador |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
