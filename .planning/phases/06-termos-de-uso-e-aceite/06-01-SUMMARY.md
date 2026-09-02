---
phase: 06-termos-de-uso-e-aceite
plan: 01
subsystem: database
tags: [prisma, postgres, migrations, enum, vitest, prisma-mock, termos-de-uso]

# Dependency graph
requires:
  - phase: 05-worker-diario-de-reconciliacao
    provides: "schema estavel com fatos de billing, precedente de coluna denormalizada (Empresa.ultimoStatusAuditado) e precedente de migration isolada de enum (add_worker_diario_causa)"
provides:
  - "Valor de enum UserRole.SUPERADMIN, disponivel no Prisma Client"
  - "model TermoDeUso (global, sem empresaId) com versao Int @unique e publicadoPor SetNull"
  - "model AceiteTermo append-only com onDelete Restrict no termo e @@unique([usuarioId, termoId])"
  - "Coluna denormalizada Usuario.termoAceitoId (bookkeeping do gate de TERM-04)"
  - "Tres migrations versionadas aplicadas: add_superadmin_role, add_termos_de_uso, seed_termo_v1"
  - "v1 dos termos semeada por migration — /registro funciona em banco limpo, inclusive na CI"
  - "Stub default NEUTRO de termos em tests/setup/prisma-mock.ts (item de Wave 0)"
