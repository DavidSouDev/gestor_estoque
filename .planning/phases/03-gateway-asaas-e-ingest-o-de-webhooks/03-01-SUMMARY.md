---
phase: 03-gateway-asaas-e-ingest-o-de-webhooks
plan: 01
subsystem: database
tags: [prisma, postgres, migration, asaas, webhook, idempotencia, ledger, multi-tenant]

# Dependency graph
requires:
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    provides: "enum CausaTransicaoAcesso com o ponto de extensao D-14, fatos de billing na Empresa, model AuditoriaAcesso e o precedente de gate SQL versionado (prisma/checks/backfill-billing.sql)"
provides:
  - "model EventoWebhookAsaas: ledger append-only de eventos do Asaas com eventoId @unique (idempotencia por constraint, nao por if de aplicacao)"
  - "model CheckoutAsaas: mapa checkout -> empresa com asaasCheckoutId @unique, gravado na criacao do checkout"
  - "Empresa.asaasCustomerId e Empresa.asaasSubscriptionId @unique: identificadores externos do Asaas para resolucao local de tenant"
  - "valor de enum CausaTransicaoAcesso.WEBHOOK_PAGAMENTO aplicado no Postgres real"
  - "colunas processadoEm/erro/tentativas + @@index([processadoEm]): a fila de retrabalho que a Fase 5 (WRK-01) vai drenar"
  - "prisma/checks/asaas-schema.sql: gate SQL versionado com 7 invariantes verificadas contra o catalogo do Postgres"
affects: [03-02, 03-04, 03-05, 03-06, 03-07, 05-worker-diario]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotencia de webhook por constraint UNIQUE do Postgres, nunca por findFirst-antes-do-insert"
    - "Resolucao de tenant por mapa local (@unique), nunca por identificador vindo do payload"
    - "Gate SQL versionado consultando o catalogo do Postgres (pg_enum/pg_index/information_schema), nao o schema.prisma"
    - "Colunas de vocabulario de terceiro (status do Asaas) como String livre, nao enum"

key-files:
  created:
    - prisma/migrations/20260831230000_add_asaas_webhook_ledger/migration.sql
    - prisma/checks/asaas-schema.sql
  modified:
    - prisma/schema.prisma

key-decisions:
  - "EventoWebhookAsaas.empresaId fica deliberadamente SEM @relation/FK: o ledger e append-only e precisa sobreviver a remocao de uma Empresa; um onDelete: Cascade apagaria a trilha financeira exatamente no caso em que ela mais importa (T-03-04, custo aceito e consciente)"
  - "CheckoutAsaas.status e String livre e nao enum: ACTIVE/PAID/CANCELED/EXPIRED e vocabulario de terceiro que pode crescer sem aviso; travar em enum faria um status novo derrubar a ingestao"
  - "A migration foi gerada por 'prisma migrate diff' + 'prisma migrate deploy' em vez de 'prisma migrate dev --create-only': o CLI do Prisma 7 recusa 'migrate dev' em ambiente nao-interativo e o agente nao tem TTY"
  - "A formatacao do schema.prisma foi normalizada em commit proprio e separado: o gate 'prisma format --check' do plano falhava no estado herdado do repo, antes de qualquer edicao desta fase"
  - "A prova de idempotencia foi empirica contra o Postgres real (segunda insercao do mesmo eventoId recusada), nao inferida do catalogo"

patterns-established:
  - "Gate SQL de schema: cada invariante e um RAISE EXCEPTION consultando o catalogo do Postgres, porque prisma validate e tsc leem o ARQUIVO de schema e passariam mesmo com a migration nao aplicada"
  - "Migration que adiciona valor de enum nao carrega DML que use o valor (Pitfall 7); backfill que precise da causa nova vai em migration separada"

requirements-completed: [GTW-01, GTW-02, GTW-03, GTW-04]

# Metrics
duration: 12min
completed: 2026-08-31
---

# Phase 3 Plan 01: Schema do Gateway Asaas Summary

**Ledger de webhooks com idempotencia imposta pelo Postgres (`eventoId @unique`), mapa local checkout/assinatura -> empresa contra IDOR, e gate SQL de 7 invariantes verificadas no catalogo do banco real.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-31T19:14:00Z
- **Completed:** 2026-08-31T19:26:00Z
- **Tasks:** 2/2
- **Files modified:** 3 (1 modificado, 2 criados)

