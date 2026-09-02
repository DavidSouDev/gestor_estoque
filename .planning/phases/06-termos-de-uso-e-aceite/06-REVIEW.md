---
phase: 06-termos-de-uso-e-aceite
reviewed: 2026-09-02T00:00:00Z
depth: standard
files_reviewed: 46
files_reviewed_list:
  - app/[slug]/admin/aceitar-termos/_components/aceitar-button.tsx
  - app/[slug]/admin/aceitar-termos/_components/aceite-card.tsx
  - app/[slug]/admin/aceitar-termos/actions.test.ts
  - app/[slug]/admin/aceitar-termos/actions.ts
  - app/[slug]/admin/aceitar-termos/page.test.ts
  - app/[slug]/admin/aceitar-termos/page.tsx
  - app/api/assinaturas/checkout/route.test.ts
  - app/api/produtos/route.test.ts
  - app/api/termos/route.test.ts
  - app/api/termos/route.ts
  - app/registro/_components/register-form.test.tsx
  - app/registro/_components/register-form.tsx
  - app/registro/actions.test.ts
  - app/registro/actions.ts
  - app/registro/page.tsx
  - app/services/empresa.service.test.ts
  - app/services/empresa.service.ts
  - app/services/termo.service.test.ts
  - app/services/termo.service.ts
  - e2e/aceite-de-termos.spec.ts
  - e2e/bloqueio-por-inadimplencia.spec.ts
  - e2e/cadastro-e-login.spec.ts
  - e2e/combo-crud.spec.ts
  - e2e/helpers.ts
  - e2e/modo-simples.spec.ts
  - e2e/movimentacao-estoque.spec.ts
  - e2e/produto-crud-e-catalogo.spec.ts
  - e2e/promocao-crud.spec.ts
  - e2e/sessao-revogada.spec.ts
  - e2e/worker-reconciliacao.spec.ts
  - lib/api-auth.test.ts
  - lib/api-auth.ts
  - lib/auth-guard.test.ts
  - lib/auth-guard.ts
  - lib/session.test.ts
  - lib/session.ts
  - lib/termo-vigente.test.ts
  - lib/termo-vigente.ts
  - prisma/migrations/20260902120000_add_superadmin_role/migration.sql
  - prisma/migrations/20260902120100_add_termos_de_uso/migration.sql
  - prisma/migrations/20260902120200_seed_termo_v1/migration.sql
  - prisma/schema.prisma
  - scripts/gates-fase-06.mjs
  - scripts/seed-superadmin.ts
  - tests/setup/prisma-mock.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-09-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

Reviewed the full Terms-of-Use / mandatory-acceptance feature (TERM-01..TERM-04): the publish
endpoint (`POST /api/termos`), the TOCTOU-safe acceptance flow (`aceitar-termos/{page,actions}.tsx`),
the registration-time acceptance (`empresaService.registerComUsuario`), the `revalidarConta` /
`requireAuth` / `requireAdminSession` gates, the immutable `TermoDeUso`/`AceiteTermo` schema and
migrations, the SUPERADMIN seed script, and the phase's static gate script.

The implementation is unusually well defended: role-for-authorization is always re-read from the
database (never trusted from the 7-day JWT), `TermoDeUso` writes are enforced immutable at three
independent layers (service surface, grep gate, DB `ON DELETE RESTRICT`), the TOCTOU window on
both registration and acceptance is closed by comparing the client-supplied term id against a
fresh server read, and the redirect-loop hazard between `/bloqueado` and `/aceitar-termos` is
proven absent by both unit and e2e tests. `npx tsc --noEmit`, the full targeted Vitest suite (226
tests / 13 files), `eslint`, and `scripts/gates-fase-06.mjs` (5/5) all pass clean.

No blocker-level defects were found. Two warnings are worth fixing before this ships broadly: the
standalone guard in `aceitar-termos/{page.tsx,actions.ts}` does not re-validate the DB-fresh
`empresaSlug` the way `requireAdminSession` does (creating a narrower/inconsistent security
boundary for one route), and `scripts/seed-superadmin.ts` accepts the platform password as a bare
CLI argument, which leaks through `ps`/`/proc/<pid>/cmdline` and shell history. Two minor info-level
issues (a dead import and an unaccented user-facing error string) round out the findings.

## Warnings

### WR-01: `aceitar-termos` route re-implements the admin guard but drops the fresh-slug check

**File:** `app/[slug]/admin/aceitar-termos/page.tsx:51-61`, `app/[slug]/admin/aceitar-termos/actions.ts:43-51`

