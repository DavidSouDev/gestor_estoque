---
phase: 2
slug: modelo-de-dados-e-motor-de-acesso
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-31
resynced: 2026-08-31 (planner — real task IDs assigned across 6 plans / 3 waves)
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
| 02-01-01 | 02-01 | 1 | BILL-01, BILL-05 | T-02-03 | Schema declara 4 fatos + `ultimoStatusAuditado` + `AuditoriaAcesso` + 2 enums | integration | `npx prisma validate` | ❌ W0 | ⬜ pending |
| 02-01-02 | 02-01 | 1 | BILL-01 | T-02-01 | `migration.sql` traz DDL aditivo + backfill com duplo `AT TIME ZONE` | source | `grep -c "AT TIME ZONE 'America/Sao_Paulo'" prisma/migrations/*_add_billing_a_empresa/migration.sql` → 2 | ❌ W0 | ⬜ pending |
| 02-01-03 | 02-01 | 1 | BILL-01, BILL-05 | T-02-01, T-02-05 | Migration aplicada contra Postgres real; `trialFim` na meia-noite de São Paulo, 1 linha `BACKFILL` por empresa ativa, nenhuma em carência | integration | `npx prisma migrate status && npx prisma db execute --file prisma/checks/backfill-billing.sql` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02-02 | 1 | BILL-04, BILL-01 | T-02-06, T-02-07 | `empresaService.update` monta `data` a partir de allowlist de 10 campos | unit | `npx vitest run app/services/empresa.service.test.ts` | ✅ arquivo existe | ⬜ pending |
| 02-02-02 | 02-02 | 1 | BILL-04 | T-02-06, T-02-08 | Payload com `acessoVitalicio`/`acessoAte`/`trialFim`/`canceladoEm` não chega ao Prisma; PATCH da própria empresa documentado | unit | `npx vitest run app/services/empresa.service.test.ts -t "não aceita campos de billing"` | ✅ arquivo existe, casos novos | ⬜ pending |
| 02-03-01 | 02-03 | 2 | BILL-02 | T-02-12 | `meiaNoiteEmSaoPaulo` acerta dia normal, virada de ano, bissexto e as 2 transições de DST históricas | unit | `npx vitest run lib/fuso-sao-paulo.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-02 | 02-03 | 2 | BILL-02, BILL-04 | T-02-10, T-02-11, T-02-13 | `avaliarAcesso` devolve os 6 status, cobre `agora === trialFim/acessoAte/carenciaAte` (D-02), precedência D-03, `max(trialFim, acessoAte)` e fatos nulos → BLOQUEADO; fatos do backfill → TRIAL | unit | `npx vitest run lib/avaliar-acesso.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-01 | 02-04 | 2 | BILL-05 | T-02-16, T-02-20 | `agendarPosResposta` não lança fora de escopo de request (executa inline) e loga falha com prefixo `[acesso]` | unit | `npx vitest run lib/agendar-pos-resposta.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-02 | 02-04 | 2 | BILL-05 | T-02-15, T-02-18, T-02-19 | `registrarTransicao` é no-op quando `anterior === novo` (D-16) e quando o CAS devolve `count === 0`; a linha carrega exatamente 4 campos (D-17) | unit | `npx vitest run app/services/acesso.service.test.ts` | ❌ W0 | ⬜ pending |
| 02-05-01 | 02-05 | 3 | BILL-03, BILL-05 | T-02-21, T-02-22, T-02-24 | `registerComUsuario` grava `trialFim` (+15, D-18) e a auditoria `REGISTRO` na mesma transação; cadastro às 23:59 SP ainda recebe 14 dias | unit | `npx vitest run app/services/empresa.service.test.ts -t "trial"` | ✅ arquivo existe, casos novos | ⬜ pending |
| 02-05-02 | 02-05 | 3 | BILL-03 | — | Empresa nova criada em `/registro` navega no admin, sem mensagem de bloqueio/pagamento | e2e | `npx playwright test e2e/cadastro-e-login.spec.ts` | ✅ arquivo existe, asserções novas | ⬜ pending |
| 02-06-01 | 02-06 | 3 | Regressão | T-02-31 | Stub default de `usuario.findFirst` carrega fatos de billing neutros; os 463 testes da Fase 1 seguem verdes | unit | `npm run test` | ✅ arquivo existe | ⬜ pending |
| 02-06-02 | 02-06 | 3 | BILL-02, BILL-04 | T-02-26, T-02-28 | `revalidarConta` avalia acesso por projeção explícita (sem `include`), expõe `statusAcesso`/`acessoExpiraEm`/`carenciaAte` e não bloqueia ninguém | unit | `npx tsc --noEmit && npm run lint && npm run test` | ✅ arquivo existe | ⬜ pending |
| 02-06-03 | 02-06 | 3 | BILL-05, BILL-01 | T-02-27, T-02-29 | Auditoria `AVALIACAO_SESSAO` só na transição real; falha de auditoria não derruba o request; `ultimoStatusAuditado` não vaza para caminho de decisão | unit + gate | `npx vitest run lib/auth-guard.test.ts` + gate de grep de `ultimoStatusAuditado` | ✅ arquivo existe, casos novos | ⬜ pending |
| 02-06-H1 | 02-06 | 3 | BILL-05 | T-02-15, T-02-28 | `after()` dentro de `React.cache()` grava UMA linha `AVALIACAO_SESSAO` contra Postgres real e permanece única após reloads (assumption A6) | human-check (UAT fim de fase) | — (ver `<human-check>` de 02-06 Task 3) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders — the planner assigns real `{padded_phase}-{plan}-{task}` IDs; this map is re-synced during Wave 0 / plan review.*

---

## Wave 0 Requirements

- [ ] `lib/fuso-sao-paulo.test.ts` — cobre BILL-02 (semântica de D-01/D-02/D-18)
- [ ] `lib/avaliar-acesso.test.ts` — cobre BILL-02, BILL-04, critério #5
- [ ] `app/services/acesso.service.test.ts` — cobre BILL-05
- [ ] `prisma/migrations/<timestamp>_add_billing_a_empresa/migration.sql` — cobre BILL-01 + D-11/D-12 (backfill)
- [ ] Estender `tests/setup/prisma-mock.ts`: o stub default de `usuario.findFirst` precisa ganhar `empresa: { slug, acessoAte, trialFim, canceladoEm, acessoVitalicio, ultimoStatusAuditado }`, senão `avaliarAcesso` recebe `undefined` e todos os testes de rota autenticada quebram de uma vez
- [ ] `lib/agendar-pos-resposta.test.ts` — cobre o fallback fora de escopo de request (plano 02-04)
- [x] **Decidido no planejamento:** os testes do caminho de auditoria confiam no **fallback inline** de `agendarPosResposta` (nenhum mock global de `after()`), o que torna a chamada a `registrarTransicao` observável no Vitest. Documentado em `02-04-PLAN.md` Task 1 e `02-06-PLAN.md` Task 3.

*Framework install: nenhum — Vitest e Playwright já instalados e configurados.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ~~SQL do backfill contra Postgres real~~ | ~~BILL-01, Critério #5~~ | **Promovido a automatizado durante o planejamento.** O banco de dev está acessível (PostgreSQL 16.15, 311 empresas / 310 ativas) e a matemática de fuso, a independência do parâmetro `TimeZone` da sessão e `gen_random_uuid()` foram executadas e confirmadas. O gate virou `npx prisma db execute --file prisma/checks/backfill-billing.sql`, que sai com código 1 via `RAISE EXCEPTION` — ver task 02-01-03 | — (automatizado) |
| `after()` chamado de dentro de uma função `React.cache()`ada grava a auditoria da transição | BILL-05 | Assumption A6 de `02-RESEARCH.md`: a doc do Next afirma o sentido inverso (usar `cache` dentro de `after`), e o comportamento real de `after()` dentro de um render do Next não é reproduzível em Vitest. O Playwright também não serve: por convenção do repositório o processo do Playwright não carrega `.env` nem conhece credenciais de banco (`e2e/sessao-revogada.spec.ts:4-13`) | Ver o bloco `<human-check>` de `02-06-PLAN.md` Task 3 — 7 passos, colhidos em UAT ao fim da fase |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s (quick) / ~2min (full)
- [x] `nyquist_compliant: true` set in frontmatter — toda task dos 6 planos tem `<automated>`

**Approval:** pending
