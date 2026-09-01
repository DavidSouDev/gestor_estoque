---
phase: 3
slug: gateway-asaas-e-ingest-o-de-webhooks
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-31
updated: 2026-09-01
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
| 03-04-01 | 03-04 | 2 | GTW-01 | `criarCheckout` monta body com `chargeTypes:["RECURRENT"]`, `billingTypes:["CREDIT_CARD"]`, `value: 29.90` | unit | `npx vitest run app/services/assinatura.service.test.ts` | ✅ | ✅ green |
| 03-04-01b | 03-04 | 2 | GTW-01 | Erro do Asaas (rede/4xx/5xx) → `HttpError`, zero escrita no Prisma | unit | idem | ✅ | ✅ green |
| 03-05-01 | 03-05 | 2 | GTW-01 | Nenhum campo `creditCard*`/`cpfCnpj` aparece em qualquer `prisma.*.create` | unit | `npx vitest run app/services/webhook-asaas.service.test.ts` | ✅ | ✅ green |
| 03-05-02 | 03-05 | 2 | GTW-02 | Header `asaas-access-token` ausente/errado → 401, nenhum insert | unit | `npx vitest run app/api/webhooks/asaas/route.test.ts` | ✅ | ✅ green |
| 03-05-02b | 03-05 | 2 | GTW-02 | Header correto → exatamente 200 (não 201/204) | unit | idem | ✅ | ✅ green |
| 03-05-02c | 03-05 | 2 | GTW-02 | `create` do ledger acontece antes do 200; `processar` agendado via `agendarPosResposta`, não `await`ado | unit | idem | ✅ | ✅ green |
| 03-05-02d | 03-05 | 2 | GTW-02 | Evento desconhecido/payload malformado → 200, nunca 500 | unit | idem | ✅ | ✅ green |
| 03-05-02e | 03-05 | 2 | GTW-04 | Mesmo `eventoId` 2x → P2002 → 200 nas duas, uma só execução de `processar` | unit | idem | ✅ | ✅ green |
| 03-06-03 | 03-06 | 3 | GTW-04 | Evento antigo fora de ordem → `count === 0` → nenhuma auditoria/escrita | unit | `npx vitest run app/services/webhook-asaas.service.test.ts` | ✅ | ✅ green |
| 03-06-03b | 03-06 | 3 | GTW-04 | `PAYMENT_OVERDUE` → nenhuma escrita em fatos de billing; `avaliarAcesso` já devolve `CARENCIA` | unit | idem | ✅ | ✅ green |
| 03-06-02 | 03-06 | 3 | GTW-03 | `PAYMENT_CONFIRMED` → `updateMany` com `OR:[{acessoAte:null},{acessoAte:{lt:novo}}]`, `acessoAte` de `dueDate` | unit | idem | ✅ | ✅ green |
| 03-06-02b | 03-06 | 3 | GTW-03 | Após estender, `avaliarAcesso` (real) devolve `EM_DIA` e `carenciaAte: null` | unit | idem | ✅ | ✅ green |
| 03-06-02c | 03-06 | 3 | GTW-03 | `registrarTransicao` chamado com `causa: WEBHOOK_PAGAMENTO`, `anterior: ultimoStatusAuditado` | unit | idem | ✅ | ✅ green |
| 03-06-02d | 03-06 | 3 | GTW-03 | Re-fetch autoritativo acontece ANTES de qualquer escrita; rejeição do gateway → zero `updateMany` | unit | idem | ✅ | ✅ green |
| 03-06-01 | 03-06 | 3 | GTW-03/04 | C-08: `resolverEmpresaId({ externalReference })` devolve `null`; nenhuma consulta usa a referência externa como filtro | unit | idem | ✅ | ✅ green |
| 03-06-03c | 03-06 | 3 | GTW-02/04 | Os 12 eventos assinados + 1 desconhecido: `processar` nunca rejeita e sempre termina com `processadoEm` ou `erro` | unit | idem | ✅ | ✅ green |
| 03-02-02 | 03-02 | 1 | GTW-03 | `acessoAteAposPagamento("2021-01-31")` → 28/02 (clamp); `("2021-01-01")` → instante UTC correto de SP | unit | `npx vitest run lib/billing/asaas/datas.test.ts` | ✅ | ✅ green |
| 03-02-01 | 03-02 | 1 | GTW-01/02 | Config falha rápido quando `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` faltam | unit | `npx vitest run lib/billing/asaas/config.test.ts` | ✅ | ✅ green |
| 03-03-03 | 03-03 | 1 | GTW-01 | `redigirEnvelope` é allowlist positiva: campo sensível novo nunca é copiado | unit | `npx vitest run lib/billing/asaas/eventos.test.ts` | ✅ | ✅ green |
| 03-H1 | 03-07 | 4 | GTW-01..04 | Fluxo real em sandbox: criar checkout → pagar com cartão de teste → `CHECKOUT_PAID` + `PAYMENT_CONFIRMED` → `acessoAte` estendido | manual | — (requer conta Asaas, D-05) | n/a | ✅ **verde** |
| 03-07-02 | 03-07 | 4 | GTW-02 | `capturarAssinatura` re-busca a assinatura e resolve o tenant pelo `checkoutSession` autoritativo, não pelo payload | unit | `npx vitest run app/services/webhook-asaas.service.test.ts` | ✅ | ✅ green |
| 03-07-02b | 03-07 | 4 | GTW-03 | 1ª cobrança sem mapa por `sub_…`, `externalReference` null: resolve por `checkoutSession` e ESTENDE `acessoAte` | unit | idem | ✅ | ✅ green |
| 03-07-02c | 03-07 | 4 | GTW-03/04 | `checkoutSession` forjado no payload é ignorado; vale só o do re-fetch (C-08) | unit | idem | ✅ | ✅ green |
| 03-07-02d | 03-07 | 4 | GTW-04 | Sem `checkoutSession` e sem mapa local: nenhuma escrita, evento fica na fila de retrabalho | unit | idem | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · 🧑 manual (fora do alcance automatizado)*