affects: [06-02, 06-03, 06-04, 06-05, 06-06, 06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Constraint de banco no lugar de regra em codigo: imutabilidade (FK Restrict), unicidade de versao (@unique) e idempotencia do aceite (@@unique composto)"
    - "Migration de enum SEMPRE isolada de qualquer DML que use o valor novo (Pitfall 1)"
    - "Seed de dado obrigatorio de bootstrap por migration idempotente (ON CONFLICT DO NOTHING), nao por script — a CI so roda migrate deploy"
    - "Coluna denormalizada como bookkeeping de leitura, com escritor unico dentro da transacao do fato"

key-files:
  created:
    - prisma/migrations/20260902120000_add_superadmin_role/migration.sql
    - prisma/migrations/20260902120100_add_termos_de_uso/migration.sql
    - prisma/migrations/20260902120200_seed_termo_v1/migration.sql
  modified:
    - prisma/schema.prisma
    - tests/setup/prisma-mock.ts

key-decisions:
  - "TermoDeUso e AceiteTermo nascem SEM empresaId: sao da plataforma, nao de um tenant (D-06); segunda excecao ao isolamento por tenant do C-07"
  - "A imutabilidade de TERM-03 e imposta pela FK onDelete: Restrict no Postgres, provada por probe de DELETE recusado, nao por checagem em service"
  - "Usuario.termoAceitoId PODE ser lido para decidir acesso (e o fato), ao contrario de Empresa.ultimoStatusAuditado (e uma derivacao) — a divergencia esta escrita no schema"
  - "A v1 dos termos e semeada por migration idempotente, resolvendo D-12; o texto real nasce como v2 por INSERT via POST /api/termos, nunca por UPDATE da v1"
  - "O stub global de termos usa a combinacao 'existe vigente E ja aceito' em vez de 'nao ha termo publicado', para que cada teste autenticado exercite a comparacao do gate"
  - "TermoDeUso ganhou a relacao inversa ultimoAceitePor Usuario[] @relation(\"UltimoAceite\"), ausente do schema do RESEARCH — o Prisma exige os dois lados de uma relacao nomeada"

patterns-established:
  - "Comentario normativo `///` no schema explicando por que a constraint existe e o que ela impede, na densidade de app/services/acesso.service.ts"
  - "Cabecalho em comentario SQL em cada migration registrando o pitfall que ela evita, no molde de 20260901195303_add_worker_diario_causa"
  - "Stub default do beforeEach global carrega a combinacao NEUTRA de cada novo fato de dominio, evitando regressao em massa quando o gate correspondente entrar"

requirements-completed: [TERM-01, TERM-02, TERM-03]

# Metrics
duration: 80min
completed: 2026-09-02
---

# Phase 6 Plan 01: Fundacao de Dados dos Termos de Uso Summary

**Schema, migrations e Prisma Client com `TermoDeUso` imutavel por FK `Restrict`, `AceiteTermo` append-only e idempotente por unique composto, `UserRole.SUPERADMIN` em migration isolada, v1 dos termos semeada por migration idempotente, e o stub global do Vitest ja neutro para o gate da Fase 6.**

## Performance

- **Duration:** ~80 min
- **Started:** 2026-09-02T11:35:00Z
- **Completed:** 2026-09-02T12:55:49Z
- **Tasks:** 3
- **Files modified:** 5 (3 criados, 2 modificados)

## Accomplishments

- `prisma/schema.prisma` ganhou `UserRole.SUPERADMIN`, os modelos `TermoDeUso` e `AceiteTermo`, e a coluna `Usuario.termoAceitoId` — todos com JSDoc `///` normativo explicando qual constraint impede o que, incluindo a divergencia de regra em relacao a `Empresa.ultimoStatusAuditado`.
- Tres migrations versionadas aplicadas no banco de dev, com o `ALTER TYPE` do enum deliberadamente isolado de qualquer DML (Pitfall 1) e a v1 dos termos semeada de forma idempotente para que `/registro` e os 9 specs e2e continuem funcionando num banco limpo sem passo de seed na CI (D-12 resolvido).
- Prisma Client regenerado: `prisma.termoDeUso`, `prisma.aceiteTermo` e `UserRole.SUPERADMIN` existem, com `npx tsc --noEmit` limpo.
- Item obrigatorio de Wave 0 fechado: o `beforeEach` global de `tests/setup/prisma-mock.ts` entrega a combinacao NEUTRA de termos, e os 916 testes existentes seguem verdes sem que um unico arquivo de teste tenha sido editado.

## Task Commits

1. **Task 1: Modelar TermoDeUso, AceiteTermo, UserRole.SUPERADMIN e Usuario.termoAceitoId** - `c662f2d` (feat)
2. **Task 2: [BLOCKING] Tres migrations versionadas + regeneracao do Prisma Client** - `5fae81b` (feat)
3. **Task 3: Stub default neutro de termos no prisma-mock global** - `ef9f90d` (test)

## Files Created/Modified

- `prisma/schema.prisma` - `UserRole.SUPERADMIN`; `model TermoDeUso` (global, `versao Int @unique`, `conteudo` texto puro, `publicadoPor` com `SetNull`); `model AceiteTermo` (append-only, `termo` com `onDelete: Restrict`, `@@unique([usuarioId, termoId])`); `Usuario.termoAceitoId` + relacoes `UltimoAceite` / `TermosPublicados`.
- `prisma/migrations/20260902120000_add_superadmin_role/migration.sql` - `ALTER TYPE "UserRole" ADD VALUE 'SUPERADMIN'` e nada mais; cabecalho documentando por que nenhum DML pode acompanha-lo.
- `prisma/migrations/20260902120100_add_termos_de_uso/migration.sql` - as duas tabelas, a coluna nova, os dois indices unicos, os dois indices de leitura e as quatro FKs; `AceiteTermo_termoId_fkey` saiu com `ON DELETE RESTRICT` e `Usuario_termoAceitoId_fkey` com `ON DELETE SET NULL`, conforme conferido no arquivo gerado.
- `prisma/migrations/20260902120200_seed_termo_v1/migration.sql` - `INSERT` unico da v1 com `ON CONFLICT ("versao") DO NOTHING` e texto de bootstrap em portugues iniciado pela linha `[TEXTO PROVISORIO - ...]`.
- `tests/setup/prisma-mock.ts` - conta default ganha `termoAceitoId: "termo-1"`; stub novo `prismaMock.termoDeUso.findFirst` com o mesmo `id`, data literal fixa, e comentario registrando os quatro pontos exigidos pelo plano.

## Decisions Made

- **Relacao inversa `ultimoAceitePor` adicionada a `TermoDeUso`.** O schema alvo do RESEARCH lista `Usuario.termoAceito` com `@relation("UltimoAceite")` mas nao declara o lado oposto. O Prisma exige os dois lados de uma relacao nomeada, entao `npx prisma validate` falharia sem ele. Adicionado como campo virtual (nao gera coluna nem altera o SQL gerado).
- **Nomes de diretorio das migrations forcados para os timestamps do plano.** O Prisma gera o timestamp do relogio (`20260902123913`, `...124845`, `...124932`); cada diretorio foi renomeado para o nome exato listado em `files_modified` **antes** de ser aplicado, porque o `_prisma_migrations` grava o nome no momento da aplicacao. A ordem lexicografica continua correta e posterior a `20260901195303`.
- **Nao foi feito reset do banco.** Ver "Issues Encountered" — a clausula de escalacao do plano foi respeitada literalmente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree sem `node_modules`, sem `.env` e sem os tipos gerados do Next**
- **Found during:** Task 1 (antes de qualquer `npx prisma`)
- **Issue:** O worktree e criado so com os arquivos versionados. Sem `node_modules` nenhum comando roda; sem `.env` o `DATABASE_URL` nao existe e `prisma migrate` nao conecta; sem `.next/types` o `tsc` falha em `app/layout.tsx(20,50): TS2304: Cannot find name 'LayoutProps'`, porque `tsconfig.json` inclui `.next/types/**/*.ts` e o tipo `LayoutProps` e gerado pelo Next.
- **Fix:** Symlinks de `node_modules` e `.env` apontando para o checkout principal (ambos cobertos pelo `.gitignore`, entao nao entram em nenhum commit), mais `npx next typegen` para gerar os tipos de rota dentro do worktree. Nenhum pacote foi instalado.
- **Files modified:** nenhum arquivo versionado
- **Verification:** `git status --short` limpo apos os symlinks; `npx tsc --noEmit` passou a sair 0 sem nenhuma alteracao de codigo.
- **Committed in:** n/a (artefatos gitignored)

**2. [Rule 3 - Blocking] Relacao inversa faltando em `TermoDeUso` para a relacao nomeada `UltimoAceite`**
- **Found during:** Task 1
- **Issue:** O schema recomendado no RESEARCH declara `Usuario.termoAceito TermoDeUso? @relation("UltimoAceite", ...)` sem o lado oposto. O Prisma recusa a relacao nomeada sem os dois lados e `npx prisma validate` falha.
- **Fix:** Acrescentado `ultimoAceitePor Usuario[] @relation("UltimoAceite")` em `TermoDeUso`.
- **Files modified:** `prisma/schema.prisma`
- **Verification:** `npx prisma validate` verde; o SQL gerado pelo Prisma nao ganhou nenhuma coluna ou constraint por causa disso (campo virtual).
- **Committed in:** `c662f2d` (commit da Task 1)

**3. [Rule 3 - Blocking] Primeira migration gerada continha o diff inteiro, nao so o `ALTER TYPE`**
- **Found during:** Task 2
- **Issue:** `prisma migrate dev --create-only --name add_superadmin_role` gerou `ALTER TYPE` + `CREATE TABLE` x2 + `ALTER TABLE` + indices + 4 FKs no mesmo arquivo — exatamente o que o Pitfall 1 proibe misturar.
- **Fix:** Arquivo reescrito com apenas `ALTER TYPE "UserRole" ADD VALUE 'SUPERADMIN';` (mais o cabecalho normativo) antes de aplicar; o restante do diff foi regenerado na segunda migration, como o plano manda.
- **Files modified:** `prisma/migrations/20260902120000_add_superadmin_role/migration.sql`
- **Verification:** `grep -c "ADD VALUE"` = 1 e `grep -ci "INSERT INTO"` = 0 na migration do enum; `enum_range` no Postgres devolve `ADMIN, SUPERADMIN`.
- **Committed in:** `5fae81b` (commit da Task 2)

---

**Total deviations:** 3 auto-fixadas (todas Rule 3 - blocking)
**Impact on plan:** Nenhum desvio de escopo. Duas sao preparacao de ambiente do worktree e uma e uma correcao obrigatoria do schema alvo do RESEARCH (relacao nomeada incompleta). Zero pacotes instalados, `git diff package.json` vazio — T-06-SC satisfeito.

## Issues Encountered

**1. `npx prisma migrate dev` sem `--name` trava esperando entrada interativa.**
Depois de aplicar a primeira migration, o comando detectou o diff restante e abriu o prompt `Enter a name for the new migration:`. Com `stdin` fechado, ele nao falha — fica pendurado indefinidamente (o processo ficou 7 minutos vivo com a conexao Postgres `idle`/`ClientRead`). A migration ja aplicada **nao** foi afetada. Resolvido matando o processo e passando sempre `--create-only --name <nome>` para gerar, e `migrate dev` puro so quando ja existe migration pendente e nenhum diff sobra. Fica registrado para os proximos planos da fase.

**2. Editar comentario de migration ja aplicada exige reset — e o reset foi recusado.**
O criterio de aceite do plano pede `grep -c "ON CONFLICT" ...seed_termo_v1/migration.sql` = 1, mas o cabecalho normativo cita a clausula literalmente, entao o grep devolve 2. A tentativa de reescrever o comentario invalidou o checksum da migration ja aplicada e o `prisma migrate dev` respondeu *"The migration `20260902120200_seed_termo_v1` was modified after it was applied. We need to reset the public schema"*. A clausula de escalacao do plano proibe aceitar reset, entao o arquivo foi restaurado byte a byte para o conteudo aplicado, `migrate dev` voltou a reportar *"Already in sync"* e **nenhum dado do banco de dev foi perdido**.

Consequencia: dois criterios de aceite batem por linha de comentario e nao so pelo SQL —
`grep -c "ON CONFLICT" ...seed_termo_v1/migration.sql` = **2** (1 no cabecalho, 1 no DML) e
`grep -c "onDelete: Restrict" prisma/schema.prisma` = **3** (o criterio pede `>= 1`, entao esse passa).
Semanticamente ambos estao satisfeitos: existe exatamente **uma** clausula `ON CONFLICT` executavel no arquivo. Isso e consistente com a decisao `[04-09]` ja adotada no projeto, segundo a qual os gates de grep descartam linhas de comentario antes de contar — o gate `gates:fase-06` do plano 06-08 deve seguir essa mesma regra ao verificar estes arquivos.

## Verification Results

| Verificacao | Resultado |
|-------------|-----------|
| `npx prisma validate` | verde |
| `npx prisma migrate status` | 13 migrations, "Database schema is up to date!" |
| `npx prisma generate` | ok; `UserRole.SUPERADMIN` exportado pelo client |
| v1 no banco (Prisma Client) | `v1 OK 739032e3-84c2-44ae-b976-0dc8ec5125b1` |
| `npm run test` | 89 arquivos / **916 testes** passando (limite do plano: >= 876) |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0, 0 erros (2 warnings pre-existentes, em arquivos nao tocados) |
| `git diff package.json` | vazio — zero pacotes nesta fase (T-06-SC) |
| `DELETE` de termo com aceite | recusado: `violates foreign key constraint "AceiteTermo_termoId_fkey"` (probe em transacao, revertida — banco voltou a 1 termo / 0 aceites) |

## Known Stubs

| Stub | Arquivo | Motivo / quem resolve |
|------|---------|-----------------------|
| Texto juridico da v1 dos termos e um placeholder que comeca com `[TEXTO PROVISORIO - substituir publicando uma nova versao via POST /api/termos antes do go-live]` | `prisma/migrations/20260902120200_seed_termo_v1/migration.sql` | **Intencional e exigido pelo plano.** O texto real e conteudo juridico, nao codigo, e por D-07 nao pode substituir a v1 por `UPDATE` — nasce como v2 pelo endpoint de TERM-02. O RESEARCH pede um `checkpoint:human-verify` para o usuario fornecer/aprovar o texto real antes do merge para producao; esse checkpoint pertence a um plano posterior desta fase, nao a este. Nao bloqueia o objetivo deste plano (fazer `/registro` funcionar em banco limpo). |

## User Setup Required

Nenhuma configuracao de servico externo. Nota operacional: qualquer ambiente ja existente precisa rodar `npx prisma migrate deploy` e `npx prisma generate` para ganhar as tabelas novas e os tipos do client.

## Next Phase Readiness

- O Prisma Client ja expoe `prisma.termoDeUso`, `prisma.aceiteTermo` e `UserRole.SUPERADMIN` — todos os demais planos da fase (Wave 2 em diante) estao desbloqueados.
- O gate de `termosPendentes` do plano 06-04 pode ser escrito sem medo de regressao em massa: o stub global ja entrega o estado neutro, e testes do caminho pendente sobrescrevem localmente zerando o ponteiro de ultimo aceite ou apontando-o para um `id` diferente do vigente.
- Ponto de atencao para o plano 06-08: os greps do `gates:fase-06` precisam descartar linhas de comentario antes de contar (decisao `[04-09]`), porque os cabecalhos normativos das migrations e os JSDoc do schema citam literalmente `ON CONFLICT`, `onDelete: Restrict` e `SUPERADMIN`.
- Ponto de atencao operacional: nunca editar uma migration ja aplicada, nem para corrigir comentario — o checksum invalida e o Prisma passa a exigir reset do banco de dev.

---
*Phase: 06-termos-de-uso-e-aceite*
*Completed: 2026-09-02*
