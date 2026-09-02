---
phase: 6
slug: termos-de-uso-e-aceite
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-02
closed: 2026-09-02
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (unit/component) + Playwright 1.62.1 (e2e) |
| **Config file** | `vitest.config.mts` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run <arquivo>` |
| **Full suite command** | `npm run test` (Vitest) · `npm run test:e2e` (Playwright, exige Postgres) |
| **Estimated runtime** | Vitest < 5s por arquivo; **suíte completa medida: 37s (Vitest) e 2.4min (Playwright)** |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <arquivos tocados>` (< 5s)
- **After every plan wave:** Run `npm run test` + `npm run lint` + `npx tsc --noEmit`
- **Before `/gsd-verify-work`:** `npm run test` verde, `npm run test:e2e` verde (Postgres real), `npm run gates:fase-06` verde
- **Max feedback latency:** 5 seconds

---

## Resultado da bateria completa (medido no plano 06-08, 2026-09-02)

Todos os números abaixo foram **observados na execução**, não herdados do template.

| Comando | Exit | Contagem observada |
|---------|------|--------------------|
| `npm run test` | 0 | **95 arquivos / 1019 testes** (baseline da Fase 4 era 876; fim da Fase 5, 916) |
| `npm run test:e2e` | 0 | **28 testes** (24 herdados da Fase 5 + 4 novos de `e2e/aceite-de-termos.spec.ts`), sem retry |
| `npm run lint` | 0 | 0 erros, **2 warnings pré-existentes** (`app/registro/page.tsx:1` e `app/services/reconciliacao.service.test.ts:35`), em nada que esta fase introduziu |
| `npx tsc --noEmit` | 0 | — |
| `npm run gates:fase-04` | 0 | **6/6 gates OK** |
| `npm run gates:fase-05` | 0 | **6/6 gates OK** |
| `npm run gates:fase-06` | 0 | **5/5 gates OK** |

