---
phase: 2
slug: modelo-de-dados-e-motor-de-acesso
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-31
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit/component) + Playwright 1.62.1 (E2E) |
| **Config file** | `vitest.config.mts` (jsdom default, `tests/setup/vitest.setup.ts`) / `playwright.config.ts` |
| **Quick run command** | `npx vitest run lib/fuso-sao-paulo.test.ts lib/avaliar-acesso.test.ts app/services/acesso.service.test.ts app/services/empresa.service.test.ts` |
| **Full suite command** | `npm run lint && npx tsc --noEmit && npm run test && npm run test:e2e` |
| **Estimated runtime** | ~10s (quick) / ~2min (full, incl. e2e) |

Convenção obrigatória: arquivos de teste que exercitam código server-side começam com `// @vitest-environment node` (default do projeto é `jsdom`) — ver `lib/auth-guard.test.ts:1`, `app/services/empresa.service.test.ts:1`.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run lib/fuso-sao-paulo.test.ts lib/avaliar-acesso.test.ts app/services/acesso.service.test.ts app/services/empresa.service.test.ts` (< 10s)
- **After every plan wave:** Run `npm run lint && npx tsc --noEmit && npm run test`
- **Before `/gsd-verify-work`:** `npm run test && npm run test:e2e` verdes + migration aplicada com sucesso contra um banco real
- **Max feedback latency:** ~10s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | TBD | TBD | BILL-01 | V4 | Migration aplica limpa, schema tem os 4 fatos + auditoria | integration | `npx prisma migrate deploy && npx prisma validate` | ❌ W0 | ⬜ pending |
| 02-01-02 | TBD | TBD | BILL-01 | T-mass-assignment | `empresaService.update` ignora `acessoVitalicio`/`acessoAte`/`trialFim`/`canceladoEm` no payload | unit | `npx vitest run app/services/empresa.service.test.ts -t "não aceita campos de billing"` | ❌ W0 | ⬜ pending |
| 02-01-03 | TBD | TBD | BILL-01 | T-mass-assignment | `PATCH /api/empresas/[id]` com `{acessoVitalicio:true}` não chega ao Prisma | unit | `npx vitest run "app/api/empresas/[id]/route.test.ts"` | ✅ arquivo existe, caso novo | ⬜ pending |
| 02-02-01 | TBD | TBD | BILL-02 | — | `meiaNoiteEmSaoPaulo` acerta dia normal, virada de ano, bissexto e as 2 transições de DST históricas | unit | `npx vitest run lib/fuso-sao-paulo.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | TBD | TBD | BILL-02 | — | `avaliarAcesso` devolve os 6 status, cobrindo `agora === trialFim`, `agora === acessoAte`, `agora === carenciaAte` (D-02 inclusivo) | unit | `npx vitest run lib/avaliar-acesso.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | TBD | TBD | BILL-02 | — | `acessoVitalicio` vence `canceladoEm`+`acessoAte` vencido+`trialFim` vencido (D-03) | unit | `npx vitest run lib/avaliar-acesso.test.ts -t "vitalicio"` | ❌ W0 | ⬜ pending |
| 02-02-04 | TBD | TBD | BILL-02 | — | Empresa em trial com `acessoAte` futuro continua `TRIAL` (D-05) | unit | `npx vitest run lib/avaliar-acesso.test.ts -t "trial"` | ❌ W0 | ⬜ pending |
| 02-02-05 | TBD | TBD | BILL-02 | — | Carência conta do `max(trialFim, acessoAte)`, fatos todos nulos → `BLOQUEADO` | unit | `npx vitest run lib/avaliar-acesso.test.ts -t "carencia"` | ❌ W0 | ⬜ pending |
| 02-03-01 | TBD | TBD | BILL-03 | — | `registerComUsuario` grava `trialFim` (+15, D-18) na mesma transação e cria auditoria `REGISTRO` | unit | `npx vitest run app/services/empresa.service.test.ts -t "trial"` | ✅ arquivo existe, casos novos | ⬜ pending |
| 02-03-02 | TBD | TBD | BILL-03 | — | Empresa nova criada em `/registro` acessa o admin normalmente | e2e | `npx playwright test e2e/cadastro-e-login.spec.ts` | ✅ arquivo existe, asserção nova | ⬜ pending |
| 02-04-01 | TBD | TBD | BILL-04 | V4 | `acessoVitalicio=true` escrito direto no banco resulta em `VITALICIO` sem nenhuma outra mudança | unit | `npx vitest run lib/avaliar-acesso.test.ts -t "vitalicio"` | ❌ W0 | ⬜ pending |
| 02-05-01 | TBD | TBD | BILL-05 | T-race-audit | `registrarTransicao` não grava quando `anterior === novo` (D-16) | unit | `npx vitest run app/services/acesso.service.test.ts` | ❌ W0 | ⬜ pending |
| 02-05-02 | TBD | TBD | BILL-05 | T-race-audit | `registrarTransicao` vira no-op quando o CAS devolve `count === 0` (concorrência) | unit | `npx vitest run app/services/acesso.service.test.ts -t "concorr"` | ❌ W0 | ⬜ pending |
| 02-05-03 | TBD | TBD | BILL-05 | — | Linha de auditoria carrega anterior, novo, causa e horário (D-17: e nada mais) | unit | `npx vitest run app/services/acesso.service.test.ts` | ❌ W0 | ⬜ pending |
| 02-05-04 | TBD | TBD | Critério #5 | — | Fatos produzidos pelo backfill (`trialFim` futuro, demais nulos) → `TRIAL` para toda empresa | unit | `npx vitest run lib/avaliar-acesso.test.ts -t "backfill"` | ❌ W0 | ⬜ pending |
| 02-00-01 | TBD | TBD | Regressão | — | Os 463 testes unitários da Fase 1 continuam verdes após estender o `select` de `revalidarConta` | unit | `npm run test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders — the planner assigns real `{padded_phase}-{plan}-{task}` IDs; this map is re-synced during Wave 0 / plan review.*

