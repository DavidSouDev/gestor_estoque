---
phase: 04-aplica-o-do-bloqueio
verified: 2026-09-01T14:45:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 4: Aplicação do Bloqueio — Verification Report

**Phase Goal:** Uma empresa que não paga perde de fato o admin e tem o catálogo despublicado — sem brecha por API, Server Action ou rota alternativa do catálogo
**Verified:** 2026-09-01
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Banner de carência aparece em todas as telas do admin, nunca no catálogo | ✓ VERIFIED | `app/[slug]/admin/(protected)/_components/aviso-carencia.tsx` rendered in both SIMPLES and COMPLETO branches of `app/[slug]/admin/(protected)/layout.tsx` (lines 53-55, 67, 84); `diasRestantesDeCarencia` computed in the layout (impure caller) and injected as a prop — component itself reads no clock. `npm run gates:fase-04` Gate 4 confirms zero banner references under `app/[slug]/(catalogo)`. |
| 2 | Após 10 dias de carência, todos os usuários da Empresa perdem acesso ao admin (UI e API) | ✓ VERIFIED | `lib/session.ts::requireAdminSession` redirects to `/{slug}/admin/bloqueado` when `acessoBloqueado(conta.statusAcesso)` (line 139-141); `lib/api-auth.ts::requireAuth` throws `AuthError(..., 402)` for the same predicate (line 124-129) with a single documented opt-out (`permitirEmpresaBloqueada`) used only by `app/api/assinaturas/checkout/route.ts` — confirmed unique by `grep` (only 1 production call site) and by Gate 1 of `gates-fase-04.mjs`. `DIAS_DE_CARENCIA = 10` in `lib/avaliar-acesso.ts`. |
| 3 | Catálogo público bloqueado indisponível pelos 6 caminhos, sem menção a pagamento | ✓ VERIFIED | All 6 paths gated through `empresaPodePublicar`/`avaliarAcesso`: `empresaService.findBySlug` (used by `GET /api/empresas/slug/[slug]` and the `/{slug}` catalog page via `getEmpresaCatalogo`→`notFound()`), `empresaService.findPublicavelBySlug`/`findPublicavelById` (used by `GET /api/catalogo/produtos` and `GET /api/catalogo/combos`, both `?slug=` and `?empresaId=` branches), `produtoService.findCatalogoById` and `comboService.findCatalogoById` (used by the two `[id]` routes, each with `empresa: { deletedAt: null }` closing the pre-existing soft-delete leak). None of the response bodies contain billing facts (destructured out before return) or payment wording. |
| 4 | Empresas em dia/trial/vitalícia continuam funcionando | ✓ VERIFIED | `BLOQUEIA` lookup table in `lib/avaliar-acesso.ts` is `Record<StatusAcesso, boolean>` with only `BLOQUEADO`/`CANCELADO` set `true`; `TRIAL`/`EM_DIA`/`CARENCIA`/`VITALICIO` all `false`. Compiler-enforced exhaustiveness (7th enum value would fail to compile). e2e spec `bloqueio-por-inadimplencia.spec.ts:89` explicitly asserts a TRIAL company keeps working after the guards are live. |
| 5 | Pagamento confirmado reativa automaticamente, sem intervenção manual | ✓ VERIFIED | `revalidarConta`/`avaliarAcesso` are re-evaluated on every request via `React.cache` (per-request only — Gate 2 of `gates-fase-04.mjs` proves no `unstable_cache`/`'use cache'` on any guard file). The same rejected Bearer token is accepted on the very next request once `acessoAte` advances (no re-login, no cache TTL). e2e spec `bloqueio-por-inadimplencia.spec.ts:111` asserts the full cycle: healthy → blocked (UI+API+catalog) → paid → restored. |

### Plan-Level Must-Haves (04-01 .. 04-09)

All 9 plans' `must_haves.truths`/`artifacts`/`key_links` were checked directly against source, not just against SUMMARY narration:

