---
phase: 02-modelo-de-dados-e-motor-de-acesso
fixed_at: 2026-08-31T20:27:33Z
review_path: .planning/phases/02-modelo-de-dados-e-motor-de-acesso/02-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-08-31T20:27:33Z
**Source review:** .planning/phases/02-modelo-de-dados-e-motor-de-acesso/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 Critical, 4 Warning — `fix_scope: critical_warning`; IN-01 excluded from scope)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: `empresaService.create()` never sets billing facts, permanently bricking any Empresa created through it

**Files modified:** `app/services/empresa.service.ts`
**Commit:** `9b45987`
**Applied fix:** `create()` now computes `trialFim = meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1)` and sets `ultimoStatusAuditado: StatusAcesso.TRIAL` the same way `registerComUsuario()` does. Wrapped `tx.empresa.create` + `tx.auditoriaAcesso.create` (causa: `REGISTRO`) in a `prisma.$transaction` so the Empresa row and its first audit trail entry are written atomically, mirroring `registerComUsuario`'s pattern. Verified the only caller (`app/api/empresas/route.ts`) still receives the same shape (`Empresa`, not `{empresa, usuario}`).
**Status:** fixed: requires human verification — this changes production billing-state semantics (trial length calculation, transaction wrapping, and the audit `causa` value used for a path with no accompanying `Usuario`). Type-checked clean (`tsc --noEmit`) and covered by tests (see WR-03), but the business-logic correctness (e.g., whether `REGISTRO` is the right `CausaTransicaoAcesso` for this ownerless-Empresa path, flagged separately by IN-01) should be confirmed by a human before this ships.

### WR-01: `agendarPosResposta` only catches promise rejections, not synchronous throws from `tarefa`

**Files modified:** `lib/agendar-pos-resposta.ts`, `lib/agendar-pos-resposta.test.ts`
**Commit:** `c839a7f`
**Applied fix:** `seguro()` now wraps the call itself with `Promise.resolve().then(tarefa).catch(...)` instead of calling `tarefa()` directly, so a synchronous throw from `tarefa` is caught the same way a rejected promise is. Updated the co-located test file's timing assertions (the extra `.then` hop shifts execution by additional microtask ticks) to use a `setTimeout`-based `flushMicrotasks()` helper instead of a fixed count of `await Promise.resolve()` calls, since the exact tick count is an implementation detail that would be brittle to hardcode.
**Status:** fixed: requires human verification — this is a control-flow/timing change to a wrapper explicitly designed around an ASVS V7 guarantee ("audit failure never brings down the request"); recommend a human confirms the new timing doesn't interact badly with the real `after()` lifecycle in a deployed environment (not reproducible in Vitest, per the existing test file's own comments).

### WR-02: Catch around `after()` is untyped/unconditional, silently masking non-"outside scope" failures

**Files modified:** `lib/agendar-pos-resposta.ts`, `lib/agendar-pos-resposta.test.ts`
**Commit:** `c839a7f` (same commit as WR-01 — both findings touch the same function in the same file)
**Applied fix:** The `catch` block now inspects the caught error's message; if it does not include `"outside a request scope"` (the expected `E468` case), it logs `"[acesso] after() falhou por motivo inesperado, executando inline:"` before falling back to inline execution, so an unexpected `after()` failure inside a real request is observable. Added a new test case mocking `next/server`'s `after()` to throw an unrelated error and asserting the new log line fires while the task still executes inline.
**Status:** fixed: requires human verification — same rationale as WR-01 (shared commit, shared function); the substring-matching heuristic for identifying `E468` should be spot-checked against real Next.js behavior in case the error message format changes across versions.

### WR-03: `empresaService.create` test does not cover the billing-defaults gap

**Files modified:** `app/services/empresa.service.test.ts`
**Commit:** `4ec273e`
**Applied fix:** Replaced the sole `expect.objectContaining` assertion for `create()` with an exact-match assertion of the full `data` payload (mirroring the stricter convention already used for `registerComUsuario` in this file), covering `trialFim`, `ultimoStatusAuditado`, and the new `AuditoriaAcesso` row written by the CR-01 fix. Added a second case covering the optional-fields path. All 22 tests in the file pass.
**Status:** fixed

### WR-04: Relative imports in a phase-touched test file violate the project's import convention

**Files modified:** `app/api/empresas/[id]/route.test.ts`
**Commit:** `dd60669`
**Applied fix:** Replaced `../../../../tests/helpers/request`, `../../../../tests/helpers/auth`, and `../../../services/empresa.service` with `@/tests/...` / `@/app/services/...` per CLAUDE.md's Import Organization convention. Confirmed the `vi.mock("@/app/services/empresa.service", ...)` still intercepts `route.ts`'s own relative import of the same module (both resolve to the same file) — all 10 tests in the file pass unchanged. Left `route.ts` itself untouched since the finding scoped only the test file.
**Status:** fixed

## Skipped Issues

None — all in-scope findings were fixed.

**Out of scope (not attempted, `fix_scope: critical_warning` excludes Info):**
- IN-01: `POST /api/empresas` lets any authenticated user create unrelated, ownerless companies — flagged for awareness only in the review; not fixed by this run.

---

_Fixed: 2026-08-31T20:27:33Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
