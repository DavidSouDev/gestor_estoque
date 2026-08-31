---
phase: 1
slug: pr-requisitos-de-produ-o
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-31
---

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
| 01-01-W0 | 01 | 0 | INFRA-01 | — | `tests/setup/prisma-mock.ts` stubs an active-account default after `mockReset` so existing auth-dependent tests keep passing under fail-closed | unit | `npx vitest run` (full run, watch for regressions) | ❌ W0 | ⬜ pending |
| 01-01-01 | 01 | 1 | INFRA-01 | — | Re-evaluating `lib/prisma.ts` under `NODE_ENV=production` returns the same client instance | unit | `npx vitest run lib/prisma.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | INFRA-01 | — | Client is published on `globalThis` in production (not only in dev) | unit | `npx vitest run lib/prisma.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | INFRA-01 | DoS (pool exhaustion) | Postgres connections remain stable under repeated load (Success Criterion #1) | manual | `pg_stat_activity` query before/after exercising admin + API | ❌ `checkpoint:human-verify` | ⬜ pending |
| 01-02-01 | 02 | 1 | INFRA-02 | T-EoP-01 (stale JWT authorizing revoked account) | Active account + live empresa → revalidation approves | unit | `npx vitest run lib/auth-guard.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | INFRA-02 | T-EoP-01 | `Usuario.ativo=false` or `Empresa.deletedAt` set → revalidation returns null (Success Criterion #3) | unit | `npx vitest run lib/auth-guard.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | INFRA-02 | T-EoP-02 (fail-open on infra error) | Database error during revalidation → null, fail-closed (D-01) | unit | `npx vitest run lib/auth-guard.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-04 | 02 | 1 | INFRA-02 | T-ID-01 (senhaHash leakage) | Revalidation query filters by `empresaId` and never selects `senhaHash` | unit | `npx vitest run lib/auth-guard.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | INFRA-02 | T-EoP-01 | `requireAdminSession` redirects when DB revalidation rejects | unit | `npx vitest run lib/session.test.ts` | ⚠️ exists — extend | ⬜ pending |
| 01-03-02 | 03 | 2 | INFRA-02 | T-EoP-01 | `requireAuth` throws `AuthError` 401 when DB revalidation rejects | unit | `npx vitest run lib/api-auth.test.ts` | ⚠️ exists — extend | ⬜ pending |
| 01-03-03 | 03 | 2 | INFRA-02 | — | A DB change takes effect on the very next request without requiring new login (Success Criterion #2) | integration | `npx vitest run lib/session.test.ts lib/api-auth.test.ts` (stub swap between calls) | ⚠️ exists — extend | ⬜ pending |
| 01-04-01 | 04 | 2 | INFRA-02 | — | Login page does NOT hand a revoked account back into the admin (anti redirect-loop, RESEARCH.md Pitfall 1) | e2e | `npx playwright test e2e/sessao-revogada.spec.ts` | ❌ W0 | ⬜ pending |
| 01-05-01 | 05 | 3 | Success Criterion #4 | — | No regression across admin / registro / catálogo público flows | e2e + unit | `npm test && npm run test:e2e` | ✅ existing suite (39 unit test files, `e2e/*.spec.ts`) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/prisma.test.ts` — covers INFRA-01 (`vi.unmock` + `vi.resetModules` pattern, validated in RESEARCH.md by direct execution)
- [ ] `lib/auth-guard.test.ts` — covers INFRA-02 (active account, revoked account, DB error, query shape, absence of `senhaHash`)
- [ ] `tests/setup/prisma-mock.ts` — add an active-account default stub after `mockReset` (**prerequisite** for the 14 existing test files — 12 authenticated `app/api/**/route.test.ts` + `lib/api-auth.test.ts` + `lib/session.test.ts` — to keep passing under the new fail-closed behavior)
- [ ] `e2e/sessao-revogada.spec.ts` (suggested name) — deactivates an account directly in the DB and proves (a) admin access is lost on the next request and (b) **no redirect loop** occurs on the login page
- [ ] New cases in `lib/session.test.ts` and `lib/api-auth.test.ts` for the revoked and DB-error paths

Framework installation: none — Vitest and Playwright are already configured and running in CI.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Postgres connection count stays stable under repeated load/reload cycles | INFRA-01 (Success Criterion #1) | Requires a live Postgres instance and observing `pg_stat_activity` over time — disproportionate to automate for a two-bug infra phase | Query `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();` before and after exercising admin + API routes repeatedly (including a dev-server reload cycle); count must not grow unbounded |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