## Accomplishments

- `EventoWebhookAsaas` existe no Postgres real com `eventoId @unique` — e a defesa contra entrega concorrente do mesmo evento foi **provada empiricamente**, nao presumida.
- `CheckoutAsaas.asaasCheckoutId @unique` e `Empresa.asaasSubscriptionId @unique` criam o mapa local que a Fase 3 usa para resolver `empresaId`, eliminando a necessidade de confiar no payload do webhook (C-08 / Pattern 5).
- `CausaTransicaoAcesso.WEBHOOK_PAGAMENTO` aplicado no banco vivo, por migration propria e sem DML que use o valor na mesma transacao (Pitfall 7).
- `prisma/checks/asaas-schema.sql` transforma as invariantes de schema em um gate executavel e versionado — regressao futura falha em vez de passar silenciosamente.
- Nenhuma coluna de status/carencia adicionada: BILL-01/D-16 da Fase 2 seguem intactos.

## Task Commits

1. **Formatacao do schema (pre-requisito do gate)** - `e587d73` (chore)
2. **Task 1: Estender schema.prisma com ledger, mapa de checkout e enum** - `395b90e` (feat)
3. **Task 2 [BLOCKING]: Aplicar migration contra Postgres real e provar invariantes** - `6693391` (feat)

## Files Created/Modified

- `prisma/schema.prisma` — models `EventoWebhookAsaas` e `CheckoutAsaas`, campos `asaasCustomerId`/`asaasSubscriptionId` na `Empresa`, valor de enum `WEBHOOK_PAGAMENTO`. Cada decisao nao-obvia esta comentada no proprio schema (ausencia de FK, String vs enum, payload redigido).
- `prisma/migrations/20260831230000_add_asaas_webhook_ledger/migration.sql` — migration aplicada; header documenta por que nao pode haver DML aqui.
- `prisma/checks/asaas-schema.sql` — gate com 7 `RAISE EXCEPTION` (INV-1..INV-7).

## Evidencia de verificacao

Todos os comandos rodaram contra o `DATABASE_URL` real (`localhost:5432/gestor_estoque`):

| Gate | Resultado |
|------|-----------|
| `npx prisma validate` | `The schema at prisma/schema.prisma is valid` (exit 0) |
| `npx prisma format --check` | exit 0 |
| `npx prisma migrate status` | `9 migrations found` / `Database schema is up to date!` |
| `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/checks/asaas-schema.sql` | `NOTICE: asaas-schema: INV-1..INV-7 OK` — **GATE EXIT: 0** |
| `npm run test` | 71 arquivos, **525 testes passando** |
| `npm run lint` | 0 erros, 1 warning pre-existente (`Link` nao usado em `app/registro/page.tsx`, mantido de proposito no plano 01-04) |

### Prova empirica da idempotencia (criterio de sucesso #4)

Duas insercoes do mesmo `"eventoId"` via `psql`, em transacoes separadas:

```
=== INSERCAO 1 (deve passar) ===
INSERT 0 1
exit=0

=== INSERCAO 2, mesmo eventoId (deve FALHAR) ===
ERROR:  duplicate key value violates unique constraint "EventoWebhookAsaas_eventoId_key"
DETAIL:  Key ("eventoId")=(evt_gate_03_01_teste&1) already exists.
exit=1
```

A mensagem literal exigida pelo plano — **`duplicate key value violates unique constraint`** — foi observada. As linhas de teste foram removidas em seguida (`DELETE 1`); contagem residual de `EventoWebhookAsaas` = **0**.

Isto e o que separa idempotencia real de idempotencia ficticia: a recusa vem do Postgres, entao duas entregas concorrentes do mesmo evento nao podem ambas inserir, mesmo passando juntas por qualquer verificacao de aplicacao.

## Decisions Made

