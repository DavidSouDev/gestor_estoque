---
phase: 5
slug: worker-di-rio-de-reconcilia-o
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-01
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit/component) + Playwright 1.62.1 (e2e) |
| **Config file** | `vitest.config.mts` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run app/api/cron app/services/reconciliacao.service.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30s (unit) |

Setup relevante: `tests/setup/vitest.setup.ts` → `tests/setup/prisma-mock.ts` (mock profundo de `PrismaClient`). Mockar `app/services/acesso.service` (não o Prisma bruto) para as asserções de "quem foi transicionado" — deixa a asserção legível e evita depender do shape interno do `$transaction`. `@vitest-environment node` obrigatório no handler (default do projeto é jsdom; precedente: webhook do Asaas).

---

## Sampling Rate

- **After every task commit:** `npx vitest run <arquivos de teste tocados>` (< 30s)
- **After every plan wave:** `npm test && npm run lint && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite verde + e2e (se desbloqueado) + gate SQL do schema (novo valor de enum)

---

## Per-Task Verification Map

*Preenchido pelo planner ao criar os planos de execução (task IDs ainda não existem nesta etapa). Ver `05-RESEARCH.md` §Validation Architecture → Phase Requirements → Test Map para o mapeamento completo requisito→teste.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | WRK-01, WRK-02 | T-05-* (ver planos) | Ver `05-RESEARCH.md` §Validation Architecture | unit/e2e/grep | Ver `05-RESEARCH.md` §Test Map | Ver `05-RESEARCH.md` | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `app/api/cron/reconciliacao-diaria/route.test.ts` — cobre WRK-02 (auth) e WRK-01 (aplicação de transições, isolamento por empresa)
- [ ] `app/services/reconciliacao.service.test.ts` — cobre o freio de segurança composto (20% + piso de 5) como função pura testável sem Postgres
- [ ] `e2e/worker-reconciliacao.spec.ts` (ou nome equivalente) — end-to-end contra Postgres real, empresa semeada com transição **pendente** (não com `ultimoStatusAuditado` já alinhado — `scripts/seed-fatos-billing.ts` da Fase 4 não serve para isso como está, precisa de ajuste ou de um seed novo)
- [ ] Instalação de framework: nenhuma — Vitest e Playwright já configurados

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Comportamento real atrás de um agendador externo (Vercel Cron ou crontab) | WRK-02 (critério de sucesso #3) | Depende de infraestrutura de deploy que não existe ainda neste projeto | Quando o hosting for decidido (fora desta fase, D-07), configurar o agendador real e confirmar uma execução disparada por ele, não só por `curl` manual |
| Volume real de empresas nunca testado contra o freio composto | D-01 | Threshold escolhido (20% + piso 5) é uma estimativa; comportamento real só se confirma com dados de produção crescendo | Revisitar o piso absoluto quando a base de empresas crescer significativamente |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
