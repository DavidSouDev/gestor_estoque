---
phase: 02-modelo-de-dados-e-motor-de-acesso
verified: 2026-08-31T20:40:00Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "02-06-H1: after() dentro de React.cache() grava UMA linha AVALIACAO_SESSAO contra Postgres real, idempotente sob reloads repetidos"
    expected: "Após forçar TRIAL→BLOQUEADO direto no banco e recarregar /{slug}/admin uma vez, existe exatamente 1 linha em AuditoriaAcesso com causa AVALIACAO_SESSAO, statusAnterior=TRIAL, statusNovo=BLOQUEADO. Recarregar mais 3 vezes não cria linhas adicionais (contagem permanece 1). Admin e catálogo público continuam acessíveis (nenhum bloqueio nesta fase). Nenhum erro E468 aparece no console do next dev."
    why_human: "Assumption A6 de 02-RESEARCH.md: o comportamento real de after() dentro de uma função React.cache()'d não é reproduzível em Vitest (a doc do Next descreve o sentido inverso — cache() dentro de after()). O Playwright também não serve: por convenção do repositório o processo do Playwright não carrega .env nem conhece credenciais de banco. Esta é a única prova end-to-end de que o compare-and-swap é idempotente contra Postgres real sob reloads repetidos, e a única verificação e2e de BILL-05 no caminho de request. Registrado em 02-VALIDATION.md como 02-06-H1, ainda não colhido (confirmado pelo orquestrador desta verificação)."
---

# Phase 2: Modelo de Dados e Motor de Acesso — Verification Report

**Phase Goal:** O sistema sabe dizer, para qualquer empresa e qualquer data, exatamente qual é o status de acesso dela — derivado de fatos armazenados, nunca de um status pré-calculado
**Verified:** 2026-08-31T20:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All automated/code-level truths verified. One human-check item (02-06-H1), explicitly deferred to end-of-phase UAT per `workflow.human_verify_mode: end-of-phase`, has not yet been performed. This is the only reason status is not `passed`.

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Empresa nova criada em `/registro` recebe 14 dias de trial automaticamente, sem dado de pagamento | ✓ VERIFIED | `app/services/empresa.service.ts:53-131` (`registerComUsuario`) sets `trialFim = meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1)` and `ultimoStatusAuditado: TRIAL` inside the same `$transaction`; `RegisterComUsuarioDTO` has no billing/date field. Unit tests assert exact `data` payload (`app/services/empresa.service.test.ts:80-165`). E2E `e2e/cadastro-e-login.spec.ts` re-run independently: **3/3 passed** against real Postgres, including a second-page navigation and a negative assertion (`getByText(/bloquead\|pagamento\|assinatura vencida/i)).toHaveCount(0)`). |
| 2 | Dado os 4 fatos + data/hora, `avaliarAcesso` retorna exatamente 1 de 6 status, inclusive nas viradas exatas | ✓ VERIFIED | `lib/avaliar-acesso.ts` implements the exact rule order specified in the plan (D-03 → D-05/D-02 → D-06 → Pitfall5/6 → D-04/D-07 → D-08). `lib/avaliar-acesso.test.ts` re-run independently, all cases pass including `-t "vitalicio"`, `-t "trial"`, `-t "carencia"`, `-t "backfill"`. |
| 3 | Marcar `acessoVitalicio` direto no banco faz a empresa virar vitalícia, sem UI/alteração adicional | ✓ VERIFIED | `avaliarAcesso` checks `fatos.acessoVitalicio` as the absolute first rule (`lib/avaliar-acesso.ts:59-63`). `lib/auth-guard.test.ts` case "deriva o status dos fatos, nunca do status já auditado" sets `acessoVitalicio: true` + `ultimoStatusAuditado: "BLOQUEADO"` and asserts `statusAcesso === "VITALICIO"` — proves the decision is fact-driven, not bookkeeping-driven. No write path for `acessoVitalicio` exists anywhere in the app (BILL-04 gate in `empresaService.update` allowlist). |
| 4 | Toda mudança de status é auditada com status anterior, novo, causa e horário | ✓ VERIFIED | `app/services/acesso.service.ts` (`registrarTransicao`) does compare-and-swap (`updateMany` conditioned on expected `ultimoStatusAuditado`, `count===1` gate before `create`) and writes exactly `{empresaId, statusAnterior, statusNovo, causa}` (+ `createdAt` default). Wired into `lib/auth-guard.ts:103-112` via `agendarPosResposta`, only when `acesso.status !== usuario.empresa.ultimoStatusAuditado` (D-16). `lib/auth-guard.test.ts` proves "não agenda auditoria quando o status não mudou" and "agenda uma única auditoria AVALIACAO_SESSAO quando o status muda" with exact-match assertions. |
| 5 | Após a migração, nenhuma empresa existente fica bloqueada/em carência por efeito do backfill | ✓ VERIFIED (with caveat, see Anti-Patterns) | Direct query against the live dev Postgres run during this verification: `sem_trial=0, vencido=0, total_ativas=333` — zero active companies with null `trialFim` or an already-expired `trialFim`. This is the substantive claim behind criterion #5 and it holds. The committed regression-gate script `prisma/checks/backfill-billing.sql` itself now fails on **INV-4** (see below) — but INV-4 is a row-count-parity check that drifts as soon as any company registers after the backfill (23 companies have since been created via e2e/dev runs with `causa=REGISTRO`, not `BACKFILL`); it is not evidence that any company is incorrectly blocked. |

