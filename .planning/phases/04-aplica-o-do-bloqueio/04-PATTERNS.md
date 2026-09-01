# Phase 4: Aplicação do Bloqueio - Pattern Map

**Mapped:** 2026-09-01
**Files analyzed:** 24 (15 modified, 9 new)
**Analogs found:** 22 / 24

> Every file below has a real in-repo analog except the two marked in §No Analog Found.
> Line numbers refer to the file state at mapping time.

---

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|---|
| `lib/avaliar-acesso.ts` (+ `acessoBloqueado`, `podePublicarCatalogo`) | mod | utility (pure) | transform | itself — `avaliarAcesso` (`lib/avaliar-acesso.ts:52-110`) | exact |
| `lib/session.ts` (gate in `requireAdminSession` + payment variant) | mod | middleware (DAL) | request-response | itself — `requireAdminSession` (`lib/session.ts:90-104`) | exact |
| `lib/api-auth.ts` (gate + `permitirEmpresaBloqueada`) | mod | middleware (DAL) | request-response | itself — `requireAuth` (`lib/api-auth.ts:26-51`) | exact |
| `app/services/empresa.service.ts` (`findPublicavelBySlug/ById`, `findBrandingBySlug`, gated `findBySlug`) | mod | service | CRUD read | `empresaService.findBranding` / `resolveIdBySlug` (`:223-257`) | exact |
| `app/services/produto.service.ts` (`findCatalogoById` nested tenant gate) | mod | service | CRUD read | `produtoService.findCatalogoById` (`:101-111`) | exact |
| `app/services/combo.service.ts` (same) | mod | service | CRUD read | `comboService.findCatalogoById` (`combo.service.ts:74-84`) | exact |
| `app/api/catalogo/produtos/route.ts` | mod | route | request-response | itself (`:5-42`) | exact |
| `app/api/catalogo/combos/route.ts` | mod | route | request-response | `app/api/catalogo/produtos/route.ts` | exact |
| `app/api/catalogo/produtos/[id]/route.ts` | mod (likely none) | route | request-response | itself (`:10-40`) | exact |
| `app/api/catalogo/combos/[id]/route.ts` | mod (likely none) | route | request-response | `app/api/catalogo/produtos/[id]/route.ts` | exact |
| `app/api/empresas/slug/[slug]/route.ts` | mod (likely none) | route | request-response | itself (`:10-40`) | exact |
| `app/api/assinaturas/checkout/route.ts` (opt-out flag) | mod | route | request-response | itself (`:14-52`) | exact |
| `app/[slug]/_lib/empresa.ts` (`getEmpresaCatalogo` gated + `getEmpresaBranding`) | mod | data-loader (React cache) | request-response | itself (`:5-13`) | exact |
| `app/[slug]/admin/login/page.tsx` (D-09 generic branding) | mod | page (server) | request-response | itself (`:7-86`) | exact |
| `app/[slug]/admin/(protected)/layout.tsx` (banner, both branches) | mod | layout (server) | request-response | itself (`:7-44`) | exact |
| `app/[slug]/admin/_lib/assinatura-actions.ts` | NEW | server action | request-response | `app/[slug]/admin/_lib/auth-actions.ts:11-53` | exact |
| `app/[slug]/admin/(protected)/_components/aviso-carencia.tsx` | NEW | component (server) | render-only | `login/page.tsx:54-71` (alert-ish block) + `login-form.tsx:49-66` | role-match |
| `app/[slug]/admin/_components/pagar-button.tsx` | NEW | component (client) | event-driven | `login-form.tsx:68-75` (submit button) | role-match |
| `app/[slug]/admin/bloqueado/page.tsx` | NEW | page (server) | request-response | `app/[slug]/admin/login/page.tsx:7-31` | exact |
| `app/[slug]/admin/bloqueado/_components/bloqueado-card.tsx` | NEW | component (server) | render-only | `login/page.tsx:22-85` shell | exact |
| `lib/session.test.ts`, `lib/api-auth.test.ts` (extend) | mod | test (unit, node) | — | themselves | exact |
| `app/[slug]/admin/(protected)/_components/aviso-carencia.test.tsx` | NEW | test (component) | — | `app/[slug]/admin/_components/login-form.test.tsx` | exact |
| `app/[slug]/_lib/empresa.test.ts`, `app/[slug]/admin/bloqueado/page.test.ts` | NEW | test (unit, node) | — | `lib/session.test.ts:1-32` (mock `next/navigation`) | exact |
| `e2e/bloqueio-por-inadimplencia.spec.ts` + `scripts/` seed | NEW | test (e2e) / script | batch | `e2e/sessao-revogada.spec.ts`, `scripts/resolvedor-ts.mjs` | partial |