- **`EventoWebhookAsaas.empresaId` sem FK** — divergencia deliberada da convencao do projeto (todos os outros `empresaId` tem `@relation ... onDelete: Cascade`). O ledger e uma trilha de auditoria financeira append-only: precisa sobreviver a remocao da Empresa e aceitar eventos ainda nao resolvidos (`null`). Custo aceito: integridade referencial nao imposta pelo banco nessa coluna (T-03-04). A justificativa esta escrita no schema para nao ser "corrigida" por engano depois.
- **`CheckoutAsaas.status` como `String`** — os status do Asaas sao vocabulario de terceiro. Um enum reproduziria o defeito do Pitfall 3 no nivel do schema: um status novo passaria a derrubar a ingestao em vez de ser apenas desconhecido.
- **Gate SQL le o catalogo, nao o schema.prisma** — `prisma validate` e `tsc --noEmit` derivam tudo do arquivo de schema e passariam com a migration nao aplicada. So `pg_enum`/`pg_index`/`information_schema` provam que a constraint existe no banco que vai receber os webhooks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ambiente do worktree sem `node_modules` e `.env`**
- **Found during:** Setup (antes da Task 1)
- **Issue:** O worktree e criado apenas com arquivos versionados; `node_modules` e `.env` sao gitignored, entao `npx prisma` nao rodava e nao havia `DATABASE_URL` — a Task 2 e explicitamente `[BLOCKING]` contra Postgres real.
- **Fix:** Symlinks para `node_modules` e `.env` do checkout principal.
- **Verification:** `npx prisma validate` e `npx prisma migrate status` conectaram ao banco real.
- **Committed in:** nada — ambos os caminhos sao gitignored e nao entraram em nenhum commit (`git status` limpo).

