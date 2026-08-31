# Architecture Research

**Domain:** Subscription billing + access control layer for an existing multi-tenant SaaS (Next.js 16 App Router + Prisma 7 + PostgreSQL)
**Researched:** 2026-08-31
**Confidence:** HIGH (Next.js runtime/convention facts verified against bundled docs in `node_modules/next/dist/docs/`; webhook/idempotency patterns verified against gateway docs + convergent industry sources; terms-of-use modeling is MEDIUM — standard practice, few authoritative sources)

---

## Executive Answer to the Four Questions

| Question | Answer | Confidence |
|----------|--------|------------|
| Where does payment enforcement live? | **In the data-access layer (service chokepoints), not middleware.** `proxy.ts` does an optimistic cookie-only redirect for UX; the admin `layout.tsx` is the *authoritative* gate for admin UI + banner; `empresaService.findBySlug` / `resolveIdBySlug` is the authoritative gate for the public catalog. Middleware alone is insufficient and layout alone is insecure. | HIGH |
| How is the webhook secured + idempotent? | **Two-stage: verify → persist → 200 → process.** Read raw body with `await request.text()` *before* parsing, verify signature/token with constant-time compare, insert into a `WebhookEvent` inbox table with a `@@unique([provider, eventoExternoId])` constraint, return 200 immediately, then process. Unique-constraint violation = duplicate = 200 + no-op. | HIGH |
| How is the daily worker triggered? | **A protected API route (`POST /api/internal/cron/assinaturas`) guarded by a bearer `CRON_SECRET`, invoked by an external scheduler.** The route is the interface; the scheduler is a swappable detail (Vercel Cron / GitHub Actions / VPS crontab). Never a standalone script that duplicates business logic. | HIGH |
| How are terms modeled? | **Two tables: immutable versioned `TermoUso` + `AceiteTermo` join to `Usuario`.** Do *not* store a single `termosAceitosEm` timestamp on `Usuario` compared against a mutable `atualizadoEm` — that loses legal auditability of *which text* was accepted. | MEDIUM-HIGH |

**The single most important architectural decision:** store *facts* (`pagoAte`, `trialTerminaEm`, gateway status), and **derive** the access decision at request time via a pure function. The `statusPagamento` enum required by PROJECT.md becomes a **materialized projection** for querying/reporting — not the source of truth for the gate. This makes the daily worker a *reconciler* rather than the authority, so a missed worker run cannot silently grant free access or wrongly block a paying customer.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL / EDGE                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                  │
│  │   Browser    │   │   Payment    │   │  Scheduler   │                  │
│  │ (admin +     │   │   Gateway    │   │ (Vercel Cron │                  │
│  │  catálogo)   │   │              │   │  / crontab)  │                  │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘                  │
└─────────┼──────────────────┼──────────────────┼──────────────────────────┘
          │                  │ POST webhook     │ POST + Bearer CRON_SECRET
          ▼                  ▼                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        ENTRY / TRANSPORT LAYER                            │