---

## Pattern Assignments

### `lib/avaliar-acesso.ts` — add exhaustive predicates (utility, pure)

**Analog:** itself. Follow the existing file's shape exactly: module-level exported const, heavy normative JSDoc referencing decision IDs, zero I/O, zero `new Date()`.

**Import + constant pattern** (`lib/avaliar-acesso.ts:1-8`):
```typescript
import { StatusAcesso } from "@prisma/client";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";

/**
 * Carência única de 10 dias (D-04 e D-07): trial vencido e pagamento vencido
 * usam exatamente o mesmo prazo antes do bloqueio.
 */
export const DIAS_DE_CARENCIA = 10;
```

**Purity contract to preserve** (`:43-52`) — the new predicates must obey it too:
```typescript
/**
 * Função PURA. Não faz I/O, não lê o relógio por conta própria, não lê env e
 * nunca escreve nada ...
 * `agora` é sempre injetado pelo chamador ...
 */
export function avaliarAcesso(fatos: FatosDeAcesso, agora: Date): ResultadoAcesso {
```

**What to add:** the `Record<StatusAcesso, boolean>` exhaustive map from `04-RESEARCH.md` §Pattern 3 (`acessoBloqueado`, `podePublicarCatalogo`). Never `status !== "EM_DIA"`.

---

### `lib/session.ts` — navigation gate (middleware / DAL)

**Analog:** itself, `requireAdminSession` (`lib/session.ts:90-104`).

**Core pattern to extend** (`:90-104`) — note the `redirect()`-outside-try comment, which is load-bearing project convention:
```typescript
export async function requireAdminSession(slug: string): Promise<AuthTokenPayload> {
  const session = await getSession();

  const conta =
    session && session.empresaSlug === slug
      ? await revalidarConta(session.sub, session.empresaId)
      : null;

  // redirect() lança NEXT_REDIRECT — mantenha-o FORA de qualquer try/catch.
  if (!session || !conta || conta.empresaSlug !== slug) {
    redirect(`/${slug}/admin/login`);
  }

  return session;
}
```

**Doc-comment pattern** (`:70-89`): every guard function in this file carries a multi-paragraph rationale explaining ordering (DB only after token + slug validated) and past redirect-loop incidents (`:50-55`). The new blocked-status branch must be documented the same way, citing D-04/D-06 and the `bloqueado`-outside-`(protected)` reason.

**Non-redirecting sibling to copy for the payment variant** (`:58-68`) — `getVerifiedSession` shows the established "same checks, returns null instead of redirecting, caller decides" shape:
```typescript
export async function getVerifiedSession(): Promise<AuthTokenPayload | null> {
  const session = await getSession();
  if (!session) return null;
  const conta = await revalidarConta(session.sub, session.empresaId);
  return conta ? session : null;
}
```

---

### `lib/api-auth.ts` — API gate with single opt-out (middleware / DAL)

**Analog:** itself (`lib/api-auth.ts:26-51`).

