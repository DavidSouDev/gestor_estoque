---
phase: 01-pr-requisitos-de-produ-o
reviewed: 2026-08-31T17:33:30Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - app/[slug]/admin/_lib/auth-actions.ts
  - app/[slug]/admin/login/page.tsx
  - app/api/auth/login/route.test.ts
  - app/api/auth/login/route.ts
  - app/registro/page.tsx
  - e2e/sessao-revogada.spec.ts
  - lib/api-auth.test.ts
  - lib/api-auth.ts
  - lib/auth-guard.test.ts
  - lib/auth-guard.ts
  - lib/prisma.test.ts
  - lib/prisma.ts
  - lib/session.test.ts
  - lib/session.ts
  - tests/setup/prisma-mock.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-31T17:33:30Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the auth-revalidation work for this phase: the new `revalidarConta` DAL (`lib/auth-guard.ts`), its wiring into `requireAuth` (API routes) and `requireAdminSession`/`getVerifiedSession` (page/session layer), the `lib/prisma.ts` singleton change (unconditional `globalThis` publication), and the login entry points (`app/api/auth/login/route.ts`, `app/[slug]/admin/_lib/auth-actions.ts`) plus their tests.

The fail-closed design is sound and well tested: `revalidarConta` swallows DB errors and returns `null`, every caller (`requireAuth`, `requireAdminSession`, `getVerifiedSession`) treats `null` as "not authorized," and the stale-slug / stale-session scenarios are covered by both unit tests and the `sessao-revogada.spec.ts` E2E test. I traced `getSession()` (the unverified, DB-less variant) to confirm it is never called directly by any protected page/action — only through the two verified wrappers — so there is no bypass path.

No BLOCKER-level issues were found. The findings below are about a duplicated business rule that creates drift risk ahead of the Phase 2 billing gate, an unhandled-rejection gap in the login Server Action, a loose type assertion on the JSON login body, and smaller consistency/test-hygiene gaps.

## Warnings

### WR-01: Login eligibility check duplicated verbatim in two places, with no shared source of truth

**File:** `app/api/auth/login/route.ts:27` and `app/[slug]/admin/_lib/auth-actions.ts:29`
**Issue:** Both login entry points independently re-implement the exact same eligibility predicate:
```ts
if (!usuario || !usuario.ativo || usuario.empresa.deletedAt) { ... }
```
This is a hand-written copy of the same rule `revalidarConta` encodes as a Prisma `where` clause, but `usuarioService.validatePassword` doesn't route through `revalidarConta` (it does its own `findUnique` + bcrypt check), so the condition had to be pasted twice. The code comments in both files even say "Mesma condição que o DAL aplica na revalidação" — acknowledging the duplication rather than eliminating it.
Per the project's own extension-point comment in `lib/auth-guard.ts` ("Ponto de extensão da Fase 2 (D-04): é aqui que `avaliarAcesso`... será plugada"), Phase 2 will add a payment/billing gate to `revalidarConta`. Because the login-time check is a separate copy-paste, that gate will need to be manually re-added to *both* login entry points, and it is easy to update one and forget the other — which would let a suspended/unpaid account still obtain a fresh 7-day session token from whichever entry point wasn't updated.
**Fix:** Extract the shared predicate into a single function (e.g. `isUsuarioElegivel(usuario)` in `lib/auth-guard.ts` or a new `lib/usuario-eligibility.ts`) and call it from both `route.ts` and `auth-actions.ts`, so the Phase 2 billing check only needs to be added in one place:
```ts
export function isContaElegivel(usuario: { ativo: boolean; empresa: { deletedAt: Date | null } }) {
  return usuario.ativo && !usuario.empresa.deletedAt;
}
```

### WR-02: `login()` Server Action has no error handling around the DB/bcrypt call

**File:** `app/[slug]/admin/_lib/auth-actions.ts:23`
**Issue:** `usuarioService.validatePassword(email, senha)` performs a Prisma query and a `bcrypt.compare`. Its API-route sibling (`app/api/auth/login/route.ts:5-67`) wraps the equivalent call in `try/catch` and returns a graceful `500`. `auth-actions.ts`'s `login()` has no `try/catch` at all — if the DB call throws (connection error, timeout, etc.), the rejection is unhandled and Next.js will render the nearest `error.tsx` boundary instead of the inline `state.error` banner the `LoginForm` component (`app/[slug]/admin/_components/login-form.tsx`) is built to display. This is inconsistent with the project's documented error-handling convention ("Use try-catch to wrap service calls... Catch AuthError and HttpError separately... Log unexpected errors with console.error()") and with the sibling implementation of the exact same login rule three lines away. There is also no test file for `auth-actions.ts` (`app/[slug]/admin/_lib/auth-actions.test.ts` does not exist), so this gap has no coverage forcing it to be noticed.
**Fix:**
```ts
export async function login(
  slug: string,
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { error: "Informe email e senha." };
  }

  let usuario;
  try {
    usuario = await usuarioService.validatePassword(email, senha);
  } catch (error) {
    console.error(error);
    return { error: "Erro ao autenticar." };
  }

  if (!usuario || !usuario.ativo || usuario.empresa.deletedAt) {
    return { error: "Email ou senha inválidos." };
  }
  // ...
}
```

