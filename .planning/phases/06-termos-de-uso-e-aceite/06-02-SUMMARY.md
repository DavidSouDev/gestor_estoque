---
phase: 06-termos-de-uso-e-aceite
plan: 02
subsystem: domain
tags: [termos-de-uso, react-cache, prisma, transacao, idempotencia, vitest, tdd]

# Dependency graph
requires:
  - phase: 06-termos-de-uso-e-aceite
    plan: 01
    provides: "models TermoDeUso e AceiteTermo no Prisma Client, versao Int @unique, @@unique([usuarioId, termoId]), Usuario.termoAceitoId e o stub global neutro de termos"
provides:
  - "termoVigente() — leitura da versao vigente deduplicada por React.cache, devolvendo os 4 campos projetados ou null"
  - "Tipo TermoVigente para consumidores tiparem props sem re-derivar a projecao"
  - "termoService.publicar — INSERT sempre, numeracao arbitrada por constraint, P2002 -> HttpError 409"
  - "termoService.registrarAceite — uma transacao com o fato + o bookkeeping, idempotente por P2002-como-sucesso"
  - "Prova por teste das duas invariantes de TERM-03 (18 casos novos)"
affects: [06-03, 06-04, 06-05, 06-06, 06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React.cache como unica memoizacao permitida numa leitura que gateia autorizacao (decisao [01-02] aplicada aos termos)"
    - "Constraint de banco como defesa primaria e read-then-write apenas como proposta: findFirst de MAX so propoe a versao, o @unique arbitra"
    - "P2002 com dois desfechos opostos no mesmo service: 409 na publicacao (corrida real) e sucesso silencioso no aceite (estado desejado ja existe)"
    - "Fato-primeiro-bookkeeping-depois dentro de uma unica $transaction, com a ordem afirmada por invocationCallOrder no teste"
    - "Teste de AUSENCIA de metodo como metade do contrato de imutabilidade, com a outra metade em gate de grep"

key-files:
  created:
    - lib/termo-vigente.ts
    - lib/termo-vigente.test.ts
    - app/services/termo.service.ts
    - app/services/termo.service.test.ts
  modified: []

key-decisions:
  - "termoVigente mora em lib/termo-vigente.ts e nao como export de lib/auth-guard.ts: 3 dos 4 consumidores nao sao de autorizacao, e acoplar o funil de registro a DAL de sessao nao traria ganho"
  - "A classe TermoService NAO e exportada, divergindo do frontmatter do plano: os 10 services do projeto exportam apenas o singleton, e exportar a classe convidaria a um segundo new TermoService() fora do modulo"
  - "A assercao de deduplicacao por request foi trocada pelas suas duas pre-condicoes (aridade zero + argumento de query estavel): React.cache nao memoiza fora de um request real, entao afirmar toHaveBeenCalledTimes(1) em Vitest seria afirmar algo falso"
  - "registrarAceite tem retorno Promise<void>: o caminho P2002 nao tem o que devolver, e um tipo uniforme impede que um chamador leia um resultado que so existe as vezes"

patterns-established:
  - "JSDoc de modulo numerando invariantes e dizendo qual constraint de banco defende cada uma, na densidade de acesso.service.ts"
  - "Comentario dentro do teste explicando por que uma assercao NAO esta ali e em que nivel ela mora"

requirements-completed: [TERM-02, TERM-03]

# Metrics
duration: 12min
completed: 2026-09-02
---

# Phase 6 Plan 02: Camada de Dominio dos Termos de Uso Summary

**`termoVigente()` memoizado apenas por `React.cache` e `termoService` com `publicar` (INSERT sempre, numeracao arbitrada por `versao @unique`) e `registrarAceite` (uma `$transaction` que grava o fato e o bookkeeping juntos, idempotente por `@@unique([usuarioId, termoId])`), com as duas invariantes de TERM-03 provadas por 18 casos novos.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-09-02T12:57:00Z
- **Completed:** 2026-09-02T13:09:54Z
- **Tasks:** 3
- **Files created:** 4

## Accomplishments

- `lib/termo-vigente.ts` entrega a versao vigente com `orderBy: [{ publicadoEm: "desc" }, { versao: "desc" }]` e `select` explicito dos 4 campos, devolvendo `null` num banco sem termos — e o JSDoc registra os quatro pontos exigidos, incluindo a assimetria deliberada (o gate falha ABERTO, o registro falha FECHADO) escrita para que ninguem "corrija" um dos lados no futuro.
- `app/services/termo.service.ts` implementa as duas operacoes de escrita da fase com as constraints do plano 06-01 fazendo o trabalho pesado: o `findFirst` de maximo apenas *propoe* o proximo numero e o Postgres arbitra a corrida, e o aceite trata P2002 como sucesso em vez de gravar duas linhas.
- Nenhum caminho de escrita sobre uma versao publicada foi criado — nem `atualizar`, nem `editar`, nem `remover`, nem `arquivar` — e a ausencia esta afirmada por teste, com o comentario apontando para a metade complementar (o gate de grep do plano 06-08).
- Suite completa subiu de 916 para **934 testes** (91 arquivos), com `tsc --noEmit` e `lint` limpos e `git diff package.json` vazio (T-06-SC).

## Task Commits

1. **Task 1 RED: teste falhando de `termoVigente`** - `032c2d2` (test)
2. **Task 1 GREEN: `lib/termo-vigente.ts`** - `e114b50` (feat)
3. **Task 2: `app/services/termo.service.ts`** - `df921df` (feat)
4. **Task 3: `app/services/termo.service.test.ts`** - `9667fef` (test)

## Files Created/Modified

- `lib/termo-vigente.ts` (63 linhas) - `termoVigente` embrulhado em `cache` de `react`; tipo `TermoVigente` derivado do retorno nao-nulo; JSDoc de 40 linhas cobrindo os 4 pontos normativos e a justificativa de o modulo ser irmao de `auth-guard` e nao parte dele.
- `lib/termo-vigente.test.ts` (7 casos) - `null` sem throw em tabela vazia, projecao exata dos 4 campos, ordem dos dois criterios de `orderBy`, desempate por `versao`, ausencia de `include`, e as pre-condicoes de memoizacao.
- `app/services/termo.service.ts` (114 linhas) - `class TermoService` + `export const termoService`; JSDoc numerando as 5 invariantes; `publicar` e `registrarAceite` com tratamento de P2002 em desfechos opostos.
- `app/services/termo.service.test.ts` (11 casos) - `describe`s de `publicar`, `registrarAceite` e superficie do service, com `mockTransaction()` no molde de `acesso.service.test.ts` e `makeP2002()` no molde de `empresa.service.test.ts`.

## Decisions Made

- **A classe `TermoService` nao e exportada.** O frontmatter do plano lista `exports: ["TermoService", "termoService"]` e a secao "Artifacts this phase produces" repete, mas o bloco `<action>` da propria Task 2 manda "seguir a convencao de modulo do projeto" — e `grep "^class \|^export class "` nos 10 services existentes mostra **zero** classes exportadas, unanimemente. Exportar a classe convidaria a um segundo `new TermoService()` fora do modulo, que e exatamente o que a convencao de singleton existe para impedir. A convencao do codigo venceu o frontmatter; o singleton `termoService` continua sendo o unico export.
- **`registrarAceite` devolve `Promise<void>`.** O snippet do RESEARCH faz `return await prisma.$transaction(...)`, mas o callback da transacao nao devolve nada e o caminho P2002 devolve `undefined`. Fixar o tipo em `void` impede que um chamador futuro leia um resultado que so existiria as vezes.
- **`publicar` mantem o `findFirst` fora do `try`.** Uma falha na leitura do maximo nao e uma corrida de publicacao e nao deve virar 409; so o `create` esta dentro do `catch` que mapeia P2002.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree sem `node_modules`, sem `.env` e sem os tipos gerados do Next**
- **Found during:** setup, antes da Task 1
- **Issue:** O worktree e criado so com arquivos versionados. Sem `node_modules` nenhum comando roda; sem `.env` o `DATABASE_URL` nao existe; sem `.next/types` o `tsc` falha em `app/layout.tsx` com `TS2304: Cannot find name 'LayoutProps'`, porque `tsconfig.json` inclui `.next/types/**/*.ts`. Identico ao desvio 1 do plano 06-01.
- **Fix:** Symlinks de `node_modules` e `.env` apontando para o checkout principal (ambos cobertos pelo `.gitignore`), mais `npx next typegen`. **Nenhum pacote instalado.**
- **Files modified:** nenhum arquivo versionado
- **Verification:** `git status --short` vazio apos os symlinks; `npx tsc --noEmit` passou a sair 0 no baseline, antes de qualquer codigo novo.
- **Committed in:** n/a (artefatos gitignored)

**2. [Rule 1 - Bug no teste] A assercao de deduplicacao por request afirmava algo falso sobre o ambiente**
- **Found during:** Task 1, no gate GREEN
- **Issue:** O teste RED incluia `expect(prismaMock.termoDeUso.findFirst).toHaveBeenCalledTimes(1)` apos duas invocacoes. Com a implementacao correta no lugar, ele falhou com "got 2 times": em React 19, `cache(fn)` verifica o dispatcher (`ReactSharedInternals.A`) e, fora de um request/render, **delega para a funcao original sem memoizar**. Em Vitest (ambiente `node`, sem RSC) nao ha request, entao nao ha dedup — o comportamento e do ambiente, nao um defeito do modulo.
- **Fix:** O plano ja previa exatamente esta bifurcacao. A assercao foi trocada pelas duas **pre-condicoes** sem as quais a memoizacao nunca aconteceria nem num request real: aridade zero (`termoVigente.length === 0`, porque a chave do cache do React sao os argumentos) e argumento de query **estavel** entre chamadas (mesma projecao, mesma ordenacao, nada derivado do relogio ou do chamador). O comentario no teste registra por que a assercao de dedup real pertence ao nivel e2e/integracao.
- **Files modified:** `lib/termo-vigente.test.ts`
- **Verification:** 7 casos verdes; a assercao nova falha se alguem acrescentar um parametro a `termoVigente` ou tornar o `orderBy`/`select` variavel por chamada.
- **Committed in:** `e114b50`

---

**Total deviations:** 2 auto-fixadas (1 Rule 3 de ambiente, 1 Rule 1 de assercao falsa)
**Impact on plan:** Nenhum desvio de escopo. Zero pacotes instalados, `git diff package.json` vazio — T-06-SC satisfeito.

## TDD Gate Compliance

O plano e `type: execute`, entao o gate RED/GREEN de plano inteiro nao se aplica. Nas tasks:

- **Task 1 (`tdd="true"`)** cumpriu o ciclo completo: commit `test(...)` `032c2d2` com o modulo inexistente (RED verificado — `Cannot find module './termo-vigente'`), depois commit `feat(...)` `e114b50` com a implementacao (GREEN). Sem fase REFACTOR: nao houve o que limpar.
- **Task 2 (`tdd="true"`)** foi executada como implementacao-antes-do-teste **porque o proprio plano assim a estrutura**: o bloco `<files>` da Task 2 lista somente `app/services/termo.service.ts`, seu `<verify>` e `npx tsc --noEmit` (nao um run de teste), e o arquivo de teste correspondente e o entregavel da Task 3 — cujo `<read_first>` manda ler a implementacao da Task 2. Inverter a ordem produziria um commit RED sobre um arquivo que o plano atribui a outra task. A cobertura exigida existe e esta verde (`9667fef`); a inconsistencia esta no plano, nao na execucao, e fica registrada aqui para o planejador da proxima fase.

## Verification Results

| Verificacao | Esperado | Resultado |
|-------------|----------|-----------|
| `npx vitest run lib/termo-vigente.test.ts` | >= 4 casos, exit 0 | **7 casos**, exit 0 |
| `npx vitest run app/services/termo.service.test.ts` | >= 9 casos, exit 0 | **11 casos**, exit 0 |
| `npm run test` (suite completa) | verde | 91 arquivos / **934 testes** (eram 916) |
| `npx tsc --noEmit` | exit 0 | exit 0 |
| `npm run lint` | exit 0 | exit 0, 0 erros (2 warnings pre-existentes, em arquivos nao tocados) |
| `grep -c "include:" lib/termo-vigente.ts` | 0 | 0 |
| `grep -c 'publicadoEm: "desc"' lib/termo-vigente.ts` | 1 | 1 |
| `grep -c 'versao: "desc"' lib/termo-vigente.ts` | 1 | 1 |
| `grep -c "export" lib/termo-vigente.ts` | >= 2 | 3 |
| `unstable_cache` / `'use cache'` em linha de codigo | 0 | 0 (unica ocorrencia e a linha 19 do JSDoc, que os proibe nominalmente) |
| `grep -c "export const termoService = new TermoService()" app/services/termo.service.ts` | 1 | 1 |
| `grep -c "\$transaction" app/services/termo.service.ts` | 1 | 1 |
| `grep -c "include:" app/services/termo.service.ts` | 0 | 0 |
| `grep -c 'from "\.\.' app/services/termo.service.ts` | 0 | 0 |
| `termoDeUso.update` / `.delete` / `.updateMany` / `.deleteMany` em linha de codigo | 0 | 0 (unica ocorrencia e a linha 19 do JSDoc, que a proibe) |
| `git diff package.json` | vazio | vazio |

**Duas contagens batem por linha de comentario, nao por codigo** — mesma situacao ja registrada pelo plano 06-01 e coberta pela decisao `[04-09]`:
`grep -c "P2002" app/services/termo.service.ts` devolve **4** (o criterio pede 2); as ocorrencias de codigo sao as linhas **75** e **105**, uma em cada metodo, e as outras duas (linhas 24 e 101) sao comentario normativo.
Idem para `termoDeUso.update` (linha 19) e `unstable_cache` (linha 19). **O gate `gates:fase-06` do plano 06-08 precisa descartar linhas de comentario antes de contar nestes dois arquivos.**

## Threat Model Coverage

| Threat ID | Disposition | Como ficou |
|-----------|-------------|------------|
| T-06-16 | mitigate | `versao @unique` arbitra; P2002 -> `HttpError` 409 com o `status` afirmado em teste |
| T-06-17 | mitigate | Zero metodos de `update`/`delete` de `TermoDeUso`; ausencia afirmada por teste com nao-vacuidade |
| T-06-20 | mitigate | As duas escritas na mesma `$transaction`, com a ordem fato-antes-de-bookkeeping afirmada por `invocationCallOrder` |
| T-06-21 | mitigate | P2002 do aceite RESOLVE; teste afirma `resolves`, nao `rejects` |
| T-06-07 | transfer | Registrado como invariante 5 do JSDoc do service; a garantia de que `usuarioId` vem da sessao e dos planos 06-05 e 06-06 |
| T-06-22 | mitigate | `select` do `create` afirmado exatamente igual a `{ id, versao, publicadoEm }`, com `not.toHaveProperty("conteudo")` |
| T-06-23 | mitigate | So `React.cache`; os dois identificadores proibidos aparecem apenas no JSDoc que os proibe |
| T-06-SC | mitigate | `git diff package.json` vazio; zero pacotes |

## Known Stubs

Nenhum. Os dois modulos estao completos para o escopo deste plano; nenhum valor vazio, placeholder ou `TODO` foi introduzido.

## User Setup Required

Nenhuma. Nada de servico externo, nada de variavel de ambiente nova.

## Next Phase Readiness

- **06-03 (endpoint de TERM-02)** pode importar `termoService.publicar` direto; o `HttpError` 409 ja carrega `.status`, entao o handler so precisa do `try/catch` padrao dos 29 handlers existentes.
- **06-04 (gate de TERM-04)** pode chamar `termoVigente()` de dentro de `revalidarConta` sem se preocupar com query duplicada no mesmo render — mas precisa ler a invariante 3 do JSDoc de `lib/termo-vigente.ts`: a query cai no `try/catch` fail-closed do guard, entao uma falha na tabela de termos derruba a **sessao inteira**, nao so o gate.
- **06-05 (registro atomico)** precisa da assimetria: `termoVigente()` devolvendo `null` **recusa** o cadastro (falha FECHADO), enquanto o gate de 06-04 com o mesmo `null` **nao bloqueia** (falha ABERTO). Os dois lados ja estao comentados; nao "harmonizar".
- **06-06 (tela de aceite)** tem `TermoVigente` pronto para tipar props e `termoService.registrarAceite(usuarioId, termoId)` pronto para a Server Action — com `usuarioId` vindo da sessao, nunca do `FormData` (invariante 5).
- **06-08 (gates)** precisa descartar linhas de comentario antes de contar nos dois arquivos novos; ver a nota em "Verification Results".

## Self-Check: PASSED

Arquivos declarados, todos presentes em disco: `lib/termo-vigente.ts`, `lib/termo-vigente.test.ts`, `app/services/termo.service.ts`, `app/services/termo.service.test.ts`.

Commits declarados, todos presentes no historico da branch: `032c2d2`, `e114b50`, `df921df`, `9667fef`.

---
*Phase: 06-termos-de-uso-e-aceite*
*Completed: 2026-09-02*
