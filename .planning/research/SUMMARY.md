# Project Research Summary

**Project:** Cobrança recorrente por assinatura (billing + access control) para SaaS B2B multi-tenant brasileiro
**Domain:** Subscription billing / paywall retrofit on an existing Next.js 16 + Prisma 7 + PostgreSQL multi-tenant SaaS
**Researched:** 2026-08-31
**Confidence:** MEDIUM-HIGH

## Executive Summary

This milestone retrofits recurring subscription billing and hard access control onto an existing, working multi-tenant SaaS. The research strongly converges on one architectural idea that should anchor the entire roadmap: **store facts (`pagoAte`/`acessoAte`, `trialFim`, `canceladoEm`), never counters or cached verdicts, and derive the access decision at request time with a single pure function** (`avaliarAcesso(fatos, agora)`). This makes the daily reconciliation worker a *safety net*, not the authority — a missed cron run cannot silently unblock or wrongly block a paying tenant. Every research file (stack, features, architecture, pitfalls) independently arrives at this same conclusion, which is the strongest signal in this research set.

The recommended gateway is **Asaas** (Pix without invite-only restriction, no monthly fee, ~4% take rate, native NFS-e, per-period `payment` objects that map cleanly to arrears tracking) over Stripe (better SDK/DX/Customer Portal, but Pix is invite-only in Brazil and ~1.5pp more expensive) — a genuinely close call that should be revisited if Stripe Pix access becomes available. Whichever gateway is chosen, the actual integration is a thin, swappable port/adapter — the domain logic must never depend on gateway vocabulary.

The biggest risks are not the "happy path" billing logic but retrofit hazards specific to this codebase: (1) the existing 7-day stateless JWT makes blocking a no-op unless a DB check is added to the session gate; (2) the catalog is exposed through **five** independent public read paths, and gating only the page leaves a fully functional bypass via `?empresaId=`; (3) the already-known Prisma singleton bug (`lib/prisma.ts`, cached only outside production) will turn the new worker + webhook traffic into a connection-pool exhaustion incident unless fixed first; (4) webhook idempotency and out-of-order delivery must be handled with a DB unique constraint, not application-level checks, or a late-arriving stale event can wrongly block a paying customer. The `PROJECT.md` requirement "pay N months in arrears to reactivate" is flagged as unsupported by gateway primitives and worth revisiting as a scope/UX decision, not just an implementation detail.

## Key Findings

### Recommended Stack

Full detail: `.planning/research/STACK.md`. Core decision: **Asaas API v3** with **hosted checkout** (`POST /v3/checkouts`) to avoid all PCI scope, a **PostgreSQL-advisory-lock-protected HTTP cron endpoint** (`GET /api/cron/assinaturas`) as the daily worker (hosting-agnostic — works identically behind Vercel Cron or a VPS `crontab`), and `zod` + `@sentry/nextjs` added specifically because this milestone introduces the first untrusted external input (webhooks) and the first silent-failure-critical code path in the app.

**Core technologies:**
- **Asaas API v3** (no official Node SDK — build a thin typed `fetch` client): Pix without invite gate, cheapest take rate at the target price point, per-period `payment` objects
- **Asaas Checkout hospedado**: card capture happens on Asaas's page — zero PAN/CVV ever touches this database, no PCI SAQ-A-EP scope
- **zod 4.5.4**: validates webhook payloads and env vars — the webhook is the first untrusted-internet input this codebase has
- **PostgreSQL advisory locks** (`pg_try_advisory_lock`, via `$queryRaw`): prevents double-execution of the cron without adding Redis
- **Vercel Cron or VPS crontab** (interchangeable, zero code difference): the worker is a bearer-token-guarded HTTP endpoint; hosting decision is explicitly *not* a blocker for this milestone
- **@sentry/nextjs 10.72.0**: there is currently zero error tracking in the codebase; a silent webhook/worker failure here means a paying customer gets blocked

### Expected Features

Full detail: `.planning/research/FEATURES.md`.