**Error class + core pattern** (`:4-11`, `:42-50`):
```typescript
export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
// ...
  const conta = await revalidarConta(payload.sub, payload.empresaId);

  if (!conta) {
    // Mensagem única e genérica: cobre conta inativa, empresa removida E erro
    // de banco (D-01). Não vazar qual dos três é ao cliente.
    throw new AuthError("Sessão inválida.", 401);
  }

  return payload;
```

**Free-status comment to honour** (`:20-24`) — the banner/blocked screen can call `revalidarConta` again at no cost:
```
 * O retorno continua sendo o payload do token (não a conta fresca) ... Quem
 * precisar dos dados frescos chama `revalidarConta` diretamente — sai de graça,
 * o `React.cache` já tem o resultado no mesmo request.
```

**Add:** optional second param `opcoes: OpcoesDeAuth = {}` with `permitirEmpresaBloqueada?: boolean` (fail-closed default). Exactly one caller sets it — `app/api/assinaturas/checkout/route.ts:16`.

---

### `app/api/assinaturas/checkout/route.ts` — opt-out call site (route)

**Analog:** itself (`:14-52`). Only line 16 changes: `requireAuth(request, { permitirEmpresaBloqueada: true })`.

**Error-mapping pattern already present** (`:27-51`) — this is the shape all 29 handlers use and why no other route needs editing:
```typescript
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof HttpError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ message: "Erro ao iniciar o pagamento." }, { status: 500 });
  }
```

Also update the stale header comment at `:6-13` ("Não existe tela, botão ou Server Action chamando este endpoint hoje") — Phase 4 makes it false via the Server Action.

---

### `app/services/empresa.service.ts` — catalogue funnel + branding read (service, CRUD read)

**Analog:** `findBranding` / `resolveIdBySlug` in the same file — copy their exact shape for `findBrandingBySlug` and `findPublicavelBySlug`.

**Slim projected read pattern** (`:223-257`):
```typescript
  async findBranding(id: string) {
    return prisma.empresa.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, nome: true, slug: true, logo: true, banner: true,
        descricao: true, telefone: true, instagram: true,
        primaryColor: true, accentColor: true, modoInterface: true,
      },
    });
  }

  async resolveIdBySlug(slug: string) {
    const empresa = await prisma.empresa.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    });
    return empresa?.id ?? null;
  }
```

**Early-return-before-fanout pattern to preserve** (`:167-203`) — the `if (!empresa) return null;` at `:187` happens **before** the `Promise.all`. The blocked check goes in the same place, which is what buys query-count parity (Pitfall 2):
```typescript
  async findBySlug(slug: string) {
    const empresa = await prisma.empresa.findFirst({ where: { slug, deletedAt: null }, select: {...} });

    if (!empresa) {
      return null;
    }

    const [produtos, combos, promocoes] = await Promise.all([
      produtoService.listCatalogo(empresa.id),
      comboService.listCatalogo(empresa.id),
      promocaoService.listVigentesByEmpresa(empresa.id),
    ]);

    return { ...empresa, produtos, combos, promocoes };
  }
```

**Named module-level `select` const** — required by CLAUDE.md §Module Design; the file-local example is `PRODUTO_CATALOGO_SELECT` (`produto.service.ts:50-63`). Add `EMPRESA_PUBLICAVEL_SELECT` the same way (`as const`, module level, above the class).

**Allowlist comment style** (`:303-310`) — the model for writing a normative "do not simplify this" comment on the new gate.

**Singleton export** (`:349`): `export const empresaService = new EmpresaService();`

---

### `app/services/produto.service.ts` / `app/services/combo.service.ts` — tenant gate on by-id reads (service)

**Analog:** `produtoService.findCatalogoById` (`produto.service.ts:101-111`), byte-parallel to `comboService.findCatalogoById` (`combo.service.ts:74-84`):
```typescript
  async findCatalogoById(id: string) {
    return prisma.produto.findFirst({
      where: { id, ativo: true, visivelCatalogo: true, deletedAt: null },
      select: PRODUTO_CATALOGO_SELECT,
    });
  }
```
Combo differs only in `visivel` vs `visivelCatalogo` and `COMBO_CATALOGO_SELECT`. Whatever is done to one must be mirrored in the other.