│  ┌────────────┐ ┌────────────────┐ ┌──────────────┐ ┌─────────────────┐  │
│  │ proxy.ts   │ │ app/[slug]/**  │ │ /api/webhooks│ │ /api/internal/  │  │
│  │ optimistic │ │ layouts, pages,│ │ /{gateway}   │ │ cron/assinaturas│  │
│  │ redirect   │ │ server actions │ │ route.ts     │ │ route.ts        │  │
│  │ (cookie    │ │ + /api/**      │ │              │ │                 │  │
│  │  only)     │ │                │ │              │ │                 │  │
│  └────────────┘ └───────┬────────┘ └──────┬───────┘ └────────┬────────┘  │
└─────────────────────────┼─────────────────┼──────────────────┼───────────┘
                          │                 │                  │
                          ▼                 ▼                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     BILLING DOMAIN LAYER (server-only)                    │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  lib/billing/access.ts   ◄── PURE, NO I/O, THE HEART OF THE SYSTEM │  │
│  │  avaliarAcesso(fatos, agora) -> { permitido, motivo, diasRestantes}│  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────┐ ┌───────────────┐ ┌──────────────┐ ┌────────────────┐ │
│  │ assinatura   │ │ webhook       │ │ termo        │ │ gateway        │ │
│  │ .service.ts  │ │ .service.ts   │ │ .service.ts  │ │ adapter        │ │
│  │ (status,     │ │ (inbox,       │ │ (versões,    │ │ (port/adapter, │ │
│  │  reconcile)  │ │  dedupe,      │ │  aceites)    │ │  swappable)    │ │
│  │              │ │  aplicar)     │ │              │ │                │ │
│  └──────┬───────┘ └───────┬───────┘ └──────┬───────┘ └───────┬────────┘ │
└─────────┼─────────────────┼────────────────┼─────────────────┼──────────┘
          │                 │                │                 │ HTTPS
          ▼                 ▼                ▼                 ▼
┌──────────────────────────────────────────────────────────────┐  ┌────────┐
│              EXISTING SERVICE LAYER (gated)                   │  │Gateway │
│  empresaService.findBySlug ◄── CATALOG GATE LIVES HERE        │  │  API   │
│  empresaService.resolveIdBySlug ◄── API CATALOG GATE          │  └────────┘
│  produtoService / comboService / promocaoService (unchanged)  │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       PRISMA / POSTGRESQL                                 │
│  Empresa(+billing fields)  Assinatura  WebhookEvent  TermoUso  AceiteTermo│
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **`lib/billing/access.ts`** | Pure decision function. Takes billing facts + current time, returns `{ permitido, motivo, diasRestantesCarencia }`. Zero I/O, zero Prisma. | Plain TS module; 100% unit-testable with fake clocks. This is where trial/grace/cancel/vitalício rules live — **once**. |
| **`assinatura.service.ts`** | Reads/writes billing state on `Empresa`; exposes `getFatosBilling(empresaId)` and `reconciliarTodas()`. Materializes `statusPagamento`. | Class + singleton, matching existing `*.service.ts` convention. |
| **`webhook.service.ts`** | Inbox persistence, dedupe by external event id, translation of gateway events → domain state transitions. | Service with `registrar(evento)` (idempotent insert) + `processar(eventoId)`. |
| **`termo.service.ts`** | Publish new terms version; query current version; record + query per-`Usuario` acceptance. | Service; `precisaAceitar(usuarioId)` returns the pending `TermoUso` or `null`. |
| **Gateway adapter** (`lib/billing/gateways/*`) | Port/adapter isolating the chosen provider: signature verification, event normalization, checkout/cancel calls. | Interface `GatewayPagamento` + one impl. Keeps gateway choice (still open per PROJECT.md) from leaking into domain code. |
| **`proxy.ts`** | **Optimistic only.** Cookie presence + tenant/slug binding. Already exists. Optionally reads a *non-authoritative* status hint. | Node.js runtime (Next 16). No DB calls. |
| **Admin protected `layout.tsx`** | Authoritative admin gate + grace banner + terms modal. Already calls `requireAdminSession`. | Add `requireAcessoAdmin(slug)` returning gate + banner data. |
| **`empresaService.findBySlug` / `resolveIdBySlug`** | Authoritative public-catalog gate — returns "not found" for blocked tenants. | Add billing predicate to the existing query/filter. |
| **`/api/webhooks/{gateway}/route.ts`** | Verify → persist → 200. Nothing else synchronous. | Route Handler; `await request.text()` before parsing. |
| **`/api/internal/cron/assinaturas/route.ts`** | `CRON_SECRET` bearer check → `assinaturaService.reconciliarTodas()`. | Route Handler; thin. |

---

## Recommended Project Structure

```
lib/
├── billing/
│   ├── access.ts            # PURE decision fn — avaliarAcesso()
│   ├── access.test.ts       # exhaustive table tests w/ fake clock
│   ├── types.ts             # FatosBilling, DecisaoAcesso, MotivoBloqueio
│   ├── cron-auth.ts         # requireCronSecret(request) — timing-safe
│   └── gateways/
│       ├── index.ts         # GatewayPagamento port (interface)
│       └── {escolhido}.ts   # adapter: verifySignature, normalizeEvent, ...
├── api-auth.ts              # EXISTING — extend w/ requireAuthComAssinatura()
└── session.ts               # EXISTING — add requireAcessoAdmin(slug)

app/
├── services/
│   ├── assinatura.service.ts     # billing state + reconciliation
│   ├── webhook.service.ts        # inbox + dedupe + apply
│   ├── termo.service.ts          # versions + acceptances
│   └── empresa.service.ts        # EXISTING — add catalog gate
├── api/
│   ├── webhooks/
│   │   └── {gateway}/route.ts    # POST — verify, persist, 200
│   └── internal/
│       ├── cron/assinaturas/route.ts   # POST — CRON_SECRET guarded
│       └── termos/route.ts             # POST — publish new version (owner)
└── [slug]/admin/(protected)/
    ├── layout.tsx                # EXISTING — add gate + banner + modal
    ├── _components/
    │   ├── banner-carencia.tsx   # grace warning, admin only
    │   └── modal-termos.tsx      # blocking terms acceptance
    ├── bloqueado/page.tsx        # terminal blocked screen + pay CTA
    └── assinatura/               # subscription management UI
        ├── page.tsx
        └── actions.ts
```

### Structure Rationale

- **`lib/billing/access.ts` is separate from any service.** The grace-window / trial / cancellation arithmetic is the part most likely to have bugs and the part hardest to test through Prisma. Isolating it as a pure function makes it trivially testable and guarantees the worker, the layout gate, and the catalog gate all agree — they call the same function.
- **`lib/billing/gateways/` as a port/adapter.** PROJECT.md explicitly leaves the gateway undecided (Stripe / Mercado Pago / Asaas / Pagar.me / Iugu). An interface boundary means the decision can be deferred past the data-model phase and swapped later without touching domain logic. This is not speculative generality — the decision is *genuinely open* right now.
- **`app/services/*.service.ts` for stateful services.** Matches the existing convention exactly (class + exported camelCase singleton + colocated `.test.ts`). No new architectural style introduced.
- **`app/api/internal/` namespace.** Groups machine-only endpoints under one prefix so they can be blanket-excluded from the public API surface, Postman collections, and any future rate-limit/robots rules.
- **`bloqueado/page.tsx` inside `(protected)`** so blocked users still land on an authenticated, branded screen with a payment CTA rather than being bounced to login (which would look like a credentials bug).

---

## Architectural Patterns

### Pattern 1: Derived Access Decision (facts stored, verdict computed)

**What:** Persist the raw billing facts on `Empresa`. Compute the access verdict at request time with a pure function. Keep `statusPagamento` as a *cached projection* refreshed by the worker/webhook, used for bulk queries and reporting — never as the sole gate input.

**When to use:** Any time an authorization decision depends on elapsed time. Here: trial expiry, 10-day grace, cancellation-until-end-of-period.

**Trade-offs:**
- **Pro:** A failed worker run is harmless — the gate still computes correctly from `pagoAte`. This is the difference between "the cron didn't run so 300 unpaid tenants had free access all weekend" and "nothing happened."
- **Pro:** Time-travel testing is trivial (inject `agora`).
- **Con:** The stored enum and the computed verdict can disagree between worker runs. Resolve by treating the computed verdict as authoritative everywhere and the enum as advisory. Never branch on the enum alone in a gate.

**Example:**

```typescript
// lib/billing/types.ts
export type StatusPagamento =
  | "trial" | "em_dia" | "atrasado" | "bloqueado" | "cancelado" | "vitalicio";

export interface FatosBilling {
  statusPagamento: StatusPagamento;
  trialTerminaEm: Date | null;
  pagoAte: Date | null;        // fim do período pago mais recente
  canceladoEm: Date | null;
}

export type DecisaoAcesso =
  | { permitido: true; modo: "normal" }
  | { permitido: true; modo: "carencia"; diasRestantes: number; venceuEm: Date }
  | { permitido: false; motivo: "bloqueado_inadimplencia" | "trial_expirado" };
```

```typescript
// lib/billing/access.ts — pure. no imports from prisma, next, or services.
const DIAS_CARENCIA = 10;

export function avaliarAcesso(f: FatosBilling, agora: Date): DecisaoAcesso {
  // Vitalício curto-circuita tudo: liberado por decisão manual no banco.
  if (f.statusPagamento === "vitalicio") return { permitido: true, modo: "normal" };

  // Trial: só vale enquanto não expirou. Nunca cai em carência.
  if (f.statusPagamento === "trial") {
    if (f.trialTerminaEm && agora < f.trialTerminaEm) {
      return { permitido: true, modo: "normal" };
    }
    return { permitido: false, motivo: "trial_expirado" };
  }

  // Cancelado e pago-em-dia seguem a MESMA regra: vale até o fim do período pago.
  // Cancelamento não é bloqueio imediato (requisito do PROJECT.md).
  if (!f.pagoAte) return { permitido: false, motivo: "bloqueado_inadimplencia" };
  if (agora < f.pagoAte) return { permitido: true, modo: "normal" };

  const fimCarencia = addDias(f.pagoAte, DIAS_CARENCIA);
  if (agora < fimCarencia) {
    return {
      permitido: true,
      modo: "carencia",
      diasRestantes: Math.ceil((+fimCarencia - +agora) / 86_400_000),
      venceuEm: f.pagoAte,
    };
  }
  return { permitido: false, motivo: "bloqueado_inadimplencia" };
}
```

> Note the deliberate collapse: `cancelado` and `atrasado` share one code path. PROJECT.md describes them as separate statuses but the *access rule* is identical ("acesso mantido até o fim dos 30 dias do último pagamento; depois disso, mesmo fluxo de bloqueio"). Keeping them as separate enum values for reporting while sharing one branch avoids two grace-window implementations drifting apart.

---

### Pattern 2: Defense in Depth — three enforcement tiers with distinct jobs

**What:** Each entry point gets the weakest enforcement that is *correct for that entry point*, plus one authoritative chokepoint that cannot be bypassed.

**When to use:** Always, in Next.js App Router. The bundled Next 16 docs are unambiguous: *"Proxy is not intended for slow data fetching... it should not be used as a full session management or authorization solution"* and *"The majority of security checks should be performed as close as possible to your data source"* (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`, `.../data-security.md`).

| Tier | Where | Reads | Job | Authoritative? |
|------|-------|-------|-----|----------------|
| 1 — Optimistic | `proxy.ts` | Cookie only | Fast redirect, avoids rendering admin shell for blocked tenants | **No** |
| 2 — UI gate | `(protected)/layout.tsx` | DB via `assinaturaService` | Decide: block screen / grace banner / terms modal / normal | Yes, for admin **UI** |
| 3 — Data gate | `empresaService.findBySlug` + `resolveIdBySlug` + `requireAuth` | DB | Deny data regardless of caller | **Yes** — the chokepoint |

**Trade-offs:**
- **Pro:** Tier 3 closes the hole that Tier 2 alone leaves wide open (see Anti-Pattern 1).
- **Con:** Tier 2 adds one query per admin navigation. Mitigate with React `cache()` — the same request-level dedupe pattern already used by `getEmpresaCatalogo`.

**Example — Tier 3, the catalog chokepoint (highest-leverage single change in this milestone):**

```typescript
// app/[slug]/_lib/empresa.ts — cache() já existe; o gate entra aqui.
export const getEmpresaCatalogo = cache(async (slug: string) => {
  const empresa = await empresaService.findBySlug(slug);
  if (!empresa) notFound();

  const decisao = avaliarAcesso(toFatosBilling(empresa), new Date());

  // Catálogo despublicado = 404 puro. Sem mensagem de cobrança,
  // conforme requisito: "apenas indisponível".
  if (!decisao.permitido) notFound();

  return empresa;
});
```

Because both `(catalogo)/layout.tsx` and `(catalogo)/page.tsx` already call `getEmpresaCatalogo`, one edit covers the entire public surface — and `cache()` means it still costs one query.

**Example — Tier 2, admin layout:**

```typescript
// app/[slug]/admin/(protected)/layout.tsx
const session = await requireAdminSession(slug);            // existente
const { decisao, termoPendente } = await requireAcessoAdmin(session);

if (!decisao.permitido) redirect(`/${slug}/admin/bloqueado`);

return (
  <>
    {decisao.modo === "carencia" && (
      <BannerCarencia dias={decisao.diasRestantes} slug={slug} />
    )}
    {termoPendente && <ModalTermos termo={termoPendente} />}
    {/* shell existente */}
  </>
);
```

**Gate precedence — must be exactly this order:** payment block → terms modal → normal. A blocked tenant must never be forced to accept terms in order to reach a payment screen, and the payment screen itself must live *outside* the terms modal's reach.

---

### Pattern 3: Webhook Inbox (transactional dedupe at the database level)

**What:** The webhook route does the minimum synchronous work: verify signature against the **raw** body, insert into a `WebhookEvent` table whose unique constraint *is* the idempotency mechanism, return 200. Business logic runs after (or on the next worker pass).

**When to use:** Every webhook endpoint. Asaas documents "at least once" delivery, explicitly *does not guarantee sequential order*, pauses the queue after 15 consecutive failures, and instructs: *"Persista o `id` recebido e não execute novamente a regra de negócio caso esse identificador já tenha sido processado."* Stripe behaves equivalently.

**Trade-offs:**
- **Pro:** Dedupe is enforced by Postgres, not by application logic — immune to concurrent duplicate deliveries, which an application-level `findFirst`-then-insert check is not.
- **Pro:** The raw payload is retained, so a processing bug can be fixed and events replayed. Given Asaas deletes undelivered events after 14 days, this local copy is the only recovery path.
- **Con:** Two-phase processing is more code than "do it inline." Justified: inline processing means a slow DB write causes a gateway timeout, a retry, and a *second* concurrent execution of the same state transition.

**Example:**

```typescript
// app/api/webhooks/{gateway}/route.ts
export async function POST(request: Request) {
  // 1. RAW body primeiro. request.json() consome o stream e destrói a
  //    assinatura — a re-serialização difere em espaços/ordem de chaves.
  const raw = await request.text();

  // 2. Verificar ANTES de confiar em qualquer campo.
  if (!gateway.verificarAssinatura(raw, request.headers)) {
    return new Response("invalid signature", { status: 401 });
  }

  const evento = gateway.normalizar(JSON.parse(raw));

  // 3. Insert idempotente. Constraint única = mecanismo de dedupe.
  try {
    await webhookService.registrar({
      provider: gateway.id,
      eventoExternoId: evento.id,
      tipo: evento.tipo,
      payloadBruto: raw,
    });
  } catch (e) {
    if (isUniqueViolation(e)) return new Response("ok", { status: 200 }); // duplicata
    throw e;
  }

  // 4. 200 rápido. Processamento pesado depois.
  after(() => webhookService.processar(evento.id));
  return new Response("ok", { status: 200 });
}
```

Signature verification must use a **timing-safe comparison** (`crypto.timingSafeEqual`). This matters more for Asaas-style integrations than for Stripe: Asaas authenticates with a *static shared token* in the `asaas-access-token` header rather than an HMAC of the payload. A static token is weaker (it does not bind the signature to the body), so it must be compared in constant time and paired with strict HTTPS.

**Ordering:** because delivery order is not guaranteed, event handlers must be **monotonic** — never blindly overwrite state. Guard with the event's own timestamp, or re-fetch the authoritative subscription object from the gateway API on receipt and write *that*. The latter ("refetch the live object instead of trusting the order events arrive in") is the more robust pattern and is what the reconciliation worker does anyway.

---

### Pattern 4: Cron as a Guarded Route Handler, not a Script

**What:** The scheduled job's logic lives in `assinaturaService.reconciliarTodas()`. A thin, secret-guarded route handler exposes it. The scheduler is a configuration detail.

**When to use:** When the hosting platform is undecided — exactly the situation PROJECT.md flags as a blocker ("hosting de produção não está definido no código").

**Trade-offs:**
- **Pro:** Decouples the milestone from the hosting decision. Vercel Cron, GitHub Actions `schedule`, VPS `curl` in crontab, cron-job.org — all POST to the same URL with the same bearer header. The hosting choice stops being a blocker for *this* work.
- **Pro:** Runs in the same runtime/bundle as the app; no separate Prisma client instantiation, no duplicated env loading, no build step drift.
- **Con:** Subject to platform function timeouts. With one Empresa per row and a handful of tenants this is a non-issue; the mitigation (batching + cursor) is noted under Scaling below.
- **Con:** A publicly-reachable URL exists. Fully mitigated by the bearer secret — but the check must be unconditional and timing-safe. This codebase already has a documented instance of an unauthenticated endpoint (`CONCERNS.md`); do not add a second.

**Example:**

```typescript
// app/api/internal/cron/assinaturas/route.ts
export async function POST(request: Request) {
  if (!requireCronSecret(request)) {            // timing-safe bearer compare
    return new Response("unauthorized", { status: 401 });
  }
  const resultado = await assinaturaService.reconciliarTodas(new Date());
  return Response.json(resultado);              // { avaliadas, bloqueadas, reativadas }
}
```

**Vercel specifics (if chosen):** crons are declared in `vercel.json`; Vercel injects `Authorization: Bearer ${CRON_SECRET}` from the project env var. **The Hobby plan allows at most 2 cron jobs at once-per-day frequency** — adequate for this milestone's single daily job, but it is a hard ceiling worth knowing before committing.

**What the worker must and must not do:**
- **Must:** recompute `statusPagamento` from facts, persist the projection, fire notification side-effects (grace-expiry warnings), and call `revalidatePath('/${slug}')` for any tenant whose access flipped.
- **Must not:** be the only thing that can block a tenant. Per Pattern 1 the request-time gate already blocks correctly; the worker just materializes and notifies.

---

### Pattern 5: Immutable Terms Versions + Acceptance Ledger

**What:** `TermoUso` rows are append-only and never edited. Publishing new terms inserts a row and flips which one is current. `AceiteTermo` records `(usuarioId, termoId, aceitoEm)` with a unique pair.

**When to use:** Any consent that may need to be proven later. This is a legal-evidence problem, not a state problem.

**Trade-offs:**
- **Pro:** You can answer "which exact text did this user agree to, and when?" — the whole point of terms acceptance. A `Usuario.termosAceitosEm` timestamp compared against a mutable `termos.atualizadoEm` cannot answer that, because the text it referred to has been overwritten.
- **Pro:** The pending check is a cheap join, and it is naturally correct when multiple versions are published in quick succession.
- **Con:** One extra table and one extra join versus the timestamp approach. Trivial cost.

**Example:**

```prisma
model TermoUso {
  id         String   @id @default(uuid())
  versao     String            // "1.0", "2026-09-01" — legível por humanos
  conteudo   String            // markdown/HTML congelado desta versão
  vigente    Boolean  @default(false)
  publicadoEm DateTime @default(now())
  aceites    AceiteTermo[]

  @@index([vigente, publicadoEm])
}