**Must have (table stakes):**
- `acessoAte` (paid-through date) + `acessoVitalicio` as the single source of truth for access — everything else derives from it
- Idempotent webhook ingestion (signature verification + `@@unique([provider, eventId])` + always-200 response)
- Trial (14 days, no card) with an explicit "trial expired" state — trial does not auto-convert
- Daily reconciliation worker (expires trials, applies grace→block, is idempotent)
- Grace banner with days remaining + payment CTA; catalog 404s (no payment message) when blocked
- Subscription management screen (ideally delegated to the gateway's hosted portal)
- Cancel-at-period-end, showing the exact access-until date
- Versioned terms of use (`TermosVersao` immutable) + per-user `AceiteTermo` with IP/timestamp — a single `atualizadoEm` timestamp is legally insufficient
- NFS-e emission — a gap in the original PROJECT.md; manual in v1, automated later if the gateway supports it (Asaas does)
- Dunning emails — **delegate 100% to the gateway**; the codebase has zero email infrastructure and none should be built for this alone

**Should have (competitive, not v1-blocking):**
- Pix Automático as a lower-failure-rate payment method
- Card-swap self-service from the grace banner (near-free if using the gateway's hosted portal)
- Annual billing with discount (removes 11 failure opportunities/year)
- Cancellation reason capture (one optional question, non-blocking)

**Defer (v2+):**
- Multiple pricing tiers/plans (already out of scope — confirmed correct)
- Pausing subscriptions
- Read-only mode instead of hard block (conflicts with current "hard block" decision — pick one)
- Data-deletion policy post-block (60-90 day industry norm; not v1)
- "Quitar todos os meses em atraso" as literally specified — flagged as an anti-pattern/anti-feature (see Pitfalls)

### Architecture Approach

Full detail: `.planning/research/ARCHITECTURE.md`. Defense-in-depth with exactly one authoritative decision function: `lib/billing/access.ts` (`avaliarAcesso(fatos, agora)`) is pure, has no I/O, and is called identically by the admin layout gate, the catalog data-access-layer gate, and the daily worker. `proxy.ts` remains cookie-only/optimistic (per Next.js 16 docs, it must not do DB-backed authorization). The webhook route does verify→persist→200→process-async, using a DB unique constraint as the idempotency mechanism rather than app-level check-then-act. The daily worker is a thin, `CRON_SECRET`-guarded route handler delegating to a service — the scheduler (Vercel Cron/VPS/GitHub Actions) is an interchangeable detail behind that same HTTP contract.

**Major components:**
1. `lib/billing/access.ts` — pure decision function; the single implementation of trial/grace/cancel/vitalício rules, unit-tested exhaustively with an injected clock
2. `assinatura.service.ts` — billing state read/write, `reconciliarTodas()`, materializes `statusPagamento` as a cached projection (never the gate's input)
3. `webhook.service.ts` — inbox persistence, dedupe by external event id, gateway-event → domain-state translation
4. `termo.service.ts` — versioned terms + per-user acceptance ledger
5. Gateway adapter (`lib/billing/gateways/*`) — port/adapter isolating the chosen provider so the gateway decision doesn't leak into domain code
6. Enforcement chokepoints — `empresaService.findBySlug`/`resolveIdBySlug` (catalog), admin `(protected)/layout.tsx` (UI + banner), `requireAuthComAssinatura()` extending `requireAuth` (API surface)

### Critical Pitfalls

Full detail: `.planning/research/PITFALLS.md` (16 pitfalls; top 5 below).

1. **Stateless 7-day JWT makes blocking a no-op** — payment status must never be embedded in the JWT; add a DB read inside `requireAdminSession()`, wrapped in React `cache()`.
2. **Enforcing the block only in `proxy.ts` or only in the layout** — `/api/*`, Server Actions, and at least 5 distinct public catalog read paths (including a `?empresaId=` bypass) do not go through layouts; the gate must live at the service/data-access layer.
3. **Prisma singleton bug (`lib/prisma.ts` caches only outside production)** — already a documented critical issue; this milestone's worker + webhook burst traffic will turn it into a production outage. Must be fixed as a Phase 0 prerequisite.
4. **No webhook idempotency / trusting event order** — gateways deliver at-least-once and out of order; a delayed `PAYMENT_OVERDUE` can land after a `PAYMENT_CONFIRMED` and wrongly block a paying customer. Requires a DB unique constraint on event id plus monotonic/conditional writes, never a blind `UPDATE`.
5. **Worker/webhook race on the same `Empresa` row** — both are writers; use conditional `UPDATE ... WHERE statusAtualizadoEm = :read_value` or advisory locks, never unconditional read-modify-write.

Also notable: gateway-outage mass false-positive blocking must fail closed on *access* (never auto-block on an API error), and the "pay all months in arrears to reactivate" requirement has no native gateway support and risks turning recoverable churn into permanent churn — resolve as a scope decision before Phase 2.

## Implications for Roadmap

### Phase 0: Production Prerequisites
**Rationale:** The Prisma singleton bug is already a known critical issue and this milestone's worker + webhook traffic is what will actually trigger the outage. Must be fixed before any load-bearing billing code ships.
**Delivers:** `lib/prisma.ts` caches the client unconditionally; connection pooling strategy decided if hosting is serverless.
**Avoids:** Pitfall 7 (connection pool exhaustion cascading into webhook 500s → retry storms).

### Phase 1: Data Model + Pure Access-Decision Engine
**Rationale:** Everything else (gates, worker, webhook processing) reads/writes these facts and calls this function. Building it first forces every trial/grace/cancel edge case to be settled once, in one place, before being scattered across call sites.
**Delivers:** `Empresa` billing fields (`pagoAte`/`acessoAte`, `trialFim`, `canceladoEm`, `statusPagamento` as projection), `WebhookEvent`, `TermoUso`/`AceiteTermo`, `StatusTransicao` audit table, and `lib/billing/access.ts` with exhaustive unit tests (~30 table-driven cases across 6 statuses × timing boundaries).
**Addresses:** `acessoAte` as single source of truth (FEATURES.md P1); avoids Pitfalls 8 (timezone/date arithmetic), 12 (arrears-as-boolean), 13 (non-exhaustive status checks), 14 (null cancellation anchor), 15 (terms/payment scope collapse).

### Phase 2: Gateway Integration + Webhook Ingestion
**Rationale:** Requires the STACK.md gateway decision (Asaas recommended) to be finalized; genuinely blocked on an external choice, so isolate it as its own phase rather than let it stall other work.
**Delivers:** `GatewayPagamento` port/adapter, hosted checkout flow, subscription creation, webhook route (verify raw body → persist → 200 → process async, DB-unique-constraint idempotency).
**Uses:** Asaas API v3 (STACK.md); Pattern 3 (Webhook Inbox) and Pattern 4 (Cron as Guarded Route) from ARCHITECTURE.md.
**Avoids:** Pitfall 4 (signature verified after `.json()`), Pitfall 5 (no idempotency/out-of-order), Pitfall 16 (gateway call inside registration transaction), Pitfall 11 (new billing models leaking cross-tenant via gateway ids).

### Phase 3: Access Enforcement (Admin + Catalog + API)
**Rationale:** Gates must exist before any tenant can actually be flipped to blocked. Deliberately sequenced so enforcement ships and is validated in production (with every tenant grandfathered to trial/vitalício) *before* Phase 4's worker can start blocking anyone.
**Delivers:** DB-backed check in `requireAdminSession()`, `requireAuthComAssinatura()` for `/api/*`, catalog gate applied to all five public read paths, `bloqueado` screen, grace banner.
**Avoids:** Pitfall 1 (JWT-only blocking), Pitfall 2 (proxy-only enforcement), Pitfall 3 (catalog gated in one path of five).

### Phase 4: Daily Reconciliation Worker
**Rationale:** Only safe to build last because Phase 1's derived-decision design already makes the system correct without it — the worker reconciles and materializes, it does not decide.
**Delivers:** `CRON_SECRET`-guarded route handler, advisory-lock-protected `reconciliarTodas()`, per-tenant error isolation, blast-radius cap/alert, `revalidatePath` on every status flip.
**Avoids:** Pitfall 6 (worker/webhook write race), Pitfall 9 (gateway outage → mass false-positive blocking), general Vercel Cron gotchas.

### Phase 5: Terms of Use + Acceptance Gate
**Rationale:** Fully independent of the billing/gateway decision — parallelizable, not a dependency of Phases 2-4.
**Delivers:** `TermosVersao`/`AceiteTermo` schema with correct migration backfill, version-integer comparison (not timestamp), non-deadlocking blocking modal, `SUPERADMIN` role added before the terms-publish endpoint ships.
**Avoids:** Pitfall 10 (terms gate lockout/deadlock), Pitfall 15 (terms/payment scope collapse), gating a platform-wide endpoint on the existing single `ADMIN` role.

### Phase 6: Subscription Management UI + Polish
**Rationale:** Builds on a working, already-validated gate (Phase 3) and worker (Phase 4); mostly UI, lowest risk, ships last.
**Delivers:** Subscription status/cancel screen (prefer gateway hosted portal), post-checkout sync + backoff polling, cancellation flow with exact access-until date, trial-ending/grace notifications.

### Phase Ordering Rationale

- Phase 0 exists because this codebase already has a critical bug that this milestone's load pattern will specifically trigger.
- Phases 1→3→4 follow the "facts stored, verdict derived" architecture: model and pure function first, gates proven safe with everyone grandfathered, then the worker is allowed to actually block anyone.
- Phase 2 is isolated because it's the only phase blocked on an external, still-open decision (gateway choice).
- Phase 5 (terms) is deliberately decoupled and can run in parallel with Phases 2-4.

### Research Flags

Needs deeper research: **Phase 2** (Asaas has no official SDK, no subscription-level webhooks — subscription state must be derived; also resolve arrears-reactivation scope), **Phase 4** (hosting/scheduler platform still undecided).

Standard patterns (skip research-phase): **Phase 1** (fully specified with code examples), **Phase 3** (chokepoints enumerated exactly), **Phase 5** (standard versioned-consent pattern).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Architecture/worker patterns HIGH (Vercel/Next.js first-party docs); gateway fees/Asaas queue behavior MEDIUM (commercial tables change; confirm in sandbox) |
| Features | MEDIUM-HIGH | Gateway lifecycle semantics HIGH; trial/dunning benchmarks MEDIUM; BR competitor analysis explicitly LOW/unverified |
| Architecture | HIGH | Next.js 16 claims verified against bundled docs; webhook/idempotency patterns cross-checked; terms modeling MEDIUM-HIGH |
| Pitfalls | HIGH (codebase-grounded) / MEDIUM (gateway behavior) | Codebase pitfalls verified by direct inspection; gateway/webhook pitfalls cross-checked across 4+ sources |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- Gateway final confirmation (Asaas sandbox base URL, webhook auth header, checkout approval requirements) before Phase 2.
- Pricing not yet set in PROJECT.md — fee comparison assumes ~R$49.90/mo; confirm before finalizing Phase 2 scope.
- Hosting decision deferred by architecture but must be confirmed before Phase 4 planning (Prisma pooling, scheduler choice).
- "Quitar N meses em atraso" requirement needs a product decision (e.g. one catch-up charge instead of literal N-month settlement) before Phase 1's ledger model is finalized.
- JWT TTL vs. DB-check tradeoff: confirm DB-revalidation-per-request as the Phase 3 approach.
- CDC (Brazilian consumer law) applicability to this B2B SaaS needs legal review — out of scope for technical research.

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/**` (Next.js 16.3.0 install) — proxy/middleware rename, `after()`, Data Access Layer pattern
- Direct codebase inspection — `proxy.ts`, `lib/session.ts`, `lib/jwt.ts`, `lib/api-auth.ts`, `lib/prisma.ts`, `prisma/schema.prisma`, `app/api/catalogo/*`, `.planning/codebase/CONCERNS.md`, `.planning/PROJECT.md`
- https://vercel.com/docs/cron-jobs/manage-cron-jobs, /usage-and-pricing
- https://docs.asaas.com (webhooks, subscriptions, checkout)
- https://docs.stripe.com (billing/subscriptions, webhooks, smart-retries)
- `npm view`/`npm pack` verified versions (2026-08-31): stripe@22.6.0, zod@4.5.4, @sentry/nextjs@10.72.0, mercadopago@3.6.0, @pagarme/pagarme-nodejs-sdk@7.0.1, date-fns@4.4.0, @date-fns/tz@1.5.0, @upstash/qstash@2.11.3

### Secondary (MEDIUM confidence)
- Gateway fee/pricing pages (asaas.com/precos-e-taxas, stripe.com/br/pricing)
- Multiple webhook-reliability blog posts, cross-checked
- SaaS trial/dunning benchmark sources (Chargebee, Maxio, Userpilot)

### Tertiary (LOW confidence)
- Brazilian SMB competitor feature analysis — unverified this session
- Mercado Pago/Pagar.me/Iugu fee estimates

---
*Research completed: 2026-08-31*
*Ready for roadmap: yes*
