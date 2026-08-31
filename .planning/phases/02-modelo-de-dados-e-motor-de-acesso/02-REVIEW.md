---
phase: 02-modelo-de-dados-e-motor-de-acesso
reviewed: 2026-08-31T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - app/api/empresas/[id]/route.test.ts
  - app/services/acesso.service.test.ts
  - app/services/acesso.service.ts
  - app/services/empresa.service.test.ts
  - app/services/empresa.service.ts
  - e2e/cadastro-e-login.spec.ts
  - lib/agendar-pos-resposta.test.ts
  - lib/agendar-pos-resposta.ts
  - lib/auth-guard.test.ts
  - lib/auth-guard.ts
  - lib/avaliar-acesso.test.ts
  - lib/avaliar-acesso.ts
  - lib/fuso-sao-paulo.test.ts
  - lib/fuso-sao-paulo.ts
  - prisma/checks/backfill-billing.sql
  - prisma/migrations/20260831193038_add_billing_a_empresa/migration.sql
  - prisma/schema.prisma
  - tests/setup/prisma-mock.ts
findings:
  critical: 1
  warning: 4
  info: 1
  total: 6
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-08-31T00:00:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

The core access-decision engine (`avaliarAcesso`, `meiaNoiteEmSaoPaulo`, `acessoService.registrarTransicao`, `revalidarConta`) is well designed and unusually thoroughly tested: boundary conditions (D-02), precedence rules (D-03, D-05, D-06), timezone/DST edge cases, and the compare-and-swap concurrency guard are all directly exercised, and the code reads as pure/side-effect-free where it claims to be. `empresaService.update()` correctly closes a real mass-assignment vector with an explicit allowlist.

The one real defect found is a genuine gap in the billing rollout: `empresaService.create()` — the code path backing the live `POST /api/empresas` endpoint — was not updated to populate the same billing facts (`trialFim`, `ultimoStatusAuditado`) that `registerComUsuario()` now writes. Because `avaliarAcesso` fails closed to `BLOQUEADO` when all billing facts are null, any Empresa created through that path is permanently locked out with no way to recover access short of manual DB intervention. This directly contradicts the backfill invariant this same phase introduces (`INV-1`: "nenhuma empresa ativa pode ficar sem trialFim").

Remaining findings are smaller robustness/quality gaps in the `after()`-fallback wrapper and a test/style nit.

## Critical Issues

### CR-01: `empresaService.create()` never sets billing facts, permanently bricking any Empresa created through it

**File:** `app/services/empresa.service.ts:259-276`
**Issue:**
`registerComUsuario()` (the self-service signup path) now correctly sets `trialFim` and `ultimoStatusAuditado: TRIAL` when creating an `Empresa` (lines 72-80). `create()` — the method backing `POST /api/empresas` (`app/api/empresas/route.ts:36`, reachable by any authenticated user, not just the future owner of the new company) — creates the `Empresa` row with none of the four billing facts set:

```ts
async create(data: CreateEmpresaDTO) {
  return prisma.empresa.create({
    data: {
      nome: data.nome,
      slug: data.slug,
      logo: data.logo,
      banner: data.banner,
      descricao: data.descricao,
      telefone: data.telefone,
      instagram: data.instagram,
      primaryColor: data.primaryColor,
      accentColor: data.accentColor,
    },
  });
}
```

With `acessoAte`, `trialFim`, `canceladoEm` all `null` and `acessoVitalicio: false`, `avaliarAcesso` hits the fail-closed branch (`lib/avaliar-acesso.ts:89-91`) and returns `BLOQUEADO` immediately — and stays `BLOQUEADO` forever, because nothing in the current codebase ever writes `trialFim` after creation (only `registerComUsuario` and, later, the Fase 3 payment webhook write billing facts). This also violates `INV-1` in `prisma/checks/backfill-billing.sql:23-31` ("nenhuma empresa ativa pode ficar sem trialFim"), which this same phase introduces as a hard product invariant.

**Fix:** Either (a) make `create()` set the same trial defaults as `registerComUsuario()` (extract the shared logic), or (b) if `create()` is intentionally an internal/admin-only path that should not grant a trial, make that explicit and gate the endpoint so it cannot produce an unusable Empresa silently. At minimum, `avaliarAcesso`'s fail-closed default should not be reachable from a "successful" creation call with a 201 response and no indication anything is wrong.

```ts
async create(data: CreateEmpresaDTO) {
  const agora = new Date();
  const trialFim = meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1);

  return prisma.empresa.create({
    data: {
      nome: data.nome,
      slug: data.slug,
      logo: data.logo,
      banner: data.banner,
      descricao: data.descricao,
      telefone: data.telefone,
      instagram: data.instagram,
      primaryColor: data.primaryColor,
      accentColor: data.accentColor,
      trialFim,
      ultimoStatusAuditado: StatusAcesso.TRIAL,
    },
  });
}
```

## Warnings