Nada ficou pendente por indisponibilidade de ambiente: o Postgres de dev estava
disponível (`npx prisma migrate status` → 13 migrations, "Database schema is up to
date!"), então a suíte e2e rodou de verdade contra banco real.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-T3 | 06-01 | 0/1 | — | — | Stub default de `prismaMock.usuario.findFirst` ganha `termoAceitoId` sem quebrar suíte existente | unit | `npm run test` | ✅ | ✅ green |
| 06-06-T2 | 06-06 | 3 | TERM-01 | T-06-32 | Server Action recusa registro sem `aceiteTermos` | unit | `npx vitest run app/registro/actions.test.ts` | ✅ (15 casos) | ✅ green |
| 06-06-T1 | 06-06 | 3 | TERM-01 | T-06-33 | Registro grava `AceiteTermo` na mesma transação de Empresa+Usuario | unit | `npx vitest run app/services/empresa.service.test.ts` | ✅ (52 casos) | ✅ green |
| 06-07-T1 | 06-07 | 4 | TERM-01 | T-06-08 | Checkbox obrigatório e detalhe com texto renderizam | component | `npx vitest run app/registro/_components/register-form.test.tsx` | ✅ (12 casos) | ✅ green |
| 06-07-T3 | 06-07 | 4 | TERM-01 | T-06-36 | Cadastro completo pela UI com aceite | e2e | `npx playwright test e2e/cadastro-e-login.spec.ts` | ✅ | ✅ green |
| 06-03-T2 | 06-03 | 3 | TERM-02 | V4 / T-06-01 | SUPERADMIN publica → 201; ADMIN → 403; anônimo → 401 | unit | `npx vitest run app/api/termos/route.test.ts` | ✅ (10 casos) | ✅ green |
| 06-03-T2 | 06-03 | 3 | TERM-02 | V4 / T-06-01 | Role stale no token não autoriza (não-vacuidade: o teste afirma que token e banco DISCORDAM antes de chamar o handler) | unit | `npx vitest run app/api/termos/route.test.ts` | ✅ | ✅ green |
| 06-08-T2 | 06-08 | 5 | TERM-02 | T-06-02 | Nenhum caminho HTTP escreve `role` (Gate 3) | gate (grep) | `npm run gates:fase-06` | ✅ | ✅ green |
| 06-08-T2 | 06-08 | 5 | TERM-02 | T-06-01 | Nenhum código de produção autoriza pela role do JWT (Gate 1) | gate (grep) | `npm run gates:fase-06` | ✅ | ✅ green |
| 06-02-T3 | 06-02 | 2 | TERM-03 | T-06-16 | `publicar` sempre INSERT; versão incrementa; P2002 → 409 | unit | `npx vitest run app/services/termo.service.test.ts` | ✅ (11 casos) | ✅ green |
| 06-02-T3 | 06-02 | 2 | TERM-03 | T-06-20 / T-06-21 | `registrarAceite` grava fato + bookkeeping na mesma tx; P2002 idempotente | unit | `npx vitest run app/services/termo.service.test.ts` | ✅ | ✅ green |
| 06-08-T2 | 06-08 | 5 | TERM-03 | T-06-17 | Service não expõe `update`/`delete` de `TermoDeUso` (Gate 2) | gate (grep) | `npm run gates:fase-06` | ✅ | ✅ green |
| 06-04-T1 | 06-04 | 3 | TERM-04 | T-06-12 / T-06-13 | `revalidarConta` calcula `termosPendentes`; SUPERADMIN sempre falso; sem termo publicado → falso | unit | `npx vitest run lib/auth-guard.test.ts` | ✅ (19 casos) | ✅ green |
| 06-04-T2 | 06-04 | 3 | TERM-04 | T-06-26 | `requireAdminSession` redireciona para `/aceitar-termos` só depois do gate de bloqueio | unit | `npx vitest run lib/session.test.ts` | ✅ (32 casos) | ✅ green |
| 06-04-T3 | 06-04 | 3 | TERM-04 | T-06-05 | `requireAuth` devolve 403 com termos pendentes | unit | `npx vitest run lib/api-auth.test.ts` | ✅ (27 casos) | ✅ green |
| 06-05-T3 | 06-05 | 4 | TERM-04 | T-06-26 | Guarda simétrica da rota de aceite (5 condições) + regressão que lê `bloqueado/page.tsx` | unit | `npx vitest run "app/[slug]/admin/aceitar-termos/page.test.ts"` | ✅ (15 casos) | ✅ green |
| 06-05-T1 | 06-05 | 4 | TERM-04 | T-06-06 / T-06-07 / T-06-29 | Server Action de aceite se autoriza sozinha, deriva `usuarioId` da sessão e grava o id do servidor | unit | `npx vitest run "app/[slug]/admin/aceitar-termos/actions.test.ts"` | ✅ (10 casos) | ✅ green |
| 06-08-T1 | 06-08 | 5 | TERM-04 | T-06-05 / T-06-26 / T-06-30 | Gate → aceita → volta ao admin; logout sem loop; espelho REST 403→200; precedência do bloqueio | e2e | `npx playwright test e2e/aceite-de-termos.spec.ts` | ✅ (4 casos) | ✅ green |
| 06-08-T2 | 06-08 | 5 | TERM-04 | T-06-37 | Nenhum arquivo novo da fase usa a paleta âmbar reservada ao vocabulário de pagamento (Gate 4) | gate (grep) | `npm run gates:fase-06` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Nenhum marcador de pendência restante nas colunas `Task ID` e `Plan` — os identificadores são os planos e tasks realmente executados. (A prosa desta nota evita escrever o marcador literal: é a mesma disciplina que os sete planos anteriores tiveram que adotar para não mover contador de grep.)*

**Sobre a não-vacuidade dos gates:** três dos cinco gates de `gates-fase-06.mjs`
tiveram a não-vacuidade demonstrada por sonda temporária revertida durante o plano
06-08 (Gate 1 em `app/api/termos/route.ts`, Gate 2 em `app/services/termo.service.ts`,
Gate 4 em `aceite-card.tsx`); em cada caso o comando saiu com código 1 apontando
arquivo e linha, e a sonda foi revertida com `git checkout -- <arquivo>` antes de
qualquer commit. Os Gates 3 e 5 não foram sondados: o Gate 5 é uma comparação
numérica trivialmente verificável, e o Gate 3 já falha por construção se um dos DTOs
for renomeado (o gate trata "interface não encontrada" como FALHA, não como OK).

---

## Wave 0 Requirements

- [x] `tests/setup/prisma-mock.ts` — `termoAceitoId` no stub default de `usuario.findFirst` **antes de qualquer outra coisa** — fechado por **06-01 Task 3** (916 testes seguiram verdes sem editar um único arquivo de teste)
- [x] Stub default de `termoVigente()` na suíte — fechado por **06-01 Task 3**, que optou por stubar `prismaMock.termoDeUso.findFirst` com a combinação NEUTRA "existe vigente E já aceito", para que cada teste autenticado exercite a comparação do gate
- [x] `app/services/termo.service.test.ts` — criado por **06-02 Task 3** (11 casos, TERM-02/TERM-03)
- [x] `app/api/termos/route.test.ts` — criado por **06-03 Task 2** (10 casos, inclusive o de não-vacuidade)
- [x] `app/[slug]/admin/aceitar-termos/page.test.ts` — criado por **06-05 Task 3** (15 casos)
- [x] `app/registro/actions.test.ts` — criado por **06-06 Task 2** (15 casos, TERM-01)
- [x] `e2e/aceite-de-termos.spec.ts` — criado por **06-08 Task 1** (4 casos, TERM-04 fim a fim, inclusive logout)
- [x] `scripts/gates-fase-06.mjs` + entrada em `package.json` — criados por **06-08 Task 2** (5 gates; descarte de linhas de comentário implementado conforme decisão `[04-09]`)
- [x] Helpers de registro dos 9 specs e2e existentes atualizados — fechado por **06-07 Task 3** (12 `check()` para 12 submits; a 13ª ocorrência do locator é uma asserção de renderização, não um submit)

---

## Manual-Only Verifications

O modo de verificação humana deste projeto é **end-of-phase**: os três itens abaixo
são colhidos no UAT de fim de fase, não como checkpoint bloqueante no meio da
execução. Nenhum deles tem ação de código associada — todos vivem fora do
repositório, que é exatamente por que nenhum teste pode cobri-los.

| # | Behavior | Requirement | Why Manual | Test Instructions | Confirmado |
|---|----------|-------------|------------|-------------------|-----------|
| 1 | Texto jurídico REAL publicado antes do deploy em produção (não o placeholder da migration v1) | TERM-01 / TERM-03 (A4) | Conteúdo jurídico não é verificável por teste automatizado | Antes do deploy em produção, o operador publica o texto legal real como uma **NOVA versão** via `POST /api/termos` autenticado como SUPERADMIN (`npm run seed:superadmin` cria a conta; o slug impresso é a URL de login dele). Publicar é INSERT, **sempre** — a v1 NÃO é editada (D-07). Em seguida, abrir a tela de aceite e confirmar que o texto exibido é o correto, e registrar a confirmação aqui. **Consequência de pular:** todos os clientes terão aceitado um placeholder que começa com `[TEXTO PROVISORIO - ...]`, e o registro de consentimento — o único produto desta fase — não vale nada | ⬜ pendente |
| 2 | Operador ciente de que 100% dos usuários existentes verão a tela de aceite no próximo request | TERM-04 (Open Question 3) | Decisão de produto/comunicação, fora do código | Após a migration, **todos** os `Usuario` existentes ficam com `termoAceitoId = NULL` e caem no gate no próximo request autenticado. Isso é o comportamento DESEJADO (é o goal da fase), mas é uma mudança visível e não anunciada para todo cliente pagante. O operador confirma que está ciente e decide se haverá aviso prévio. **Não há ação de código associada** — a decisão é de produto | ⬜ pendente |
| 3 | Ordem de deploy respeitada | TERM-02 (Runtime State Inventory) | Sequência de operações em ambiente que não existe no repositório | Aplicar as migrations na ordem — (a) `add_superadmin_role` (o `ALTER TYPE` do enum, isolado), (b) `add_termos_de_uso` (tabelas + coluna), (c) `seed_termo_v1` — depois fazer o **deploy da aplicação**, e por fim rodar `npm run seed:superadmin -- --email <email> --senha <credencial forte>` em produção. Rodar o seed antes do deploy é inofensivo; rodar a migration de enum **depois** do código que usa `SUPERADMIN` produz erro de runtime no Prisma. Registrar aqui a ordem efetivamente executada | ⬜ pendente |

---

## Assunções conscientes desta fase (não são lacunas)

Os três itens abaixo ficam deliberadamente em aberto ao fim da Fase 6. Estão
registrados para que o verificador **não os trate como falhas de cobertura**.

| # | Item | Origem | Por que fica em aberto | O que custa mudar depois |
|---|------|--------|------------------------|--------------------------|
| A1 | O aceite **não** captura IP nem user-agent | `06-RESEARCH.md § Assumptions Log` A1 (confiança LOW — sem fonte jurídica) | `usuarioId + termoId + aceitoEm` foi julgado suficiente para valor jurídico no Brasil, mas nenhuma assessoria confirmou. Capturar IP é processamento de dado pessoal adicional que ninguém pediu | Migration nova **mais** captura de dado pessoal novo. Barato agora, caro depois |
| A2 | Aceites desaparecem junto com o `Usuario`, por `onDelete: Cascade` herdado de `Empresa` | `06-RESEARCH.md § Assumptions Log` A2 | Se houver dever de retenção da prova de consentimento após o encerramento da conta, o cascade destrói a prova exatamente quando ela importa. O projeto já resolveu isso de forma OPOSTA em `EventoWebhookAsaas` (FK deliberadamente ausente) | Mudança de FK + estratégia de retenção; migration sobre dados já apagados é impossível |
| — | `POST /api/usuarios` continua **sem `requireAuth`** | `06-RESEARCH.md`, herdado de `CONCERNS.md` (T-06-03, disposition `accept`) | **Pré-existente e fora do escopo desta fase.** Não é capaz de criar SUPERADMIN — `CreateUsuarioDTO` não declara `role`, e o Gate 3 de `gates:fase-06` trava essa forma — mas é capaz de criar ADMIN numa empresa que ainda não tem usuário | Hardening pendente para uma fase futura: exigir `requireAuth` e conferir `empresaId` contra a sessão |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (verified by gsd-plan-checker across all 8 PLAN.md — task counts match automated-verify counts 1:1)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (06-01 Task 3 fixes `tests/setup/prisma-mock.ts`; remaining Wave 0 stub files created by their respective plans)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] `wave_0_complete: true` — os 9 itens de Wave 0 fecharam, cada um apontando o plano que o fechou
- [x] Toda linha do Per-Task Verification Map tem comando automatizado **verde** (nenhuma linha depende de justificativa de manual)
- [x] Bateria completa verde e com contagens transcritas da execução real (ver `## Resultado da bateria completa`)
- [x] As três verificações que só um humano pode fazer estão registradas com instrução acionável e consequência de pular

**Approval:** approved 2026-09-02 (gsd-plan-checker VERIFICATION PASSED)
**Closed:** 2026-09-02 pelo plano 06-08 — cobertura automatizada verde de ponta a ponta; restam os 3 human-checks de go-live, que por construção não podem ser fechados dentro do repositório.
