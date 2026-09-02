---
phase: 06-termos-de-uso-e-aceite
verified: 2026-09-02T14:48:20Z
status: human_needed
score: 14/14 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Publicar o texto jurídico REAL dos Termos de Uso via POST /api/termos antes do deploy em produção"
    expected: "A tela /{slug}/admin/aceitar-termos e /registro exibem o texto legal definitivo, não o placeholder '[TEXTO PROVISORIO - ...]' semeado pela migration 20260902120200_seed_termo_v1"
    why_human: "Conteúdo jurídico não é verificável por teste automatizado; é uma ação operacional de go-live fora do repositório"
  - test: "Confirmar que o operador está ciente de que todos os Usuario existentes (termoAceitoId = NULL após a migration) verão o gate de aceite no próximo request autenticado"
    expected: "Decisão de produto/comunicação registrada — se have ou não aviso prévio aos clientes pagantes"
    why_human: "Decisão de produto/comunicação, sem ação de código associada"
  - test: "Confirmar a ordem de deploy em produção: (a) migration add_superadmin_role, (b) migration add_termos_de_uso, (c) migration seed_termo_v1, (d) deploy da aplicação, (e) npm run seed:superadmin"
    expected: "Migrations aplicadas antes do deploy do código que referencia UserRole.SUPERADMIN; seed do superadmin rodado depois do deploy"
    why_human: "Sequência de operações em ambiente de produção que não existe no repositório; rodar a migration do enum depois do código que usa SUPERADMIN produz erro de runtime"
---

# Phase 6: Termos de Uso e Aceite — Verification Report

