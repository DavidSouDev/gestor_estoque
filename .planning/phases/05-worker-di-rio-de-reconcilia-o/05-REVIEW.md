---
phase: 05-worker-di-rio-de-reconcilia-o
reviewed: 2026-09-01T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - prisma/migrations/20260901195303_add_worker_diario_causa/migration.sql
  - prisma/checks/worker-diario-enum.sql
  - prisma/schema.prisma
  - app/services/webhook-asaas.service.test.ts
  - lib/billing/cron-config.ts
  - lib/billing/cron-config.test.ts
  - app/services/reconciliacao.service.ts
  - app/services/reconciliacao.service.test.ts
  - app/api/cron/reconciliacao-diaria/route.ts
  - app/api/cron/reconciliacao-diaria/route.test.ts
  - e2e/worker-reconciliacao.spec.ts
  - scripts/seed-fatos-billing.ts
  - e2e/helpers.ts
  - e2e/bloqueio-por-inadimplencia.spec.ts
  - .github/workflows/tests.yml
  - scripts/gates-fase-05.mjs
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-09-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Reviewed the worker diário de reconciliação (WRK-01/WRK-02): the migration that
adds `WORKER_DIARIO` to `CausaTransicaoAcesso`, the pure planning service
(`reconciliacao.service.ts`), the `GET /api/cron/reconciliacao-diaria` handler,
their unit/e2e tests, the seed script used to build fixtures, and the phase's
own static gate script.

The core logic is sound and well-tested: the pure `planejarReconciliacao`
function correctly avoids the divide-by-zero on an empty batch, the
"perda de acesso" predicate correctly treats `anterior === null` as "tinha
acesso" (conservative direction), the mass-block circuit breaker's threshold
(`> 20%`) and floor (`>= 5`) are exercised at the exact boundary in both the
service test and the route test, batches are isolated with `Promise.allSettled`
(not `Promise.all`), and the bearer-secret comparison is done via
SHA-256-then-`timingSafeEqual` to avoid both a value leak and a length leak. I
did not find a logic bug or a security hole in the shipped runtime code path.

The issues found are all process/tooling gaps rather than runtime defects: the
phase ships two static-verification artifacts — `scripts/gates-fase-05.mjs`
and `prisma/checks/worker-diario-enum.sql` — whose own documentation explains
in detail why a human code reviewer would miss the regressions they check for,
yet neither is wired into `.github/workflows/tests.yml` or any `npm` lifecycle
hook. They only run if someone remembers to invoke them by hand. There is also
an ordering issue in the dev-only seed script's self-consistency check.

## Warnings

### WR-01: `gates:fase-05` (and `gates:fase-04`) are never invoked in CI

**File:** `.github/workflows/tests.yml`
**Issue:** `scripts/gates-fase-05.mjs`'s own header explains that it exists
because four of this phase's decisions are "invisible in code review" and
"none of them break a test" (swapping `Promise.allSettled` for `Promise.all`,
reading a platform-specific cron header, reintroducing post-response
scheduling, adding `ultimoStatusAuditado` to a new `select`). `package.json`
exposes it as `npm run gates:fase-05` (and the pre-existing `gates:fase-04`),
but `.github/workflows/tests.yml` never runs either script — only `lint` and
`test:coverage` run in the `unit` job, and `test:e2e` in the `e2e` job. A PR
that reintroduces exactly one of those four regressions merges green today: no
lint rule, no unit test, and no CI step catches it. The gate script is
effectively dead weight unless a human remembers to run it locally before
every merge.
**Fix:**
```yaml
      - name: Lint
        run: npm run lint

      - name: Phase gates
        run: |
          npm run gates:fase-04
          npm run gates:fase-05

      - name: Run unit & component tests
        run: npm run test:coverage
```

### WR-02: `prisma/checks/worker-diario-enum.sql` (INV-05-01) is never executed anywhere