### WR-03: `/api/auth/login` trusts an unchecked type assertion on the request body

**File:** `app/api/auth/login/route.ts:8`
**Issue:** `const { email, senha } = body as { email?: string; senha?: string };` is a compile-time-only assertion — there is no runtime validation that `email`/`senha` are actually strings. A caller can send `{ "email": {"$gt": ""}, "senha": 123 }` or an array, and `!email`/`!senha` will treat any truthy non-string value as "present," letting a non-string value flow into `usuarioService.validatePassword` → `prisma.usuario.findUnique({ where: { email } })`. In the current schema this will most likely throw a `PrismaClientValidationError`, which is caught by the outer `try/catch` and surfaced as a generic `500` — the wrong status code for what is actually a malformed/invalid request (`400`), and a class of input that should never reach the ORM layer un-typed. The Server Action counterpart is safer here because `formData.get()` values are coerced with `String(...)` before use.
**Fix:** Validate the shape before use (e.g. with a small manual check or a `zod` schema), and return `400` for non-string input:
```ts
const { email, senha } = body as { email?: unknown; senha?: unknown };
if (typeof email !== "string" || typeof senha !== "string" || !email || !senha) {
  return NextResponse.json({ message: "Informe email e senha." }, { status: 400 });
}
```

### WR-04: No rate limiting / brute-force protection on the login endpoints

**File:** `app/api/auth/login/route.ts:5`, `app/[slug]/admin/_lib/auth-actions.ts:11`
**Issue:** Both login entry points call `bcrypt.compare` with no attempt throttling, lockout, or delay. An attacker can script unlimited password guesses against `POST /api/auth/login` (and the equivalent Server Action) for any known email. This is a standard control for any credential-checking endpoint and is squarely inside the surface reviewed here (both files exist specifically to authenticate credentials).
**Fix:** Add a rate limiter keyed by email and/or IP (e.g. a small in-memory/Redis token bucket, or an edge-level solution) in front of both entry points, and consider a generic exponential backoff response once the project has an infra target for shared rate-limit state.

## Info

### IN-01: Unused `Link` import in `app/registro/page.tsx`

**File:** `app/registro/page.tsx:1`
**Issue:** `import Link from "next/link";` is never referenced in the component body (confirmed by `eslint`: `'Link' is defined but never used`). Dead import.
**Fix:** Remove the unused import, or restore the `<Link>` element if one was meant to be there (e.g., a "already have an account? Log in" link, which is currently absent from the page).

### IN-02: Email is trimmed on one login entry point but not the other

**File:** `app/[slug]/admin/_lib/auth-actions.ts:16` vs `app/api/auth/login/route.ts:8`
**Issue:** The Server Action does `String(formData.get("email") ?? "").trim()`, but the API route does no trimming (`const { email, senha } = body as {...}`). The same logical "log in with this email" operation behaves differently depending on which entry point is used — a JSON client sending `"  admin@teste.com "` will fail to authenticate via the API even though the exact same credentials succeed through the web form.
**Fix:** Normalize (`.trim()`, and optionally `.toLowerCase()` if emails are stored case-insensitively) in one shared place both entry points call, consistent with WR-01's suggested extraction.

### IN-03: Inconsistent `console.error` suppression across the auth test suites

**File:** `app/api/auth/login/route.test.ts:102-110`
**Issue:** The "retorna 500 quando o service lança um erro inesperado" test triggers the route's `console.error(error)` call but does not spy/suppress it, unlike the equivalent fail-closed error-path tests in `lib/api-auth.test.ts:54-68`, `lib/auth-guard.test.ts:50-60`, and `lib/session.test.ts:136-147`, which all wrap the expected `console.error` call with `vi.spyOn(console, "error").mockImplementation(() => {})`. This is a minor inconsistency that produces unnecessary noise in CI test output for this one test.
**Fix:**
```ts
it("retorna 500 quando o service lança um erro inesperado", async () => {
  const erroSilenciado = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(usuarioService.validatePassword).mockRejectedValue(new Error("falha no banco"));
  // ...
  erroSilenciado.mockRestore();
});
```

---

_Reviewed: 2026-08-31T17:33:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