| Plan | Key truth checked | Result |
|------|--------------------|--------|
| 04-01 | Single exhaustive predicate (`Record<StatusAcesso, boolean>`); `findBySlug` returns null for blocked with same query cost; branding path ungated | ✓ Verified in `lib/avaliar-acesso.ts`, `app/services/empresa.service.ts` |
| 04-02 | Product/combo `findCatalogoById` gated + soft-delete tenant bug closed, no extra query | ✓ Verified — `empresa: { deletedAt: null }` + `empresa: { select: EMPRESA_PUBLICAVEL_SELECT }` in the same `findFirst` |
| 04-03 | List endpoints gated on both `?slug=` and `?empresaId=`; `GET /api/empresas/slug/[slug]` 404 with existing body; ungated resolver removed | ✓ Verified in both route files; old resolver removed (comment at empresa.service.ts:385-389 documents removal, no `resolveIdBySlug` symbol found) |
| 04-04 | `getEmpresaCatalogo` (gated) vs `getEmpresaBranding` (ungated) split; login renders generic branding when blocked | ✓ Verified in `app/[slug]/_lib/empresa.ts` and `app/[slug]/admin/login/page.tsx` — no payment/suspension wording present |
| 04-05 | Dedicated blocked screen, `PagarButton` client-side token-safe, BLOQUEADO/CANCELADO identical copy, route outside `(protected)`, symmetric guard | ✓ Verified in `bloqueado/page.tsx`, `bloqueado-card.tsx`, `pagar-button.tsx` — single copy driven by boolean prop, no status branch in the card |
| 04-06 | `requireAdminSession`/`requireAuth` gate without touching call sites; single checkout opt-out; same token accepted next request | ✓ Verified — `permitirEmpresaBloqueada` used exactly once in production code |
| 04-07 | Banner in both layout branches; never in catalog; no internal clock | ✓ Verified — `AvisoCarencia` receives `diasRestantes` as a prop, computed by the layout |
| 04-08 | Reproducible seed script outside prod; e2e covering blocked/trial/reactivation | ✓ Verified — `scripts/seed-fatos-billing.ts` + `e2e/bloqueio-por-inadimplencia.spec.ts` (2 tests enumerated via `playwright test --list`) |
| 04-09 | Executable grep gates (not prose); no new dependency | ✓ Verified — `npm run gates:fase-04` → 6/6 OK |

