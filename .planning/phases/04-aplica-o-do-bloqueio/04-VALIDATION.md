---
phase: 4
slug: aplica-o-do-bloqueio
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-01
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (jsdom default; `// @vitest-environment node` para lib/service/rota) + Playwright 1.62.1 |
| **Config file** | `vitest.config.mts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run <caminho-do-arquivo>` |
| **Full suite command** | `npm test` (Vitest) · `npm run test:e2e` (Playwright, porta 3100) |
| **Estimated runtime** | ~30s (unit) / ~2-5min (e2e) |

Setup relevante: `tests/setup/vitest.setup.ts` → `tests/setup/prisma-mock.ts` (mock profundo de `PrismaClient` + stub default de conta ativa). Helpers: `tests/helpers/request.ts`, `tests/helpers/auth.ts`. `vitest.config.mts` exclui `**/.claude/**` (worktrees de agente).

---

## Sampling Rate

- **After every task commit:** `npx vitest run <arquivos de teste tocados>` (< 30s)
- **After every plan wave:** `npm test && npm run lint && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite + `npm run test:e2e` verdes, `npm run gates:fase-04` verde, e o `checkpoint:human-verify` da contagem prévia de empresas afetadas (Pitfall 8 do RESEARCH.md, task 04-09-T3)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 04-01 | 1 | ACC-02, ACC-03 | T-04-15 | Predicado exaustivo: TRIAL/CARENCIA/VITALICIO não bloqueiam; 7º status vira erro de compilação | unit | `npx vitest run lib/avaliar-acesso.test.ts lib/empresa-publicavel.test.ts` | ✅ estende + ❌ novo (`lib/empresa-publicavel.test.ts`) | ⬜ pending |
| 04-01-T1 | 04-01 | 1 | ACC-01 | T-04-20 | `diasRestantesDeCarencia` correto nas viradas 23:30 / 00:30 BRT, sem `new Date()` interno | unit | `npx vitest run lib/avaliar-acesso.test.ts` | ✅ existe | ⬜ pending |
| 04-01-T2 | 04-01 | 1 | ACC-03 | T-04-01, T-04-02 | `findBySlug` de bloqueada devolve null sem disparar o fan-out; paridade de queries provada | unit | `npx vitest run app/services/empresa.service.test.ts` | ✅ existe | ⬜ pending |
| 04-01-T2 | 04-01 | 1 | ACC-02 | T-04-12 | `findBrandingBySlug` NÃO é gateado — o login de empresa bloqueada continua respondendo | unit | `npx vitest run app/services/empresa.service.test.ts` | ✅ existe | ⬜ pending |
| 04-02-T1 | 04-02 | 2 | ACC-03 | T-04-04, T-04-05 | Produto de empresa bloqueada ou soft-deletada → 404 com o corpo existente; 1 query | unit | `npx vitest run app/services/produto.service.test.ts "app/api/catalogo/produtos/[id]/route.test.ts"` | ✅ existe | ⬜ pending |
| 04-02-T2 | 04-02 | 2 | ACC-03 | T-04-04, T-04-05 | Idem para combos, byte-paralelo | unit | `npx vitest run app/services/combo.service.test.ts "app/api/catalogo/combos/[id]/route.test.ts"` | ✅ existe | ⬜ pending |
| 04-03-T1 | 04-03 | 2 | ACC-03 | T-04-01, T-04-02 | `?slug=` bloqueado → 400 idêntico; `?empresaId=` bloqueado → 200 `[]`; 1 resolução | unit | `npx vitest run app/api/catalogo/produtos/route.test.ts` | ✅ existe | ⬜ pending |
| 04-03-T2 | 04-03 | 2 | ACC-03 | T-04-01, T-04-02 | Idem para combos | unit | `npx vitest run app/api/catalogo/combos/route.test.ts` | ✅ existe | ⬜ pending |
| 04-03-T3 | 04-03 | 2 | ACC-03 | T-04-03 | Sexto caminho (`GET /api/empresas/slug/[slug]`) → 404 mesmo corpo; `resolveIdBySlug` removida | unit + grep | `npx vitest run "app/api/empresas/slug/[slug]/route.test.ts" app/services/empresa.service.test.ts` | ✅ existe | ⬜ pending |
| 04-04-T1 | 04-04 | 2 | ACC-03 | T-04-01, T-04-08 | `getEmpresaCatalogo` → `notFound()` para bloqueada; `getEmpresaBranding` não | unit | `npx vitest run "app/[slug]/_lib/empresa.test.ts"` | ❌ Wave 0 | ⬜ pending |
| 04-04-T2 | 04-04 | 2 | ACC-02 | T-04-12 | Login de empresa bloqueada renderiza branding genérico e não menciona pagamento | grep + lint | `npm run lint && npx tsc --noEmit && npx vitest run "app/[slug]/admin/_components/login-form.test.tsx"` | ✅ existe | ⬜ pending |
| 04-05-T1 | 04-05 | 2 | ACC-01, ACC-02 | T-04-09, T-04-17 | `iniciarPagamento` é Server Action, redirect fora do try, tenant só de `session.empresaId` | unit | `npx vitest run "app/[slug]/admin/_lib/assinatura-actions.test.ts"` | ❌ Wave 0 | ⬜ pending |
| 04-05-T2 | 04-05 | 2 | ACC-01 | — | `PagarButton` com `useFormStatus`, sem `onClick`/`fetch`, alvo de toque 44px | component | `npx vitest run "app/[slug]/admin/_components/pagar-button.test.tsx"` | ❌ Wave 0 | ⬜ pending |
| 04-05-T3 | 04-05 | 2 | ACC-02 | T-04-14, T-04-10 | Guarda simétrica de `/bloqueado`; rota fora de `(protected)`; BLOQUEADO e CANCELADO idênticos | unit + component | `npx vitest run "app/[slug]/admin/bloqueado/page.test.ts" "app/[slug]/admin/bloqueado/_components/bloqueado-card.test.tsx"` | ❌ Wave 0 | ⬜ pending |
| 04-06-T1 | 04-06 | 3 | ACC-02 | T-04-06, T-04-14 | `requireAdminSession` redireciona BLOQUEADO/CANCELADO; libera os outros 4 status | unit | `npx vitest run lib/session.test.ts` | ✅ existe | ⬜ pending |
| 04-06-T2 | 04-06 | 3 | ACC-02, ACC-04 | T-04-13, T-04-08 | `requireAuth` lança 402; opt-out único do checkout; mesmo token liberado no request seguinte | unit | `npx vitest run lib/api-auth.test.ts app/api/assinaturas/checkout/route.test.ts app/api/produtos/route.test.ts` | ✅ existe | ⬜ pending |
| 04-07-T1 | 04-07 | 3 | ACC-01 | T-04-20 | Banner com as 3 variantes de cópia, `role="status"`, sem relógio interno, sem dispensar | component | `npx vitest run "app/[slug]/admin/(protected)/_components/aviso-carencia.test.tsx"` | ❌ Wave 0 | ⬜ pending |
| 04-07-T2 | 04-07 | 3 | ACC-01 | T-04-06, T-04-19 | Banner nos DOIS branches do layout; nunca sob `app/[slug]/(catalogo)` | suite + grep | `npm test && npx tsc --noEmit && npm run lint` | ✅ existe | ⬜ pending |
| 04-08-T1 | 04-08 | 4 | ACC-01..04 | T-04-21 | Seed dos 4 fatos de billing recusa `NODE_ENV=production`; sem endpoint de teste | script | `npm run seed:billing -- --slug __inexistente__ --status bloqueado` (código 1 esperado) | ❌ Wave 0 | ⬜ pending |
| 04-08-T2 | 04-08 | 4 | ACC-01..04 | T-04-01, T-04-12, T-04-13, T-04-14 | Ciclo completo contra Postgres real: saudável → bloqueada (UI + API + 6 caminhos) → paga → liberada | e2e | `npx playwright test e2e/bloqueio-por-inadimplencia.spec.ts` | ❌ Wave 0 | ⬜ pending |
| 04-09-T1 | 04-09 | 5 | ACC-02, ACC-03, ACC-04 | T-04-03, T-04-08, T-04-13, T-04-19, T-04-SC | Os 6 gates da fase como script executável, com higiene de comentários e prova de não-vacuidade | grep gate | `npm run gates:fase-04` | ❌ Wave 0 | ⬜ pending |
| 04-09-T2 | 04-09 | 5 | ACC-02 | T-04-22 | Contagem read-only por `avaliarAcesso`, nunca por SQL reimplementado | script | `npm run acesso:contagem` | ❌ Wave 0 | ⬜ pending |
| 04-09-T3 | 04-09 | 5 | ACC-02 | T-04-11 | Impacto real do merge conhecido em número e classificado antes de a fase fechar | human (blocking) | `npm run gates:fase-04 && npm test && npm run test:e2e` + contagem manual | — | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `lib/empresa-publicavel.test.ts` — cobre ACC-03 (funil publicável, criado em 04-01)
- [ ] `app/[slug]/_lib/empresa.test.ts` — cobre ACC-03 (`getEmpresaCatalogo` → `notFound`, criado em 04-04)
- [ ] `app/[slug]/admin/_lib/assinatura-actions.test.ts` — cobre ACC-01/ACC-02 (Server Action de pagamento, criado em 04-05)
- [ ] `app/[slug]/admin/_components/pagar-button.test.tsx` — cobre ACC-01 (CTA compartilhado, criado em 04-05)
- [ ] `app/[slug]/admin/bloqueado/page.test.ts` — cobre ACC-02 (guarda simétrica, anti-loop; criado em 04-05)
- [ ] `app/[slug]/admin/bloqueado/_components/bloqueado-card.test.tsx` — cobre ACC-02 (logout + CTA; criado em 04-05)
- [ ] `app/[slug]/admin/(protected)/_components/aviso-carencia.test.tsx` — cobre ACC-01 (criado em 04-07)
- [ ] `e2e/bloqueio-por-inadimplencia.spec.ts` — cobre critérios de sucesso #2, #3, #4 e #5 do roadmap (criado em 04-08)
- [ ] `scripts/seed-fatos-billing.ts` — habilitador do e2e acima (só forma testável de escrever `acessoAte`/`trialFim`/`canceladoEm` fora do allowlist anti-mass-assignment do BILL-04; criado em 04-08)
- [ ] `scripts/gates-fase-04.mjs` — os 6 gates (unicidade de `permitirEmpresaBloqueada`, ausência de `unstable_cache`/`'use cache'` nos arquivos de guarda, ausência de `loading.tsx` sob o catálogo, banner ausente no catálogo, enumeração dos entrypoints públicos, contagem de dependências congelada) como script verificável, não instrução em prosa (criado em 04-09)
- [ ] `scripts/contagem-status-acesso.ts` — habilitador do checkpoint humano (criado em 04-09)
- [ ] Instalação de framework: nenhuma — Vitest e Playwright já configurados

**Nota de sequenciamento:** os arquivos de teste desta fase são criados na MESMA task que a
implementação correspondente (todas as tasks de código carregam `tdd="true"` e um bloco
`<behavior>`), então não existe uma "wave 0" separada — a lista acima é o inventário do que ainda
não existe no repositório no momento do planejamento, com o plano responsável por cada item.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Contagem de empresas que seriam bloqueadas/canceladas no primeiro request após o deploy | ACC-02 (segurança operacional) | Depende do estado real do banco de produção/staging no momento do merge — não é determinístico e não deve ser mockado | Rodar `npm run acesso:contagem` (read-only, `avaliarAcesso` sobre todas as empresas via `scripts/resolvedor-ts.mjs`) contra o banco alvo, revisar a distribuição por status antes de aprovar o merge. Task 04-09-T3. Ver `04-RESEARCH.md` §Pitfall 8 / Achado crítico 5 |
| Partial rendering: banner permanece "stale" após navegação client-side, mas o boundary de segurança (`requireAdminSession`) continua correto em cada page | ACC-01 | Comportamento de runtime do App Router (Next 16), não determinável por leitura estática | UAT: navegar entre 2 páginas do admin via `<Link>` após pagamento simulado; confirmar que o admin permanece acessível mesmo que o banner não suma imediatamente. Task 04-09-T3, etapa 6. Ver `04-RESEARCH.md` Assumption A3 |
| `redirect()` para URL externa funciona a partir de Server Action (não só de Server Component) | ACC-01/D-01 | Comportamento de runtime não 100% coberto pelos exemplos da doc empacotada | Clicar em `Pagar agora` e confirmar a navegação para o checkout hospedado do Asaas. Se falhar, o fallback é devolver a URL da action e navegar no cliente. Task 04-09-T3, etapa 6. Ver `04-RESEARCH.md` Assumption A4 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