**File:** `prisma/checks/worker-diario-enum.sql`
**Issue:** The file's own header states the invariant it protects: "ler o
`prisma/schema.prisma` prova apenas a INTENÇÃO... o worker estoura em runtime
na primeira transição gravada" if the target Postgres catalog doesn't actually
have `WORKER_DIARIO` in `CausaTransicaoAcesso` (e.g., a deploy that applies the
Prisma schema without running `prisma migrate deploy`, or a manually-drifted
database). Nothing in `.github/workflows/tests.yml`, `package.json`, or any
other reviewed file calls
`npx prisma db execute --file prisma/checks/worker-diario-enum.sql`. The CI
`e2e` job does run `npx prisma migrate deploy` before the e2e suite, which
happens to keep CI itself safe, but the check this file describes — verifying
an arbitrary *target* database, e.g. a production one before/after a deploy —
is not automated anywhere in the reviewed files, so it can only catch the
class of failure it was written for if a human remembers to run it by hand
against that target.
**Fix:** Add a documented step to the deploy runbook (or a CI job gated on the
deploy environment) that runs this check against the target database right
after migrations, and fail the deploy if it exits non-zero:
```bash
npx prisma db execute --file prisma/checks/worker-diario-enum.sql
```

### WR-03: `scripts/seed-fatos-billing.ts` persists the write before validating it

**File:** `scripts/seed-fatos-billing.ts:191-230`
**Issue:** The consistency guard —
```ts
if (derivado.status === StatusAcesso.BLOQUEADO && status === "cancelado") {
  erro("os fatos de `cancelado` derivaram BLOQUEADO — canceladoEm não foi gravado.");
}
```
runs *after* `prisma.empresa.update(...)` has already committed and after the
success banner (`console.log(...)`) has already printed. If this guard ever
fires (e.g., someone edits `fatosPara()` in the future and breaks the
correlation between `--status cancelado` and the fact combination that
produces `CANCELADO`), the script still leaves the wrong facts persisted in
the database and only reports the problem via `process.exitCode = 1` on exit —
after e2e specs consuming this fixture (`e2e/bloqueio-por-inadimplencia.spec.ts`,
`e2e/worker-reconciliacao.spec.ts`) may already be running against the corrupt
row. This turns a "rede de segurança" into a confusing test failure downstream
instead of a clear failure at the point of the bug.
**Fix:** Validate the derived status against the requested status *before*
issuing the `prisma.empresa.update` call (the facts and `derivado` are already
computed earlier in `principal()`), so a mismatch aborts without writing:
```ts
const derivado = avaliarAcesso(fatos, agora);

if (derivado.status === StatusAcesso.BLOQUEADO && status === "cancelado") {
  return erro("os fatos de `cancelado` derivaram BLOQUEADO — canceladoEm não foi gravado. Nada escrito.");
}

// só então: await prisma.empresa.update(...)
```

## Info

### IN-01: `CONCORRENCIA = 5` depends on an assumption enforced nowhere

**File:** `app/api/cron/reconciliacao-diaria/route.ts:118`
**Issue:** The JSDoc justifies the batch size of 5 by the `pg` driver's
default pool `max = 10` (`lib/prisma.ts` does not configure it explicitly, as
confirmed by inspection). That's a reasonable margin today, but nothing ties
`CONCORRENCIA` to the actual pool size — if `lib/prisma.ts` is later changed
to set an explicit (smaller) `max`, or another part of the app starts holding
more concurrent connections during the cron window, this constant would
silently stop being safe and no test or gate would catch it.
**Fix:** Either derive `CONCORRENCIA` from the same constant that configures
the pool (single source of truth), or add a one-line comment cross-reference
in `lib/prisma.ts` pointing back at this constant so a future change to the
pool size is forced to notice this dependency.

### IN-02: `argumento()` in the seed script doesn't guard against a missing value that looks like another flag

**File:** `scripts/seed-fatos-billing.ts:72-78`
**Issue:** `argumento(nome)` returns `process.argv[posicao + 1]` unconditionally.
Given a malformed invocation such as
`seed:billing -- --slug --status bloqueado` (missing the slug value), it would
silently read `"--status"` as the slug value instead of failing with a clear
"missing --slug" message — the later `if (!slug)` check only guards against
the flag being entirely absent, not against it being immediately followed by
another flag.
**Fix:** Reject values that themselves look like a flag:
```ts
function argumento(nome: string): string | undefined {
  const posicao = process.argv.indexOf(`--${nome}`);
  if (posicao === -1) return undefined;
  const valor = process.argv[posicao + 1];
  return valor?.startsWith("--") ? undefined : valor;
}
```

---

_Reviewed: 2026-09-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
