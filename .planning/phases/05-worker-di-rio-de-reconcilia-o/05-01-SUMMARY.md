---
phase: 05-worker-di-rio-de-reconcilia-o
plan: 01
subsystem: database
tags: [prisma, postgres, migration, enum, pg_enum, billing, auditoria]

# Dependency graph
requires:
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    provides: enum `CausaTransicaoAcesso` com o comentario normativo D-14 (ponto de extensao) e `acessoService.registrarTransicao`
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    provides: precedente exato da migration enum-only (`20260831230000_add_asaas_webhook_ledger`) e o ledger `EventoWebhookAsaas`
provides:
  - "`CausaTransicaoAcesso.WORKER_DIARIO` aplicado no Postgres e exposto pelo Prisma Client — destrava a compilacao do plano 05-03"
  - "`prisma/checks/worker-diario-enum.sql`: gate SQL versionado que prova por catalogo do Postgres que o valor existe no banco alvo"
  - "Fim da promessa orfa de dreno da fila `processadoEm IS NULL` no schema e no teste do webhook (D-10)"
affects: [05-03 worker route handler, 05-05 gate da fase, fase futura de dreno da fila de webhooks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration enum-only sem DML que use o valor novo (Pitfall 7), com header normativo em ASCII"
    - "Gate SQL versionado em prisma/checks/ com bloco DO $$ + RAISE EXCEPTION, executado por prisma db execute"

key-files:
  created:
    - prisma/migrations/20260901195303_add_worker_diario_causa/migration.sql
    - prisma/checks/worker-diario-enum.sql
  modified:
    - prisma/schema.prisma
    - app/services/webhook-asaas.service.test.ts

key-decisions:
  - "WORKER_DIARIO entra como ULTIMO valor do enum: `ALTER TYPE ... ADD VALUE` sem BEFORE/AFTER acrescenta no fim, e divergir faria o schema descrever uma ordem que o banco nao tem"
  - "`prisma migrate dev` NAO regenerou o Prisma Client neste ambiente; o `prisma generate` explicito foi necessario e o passo virou obrigatorio no procedimento"
  - "As edicoes de prosa em .planning/STATE.md exigidas por D-10 nao foram aplicadas por este executor (modo worktree paralelo, STATE.md e artefato do orquestrador) — texto exato entregue abaixo para aplicacao pos-merge"

patterns-established:
  - "Gate de enum: consultar o catalogo do Postgres, nunca o arquivo de schema — ler o schema.prisma prova intencao, nao estado"
  - "Prova de nao-vacuidade de gate SQL por mutacao temporaria do literal + reversao, registrada no SUMMARY"

requirements-completed: [WRK-01]

# Metrics
duration: 9 min
completed: 2026-09-01
---

# Phase 5 Plan 01: Quinto valor do enum + limpeza da divida documental de D-10 Summary

**`CausaTransicaoAcesso.WORKER_DIARIO` aplicado no Postgres real e provado por consulta ao catalogo de enums, com gate SQL versionado (INV-05-01) e a promessa orfa de dreno da fila `processadoEm IS NULL` removida do schema e do teste do webhook**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-01T19:51:30Z
- **Completed:** 2026-09-01T20:00:19Z
- **Tasks:** 3
- **Files modified:** 4 (2 criados, 2 modificados)

## Accomplishments

- O enum `CausaTransicaoAcesso` ganhou o quinto valor `WORKER_DIARIO` no schema, em migration propria enum-only (nenhum DML que use o valor na mesma transacao — Pitfall 7 da Fase 3), aplicada com sucesso contra o Postgres `gestor_estoque` local.
- `prisma/checks/worker-diario-enum.sql` existe como gate de regressao executavel: consulta `pg_enum`/`pg_type` e faz `RAISE EXCEPTION 'INV-05-01 falhou: ...'` quando o valor nao existe no banco alvo. Nao-vacuidade comprovada por mutacao temporaria do literal.
- O Prisma Client regenerado expoe `CausaTransicaoAcesso.WORKER_DIARIO` — o plano 05-03 compila.
- D-10 cumprido nos dois lugares de codigo: nem `prisma/schema.prisma` nem `app/services/webhook-asaas.service.test.ts` continuam atribuindo a drenagem da fila `processadoEm IS NULL` a Fase 5. Nenhuma assercao de teste foi tocada (90/90 no arquivo, identico ao pre-edicao).

## Task Commits

1. **Task 1: Quinto valor do enum + migration propria + gate SQL de regressao** — `64f514c` (feat)
2. **Task 2: [BLOCKING] Aplicar a migration e regenerar o Prisma Client** — sem commit: a task nao produziu diff versionado (o plano previa edicao do `migration.sql` apenas se a comparacao com o precedente da Fase 3 exigisse, e nao exigiu). Efeitos: migration aplicada no banco, `.prisma/client` regenerado (nao versionado).
3. **Task 3: D-10 — apagar a promessa orfa de dreno da fila de webhooks** — `501833e` (docs)

## Files Created/Modified

- `prisma/schema.prisma` — quinto valor do enum + frase normativa de D-14 sobre a Fase 5; comentario de `EventoWebhookAsaas` reescrito para negar o dreno
- `prisma/migrations/20260901195303_add_worker_diario_causa/migration.sql` — `ALTER TYPE "CausaTransicaoAcesso" ADD VALUE 'WORKER_DIARIO';` sob header normativo ASCII replicando o precedente da Fase 3
- `prisma/checks/worker-diario-enum.sql` — gate INV-05-01 (bloco `DO $$` consultando o catalogo de enums do Postgres)
- `app/services/webhook-asaas.service.test.ts` — quatro comentarios reescritos (linhas ~240, ~662, ~1139, ~1159); zero mudanca de codigo ou assercao

## Verification Results

Saida real de cada comando, na ordem exigida pela Task 2:

| # | Comando | Resultado |
|---|---------|-----------|
| 1 | `npx prisma migrate dev` | `Applying migration 20260901195303_add_worker_diario_causa` → `Your database is now in sync with your schema.` |
| 2 | `npx prisma db execute --file prisma/checks/worker-diario-enum.sql` | `Script executed successfully.` — **exit 0** |
| 3 | `node -e "... CausaTransicaoAcesso.WORKER_DIARIO ..."` | `client ok` — **exit 0** (apos o `prisma generate` explicito; ver Deviations) |
| 4 | `npx prisma migrate status` | `10 migrations found` / `Database schema is up to date!` — nenhuma pendente |
| 5a | `npx tsc --noEmit` | **exit 0** |
| 5b | `npm test` | `Test Files 86 passed (86)` / `Tests 876 passed (876)` — **exit 0**, sem regressao |
| — | `npx vitest run app/services/webhook-asaas.service.test.ts` | `90 passed (90)` antes e depois da edicao de Task 3 — contagem identica |
| — | `npx prisma validate` | `The schema at prisma/schema.prisma is valid` |
| — | `npm run gates:fase-04` | `Resultado: 6/6 gates OK` |

**Prova de nao-vacuidade do gate SQL (exigida pelo acceptance criteria da Task 2):** com o literal `'WORKER_DIARIO'` temporariamente trocado por `'WORKER_DIARIO_INEXISTENTE'` em `prisma/checks/worker-diario-enum.sql`, o comando saiu com **exit 1** e a mensagem exata:

```
Error: ERROR: INV-05-01 falhou: WORKER_DIARIO ausente do enum CausaTransicaoAcesso
```

O literal foi revertido em seguida; `git status --short` ficou limpo e a re-execucao voltou a sair 0.

## Decisions Made

- **`WORKER_DIARIO` como ultimo valor do enum.** `ALTER TYPE ... ADD VALUE` sem `BEFORE`/`AFTER` acrescenta no fim; qualquer outra posicao no `schema.prisma` faria o arquivo descrever uma ordem que o Postgres nao tem.
- **Migration gerada pelo Prisma (`--create-only`), nunca escrita a mao.** O timestamp `20260901195303` e o do Prisma, garantindo ordenacao correta apos `20260831230000_add_asaas_webhook_ledger`.
- **Task 2 nao gerou commit.** Nao houve diff versionado; a migration aplicou sem o erro `ALTER TYPE ... ADD cannot run inside a transaction block` (risco A2 do Assumptions Log **nao** se materializou neste Postgres), entao a comparacao com o precedente da Fase 3 nao foi necessaria para corrigir nada.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `prisma migrate dev` nao regenerou o Prisma Client; `prisma generate` explicito foi necessario**
- **Found during:** Task 2 (passo 3 da sequencia)
- **Issue:** O plano e o `05-RESEARCH.md` §Runtime State Inventory afirmam que `npx prisma migrate dev` "ja roda o generate". Neste ambiente nao rodou: apos a migration aplicada com sucesso, `CausaTransicaoAcesso` ainda expunha apenas os quatro valores antigos (`{"REGISTRO","BACKFILL","AVALIACAO_SESSAO","WEBHOOK_PAGAMENTO"}`) e o passo 3 saiu com exit 1. Sem o generate, o `tsc` do plano 05-03 falharia — que e exatamente o motivo de a Task 2 ser [BLOCKING].
- **Fix:** `npx prisma generate` executado explicitamente (`✔ Generated Prisma Client (v7.9.1)`).
- **Files modified:** nenhum arquivo versionado (`node_modules/@prisma/client`, nao versionado)
- **Verification:** `node -e "... WORKER_DIARIO ..."` passou a imprimir `client ok` com exit 0
- **Committed in:** n/a (sem diff versionado)
- **Consequencia para os planos seguintes:** `prisma generate` deve ser tratado como passo proprio depois de `migrate dev`, nao como efeito colateral dele.

**2. [Rule 3 - Blocking] Ambiente do worktree sem `node_modules` e sem `.env`**
- **Found during:** Task 1 (antes de `prisma migrate dev --create-only`)
- **Issue:** O worktree criado para execucao paralela nao contem `node_modules` nem `.env` (ambos gitignored), entao nenhum comando `npx prisma` / `npm test` / `tsc` podia rodar.
- **Fix:** Symlinks para o `node_modules` e o `.env` do repositorio principal, na raiz do worktree. **Nenhum pacote foi instalado** (a proibicao de `npm install` da Rule 3 foi respeitada; `gates:fase-04` Gate 6 continua 11 deps / 20 devDeps).
- **Files modified:** nenhum arquivo versionado — ambos os symlinks caem nas regras `/node_modules` e `.env*` do `.gitignore`, confirmado por `git status --short` limpo
- **Verification:** `git status --short` nao lista os symlinks; a suite completa roda
- **Committed in:** n/a

**3. [Rule 3 - Blocking] `tsc --noEmit` falhava com `Cannot find name 'LayoutProps'`**
- **Found during:** Task 2 (passo 5)
- **Issue:** `app/layout.tsx(20,50): error TS2304`. `LayoutProps` e um tipo global gerado pelo Next 16 em `.next/types/**`, incluido pelo `tsconfig.json`; o worktree nunca rodou build/dev, entao o diretorio nao existia. Falha de ambiente, sem relacao com o enum.
- **Fix:** `npx next typegen` (`✓ Types generated successfully`). O `.next/` gerado e gitignored.
- **Files modified:** nenhum arquivo versionado
- **Verification:** `npx tsc --noEmit` exit 0
- **Committed in:** n/a

**4. [Rule 3 - Blocking] Acceptance criteria de grep colidiam com a redacao escolhida (duas correcoes de texto)**
- **Found during:** Tasks 1 e 3, na propria verificacao dos criterios
- **Issue:** (a) `grep -c "pg_enum" prisma/checks/worker-diario-enum.sql` retornava 2 porque o comentario de cabecalho citava `pg_enum` literalmente, e o criterio exige 1. (b) `grep -c "processadoEm IS NULL" prisma/schema.prisma` retornava 0 porque a reescrita do comentario de `EventoWebhookAsaas` quebrou a frase entre duas linhas, e o criterio exige 1.
- **Fix:** (a) o cabecalho passou a dizer "le o catalogo de enums do Postgres", deixando `pg_enum` apenas na consulta. (b) a frase foi reescrita como "o conjunto de eventos com processadoEm IS NULL" numa unica linha, sem aspas internas.
- **Files modified:** `prisma/checks/worker-diario-enum.sql`, `prisma/schema.prisma`
- **Verification:** ambos os greps passaram a retornar 1; `npx prisma validate` e o gate SQL continuam verdes
- **Committed in:** `64f514c` e `501833e`

### Deviacao de escopo (nao auto-fix)

**5. [Modo worktree] Parte (3) da Task 3 — as edicoes em `.planning/STATE.md` — NAO foi aplicada**
- **Motivo:** este executor roda como agente paralelo em worktree; a diretiva do orquestrador e explicita ("Do NOT update STATE.md or ROADMAP.md — the orchestrator owns those writes after all worktree agents in the wave complete"). Os cinco planos da Fase 5 (`05-01` a `05-05`) referenciam `STATE.md`, entao editar o arquivo aqui produziria conflito de merge entre worktrees irmaos.
- **Efeito:** os dois acceptance criteria de Task 3 que dependem de `STATE.md` (`grep -c "sem dreno\|SEM dreno" .planning/STATE.md >= 1` e a reescrita da linha 164) **nao passam ainda**. Os outros seis criterios de Task 3 passam.
- **Handoff — texto exato a aplicar pos-merge:**

  (a) Substituir a linha da decisao `[03-07]` (STATE.md § Accumulated Context → Decisions, linha 164) por:

  > `- [Phase 03]: [03-07] Reenvio pelo painel do Asaas NAO reprocessa evento ja registrado (colide no @unique do ledger) — e a recuperacao NAO e do botao nem do worker da Fase 5: D-06 escopou o worker para reavaliar apenas os fatos de billing locais, sem chamar o Asaas. A fila processadoEm IS NULL segue sem dono`

  (b) Acrescentar em STATE.md § Blockers/Concerns:

  > `- Fila de retrabalho `EventoWebhookAsaas WHERE processadoEm IS NULL` segue SEM dreno depois da Fase 5 (D-06/D-10): um cliente que pagou e cujo webhook falhou permanece bloqueado ate intervencao manual. Candidata a fase futura — exige `webhookAsaasService.processar`, que re-busca no Asaas.`

- **Nota:** `.planning/REQUIREMENTS.md` tampouco foi mutado (mesmo motivo — artefato compartilhado pelos cinco planos da onda). `requirements-completed: [WRK-01]` no frontmatter acima e a fonte para o orquestrador reconciliar; note que WRK-01 so fica materialmente completo quando o plano 05-03 entregar o endpoint que grava a causa.

---

**Total deviations:** 4 auto-fixed (4 de Rule 3 — bloqueios de ambiente e de criterio de verificacao) + 1 desvio de escopo deliberado por diretiva do orquestrador.
**Impact on plan:** Nenhum scope creep. Tres dos quatro auto-fixes sao de ambiente (worktree sem deps/env/tipos do Next) e nao tocam codigo versionado; o quarto so ajustou a redacao de comentarios para satisfazer os greps que o proprio plano especificou. O unico item do plano nao entregue e a parte (3) da Task 3, com o texto pronto acima.

## Issues Encountered

- **Risco A2 do Assumptions Log nao se materializou:** `ALTER TYPE ... ADD VALUE` rodou dentro da transacao do `prisma migrate` sem o erro `cannot run inside a transaction block`. A comparacao com `20260831230000_add_asaas_webhook_ledger` (a contingencia prevista pelo plano) nao foi necessaria. O risco continua valendo para o banco de **producao**, cuja versao de Postgres nao foi verificada.
- Nenhuma outra: nenhum teste existente dependia de o enum ter exatamente quatro valores (nenhuma assercao exaustiva a corrigir).

## Known Stubs

Nenhum. Este plano nao cria codigo de aplicacao — apenas DDL, um gate SQL e prosa.

## Threat Flags

Nenhuma superficie nova. A unica fronteira atravessada e repositorio → Postgres (DDL), ja no `<threat_model>` do plano. T-05-11 (migration enum-only, sem DML) e T-05-13 (gate por catalogo do Postgres) foram mitigadas e verificadas; T-05-SC continua satisfeita (nenhum pacote instalado, Gate 6 6/6).

## User Setup Required

Nenhuma configuracao de servico externo. **Nota operacional de deploy:** `npx prisma migrate deploy` precisa rodar contra o banco de producao antes de qualquer deploy do plano 05-03, e `prisma/checks/worker-diario-enum.sql` e o comando que prova que rodou.

## Next Phase Readiness

- **Destravado:** o plano 05-03 pode referenciar `CausaTransicaoAcesso.WORKER_DIARIO` — o valor existe no banco e no Prisma Client gerado.
- **Gate disponivel para 05-05:** `npx prisma db execute --file prisma/checks/worker-diario-enum.sql`.
- **Pendencia do orquestrador:** aplicar as duas edicoes de `STATE.md` transcritas acima (deviacao 5) — sem elas, a fila `processadoEm IS NULL` volta a nao ter registro de debito em lugar nenhum.
- **Lembrete para quem executar 05-03:** rodar `npx prisma generate` como passo proprio; `migrate dev` nao o fez neste ambiente.

---
*Phase: 05-worker-di-rio-de-reconcilia-o*
*Completed: 2026-09-01*

## Self-Check: PASSED

- `prisma/migrations/20260901195303_add_worker_diario_causa/migration.sql` — FOUND
- `prisma/checks/worker-diario-enum.sql` — FOUND
- `prisma/schema.prisma` — FOUND (modificado)
- `app/services/webhook-asaas.service.test.ts` — FOUND (modificado)
- commit `64f514c` — FOUND
- commit `501833e` — FOUND
