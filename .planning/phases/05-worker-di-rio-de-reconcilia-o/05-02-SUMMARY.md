---
phase: 05-worker-di-rio-de-reconcilia-o
plan: 02
subsystem: billing/worker
tags: [worker, reconciliacao, freio-de-seguranca, cron-secret, funcao-pura]

requires:
  - "lib/avaliar-acesso.ts — avaliarAcesso(fatos, agora) e acessoBloqueado(status) (Fase 2)"
  - "lib/fuso-sao-paulo.ts — meiaNoiteEmSaoPaulo (usado só nas fixtures)"
  - "app/services/acesso.service.ts — o shape do params de registrarTransicao (contrato, não import)"
provides:
  - "cronSecret() — accessor fail-closed de CRON_SECRET"
  - "planejarReconciliacao(empresas, agora) — passada 1 pura + decisão de lote"
  - "perdeAcesso(t) — predicado de perda NOVA de acesso (D-02)"
  - "LIMIAR_DE_BLOQUEIO_EM_MASSA (0.2) e PISO_DE_BLOQUEIO_EM_MASSA (5)"
  - "EmpresaAvaliavel, Transicao, PlanoDeReconciliacao, StatusAcesso (tipos)"
affects:
  - "app/api/cron/reconciliacao-diaria/route.ts (plano 05-03) — único consumidor previsto"
  - "gate de grep de ultimoStatusAuditado (plano 05-05) — precisa da nova entrada na allowlist"

tech-stack:
  added: []
  patterns:
    - "Função pura em app/services/ com exports nomeados (não singleton) — precedente [02-03]"
    - "Accessor de segredo fail-closed no idioma de lib/billing/asaas/config.ts"
    - "Tipo de status derivado do retorno do motor (ResultadoAcesso[\"status\"]) em vez de importado do client do banco"

key-files:
  created:
    - lib/billing/cron-config.ts
    - lib/billing/cron-config.test.ts
    - app/services/reconciliacao.service.ts
    - app/services/reconciliacao.service.test.ts
  modified: []

key-decisions:
  - "StatusAcesso é derivado de ResultadoAcesso[\"status\"], não importado de @prisma/client: satisfaz o gate de pureza (zero 'prisma' em linhas de código) e deixa o motor de acesso, não a persistência, mandando no conjunto de status"
  - "05-USER-SETUP.md NÃO foi criado neste worktree: os 5 planos da fase declaram o mesmo user_setup e escrevem o mesmo arquivo de fase — criá-lo em paralelo garante conflito de merge. O conteúdo necessário está registrado aqui em §User Setup"
  - "REQUIREMENTS.md não foi tocado: WRK-01/WRK-02 só ficam verdadeiros quando o endpoint do plano 05-03 costurar estas peças; marcar agora seria falso e conflitaria entre worktrees"
  - "A ordem RED→GREEN da reconciliação é invertida em relação ao ciclo clássico porque o plano aloca o arquivo de teste à Task 3; a não-vacuidade foi provada por injeção de mutação em vez de por RED-first"

requirements-completed: [WRK-01, WRK-02]

metrics:
  duration: "10 min"
  completed: "2026-09-01"
  tasks: 3
  files: 4
  commits: 4
  tests-added: 20
---

# Phase 5 Plan 02: Peças Puras do Worker Diário Summary

Accessor fail-closed de `CRON_SECRET` mais a passada 1 pura do worker —
`planejarReconciliacao(empresas, agora)` decide todas as transições e o freio
composto (>20% **E** ≥5 perdas) sem tocar em banco, provado com 100 empresas
sintéticas e zero mocks de Prisma.

## What Was Built

**`lib/billing/cron-config.ts`** — `cronSecret()` sobre uma cópia local da helper
`obrigatorio` de `lib/billing/asaas/config.ts`. `undefined` e `""` lançam
`Error` com prefixo `[cron]`; nenhuma coalescência para string vazia. A cópia é
deliberada e está justificada no cabeçalho: `CRON_SECRET` não é credencial do
gateway, e importar de `lib/billing/asaas/config.ts` arrastaria o worker para
dentro do módulo de env vars do Asaas, que D-06 proíbe.

**`app/services/reconciliacao.service.ts`** — função pura, exports nomeados
(não singleton), que percorre o lote chamando `avaliarAcesso` **uma única vez
por empresa**, aplica em memória a guarda D-16 (`status !== ultimoStatusAuditado`),
classifica as perdas novas com `perdeAcesso`, decide o freio composto e devolve
`{ avaliadas, transicoes, perigosas, aplicaveis, freio }`.