**Select-const pattern to spread from** (`produto.service.ts:50-63`) — the nested `empresa: { select: EMPRESA_PUBLICAVEL_SELECT }` must be added at the call site, not inside `PRODUTO_CATALOGO_SELECT`, so the public response shape is unchanged. Note `empresaId: true` is already exposed publicly (`:52`, `combo.service.ts:38`) — that is the reason the `?empresaId=` branch must also be gated.

---

### `app/api/catalogo/produtos/route.ts` (and combos twin) — list endpoint (route)

**Analog:** itself (`:5-42`).

**Full core pattern** (`:5-42`) — preserve the 400 message and the `try/catch → 500`; the gate replaces `resolveIdBySlug` with the publicável resolver and must also gate the `?empresaId=` branch:
```typescript
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    let empresaId = searchParams.get("empresaId");

    if (!empresaId && slug) {
      empresaId = await empresaService.resolveIdBySlug(slug);
    }

    if (!empresaId) {
      return NextResponse.json({ message: "Informe o parâmetro empresaId ou slug." }, { status: 400 });
    }

    const produtos = await produtoService.listCatalogo(empresaId);
    return NextResponse.json(produtos);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Erro ao listar produtos." }, { status: 500 });
  }
}
```

**Relative-import gotcha (CLAUDE.md exception):** these catalogue handlers import via `../../../services/produto.service` (`:1-2`), and their tests `vi.mock` the **same relative string** (`route.test.ts:5-15`). Do not "fix" to `@/` without updating the mocks.

**404-by-id twin** (`app/api/catalogo/produtos/[id]/route.ts:10-25`) — the body shape blocked responses must mirror exactly:
```typescript
    const produto = await produtoService.findCatalogoById(id);

    if (!produto) {
      return NextResponse.json({ message: "Produto não encontrado." }, { status: 404 });
    }
```
Same for `app/api/empresas/slug/[slug]/route.ts:14-25` → `{"message":"Empresa não encontrada."}` / 404.

**Never** call `notFound()` inside these handlers — the surrounding `try` turns it into a 500 (Pitfall 3).

---

### `app/[slug]/_lib/empresa.ts` — request-scoped loader (data-loader)

**Analog:** itself, in full (`:1-13`):
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
Add a sibling `getEmpresaBranding` with the identical `cache(...)` + `notFound()` shape but backed by `findBrandingBySlug` (no status gate) — that is the Achado crítico 2 fix. `React.cache` only; never `unstable_cache` / `'use cache'`.

---

### `app/[slug]/admin/login/page.tsx` — D-09 generic branding (page, server)

**Analog:** itself (`:7-86`). The edit is **data-only** (UI-SPEC §Non-Goals): swap the values fed into the existing markup, keep every class string.

**Guard + data pattern** (`:12-20`):
```typescript
  const { slug } = await params;
  const session = await getVerifiedSession();

  if (session && session.empresaSlug === slug) {
    redirect(`/${slug}/admin`);
  }

  const empresa = await getEmpresaCatalogo(slug);
  const loginAction = login.bind(null, slug);
```
`getEmpresaCatalogo` → `getEmpresaBranding` + a status read; blocked ⇒ generic values (`#18181b` / `#3f3f46`, `Painel Administrativo`, padlock tile, drop the `← Voltar ao catálogo` anchor at `:75-80`).

**Shell markup to reuse verbatim on the blocked screen** (`:22-33`):
```tsx
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl">
          <div
            className="h-2"
            style={{ background: `linear-gradient(90deg, ${empresa.primaryColor}, ${empresa.accentColor})` }}
          />
          <div className="p-8">
```