**Score:** 5/5 roadmap success criteria verified.

### Plan-Level Must-Haves (merged across 6 plans)

| # | Truth (plan) | Status | Evidence |
|---|---|---|---|
| 6 | `Empresa` stores the 4 billing facts; no pre-computed status field is the source of truth (BILL-01, D-01) | ✓ VERIFIED | `prisma/schema.prisma:59-69` — `acessoAte`, `trialFim`, `canceladoEm`, `acessoVitalicio` documented as source of truth; `ultimoStatusAuditado` documented as bookkeeping only. BILL-01/OQ-2 grep gate re-run independently: **0 violations** (no file outside the allowed list references `ultimoStatusAuditado`). |
| 7 | `AuditoriaAcesso` table can record previous status, new status, cause, timestamp (BILL-05) | ✓ VERIFIED | `prisma/schema.prisma:267-283` — exact fields, no billing-fact snapshot (D-17), `@@index([empresaId, createdAt])`. |
| 8 | An ADMIN cannot self-grant `acessoVitalicio` via `PATCH /api/empresas/{own-id}` (BILL-04) | ✓ VERIFIED | `empresaService.update` rewritten as a positive 10-field allowlist (`app/services/empresa.service.ts:311-335`); `-t "não aceita campos de billing"` and `-t "ignora campos de billing enviados no corpo do PATCH"` re-run independently, both pass. |
| 9 | `avaliarAcesso` and `meiaNoiteEmSaoPaulo` are pure, DST-correct | ✓ VERIFIED | `lib/fuso-sao-paulo.ts` — fixed-point algorithm, historical DST test cases (2017-10-14, 2018-02-16/17) present and passing. |
| 10 | A transição concorrente gera UMA linha, não duas (CAS) | ✓ VERIFIED | `app/services/acesso.service.ts:44-60` — `updateMany` gated `count===1` inside `$transaction`; `-t "concorr"` re-run independently, passes. |
| 11 | Falha de auditoria nunca derruba o request (ASVS V7); `agendarPosResposta` degrada para inline fora de escopo de request | ✓ VERIFIED | `lib/agendar-pos-resposta.ts` — `Promise.resolve().then(tarefa).catch(...)` (catches sync throws too, per WR-01 fix) + `try/catch` around `after()` with fallback `void seguro()` + anomaly logging (WR-02 fix). `lib/auth-guard.test.ts` "não derruba o request quando a auditoria falha" re-run independently, passes. |
| 12 | Nenhuma decisão de acesso lê `ultimoStatusAuditado` (BILL-01/OQ-2) | ✓ VERIFIED | Grep gate re-run independently, 0 violating files. |