**Issue:** Every other protected admin surface goes through `requireAdminSession` (`lib/session.ts:124-166`),
which — after confirming the JWT — re-checks the **database-fresh** `conta.empresaSlug` against the
URL slug:

```ts
// lib/session.ts
if (!session || !conta || conta.empresaSlug !== slug) {
  redirect(`/${slug}/admin/login`);
}
```

That extra comparison is explicitly documented as closing "a janela do slug obsoleto" — `slug` is
mutable via `PATCH /api/empresas/[id]`, so a 7-day-old JWT can carry a slug the company no longer
has (and, since `slug` is `@unique`, that stale slug can even be re-claimed by a different company
in the meantime).

Because `aceitar-termos` lives outside the `(protected)` group (to avoid a redirect loop with the
guard that sends users there), it re-implements its own guard in both `page.tsx` and `actions.ts` —
but only compares the **stale JWT-derived** `session.empresaSlug` to the URL `slug`:

```ts
// page.tsx / actions.ts
if (!session || session.empresaSlug !== slug) {
  redirect(`/${slug}/admin/login`);
}
const conta = await revalidarConta(session.sub, session.empresaId);
// conta.empresaSlug (fresh) is never compared against `slug`
```

Concretely: after a slug rename, a user holding a stale cookie can still reach
`/{old-slug}/admin/aceitar-termos` and successfully submit the accept action under the old slug —
a path that `requireAdminSession` would have rejected with a forced re-login. The actual mutations
(`termoService.registrarAceite`, `logout`) are keyed off `session.sub`/`session.empresaId`, so this
isn't a cross-tenant data leak, and the next real protected navigation (`requireAdminSession`) will
still catch the mismatch and bounce to login — but it is a materially weaker boundary than the
pattern the rest of the codebase relies on, on the one page that is deliberately outside the shared
guard.

**Fix:** Add the same fresh-slug comparison used by `requireAdminSession` to both guards:

```ts
const conta = await revalidarConta(session.sub, session.empresaId);
if (!conta || conta.empresaSlug !== slug) {
  redirect(`/${slug}/admin/login`);
}
```

### WR-02: SUPERADMIN password passed as a CLI argument

**File:** `scripts/seed-superadmin.ts:152-176` (`lerArgumentos`, used via `--senha <credencial>`)

**Issue:** The script reads the platform SUPERADMIN's password from `process.argv` (`--senha`).
Unlike environment variables, command-line arguments are visible to any other local user via
`ps aux` / `/proc/<pid>/cmdline` for the process lifetime, and are very likely to end up in shell
history (`~/.bash_history`, `~/.zsh_history`) since the invocation is copy/pasted from the script's
own usage message. The script's JSDoc argues at length against putting the credential in `.env`
(a permanent secret for a one-time operation) but doesn't address this separate, well-known
CLI-argument exposure vector — and the credential in question is for the single most privileged
account in the system.

**Fix:** Prompt for the password interactively (e.g. `node:readline` with echo disabled) or read it
from stdin, instead of accepting it as a CLI flag:

```ts
import { createInterface } from "node:readline/promises";
// ...
const rl = createInterface({ input: process.stdin, output: process.stdout });
const credencial = await rl.question("Senha do SUPERADMIN: ");
rl.close();
```

If interactive input is impractical for CI usage, at minimum document that `--senha` should only be
used in trusted, ephemeral CI runners and never on shared/multi-tenant hosts.

## Info

### IN-01: Unused `Link` import in `app/registro/page.tsx`

**File:** `app/registro/page.tsx:1`
**Issue:** `import Link from "next/link";` is never used anywhere in the file (confirmed via
`eslint`, which flags `'Link' is defined but never used`). This predates phase 6 (the import was
already dead before this phase's changes) but the file is in scope for this review.
**Fix:** Remove the unused import.

### IN-02: Unaccented, user-facing error string in `termoService.publicar`

**File:** `app/services/termo.service.ts:76`
**Issue:** The 409 message returned to the API caller on a concurrent-publish race is missing
diacritics: `"Outra publicacao ocorreu em paralelo. Tente novamente."` (should be "publicação").
Every other user-facing string in this feature (and the rest of the codebase) uses fully-accented
Portuguese, so this stands out as a typo that will reach the SUPERADMIN operating the publish
endpoint.
**Fix:**
```ts
throw new HttpError("Outra publicação ocorreu em paralelo. Tente novamente.", 409);
```
Note: `app/api/termos/route.test.ts` only asserts `body.message` contains `"Tente novamente"`, so
this fix will not require a test update beyond the literal string if a stricter assertion is later
added.

---

_Reviewed: 2026-09-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