model AceiteTermo {
  id        String   @id @default(uuid())
  usuarioId String
  usuario   Usuario  @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  termoId   String
  termo     TermoUso @relation(fields: [termoId], references: [id])
  aceitoEm  DateTime @default(now())
  ip        String?          // evidência adicional
  userAgent String?

  @@unique([usuarioId, termoId])   // aceite é idempotente por natureza
  @@index([termoId])
}
```

```typescript
// termo.service.ts — o gate
async precisaAceitar(usuarioId: string): Promise<TermoUso | null> {
  const vigente = await prisma.termoUso.findFirst({
    where: { vigente: true },
    orderBy: { publicadoEm: "desc" },
  });
  if (!vigente) return null;

  const aceite = await prisma.aceiteTermo.findUnique({
    where: { usuarioId_termoId: { usuarioId, termoId: vigente.id } },
  });
  return aceite ? null : vigente;
}
```

**Scope discipline — the point PROJECT.md flags as a constraint:**

| Concern | Scope | Rationale |
|---------|-------|-----------|
| Payment status | **Empresa** | The subscription is the tenant's. All logins block together. |
| Terms acceptance | **Usuario** | Consent is personal and individually attributable. |

These must not be conflated even though `Usuario` currently has `@@unique([empresaId])` — i.e. exactly one user per Empresa today, making the two scopes *coincidentally* 1:1. Modeling acceptance on `Usuario` costs nothing now and is the only thing that survives the day a second user is added to a company. Modeling it on `Empresa` would be a data migration plus a legal gap.

Registration flow: acceptance is captured at `/registro` (PROJECT.md requires it), so `registerComUsuario` — already a `prisma.$transaction` — should insert the `AceiteTermo` inside that same transaction. A user must never exist without a recorded acceptance.

---

## Data Flow

### Flow A: Gateway charge event → access state

```
Gateway (cobrança paga/falhou)
    │  POST + assinatura/token
    ▼
