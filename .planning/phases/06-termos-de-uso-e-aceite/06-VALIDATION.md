---
phase: 6
slug: termos-de-uso-e-aceite
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-02
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
| **Estimated runtime** | Vitest < 5s por arquivo; suíte completa alguns minutos com Postgres real |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <arquivos tocados>` (< 5s)
- **After every plan wave:** Run `npm run test` + `npm run lint` + `npx tsc --noEmit`
- **Before `/gsd-verify-work`:** `npm run test` verde, `npm run test:e2e` verde (Postgres real), `npm run gates:fase-06` verde
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-W0-01 | TBD | 0 | — | — | Stub default de `prismaMock.usuario.findFirst` ganha `termoAceitoId` sem quebrar suíte existente | unit | `npm run test` | ✅ W0 | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-01 | — | Server Action recusa registro sem `aceiteTermos` | unit | `npx vitest run app/registro/actions.test.ts` | ❌ W0 | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-01 | — | Registro grava `AceiteTermo` na mesma transação de Empresa+Usuario | unit | `npx vitest run app/services/empresa.service.test.ts` | ✅ existe, estender | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-01 | — | Checkbox obrigatório e detalhe com texto renderizam | component | `npx vitest run app/registro/_components/register-form.test.tsx` | ✅ existe, estender | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-01 | — | Cadastro completo pela UI com aceite | e2e | `npx playwright test e2e/cadastro-e-login.spec.ts` | ✅ existe, atualizar | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-02 | V4 | SUPERADMIN publica → 201; ADMIN → 403; anônimo → 401 | unit | `npx vitest run app/api/termos/route.test.ts` | ❌ W0 | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-02 | V4 | Role stale no token não autoriza (não-vacuidade) | unit | `npx vitest run app/api/termos/route.test.ts` | ❌ W0 | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-02 | V4 | Nenhum caminho HTTP escreve `role` | gate (grep) | `npm run gates:fase-06` | ❌ W0 | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-03 | — | `publicar` sempre INSERT; versão incrementa; P2002 → 409 | unit | `npx vitest run app/services/termo.service.test.ts` | ❌ W0 | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-03 | Spoofing/Tampering | `registrarAceite` grava fato + bookkeeping na mesma tx; P2002 idempotente | unit | `npx vitest run app/services/termo.service.test.ts` | ❌ W0 | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-03 | — | Service não expõe `update`/`delete` de `TermoDeUso` | gate (grep) | `npm run gates:fase-06` | ❌ W0 | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-04 | — | `revalidarConta` calcula `termosPendentes`; SUPERADMIN sempre falso; sem termo publicado → falso | unit | `npx vitest run lib/auth-guard.test.ts` | ✅ existe, estender | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-04 | Information Disclosure | `requireAdminSession` redireciona para `/aceitar-termos` só depois do gate de bloqueio | unit | `npx vitest run lib/session.test.ts` | ✅ existe, estender | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-04 | Elevation of Privilege | `requireAuth` devolve 403 com termos pendentes | unit | `npx vitest run lib/api-auth.test.ts` | ✅ existe, estender | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-04 | — | Guarda simétrica da rota de aceite (4 estados da máquina) | unit | `npx vitest run "app/[slug]/admin/aceitar-termos/page.test.ts"` | ❌ W0 | ⬜ pending |
| 06-xx-xx | TBD | 1+ | TERM-04 | — | Gate → aceita → volta ao admin; logout funciona sem loop | e2e | `npx playwright test e2e/aceite-de-termos.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Task IDs finalized by the planner — this table is the requirement→test contract, not the final task numbering.*

---

## Wave 0 Requirements

- [ ] `tests/setup/prisma-mock.ts` — adicionar `termoAceitoId` ao stub default de `usuario.findFirst` **antes de qualquer outra coisa** (senão a suíte inteira fica vermelha por um motivo só — mesma classe de regressão em massa que a Fase 2 causou ao adicionar fatos de billing a esse stub)
- [ ] Decidir e implementar o stub default de `termoVigente()` na suíte (mockar o módulo, ou stubar `prismaMock.termoDeUso.findFirst`)
- [ ] `app/services/termo.service.test.ts` — stub inicial, cobre TERM-02/TERM-03
- [ ] `app/api/termos/route.test.ts` — stub inicial, cobre TERM-02 (inclusive não-vacuidade)
- [ ] `app/[slug]/admin/aceitar-termos/page.test.ts` — stub inicial, cobre TERM-04 (4 estados)
- [ ] `app/registro/actions.test.ts` — não existe hoje; stub inicial cobrindo TERM-01
- [ ] `e2e/aceite-de-termos.spec.ts` — stub inicial cobrindo TERM-04 fim a fim, inclusive logout
- [ ] `scripts/gates-fase-06.mjs` + entrada em `package.json` — gates de grep (descartar linhas de comentário, decisão `[04-09]`)
- [ ] Atualizar os helpers de registro dos 9 specs e2e existentes (ficam vermelhos sem terceiro parâmetro/aceite)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Texto real dos termos (não placeholder/lorem ipsum) publicado antes do merge para produção | TERM-01/TERM-03 | Conteúdo jurídico não é verificável por teste automatizado | `checkpoint:human-verify` antes do deploy — confirmar com o operador que o conteúdo publicado via `POST /api/termos` é o texto legal real, não um placeholder |
| Aviso/comunicação a clientes existentes sobre o novo gate obrigatório | TERM-04 | Decisão de produto/comunicação, fora do código | `checkpoint:human-verify` antes do deploy em produção — confirmar que o operador está ciente de que 100% dos usuários existentes verão o gate no próximo login |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (verified by gsd-plan-checker across all 8 PLAN.md — task counts match automated-verify counts 1:1)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (06-01 Task 3 fixes `tests/setup/prisma-mock.ts`; remaining Wave 0 stub files created by their respective plans)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-02 (gsd-plan-checker VERIFICATION PASSED)