**Os dois arquivos de teste** — 20 testes no total (4 + 16), nenhum com mock de
banco e nenhum com data literal.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Teste falhando de `cronSecret()` | `ca67b4b` | `lib/billing/cron-config.test.ts` |
| 1 (GREEN) | `cronSecret()` fail-closed | `d8a0c44` | `lib/billing/cron-config.ts` |
| 2 | `planejarReconciliacao` + freio composto | `d06d989` | `app/services/reconciliacao.service.ts` |
| 3 | Testes do freio (D-01/D-02/D-03) | `217fb3b` | `app/services/reconciliacao.service.test.ts` |

## Prova de Não-Vacuidade (exigida pelo acceptance criteria da Task 3)

Ambas as injeções foram aplicadas, medidas e **revertidas antes do commit**
(`git diff --stat` vazio contra o commit da Task 2 confirma a reversão):

| Injeção | Efeito medido | Testes que falharam |
|---------|---------------|---------------------|
| `proporcao > LIMIAR` → `proporcao >= LIMIAR` | 1 failed / 15 passed | `100 empresas / 20 perdas: NÃO arma` |
| `PISO_DE_BLOQUEIO_EM_MASSA = 5` → `= 1` | 2 failed / 14 passed | `4 empresas / 1 perda: NÃO arma` e `20 empresas / 5 perdas: ARMA` |

O par acima/abaixo do limiar (100/20 vs 100/21) e o par acima/abaixo do piso
(4/1 vs 20/5) existem justamente para que um freio que arma sempre — ou que
nunca arma — não passe verde.

## Verification Results

| Comando | Resultado |
|---------|-----------|
| `npx vitest run lib/billing/cron-config.test.ts` | 4 passed |
| `npx vitest run app/services/reconciliacao.service.test.ts` | 16 passed |
| `npm test` | **896 passed / 88 files** (baseline 876 + 20 novos) |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (1 warning pré-existente, `Link` em `app/registro/page.tsx`, decisão `[01-04]`) |

Gates de grep de pureza (linhas de código, comentários descartados):

| Gate | Esperado | Obtido |
|------|----------|--------|
| `avaliarAcesso(` em `reconciliacao.service.ts` | 1 | 1 |
| `prisma\|$transaction\|await` | 0 | 0 |
| `new Date()` | 0 | 0 |
| `registrarTransicao` | 0 | 0 |
| `process.env` em `cron-config.ts` | 1 | 1 |
| `?? ""` em `cron-config.ts` | 0 | 0 |
| `asaas` em `cron-config.ts` | 0 | 0 |
| datas literais no teste | 0 | 0 |
| `prismaMock` no teste | 0 | 0 |

## Deviations from Plan

### 1. [Rule 3 - Blocker] `npx tsc --noEmit` falhava por artefato de build ausente no worktree

- **Found during:** Task 1, na verificação do acceptance criteria
- **Issue:** `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`.
  O tipo global `LayoutProps` é gerado pelo Next em `.next/types/`, que o
  `tsconfig.json` inclui mas que não existe num worktree recém-criado (é
  artefato de build, gitignorado). Nada a ver com o código deste plano.
- **Fix:** `npx next typegen` (comando oficial do Next 16 para gerar só os tipos
  de rota). `tsc --noEmit` passou a sair 0.
- **Files modified:** nenhum arquivo versionado — a saída vai para `.next/`, que
  é gitignorado.
- **Commit:** n/a (sem mudança versionada)

### 2. [Rule 3 - Blocker] `05-USER-SETUP.md` não criado, para não conflitar entre worktrees

- **Found during:** passo `generate_user_setup`, após as três tasks
- **Issue:** o plano tem bloco `user_setup`, mas **os 5 planos da fase 05 têm o
  mesmo bloco** e todos apontam para o mesmo arquivo de fase
  `05-USER-SETUP.md`. Os planos da wave 1 rodam em worktrees paralelos; criar o
  arquivo aqui produziria um add/add conflict garantido no merge.
- **Fix:** não criar o arquivo; registrar o conteúdo em §User Setup abaixo, para
  o orquestrador (ou o último plano da fase) consolidar sem perda de informação.
- **Files modified:** nenhum
- **Commit:** n/a

### 3. [Desvio de forma - Task 2] Ordem RED/GREEN invertida para a reconciliação

- **Found during:** Task 2
- **Issue:** a Task 2 é marcada `tdd="true"`, mas o arquivo de teste dela é o
  entregável da **Task 3**, e cada task tem commit próprio. Escrever o teste
  antes quebraria a granularidade de commit que o plano define.