---

## Wave 0 Requirements

- [ ] `lib/fuso-sao-paulo.test.ts` — cobre BILL-02 (semântica de D-01/D-02/D-18)
- [ ] `lib/avaliar-acesso.test.ts` — cobre BILL-02, BILL-04, critério #5
- [ ] `app/services/acesso.service.test.ts` — cobre BILL-05
- [ ] `prisma/migrations/<timestamp>_add_billing_a_empresa/migration.sql` — cobre BILL-01 + D-11/D-12 (backfill)
- [ ] Estender `tests/setup/prisma-mock.ts`: o stub default de `usuario.findFirst` precisa ganhar `empresa: { slug, acessoAte, trialFim, canceladoEm, acessoVitalicio, ultimoStatusAuditado }`, senão `avaliarAcesso` recebe `undefined` e todos os testes de rota autenticada quebram de uma vez
- [ ] Mock de `after()` para os testes que exercitam o caminho de auditoria (ou confiar no fallback inline de `agendarPosResposta` — decidir e documentar no plano)

*Framework install: nenhum — Vitest e Playwright já instalados e configurados.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SQL do backfill executa corretamente contra Postgres real, sem erro de fuso | BILL-01, Critério #5 | O SQL de backfill (`AT TIME ZONE` duplo) foi validado contra a doc oficial do PostgreSQL 16 nesta pesquisa, mas **não pôde ser executado** — sem credencial de banco na sessão de pesquisa | Rodar `npx prisma migrate dev` contra um banco de dev real com dados de teste, conferir que `trialFim`/`acessoAte` gravados batem com o instante UTC esperado da meia-noite de São Paulo (comparar com `date -d ... -u` ou similar) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s (quick) / ~2min (full)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
