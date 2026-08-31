# Phase 1: Pré-requisitos de Produção - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 10 (3 new, 7 modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `lib/prisma.ts` | modified | config / infra singleton | connection lifecycle | itself (`lib/prisma.ts` lines 1-20) + `.agents/skills/prisma-client-api/references/constructor.md` | exact (self-edit) |
| `lib/auth-guard.ts` | **new** | DAL / utility (auth) | request-response, read-only query | `app/[slug]/_lib/empresa.ts` (React.cache DAL) + `app/services/usuario.service.ts` (select projection) | composite exact |
| `lib/session.ts` | modified | middleware / auth (cookie) | request-response | itself lines 45-59 | exact (self-edit) |
| `lib/api-auth.ts` | modified | middleware / auth (Bearer) | request-response | itself lines 12-25 | exact (self-edit) |
| `app/[slug]/admin/login/page.tsx` | modified | page (server component) | request-response | itself lines 1-18 + `app/registro/page.tsx:1-12` | exact (self-edit) |
| `app/registro/page.tsx` | modified | page (server component) | request-response | itself lines 1-12 | exact (self-edit) |
| `tests/setup/prisma-mock.ts` | modified | test setup | fixture | itself lines 13-15 + `tests/helpers/auth.ts` | exact (self-edit) |
| `lib/auth-guard.test.ts` | **new** | test (unit, node env) | — | `app/services/usuario.service.test.ts:1-45` (prismaMock stub pattern) | exact |
| `lib/prisma.test.ts` | **new** | test (unit, node env) | — | `lib/session.test.ts:1-27` (vi.hoisted/vi.mock header pattern) | role-match |
| `lib/session.test.ts` / `lib/api-auth.test.ts` | modified | test | — | themselves | exact (self-edit) |

Optional (Pitfall 8, coherence): `app/api/auth/login/route.ts:24` and `app/[slug]/admin/_lib/auth-actions.ts:26` — both check `!usuario || !usuario.ativo` without `empresa.deletedAt`.

---

## Pattern Assignments

### `lib/auth-guard.ts` (NEW — DAL, request-response)

**Analog A — `React.cache()` DAL wrapper:** `app/[slug]/_lib/empresa.ts` (whole file, 13 lines)

```typescript
import { cache } from "react";
import { notFound } from "next/navigation";
import { empresaService } from "@/app/services/empresa.service";

export const getEmpresaCatalogo = cache(async (slug: string) => {
  const empresa = await empresaService.findBySlug(slug);

  if (!empresa) {
    notFound();
  }

  return empresa;
});
```

Copy: `import { cache } from "react"`, `export const X = cache(async (...) => {...})` at module top-level, `@/` alias imports. **Diverge:** `auth-guard` must NOT call `notFound()`/`redirect()` — it returns `null` (the caller decides the failure mode, per RESEARCH Pattern 2 / Pitfall 5).

**Analog B — explicit `select` projection (never leak `senhaHash`):** `app/services/usuario.service.ts:20-53`

```typescript
const SAFE_SELECT = {
  id: true,
  nome: true,
  email: true,
  role: true,
  ativo: true,
  empresaId: true,
  createdAt: true,
  updatedAt: true,
  empresa: {
    select: { id: true, nome: true, slug: true },
  },
} as const;

class UsuarioService {
  async list(empresaId: string) {
    return prisma.usuario.findMany({
      where: { empresaId },
      select: SAFE_SELECT,
      orderBy: { nome: "asc" },
    });
  }
}
```