**Phase Goal:** Ninguém usa a plataforma sem ter aceitado a versão vigente dos termos, e só a plataforma (não os admins das empresas) pode publicar novos termos
**Verified:** 2026-09-02T14:48:20Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `UserRole` aceita `SUPERADMIN` sem quebrar o Prisma Client existente | ✓ VERIFIED | `prisma/schema.prisma:16` (`SUPERADMIN` no enum); migration isolada `20260902120000_add_superadmin_role/migration.sql` (`ALTER TYPE "UserRole" ADD VALUE 'SUPERADMIN'`, sem DML na mesma transação) |
| 2 | Uma versão de termo publicada é imutável — nunca pode ser apagada/reescrita enquanto houver aceite apontando para ela | ✓ VERIFIED | `AceiteTermo.termoId` FK com `onDelete: Restrict` (`prisma/schema.prisma:477`, confirmado na migration SQL); `termo.service.ts` não expõe `update`/`delete` de `TermoDeUso`; Gate 2 de `gates-fase-06.mjs` confirma ausência em `app/` e `lib/` (rodado: `OK Gate 2`) |
| 3 | Um banco recém-migrado (inclusive CI) já tem a v1 dos termos, sem passo de seed | ✓ VERIFIED | `prisma/migrations/20260902120200_seed_termo_v1/migration.sql` — `INSERT ... ON CONFLICT ("versao") DO NOTHING`; `npx prisma migrate status` confirma 13 migrations aplicadas e schema atualizado no banco de dev local |
| 4 | Um `SUPERADMIN` autenticado publica uma nova versão dos termos e recebe 201; um `ADMIN` recebe 403; token que diz SUPERADMIN mas usuário no banco é ADMIN recebe 403; anônimo recebe 401 | ✓ VERIFIED | `app/api/termos/route.ts` — role lida via `revalidarConta(auth.sub, auth.empresaId).role`, nunca `auth.role`; `app/api/termos/route.test.ts` (10 casos, incluindo caso de não-vacuidade) passou em `npx vitest run` |
| 5 | Existe um caminho versionado e reproduzível para criar o SUPERADMIN em qualquer ambiente | ✓ VERIFIED | `scripts/seed-superadmin.ts` + `npm run seed:superadmin` (`package.json:22`); executado ao vivo durante esta verificação via e2e (`[seed:superadmin] já existe — nada foi criado`), confirmando idempotência |
| 6 | Nenhum código de produção autoriza publicação pela role do JWT (janela de 7 dias fechada) | ✓ VERIFIED | Gate 1 de `scripts/gates-fase-06.mjs` — rodado ao vivo: `OK Gate 1 (autorização nunca pela role do JWT)` |
| 7 | Um ADMIN cujo último aceite é anterior à versão vigente é redirecionado para a tela de aceite ao abrir qualquer page do admin, e recebe 403 em qualquer rota REST atrás de `requireAuth` | ✓ VERIFIED | `lib/auth-guard.ts` (`ContaAtiva.termosPendentes`); `lib/session.ts` (`requireAdminSession` → `redirect(/${slug}/admin/aceitar-termos)`); `lib/api-auth.ts` (`requireAuth` → `AuthError("Termos de uso pendentes de aceite.", 403)`); e2e `e2e/aceite-de-termos.spec.ts` caso 3 ("espelho REST devolve 403 antes do aceite e 200 depois, no MESMO token") passou contra Postgres real nesta verificação |
| 8 | Um SUPERADMIN nunca é gateado por termos, mesmo sem ter aceitado nada | ✓ VERIFIED | `lib/auth-guard.ts:167-170` — `termosPendentes = usuario.role !== UserRole.SUPERADMIN && ...`; `lib/auth-guard.test.ts` cobre o caso |
| 9 | Uma empresa bloqueada por falta de pagamento vai para a tela de bloqueio, não para a de termos (sem loop) | ✓ VERIFIED | `lib/session.ts` aplica o gate de bloqueio ANTES do gate de termos; `app/[slug]/admin/aceitar-termos/page.tsx` replica a mesma ordem; e2e caso 4 ("bloqueio tem precedência sobre termos, nas duas direções") passou |
| 10 | O usuário com termos pendentes vê o texto completo da versão vigente, aceita (gravando contra a versão vista) e volta ao painel; consegue deslogar sem ficar preso | ✓ VERIFIED | `app/[slug]/admin/aceitar-termos/page.tsx` + `actions.ts` (`aceitarTermos`, TOCTOU por igualdade contra `termoVigente()`); e2e casos 1 e 2 ("cai no gate, aceita e volta ao painel", "sai da conta pela tela de aceite sem entrar em loop") passaram contra Postgres real |
| 11 | Não existe caminho de servidor que crie uma conta sem gravar o aceite dos termos; aceite e conta nascem na mesma transação; TOCTOU e ausência de termo publicado são recusados de forma explícita | ✓ VERIFIED | `app/services/empresa.service.ts` (`registerComUsuario`, quarta escrita `tx.aceiteTermo.create` na mesma `$transaction`; guarda fail-closed 503 sem termo; guarda TOCTOU 409); `app/services/empresa.service.test.ts` e `app/registro/actions.test.ts` passaram |
| 12 | Quem se cadastra vê o texto completo dos termos sem sair da tela, marca um aceite obrigatório, e o formulário não submete com o checkbox desmarcado | ✓ VERIFIED | `app/registro/_components/register-form.tsx` — `<details>/<summary>` com o texto + checkbox `name="aceiteTermos" required` + `input type="hidden" name="termoId"`; `register-form.test.tsx` passou |
| 13 | Os 9 specs e2e pré-existentes continuam verdes com o checkbox obrigatório de termos no lugar | ✓ VERIFIED | Corrida completa `npx playwright test` nesta verificação: 28/28 testes passaram (24 pré-existentes + 4 novos de `aceite-de-termos.spec.ts`) |
| 14 | A suíte Vitest existente permanece 100% verde após a mudança de schema e de gates | ✓ VERIFIED | `npx vitest run` completo nesta verificação: 95 arquivos / 1019 testes passaram, 0 falhas |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | `UserRole.SUPERADMIN`, `model TermoDeUso`, `model AceiteTermo`, `Usuario.termoAceitoId` | ✓ VERIFIED | Todos presentes, com FKs `Restrict`/`SetNull` corretos |
| `prisma/migrations/20260902120000_add_superadmin_role/migration.sql` | `ALTER TYPE` isolado | ✓ VERIFIED | Migration isolada, sem DML |
| `prisma/migrations/20260902120100_add_termos_de_uso/migration.sql` | Tabelas + coluna denormalizada | ✓ VERIFIED | DDL completo, FKs corretas |
| `prisma/migrations/20260902120200_seed_termo_v1/migration.sql` | v1 semeada, idempotente | ✓ VERIFIED | `ON CONFLICT ("versao") DO NOTHING` |
| `tests/setup/prisma-mock.ts` | Stub neutro de termos | ✓ VERIFIED | `termoAceitoId` no stub default; suíte de 1019 testes verde |
| `lib/termo-vigente.ts` | `termoVigente()` deduplicado por `React.cache` | ✓ VERIFIED | `cache(async () => prisma.termoDeUso.findFirst(...))`, tipo `TermoVigente` exportado |
| `app/services/termo.service.ts` | `publicar` e `registrarAceite` | ✓ VERIFIED | Classe não exportada (divergência documentada do frontmatter do plano, decisão intencional), singleton `termoService` exportado |
| `app/api/termos/route.ts` | `POST` protegido por role fresca do banco | ✓ VERIFIED | Só exporta `POST`; role vem de `revalidarConta` |
| `scripts/seed-superadmin.ts` | Criação idempotente do SUPERADMIN | ✓ VERIFIED | Rodado ao vivo nesta verificação, confirmou idempotência |
| `lib/auth-guard.ts` | `termosPendentes` em `ContaAtiva` | ✓ VERIFIED | Predicado único, isenção SUPERADMIN, assimetria fail-open documentada |
| `lib/session.ts` | Redirect para `/aceitar-termos` | ✓ VERIFIED | Depois do gate de bloqueio, conforme D-08 |
| `lib/api-auth.ts` | `AuthError 403` na API | ✓ VERIFIED | `conta.termosPendentes` → 403 |
| `app/[slug]/admin/aceitar-termos/page.tsx` | Rota fora de `(protected)` | ✓ VERIFIED | Guarda simétrica própria com as 5 condições na ordem correta |
| `app/[slug]/admin/aceitar-termos/actions.ts` | Server Action autoautorizada | ✓ VERIFIED | `getVerifiedSession` + TOCTOU por igualdade |
| `app/services/empresa.service.ts` | Aceite na transação de registro | ✓ VERIFIED | Quarta escrita `tx.aceiteTermo.create` |
| `app/registro/actions.ts` | Validação server-side do checkbox | ✓ VERIFIED | `aceiteTermos !== "on"` recusado |
| `app/registro/_components/register-form.tsx` | Disclosure + checkbox obrigatório | ✓ VERIFIED | `<details>`, `required`, `termoId` hidden |
| `app/registro/page.tsx` | Estado degradado sem termo vigente | ✓ VERIFIED | Branch fail-closed com copy E4 |
| `scripts/gates-fase-06.mjs` | 5 gates estáticos executáveis | ✓ VERIFIED | Rodado ao vivo: 5/5 OK |
| `e2e/aceite-de-termos.spec.ts` | TERM-04 fim a fim | ✓ VERIFIED | Rodado ao vivo contra Postgres real: 4/4 casos passaram |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `prisma/schema.prisma` | `AceiteTermo.termo` | FK `onDelete: Restrict` | ✓ WIRED | Confirmado no schema e na migration SQL |
| `app/services/termo.service.ts` | `prisma.$transaction` | `registrarAceite` grava fato + bookkeeping juntos | ✓ WIRED | `tx.aceiteTermo.create` seguido de `tx.usuario.update` na mesma transação |
| `lib/termo-vigente.ts` | React `cache` | `import { cache } from "react"` | ✓ WIRED | Confirmado |
| `app/api/termos/route.ts` | `revalidarConta` | Autorização pela role lida do banco | ✓ WIRED | `conta.role !== UserRole.SUPERADMIN` |
| `app/api/termos/route.ts` | `termoService.publicar` | Chamada após autorização | ✓ WIRED | Confirmado |
| `lib/auth-guard.ts` | `lib/termo-vigente.ts` | Leitura da vigente dentro de `revalidarConta` | ✓ WIRED | `const vigente = await termoVigente();` |
| `lib/session.ts` | `conta.termosPendentes` | Redirect após gate de bloqueio | ✓ WIRED | Ordem confirmada por leitura direta do código |
| `lib/api-auth.ts` | `conta.termosPendentes` | `throw AuthError 403` | ✓ WIRED | Confirmado |
| `app/[slug]/admin/aceitar-termos/actions.ts` | `getVerifiedSession` | Autoautorização fora de `(protected)` | ✓ WIRED | Confirmado |
| `app/[slug]/admin/aceitar-termos/actions.ts` | `termoService.registrarAceite` | `usuarioId` de `session.sub` | ✓ WIRED | Confirmado |
| `app/services/empresa.service.ts` | `tx.aceiteTermo.create` | Quarta escrita da transação de registro | ✓ WIRED | Confirmado |
| `app/registro/actions.ts` | `empresaService.registerComUsuario` | `termoAceitoId` propagado | ✓ WIRED | Confirmado |
| `app/registro/page.tsx` | `termoVigente` | Leitura server component | ✓ WIRED | Confirmado |
| `app/registro/_components/register-form.tsx` | `app/registro/actions.ts` | Campos `aceiteTermos`/`termoId` | ✓ WIRED | Confirmado |
| `scripts/gates-fase-06.mjs` | `app/` e `lib/` | Varredura de linhas de código | ✓ WIRED | Rodado ao vivo, 5/5 OK |
| `e2e/aceite-de-termos.spec.ts` | `e2e/helpers.ts` | `seedSuperadmin()`/`publicarNovaVersaoDeTermos()` | ✓ WIRED | Rodado ao vivo contra Postgres real |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suíte Vitest completa permanece verde | `npx vitest run` | 95 arquivos / 1019 testes passaram, 0 falhas | ✓ PASS |
| Suíte Playwright e2e completa permanece verde | `npx playwright test` | 28/28 testes passaram (2.4min), incluindo os 4 novos de TERM-04 | ✓ PASS |
| Testes específicos da fase 6 (11 arquivos) | `npx vitest run lib/termo-vigente.test.ts app/services/termo.service.test.ts app/api/termos/route.test.ts lib/auth-guard.test.ts lib/session.test.ts lib/api-auth.test.ts app/[slug]/admin/aceitar-termos/page.test.ts app/[slug]/admin/aceitar-termos/actions.test.ts app/services/empresa.service.test.ts app/registro/actions.test.ts app/registro/_components/register-form.test.tsx` | 210/210 passaram | ✓ PASS |
| Script `seed:superadmin` funciona e é idempotente | `npx playwright test e2e/aceite-de-termos.spec.ts` (invoca o helper que roda o script) | `[seed:superadmin] já existe — nada foi criado.` (segunda execução não duplicou) | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/gates-fase-06.mjs` | `npm run gates:fase-06` (rodado diretamente via `node scripts/gates-fase-06.mjs`) | Exit 0 — `5/5 gates OK` (autorização nunca pela role do JWT; TermoDeUso imutável; role não gravável por HTTP; nenhuma paleta âmbar nos arquivos novos; nenhum pacote instalado na fase) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TERM-01 | 06-01, 06-06, 06-07, 06-08 | Tela de termos exibida no registro, aceite obrigatório para concluir cadastro | ✓ SATISFIED | `app/registro/_components/register-form.tsx` (checkbox+disclosure), `app/registro/actions.ts` (recusa server-side), `app/services/empresa.service.ts` (aceite atômico na transação de registro) |
| TERM-02 | 06-01, 06-02, 06-03, 06-08 | Novo papel `SUPERADMIN`, único autorizado a atualizar termos via endpoint | ✓ SATISFIED | Enum `SUPERADMIN`, `POST /api/termos` autorizado por role revalidada do banco, `scripts/seed-superadmin.ts`, Gate 1/Gate 3 confirmam ausência de autorização por JWT e de `role` gravável por HTTP |
| TERM-03 | 06-01, 06-02, 06-08 | Termos versionados de forma imutável; aceite registrado contra versão específica | ✓ SATISFIED | `TermoDeUso.versao Int @unique`, FK `Restrict` em `AceiteTermo.termoId`, ausência de `update`/`delete` em `termo.service.ts` confirmada por Gate 2 |
| TERM-04 | 06-04, 06-05, 06-08 | Gate obrigatório bloqueia uso do admin até aceite da versão vigente | ✓ SATISFIED | `ContaAtiva.termosPendentes`, gate em `requireAdminSession` (web) e `requireAuth` (REST), rota dedicada `/aceitar-termos` (decisão D-08, documentada em `06-CONTEXT.md`, substitui a palavra "modal" do texto do requisito por uma rota dedicada pelo mesmo motivo arquitetural já validado na Fase 4 — layout não é boundary de autorização) |

Nenhum requisito órfão: os 4 IDs de `TERM-01`..`TERM-04` em `REQUIREMENTS.md` aparecem no campo `requirements` de pelo menos um dos 8 planos da fase.

**Nota sobre bookkeeping:** as caixas de seleção de `TERM-01`..`TERM-04` em `.planning/REQUIREMENTS.md` (linhas 46-49) e a tabela de rastreabilidade (linhas 111-114) ainda mostram `[ ]`/"Pending" — consistente com o padrão das Fases 1-5, cuja atualização para `[x]`/"Complete" acontece no fechamento/ship da fase, não na verificação. Não tratado como gap.

### Anti-Patterns Found

Nenhum encontrado. Varredura de `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` nos 17 arquivos-chave da fase não produziu nenhuma ocorrência real (os únicos matches foram substrings de "TODO" dentro da palavra portuguesa "TODOS"). O texto `[TEXTO PROVISORIO - ...]` semeado pela migration `seed_termo_v1` é um placeholder de CONTEÚDO jurídico deliberado e documentado (ver Human Verification #1) — não um placeholder de código.

### Human Verification Required

#### 1. Publicação do texto jurídico real dos Termos de Uso

**Test:** Antes do deploy em produção, publicar o texto legal definitivo como uma NOVA versão via `POST /api/termos`, autenticado como `SUPERADMIN` (`npm run seed:superadmin` cria a conta).
**Expected:** A tela de aceite e o registro exibem o texto jurídico real, não o placeholder `[TEXTO PROVISORIO - ...]` semeado pela migration `seed_termo_v1`.
**Why human:** Conteúdo jurídico não é verificável por teste automatizado; consequência de pular é que todos os clientes aceitariam um placeholder sem valor jurídico.

#### 2. Ciência do operador sobre o gate retroativo

**Test:** Confirmar que o operador está ciente de que, após a migration, todos os `Usuario` existentes (com `termoAceitoId = NULL`) verão a tela de aceite obrigatória no próximo request autenticado.
**Expected:** Decisão registrada sobre se haverá aviso prévio aos clientes pagantes.
**Why human:** Decisão de produto/comunicação, sem ação de código associada.

#### 3. Ordem de deploy em produção

**Test:** Confirmar a sequência: (a) migration `add_superadmin_role`, (b) migration `add_termos_de_uso`, (c) migration `seed_termo_v1`, (d) deploy do código da aplicação, (e) `npm run seed:superadmin` em produção.
**Expected:** Migrations aplicadas antes do deploy do código que usa `UserRole.SUPERADMIN`.
**Why human:** Sequência de operações em ambiente de produção que não existe no repositório; a ordem errada (migration do enum depois do deploy) produz erro de runtime no Prisma.

### Gaps Summary

Nenhum gap de código encontrado. Todos os 14 truths derivados do goal da fase e dos `must_haves` dos 8 planos foram verificados diretamente contra o código-fonte (não apenas contra as SUMMARY.md), incluindo execução ao vivo nesta sessão de: `npx vitest run` completo (95 arquivos / 1019 testes), `npx playwright test` completo (28/28, incluindo os 4 casos novos de TERM-04 contra Postgres real), e `node scripts/gates-fase-06.mjs` (5/5 gates). Um teste do e2e novo (`espelho REST devolve 403...`) teve uma execução isolada marcada `flaky` num run anterior por timeout de primeira visita do Next dev (padrão já documentado no SUMMARY do plano 06-08); na corrida completa da suíte, o mesmo teste passou de primeira — não é um gap funcional.

O único motivo para o status `human_needed` é a existência de 3 verificações manuais de go-live, já identificadas e registradas pelos próprios planos em `06-VALIDATION.md § Manual-Only Verifications`, com status `⬜ pendente` no momento desta verificação. Nenhuma delas tem ação de código associada — são decisões e sequenciamento operacional de produção que o repositório não pode conter.

---

*Verified: 2026-09-02T14:48:20Z*
*Verifier: Claude (gsd-verifier)*
