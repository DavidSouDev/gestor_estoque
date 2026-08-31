# Pitfalls Research

**Domain:** Subscription billing + hard access control retrofitted onto an existing Brazilian multi-tenant SaaS (Next.js 16 App Router / Prisma 7 / PostgreSQL)
**Researched:** 2026-08-31
**Confidence:** HIGH for codebase-grounded pitfalls (verified by direct inspection of `proxy.ts`, `lib/session.ts`, `lib/jwt.ts`, `lib/prisma.ts`, `app/api/catalogo/*`, `prisma/schema.prisma`), MEDIUM for gateway/webhook behaviour (web sources, cross-checked across 4+ independent articles)

**Assumed phase numbering** (research-time proposal; roadmap may renumber — the mapping table at the bottom uses these names):

- **Phase 0** — Pre-work / production blockers
- **Phase 1** — Data model + status engine (`StatusPagamento`, dates, pure decision function)
- **Phase 2** — Gateway integration + webhook receiver
- **Phase 3** — Access enforcement (admin block + catalog unpublish + grace banner)
- **Phase 4** — Daily worker
- **Phase 5** — Terms of use + acceptance gate
- **Phase 6** — Subscription management UI (status view + cancel)

---

## Critical Pitfalls

### Pitfall 1: Stateless 7-day JWT makes blocking a no-op (and reactivation invisible)

**What goes wrong:**
`lib/session.ts` issues a 7-day JWT (`SESSION_MAX_AGE_SECONDS = 60*60*24*7`) carrying `{ sub, empresaId, empresaSlug, email, role }`, and `getSession()` only calls `verifyAuthToken(token)` — **no database read happens on any request**. The moment you set `empresa.statusPagamento = 'bloqueado'`, nothing changes for a user who is already logged in: their cookie stays valid for up to 7 more days. The "hard block, no exceptions" core value silently fails for exactly the population you meant to block.

The mirror-image bug is worse: teams "fix" this by putting `statusPagamento` into the JWT payload. Now a customer who pays at 14:00 stays blocked until their token expires, because the token is a stale snapshot. You have converted a security hole into a support ticket generator.

**Why it happens:**
The existing auth was designed when the only question was "is this person logged in?" — a fact that genuinely doesn't change mid-session. Payment status is a fact that changes *asynchronously, from outside the request*, via webhook and worker. Stateless sessions cannot represent it.

**How to avoid:**
- **Never** put `statusPagamento`, `trialFim`, `bloqueioEm` or terms-acceptance state in the JWT.
- Add the payment check as a **DB read inside `requireAdminSession(slug)`** (the existing DAL chokepoint in `lib/session.ts`). One indexed `SELECT` per admin request on `Empresa` by id is cheap and always fresh.
- Wrap it with React `cache()` (the codebase already uses this pattern in `app/[slug]/_lib/empresa.ts`) so it's one query per render, not per component.
- Keep the JWT for *identity only*; keep authorization in the database.