- **Fix:** seguida a decomposição do plano (implementação na Task 2, testes na
  Task 3) e a não-vacuidade provada por **injeção de mutação** — garantia mais
  forte que o RED-first, porque prova que cada asserção detecta a regressão
  específica que ela existe para pegar. A Task 1 seguiu RED→GREEN clássico
  (dois commits, `ca67b4b` e `d8a0c44`).
- **Files modified:** n/a
- **Commit:** `d06d989`, `217fb3b`

**Total deviations:** 3 (2 blockers de ambiente/paralelismo auto-resolvidos, 1
desvio de forma documentado). **Impact:** nenhum sobre o comportamento
entregue — todos os `<behavior>`, `<verify>` e `<acceptance_criteria>` das três
tasks passam.

## Decisões técnicas registradas

**`StatusAcesso` derivado, não importado.** O acceptance criteria da Task 2 exige
`grep -c "prisma"` = 0 nas linhas de código. Um `import { StatusAcesso } from
"@prisma/client"` violaria isso pelo caminho do módulo. Em vez de enfraquecer o
gate, o tipo passou a ser
`export type StatusAcesso = ResultadoAcesso["status"]` — o mesmo tipo, tomado do
contrato de `avaliarAcesso`. O efeito colateral é positivo e vale registrar:
quem define o conjunto de status para este módulo é o **motor de acesso**, não a
camada de persistência, o que é exatamente a direção de dependência que BILL-01
quer. Os testes seguem importando o enum de `@prisma/client` normalmente (não há
gate sobre eles).

**A fixture `carencia` usa `meiaNoiteEmSaoPaulo(agora, 0)`** — a meia-noite do
dia local corrente, que é sempre passado. Copiada literalmente de
`scripts/seed-fatos-billing.ts`, inclusive o raciocínio do limite superior
exclusivo.

## User Setup (para consolidação em `05-USER-SETUP.md`)

| Env var | Onde | Como obter |
|---------|------|------------|
| `CRON_SECRET` | `.env` local, env do job e2e em `.github/workflows/tests.yml`, painel do host no deploy | `openssl rand -hex 32`. **Não vem de painel nenhum** — é gerado por nós |

Notas:
- A Vercel lê a env var `CRON_SECRET` e preenche automaticamente o header
  `Authorization: Bearer <valor>` das requisições de cron. Num VPS o equivalente
  é `curl -H "Authorization: Bearer $CRON_SECRET"`.
- Com a variável ausente, `cronSecret()` lança e o endpoint devolve 500 — nunca
  200. Isso é intencional (fail-closed, T-05-03).
- A escolha do host segue adiada por D-07; nada aqui depende dela.

## Known Stubs

Nenhum. Os quatro artefatos estão completos e exercitados por teste. O que falta
para o worker existir de ponta a ponta — o route handler que lê o banco, aplica
`aplicaveis` e responde — é escopo declarado do plano **05-03**, não um stub
deste plano.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano. `cronSecret()` é a
única travessia de boundary (env → aplicação) e está mitigada por T-05-03;
`planejarReconciliacao` não cruza boundary nenhum.

## Issues Encountered

Nenhum bloqueio. Os dois blockers de ambiente/paralelismo estão em §Deviations.

## Pendências deixadas para os próximos planos

1. **Gate de grep de `ultimoStatusAuditado`:** `app/services/reconciliacao.service.ts`
   lê o campo e ainda **não** está na allowlist da Fase 2. Enquanto o plano 05-05
   não o adicionar, `npm run gates:fase-04` acusa violação. Não é regressão de
   comportamento — é o gate fazendo o trabalho dele.
2. **`REQUIREMENTS.md` intacto:** WRK-01/WRK-02 só ficam verdadeiros com o
   endpoint do 05-03. A marcação cabe ao orquestrador após a wave.
3. **`05-USER-SETUP.md`** a consolidar (conteúdo em §User Setup).

## Next

Plano **05-03** costura as duas peças: `GET /api/cron/reconciliacao-diaria` com
o gate `Bearer` sobre `cronSecret()`, `findMany` com `where: { deletedAt: null }`,
`planejarReconciliacao` sobre o resultado e escrita de `aplicaveis` via
`acessoService.registrarTransicao` com `causa: WORKER_DIARIO`.

## Self-Check: PASSED

- `lib/billing/cron-config.ts` — FOUND
- `lib/billing/cron-config.test.ts` — FOUND
- `app/services/reconciliacao.service.ts` — FOUND
- `app/services/reconciliacao.service.test.ts` — FOUND
- `ca67b4b`, `d8a0c44`, `d06d989`, `217fb3b` — todos presentes em `git log`
- Injeções de mutação revertidas: `git diff --stat` vazio antes do commit da Task 3