/api/webhooks/{gateway}/route.ts
    │  1. raw = await request.text()
    │  2. verificarAssinatura(raw, headers)      ── falha → 401, fim
    │  3. INSERT WebhookEvent                    ── unique violation → 200, fim
    │  4. return 200  ◄─────────────────────────── gateway satisfeito (< timeout)
    ▼  (assíncrono)
webhookService.processar()
    │  normaliza evento → transição de domínio
    ▼
assinaturaService.aplicarPagamento(empresaId, periodo)
    │  UPDATE Empresa { pagoAte, statusPagamento }
    ▼
revalidatePath(`/${slug}`)   ── recatalogar se voltou a ser visível
```

### Flow B: Daily reconciliation (safety net)

```
Scheduler (1x/dia)
    │  POST + Bearer CRON_SECRET
    ▼
/api/internal/cron/assinaturas
    │  requireCronSecret()                       ── falha → 401
    ▼
assinaturaService.reconciliarTodas(agora)
    │  para cada Empresa:
    │     fatos     = getFatosBilling(empresa)
    │     decisao   = avaliarAcesso(fatos, agora)   ◄── MESMA fn do gate
    │     if (projeção != decisão) → UPDATE statusPagamento
    │                                → revalidatePath(`/${slug}`)
    │                                → notificar (carência acabando / bloqueio)
    ▼
{ avaliadas, bloqueadas, reativadas }
```

### Flow C: Admin request → gate

```
GET /{slug}/admin/produtos
    ▼
