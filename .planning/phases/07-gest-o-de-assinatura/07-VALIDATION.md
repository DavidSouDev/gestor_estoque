---
phase: 07
slug: gest-o-de-assinatura
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-02
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit/componente, jsdom) + Playwright 1.62.1 (E2E, Chromium) |
| **Config file** | `vitest.config.mts`, `playwright.config.ts`, setup em `tests/setup/vitest.setup.ts` |
| **Quick run command** | `npx vitest run app/services/assinatura.service.test.ts lib/billing/asaas/client.test.ts lib/avaliar-acesso.test.ts` |
| **Full suite command** | `npm test` (unit) + `npm run test:e2e` (E2E) |
| **Estimated runtime** | ~35s (unit) + ~2-3min (e2e) |

---

## Sampling Rate

- **After every task commit:** Run quick run command against touched files
- **After every plan wave:** Run `npm test && npm run lint`
- **Before `/gsd-verify-work`:** `npm test`, `npm run test:e2e`, `npm run lint` verdes; considerar `scripts/gates-fase-07.mjs`
- **Max feedback latency:** ~35s (unit suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-XX-XX | TBD | TBD | SUB-02 | Pitfall 11 / IDOR | `removerAssinatura` faz DELETE /subscriptions/{id} com header access_token | unit | `npx vitest run lib/billing/asaas/client.test.ts` | ✅ (arquivo existe; casos novos) | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-02 | Pattern 1 fronteira | `cancelar` grava canceladoEm só depois do 200 do gateway | unit | `npx vitest run app/services/assinatura.service.test.ts` | ✅ (arquivo existe; casos novos) | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-02 | Pattern 1 fronteira | gateway 502 ⇒ nenhuma escrita (asserção de ausência) | unit | idem | ✅ | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-02 | Pitfall 4 | gateway 404 ⇒ canceladoEm gravado mesmo assim | unit | idem | ✅ | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-02 | — | empresa sem asaasSubscriptionId ⇒ HttpError 409, sem chamada ao gateway | unit | idem | ✅ | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-02 | D-05 / Pitfall 11 | Server Action cancelarAssinatura não tem parâmetro de id e rejeita slug ≠ sessão | unit | `npx vitest run app/[slug]/admin/(protected)/assinatura/actions.test.ts` | ❌ Wave 0 | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-01 | Pitfall 2 | acessoEfetivoAte devolve acessoAte mesmo em TRIAL quando acessoAte > trialFim | unit | `npx vitest run lib/avaliar-acesso.test.ts` | ✅ (arquivo existe; casos novos) | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-01 | — | tela renderiza os 4 estados (sem assinatura / ativa / cancelada / degradado) | component | `npx vitest run app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-01 | D-02b | consultarAssinatura devolve origem: "indisponivel" em AsaasApiError | unit | `npx vitest run app/services/assinatura.service.test.ts` | ✅ | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-02 | D-03 | modal exige 2 cliques e mostra a data antes de confirmar | component | `npx vitest run app/[slug]/admin/(protected)/assinatura/_components/cancelar-dialog.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-01/02 | — | link "Assinatura" aparece no nav e marca ativo na rota | component | `npx vitest run app/[slug]/admin/(protected)/_components/admin-nav.test.tsx` | ✅ (arquivo existe; caso novo) | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-02 | — | fluxo completo: ver status → cancelar → ver "ativo até {data}" | e2e | `npx playwright test e2e/cancelamento-de-assinatura.spec.ts` | ❌ Wave 0 | ⬜ pending |
| 07-XX-XX | TBD | TBD | SUB-03 | — | empresa cancelada com período expirado é bloqueada no admin e tem catálogo despublicado | e2e | idem (ou estender e2e/bloqueio-por-inadimplencia.spec.ts) | ✅ (spec existe; caso novo) | ⬜ pending |
| 07-XX-XX | TBD | TBD | Segurança | Pitfall 11 / IDOR | empresa A não consegue ler/cancelar assinatura de B — a action não aceita id | unit + e2e | idem | ❌ Wave 0 | ⬜ pending |
| 07-XX-XX | TBD | TBD | D-01 | Pitfall 3 | poller para no teto e mostra o fallback; clearTimeout no unmount | component | `npx vitest run app/[slug]/admin/_components/poller-de-status.test.tsx` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/[slug]/admin/(protected)/assinatura/actions.test.ts` — cobre SUB-02 + D-05
- [ ] `app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx` — cobre SUB-01 (4 estados)
- [ ] `app/[slug]/admin/(protected)/assinatura/_components/cancelar-dialog.test.tsx` — cobre D-03
- [ ] `app/[slug]/admin/_components/poller-de-status.test.tsx` — cobre D-01
- [ ] `e2e/cancelamento-de-assinatura.spec.ts` — cobre SUB-02 + SUB-03 + isolamento
- [ ] *(opcional, forte precedente nas Fases 4/5/6)* `scripts/gates-fase-07.mjs` + `"gates:fase-07"` no `package.json`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `DELETE /v3/subscriptions/{id}` contra o sandbox real: resposta `{deleted:true}`, 404 no segundo DELETE, cobrança já paga sobrevive (`Empresa.acessoAte` intacto) | SUB-02 | Conta Asaas sandbox exige `commercialInfo`/`bankAccountInfo` aprovados; `.env` com credenciais não é legível pela sessão de planejamento; testes unitários cobrem o contrato HTTP via mock, mas não provam o comportamento real do gateway (A1/A2/A3 do Assumptions Log) | Autenticar como empresa de teste com assinatura ativa no sandbox, cancelar pela tela `/assinatura`, conferir no painel Asaas que a cobrança paga permanece e que uma segunda tentativa de DELETE (via script) devolve 404 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
