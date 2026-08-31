---
phase: 01-pr-requisitos-de-produ-o
verified: 2026-08-31T17:36:58Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 01: Pré-requisitos de Produção — Verification Report

**Phase Goal:** Uma mudança feita no banco sobre uma empresa passa a valer no request seguinte, e a aplicação suporta a carga de worker + webhooks sem esgotar o pool de conexões
**Verified:** 2026-08-31T17:36:58Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths merged from ROADMAP.md Success Criteria (authoritative) and per-plan `must_haves`.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | O cliente Prisma é uma única instância reaproveitada em todos os ambientes (incluindo produção); a contagem de conexões do Postgres permanece estável sob carga repetida | ✓ VERIFIED | `lib/prisma.ts` publishes the client unconditionally to `globalThis` (no `NODE_ENV` guard); `lib/prisma.test.ts` (2 tests, independently re-run: PASS) proves same-instance reuse under `NODE_ENV=production`. Real-world connection count measured by human checkpoint against `npm run build` + `npm start`: **1 → 5** connections after ~2 min of mixed admin+API load, well below the pool's default `max=10`, not a multiple of 10, no unbounded growth — documented with raw numbers in `01-VALIDATION.md` and `01-05-SUMMARY.md`, approved by operator 2026-08-31 |
| 2 | Uma alteração feita diretamente no banco sobre a Empresa ou o Usuario do admin logado passa a valer no próximo request, sem esperar os 7 dias do JWT nem exigir novo login | ✓ VERIFIED | `lib/auth-guard.ts` → `revalidarConta` queries `prisma.usuario.findFirst` on every call (memoized only within-request via `React.cache`); wired into `requireAdminSession` (`lib/session.ts`) and `requireAuth` (`lib/api-auth.ts`). Both have dedicated "stub swap between two calls" tests proving mid-session invalidation (`lib/session.test.ts`, `lib/api-auth.test.ts`) — independently re-run: PASS. `e2e/sessao-revogada.spec.ts` proves it against real Postgres (200 → 401 with the same Bearer token) |
| 3 | Uma Empresa ou Usuario removido/desativado no banco tem a sessão ativa invalidada imediatamente, em vez de continuar navegando com o token antigo | ✓ VERIFIED | `revalidarConta` where-clause: `{ id, empresaId, ativo: true, empresa: { deletedAt: null } }`; fail-closed on DB error (returns `null`, never authorizes). `requireAdminSession` redirects to login, `requireAuth` throws `AuthError` 401. Anti-loop fix confirmed: `app/[slug]/admin/login/page.tsx` and `app/registro/page.tsx` use `getVerifiedSession` (grep confirms `getSession` no longer referenced in either file) |
| 4 | Todos os fluxos existentes (admin, registro, catálogo público) continuam funcionando exatamente como antes — nenhuma regressão de comportamento ou de isolamento por `empresaId` | ✓ VERIFIED | Independently re-run full suite: `npm run lint` exit 0 (1 pre-existing unrelated warning), `npx tsc --noEmit` exit 0, `npm test` → **67 files / 463 tests, all passing** (matches SUMMARY claim exactly). `proxy.ts`, `prisma/schema.prisma`, `prisma/migrations`, `package.json`/`package-lock.json` confirmed unchanged vs `main` (`git diff --name-only` empty for all). Human checkpoint (01-05 Task 2) manually walked registro→admin, admin navigation, logout/login, anonymous public catalog, and perceived latency — all reported "ok" |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/prisma.ts` | Singleton published unconditionally to `globalThis`, factory reads `DATABASE_URL` lazily | ✓ VERIFIED | Read in full; no `NODE_ENV` string present (`grep -c NODE_ENV` = 0); `createPrismaClient()` present; `globalForPrisma.prisma = prisma` unconditional |
| `lib/prisma.test.ts` | Gate proving singleton reuse under `NODE_ENV=production` | ✓ VERIFIED | 2 tests, independently re-run: PASS |
| `.planning/codebase/CONCERNS.md` | Corrected bug mechanism description | ✓ VERIFIED | Section rewritten, references `node_modules/next/dist/lib/constants.js:331-372`, no longer claims "every module creates a new client" |
| `lib/auth-guard.ts` | DAL `revalidarConta` fail-closed, memoized per request | ✓ VERIFIED | Exports `revalidarConta` + `ContaAtiva`; single `try` around Prisma call only; `select` excludes `senhaHash`; filters by `id` + `empresaId` + `ativo` + `empresa.deletedAt` |
| `lib/auth-guard.test.ts` | 5 gates: active/revoked/DB-error/query-shape/no-leak | ✓ VERIFIED | 5 tests, independently re-run: PASS |
| `lib/session.ts` | `requireAdminSession` + `getVerifiedSession` revalidating via DAL | ✓ VERIFIED | Both functions present, import `revalidarConta` from `@/lib/auth-guard`; `redirect()` is a pure statement outside any `try` |
| `lib/api-auth.ts` | `requireAuth` revalidating via DAL, single generic error message | ✓ VERIFIED | Imports `revalidarConta`; throws `AuthError("Sessão inválida.", 401)` on `null` |
| `tests/setup/prisma-mock.ts` | Default active-account stub after `mockReset` | ✓ VERIFIED | Stub present, values match `testAuthPayload` |
| `app/[slug]/admin/login/page.tsx`, `app/registro/page.tsx` | "Already logged in" guard uses `getVerifiedSession` (anti redirect-loop) | ✓ VERIFIED | Both import and call `getVerifiedSession`; `getSession` no longer referenced |
| `app/api/auth/login/route.ts`, `app/[slug]/admin/_lib/auth-actions.ts` | Login rejects `empresa.deletedAt` accounts, aligned with DAL | ✓ VERIFIED | Both check `usuario.empresa.deletedAt`; single generic message preserved |
| `e2e/sessao-revogada.spec.ts` | E2E proof of immediate revocation + no redirect loop against real Postgres | ✓ VERIFIED (existence + prior run) | File exists (76 lines), 8-step flow matches plan; confirmed present via `npx playwright test --list`; could not be re-executed in this session due to an unrelated stray dev-server process occupying a conflicting port (environmental, not a code issue) — SUMMARY-04 and SUMMARY-05 both document independent local runs (20/20 passing, no retry) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `lib/prisma.ts` | `globalThis` | unconditional assignment | ✓ WIRED | `globalForPrisma.prisma = prisma;` with no guard |
| `lib/auth-guard.ts` | `lib/prisma.ts` | import of singleton | ✓ WIRED | `import { prisma } from "@/lib/prisma"` |
| `lib/session.ts` | `lib/auth-guard.ts` | `revalidarConta` import | ✓ WIRED | Used inside `requireAdminSession` and `getVerifiedSession` |
| `lib/api-auth.ts` | `lib/auth-guard.ts` | `revalidarConta` import | ✓ WIRED | Used inside `requireAuth` |
| `app/[slug]/admin/(protected)/layout.tsx` | `lib/session.ts` | `requireAdminSession(slug)` | ✓ WIRED | Inherited unedited — confirmed no diff on this file vs `main` |
| `app/[slug]/admin/login/page.tsx` / `app/registro/page.tsx` | `lib/session.ts` | `getVerifiedSession` | ✓ WIRED | Import + call present in both, `getSession` absent |
| `proxy.ts` | (must stay isolated from Prisma) | — | ✓ VERIFIED (D-06 boundary respected) | `git diff --name-only main -- proxy.ts` empty |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `revalidarConta` | `usuario` | `prisma.usuario.findFirst` (real Prisma query, production code path) | Yes — production code has no mock/static fallback; tests mock the Prisma client only in the test environment via `tests/setup/prisma-mock.ts` | ✓ FLOWING |
| `requireAdminSession` / `requireAuth` | `conta` | `revalidarConta(...)` result | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Prisma singleton + DAL + session + api-auth unit gates | `npx vitest run lib/prisma.test.ts lib/auth-guard.test.ts lib/session.test.ts lib/api-auth.test.ts` | 4 files, 33 tests passed | ✓ PASS |
| Full unit/component suite (regression check) | `npm test` | 67 files, 463 tests passed | ✓ PASS |
| Lint | `npm run lint` | exit 0, 1 pre-existing unrelated warning | ✓ PASS |
| Type-check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| E2E spec exists and is discoverable | `npx playwright test --list` | `sessao-revogada.spec.ts` listed | ✓ PASS |
| E2E spec execution (this session) | `npx playwright test e2e/sessao-revogada.spec.ts --reporter=line` | Failed to start — pre-existing stray Next dev server occupying a conflicting port in this sandbox (`Another next dev server is already running` on port 3001, unrelated to the phase's configured port 3100) | ? SKIP (environmental; independently documented as passing in `01-04-SUMMARY.md` and re-confirmed in `01-05-SUMMARY.md`/`01-VALIDATION.md`, both with raw exit codes and counts) |
| Boundary diffs vs `main` | `git diff --name-only main -- proxy.ts prisma/schema.prisma prisma/migrations package.json package-lock.json` | empty | ✓ PASS |
| Debt-marker scan on all phase-modified files | `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across the 15 files reviewed | no matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INFRA-01 | 01-01, 01-05 | Bug crítico do singleton do Prisma corrigido antes de código de billing | ✓ SATISFIED | `lib/prisma.ts` fix + `lib/prisma.test.ts` gate + human-measured `pg_stat_activity` (1→5, stable) |
| INFRA-02 | 01-02, 01-03, 01-04, 01-05 | Sessão do admin revalida status a cada request (não confia só no JWT de 7 dias) | ✓ SATISFIED (infrastructure scope) | `revalidarConta` DAL + wiring into `requireAdminSession`/`requireAuth`/`getVerifiedSession`, e2e-proven. Note: the requirement's literal text mentions "status de pagamento" — that half is explicitly and correctly deferred to Phase 2 (`avaliarAcesso` plugs into `revalidarConta`, D-04), documented in `01-05-SUMMARY.md` and `.planning/STATE.md`. This is a deliberate, tracked scope decomposition, not a gap — Phase 2's requirements (BILL-01..05) own the payment-status half |

