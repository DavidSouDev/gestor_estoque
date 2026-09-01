---
phase: 4
slug: aplica-o-do-bloqueio
status: draft
nyquist_compliant: false
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
- **Before `/gsd-verify-work`:** Full suite + `npm run test:e2e` verdes, os 4 gates de grep, e o `checkpoint:human-verify` da contagem prévia de empresas afetadas (Pitfall 8 do RESEARCH.md)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Preenchido pelo planner ao criar os planos de execução (task IDs ainda não existem nesta etapa). Ver `04-RESEARCH.md` §Validation Architecture → Phase Requirements → Test Map para o mapeamento completo requisito→teste que o planner deve seguir.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | ACC-01..04 | T-04-* (ver planos) | Ver `04-RESEARCH.md` §Validation Architecture | unit/component/e2e/grep | Ver `04-RESEARCH.md` §Test Map | Ver `04-RESEARCH.md` | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `app/[slug]/admin/(protected)/_components/aviso-carencia.test.tsx` — cobre ACC-01
- [ ] `app/[slug]/admin/bloqueado/page.test.ts` — cobre ACC-02 (guarda simétrica, anti-loop)
- [ ] `app/[slug]/admin/bloqueado/_components/*.test.tsx` — cobre ACC-02 (logout + CTA)
- [ ] `app/[slug]/_lib/empresa.test.ts` — cobre ACC-03 (`getEmpresaCatalogo` → `notFound`)
- [ ] `e2e/bloqueio-por-inadimplencia.spec.ts` — cobre critérios de sucesso #2 e #4 do roadmap
- [ ] Script de seed de fatos de billing sob `scripts/` — habilitador do e2e acima (só forma testável de escrever `acessoAte`/`trialFim`/`canceladoEm` fora do allowlist anti-mass-assignment do BILL-04)
- [ ] Os 4 gates de grep (unicidade de `permitirEmpresaBloqueada`, ausência de `unstable_cache`/`'use cache'` nos arquivos de guarda, ausência de `loading.tsx` sob o catálogo, banner ausente no catálogo) como script verificável, não instrução em prosa
- [ ] Instalação de framework: nenhuma — Vitest e Playwright já configurados

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Contagem de empresas que seriam bloqueadas/canceladas no primeiro request após o deploy | ACC-02 (segurança operacional) | Depende do estado real do banco de produção/staging no momento do merge — não é determinístico e não deve ser mockado | Rodar script read-only (`avaliarAcesso` sobre todas as empresas via `scripts/resolvedor-ts.mjs`) contra o banco alvo, revisar a distribuição por status antes de aprovar o merge. Ver `04-RESEARCH.md` §Pitfall 8 / Achado crítico 5 |
| Partial rendering: banner permanece "stale" após navegação client-side, mas o boundary de segurança (`requireAdminSession`) continua correto em cada page | ACC-01 | Comportamento de runtime do App Router (Next 16), não determinável por leitura estática | UAT: navegar entre 2 páginas do admin via `<Link>` após pagamento simulado; confirmar que o admin permanece acessível mesmo que o banner não suma imediatamente. Ver `04-RESEARCH.md` Assumption A3 |
| `redirect()` para URL externa funciona a partir de Server Action (não só de Server Component) | ACC-01/D-01 | Comportamento de runtime não 100% coberto pelos exemplos da doc empacotada | Spike de 5 min ou verificação no primeiro teste manual do botão "Pagar agora" — ver `04-RESEARCH.md` Assumption A4 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