proxy.ts ─── sem cookie / slug≠token → redirect /login        [OTIMISTA]
    ▼
(protected)/layout.tsx
    │  requireAdminSession(slug)          ── existente
    │  fatos   = assinaturaService.getFatosBilling(empresaId)   [cache()]
    │  decisao = avaliarAcesso(fatos, agora)                     [AUTORITATIVO]
    │
    ├── !permitido            → redirect /{slug}/admin/bloqueado
    ├── modo === "carencia"   → renderiza <BannerCarencia dias={n}/>
    ├── termoPendente         → renderiza <ModalTermos/> (bloqueante)
    └── normal                → shell + children
    ▼
Server Action / page
    │  ⚠ REVALIDA por conta própria — layout NÃO protege actions
    │    ("A page-level authentication check does not extend to the
    │      Server Actions defined within it" — Next.js data-security guide)
    ▼
service → prisma
```

### Flow D: Public catalog request → gate

```
GET /{slug}                          GET /api/catalogo/produtos?slug=
    ▼                                     ▼
(catalogo)/layout.tsx + page.tsx     route.ts
    ▼                                     ▼
getEmpresaCatalogo(slug) [cache()]   empresaService.resolveIdBySlug(slug)
    ▼                                     ▼
    └──────► avaliarAcesso() ◄────────────┘        [MESMO GATE, 2 CAMINHOS]
                 │
                 ├── permitido  → catálogo normal
                 └── bloqueado  → notFound() / 404   (sem menção a pagamento)
```

**The two-path detail in Flow D is the easiest thing to get wrong in this milestone.** `/api/catalogo/produtos` and `/api/catalogo/combos` are unauthenticated JSON endpoints that resolve a tenant by slug and return catalog data *without ever touching the page render path*. Gating only the page leaves a fully functional public JSON catalog for blocked tenants. Both paths must run the same gate.

---

## Cache Invalidation: the non-obvious coupling

Blocking a tenant is a **write that must invalidate a read cache**. The codebase already treats `/{slug}` as cached — every admin mutation calls `revalidatePath('/${slug}')` (see `produtos/actions.ts`, `combos/actions.ts`). Therefore:

- The **worker** must call `revalidatePath('/${slug}')` for every tenant whose verdict flipped.
- The **webhook** processor must do the same on reactivation.

Without this, a blocked tenant's catalog can continue being served from the full-route cache, and a reactivated tenant may keep seeing a 404 after paying — the worse of the two failures, because it happens immediately after the customer gives you money.

Because `notFound()` inside a cached render caches the 404 too, prefer flipping the tenant's data at the source *and* revalidating, rather than relying on cache TTL expiry.

---

## Scaling Considerations

This is a Brazilian SMB SaaS with one admin user per company. Realistic scale is tens to low thousands of tenants — plan for that, not for millions.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–100 tenants | Everything above as written. Worker iterates all Empresas in one pass, well under any function timeout. No queue, no cache layer. |
| 100–5k tenants | Worker: `SELECT` only candidates (`WHERE statusPagamento != 'vitalicio' AND (pagoAte < now() + 11d OR trialTerminaEm < now())`) instead of scanning every row. Add an index on `(statusPagamento, pagoAte)`. Webhook processing moves from `after()` to a real queue if gateway timeouts appear. |
| 5k+ tenants | Batch/cursor the worker across multiple invocations. Cache `FatosBilling` per tenant in Redis with short TTL to cut the per-admin-navigation query. Consider a dedicated worker process rather than a route handler. |

### Scaling Priorities

1. **First bottleneck: the per-request billing query in the admin layout.** Every admin navigation adds one `Empresa` lookup. Fix in order: (a) wrap in React `cache()` — free, do it immediately; (b) fold the billing fields into the existing `findHeaderData` select the layout already calls, making it *zero* additional queries; (c) only then consider Redis.
   - **(b) is the right answer for v1** — `findHeaderData(session.empresaId)` is already called in the protected layout. Adding four billing columns to its `select` makes the entire Tier-2 gate cost nothing.
2. **Second bottleneck: worker wall-clock time.** Only when a full-table scan stops fitting in the platform's function timeout. Fix with the candidate-filter query above, not with infrastructure.
3. **Non-bottleneck: webhook volume.** One subscription per tenant charged monthly means ~1 event/tenant/month plus retries. This will not be a scaling concern at any plausible size for this product.

---

## Anti-Patterns

### Anti-Pattern 1: Enforcing payment status only in the layout

**What people do:** Add the payment check to `(protected)/layout.tsx` and `(catalogo)/layout.tsx`, then consider the feature done.

**Why it's wrong:** Layouts gate *rendering*, not *data*. In this codebase specifically, three routes bypass layouts entirely:
- `/api/catalogo/produtos` and `/api/catalogo/combos` — unauthenticated, resolve tenant by slug, return the full catalog as JSON.
- The whole authenticated `/api/**` REST surface — guarded by `requireAuth`, which validates the JWT but knows nothing about billing. A blocked tenant's JWT stays valid for up to 7 days (`SESSION_MAX_AGE_SECONDS`).
- Server Actions — the Next.js data-security guide is explicit: *"A page-level authentication check does not extend to the Server Actions defined within it. Always re-verify inside the action."*

So a "blocked" tenant keeps a working API and working mutations. The block is cosmetic.

**Do this instead:** Put the authoritative gate at the data chokepoints — `empresaService.findBySlug`, `empresaService.resolveIdBySlug`, and a new `requireAuthComAssinatura()` wrapping the existing `requireAuth`. Keep the layout check too, but for *UX* (redirect + banner), not for security.

### Anti-Pattern 2: Putting the DB-backed gate in `proxy.ts`

**What people do:** Reason that since Next.js 16 made `proxy` run on the Node.js runtime, Prisma now works there — so centralize the whole check in `proxy.ts`.

**Why it's wrong:** It *does* run now (the v16 upgrade guide confirms: *"The `edge` runtime is NOT supported in `proxy`. The `proxy` runtime is `nodejs`, and it cannot be configured"*). That makes it a *tempting* trap rather than an impossible one. But proxy runs on **every** matched request including prefetches — the App Router prefetches links aggressively, so hovering a nav bar fires DB queries. And the Next.js docs are direct: *"Proxy is not intended for slow data fetching... it should not be used as a full session management or authorization solution."* Worse, it still would not cover Server Actions or direct data access.

**Do this instead:** Keep `proxy.ts` exactly as it is — cookie-only, optimistic. If a status hint is desired for a faster redirect, embed a short-lived, non-authoritative claim in the JWT and re-verify downstream. Never let the proxy be the only check.

### Anti-Pattern 3: Trusting the stored status enum as the gate input

**What people do:** `if (empresa.statusPagamento === 'bloqueado') deny()`.

**Why it's wrong:** The enum is only as fresh as the last successful worker run. If the cron fails Friday night, every tenant whose grace window expires over the weekend keeps full access until Monday. Conversely, if a webhook lands before the worker catches up, a paying customer can stay flagged `bloqueado`. The enum encodes *the past*; access control needs *now*.

**Do this instead:** Gate on `avaliarAcesso(fatos, new Date())`. Keep the enum for admin queries, dashboards, and the "who should I email" worker query.

### Anti-Pattern 4: Parsing the webhook body before verifying it

**What people do:** `const body = await request.json()` then verify the signature against a re-serialized copy.

**Why it's wrong:** The body stream can only be consumed once, and re-serializing changes whitespace, key order, and Unicode escaping — so the recomputed signature will not match, or worse, "matches" only because verification was quietly weakened to make it pass. Note that this is *not* the old Pages Router `bodyParser: false` problem: App Router route handlers receive a standard Web `Request` with no automatic parsing, so `await request.text()` is all that is needed.

**Do this instead:** `const raw = await request.text()` → verify against `raw` → `JSON.parse(raw)`. Never the other way around.

### Anti-Pattern 5: Application-level duplicate checking instead of a unique constraint

**What people do:** `const existe = await prisma.webhookEvent.findFirst({ where: { eventoExternoId } }); if (!existe) await create(...)`.

**Why it's wrong:** Classic check-then-act race. Gateways retry, and retries can arrive concurrently — both requests see "not found," both insert, both apply the state transition. For a payment system this means double-crediting a subscription period.

**Do this instead:** `@@unique([provider, eventoExternoId])` and let the insert fail. Catch the unique-violation error code and return 200. The database is the arbiter.

### Anti-Pattern 6: Showing a payment message on the blocked public catalog

**What people do:** Render "Este catálogo está indisponível — pagamento pendente" on `/{slug}`.

**Why it's wrong:** The catalog audience is the *tenant's customers*, not the tenant. Publishing a company's payment delinquency to its own customers is a commercial and reputational harm you inflict on a paying-eventually customer. PROJECT.md rules this out explicitly: *"sem mensagem de pagamento no catálogo — apenas indisponível."*

**Do this instead:** `notFound()`. Indistinguishable from a nonexistent slug. Payment messaging appears only inside the authenticated admin area.

### Anti-Pattern 7: Storing card data "just for display"

**What people do:** Cache the last 4 digits, brand, and expiry locally to render a nicer subscription screen.

**Why it's wrong:** PROJECT.md sets this as a hard constraint, and it drags the database into PCI scope for a cosmetic gain.

**Do this instead:** Store only opaque gateway references (`gatewayCustomerId`, `gatewaySubscriptionId`). Render payment-method details by calling the gateway API on demand, or link out to the gateway's own hosted portal — most providers offer one, which removes the need for this screen entirely.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Payment gateway (TBD) | Port/adapter behind `GatewayPagamento`. Outbound: hosted checkout redirect + cancel. Inbound: webhook. | Gateway is unchosen (STACK.md decides). Adapter boundary keeps the choice reversible. **Asaas caveat:** it has no subscription-level webhooks — only charge (`cobrança`) events — so subscription state must be *derived* from charge events. This materially changes the event-mapping code and is a strong argument for the adapter boundary. |
| Scheduler (TBD) | Outbound HTTP POST to `/api/internal/cron/assinaturas` with `Authorization: Bearer`. | Platform-agnostic by construction. Vercel Hobby caps at 2 crons/day-frequency. |
| Cloudflare R2 | Unchanged. | Blocking a tenant does not delete assets; images simply stop being referenced. Intentional — reactivation must restore the catalog intact. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Webhook route ↔ `webhookService` | Direct call, sync for persist / async for process | Route stays thin; all logic testable without HTTP. |
| `webhookService` ↔ `assinaturaService` | Direct call | Webhook translates gateway vocabulary → domain vocabulary. `assinaturaService` must never import gateway types. |
| Cron route ↔ `assinaturaService` | Direct call | Route is 5 lines: auth + delegate. |
| All gates ↔ `lib/billing/access.ts` | Pure function call | **The critical invariant: exactly one implementation of the rules.** Any second copy of the grace-window arithmetic is a future bug. |
| `assinaturaService` ↔ `empresaService` | Prefer extending `empresaService`'s existing selects over a parallel query path | Avoids N+1 in the admin layout (see Scaling #1b). |
| Billing layer ↔ existing services | One-way: billing gates them; they never import billing | Preserves the existing acyclic dependency graph noted in `codebase/ARCHITECTURE.md`. |

---

## Suggested Build Order

Dependency-driven. Each step is independently shippable and safe.

| # | Component | Depends on | Why here | Ships safely because… |
|---|-----------|-----------|----------|----------------------|
| 1 | **Data model** — `Empresa` billing fields, `WebhookEvent`, `TermoUso`, `AceiteTermo` (+ migration, + backfill existing tenants to `vitalicio` or a long trial) | — | Everything else reads/writes these | Additive migration; no behavior change |
| 2 | **`lib/billing/access.ts`** + exhaustive unit tests | 1 (types only) | Pure, zero-risk, and every later step calls it. Building it early forces the trial/grace/cancel edge cases to be settled *before* they are scattered across call sites | Not wired to anything yet |
| 3 | **Terms versioning + acceptance** — `termo.service`, publish endpoint, `/registro` capture, admin modal | 1 | **Fully independent of the gateway decision.** Can proceed in parallel with 4–6, which de-risks the schedule while gateway research finishes | Self-contained feature |
| 4 | **Enforcement points** — catalog DAL gate, admin layout gate + `bloqueado` page, `requireAuthComAssinatura` for `/api/**` | 1, 2 | Gates must exist before anything can flip a tenant to blocked | Every existing tenant is backfilled `vitalicio`/trial → all gates evaluate "permitido" → zero user-visible change. Verifiable by flipping one test row. |
| 5 | **Gateway adapter + checkout** — `GatewayPagamento` impl, subscription creation, `assinatura/` management UI | 1, 2, **STACK.md gateway decision** | The only step blocked on an external decision | New surface; existing flows untouched |
| 6 | **Webhook ingestion** — route, inbox, dedupe, event→state mapping | 1, 5 | Needs the adapter's signature verification and event vocabulary | Idempotent by construction; safe to replay |
| 7 | **Daily worker** — `reconciliarTodas`, cron route, `CRON_SECRET`, `revalidatePath` on flips | 1, 2, 4 | Reconciles what 4 already enforces at request time. Deliberately *last* among billing steps: since the gate is derived (Pattern 1), the system is already correct without it | Read-mostly; first deploy can run in dry-run/log-only mode |
| 8 | **Grace banner + notifications** | 4, 7 | Polish on top of a working gate | Purely additive UI |

**Notable ordering consequences:**

- **Step 3 is off the critical path.** Terms-of-use work has no dependency on the payment gateway, so it should not wait behind gateway research. If the roadmap serializes it after billing, it needlessly extends the milestone.
- **Step 4 before 5–7 is deliberate and safe.** Enforcement can ship with every tenant grandfathered, letting the risky part (gates in the data layer) be validated in production *before* any tenant can actually be blocked. Building gates last — after the worker can already flip statuses — is the sequencing that produces the "we blocked paying customers on deploy day" incident.
- **Step 7 last is only safe because of Pattern 1.** If the roadmap instead makes the stored enum authoritative, the worker becomes load-bearing and must move earlier, and a cron outage becomes a security incident. This is the concrete payoff of the derived-decision design.

### Phases likely needing deeper research

- **Step 5** — blocked on the gateway decision; the chosen provider's subscription/proration/reactivation semantics ("quitar 2 meses atrasados para reativar") vary widely and need provider-specific research.
- **Step 7** — hosting/scheduler platform is undecided; the route-handler design defers but does not eliminate this decision.

---

## Sources

- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — `middleware` → `proxy` rename; *"The `edge` runtime is NOT supported in `proxy`. The `proxy` runtime is `nodejs`, and it cannot be configured."* (HIGH — first-party, version-pinned to the installed Next 16.3.0)
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` — *"Proxy is not intended for slow data fetching... should not be used as a full session management or authorization solution."* (HIGH)
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md` — optimistic checks with Proxy; *"only read the session from the cookie... avoid database checks"*; *"should not be your only line of defense"* (HIGH)
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md` — Data Access Layer pattern; *"A page-level authentication check does not extend to the Server Actions defined within it"*; audit guidance on `proxy.ts`/`route.ts` (HIGH)
- Repo inspection: `proxy.ts`, `lib/session.ts`, `lib/api-auth.ts`, `app/[slug]/_lib/empresa.ts`, `app/[slug]/admin/(protected)/layout.tsx`, `app/api/catalogo/produtos/route.ts`, `prisma/schema.prisma`, `next.config.ts` (HIGH — direct observation)
- [Asaas — Introdução a Webhooks](https://docs.asaas.com/docs/sobre-os-webhooks) — `asaas-access-token` header auth; at-least-once delivery; order **not** guaranteed; queue pauses after 15 consecutive failures; 14-day event retention; return 200 immediately and process async; persist event `id` for idempotency (HIGH — first-party gateway docs)
- [Asaas — Eventos para assinaturas](https://docs.asaas.com/docs/eventos-para-assinaturas) — subscription state must be derived from charge events (MEDIUM-HIGH)
- [Vercel — Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — `vercel.json` config, auto-injected `Authorization: Bearer ${CRON_SECRET}`, Hobby plan limits (HIGH — first-party)
- [How to Secure Vercel Cron Job routes in Next.js (App Router)](https://codingcat.dev/post/how-to-secure-vercel-cron-job-routes-in-next-js-14-app-router) — CRON_SECRET verification in route handlers (MEDIUM)
- [Billing webhook race condition solution guide](https://excessivecoding.com/blog/billing-webhook-race-condition-solution-guide) — webhook_events inbox table + optimistic locking (MEDIUM)
- [Stripe subscription webhooks that survive the edge cases](https://amplifiedcreations.com/journal/stripe-subscription-webhooks) — provider as source of truth, refetch live object rather than trusting event order, reconciliation cron as safety net (MEDIUM)
- [Payment Gateway Integration: Webhooks and Idempotency](https://appricotsoft.com/blog/payment-gateway-integration-services-webhooks-idempotency/) — inbox table, DB-level unique event ids, async processing (MEDIUM)
- [How to Handle Stripe and Paystack Webhooks in Next.js (App Router)](https://dev.to/thekarlesi/how-to-handle-stripe-and-paystack-webhooks-in-nextjs-the-app-router-way-5bgi) — `await req.text()` before parse; App Router needs no `bodyParser` config (MEDIUM, corroborated by Next.js first-party route-handler semantics)

---
*Architecture research for: subscription billing + access control in an existing Next.js 16 / Prisma 7 multi-tenant SaaS*
*Researched: 2026-08-31*