No orphaned requirements: `.planning/REQUIREMENTS.md` traceability table maps only INFRA-01 and INFRA-02 to Phase 1, both accounted for above.

### Anti-Patterns Found

None blocking. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any of the 15 files touched by this phase. `01-REVIEW.md` (code review, advisory) recorded 4 warnings and 3 info items — none critical, none blocking this phase's goal:

| File | Finding | Severity | Impact |
|------|---------|----------|--------|
| `app/api/auth/login/route.ts` + `app/[slug]/admin/_lib/auth-actions.ts` | WR-01: login eligibility predicate duplicated verbatim in two places (drift risk once Phase 2 adds a payment gate) | ⚠️ Warning (advisory) | Does not block Phase 1 goal; worth fixing before/at Phase 2 |
| `app/[slug]/admin/_lib/auth-actions.ts` | WR-02: `login()` Server Action has no `try/catch` around the DB/bcrypt call (unhandled rejection surfaces `error.tsx` instead of inline form error) | ⚠️ Warning (advisory) | Does not block Phase 1 goal; a real DB error here throws to the nearest error boundary rather than degrading gracefully |
| `app/api/auth/login/route.ts` | WR-03: unchecked type assertion on JSON login body | ⚠️ Warning (advisory) | Does not block Phase 1 goal |
| `app/api/auth/login/route.ts`, `app/[slug]/admin/_lib/auth-actions.ts` | WR-04: no rate limiting on login endpoints | ⚠️ Warning (advisory) | Pre-existing gap, not introduced by this phase; out of this phase's declared scope |
| `app/registro/page.tsx` | IN-01: unused `Link` import (lint warning) | ℹ️ Info | Cosmetic, explicitly left in place per 01-04's diff-size constraint, documented as known debt |
| Login entry points | IN-02: email trimmed on one path, not the other | ℹ️ Info | Cosmetic inconsistency |
| `app/api/auth/login/route.test.ts` | IN-03: one `console.error` test not suppressed (noisy but not incorrect) | ℹ️ Info | Cosmetic |