**2. [Rule 3 - Blocking] `prisma migrate dev --create-only` recusa ambiente nao-interativo**
- **Found during:** Task 2, passo 1
- **Issue:** O Prisma 7 aborta com `Prisma Migrate has detected that the environment is non-interactive, which is not supported` — o agente nao tem TTY, e o aviso da constraint unica em `asaasSubscriptionId` forcaria um prompt de confirmacao.
- **Fix:** Fluxo equivalente e nao-interativo: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o <migration.sql>`, revisao do SQL gerado (o passo que o plano pede), depois `npx prisma migrate deploy`. O SQL e produzido pelo mesmo engine; o que muda e so o gatilho.
- **Verification:** `npx prisma migrate status` => `9 migrations found` / `Database schema is up to date!`; gate SQL exit 0.
- **Committed in:** `6693391`

**3. [Rule 3 - Blocking] `prisma format --check` ja falhava antes desta fase**
- **Found during:** Task 1
- **Issue:** O `<verify>` da Task 1 roda `npx prisma validate && npx prisma format --check`. No estado herdado do repo, `format --check` saia **1**: o `schema.prisma` nunca tinha passado por `prisma format`. O criterio do plano ("schema ja formatado") partia de uma premissa falsa, e o gate falharia independentemente do que esta fase escrevesse.
- **Fix:** `npx prisma format` aplicado e isolado em commit proprio (`e587d73`), 110 insercoes / 111 remocoes puramente de espacamento, **0 alteracao semantica**, para nao poluir o diff substantivo. Nenhum outro plano da wave 1 toca `prisma/schema.prisma` (03-02 e 03-03 mexem so em `lib/billing/asaas/**` e `package.json`), entao o reformat nao cria risco de conflito de merge.
- **Verification:** `npx prisma format --check` exit 0; `npx prisma validate` valido; 525 testes verdes.
- **Committed in:** `e587d73`

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** Nenhum desvio de escopo. As tres correcoes sao de ambiente/ferramenta e nao alteram nada do que o plano especificou em conteudo: o schema, a migration e o gate saem exatamente como desenhados.

## Issues Encountered

- **`03-PATTERNS.md` nao existe no worktree.** O `<context>` do plano referencia `.planning/phases/03-.../03-PATTERNS.md`, e o `<read_first>` da Task 1 cita a secao dele com as convencoes de schema. O arquivo esta **untracked** no checkout principal (aparece como `??` no `git status` inicial), entao nunca chegou ao worktree. Contornado derivando as convencoes diretamente do `schema.prisma` existente e do precedente da Fase 2 (`20260831193038_add_billing_a_empresa`): `String @id @default(uuid())`, `onDelete: Cascade`, `createdAt @default(now())`, `@@index` explicito, comentario citando ID de decisao, sem `@map`/`@@map`. **Vale commitar esse arquivo** — os planos 03-02..03-07 tambem o referenciam e vao encontrar a mesma ausencia.

- **Criterio de grep de DML impossivel de satisfazer como escrito.** O plano exige `grep -cE "INSERT INTO|UPDATE " migration.sql == 0`, mas o resultado e **2**, ambos falsos positivos: (a) o comentario do header que menciona "INSERT/UPDATE", (b) `ON UPDATE CASCADE` na clausula de FK — que o Prisma emite para toda FK e que ja estava na migration da Fase 2. O padrao nao consegue chegar a 0 em nenhuma migration que contenha foreign key. **A intencao do criterio (Pitfall 7: nenhum DML usando o valor novo do enum) esta satisfeita**, verificado com o padrao preciso `grep -icE '^[[:space:]]*(INSERT|UPDATE|DELETE)[[:space:]]'` => **0**. O `migration.sql` nao foi editado para "consertar" o grep porque a migration ja estava aplicada e seu checksum registrado em `_prisma_migrations` — edita-lo faria `migrate status` acusar migration modificada.

- **Efeito colateral compartilhado (esperado, mas registrar).** O banco de dev e o `node_modules` sao compartilhados com o checkout principal via symlink. A migration foi aplicada ao banco real e `prisma generate` reescreveu o cliente em `node_modules/@prisma/client` — ou seja, essas mudancas ja sao visiveis fora do worktree, antes do merge. E inerente a um plano cujo passo `[BLOCKING]` e "aplicar contra Postgres real", mas significa que reverter este plano exige tambem reverter a migration no banco.

## Known Stubs

Nenhum. Este plano entrega apenas schema, migration e gate SQL — nao ha caminho de codigo com valor placeholder. As colunas `processadoEm`/`erro`/`tentativas` ficam sem consumidor de proposito: drenar a fila e escopo declarado da Fase 5 (WRK-01), documentado no comentario do schema e na INV-7 do gate.

## Threat Flags

Nenhuma superficie nova fora do `<threat_model>` do plano. As disposicoes `mitigate` foram implementadas: T-03-01 (`eventoId @unique`, provado empiricamente), T-03-02 (`asaasSubscriptionId`/`asaasCheckoutId @unique`), T-03-03 (coluna `payload` documentada como REDIGIDA; nenhuma coluna `creditCard*`/`cpfCnpj` existe no schema), T-03-05 (migration sem DML + INV-1 do gate). T-03-04 permanece `accept`, com a justificativa escrita no proprio schema. Nenhum pacote foi instalado (T-03-SC nao se aplica a este plano).

## User Setup Required

Nenhum — nenhuma configuracao de servico externo neste plano. As credenciais do Asaas entram nos planos 03-02/03-03.

## Next Phase Readiness

Pronto para os planos que dependem deste:

- **03-02** (`lib/billing/asaas/**`) e **03-04/03-05** podem usar `prisma.eventoWebhookAsaas` e `prisma.checkoutAsaas` — cliente ja regenerado e tipado.
- **03-05** implementa a redacao do payload; a coluna `payload` ja esta documentada como REDIGIDA e a expectativa esta registrada no schema.
- **Fase 5 (WRK-01)** tem a fila de retrabalho pronta: `WHERE "processadoEm" IS NULL` com `@@index([processadoEm])`.

**Pendencias para o orquestrador:**

1. `03-PATTERNS.md` esta untracked no checkout principal e nao chegou a nenhum worktree — commitar antes das waves seguintes, ja que 03-02..03-07 o referenciam.
2. Os blockers de STATE.md continuam abertos e sao pre-requisito das partes de integracao da fase (nao deste plano): preco mensal indefinido e confirmacao do Asaas (sandbox, header `asaas-access-token`, aprovacao do checkout).

## Self-Check: PASSED

- Arquivos declarados existem em disco: `prisma/schema.prisma`, `prisma/checks/asaas-schema.sql`, `prisma/migrations/20260831230000_add_asaas_webhook_ledger/migration.sql`, `03-01-SUMMARY.md`.
- Commits declarados existem em `worktree-agent-a0029c416c221c57a`: `e587d73`, `395b90e`, `6693391`, `e68e3ef`.
- `git status --short` limpo: os runners temporarios de `psql` foram removidos e os symlinks de ambiente (`node_modules`, `.env`) sao gitignored — nada de ambiente vazou para os commits.
- Nenhum arquivo deletado em nenhum dos commits (`git diff --diff-filter=D` vazio contra o commit de spawn).
- `STATE.md` e `ROADMAP.md` **nao** foram tocados (escrita do orquestrador apos a wave).

---
*Phase: 03-gateway-asaas-e-ingest-o-de-webhooks*
*Completed: 2026-08-31*
