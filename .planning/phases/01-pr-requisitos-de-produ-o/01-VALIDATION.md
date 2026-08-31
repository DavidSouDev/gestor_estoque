---
phase: 1
slug: pr-requisitos-de-produ-o
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-31
gate_executed: 2026-08-31
human_checkpoint_approved: 2026-08-31
---

> **Estado deste documento (fechado pelo plano 01-05, Task 2):** todas as linhas do mapa
> abaixo — **automatizadas** (Task 1) e **manual** (Task 2) — estão verdes. A linha
> `01-01-03` foi preenchida com números reais de `pg_stat_activity` medidos pelo operador
> humano contra `npm run build` + `npm start` (**1 → 5 conexões**, teto compatível com um
> único pool), e não por inferência a partir de `lib/prisma.test.ts`.
> `nyquist_compliant` virou `true` somente depois disso, fechando o T-01-16.

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (jsdom default; auth files use `// @vitest-environment node`) + Playwright 1.62.1 for e2e |
| **Config file** | `vitest.config.mts` (setup: `tests/setup/vitest.setup.ts` → imports `tests/setup/prisma-mock.ts`); `playwright.config.ts` |
| **Quick run command** | `npx vitest run lib/` |
| **Full suite command** | `npm test` (unit/component) and `npm run test:e2e` (Playwright; requires Postgres) |
| **Estimated runtime** | ~10s quick / ~60-120s full unit suite / e2e requires live Postgres (CI provisions `postgres:16` service) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run lib/`
- **After every plan wave:** Run `npm test` (full suite — this is where cross-file regressions from the fail-closed change surface, per RESEARCH.md Pitfall 3: 14 existing test files break without a default active-account stub)
- **Before `/gsd-verify-work`:** `npm run lint && npm test && npm run test:e2e` must be green, plus a `checkpoint:human-verify` of Postgres connection stability (see Manual-Only Verifications)
- **Max feedback latency:** ~30s (unit tests require no live database — Prisma pool is lazy, Prisma client is mocked)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-W0 | 01 | 0 | INFRA-01 | — | `tests/setup/prisma-mock.ts` stubs an active-account default after `mockReset` so existing auth-dependent tests keep passing under fail-closed | unit | `npx vitest run` (full run, watch for regressions) | ✅ exists | ✅ green |
| 01-01-01 | 01 | 1 | INFRA-01 | — | Re-evaluating `lib/prisma.ts` under `NODE_ENV=production` returns the same client instance | unit | `npx vitest run lib/prisma.test.ts` | ✅ exists | ✅ green |
| 01-01-02 | 01 | 1 | INFRA-01 | — | Client is published on `globalThis` in production (not only in dev) | unit | `npx vitest run lib/prisma.test.ts` | ✅ exists | ✅ green |
| 01-01-03 | 01 | 1 | INFRA-01 | DoS (pool exhaustion) | Postgres connections remain stable under repeated load (Success Criterion #1) | manual | `pg_stat_activity` query before/after exercising admin + API | ✅ verificado (01-05 Task 2, 2026-08-31) | ✅ green — **1 → 5** conexões da aplicação após ~2 min de carga mista admin+API sob `npm run build` + `npm start`; 5 ≤ 10 (`max` default do pool `pg`), não múltiplo de 10, sem crescimento contínuo. Parte B (fluxos 6-10) confirmada manualmente pelo operador sem nenhum problema |
| 01-02-01 | 02 | 1 | INFRA-02 | T-EoP-01 (stale JWT authorizing revoked account) | Active account + live empresa → revalidation approves | unit | `npx vitest run lib/auth-guard.test.ts` | ✅ exists | ✅ green |
| 01-02-02 | 02 | 1 | INFRA-02 | T-EoP-01 | `Usuario.ativo=false` or `Empresa.deletedAt` set → revalidation returns null (Success Criterion #3) | unit | `npx vitest run lib/auth-guard.test.ts` | ✅ exists | ✅ green |
| 01-02-03 | 02 | 1 | INFRA-02 | T-EoP-02 (fail-open on infra error) | Database error during revalidation → null, fail-closed (D-01) | unit | `npx vitest run lib/auth-guard.test.ts` | ✅ exists | ✅ green |
| 01-02-04 | 02 | 1 | INFRA-02 | T-ID-01 (senhaHash leakage) | Revalidation query filters by `empresaId` and never selects `senhaHash` | unit | `npx vitest run lib/auth-guard.test.ts` | ✅ exists | ✅ green |
| 01-03-01 | 03 | 2 | INFRA-02 | T-EoP-01 | `requireAdminSession` redirects when DB revalidation rejects | unit | `npx vitest run lib/session.test.ts` | ✅ extended | ✅ green |
| 01-03-02 | 03 | 2 | INFRA-02 | T-EoP-01 | `requireAuth` throws `AuthError` 401 when DB revalidation rejects | unit | `npx vitest run lib/api-auth.test.ts` | ✅ extended | ✅ green |
| 01-03-03 | 03 | 2 | INFRA-02 | — | A DB change takes effect on the very next request without requiring new login (Success Criterion #2) | integration | `npx vitest run lib/session.test.ts lib/api-auth.test.ts` (stub swap between calls) | ✅ extended | ✅ green |
| 01-04-01 | 04 | 2 | INFRA-02 | — | Login page does NOT hand a revoked account back into the admin (anti redirect-loop, RESEARCH.md Pitfall 1) | e2e | `npx playwright test e2e/sessao-revogada.spec.ts` | ✅ exists | ✅ green |
| 01-05-01 | 05 | 3 | Success Criterion #4 | — | No regression across admin / registro / catálogo público flows | e2e + unit | `npm test && npm run test:e2e` | ✅ existing suite (67 unit test files, 7 `e2e/*.spec.ts`) | ✅ green (automatizado) — Parte B manual na Task 2 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Execução do Gate Automatizado (plano 01-05, Task 1 — 2026-08-31)

Todos os comandos abaixo foram executados **no mesmo estado do repositório**
(branch `gateway_pagamento`, HEAD `2ae6c6e`), na ordem listada. Nenhum resultado
abaixo é inferido: cada linha corresponde a uma execução real.

| # | Comando | Exit | Resultado observado |
|---|---------|------|---------------------|
| 1 | `npm run lint` | **0** | 0 errors, 1 warning pré-existente (`'Link' is defined but never used` em `app/registro/page.tsx`) |
| 2 | `npx tsc --noEmit` | **0** | Nenhuma saída, nenhum erro de tipo |
| 3 | `npm test` (`vitest run`) | **0** | **67 arquivos, 463 testes — 463 passed, 0 failed** (9.28s) |
| 4 | `npm run test:e2e` (`playwright test`) | **0** | **20 testes, 20 passed** (37.1s), 1 worker, **sem retry e sem flake nesta execução** |

**A suíte e2e rodou LOCALMENTE, não delegada ao CI.** `pg_isready` retornou
`/var/run/postgresql:5432 - accepting connections`, então não houve necessidade de
apontar para um run do GitHub Actions.

**Nota:** o flake de `e2e/combo-crud.spec.ts:88` registrado no SUMMARY do plano 01-04
**não reapareceu** nesta execução — os 20 testes passaram na primeira tentativa. Segue
como ruído conhecido da suíte local (lentidão de compilação sob demanda do `next dev`),
não como falha.

### Execuções por linha do mapa

| Arquivo | Testes | Linhas do mapa cobertas |
|---------|--------|--------------------------|
| `lib/prisma.test.ts` | 2 passed | 01-01-01, 01-01-02 |
| `lib/auth-guard.test.ts` | 5 passed | 01-02-01 … 01-02-04 |
| `lib/session.test.ts` | 18 passed | 01-03-01, 01-03-03 |
| `lib/api-auth.test.ts` | 8 passed | 01-03-02, 01-03-03 |
| `e2e/sessao-revogada.spec.ts` | 1 passed (dentro da suíte completa) | 01-04-01 |
| Suíte completa (`npm test` + `npm run test:e2e`) | 463 + 20 passed | 01-01-W0, 01-05-01 |

**Correção de registro:** o SUMMARY do plano 01-03 reporta `lib/api-auth.test.ts` com
**9** testes (`+5`). A contagem real é **8** (`4` em `main` → `8` agora, `+4`). O gate do
plano 01-03 exigia `≥4` casos novos, portanto **continua atendido** — trata-se apenas de
um erro de transcrição no SUMMARY, não de teste faltante.

### Asserções de fronteira da fase (diff contra `main`)

| Asserção | Comando | Resultado |
|----------|---------|-----------|
| D-06 — `proxy.ts` intocado na fase inteira | `git diff --name-only main -- proxy.ts` | vazio ✅ |
| Schema intocado | `git diff --name-only main -- prisma/schema.prisma` | vazio ✅ |
| Nenhuma migration nova | `git diff --name-only main -- prisma/migrations` | vazio ✅ |
| T-01-SC — zero dependências adicionadas | `git diff --stat main -- package.json package-lock.json` | vazio ✅ |
| D-04 — nenhuma lógica de pagamento antecipada | `grep -rcE "acessoAte\|trialFim\|canceladoEm\|acessoVitalicio" lib/ app/ \| grep -v ':0$'` | vazio ✅ |

Arquivos de produção/teste alterados pela fase inteira (16, excluindo `.planning/`):
`lib/prisma.ts`, `lib/prisma.test.ts`, `lib/auth-guard.ts`, `lib/auth-guard.test.ts`,
`lib/session.ts`, `lib/session.test.ts`, `lib/api-auth.ts`, `lib/api-auth.test.ts`,
`tests/setup/prisma-mock.ts`, `app/[slug]/admin/login/page.tsx`, `app/registro/page.tsx`,
`app/api/auth/login/route.ts`, `app/api/auth/login/route.test.ts`,
`app/[slug]/admin/_lib/auth-actions.ts`, `e2e/sessao-revogada.spec.ts` e `CLAUDE.md`
(este último é config do fluxo GSD, não código de produto).

---

## Wave 0 Requirements

- [x] `lib/prisma.test.ts` — covers INFRA-01 (`vi.unmock` + `vi.resetModules` pattern, validated in RESEARCH.md by direct execution) — **2 testes verdes**
- [x] `lib/auth-guard.test.ts` — covers INFRA-02 (active account, revoked account, DB error, query shape, absence of `senhaHash`) — **5 testes verdes**
- [x] `tests/setup/prisma-mock.ts` — add an active-account default stub after `mockReset` (**prerequisite** for the 14 existing test files — 12 authenticated `app/api/**/route.test.ts` + `lib/api-auth.test.ts` + `lib/session.test.ts` — to keep passing under the new fail-closed behavior) — **stub em `prisma-mock.ts:24`, nenhum dos 12 arquivos de rota precisou de stub local**
- [x] `e2e/sessao-revogada.spec.ts` — deactivates an account **via the product's own API** (não escreve no banco, T-01-15) and proves (a) admin access is lost on the next request and (b) **no redirect loop** occurs on the login page — **verde localmente**
- [x] New cases in `lib/session.test.ts` (9 → 18) and `lib/api-auth.test.ts` (4 → 8) for the revoked and DB-error paths

Framework installation: none — Vitest and Playwright are already configured and running in CI.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Postgres connection count stays stable under repeated load/reload cycles | INFRA-01 (Success Criterion #1) | Requires a live Postgres instance and observing `pg_stat_activity` over time — disproportionate to automate for a two-bug infra phase | Query `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();` before and after exercising admin + API routes repeatedly (including a dev-server reload cycle); count must not grow unbounded |

### Status da verificação manual (linha 01-01-03)

**✅ Aprovada pelo operador humano em 2026-08-31** (plano 01-05, Task 2 —
`checkpoint:human-verify`, `gate="blocking"`). A medição foi feita contra
`npm run build` + `npm start` (não `npm run dev`, porque o fix do singleton só vale a
partir de um build novo).

**Parte A — `pg_stat_activity` (os dois números exigidos):**

| Momento | Conexões da aplicação | Detalhe observado |
|---------|----------------------|-------------------|
| **Antes** da carga | **1 total / 0 da aplicação** | única linha era `application_name=psql`, `state=active` (o próprio cliente SQL do operador) |
| **Depois** de ~2 min de carga mista admin + API | **5** | 5 conexões `idle` sem `application_name` (da aplicação) + a mesma 1 do `psql` |

**Leitura:** 5 ≤ 10 (o `max` default do pool do `pg`), não é múltiplo de 10 e não mostra
crescimento contínuo com o volume de requests — consistente com **um único pool
reaproveitado**. INFRA-01 fechado. Ressalva registrada honestamente: não houve uma
terceira medição para provar platô por repetição; a evidência é que o número final ficou
bem abaixo do teto de um único pool, que é exatamente o sinal que o critério pedia
(o sintoma do bug seria um teto múltiplo de 10 ou crescimento sem parar).

**Parte B — ausência de regressão (passos 6-10):** o operador executou registro → admin,
navegação pelas telas do admin (produtos, estoque, combos, promoções), logout + login pelo
formulário, catálogo público em janela anônima e avaliação de lentidão perceptível.
Resultado reportado: *"testei tudo, funcionou normal"* — nenhum dos 5 fluxos apresentou
problema. Critério de sucesso #4 do roadmap atendido.

**Parte C — item 11:** o operador confirmou explicitamente ciência da consequência aceita
de D-01 / T-01-10 (indisponibilidade do Postgres derruba sessões e devolve 401,
distinguível pelo prefixo `[auth-guard]` nos logs).

Nenhum número foi preenchido por inferência a partir de `lib/prisma.test.ts`: aquele
teste prova o singleton **por processo**, não a contagem de conexões reais. Era
exatamente essa lacuna que o T-01-16 (Repudiation — fase declarada concluída sem
evidência do critério #1) exigia fechar com medição real, e ela está fechada.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — todos os 5 artefatos de Wave 0 existem e estão verdes
- [x] No watch-mode flags — `npm test` é `vitest run`; `npm run test:e2e` é `playwright test`
- [x] Feedback latency < 30s — suíte unitária completa em 9.28s; `npx vitest run lib/` em <1s
- [x] `nyquist_compliant: true` set in frontmatter — desbloqueado pela aprovação da linha manual 01-01-03 (01-05 Task 2)

**Approval:** gate automatizado ✅ aprovado (01-05 Task 1) · verificação manual humana ✅ **aprovada** pelo operador em 2026-08-31 (01-05 Task 2, veredito literal: "aprovado")

*A conclusão formal da Fase 1 no `ROADMAP.md` continua sendo do orquestrador, após a verificação de fase (`/gsd-verify-work`). Este documento apenas atesta que o contrato de validação está integralmente cumprido.*