**Score:** 9/9 must-haves (plan-level) + 5/5 roadmap success criteria verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/avaliar-acesso.ts` | `acessoBloqueado`, `podePublicarCatalogo`, `diasRestantesDeCarencia`, `Record<StatusAcesso, boolean>` | ✓ VERIFIED | All three functions present, exported, exhaustive lookup table present |
| `lib/empresa-publicavel.ts` | `EMPRESA_PUBLICAVEL_SELECT`, `empresaPodePublicar` | ✓ VERIFIED | Both exported, neutral module (no cross-import cycle) |
| `app/services/empresa.service.ts` | `findPublicavelBySlug`, `findPublicavelById`, `findBrandingBySlug`, gate inside `findBySlug` | ✓ VERIFIED | All 4 methods present and correctly gated/ungated per design |
| `app/services/produto.service.ts` / `combo.service.ts` | `findCatalogoById` with tenant + status gate | ✓ VERIFIED | Both use `EMPRESA_PUBLICAVEL_SELECT` nested select, single query |
| `app/api/catalogo/produtos/route.ts` / `combos/route.ts` | Gated resolution on both branches | ✓ VERIFIED | Uses `findPublicavelById`/`findPublicavelBySlug` |
| `app/api/empresas/slug/[slug]/route.ts` | 404 via gated `findBySlug` | ✓ VERIFIED | Same message body as pre-existing "not found" case |
| `app/[slug]/_lib/empresa.ts` | `getEmpresaCatalogo` (gated, `notFound()`), `getEmpresaBranding` (ungated) | ✓ VERIFIED | Both exported, correctly documented and used |
| `app/[slug]/admin/login/page.tsx` | Generic branding variant when blocked | ✓ VERIFIED | `BRANDING_GENERICO` fallback, no payment wording |
| `app/[slug]/admin/_lib/assinatura-actions.ts` | `iniciarPagamento` Server Action | ✓ VERIFIED | `redirect()` outside try/catch, tenant from session only |
| `app/[slug]/admin/_components/pagar-button.tsx` | Shared CTA, `useFormStatus` | ✓ VERIFIED | No `onClick`/`fetch`, form-driven |
| `app/[slug]/admin/bloqueado/page.tsx` / `bloqueado-card.tsx` | Blocked screen outside `(protected)` | ✓ VERIFIED | Symmetric guard, single copy for BLOQUEADO/CANCELADO |
| `lib/session.ts` | Gate inside `requireAdminSession` | ✓ VERIFIED | `acessoBloqueado` check present |
| `lib/api-auth.ts` | `OpcoesDeAuth.permitirEmpresaBloqueada`, gate in `requireAuth` | ✓ VERIFIED | 402 status, single opt-out |
| `app/api/assinaturas/checkout/route.ts` | Unique opt-out call site | ✓ VERIFIED | Confirmed unique via grep + Gate 1 |
| `app/[slug]/admin/(protected)/_components/aviso-carencia.tsx` | Grace banner | ✓ VERIFIED | `role="status"`, no clock, 3 copy variants |
| `app/[slug]/admin/(protected)/layout.tsx` | Banner in both branches | ✓ VERIFIED | Rendered in SIMPLES and COMPLETO branches |
| `scripts/seed-fatos-billing.ts` | Reproducible billing-fact seeding | ✓ VERIFIED | Exists, referenced by `npm run seed:billing` |
| `e2e/bloqueio-por-inadimplencia.spec.ts` | End-to-end proof | ✓ VERIFIED | 2 tests enumerated: trial-continues, blocked-full-cycle |
| `scripts/gates-fase-04.mjs` | 6 executable gates | ✓ VERIFIED | `npm run gates:fase-04` → 6/6 OK |
| `scripts/contagem-status-acesso.ts` | Read-only status distribution count | ✓ VERIFIED | Exists, referenced by `npm run acesso:contagem` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `empresa.service.ts` | `empresa-publicavel.ts` | `EMPRESA_PUBLICAVEL_SELECT` / `empresaPodePublicar` import | ✓ WIRED | Confirmed import + usage |
| `empresa-publicavel.ts` | `avaliar-acesso.ts` | `avaliarAcesso` + `podePublicarCatalogo` | ✓ WIRED | Confirmed |
| `produto.service.ts` / `combo.service.ts` | `empresa-publicavel.ts` | `empresaPodePublicar` | ✓ WIRED | Confirmed in `findCatalogoById` |
| `app/api/catalogo/produtos(/combos)/route.ts` | `empresa.service.ts` | `findPublicavelById`/`findPublicavelBySlug` | ✓ WIRED | Confirmed |
| `login/page.tsx` | `_lib/empresa.ts` | `getEmpresaBranding` | ✓ WIRED | Confirmed, not `getEmpresaCatalogo` |
| `lib/session.ts` | `admin/bloqueado/page.tsx` | `redirect('/{slug}/admin/bloqueado')` | ✓ WIRED | Confirmed |
| `lib/api-auth.ts` | `avaliar-acesso.ts` | `acessoBloqueado` | ✓ WIRED | Confirmed |
| `checkout/route.ts` | `lib/api-auth.ts` | `permitirEmpresaBloqueada: true` | ✓ WIRED | Confirmed, single occurrence |
| `(protected)/layout.tsx` | `aviso-carencia.tsx` | `<AvisoCarencia diasRestantes=... />` | ✓ WIRED | Confirmed in both branches |
| `bloqueado/page.tsx` | `assinatura-actions.ts` | `iniciarPagamento.bind(null, slug)` | ✓ WIRED | Confirmed |
| `e2e/bloqueio-por-inadimplencia.spec.ts` | `scripts/seed-fatos-billing.ts` | child_process / npm script | ✓ WIRED | `npm run seed:billing` script present in `package.json` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite passes | `npm test` | 876/876 tests passed, 86 files | ✓ PASS |
| Type-check clean | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Lint clean (pre-existing warnings only) | `npm run lint` | 0 errors, 2 pre-existing warnings unrelated to phase (in `app/registro/page.tsx`, documented in `deferred-items.md`) | ✓ PASS |
| Phase gates all pass | `npm run gates:fase-04` | 6/6 gates OK | ✓ PASS |
| e2e spec exists & enumerates required scenarios | `npx playwright test --list e2e/bloqueio-por-inadimplencia.spec.ts` | 2 tests: "empresa em trial continua funcionando..." and "empresa bloqueada perde admin, API e catálogo, e volta ao pagar" | ✓ PASS |
| `permitirEmpresaBloqueada` opt-out is unique in production code | `grep -rn "permitirEmpresaBloqueada"` | Exactly 1 production call site (`checkout/route.ts`); other 2 hits are the type definition and tests | ✓ PASS |

Note: full Playwright e2e run against a real Postgres instance was not executed by this verifier (would require live DB/dev server); existence, enumeration, and code-level correctness were confirmed instead, consistent with the "prove one exists / run one named test" constraint on this agent. The e2e run was already executed and recorded as green (22/22 specs) in `04-VALIDATION.md`, signed off by the operator on 2026-09-01.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|--------------|--------|----------|
| ACC-01 | 04-05, 04-07 | Banner de aviso em carência com dias restantes | ✓ SATISFIED | `aviso-carencia.tsx` + layout wiring |
| ACC-02 | 04-01, 04-05, 04-06, 04-08, 04-09 | Bloqueio total do admin após carência | ✓ SATISFIED | `requireAdminSession`/`requireAuth` gates, blocked screen, e2e proof |
| ACC-03 | 04-01, 04-02, 04-03, 04-04, 04-08, 04-09 | Catálogo público indisponível pelos 6 caminhos | ✓ SATISFIED | All 6 paths traced and confirmed gated |
| ACC-04 | 04-06, 04-08 | Reativação automática sem cobrança retroativa | ✓ SATISFIED | Per-request `React.cache` revalidation, no cross-request cache on any guard (Gate 2) |

No orphaned requirements — REQUIREMENTS.md maps exactly ACC-01..04 to Phase 4, and all 4 appear in plan frontmatter (`requirements:` fields across 04-01, 04-04, 04-05, 04-06, 04-08, 04-09).

### Anti-Patterns Found

None. Scanned all files listed across the 9 plans' `files_modified` frontmatter for `TODO|FIXME|XXX|TBD|placeholder|not implemented|coming soon` — zero matches. No empty handlers, no hardcoded static returns masquerading as real data, no debt markers.

The one file matching `__gate-temp` in git history (`app/api/__gate-temp/route.ts`) was a documented, deliberately temporary non-vacuity proof for Gate 1 (04-09-T1) and does not exist in the current tree (confirmed absent).

### Human Verification Required

None outstanding. The phase's own Validation Strategy (`04-VALIDATION.md`) already executed and recorded sign-off for the three items that required human judgment before merge:

1. Pre-merge impact count (`npm run acesso:contagem` against target DB) — executed and approved by the operator (qualitative approval, exact numbers not transcribed into the planning artifacts — a minor traceability gap, but not a phase-goal blocker since the check itself ran and was reviewed).
2. Partial rendering / stale banner after client-side `<Link>` navigation — approved; admin remains gated correctly.
3. `redirect()` to external URL from a Server Action reaching the Asaas checkout — approved; no client-side fallback was needed.

Since this sign-off already happened during phase execution (dated 2026-09-01, same day) with an explicit "sem condições ou pendências" from the operator, this verification does not re-open those items as pending.

### Gaps Summary

No gaps found. All 5 roadmap success criteria, all 9 plans' must-haves, all requirement IDs (ACC-01..04), and all key wiring links were independently confirmed against the current codebase (not SUMMARY narration). `npm test` (876/876), `npx tsc --noEmit`, `npm run lint` (0 errors), and `npm run gates:fase-04` (6/6) were re-run live by this verifier and match the SUMMARY's claims exactly.

---

_Verified: 2026-09-01_
_Verifier: Claude (gsd-verifier)_
