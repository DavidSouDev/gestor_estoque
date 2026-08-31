---
phase: 3
slug: gateway-asaas-e-ingest-o-de-webhooks
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-31
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (`environment: "jsdom"` default, `// @vitest-environment node` per server-side test file) |
| **Config file** | `vitest.config.mts` |
| **Setup** | `tests/setup/vitest.setup.ts`; deep Prisma mock in `tests/setup/prisma-mock.ts` |
| **Quick run command** | `npx vitest run app/services/webhook-asaas.service.test.ts app/services/assinatura.service.test.ts lib/billing` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15s (quick) / ~15s (full — no e2e needed, sandbox verification is manual) |

---

## Sampling Rate

- **After every task commit:** Run the quick command above
- **After every plan wave:** `npm run test`
- **Before `/gsd-verify-work`:** `npm run test` + `npm run lint` green; manual sandbox verification as end-of-phase `checkpoint:human-verify` (`human_verify_mode: end-of-phase`)
- **Max feedback latency:** ~15s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | TBD | TBD | GTW-01 | `criarCheckout` monta body com `chargeTypes:["RECURRENT"]`, `billingTypes:["CREDIT_CARD"]`, `value: 29.90` | unit | `npx vitest run app/services/assinatura.service.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | TBD | TBD | GTW-01 | Erro do Asaas (rede/4xx/5xx) → `HttpError`, zero escrita no Prisma | unit | idem | ❌ W0 | ⬜ pending |
| 03-01-03 | TBD | TBD | GTW-01 | Nenhum campo `creditCard*`/`cpfCnpj` aparece em qualquer `prisma.*.create` | unit | `npx vitest run app/services/webhook-asaas.service.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | TBD | TBD | GTW-02 | Header `asaas-access-token` ausente/errado → 401, nenhum insert | unit | `npx vitest run app/api/webhooks/asaas/route.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | TBD | TBD | GTW-02 | Header correto → exatamente 200 (não 201/204) | unit | idem | ❌ W0 | ⬜ pending |
| 03-02-03 | TBD | TBD | GTW-02 | `create` do ledger acontece antes do 200; `processar` agendado via `agendarPosResposta`, não `await`ado | unit | idem | ❌ W0 | ⬜ pending |
| 03-02-04 | TBD | TBD | GTW-02 | Evento desconhecido/payload malformado → 200, nunca 500 | unit | idem | ❌ W0 | ⬜ pending |
| 03-04-01 | TBD | TBD | GTW-04 | Mesmo `eventoId` 2x → P2002 → 200 nas duas, uma só execução de `processar` | unit | idem | ❌ W0 | ⬜ pending |
| 03-04-02 | TBD | TBD | GTW-04 | Evento antigo fora de ordem → `count === 0` → nenhuma auditoria/escrita | unit | idem | ❌ W0 | ⬜ pending |
| 03-04-03 | TBD | TBD | GTW-04 | `PAYMENT_OVERDUE` → nenhuma escrita em fatos de billing; `avaliarAcesso` já devolve `CARENCIA` | unit | idem | ❌ W0 | ⬜ pending |
| 03-03-01 | TBD | TBD | GTW-03 | `PAYMENT_CONFIRMED` → `updateMany` com `OR:[{acessoAte:null},{acessoAte:{lt:novo}}]`, `acessoAte` de `dueDate` | unit | `npx vitest run app/services/webhook-asaas.service.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-02 | TBD | TBD | GTW-03 | Após estender, `avaliarAcesso` devolve `EM_DIA` e `carenciaAte: null` | unit | `npx vitest run lib/avaliar-acesso.test.ts` (existente + caso novo) | ⚠️ parcial | ⬜ pending |
| 03-03-03 | TBD | TBD | GTW-03 | `registrarTransicao` chamado com `causa: WEBHOOK_PAGAMENTO`, `anterior: ultimoStatusAuditado` | unit | idem | ❌ W0 | ⬜ pending |
| 03-03-04 | TBD | TBD | GTW-03 | `acessoAteAposPagamento("2021-01-31")` → 28/02 (clamp); `("2021-01-01")` → instante UTC correto de SP | unit | `npx vitest run lib/billing/asaas/datas.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-04 | TBD | TBD | GTW-01/02 | Config lança no import quando `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` faltam | unit | `npx vitest run lib/billing/asaas/config.test.ts` | ❌ W0 | ⬜ pending |
| 03-H1 | TBD | TBD | GTW-01..04 | Fluxo real em sandbox: criar checkout → pagar com cartão de teste → `CHECKOUT_PAID` + `PAYMENT_CONFIRMED` → `acessoAte` estendido | manual | — (requer conta Asaas, D-05) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are placeholders — the planner assigns real `{padded_phase}-{plan}-{task}` IDs; this map is re-synced during Wave 0 / plan review.*

---

## Wave 0 Requirements

- [ ] `lib/billing/asaas/config.test.ts` — cobre GTW-01/GTW-02 (fail-fast de env vars)
- [ ] `lib/billing/asaas/datas.test.ts` — cobre GTW-03 (clamp de mês, parsing de data SP)
- [ ] `app/services/assinatura.service.test.ts` — cobre GTW-01
- [ ] `app/services/webhook-asaas.service.test.ts` — cobre GTW-02/03/04
- [ ] `app/api/webhooks/asaas/route.test.ts` — **primeiro teste de route handler do projeto**; conferir se `tests/helpers/` já tem `buildRequest()` reusável; criar se não
- [ ] Helper de fixtures de payload Asaas (`tests/helpers/asaas.ts`) — envelopes de `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `CHECKOUT_PAID`, `SUBSCRIPTION_CREATED`
- [ ] Framework install: nenhum — Vitest já configurado

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fluxo real de checkout + webhook contra Asaas sandbox | GTW-01..04 | Nenhuma conta Asaas existe nesta sessão (D-05 do CONTEXT.md); é a única prova end-to-end contra o gateway real | Criar checkout de teste, pagar com cartão de teste do Asaas sandbox, confirmar que `CHECKOUT_PAID`/`PAYMENT_CONFIRMED` chegam no endpoint e `acessoAte` é estendido corretamente |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
