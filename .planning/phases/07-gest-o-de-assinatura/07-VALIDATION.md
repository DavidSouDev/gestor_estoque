---
phase: 07
slug: gest-o-de-assinatura
status: blocked
nyquist_compliant: false
wave_0_complete: true
created: 2026-09-02
updated: 2026-09-02
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
| 07-01 | 07-01 | 1 | SUB-02 | Pitfall 11 / IDOR | `removerAssinatura` faz DELETE /subscriptions/{id} com header access_token | unit | `npx vitest run lib/billing/asaas/client.test.ts` | ✅ | ✅ green |
| 07-04 | 07-04 | 2 | SUB-02 | Pattern 1 fronteira | `cancelar` grava canceladoEm só depois do 200 do gateway | unit | `npx vitest run app/services/assinatura.service.test.ts` | ✅ | ✅ green |
| 07-04 | 07-04 | 2 | SUB-02 | Pattern 1 fronteira | gateway 502 ⇒ nenhuma escrita (asserção de ausência) | unit | idem | ✅ | ✅ green |
| 07-04 | 07-04 | 2 | SUB-02 | Pitfall 4 | gateway 404 ⇒ canceladoEm gravado mesmo assim | unit | idem | ✅ | ✅ green |
| 07-04 | 07-04 | 2 | SUB-02 | — | empresa sem asaasSubscriptionId ⇒ HttpError 409, sem chamada ao gateway | unit | idem | ✅ | ✅ green |
| 07-05 | 07-05 | 3 | SUB-02 | D-05 / Pitfall 11 | Server Action cancelarAssinatura não tem parâmetro de id e rejeita slug ≠ sessão | unit | `npx vitest run app/[slug]/admin/(protected)/assinatura/actions.test.ts` | ✅ | ✅ green |
| 07-01 | 07-01 | 1 | SUB-01 | Pitfall 2 | acessoEfetivoAte devolve acessoAte mesmo em TRIAL quando acessoAte > trialFim | unit | `npx vitest run lib/avaliar-acesso.test.ts` | ✅ | ✅ green |
| 07-06 | 07-06 | 4 | SUB-01 | — | tela renderiza os 5 estados (sem assinatura / ativa / aguardando / cancelada / degradado — o mapa original previa 4; a UI-SPEC acrescentou "aguardando", posterior ao RESEARCH) | component | `npx vitest run app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx` | ✅ | ✅ green |
| 07-04 | 07-04 | 2 | SUB-01 | D-02b | consultarAssinatura devolve origem: "indisponivel" em AsaasApiError | unit | `npx vitest run app/services/assinatura.service.test.ts` | ✅ | ✅ green |
| 07-05 | 07-05 | 3 | SUB-02 | D-03 | modal exige 2 cliques e mostra a data antes de confirmar | component | `npx vitest run app/[slug]/admin/(protected)/assinatura/_components/cancelar-assinatura.test.tsx` | ✅ | ✅ green |
| 07-03 | 07-03 | 1 | SUB-01/02 | — | link "Assinatura" aparece no nav e marca ativo na rota | component | `npx vitest run app/[slug]/admin/(protected)/_components/admin-nav.test.tsx` | ✅ | ✅ green |
| 07-07 | 07-07 | 5 | SUB-02 | — | fluxo completo: ver status → cancelar → ver "ativo até {data}" | e2e | `npx playwright test e2e/cancelamento-de-assinatura.spec.ts` | ✅ (4 casos; `playwright test --list` confirma) | ⚠️ não executado contra Postgres real (ver § Verificações manuais) |
| 07-07 | 07-07 | 5 | SUB-03 | — | empresa cancelada com período expirado é bloqueada no admin e tem catálogo despublicado | e2e | idem, caso "empresa cancelada e expirada perde o admin, a tela de assinatura e o catálogo" | ✅ | ⚠️ não executado contra Postgres real (ver § Verificações manuais) |
| 07-05 / 07-07 | 07-05 / 07-07 | 3 / 5 | Segurança | Pitfall 11 / IDOR | empresa A não consegue ler/cancelar assinatura de B — a action não aceita id | unit + e2e | `actions.test.ts` (unit) + caso e2e "um tenant não alcança a assinatura de outro" | ✅ | unit ✅ green · e2e ⚠️ não executado (ver § Verificações manuais) |
| 07-02 | 07-02 | 1 | D-01 | Pitfall 3 | poller para no teto e mostra o fallback; clearTimeout no unmount | component | `npx vitest run app/[slug]/admin/_components/poller-de-status.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky/não executado*

**Corrida completa medida em 2026-09-02** (após a Wave 5, repo em `c91d16e`): `npm test` 1153/1153 (99 arquivos), `npx tsc --noEmit` 0, `npm run lint` 0 erros (3 warnings pré-existentes, um deles duplicado por um worktree GSD órfão da Fase 3 sendo varrido pelo ESLint), `npm run gates:fase-07` 6/6 OK. `npm run test:e2e` **não roda neste ambiente** — ver § Verificações manuais.

---

## Wave 0 Requirements

- [x] `app/[slug]/admin/(protected)/assinatura/actions.test.ts` — cobre SUB-02 + D-05 (07-05)
- [x] `app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx` — cobre SUB-01 (5 estados) (07-06)
- [x] `app/[slug]/admin/(protected)/assinatura/_components/cancelar-assinatura.test.tsx` — cobre D-03 (07-05; renomeado de `cancelar-dialog.test.tsx` do mapa original — a UI-SPEC, posterior ao RESEARCH, batizou o componente `CancelarAssinatura`, não `CancelarDialog`)
- [x] `app/[slug]/admin/_components/poller-de-status.test.tsx` — cobre D-01 (07-02)
- [x] `e2e/cancelamento-de-assinatura.spec.ts` — cobre SUB-02 + SUB-03 + isolamento (07-07; código existe e `playwright test --list` confirma 4 casos, execução real pendente — ver abaixo)
- [x] `scripts/gates-fase-07.mjs` + `"gates:fase-07"` no `package.json` (07-07; 6/6 OK)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `DELETE /v3/subscriptions/{id}` contra o sandbox real: resposta `{deleted:true}`, 404 no segundo DELETE, cobrança já paga sobrevive (`Empresa.acessoAte` intacto) | SUB-02 | Conta Asaas sandbox exige `commercialInfo`/`bankAccountInfo` aprovados; testes unitários cobrem o contrato HTTP via mock, mas não provam o comportamento real do gateway (A1/A2/A3 do Assumptions Log) | Autenticar como empresa de teste com assinatura ativa no sandbox, cancelar pela tela `/assinatura`, conferir no painel Asaas que a cobrança paga permanece e que uma segunda tentativa de DELETE (via script) devolve 404 |

### Desfecho (2026-09-02) — checkpoint 07-08 Task 1 ADIADO, não recusado

O checkpoint bloqueante do plano `07-08` foi apresentado ao operador com o roteiro completo de
verificação (os 9 passos do `<how-to-verify>`). Antes de chegar a rodar qualquer passo, dois obstáculos
de ambiente foram confirmados e medidos:

- **Postgres local indisponível para este projeto.** A porta `5432` está servida pelo container
  `bling_nf_checker-postgres-1`, de um projeto não relacionado que o operador está usando ao mesmo tempo.
  As credenciais do `.env` do `gestor_estoque` (usuário `gestor`) falham autenticação nele
  (`Prisma P1000: AuthenticationFailed`). Isso também impediu `npm run test:e2e` de rodar no plano `07-07`
  (mesma causa raiz, documentada lá) e no próprio `07-08` (`npx prisma migrate status` reproduz o mesmo
  erro).
- **A verificação em si exige navegador e conta Asaas Sandbox do operador** — nenhum agente tem acesso a
  nenhum dos dois, por desenho (este é exatamente o motivo do checkpoint ser `human-verify` e não
  auto-aprovável).

**Decisão explícita do operador:** "estou rodando outro projeto, pula o teste por agora" — adiar a
verificação manual, sem forçar aprovação nem inventar números. Nenhum dos passos 1-9 foi executado;
nenhum valor de `acessoAte`, data exibida, ou status HTTP foi observado ou registrado.

**Consequência para A1/A2/A3/A6/A7 (Assumptions Log, `07-RESEARCH.md`):**

| # | Claim | Desfecho |
|---|-------|----------|
| A1 | Segundo `DELETE` devolve 404, não 200 idempotente | **Ainda suposição.** Risco Baixo — o código está correto nos dois desfechos (04-04's ramo de 404 simplesmente não seria exercido se a API for idempotente) |
| A2 | `GET` pós-remoção devolve 404 ou objeto com `deleted:true` | **Ainda suposição.** Risco Médio, mitigado por design — a tela ramifica por `canceladoEm` local antes de chamar o Asaas, nunca dependendo desta resposta |
| A3 | Cancelar não apaga a cobrança já paga; `acessoAte` permanece válido | **Ainda suposição — NÃO CONFIRMADA NEM REFUTADA.** Risco **Alto se errado** (a promessa central de SUB-02). Esta é a lacuna real que o milestone carrega até a verificação rodar |
| A6 | Modal de D-03 é overlay in-page, não rota dedicada | **RESOLVIDA.** A UI-SPEC manteve a decisão de overlay (`CancelarAssinatura` como view de confirmação de 2 cliques dentro da própria tela, não rota dedicada) — `confirmar-remocao.tsx` seguiu como precedente, plano `07-05` |
| A7 | Limpar `canceladoEm` na reativação é a solução preferida ao Pitfall 6 | **RESOLVIDA no plano `07-04`.** `criarCheckout` limpa `canceladoEm` após o 2xx do gateway, antes da conclusão do pagamento |
| A8 | Postgres disponível no ambiente de execução | **PARCIALMENTE REFUTADA nesta sessão** — não por indisponibilidade geral, mas por conflito de porta com outro projeto do operador rodando ao mesmo tempo. Risco Baixo permanece correto uma vez resolvido o conflito |

**O que a fase deliberadamente não cobre**, para o verificador não tratar como lacuna silenciosa:
- Os estados "ativa" e "degradado" da tela (`AssinaturaCard`) não têm cobertura de e2e automatizada — dependem do gateway real por construção; só o checkpoint humano os exercita.
- A fila `EventoWebhookAsaas WHERE processadoEm IS NULL` continua sem dreno (blocker herdado da Fase 3 — `webhookAsaasService.processar` ainda não existe). Fora do escopo desta fase.
- A revisão de segurança da fase (`/gsd-secure-phase 07`) não rodou — decisão de segurança pendente, não tomada durante este checkpoint (passo 9 do `07-08-PLAN.md` não foi alcançado).

**Próxima ação, quando o operador estiver pronto:** reabrir o checkpoint do `07-08` (os 9 passos do
`<how-to-verify>` estão preservados em `07-08-PLAN.md`), com Postgres do `gestor_estoque` acessível e
`.env` apontando para o sandbox Asaas. Até lá, este arquivo permanece `status: blocked`.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter — **false**: o checkpoint humano (A3) não foi executado, apenas adiado por decisão explícita do operador

**Approval:** pending — checkpoint `07-08` Task 1 adiado em 2026-09-02, sem números observados. A fase
não está fechada; retomar quando o Postgres do projeto estiver acessível.