Sufixos `b`/`c`/`d` distinguem comportamentos verificados dentro da MESMA task; o
prefixo é sempre o `{padded_phase}-{plan}-{task}` real.

---

## Wave 0 Requirements

- [x] `lib/billing/asaas/config.test.ts` — cobre GTW-01/GTW-02 (fail-fast de env vars)
- [x] `lib/billing/asaas/datas.test.ts` — cobre GTW-03 (clamp de mês, parsing de data SP)
- [x] `app/services/assinatura.service.test.ts` — cobre GTW-01
- [x] `app/services/webhook-asaas.service.test.ts` — cobre GTW-02/03/04 (84 casos)
- [x] `app/api/webhooks/asaas/route.test.ts` — **primeiro teste de route handler do projeto**; `buildRequest()` de `tests/helpers/request.ts` ganhou `headers` e `rawBody` (03-05)
- [x] Helper de fixtures de payload Asaas (`tests/helpers/asaas.ts`) — envelopes de `PAYMENT_CONFIRMED`, `CHECKOUT_PAID`, `SUBSCRIPTION_CREATED` (o de atraso é derivado por override de `event`)
- [x] Framework install: nenhum — Vitest já configurado

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fluxo real de checkout + webhook contra Asaas sandbox | GTW-01..04 | Nenhuma conta Asaas existe nesta sessão (D-05 do CONTEXT.md); é a única prova end-to-end contra o gateway real | Criar checkout de teste, pagar com cartão de teste do Asaas sandbox, confirmar que `CHECKOUT_PAID`/`PAYMENT_CONFIRMED` chegam no endpoint e `acessoAte` é estendido corretamente |

**Evidência colhida em 2026-09-01** (plano 03-07, empresa de teste `homologacao-asaas-0307`,
id `e0307000-0000-4000-8000-000000000307`):

| Medida | Antes | Depois |
|--------|-------|--------|
| `Empresa.acessoAte` | `NULL` | `2026-10-01 03:00:00` (meia-noite de SP = `dueDate 2026-09-01` + 1 ciclo) |
| `Empresa.asaasSubscriptionId` | `NULL` | `sub_olnv6hyy59omcslo` |
| `Empresa.asaasCustomerId` | `NULL` | `cus_000008967137` |
| `Empresa.ultimoStatusAuditado` | `CARENCIA` | `EM_DIA` |
| Linhas em `AuditoriaAcesso` | 0 | 1 — `CARENCIA → EM_DIA`, causa `WEBHOOK_PAGAMENTO` |

- Checkout real: `POST /api/assinaturas/checkout` → **200** em 1,617 s, `checkoutId = e8f41895-bf17-4429-95b2-cc55c800ad51`, pago com o cartão de teste do sandbox.
- Ledger: 3 eventos, todos com `processadoEm` preenchido e `erro` nulo; **0** linhas sem terminação.
- Ordem REAL de entrega: `PAYMENT_CONFIRMED` (12:20:20.869) → `SUBSCRIPTION_CREATED` (12:20:22.606) → `CHECKOUT_PAID` (12:20:22.654) — fora da ordem cronológica dos `dateCreated`.
- Rejeição: token errado → **401**; sem header → **401** (contra a URL pública HTTPS).
- Reentrega pelo painel do Asaas ("Logs de Webhooks") do mesmo `PAYMENT_CONFIRMED`: ledger permaneceu em **3 linhas** (mesmo `eventoId`, `createdAt` original preservado), `acessoAte` inalterado, `AuditoriaAcesso` ainda em 1.
- Fila do Asaas: `penalizedRequestsCount = 0` e `interrupted: false` depois de todas as entregas reais.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** **aprovado e fechado em 2026-09-01**, após a wave 4 (plano 03-07). Toda linha
do mapa está verde, incluindo `03-H1` — a única manual — agora com evidência numérica
registrada acima. Nenhuma linha `⬜ pending`.

A homologação não foi cerimônia: ela derrubou duas suposições da pesquisa (A3 e a premissa
de ordenação do `sendType`) e revelou um impasse de resolução de tenant que nenhum mock
reproduzia — um cliente que pagou ficava sem acesso. As quatro linhas `03-07-*` acima são a
cobertura de regressão dessa correção, e foram validadas por mutação.