**Warning signs:**
- A `statusPagamento` field appears in `AuthTokenPayload` in `lib/jwt.ts`.
- Manual test "set status to bloqueado in the DB, reload admin" still shows the dashboard.
- Anyone proposes "force logout on block" as the fix (it doesn't work — the user just logs back in unless login *also* checks).

**Phase to address:** Phase 3 (Access enforcement). Must be designed in Phase 1 so the status engine exposes a synchronous, testable `podeAcessar(empresa, agora)` function the DAL can call.

---

### Pitfall 2: Enforcing the paywall in `proxy.ts` only

**What goes wrong:**
`proxy.ts` is the obvious place to put the block — it already does the tenant/slug check. But the local Next.js 16 docs are explicit: *"Proxy is not intended for slow data fetching… it should not be used as a full session management or authorization solution"* (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md:29`). Two concrete failures follow:

1. `config.matcher` is `["/:slug/admin/:path*"]`. It does **not** match `/api/*` and does **not** match the public catalog `/{slug}`. A blocked company's admin UI is gone, but every `/api/produtos`, `/api/combos`, `/api/movimentacoes` route still works with their Bearer token, and the catalog is still fully served. The block is cosmetic.
2. Adding a Prisma query to the proxy means a DB round-trip on every matched request in an edge-ish runtime the Prisma adapter may not support, and it slows every navigation.

**Why it happens:**
`proxy.ts` already contains the tenant guard, so it *looks* like the authorization layer. It isn't — the existing code even documents this ("checagem otimista", "nunca confia apenas no Proxy").

**How to avoid:**
- Treat the proxy as an **optimistic UX redirect only** (send blocked users to `/{slug}/admin/assinatura` fast, using a cheap signal).
- Put the **authoritative** check in two places that all data must pass through:
  - `requireAdminSession()` for pages/layouts/Server Actions;
  - `requireAuth()` (in `lib/api-auth.ts`) extended to a `requireActiveSubscription()` for `/api/*` routes.
- Enumerate every route that touches tenant data and prove it hits one of those two chokepoints.

**Warning signs:**
- The word "bloqueado" appears in `proxy.ts` and nowhere in `lib/api-auth.ts`.
- No test exercises a blocked company's `/api/produtos` with a still-valid Bearer token.

**Phase to address:** Phase 3.

---

### Pitfall 3: Unpublishing the catalog in one read path out of five

**What goes wrong:**
"Despublicar o catálogo" gets implemented in `app/[slug]/(catalogo)/page.tsx` via `getEmpresaCatalogo`. Verified by inspection, there are **at least five independent public read paths** to the same tenant data:

| Path | Entry point | How the tenant is resolved |
|---|---|---|
| `/{slug}` | `app/[slug]/_lib/empresa.ts` → `empresaService.findBySlug` | slug |
| `GET /api/catalogo/produtos?slug=` | `empresaService.resolveIdBySlug` → `produtoService.listCatalogo` | slug |
| `GET /api/catalogo/produtos?empresaId=` | **skips slug resolution entirely** | raw `empresaId` from query string |
| `GET /api/catalogo/combos` (+ `/[id]`) | same shape | slug **or** raw `empresaId` |
| `GET /api/empresas/slug/[slug]` | `empresaService.findBySlug` | slug |

The `?empresaId=` branch in `app/api/catalogo/produtos/route.ts` is the killer: any check bolted onto slug resolution is trivially bypassed by passing the UUID directly. And `/api/catalogo/produtos/[id]` fetches by product id, where no tenant is named at all.

**Why it happens:**
The catalog grew organically as "page + convenience API". Nobody wrote down that these are five doors into the same room, and `INTEGRATIONS.md` records no prior gating requirement.

**How to avoid:**
- Gate at the **service layer, not the route layer**: make `empresaService.findBySlug`, `empresaService.resolveIdBySlug`, `produtoService.listCatalogo`, `comboService.listCatalogo` all refuse to return data for a non-publishable company (or accept an explicit `{ incluirBloqueadas: true }` flag used only by admin paths).
- Better: introduce a single `empresaService.findPublicavel(slug|id)` that every public path must call, and make the raw finders `private`/internal by convention.
- For `/api/catalogo/produtos/[id]`, resolve the product's `empresaId` first and check *that*.
- Write the E2E test `CONCERNS.md` already asks for (multi-tenancy isolation), extended: a blocked company must 404 on all five paths.

**Warning signs:**
- `grep -c "findBySlug\|resolveIdBySlug" app/` returns more call sites than the number of places your gate appears.
- The gate lives in `route.ts` files rather than `app/services/*.service.ts`.

**Phase to address:** Phase 3.

---

### Pitfall 4: Webhook endpoint with no signature verification — or verified after `request.json()`

**What goes wrong:**
Two distinct failures, both common:

1. **No verification at all.** The webhook URL is public by necessity; the existing `requireAuth()` (Bearer JWT) is useless here. Without a signature check, anyone who guesses `POST /api/webhooks/pagamento` can send `{"event":"PAYMENT_CONFIRMED","subscription":"..."}` and get free service forever — or send `PAYMENT_OVERDUE` for a competitor's subscription id and get them blocked. This is *the same class of bug* as the already-flagged `POST /api/usuarios` open endpoint in `CONCERNS.md`; do not add a second one.
2. **Verified against a re-serialized body.** In App Router route handlers you get a Web `Request`. Calling `await request.json()` consumes the stream; re-`JSON.stringify`-ing it produces bytes that are almost never identical to what the gateway signed (whitespace, key order, unicode escaping). Signature verification then fails 100% of the time, and the near-universal "fix" is to disable verification. Correct order is **`const raw = await request.text()` → verify HMAC over `raw` → `JSON.parse(raw)`**.

Mercado Pago's `x-signature` (`ts=...,v1=...`) is a documented sharp edge here — its template must be rebuilt from data id + request id + timestamp, and it's known to pass in sandbox while failing in production when built wrong.

**Why it happens:**
The Pages Router `bodyParser: false` folklore doesn't apply to App Router, so people copy the wrong recipe; and "it works in the gateway's test simulator" gives false confidence.

**How to avoid:**
- Read raw text first, always. Verify before parsing. Use timing-safe comparison.
- Also verify the **timestamp** in the signature and reject events older than ~5 minutes → kills replay of a captured legitimate `PAYMENT_CONFIRMED`.
- Even after verification, **re-fetch the authoritative object from the gateway API by id** before changing access state. The webhook is a notification, not a source of truth.
- Store the webhook secret in env with startup validation — `CONCERNS.md` already documents this exact gap for `JWT_SECRET` and R2 credentials; don't add a third silently-empty secret.

**Warning signs:**
- `await request.json()` appears above the signature check.
- The webhook route has no `try/catch` returning 400 on bad signature.
- Signature verification is behind a `if (process.env.NODE_ENV === 'production')` guard (means it never gets tested).

**Phase to address:** Phase 2.

---

### Pitfall 5: No idempotency + out-of-order events → stale event blocks a paying customer

**What goes wrong:**
Payment gateways deliver **at-least-once and out-of-order**. Stripe documents that it does not guarantee ordering; Asaas is reported to deliver `PAYMENT_CONFIRMED` before `PAYMENT_CREATED` for the same charge. Concretely for this project:

- A `PAYMENT_OVERDUE` webhook is delayed 40 seconds by a retry; meanwhile the customer pays and `PAYMENT_CONFIRMED` arrives and sets `em_dia`. The late `PAYMENT_OVERDUE` lands and sets `atrasado`. **A paying customer now sees the grace banner and will be blocked in 10 days.**
- The gateway retries a `PAYMENT_CONFIRMED` it never got a 200 for; a naive handler that appends a period to a "months paid" ledger double-credits the company a free month.
- Your handler throws (e.g. Prisma pool exhausted, see Pitfall 7), returns 500, the gateway retries with backoff — and if you never return 200, some gateways retry for days and eventually disable the endpoint.

**Why it happens:**
Local development delivers events one at a time, in order, exactly once. Every ordering bug is invisible until production, and then it is intermittent and affects paying customers — the worst possible combination.

**How to avoid:**
- **Idempotency table.** `ModelWebhookEvent { id, gatewayEventId @unique, tipo, payload Json, recebidoEm, processadoEm, erro }`. Insert first; a P2002 unique violation means "already seen" → return 200 immediately and do nothing. This converts the duplicate-delivery race into a constraint violation, which the DB resolves for you.
- **Never trust the event body's state.** On any subscription-affecting event, call the gateway API for the current subscription/charge and project *that*.
- **Monotonic guard.** Store `statusAtualizadoEm` on `Empresa` (or a version integer) and make every status write conditional: `UPDATE ... WHERE statusAtualizadoEm < :eventTimestamp`. An older event can then never clobber newer state, even if the re-fetch also raced.
- **Ack fast, process reliably.** Verify signature → persist raw event → return 200 → process. Never let business-logic failure turn into an endless retry storm.
- Don't use the event's `created` field for dedupe — use the event **id**.

**Warning signs:**
- The webhook handler contains a bare `prisma.empresa.update({ where: { id }, data: { statusPagamento } })` with no `WHERE` guard on time/version.
- No table exists that records received event ids.
- Support tickets of the form "eu paguei e continuo bloqueado" that resolve themselves after the next worker run.

**Phase to address:** Phase 2 (idempotency + monotonic writes), designed alongside Phase 1's status engine.

---

### Pitfall 6: Daily worker and webhook racing on the same `Empresa` row

**What goes wrong:**
Both writers touch `Empresa.statusPagamento`. The worker does read-modify-write: read status + dates → decide "grace expired" → write `bloqueado`. If a `PAYMENT_CONFIRMED` webhook commits `em_dia` between the worker's read and its write, **last write wins and the worker blocks a customer who just paid**. Prisma gives you no protection here by default; each statement is its own transaction.

This is the same shape as the two race conditions `CONCERNS.md` already documents (`generateUniqueSlug`, `UsuarioService.create`) — this codebase has an established habit of check-then-act. Repeating it on the billing status has much worse consequences than a slug collision.

**Why it happens:**
The worker is written as a simple loop over companies with plain `findMany` + `update`. Concurrency with the webhook is never simulated because both are triggered manually, minutes apart, in dev.

**How to avoid:**
- Make the worker's write **conditional on what it read**, in one statement: `UPDATE "Empresa" SET "statusPagamento"='bloqueado' WHERE id = $1 AND "statusPagamento" = 'atrasado' AND "statusAtualizadoEm" = $2`. Zero rows updated = someone else won; skip and move on. No lock needed.
- Or wrap per-company evaluation in `prisma.$transaction` with a `SELECT ... FOR UPDATE` on that single row.
- **Prefer making the worker idempotent and non-authoritative**: let the worker only *derive* block/unblock from already-persisted, gateway-sourced facts (`vencimentoEm`, `bloqueioEm`), never from its own recomputation of what the gateway thinks.
- Guard against **overlapping worker runs** too — Vercel Cron will happily start run N+1 while run N is still going, and neither retries on failure. Take a DB advisory lock or a `WorkerRun` row with a unique "in progress" constraint.

**Warning signs:**
- Worker code shaped as `const empresas = await findMany(...); for (const e of empresas) { await update(...) }`.
- No `statusAtualizadoEm`/`versao` column on `Empresa`.
- No mutual-exclusion mechanism for the cron endpoint.

**Phase to address:** Phase 4, with the column and conditional-write contract established in Phase 1.

---

### Pitfall 7: The known Prisma singleton bug turns the worker into a production outage

**What goes wrong:**
`lib/prisma.ts` caches the client in `globalThis` **only when `NODE_ENV !== "production"`** — the CRITICAL issue already in `CONCERNS.md`. In production every importing module can construct a fresh `PrismaClient`, each with its own pool.

This milestone makes it dramatically worse in three ways at once:
1. The **daily worker** iterates every company and opens many connections in a burst.
2. The **webhook endpoint** must respond within the gateway's timeout; if it can't get a connection it 500s, the gateway retries, which creates more concurrent invocations, which need more connections — a **retry storm feeding a connection-exhaustion spiral**.
3. Phase 3 adds a **DB read to every admin request** (Pitfall 1), raising baseline connection pressure.

A payment webhook that 500s under load doesn't just fail — it fails *silently from the user's perspective* while the gateway eventually gives up, leaving paying companies marked `atrasado`.

**Why it happens:**
It's already broken; this milestone is simply the first workload that will expose it.

**How to avoid:**
- **Fix `lib/prisma.ts` before any of this ships.** Cache in all environments. This is a one-line change with an outsized blast radius.
- If deploying serverless (Vercel), also add a connection pooler (PgBouncer / Prisma Accelerate / Neon or Supabase pooled URL) and cap `connection_limit` in `DATABASE_URL`.
- Give the worker a **separate, low-concurrency** DB path; do not let a batch job compete with request traffic for the same small pool.

**Warning signs:**
- `SELECT count(*) FROM pg_stat_activity;` climbing after each deploy or cron tick.
- Webhook 5xx rate in the gateway dashboard correlating with the cron schedule.

**Phase to address:** Phase 0 — hard prerequisite. Do not start Phase 4 with this open.

---

### Pitfall 8: Timezone and calendar arithmetic silently shifting trial/grace by a day

**What goes wrong:**
Users are in `America/Sao_Paulo` (UTC−3, no DST since 2019); the server, Vercel/VPS cron, PostgreSQL and Prisma `DateTime` are all UTC. Four concrete bugs:

1. **Cron at `0 0 * * *` (midnight UTC) is 21:00 BRT of the previous day.** A company whose grace ends "on the 10th" gets blocked at 21:00 on the 9th, Brazilian time. The banner says "1 dia restante" and the account is already dead.
2. **`toISOString().slice(0,10)` for "today".** After 21:00 BRT this returns tomorrow's date. Any "days remaining" counter computed this way is off by one for three hours every single night — the exact hours a small-business owner logs in.
3. **`d.setDate(d.getDate() + 10)`** for the grace window: correct for days, but if anyone uses `setMonth(+1)` for the billing period, Jan 31 → Mar 3. Month-end billing anchors are a classic source of skipped charges.
4. **Recomputing deadlines every run.** If the worker recalculates `bloqueioEm = vencimento + 10 dias` daily from a `vencimento` the gateway keeps nudging, the deadline drifts and the user sees "10 dias restantes" forever, or the window silently shortens.

**Why it happens:**
JS `Date` conflates instants and calendar dates. Comparing "days" is a calendar operation; storing timestamps is an instant operation; mixing them is invisible in tests written and run in one timezone.

**How to avoid:**
- **Compute the deadline once and store it.** Add `trialFim DateTime?`, `vencimentoEm DateTime?`, `bloqueioEm DateTime?`, `acessoAte DateTime?` to `Empresa`. Access decisions become `agora >= bloqueioEm` — a pure instant comparison with zero timezone semantics.
- The **worker never recomputes deadlines**; it only compares `now()` against stored instants and applies transitions. Deadlines are set by webhook events (gateway is the clock of record).
- **Display** conversion to `America/Sao_Paulo` happens only in the UI, with `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })`.
- **Schedule the cron at `0 3 * * *` UTC** (= 00:00 BRT) so "day boundaries" match user expectations. Better still, make the worker's correctness independent of *when* it runs (see below).
- **Round grace in the user's favour:** `diasRestantes = Math.ceil(...)`, and prefer end-of-day BRT as the deadline instant.
- Unit-test the decision function with the clock injected (`podeAcessar(empresa, agora)`), including cases at 23:00 BRT, 02:00 BRT, month boundaries, and Feb 29.

**Warning signs:**
- Any `new Date()` inside a service instead of an injected `agora`.
- `toISOString().slice(0,10)`, `getDate()`, or `setDate()` anywhere in billing logic.
- Tests that pass locally and fail in CI (CI is usually UTC — that discrepancy *is* the bug telling you about itself).

**Phase to address:** Phase 1 (stored deadlines + pure decision function), Phase 4 (cron schedule).

---

### Pitfall 9: Gateway API failure interpreted as "not paid" — mass false-positive blocking

**What goes wrong:**
The worker calls the gateway to check each subscription. The gateway has a 3-minute incident, or rate-limits you, or your API key rotates. The code does:

```
const sub = await gateway.getSubscription(id).catch(() => null);
if (!sub || sub.status !== 'active') → marcar atrasado / bloquear
```

**Every company in the platform gets blocked simultaneously**, admin panels lock, and every public catalog goes dark. Recovery requires a manual mass-restore and you have no record of what each company's status was before, because you overwrote it.

The milder version: one un-caught `fetch` timeout inside the loop throws, the serverless function dies, and companies after index *i* are never evaluated. The run "succeeded" (no alert), half the platform is silently unprocessed, and because Vercel does not retry failed cron invocations, nothing self-heals. If the loop always iterates in the same order, it's always the *same* companies that get skipped.

**Why it happens:**
"Absence of confirmation" and "confirmation of absence" get conflated. And a `for … await` loop with a single outer `try` looks fine in review.

**How to avoid:**
- **Fail closed on access, open on state:** an API error must map to *"unknown → change nothing"*, never to *"unpaid"*. Only an affirmative negative signal from the gateway (or an elapsed stored `bloqueioEm`) may block.
- **Per-company `try/catch`**; record `{ empresaId, erro }` and continue. Never let one tenant abort the run.
- **Circuit breaker / blast radius cap:** if the run would transition more than N% of companies to `bloqueado` in a single execution, abort and alert instead. A correct run on a real platform changes a handful of rows; a run that blocks 300 companies is a bug, not a billing event.
- **Idempotent, resumable, batched.** Vercel serverless `maxDuration` defaults to 10s and caps at 60s — a loop over all companies with a network call each will time out well before you notice. Process in pages, persist a cursor, make re-running safe.
- **Prefer designing the worker so it needs no gateway calls at all**: webhooks keep `vencimentoEm`/`bloqueioEm` current; the worker only applies time-based transitions from local data. Then a gateway outage cannot poison it. Use a separate, low-frequency reconciliation job (weekly) for drift, which *reports* discrepancies rather than auto-blocking.
- **Never auto-block from a reconciliation mismatch.** Surface it for human review.

**Warning signs:**
- Any `?? 'atrasado'`, `catch { return false }`, or default-deny fallback in gateway client code.
- Worker has no per-item error isolation and no summary log of processed/failed counts.
- No alert on "worker didn't finish" (silence is indistinguishable from success).

**Phase to address:** Phase 4, with the gateway client contract set in Phase 2.

---

### Pitfall 10: The terms-of-use gate locks everyone out — including out of the accept button

**What goes wrong:**
Four distinct lockouts, all easy to ship:

1. **Migration backfill.** You add `Usuario.termosAceitosEm DateTime?` (null by default) and `Termos.atualizadoEm`. Every existing user now has `null < atualizadoEm` → **100% of the user base is gated on the next deploy**, including customers who never agreed to anything new.
2. **Deadlock.** The accept action lives under `app/[slug]/admin/(protected)/`, whose layout calls `requireAdminSession()`, which now enforces the terms gate. The user cannot accept the terms without having accepted the terms. Same for logout.
3. **Gate placed before the session exists.** Checking terms in `proxy.ts` or on the login route means you need the user id before authentication completes — people work around it by trusting a query param, reintroducing an auth bypass.
4. **Timestamp-based comparison.** The owner fixes a typo in the terms; `atualizadoEm` bumps; every user on the platform is re-gated for a comma. Worse, if the superadmin endpoint touches the record at all (Prisma `@updatedAt` fires on *any* write), an unrelated edit re-gates everyone.

**Why it happens:**
The gate is naturally implemented in the same place as the auth guard, and the "current terms" record naturally carries `updatedAt`. Both instincts are wrong.

**How to avoid:**
- **Backfill in the migration.** Set `termosAceitosEm = now()` (or `createdAt`) for all existing users, and set the initial `Termos` record's effective date *before* that. Existing users are gated only by a *future* publication.
- **Version, don't timestamp.** `Termos { versao Int, publicadoEm DateTime, conteudo }` and `Usuario.termosVersaoAceita Int?`. Gate iff `termosVersaoAceita < versaoVigente`. Editing text without bumping `versao` never gates anyone — make bumping an explicit, deliberate act with its own confirmation in the superadmin endpoint.
- **Allow-list.** The terms modal's accept Server Action, the logout action, and the subscription/billing page must be reachable while gated. Implement the gate as an explicit list of gated routes or an explicit `permitirSemTermos` escape on those specific actions — not as a blanket layout guard.
- **Gate after authentication, before data.** Inside `requireAdminSession()`, after the session is resolved.
- **Never gate the public catalog** — the tenant's end customers are not the ones accepting anything.
- Ship it behind a flag; verify with an account created *before* the migration.

**Warning signs:**
- Migration has no `UPDATE "Usuario" SET ...` backfill.
- The gate compares `DateTime` values rather than an integer version.
- No test for "user with stale terms can still reach the accept endpoint and log out".

**Phase to address:** Phase 5.

---

### Pitfall 11: Multi-tenant isolation leaks introduced by the *new* billing surfaces

**What goes wrong:**
Existing tenant isolation is solid (`empresaId` everywhere, `proxy.ts` slug↔token binding, `requireAdminSession` re-verification). The new entities break the pattern because they're keyed by **gateway identifiers**, not by `empresaId`:

- `GET /api/assinatura/[id]` or `/api/pagamentos/[id]` doing `findUnique({ where: { id } })` and rendering it — a classic IDOR, leaking another company's invoices, amounts, and gateway customer id.
- Webhook handler resolving `gatewaySubscriptionId → empresa` correctly, but a *management* endpoint accepting a client-supplied `gatewaySubscriptionId` and acting on it.
- **The superadmin terms endpoint.** `UserRole` today is `enum UserRole { ADMIN }` — there is no `SUPERADMIN`. If the endpoint reuses `requireAuth()` and checks `role === 'ADMIN'`, **every tenant admin on the platform can rewrite the terms of use for everyone** and force-gate the entire user base. If it's protected by nothing (as `POST /api/usuarios` currently is — see `CONCERNS.md`), anyone on the internet can.
- **Cancel-subscription action** taking an `assinaturaId` from the form body instead of deriving it from `session.empresaId` → one company cancels another's plan.
- A cross-tenant **oracle**: an unauthenticated public route that returns 404 for blocked companies and 200 for active ones lets anyone enumerate which businesses are behind on payments — commercially sensitive information about your customers.

**Why it happens:**
The isolation discipline is carried in habit, not enforced by the type system, and `CONCERNS.md` already records "No E2E Tests for Multi-Tenancy Isolation". New models written by a different mental mode (integration code, not CRUD code) don't inherit the habit.

**How to avoid:**
- **Every new billing model gets `empresaId` with an index**, even when a gateway id would suffice, and **every** query filters on it: `findFirst({ where: { id, empresaId: session.empresaId } })`.
- **Never accept a gateway identifier from the client.** Derive it server-side from `session.empresaId`. Cancel takes no id at all.
- **Add `SUPERADMIN` to `UserRole`** (or a separate out-of-band admin path with its own secret) before building the terms-update endpoint. Do not ship a terms endpoint gated only on `role === 'ADMIN'`.
- Make the "unavailable" response for a blocked catalog **identical to the response for a non-existent slug** (plain 404, no payment wording) — which PROJECT.md already requires for UX reasons and which also closes the oracle.
- Build the multi-tenant E2E suite `CONCERNS.md` recommends *in this milestone*, extended to billing routes. This is the natural moment.

**Warning signs:**
- Any new `findUnique({ where: { id } })` in a billing service.
- A request body or Server Action argument named `assinaturaId`, `customerId`, or `subscriptionId`.
- The terms-update route's auth check is textually identical to a normal tenant route's.

**Phase to address:** Phase 2 (models), Phase 5 (superadmin role), Phase 6 (management UI). Isolation E2E tests as a cross-cutting deliverable.

---

### Pitfall 12: Multi-period arrears reactivation modelled as a boolean

**What goes wrong:**
PROJECT.md requires: *"2 meses atrasados exigem pagamento dos 2 meses para reativar."* The naive implementation is `on PAYMENT_CONFIRMED → status = 'em_dia'`. With two months owed and one paid, the company is reactivated for free. The opposite failure is equally common: the gateway's recurring-subscription model only ever issues **one** invoice for the current cycle (it does not retro-bill skipped months), so "pay 2 months" **may not exist as a gateway concept at all** — and the feature is unimplementable as specified without generating a separate one-off charge.

There's a Brazil-specific aggravator: as of Jan 2026 inter-bank automatic debit via boleto ended and Pix Automático took over recurring collection. Boleto and Pix confirmations can lag **hours to days**. A company that pays the boleto on the last day of grace is confirmed two days later — after the worker already blocked them. Blocking must not be irreversible or manual to undo.

**Why it happens:**
"Reactivate on payment" is a one-line rule that is right 90% of the time, and the 10% only appears with real delinquent accounts, months after launch.

**How to avoid:**
- **Validate the arrears model against the chosen gateway during Phase 2 research**, before committing to the requirement. Ask explicitly: does the gateway accumulate unpaid cycles, or does it just retry/cancel? This may force a scope change (e.g. "reactivation requires settling one catch-up charge") — better discovered now.
- **Model periods explicitly.** A `Cobranca`/period ledger (`competencia`, `vencimento`, `pagoEm`, `gatewayChargeId`) makes "are there unsettled periods?" a query, not an inference. Reactivate iff `count(unsettled) === 0`.
- **Make reactivation fully automatic and idempotent** so a late boleto/Pix confirmation heals the account with no human involvement. Never require manual DB intervention to unblock.
- Treat `bloqueado` as **reversible state, never data destruction** — no cascading deletes, no catalog teardown, no image purges.

**Warning signs:**
- A single `statusPagamento` field with no accompanying charge/period records.
- "Reactivation" implemented as a status write with no check of outstanding periods.
- Any code path where being blocked deletes or archives tenant content.

**Phase to address:** Phase 1 (ledger model), Phase 2 (gateway capability validation).

---

### Pitfall 13: Six statuses, non-exhaustive checks

**What goes wrong:**
`em_dia | atrasado | vitalicio | cancelado | bloqueado | trial` — six states, and access rules differ per state *and* per date. Code written as `if (empresa.statusPagamento === 'bloqueado') negar()` silently grants access to `cancelado`-past-`acessoAte`, and to `trial` whose `trialFim` has passed. Written as `if (status !== 'em_dia') negar()` it **blocks `vitalicio` and `trial` customers** — including whoever set `vitalicio` manually in the DB, which by design has no UI and therefore no test coverage.

`vitalicio` is uniquely dangerous: it's set by direct SQL, so it never flows through any code path a developer exercised, and the worker will happily "correct" it to `atrasado` if the worker's rules don't special-case it.

**Why it happens:**
Boolean thinking about a six-valued enum, plus scattered checks (the codebase already has "validation logic scattered" as a documented concern).

**How to avoid:**
- **One pure function, one file:** `podeAcessarAdmin(empresa, agora): { permitido, motivo, diasRestantes }` and `catalogoPublicavel(empresa, agora): boolean`. Nothing anywhere else may branch on `statusPagamento`.
- Use an **exhaustive TS `switch`** with a `default: const _: never = status` — strict mode then makes adding a 7th status a compile error at every decision point.
- **Table-driven unit tests**: 6 statuses × {before/at/after each stored deadline} × {trial, vitalicio}. This is ~30 cases and it is the highest-value test suite in the milestone.
- Explicitly assert `vitalicio` is never modified by the worker.

**Warning signs:**
- `grep -rn "statusPagamento" app/ | wc -l` growing past a handful of files.
- Boolean fields like `bloqueado: Boolean` coexisting with the enum (two sources of truth that will diverge).

**Phase to address:** Phase 1.

---

### Pitfall 14: Cancellation access window anchored to a value that can be null

**What goes wrong:**
"Acesso mantido até o fim dos 30 dias do último pagamento." Computing `ultimoPagamento + 30 dias` at read time breaks when `ultimoPagamento` is null — which happens for: a company cancelling **during trial**, a `vitalicio` company, a company created by direct DB insert, and a company whose first charge never succeeded. `null + 30` becomes either "epoch + 30 days" (instant block, angry customer mid-trial) or `NaN`/`Infinity` (permanent free access, silent revenue loss).

Also: cancelling in the gateway immediately (instead of `cancel_at_period_end`) both cuts access early *and* forfeits the paid remainder.

**How to avoid:**
- **Store `acessoAte DateTime` at the moment of cancellation**, computed then, with an explicit fallback chain: `ultimoPagamento + 30d` → else `trialFim` → else `now()`. One decision, one write, auditable.
- Use the gateway's **cancel-at-period-end** semantics rather than immediate cancellation.
- Cancelling during trial should preserve the trial to `trialFim`, not truncate it.
- Make cancellation **reversible** until `acessoAte` (a "reactivate" button) — cheap to build, directly retains revenue.

**Warning signs:**
- Access logic containing `ultimoPagamento` and an arithmetic operator.
- No `acessoAte` column.
- Cancellation flow untested from the `trial` state.

**Phase to address:** Phase 1 (column), Phase 6 (cancel flow).

---

### Pitfall 15: Terms scope (Usuario) and payment scope (Empresa) collapse into one — invisibly

**What goes wrong:**
PROJECT.md is explicit that payment status is per-`Empresa` and terms acceptance is per-`Usuario`. But `prisma/schema.prisma` currently has `@@unique([empresaId])` on `Usuario` — **exactly one user per company today**. Every wrong implementation (terms stored on `Empresa`, payment status stored on `Usuario`) will pass 100% of tests and work perfectly in production, until the day a second user is added to a company. At that point terms acceptance either applies to nobody or to everybody, and there is no migration path because the data was never recorded per-user.

**Why it happens:**
The constraint makes the two scopes observationally equivalent. There is no feedback signal.

**How to avoid:**
- Put `termosVersaoAceita` on `Usuario` and `statusPagamento` on `Empresa` **now**, even though it's currently indistinguishable — the cost is zero today and prohibitive later.
- Write at least one test that creates two `Usuario` rows for one `Empresa` (bypassing/relaxing the constraint in a test fixture) and asserts: both blocked together on payment, gated independently on terms.
- Add a comment at both schema sites recording the intent, so a future refactor doesn't "simplify" them together.

**Warning signs:**
- `termos` fields appearing on the `Empresa` model.
- `statusPagamento` reachable via `usuario.statusPagamento`.

**Phase to address:** Phase 1 (schema), Phase 5 (terms).

---

### Pitfall 16: Calling the gateway inside the registration transaction

**What goes wrong:**
Registration (`app/registro/actions.ts` → `empresaService.registerComUsuario`) creates `Empresa` + `Usuario` transactionally. Adding "create gateway customer" inside that transaction ties an open Postgres transaction to a third-party network call: the transaction holds locks for the gateway's latency, and a gateway timeout **rolls back the whole account creation** — the user sees "erro ao registrar" and retries, hitting the `Usuario.email @unique` / `Empresa.slug @unique` constraints (and the slug race already in `CONCERNS.md`). Some users end up with a gateway customer and no local account: an orphan that will never be reconciled.

PROJECT.md is clear that trial requires **no payment at registration** — so there is no reason to talk to the gateway here at all.

**How to avoid:**
- Registration writes local state only: `statusPagamento = 'trial'`, `trialFim = now + 14d`. Zero external calls.
- Create the gateway customer **lazily**, on first visit to the subscription screen or first checkout — where a failure is recoverable and retryable, and the user is in a context where "payment provider unavailable" makes sense.
- Store `gatewayCustomerId` as nullable; treat null as "not yet provisioned", never as an error.

**Warning signs:**
- Any `fetch`/SDK call inside a `prisma.$transaction` callback.
- `gatewayCustomerId` declared non-nullable.

**Phase to address:** Phase 2.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| Put `statusPagamento` in the JWT to skip a DB read | No extra query per admin request | Paying customers stay blocked up to 7 days after paying; unfixable without forced logout | **Never** |
| Enforce the block only in `proxy.ts` | One file, ships in an hour | `/api/*` and the public catalog stay wide open; block is cosmetic | **Never** |
| Trust the webhook payload instead of re-fetching from the gateway | One less API call, simpler handler | Out-of-order events silently corrupt access state; intermittent, unreproducible | Only for non-access-affecting events (e.g. logging a receipt) |
| Skip the `WebhookEvent` idempotency table | Fewer migrations | Double-credited periods, retry storms; retrofitting requires backfilling history you don't have | **Never** |
| Recompute `bloqueioEm` on every worker run instead of storing it | No new columns | Deadlines drift with gateway date nudges; timezone bugs multiply; grace silently shortens or never ends | **Never** |
| Worker calls the gateway per company | "Always accurate" | Gateway outage → mass false blocking; 60s serverless timeout; run poisoning | Only for a weekly *reporting* reconciliation that cannot write status |
| Timestamp-based terms gating (`atualizadoEm`) instead of a version integer | No extra column | Any edit re-gates the whole user base; typo fixes cause support floods | **Never** |
| Ship the terms-update endpoint gated on `role === 'ADMIN'` | No `UserRole` migration | Every tenant admin can rewrite platform terms and gate all users | **Never** |
| Manual DB edit as the "reactivation" path for edge cases | Unblocks the urgent ticket | Becomes the de-facto process; late boleto/Pix confirmations all need a human | Acceptable **only** for `vitalicio` (explicitly in scope), never for arrears |
| Single `statusPagamento` field with no charge/period ledger | Much smaller Phase 1 | Multi-period arrears rule (an Active requirement) becomes unimplementable; no audit trail for disputes | Only if the arrears requirement is formally dropped |
| Defer the `lib/prisma.ts` singleton fix | Stays "out of milestone scope" | Worker + webhook retries + per-request status reads exhaust the pool → platform outage | **Never** — it is a prerequisite, not scope creep |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| Gateway webhook (any) | `await request.json()` before verifying the signature | `const raw = await request.text()` → HMAC-verify `raw` (timing-safe) → `JSON.parse(raw)` |
| Gateway webhook (any) | No signature verification; endpoint is effectively public write access to billing state | Mandatory signature + timestamp freshness check (reject > ~5 min old) to stop replay |
| Mercado Pago | `x-signature` parsed naively; template rebuilt wrong; passes in sandbox, fails in prod | Split `ts=`/`v1=`, rebuild the manifest from data-id + `x-request-id` + ts exactly per docs; test against a real prod-mode event |
| Asaas | Assuming ordered delivery — `PAYMENT_CONFIRMED` can arrive before `PAYMENT_CREATED` | Order-independent handlers + re-fetch current charge/subscription by id |
| Stripe | Using `event.created` for dedupe or ordering | Dedupe on `event.id` (unique constraint); order by re-fetching the live object |
| Any gateway | Returning non-200 on a duplicate/unknown event | Return 200 for duplicates and for events you don't handle; reserve non-2xx for "please retry me" |
| Any gateway | Handler does all work before responding, exceeds the gateway's timeout | Verify → persist raw event → 200 → process asynchronously/idempotently |
| Boleto / Pix Automático | Treating "not confirmed today" as "not paid" | Confirmation lags hours–days; blocking must be automatically reversible on late confirmation |
| Brazilian recurrence (post-Jan 2026) | Assuming inter-bank automatic debit via boleto still works | It ended; Pix Automático is the recurring rail — confirm the chosen gateway's support before committing |
| Vercel Cron | Assuming retries on failure; assuming no overlap; default `maxDuration` 10s (max 60s) | No retries exist → build resumability + alerting; take a DB lock against overlap; batch with a cursor |
| Vercel Cron | Unprotected cron route — anyone can trigger the billing worker | Compare `Authorization` against `CRON_SECRET` (env var you create; no newlines/special chars) |
| Vercel Cron | Cron runs on Production deployments only; schedule interpreted in UTC | Verify in production; schedule `0 3 * * *` UTC = 00:00 BRT |
| Prisma + serverless | New `PrismaClient` per module in production (existing bug) | Cache in `globalThis` unconditionally; add a connection pooler; cap `connection_limit` |
| Next.js caching | Adding `use cache`/ISR to `/{slug}` later — a blocked catalog keeps serving from the Full Route Cache | Keep the catalog dynamic, or `revalidateTag(\`empresa:\${id}\`)` on every status change; note on-demand revalidation only invalidates the instance that receives it unless a shared cache handler is configured |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| Prisma singleton disabled in production | `pg_stat_activity` climbing; 500s under load; webhook retry storms | Fix `lib/prisma.ts`; add pooler | Already broken; the worker/webhook makes it visible immediately |
| Payment status re-queried per component instead of per request | Admin page latency grows with component count | Wrap the lookup in React `cache()` (pattern already used in `app/[slug]/_lib/empresa.ts`) | ~immediately noticeable; worsens as admin UI grows |
| Worker loops all companies serially with a gateway call each | Cron exceeds `maxDuration`, run truncated silently | Local-data-only worker; batch + cursor; bounded concurrency | ~50–100 companies at 60s timeout |
| Webhook handler does heavy work before responding | Gateway timeouts → retries → duplicate processing → more load | Ack fast, process after | Under any burst (e.g. monthly billing day) |
| No index on `gatewaySubscriptionId` / `gatewayCustomerId` | Webhook latency grows linearly with the `Assinatura` table | Unique index on each gateway id column | A few thousand rows |
| No index on the worker's selection predicate (`statusPagamento`, `bloqueioEm`) | Full table scan every night | Composite index on `(statusPagamento, bloqueioEm)` | Low thousands of companies |
| Unbounded `WebhookEvent` payload retention | Table bloat, slow dedupe lookups, backups grow | Index on `gatewayEventId`; retention/archival policy (e.g. 90 days) | ~1 year of traffic |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---|---|---|
| Unsigned webhook endpoint | Anyone grants themselves free service, or blocks a competitor's business | Mandatory HMAC signature verification; timing-safe compare |
| No replay protection on a valid signed event | A captured `PAYMENT_CONFIRMED` is re-sent monthly for permanent free access | Verify signature timestamp freshness **and** dedupe on event id |
| Terms-update endpoint gated on `role === 'ADMIN'` (only value in `UserRole` today) | Any tenant admin rewrites the platform's legal terms and force-gates every user | Add `SUPERADMIN` (or out-of-band admin with its own secret) before building it |
| Unprotected cron endpoint | Anyone triggers the billing worker repeatedly (DoS, unexpected state transitions) | `CRON_SECRET` in `Authorization`, checked before any work |
| Client-supplied `assinaturaId`/`customerId` in cancel or status endpoints | Cross-tenant cancellation and invoice disclosure (IDOR) | Derive all billing ids server-side from `session.empresaId` |
| Blocked catalog returns a distinguishable response from a nonexistent slug | Anyone enumerates which of your customers are delinquent — sensitive commercial data | Return an identical plain 404 for both (also satisfies the "no payment message on the catalog" requirement) |
| Gateway secrets read as `process.env.X ?? ""` | Silent misconfiguration; webhook verification effectively disabled | Validate at module load and fail fast (same fix class as the documented `JWT_SECRET`/R2 gaps) |
| Storing card data "just the last 4 and brand, temporarily" | Scope creep into PCI territory; violates an explicit project constraint | Store only opaque gateway ids; render card details by calling the gateway |
| Logging full webhook payloads | PII/financial data in application logs and log-aggregator retention | Log event id, type and outcome; store the raw payload in the DB with restricted access |
| New billing models queried by `id` alone | Cross-tenant data disclosure | `where: { id, empresaId }` on every billing query; E2E isolation tests |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| Blocking with no route to pay | Customer wants to pay and literally cannot; guaranteed churn | The blocked state must still render the subscription/payment screen and logout — everything else 403s |
| Grace banner shows a wrong day count (UTC vs BRT) | "Restam 2 dias" then blocked the next morning; destroys trust | Compute from stored instants, format in `America/Sao_Paulo`, `Math.ceil` in the user's favour |
| No warning before the trial ends | Silent block on day 15; user assumes the product broke | Banner from ~day 10 of trial + email; same banner component as grace |
| Payment succeeds but the UI still says "atrasado" (webhook lag of 1–5s) | User pays twice, or opens a support ticket | On return from checkout, synchronously fetch status from the gateway and reconcile; then poll with backoff (~1s,2s,3s,4s,5s) |
| Payment banner leaks onto the public catalog | The tenant's own customers see their supplier is delinquent — commercially damaging | Banner is admin-only (already required); enforce by placing it in the admin layout only |
| Blocked catalog shows a payment/error message | Same leak, plus it looks like the tenant's business failed | Plain 404, identical to an unknown slug |
| Non-dismissible terms modal with no "read the full text" and no copy to keep | Users feel coerced; some abandon; possible legal weakness in consent | Show full terms in a scrollable panel, a visible version + date, a downloadable copy, and record `{ versao, aceitoEm, ip }` |
| Terms modal appears at the same time as the grace banner and the trial banner | Three competing blockers; user can't act on any | Define a strict precedence: terms gate → payment block → grace banner → trial banner. One at a time |
| Cancellation is instant and irreversible | User loses paid time; support burden; no win-back | Cancel-at-period-end, show "acesso até {data}", offer one-click reactivation before `acessoAte` |
| No email at any lifecycle event | User discovers the block by being locked out | Email on: trial ending, payment failed, each grace milestone, blocked, reactivated |

---

## "Looks Done But Isn't" Checklist

- [ ] **Blocking:** works in the admin UI — verify a blocked company also gets 403 on `/api/produtos`, `/api/combos`, `/api/movimentacoes` with a still-valid Bearer token, and that an *already-logged-in* session is blocked without waiting for the 7-day JWT to expire.
- [ ] **Catalog unpublish:** verify all five read paths 404 — `/{slug}`, `/api/catalogo/produtos?slug=`, **`/api/catalogo/produtos?empresaId=<uuid>`**, `/api/catalogo/produtos/[id]`, `/api/catalogo/combos*`, `/api/empresas/slug/[slug]`.
- [ ] **Webhook:** verify signature is checked against the **raw** body — send a request with valid JSON but a tampered signature and confirm 400; send a replayed old-but-valid event and confirm rejection.
- [ ] **Idempotency:** send the same event id twice; verify exactly one state change and a 200 both times.
- [ ] **Out-of-order:** deliver `PAYMENT_OVERDUE` *after* `PAYMENT_CONFIRMED` with an earlier event timestamp; verify the company stays `em_dia`.
- [ ] **Worker/webhook race:** verify the worker's status write is conditional (`WHERE statusAtualizadoEm = <read value>`) — grep for an unconditional `update`.
- [ ] **Worker resilience:** simulate a gateway 500/timeout; verify **zero** companies are blocked and the run completes with logged failures.
- [ ] **Worker blast radius:** verify a cap/alert exists that aborts a run trying to block an abnormal share of the platform.
- [ ] **Worker overlap:** trigger the cron endpoint twice concurrently; verify the second is a no-op.
- [ ] **Cron auth:** call the cron endpoint without `CRON_SECRET`; verify 401.
- [ ] **Timezone:** run the decision function with `agora` at 23:30 BRT and 00:30 BRT around a deadline; verify `diasRestantes` and block/allow are consistent and never a day early.
- [ ] **Trial:** verify a 14-day trial actually grants 14 full days in BRT, and that trial expiry is handled by the same path as grace expiry.
- [ ] **All six statuses:** verify `vitalicio` is never touched by the worker; verify `cancelado` before `acessoAte` still has access and after it does not; verify `trial` is not blocked by an `!== 'em_dia'` check.
- [ ] **Reactivation:** with two periods owed, verify paying one does **not** reactivate; verify paying both does, automatically, with no manual step.
- [ ] **Late confirmation:** confirm a payment *after* blocking; verify fully automatic unblock.
- [ ] **Terms migration:** create a user, then run the terms migration; verify that pre-existing user is **not** gated.
- [ ] **Terms deadlock:** with a gated user, verify the accept action, logout, and the subscription page are all reachable.
- [ ] **Terms versioning:** edit the terms text without bumping the version; verify nobody is re-gated.
- [ ] **Terms authz:** call the terms-update endpoint as a normal tenant `ADMIN`; verify 403.
- [ ] **Terms scope:** with two users in one company, verify terms gate independently and payment blocks both.
- [ ] **Isolation:** as company A, attempt to read/cancel company B's subscription by id; verify 404.
- [ ] **Registration:** verify no gateway call occurs during registration and that a gateway outage does not prevent signup.
- [ ] **Prisma pool:** verify `lib/prisma.ts` caches globally in production before the worker ships.
- [ ] **Secrets:** verify the app fails at startup (not at first webhook) when the gateway secret or `CRON_SECRET` is missing.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| Mass false-positive blocking (gateway outage) | **HIGH** — every tenant's admin and public catalog down simultaneously | Requires a pre-built escape hatch: an audit table of every status transition (`from`, `to`, `motivo`, `at`, `origem`) plus a "revert transitions from run X" script. Without the audit table you cannot know each company's prior state. **Build the audit table in Phase 1 — it is the only cheap insurance against this.** |
| Payment status in the JWT | MEDIUM | Remove from payload, move to DB read, rotate `JWT_SECRET` to invalidate all outstanding tokens (forces one global re-login) |
| Forged webhooks accepted (no signature) | HIGH | Add verification; then audit every status transition since launch against the gateway's own records; revoke fraudulent grants; assume the endpoint URL is public forever |
| Duplicate events double-credited periods | MEDIUM | Add the idempotency table, then replay reconciliation against the gateway's charge history to recompute the ledger — feasible only if you stored raw payloads |
| Terms migration gated the whole user base | LOW **if caught fast** | Backfill `termosVersaoAceita` for all users created before the publication date; ship the version-based comparison. Cost rises sharply with time (support volume, churn) |
| Blocked a customer who paid late (boleto/Pix lag) | LOW | Automatic reactivation on the late confirmation — provided blocking never destroyed data and reactivation needs no human |
| Connection pool exhaustion in production | MEDIUM | Fix the singleton, redeploy, add pooler. Downtime during the incident is total; gateway webhooks sent while down may be permanently lost if the gateway exhausted retries → reconciliation run needed |
| Cross-tenant billing leak (IDOR) | HIGH | Patch queries, audit access logs for exploitation, notify affected tenants (LGPD exposure) |
| Worker silently skipped companies for weeks | MEDIUM | Detectable only with per-run summary metrics; add "processed vs expected count" alerting from day one, otherwise the failure is invisible |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| Prisma singleton × worker/webhook load (7) | **Phase 0** | `lib/prisma.ts` caches unconditionally; `pg_stat_activity` flat under a simulated worker run |
| Six-status non-exhaustive checks (13) | Phase 1 | Exhaustive `switch` with `never`; ~30-case table-driven test; `statusPagamento` branched on in exactly one file |
| Timezone / date arithmetic (8) | Phase 1 (+ Phase 4 schedule) | Deadlines stored as instants; decision function takes injected `agora`; tests at BRT day boundaries; cron at `0 3 * * *` UTC |
| Multi-period arrears as a boolean (12) | Phase 1 (model) + Phase 2 (gateway capability) | Charge/period ledger exists; "pay 1 of 2 owed" test stays blocked |
| Cancellation anchor null (14) | Phase 1 (column) + Phase 6 (flow) | `acessoAte` written at cancellation; cancel-during-trial test |
| Terms/payment scope collapse (15) | Phase 1 (schema) + Phase 5 | Two-users-one-company test: terms independent, payment shared |
| Mass false blocking / audit gap (recovery) | Phase 1 | `StatusTransicao` audit table exists before the worker ships |
| Webhook signature / raw body (4) | Phase 2 | Tampered-signature test → 400; `request.text()` precedes verification |
| Idempotency + out-of-order (5) | Phase 2 | Unique `gatewayEventId`; duplicate-delivery test; reversed-order test |
| Gateway call inside registration transaction (16) | Phase 2 | No network call inside `$transaction`; signup works with the gateway unreachable |
| New billing surfaces leak tenants (11) | Phase 2 (models) + Phase 5 (SUPERADMIN) + Phase 6 (UI) | Cross-tenant E2E suite covering billing routes; terms endpoint 403s for tenant ADMIN |
| Stateless JWT defeats blocking (1) | Phase 3 | Set status in DB → next admin request blocked with no re-login; pay → next request allowed |
| Proxy-only enforcement (2) | Phase 3 | Blocked company gets 403 on every `/api/*` tenant route |
| Catalog unpublish misses read paths (3) | Phase 3 | All five public paths 404 for a blocked company, including `?empresaId=` |
| Next.js cache serving an unpublished catalog (integration) | Phase 3 | Catalog stays dynamic, or `revalidateTag` fires on every status change |
| Gateway failure poisons the worker (9) | Phase 4 | Fault-injection test: gateway 500 → zero blocks, run completes; blast-radius cap triggers |
| Worker/webhook write race (6) | Phase 4 | Conditional `UPDATE` returning 0 rows on conflict; concurrent-write test |
| Worker overlap / no retries / timeout (integration) | Phase 4 | Concurrent-trigger test is a no-op; batched cursor; run-completion alert |
| Terms gate lockout & deadlock (10) | Phase 5 | Pre-existing user not gated after migration; gated user can accept and log out; text edit without version bump gates nobody |
| Payment-status lag after checkout (UX) | Phase 6 | Post-checkout sync + backoff polling; status correct within seconds |

---

## Sources

**Direct codebase inspection (HIGH confidence)** — `lib/session.ts`, `lib/jwt.ts`, `lib/api-auth.ts`, `lib/prisma.ts`, `proxy.ts`, `prisma/schema.prisma`, `app/api/catalogo/produtos/route.ts`, `app/api/empresas/slug/[slug]/route.ts`, `app/[slug]/(catalogo)/page.tsx`, `app/[slug]/_lib/empresa.ts`, `next.config.ts`, `.planning/codebase/CONCERNS.md`, `.planning/PROJECT.md`

**Local Next.js 16 documentation (HIGH confidence)** — `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` (proxy is not an authorization solution), `node_modules/next/dist/docs/01-app/02-guides/authentication.md`, `.../02-guides/cdn-caching.md`

**Web sources (MEDIUM confidence, cross-checked)**
- [Stripe subscription webhooks that survive the edge cases — Amplified Creations](https://amplifiedcreations.com/journal/stripe-subscription-webhooks) — out-of-order events, re-fetch-don't-trust, dunning grace
- [Receive Stripe events in your webhook endpoint — Stripe Docs](https://docs.stripe.com/webhooks) — at-least-once delivery, no ordering guarantee, dedupe on event id not `created`
- [Stripe Webhook Reliability Patterns Every SaaS Should Implement — DEV](https://dev.to/astraedus/stripe-webhook-reliability-patterns-every-saas-should-implement-2pg1) — `updated_at` guard, unique-constraint idempotency, reconciliation jobs
- [Building Reliable Stripe Subscriptions in NestJS: Webhook Idempotency and Optimistic Locking — DEV](https://dev.to/aniefon_umanah_ac5f21311c/building-reliable-stripe-subscriptions-in-nestjs-webhook-idempotency-and-optimistic-locking-3o91) — webhook_events table + optimistic locking
- [The Webhook Mistakes That Cost Companies Real Money — Salable](https://salable.app/blog/saas-startup-guides/webhooks-sync-billing)
- [billing webhook race condition solution guide — excessivecoding.com](https://excessivecoding.com/blog/billing-webhook-race-condition-solution-guide) — post-checkout sync + exponential backoff polling
- [Stripe Subscription Canceled but Still Has Access](https://axonbuild.com/blog/subscription-cancel-still-access/)
- [How to Handle Stripe and Paystack Webhooks in Next.js (The App Router Way) — DEV](https://dev.to/thekarlesi/how-to-handle-stripe-and-paystack-webhooks-in-nextjs-the-app-router-way-5bgi) — raw body via `.text()`
- [Fix: Stripe Webhook Signature Verification Failed — GuardLayer](https://www.guardlayer.io/blog/stripe-webhook-signature-verification)
- [Ensure the validity of notifications sent by Mercado Pago](https://www.mercadopago.com.br/developers/en/news/2024/02/27/Ensure-the-validity-of-notifications-sent-by-Mercado-Pago) — `x-signature` `ts`/`v1` manifest
- [mercadopago/sdk-nodejs Discussion #318 — x-signature fails in prod but works in test](https://github.com/mercadopago/sdk-nodejs/discussions/318)
- [Asaas recorrente + Webhook: guia prático — CuritibaBlog](https://curitibablog.com.br/pagamento-recorrente-asaas-webhook-dotnet) — Asaas does not guarantee webhook ordering; boleto confirmation lag
- [Pix Automático vs boleto vs cartão: cobrança recorrente — Pluggy](https://www.pluggy.ai/blog/pix-automatico-vs-debito-automatico-boleto-cartao) — end of inter-bank boleto automatic debit (Jan 2026)
- [Sistema de Assinatura Recorrente no Brasil — SystemForge](https://forjadesistemas.com.br/blog/sistema-assinatura-recorrente-brasil-quanto-custa/)
- [Troubleshooting Vercel Cron Jobs — Vercel KB](https://vercel.com/kb/guide/troubleshooting-vercel-cron-jobs) — no retries, production-only, timeout limits
- [Managing Cron Jobs — Vercel Docs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — `CRON_SECRET` authorization
- [Vercel cron jobs — syntax, examples & limits — CronTool](https://tool.crontap.com/vercel-cron-jobs) — overlapping runs require your own locking; `maxDuration` 10s default / 60s max
- [Time Zones in Billing: Why Getting This Wrong Costs Real Money — Lago](https://getlago.com/blog/time-zone-nightmares) — double-charging at period boundaries on timezone change
- [Bill your customers in their timezone, not yours — Lago](https://getlago.com/blog/bill-your-customers-in-their-timezone-not-yours)
- [Set the subscription billing renewal date — Stripe Docs](https://docs.stripe.com/billing/subscriptions/billing-cycle) — billing anchors are UTC
- [Enforce Terms & Conditions Acceptance on Login — Fenergo](https://docs.fenergox.com/release-notes/portal-release-notes/2026/02/26/general/Enforce-Terms-And-Conditions) — check after authentication, non-dismissible modal
- [Allow admins to force users to re-accept terms when updated — GitLab issue #45901](https://gitlab.com/gitlab-org/gitlab-foss/-/issues/45901) — versioned terms, per-user acceptance
- [Guides: How Revalidation Works — Next.js](https://nextjs.org/docs/app/guides/how-revalidation-works) and [Guides: CDN Caching](https://nextjs.org/docs/app/guides/cdn-caching) — on-demand revalidation is per-instance without a shared cache handler

---
*Pitfalls research for: subscription billing + access control retrofit on a Brazilian multi-tenant Next.js/Prisma SaaS*
*Researched: 2026-08-31*