These are pre-existing/advisory quality findings from the code review, not violations of the phase's must-haves. They do not affect the goal-backward truths above.

### Human Verification Required

None. The phase's own plan (01-05, Task 2) is a `checkpoint:human-verify` with `gate="blocking"` that already executed the exact verification a verifier would otherwise defer to a human: real `pg_stat_activity` counts (1 → 5) measured against a production build, and a manual walkthrough of all 5 regression flows (registro→admin, admin navigation, logout/login, anonymous public catalog, perceived latency), all reported "ok" and explicitly approved by the operator on 2026-08-31. This evidence is documented with concrete numbers (not narrative claims) in `01-VALIDATION.md` and `01-05-SUMMARY.md`, and `01-VALIDATION.md`'s frontmatter (`nyquist_compliant: true`, `human_checkpoint_approved: 2026-08-31`) reflects it. No further human action is needed to close this phase.

### Gaps Summary

No gaps. All 4 ROADMAP success criteria are independently verifiable in the codebase (not just claimed in SUMMARY.md): the Prisma singleton fix is real and gated by a passing test; the DAL is wired into both server-side auth entry points with passing tests and a passing/discoverable e2e spec; the anti-redirect-loop fix in the public login/registro guards is real (source-verified); and the full test suite (463 unit tests, lint, tsc) passes cleanly when re-run independently in this verification session, matching the SUMMARY's claimed counts exactly. `proxy.ts` and `prisma/schema.prisma` are confirmed untouched. The one thing not re-executed in this session (the e2e spec itself) is blocked by an unrelated environmental port conflict in this sandbox, not by anything in the phase's code, and has independent documented passing runs from two separate plans (01-04 and 01-05).

---

*Verified: 2026-08-31T17:36:58Z*
*Verifier: Claude (gsd-verifier)*