### WR-01: `agendarPosResposta` only catches promise rejections, not synchronous throws from `tarefa`

**File:** `lib/agendar-pos-resposta.ts:28-33`
**Issue:** The documented contract is "a falha da auditoria nunca derruba o request" (ASVS V7). The safety net is `tarefa().catch(...)`, which only protects against a *rejected promise*. If `tarefa` were ever to throw synchronously before returning a promise (e.g. a future refactor that does validation before calling `acessoService.registrarTransicao`), that throw happens inside `seguro()` itself and is not caught by `.catch`. In the out-of-request-scope fallback path (`void seguro()`, line 42) that throw propagates synchronously into `agendarPosResposta`'s caller — `revalidarConta` — whose surrounding `try/catch` (`lib/auth-guard.ts:50-128`) would then turn a *successful* account lookup into a fail-closed `null`, locking the user out over what should have been a best-effort audit failure. No current caller triggers this (today `tarefa` is always `() => acessoService.registrarTransicao(...)`, which never throws synchronously), but the wrapper's own guarantee is narrower than it documents itself to be.
**Fix:** Wrap the call itself, not just the returned promise:
```ts
const seguro = () =>
  Promise.resolve()
    .then(tarefa)
    .catch((erro) => console.error("[acesso] efeito pós-resposta falhou:", erro));
```

### WR-02: Catch around `after()` is untyped/unconditional, silently masking non-"outside scope" failures

**File:** `lib/agendar-pos-resposta.ts:34-43`
**Issue:** The `catch {}` around `after(seguro)` is documented as handling the specific `E468` ("was called outside a request scope") case, but it catches *any* exception `after()` might throw and always falls back to running the audit task inline/synchronously. If `after()` ever throws for an unrelated reason (Next.js internal bug, invalid argument, etc.) while actually inside a request scope, this silently defeats the entire purpose of the wrapper (T-02-17: keep the audit write off the response's critical path) instead of surfacing the anomaly.
**Fix:** At minimum log when the fallback path is taken so an unexpected `after()` failure inside a real request is observable, e.g.:
```ts
try {
  after(seguro);
} catch (erro) {
  void seguro();
}
```
stays silent by design for the expected `E468` case, but consider distinguishing it (e.g. checking `error?.message?.includes("outside a request scope")`) so other failure modes aren't swallowed identically.

### WR-03: `empresaService.create` test does not cover the billing-defaults gap

**File:** `app/services/empresa.service.test.ts:469-485`
**Issue:** The only test for `empresaService.create` asserts `nome`/`slug` via `expect.objectContaining`, which by construction cannot catch missing fields (CR-01). Contrast with the much stricter exact-match assertions used elsewhere in this same file for `registerComUsuario` (explicitly justified in comments as "a rede que detecta campo inesperado"/D-17 asserções exatas). This asymmetry is exactly why CR-01 shipped unnoticed.
**Fix:** Add a test asserting the full `data` payload for `create()` (or explicitly assert `trialFim`/`ultimoStatusAuditado` are present) once CR-01 is fixed, so a future regression is caught.

### WR-04: Relative imports in a phase-touched test file violate the project's import convention

**File:** `app/api/empresas/[id]/route.test.ts:3-4,14`
**Issue:** CLAUDE.md's Import Organization convention states: "Do not use relative paths like `../` for cross-directory imports; use `@/` instead." This file (last touched in this phase per `git log`, commit `2deb48a test(02-02)`) uses `../../../../tests/helpers/request`, `../../../../tests/helpers/auth`, and `../../../services/empresa.service` instead of `@/tests/...` / `@/app/services/...`. The pattern pre-dates this phase, but the phase modified this file without correcting it.
**Fix:**
```ts
import { buildRequest, buildParams } from "@/tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "@/tests/helpers/auth";
import { empresaService } from "@/app/services/empresa.service";
```

## Info

### IN-01: `POST /api/empresas` lets any authenticated user create unrelated, ownerless companies

**File:** `app/api/empresas/route.ts:30-41` (consumer of `empresaService.create`, outside this review's required file list — flagged for awareness only)
**Issue:** `POST /api/empresas` only calls `requireAuth(request)` — it does not tie the created `Empresa` to the caller's own tenant, and no `Usuario` is created alongside it (unlike `registerComUsuario`). Any authenticated ADMIN of *any* company can spawn arbitrary new, ownerless `Empresa` rows. Combined with CR-01, each such row is also permanently `BLOQUEADO` and unreachable by any login, since only `registerComUsuario` creates a `Usuario`. This looks like pre-existing/legacy surface from before self-service registration existed rather than something introduced by this phase, but it's worth confirming whether this route should still be exposed at all now that `registerComUsuario` is the canonical creation path.
**Fix:** Confirm intended use of this endpoint; if it's dead/legacy, consider removing or restricting it; if it's intentionally an internal provisioning tool, it should also create the billing facts (see CR-01) and arguably an owning `Usuario`.

---

_Reviewed: 2026-08-31T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