**Score:** 12/12 must-haves verified (5 roadmap + 7 plan-level, deduplicated).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | 2 enums, 5 new `Empresa` columns, `AuditoriaAcesso` model | ✓ VERIFIED | Confirmed by direct read; matches plan spec exactly. |
| `prisma/migrations/20260831193038_add_billing_a_empresa/migration.sql` | DDL + backfill DML | ✓ VERIFIED | Exists, applied (`npx prisma migrate status` → "Database schema is up to date!", 8 migrations). |
| `prisma/checks/backfill-billing.sql` | Executable gate, 5 invariants | ⚠️ PARTIAL | Exists, committed, `RAISE EXCEPTION` present. Re-run independently: **exit 1** on INV-4 (row-count parity drifted due to post-backfill company creation — see Anti-Patterns). INV-1/2/3/5 logic still correct; direct query confirms the underlying product invariant (no active company blocked/expired) holds. |
| `lib/fuso-sao-paulo.ts` | `meiaNoiteEmSaoPaulo` pure fn | ✓ VERIFIED | Exists, pure, DST-tested. |
| `lib/avaliar-acesso.ts` | `avaliarAcesso` state machine | ✓ VERIFIED | Exists, matches D-02..D-08 rule order exactly. |
| `lib/agendar-pos-resposta.ts` | `after()` wrapper w/ fallback | ✓ VERIFIED | Exists; hardened per WR-01/WR-02 fixes. |
| `app/services/acesso.service.ts` | `registrarTransicao` CAS | ✓ VERIFIED | Exists, no read methods (grep for `findMany\|findFirst\|findUnique` → 0), `export default`/`export class` absent per convention. |
| `app/services/empresa.service.ts` | `update` allowlist, `registerComUsuario`/`create` trial writes | ✓ VERIFIED | All three methods confirmed correct by direct read; `create()` fix (CR-01) confirmed present and wired to the same `POST /api/empresas` route. |
| `lib/auth-guard.ts` | `revalidarConta` extended w/ `avaliarAcesso` + conditional audit | ✓ VERIFIED | Confirmed by direct read; no `include`, no blocking logic introduced (grep gates pass), `select` carries exactly 6 `empresa` fields. |
| `tests/setup/prisma-mock.ts` | Neutral billing stub | ✓ VERIFIED | Confirmed via passing full suite (no `E468` surfaced). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `lib/avaliar-acesso.ts` | `@prisma/client` | `import { StatusAcesso }` as value | ✓ WIRED | Confirmed by read. |
| `lib/avaliar-acesso.ts` | `lib/fuso-sao-paulo.ts` | `meiaNoiteEmSaoPaulo(expiraEm, DIAS_DE_CARENCIA)` | ✓ WIRED | Confirmed by read. |
| `app/api/empresas/[id]/route.ts` | `app/services/empresa.service.ts` | `empresaService.update(id, body)` | ✓ WIRED | Confirmed; allowlist enforced inside service, HTTP surface test passes. |
| `app/services/acesso.service.ts` | `prisma.empresa.updateMany` + `prisma.auditoriaAcesso.create` | `$transaction` w/ CAS | ✓ WIRED | Confirmed by read + passing tests. |
| `lib/auth-guard.ts` | `lib/avaliar-acesso.ts` | `avaliarAcesso(fatos, new Date())` | ✓ WIRED | Confirmed by read; inside the existing `try`. |
| `lib/auth-guard.ts` | `app/services/acesso.service.ts` | `agendarPosResposta(() => acessoService.registrarTransicao(...))` when status differs | ✓ WIRED | Confirmed by read + `lib/auth-guard.test.ts` transition test. |
| `app/registro/actions.ts` | `app/services/empresa.service.ts` | `registerComUsuario` | ✓ WIRED | Confirmed by e2e re-run (3/3 passing against real Postgres). |