Copy: named module-level `as const` projection, nested `empresa: { select: { slug: true } }`, `where` always carrying `empresaId` (C-07). `auth-guard.ts` uses its own narrower projection (id, email, role, empresaId, empresa.slug) — do not reuse `SAFE_SELECT` (it's not exported and carries extra fields).

**Analog C — error handling / logging:** `app/api/auth/login/route.ts:51-61`

```typescript
} catch (error) {
  console.error(error);
  return NextResponse.json({ message: "Erro ao autenticar." }, { status: 500 });
}
```

Copy: `console.error` for the exception, generic message outward (C-04). **Diverge:** in `auth-guard.ts` the catch returns `null` (fail-closed, D-01) and the log carries a prefix, e.g. `console.error("[auth-guard] falha ao revalidar conta:", error)`.

**Anti-pattern to avoid here:** the `try/catch` lives ONLY inside `revalidarConta`, wrapping only the Prisma call. `grep -c "try {" lib/session.ts` must stay 0 (Pitfall 5).

---

### `lib/session.ts` (MODIFIED — auth middleware, cookie)

**Self-analog (lines 45-59) — the shape to preserve:**

```typescript
/**
 * DAL principal do admin: toda page/layout/Server Action do admin deve
 * chamar isso antes de tocar dados. [...]
 */
export async function requireAdminSession(slug: string): Promise<AuthTokenPayload> {
  const session = await getSession();

  if (!session || session.empresaSlug !== slug) {
    redirect(`/${slug}/admin/login`);
  }

  return session;
}
```

Copy: JSDoc block above exported auth functions (this file is the only one in `lib/` with them — keep the convention), `redirect()` as a bare statement (never `return redirect(...)`, never inside `try`), return type stays `Promise<AuthTokenPayload>` (~40 call sites depend on it).

**Existing null-return guard pattern to mirror in the new `getVerifiedSession`** (lines 30-43):

```typescript
export async function getSession(): Promise<AuthTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    return await verifyAuthToken(token);
  } catch {
    return null;
  }
}
```

Copy: early-return `null`, no thrown errors on the "not logged in" path.

**Do NOT call `destroySession()`** (lines 21-24) from `requireAdminSession` — `cookieStore.delete` is illegal during Server Component render (Pitfall 2). It stays reachable only from the `logout` Server Action.

---

### `lib/api-auth.ts` (MODIFIED — auth middleware, Bearer)

**Self-analog (whole file, 25 lines):**

```typescript
import { AuthTokenPayload, verifyAuthToken } from "@/lib/jwt";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireAuth(request: Request): Promise<AuthTokenPayload> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new AuthError("Não autenticado.");
  }

  try {
    return await verifyAuthToken(token);
  } catch {
    throw new AuthError("Token inválido ou expirado.");
  }
}
```

Copy: reuse the existing `AuthError` (C-05, do not create a new class); keep messages short, Portuguese, ending with a period, and generic (no "usuário inativo" vs "empresa removida" distinction). **Structural change required:** the `return await verifyAuthToken(token)` inside `try` must become `payload = await verifyAuthToken(token)` so the revalidation happens after the `try/catch`, not inside it.

---

### `lib/prisma.ts` (MODIFIED — infra singleton)

**Self-analog (current file, the thing being fixed):**

```typescript
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

Copy: the `globalThis as unknown as { prisma: PrismaClient | undefined }` cast and the `??` fallback — both stay. Change: drop the `NODE_ENV` guard (assignment becomes unconditional) and move `new PrismaPg(...)` into a `createPrismaClient()` factory so `DATABASE_URL` is not read at import time. Full target in RESEARCH § Pattern 1.

---

### `app/[slug]/admin/login/page.tsx` and `app/registro/page.tsx` (MODIFIED — server pages)

**Analog — `app/registro/page.tsx:1-12` (the smaller, cleaner of the two):**

```typescript
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function RegistroPage() {
  const session = await getSession();

  if (session) {
    redirect(`/${session.empresaSlug}/admin`);
  }
  // ...
}
```

**Sibling in `login/page.tsx:12-17`:**

```typescript
const { slug } = await params;
const session = await getSession();

if (session && session.empresaSlug === slug) {
  redirect(`/${slug}/admin`);
}
```

Change in both: swap `getSession` → `getVerifiedSession` (import from `@/lib/session`). Nothing else in either file moves — the guard stays above data fetching (`getEmpresaCatalogo`) and above JSX, and `redirect()` stays a bare statement. This is the Pitfall 1 blocker (redirect loop), not cosmetic.

Note: `login/page.tsx:3` uses a relative import (`../../_lib/empresa`) — a pre-existing C-02 violation. Leave it; out of scope.

---

### `tests/setup/prisma-mock.ts` (MODIFIED — test setup)

**Self-analog (whole file, 15 lines):**

```typescript
vi.mock("@/lib/prisma", () => ({ prisma: mockDeep<PrismaClient>() }));

const { prisma } = await import("@/lib/prisma");
export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});
```

**Fixture values to match — `tests/helpers/auth.ts`:**

```typescript
export const testAuthPayload: AuthTokenPayload = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: "empresa-teste",
  email: "admin@teste.com",
  role: "ADMIN",
};
```

Change: add the default active-account stub **inside the same `beforeEach`, immediately after `mockReset`** (ordering matters — a stub in another file's `beforeEach` registered earlier gets wiped). Values must line up with `testAuthPayload` (`id: "user-1"`, `empresaId: "empresa-1"`, `empresa: { slug: "empresa-teste" }`). Full snippet in RESEARCH § Pitfall 3. This keeps the 14 existing Bearer-token test files green (success criterion #4).

---

### `lib/auth-guard.test.ts` (NEW — unit test)

**Analog — `app/services/usuario.service.test.ts:1-36`:**

```typescript
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";