**Padlock icon path already on this page** (`:55-67`) — copy it, do not source a new one:
```tsx
              <svg className="h-4 w-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
```

---

### `app/[slug]/admin/(protected)/layout.tsx` — banner insertion (layout, server)

**Analog:** itself, in full (`:7-44`). Both `return`s render `<main className="flex-1 p-6">{children}</main>` — the banner goes above `{children}` in **both**:
```tsx
  const { slug } = await params;
  const session = await requireAdminSession(slug);
  const empresa = await empresaService.findHeaderData(session.empresaId);

  if (empresa?.modoInterface === "SIMPLES") {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <SimplesTopBar slug={slug} empresaNome={empresa?.nome ?? slug}
          primaryColor={empresa?.primaryColor ?? "#18181b"}
          logoutAction={logout.bind(null, slug)} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    );
  }
  // ...segundo branch idêntico com <AdminNav .../>
```

**Action-binding pattern** (`:25`, `:39`): `logoutAction={logout.bind(null, slug)}` — the exact same `.bind(null, slug)` shape is what `pagarAction` uses.

**Free status read** — after `requireAdminSession`, `await revalidarConta(session.sub, session.empresaId)` costs no extra query (`lib/api-auth.ts:20-24`, `lib/auth-guard.ts:48`).

---

### `app/[slug]/admin/_lib/assinatura-actions.ts` (NEW) — payment Server Action

**Analog:** `app/[slug]/admin/_lib/auth-actions.ts` — same directory, same `"use server"` header, same `redirect` import, same `slug`-first bound-arg signature.

**Full pattern** (`auth-actions.ts:1-5`, `:47-53`):
```typescript
"use server";

import { redirect } from "next/navigation";
import { usuarioService } from "@/app/services/usuario.service";
import { createAdminSession, destroySession } from "@/lib/session";
// ...
  redirect(`/${slug}/admin`);
}

export async function logout(slug: string) {
  await destroySession();
  redirect(`/${slug}/admin/login`);
}
```
`logout` is reused as-is by the blocked screen — **do not write a new one** (it never calls `requireAdminSession`, so it works from a blocked session).

**Service call to wrap** (`app/services/assinatura.service.ts`, `criarCheckout(empresaId)` — throws `HttpError` 404/502):
```typescript
class AssinaturaService {
  async criarCheckout(empresaId: string): Promise<CheckoutCriado> {
    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, deletedAt: null }, select: EMPRESA_CHECKOUT_SELECT });
    if (!empresa) throw new HttpError("Empresa não encontrada.", 404);
```

**Error-handling shape:** `try { ... } catch { console.error("[assinatura] ...", erro) }` then `redirect(url)` **outside** the try (`lib/session.ts:98` convention, `04-RESEARCH.md` §Pattern 5).

---

### `app/[slug]/admin/(protected)/_components/aviso-carencia.tsx` (NEW) — grace banner

**Analog (structure):** the bordered inline notice block in `login/page.tsx:54-71` and the error block in `login-form.tsx:49-66` — same `flex items-center gap-2 rounded-xl border ... px-3 py-2.5` + inline `<svg>` + `<span className="text-xs ...">` skeleton. Retint amber per UI-SPEC.

**Error/notice block to copy shape from** (`login-form.tsx:49-66`):
```tsx
      {state.error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
          <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-red-600">{state.error}</span>
        </div>
      )}
```
Reuse this **verbatim** for the `?erro=checkout` `InlineError` on the blocked screen (UI-SPEC §4).

**Props/clock rule:** server component taking `diasRestantes: number` + `pagarAction`. No `new Date()` inside (Pitfall 5) — the layout derives it from `ContaAtiva.carenciaAte` (`lib/auth-guard.ts:17-21`) with `meiaNoiteEmSaoPaulo`.

---

### `app/[slug]/admin/_components/pagar-button.tsx` (NEW) — client CTA