### Behavioral Spot-Checks (independently re-executed by this verifier)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite | `npm run test` | 71 files / **525 tests** passed | ✓ PASS |
| Type-check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing warning (unrelated to phase 2, `app/registro/page.tsx` unused `Link`) | ✓ PASS |
| BILL-01/OQ-2 grep gate | `grep -rl 'ultimoStatusAuditado' ... \| grep -v <allowlist>` | empty output | ✓ PASS |
| Migration applied | `npx prisma migrate status` | "Database schema is up to date!", 8 migrations | ✓ PASS |
| Backfill invariant gate | `npx prisma db execute --file prisma/checks/backfill-billing.sql` | exit 1 — INV-4 (row-count parity) | ✗ FAIL (see Anti-Patterns; does not indicate any company is incorrectly blocked) |
| Underlying product invariant (criterion #5) | direct SQL: count of active companies with null/expired `trialFim` | `sem_trial=0, vencido=0, total_ativas=333` | ✓ PASS |
| `avaliarAcesso` VITALICIO precedence | `npx vitest run lib/avaliar-acesso.test.ts -t "vitalicio"` | 2 passed | ✓ PASS |
| Mass-assignment regression (service) | `npx vitest run app/services/empresa.service.test.ts -t "não aceita campos de billing"` | 1 passed | ✓ PASS |
| Mass-assignment regression (HTTP) | `npx vitest run "app/api/empresas/[id]/route.test.ts" -t "ignora campos de billing"` | 1 passed | ✓ PASS |
| CAS concurrency no-op | `npx vitest run app/services/acesso.service.test.ts -t "concorr"` | 1 passed | ✓ PASS |
| E2E registro/trial (real Postgres) | `PLAYWRIGHT_PORT=3001 npx playwright test e2e/cadastro-e-login.spec.ts` | 3/3 passed | ✓ PASS |

### Code Review Fix Verification (independent re-check of 02-REVIEW.md / 02-REVIEW-FIX.md claims)

| Finding | Claimed Fix | Independently Verified |
|---------|-------------|------------------------|
| CR-01 (Critical): `empresaService.create()` never set billing facts, permanently bricking companies via `POST /api/empresas` | `create()` now computes `trialFim`/`ultimoStatusAuditado` and writes the first `AuditoriaAcesso` row in a transaction | ✓ CONFIRMED by direct read of `app/services/empresa.service.ts:263-301`; return shape (`Empresa`, not `{empresa,usuario}`) matches `app/api/empresas/route.ts:36` caller exactly. Commit `9b45987` present in git log. |
| WR-01: `agendarPosResposta` only caught promise rejections, not sync throws | `seguro()` now wraps via `Promise.resolve().then(tarefa).catch(...)` | ✓ CONFIRMED by direct read of `lib/agendar-pos-resposta.ts:35-40`. Commit `c839a7f` present. |
| WR-02: `catch` around `after()` silently masked non-E468 failures | Now inspects error message, logs `[acesso] after() falhou por motivo inesperado...` for non-E468 cases | ✓ CONFIRMED by direct read of `lib/agendar-pos-resposta.ts:44-66`. Same commit. |
| WR-03: `empresaService.create` test used loose `objectContaining`, couldn't catch CR-01 | Now asserts exact `data` payload including `trialFim`/`ultimoStatusAuditado` | ✓ CONFIRMED by direct read of `app/services/empresa.service.test.ts:489-511`. Commit `4ec273e` present. |
| WR-04: relative imports in `app/api/empresas/[id]/route.test.ts` | Replaced with `@/` alias imports | ✓ CONFIRMED by direct read (`@/tests/helpers/request`, `@/tests/helpers/auth`, `@/app/services/empresa.service`). Commit `dd60669` present. |
| Full suite "525/525" claim in fixer's self-report | — | ✓ INDEPENDENTLY RE-CONFIRMED: `npm run test` → 71 files / 525 tests passed, run directly by this verifier (not trusted from SUMMARY). |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BILL-01 | 02-01, 02-02, 02-06 | Empresa armazena fatos de billing como fonte da verdade | ✓ SATISFIED | Schema + grep gate + `avaliarAcesso` reading only the 4 facts. |
| BILL-02 | 02-03, 02-06 | Função pura `avaliarAcesso` determina status a partir dos fatos e data/hora | ✓ SATISFIED | `lib/avaliar-acesso.ts` + wired into `revalidarConta`. |
| BILL-03 | 02-05 | Empresa nova recebe 14 dias de trial automaticamente | ✓ SATISFIED | `registerComUsuario` + e2e re-run. |
| BILL-04 | 02-02, 02-03, 02-06 | Acesso vitalício só concedível direto no banco | ✓ SATISFIED | Allowlist closes the write path; `avaliarAcesso` precedence rule + auth-guard test prove the read path is fact-driven. |
| BILL-05 | 02-01, 02-04, 02-05, 02-06 | Toda mudança de status registrada em auditoria | ✓ SATISFIED | `AuditoriaAcesso` model + `registrarTransicao` CAS + `registerComUsuario`/`create` REGISTRO rows + `revalidarConta` AVALIACAO_SESSAO rows. |

No orphaned requirements: REQUIREMENTS.md maps exactly BILL-01..BILL-05 to Phase 2, and all 5 are declared across the 6 plans' frontmatter (`requirements:` fields), matching 1:1.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `prisma/checks/backfill-billing.sql` | INV-4 block (~L60-80) | Stale regression-gate invariant | ⚠️ WARNING | INV-4 compares `count(AuditoriaAcesso WHERE causa='BACKFILL')` to `count(active companies WHERE trialFim IS NOT NULL)`. This holds only at the instant right after the backfill ran. As soon as any new company registers (`causa=REGISTRO`), the counts permanently diverge, and the gate — despite being documented as "gate de regressão do backfill, não um script descartável" and intended to be re-run — now fails (confirmed: exit 1, `310 BACKFILL rows vs 333 active companies with trialFim`). Not part of CI (`grep` for the script path in `.github/workflows/tests.yml` and `package.json` found nothing), so it does not block builds, and it does not indicate any company is actually mis-blocked (independently confirmed via direct query: 0 active companies with null or expired `trialFim`). This is a design flaw in the checker's durability as a "regression gate," not a functional defect in the billing engine. No code change is required to close Phase 2's goal, but the script's INV-4 should be scoped to companies existing at migration time (e.g. `createdAt < <migration timestamp>`) or removed as a standing gate if it was only ever meant to be a one-time attestation. |

No `TBD`/`FIXME`/`XXX`/unreferenced debt markers found in any phase-touched file. The single `TODO`-matching grep hit in `lib/fuso-sao-paulo.test.ts:73` is the Portuguese word "TODOS" (= "all"), a false positive, not a debt marker.

### Human Verification Required

#### 1. 02-06-H1 — `after()` inside `React.cache()` writes exactly one audit row, idempotent under real-Postgres reloads

**Test:** Follow the 7-step procedure in `02-06-PLAN.md` Task 3 `<human-check>` (also mirrored in `02-VALIDATION.md` as item `02-06-H1`): create a company via `/registro`, force `trialFim` into the past directly in Postgres via `npx prisma db execute`, reload `/{slug}/admin` once, verify exactly one `AVALIACAO_SESSAO` (`TRIAL`→`BLOQUEADO`) row exists, reload 3 more times, verify the count stays at 1.
**Expected:** A single `AuditoriaAcesso` row with `causa='AVALIACAO_SESSAO'`, `statusAnterior='TRIAL'`, `statusNovo='BLOQUEADO'`, unchanged after repeated reloads. Admin and public catalog remain reachable (no blocking is applied in this phase). No `E468` in the `next dev` console.
**Why human:** This is Assumption A6 from `02-RESEARCH.md`: whether `after()` works correctly when invoked from inside a `React.cache()`'d function is not reproducible in Vitest (the Next docs describe the opposite composition — `cache()` inside `after()`), and Playwright cannot verify it either because the repository convention forbids the Playwright process from loading `.env`/DB credentials. This is also the only real end-to-end proof that the compare-and-swap in `acessoService.registrarTransicao` is idempotent against a live Postgres under repeated concurrent-ish reloads. Confirmed with the task owner: this item has **not yet been performed**.

### Gaps Summary

No code-level gaps found. All 5 roadmap success criteria and all 12 merged plan-level must-haves are independently verified against the live codebase, not merely claimed in SUMMARY.md files. The Critical finding from `02-REVIEW.md` (CR-01: `empresaService.create()` bricking new companies) and all 4 Warning findings were independently re-verified as genuinely fixed — not just claimed — by reading the resulting code, re-running the exact regression tests the fixer added, and confirming each fix commit exists in git history. The full test suite (525/525) and the e2e suite (3/3, real Postgres) were independently re-executed by this verifier rather than trusted from any prior self-report.

The only reason this phase is not `passed` is the single deferred human-check item (`02-06-H1`), which per this project's `workflow.human_verify_mode: end-of-phase` setting is expected to surface here rather than block plan completion. It requires a human with `.env`/DB access to execute (Playwright cannot, per repository convention).

One non-blocking artifact-quality note: `prisma/checks/backfill-billing.sql`'s INV-4 invariant has drifted and now fails against the current dev database (23 companies registered since the original backfill). This does not indicate any company is incorrectly blocked (verified directly) and does not block CI (the script isn't wired into any pipeline), but it means the script no longer functions as a reusable "regression gate" as documented. Worth a follow-up fix (scope INV-4 to pre-migration companies, or convert to a one-time attestation) but does not affect Phase 2 goal achievement.

---

_Verified: 2026-08-31T20:40:00Z_
_Verifier: Claude (gsd-verifier)_