const usuarioBase = {
  id: "usuario-1",
  nome: "Usuário Teste",
  email: "usuario@teste.com",
  role: "ADMIN",
  ativo: true,
  empresaId: "empresa-1",
  empresa: { id: "empresa-1", nome: "Loja Teste", slug: "loja-teste" },
};

describe("usuarioService.list", () => {
  it("lista usuários da empresa ordenados por nome", async () => {
    prismaMock.usuario.findMany.mockResolvedValue([usuarioBase] as never);
    await usuarioService.list("empresa-1");
    expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ /* ... */ })
    );
  });
});
```

Copy: `// @vitest-environment node` first line; module-level fixture object named `<entity>Base`; `prismaMock.<model>.<method>.mockResolvedValue(x as never)`; assertions via `expect.objectContaining`; Portuguese `it()` descriptions. For the fail-closed case use `prismaMock.usuario.findFirst.mockRejectedValue(new Error("db down"))` and assert `null`.

**Do NOT** write a dedupe assertion (`cache()` is passthrough under Vitest — Pitfall 6).

---

### `lib/prisma.test.ts` (NEW — unit test)

**Analog — `lib/session.test.ts:1-27` (mock-header structure):**

```typescript
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const { cookieStore, redirectMock } = vi.hoisted(() => { /* ... */ });

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { createAdminSession, /* ... */ } from "./session";
```

Copy: `// @vitest-environment node`, module mocks declared above the imports of the unit under test, relative `./` import for the co-located module. **Diverge:** this file uses `vi.unmock("@/lib/prisma")` (to escape the global mock) plus `vi.resetModules()` / `vi.stubEnv("NODE_ENV", "production")` / `delete globalThis.prisma` in `afterEach`. Full verified test body in RESEARCH § Code Examples — it was proven to fail on today's code and pass after the fix.

---

## Shared Patterns

### Fail-closed auth decision (D-01)
**Source:** new `lib/auth-guard.ts` (`revalidarConta` returns `ContaAtiva | null`)
**Apply to:** `lib/session.ts`, `lib/api-auth.ts`
Each consumer maps `null` to its own failure contract — `redirect()` in the Server Component layer, `throw new AuthError(...)` in the Route Handler layer. Neither consumer adds a `try/catch`.

### Multi-tenant filtering (C-07)
**Source:** `app/services/usuario.service.ts:39-41` — `where: { empresaId }`
**Apply to:** the `revalidarConta` query — filter on `id` AND `empresaId` together, never `id` alone.

### Explicit `select` projection (C-06)
**Source:** `app/services/usuario.service.ts:20-34` (`SAFE_SELECT`)
**Apply to:** `lib/auth-guard.ts`. Never `include` on `Usuario` (drags `senhaHash`).

### Error logging (C-04)
**Source:** `app/api/auth/login/route.ts:51-52`
```typescript
console.error(error);
```
**Apply to:** the `catch` in `revalidarConta`. Generic message to the client; details only in the server log.

### `@/` alias imports (C-02)
**Source:** `lib/session.ts:3`, `lib/api-auth.ts:1`, `app/services/usuario.service.ts:1-2`
**Apply to:** all new/edited files. Exception: co-located test files import the unit under test relatively (`./session`, `./api-auth`) — that is the established convention, keep it.

### Auth failure messages
**Source:** `lib/api-auth.ts:17,23` — `"Não autenticado."`, `"Token inválido ou expirado."`
**Apply to:** the new revalidation rejection, e.g. `"Sessão inválida."` — Portuguese, terse, terminal period, no account-state leakage.

---

## No Analog Found

None. Every file in this phase has either a direct self-analog (edit) or a close structural analog already in the codebase.

The one genuinely novel element — a `React.cache()`-wrapped function that returns `null` instead of calling `notFound()`/`redirect()` — is a deliberate divergence from `getEmpresaCatalogo`, justified in RESEARCH § Pattern 2 (the two consumers have incompatible failure contracts).

---

## Metadata

**Analog search scope:** `lib/`, `app/services/`, `app/[slug]/_lib/`, `app/[slug]/admin/`, `app/registro/`, `app/api/auth/`, `tests/setup/`, `tests/helpers/`
**Files read:** 13
**Pattern extraction date:** 2026-08-31