**Analog:** the submit button of `login-form.tsx:68-75` — UI-SPEC declares the `bloqueado` variant class string character-identical to it:
```tsx
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60"
        style={{ backgroundColor: primaryColor }}
      >
        {pending ? "Autenticando..." : "Entrar no painel"}
      </button>
```
`"use client"` at the top (`login-form.tsx:1`). Use `useFormStatus()` (not `useActionState`) since the action returns `void` and ends in `redirect`. Inline-style-with-cast pattern for the focus ring (`login-form.tsx:29`): `style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}`.

**Form-wrapped button precedent** (`admin-nav.tsx:114-124`): `<form action={logoutAction}> <button type="submit" ...>` — no `onClick`, no `fetch`, consistent with the project's zero-`fetch` model.

---

### `app/[slug]/admin/bloqueado/page.tsx` (NEW) — blocked screen (page, server)

**Analog:** `app/[slug]/admin/login/page.tsx` — same params-await, same symmetric guard, same full-screen shell (excerpts above at §login page).

**Guard shape to mirror** (`login/page.tsx:12-17`) — inverted: no session ⇒ `redirect(/{slug}/admin/login)`; session healthy ⇒ `redirect(/{slug}/admin)`; only actually-blocked renders. Lives **outside** `(protected)` so `requireAdminSession` never runs on it (redirect loop; see `lib/session.ts:50-55`).

Must not import `AdminNav` or `SimplesTopBar`.

---

## Shared Patterns

### Error convention
**Source:** `lib/api-auth.ts:4-11` (`AuthError` with `.status`), `lib/http-error.ts` (`HttpError`)
**Apply to:** `lib/api-auth.ts`, `app/services/*`, `app/[slug]/admin/_lib/assinatura-actions.ts`
```typescript
export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) { super(message); this.status = status; }
}
```
Generic message to the client, detail only via `console.error` (`lib/auth-guard.ts:126`: `console.error("[auth-guard] falha ao revalidar conta:", error)` — prefix-tagged).

### Route handler envelope
**Source:** `app/api/catalogo/produtos/[id]/route.ts:10-40`
**Apply to:** every touched `route.ts`
```typescript
export async function GET(request: Request, { params }: Params) {
  try {
    // ...
    if (!x) return NextResponse.json({ message: "... não encontrado." }, { status: 404 });
    return NextResponse.json(x);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Erro ao ..." }, { status: 500 });
  }
}
```
`interface Params { params: Promise<{ id: string }> }` + `await params` (`:4-11`).

### Per-request auth read (never cross-request cache)
**Source:** `lib/auth-guard.ts:48-49`, `:24-46`
**Apply to:** layout, blocked page, Server Action, login page
```typescript
export const revalidarConta = cache(
  async (usuarioId: string, empresaId: string): Promise<ContaAtiva | null> => {
```
`ContaAtiva` already carries `statusAcesso`, `acessoExpiraEm`, `carenciaAte` (`:15-21`) — no new field or query needed.

### Server Action + form binding
**Source:** `auth-actions.ts:50-53` + `(protected)/layout.tsx:25` + `admin-nav.tsx:114`
**Apply to:** banner CTA, blocked-screen CTA, blocked-screen logout
```tsx
logoutAction={logout.bind(null, slug)}
// consumed as: <form action={logoutAction}> <button type="submit"> ... </button> </form>
```

### Service module shape
**Source:** `app/services/empresa.service.ts:50-52`, `:349`; `produto.service.ts:50-63`
**Apply to:** all three touched services
- module-level `as const` select projections (`EMPRESA_PUBLICAVEL_SELECT`)
- `class XService { ... }` + `export const xService = new XService();`
- every read filters `deletedAt: null`

### Unit test (node env) with mocked navigation
**Source:** `lib/session.test.ts:1-32`
**Apply to:** `lib/session.test.ts`, `app/[slug]/admin/bloqueado/page.test.ts`, `app/[slug]/_lib/empresa.test.ts`
```typescript
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const { cookieStore, redirectMock } = vi.hoisted(() => {
  const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
  const redirectMock = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
  return { cookieStore, redirectMock };
});

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
```

### Guard test with billing facts
**Source:** `lib/api-auth.test.ts:1-17`, `:75-90` + `tests/setup/prisma-mock.ts:33-45`
**Apply to:** `lib/api-auth.test.ts`, `lib/session.test.ts`
```typescript
function buildRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/produtos", { headers });
}
// ...
  it("aplica uma mudança no banco já no request seguinte, com o mesmo token", async () => {
    const token = await signAuthToken(payload);
    await expect(requireAuth(buildRequest({ authorization: `Bearer ${token}` }))).resolves.toEqual(payload);
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);
    await expect(requireAuth(buildRequest({ authorization: `Bearer ${token}` }))).rejects.toMatchObject({ status: 401 });
  });
```
Default stub to override (`tests/setup/prisma-mock.ts:33-45`) — deliberately neutral (`trialFim: 2099-01-01`, `ultimoStatusAuditado: "TRIAL"`):
```typescript
  prismaMock.usuario.findFirst.mockResolvedValue({
    id: "user-1", email: "admin@teste.com", role: "ADMIN", empresaId: "empresa-1",
    empresa: { slug: "empresa-teste", acessoAte: null,
      trialFim: new Date("2099-01-01T03:00:00.000Z"),
      canceladoEm: null, acessoVitalicio: false, ultimoStatusAuditado: "TRIAL" },
  } as never);
```

### Route test with relative-path mocks
**Source:** `app/api/catalogo/produtos/route.test.ts:1-30`
**Apply to:** all catalogue route tests
```typescript
// @vitest-environment node
import { buildRequest } from "../../../../tests/helpers/request";

vi.mock("../../../services/produto.service", () => ({ produtoService: { listCatalogo: vi.fn() } }));
vi.mock("../../../services/empresa.service", () => ({ empresaService: { resolveIdBySlug: vi.fn() } }));

import { GET } from "./route";
// ...
    expect(response.status).toBe(400);
    expect(produtoService.listCatalogo).not.toHaveBeenCalled();
```
The `not.toHaveBeenCalled()` assertion is also the query-parity proof for Pitfall 2.

### Component test
**Source:** `app/[slug]/admin/_components/login-form.test.tsx:1-33`
**Apply to:** `aviso-carencia.test.tsx`, blocked-screen component tests
```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./login-form";
// jsdom is the default env — no pragma. Actions are plain vi.fn().
    render(<LoginForm action={vi.fn().mockResolvedValue({})} primaryColor="#2563eb" />);
    expect(screen.getByLabelText("E-mail")).toBeRequired();
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/<seed-fatos-billing>.ts` (Open Q2) | script | batch | Nearest precedent is `scripts/resolvedor-ts.mjs` (Phase 03-07 pattern for running `.ts` with the app env reader), but no existing script seeds billing facts. Planner should follow `03-07-SUMMARY.md` rather than a code analog. |
| Grep-gate verification script (4 gates) | config / test harness | batch | No existing executable grep-gate script in the repo; gates today live as prose in planning docs. Planner establishes the first. |

Partial: `e2e/bloqueio-por-inadimplencia.spec.ts` — `e2e/sessao-revogada.spec.ts` is the structural analog (redirect-loop assertions, no `.env` access in the Playwright process) but it cannot write billing facts, hence the dependency on the seed script above.

---

## Metadata

**Analog search scope:** `lib/`, `app/services/`, `app/api/`, `app/[slug]/admin/**`, `app/[slug]/(catalogo)/**`, `tests/setup/`, `tests/helpers/`
**Files read for extraction:** 18
**Pattern extraction date:** 2026-09-01
