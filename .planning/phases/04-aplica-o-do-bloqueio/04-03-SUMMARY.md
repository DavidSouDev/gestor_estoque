---
phase: 04-aplica-o-do-bloqueio
plan: 03
subsystem: acesso-e-bloqueio
tags: [acc-03, catalogo-publico, paridade-de-resposta, t-04-03]

requires:
  - "empresaService.findPublicavelBySlug / findPublicavelById — plano 04-01"
  - "empresaService.findBySlug gateado por status — plano 04-01"
provides:
  - "GET /api/catalogo/produtos gateado nos dois branches (?slug= e ?empresaId=)"
  - "GET /api/catalogo/combos gateado nos dois branches"
  - "prova por teste de que GET /api/empresas/slug/[slug] (o sexto caminho) e gateado por findBySlug"
  - "ausencia de resolvedor slug->id sem gate de status no codebase"
affects:
  - "04-09: o gate de enumeracao de entrypoints publicos pode assumir que nenhum resolvedor sem gate existe"
  - "qualquer plano futuro que precise resolver tenant em caminho publico: so existe findPublicavel*"

tech-stack:
  added: []
  patterns:
    - "Resolucao de tenant em UMA expressao condicional, um await por request (T-04-02)"
    - "Rejeicao por 400 e por 200 [] no mesmo handler, escolhida pela presenca do parametro e nao pelo motivo da falha"
    - "Remocao do afford-ance inseguro em vez de proibi-lo por comentario (T-04-03)"

key-files:
  created: []
  modified:
    - "app/api/catalogo/produtos/route.ts"
    - "app/api/catalogo/produtos/route.test.ts"
    - "app/api/catalogo/combos/route.ts"
    - "app/api/catalogo/combos/route.test.ts"
    - "app/api/empresas/slug/[slug]/route.test.ts"
    - "app/services/empresa.service.ts"
    - "app/services/empresa.service.test.ts"

decisions:
  - "A condicao do 400 e `!empresaIdParam && !empresa`, ancorada no PARAMETRO e nao no motivo da falha: e o unico jeito de os tres casos (sem parametro, slug inexistente, slug bloqueado) convergirem no mesmo 400 enquanto os dois casos de `?empresaId=` convergem no mesmo 200 []"
  - "Ternario aninhado em vez de if/else com reatribuicao: uma expressao com exatamente um `await` alcancavel torna a paridade de round trips estrutural, nao uma disciplina que o proximo editor precisa lembrar"
  - "O comentario normativo que substitui o metodo removido nao escreve o nome antigo, porque o proprio gate de grep do plano (`grep -rn resolveIdBySlug`) o acusaria — a proibicao e descrita ('um resolvedor slug->id SEM gate de status')"
  - "Os testes do sexto caminho andam em PAR (404 + 200): o de 404 sozinho passaria mesmo com o gate removido, entao ele nao prova nada sem o de 200 ao lado"

metrics:
  duration: "~6min"
  tasks: 3
  files: 7
  commits: 5
  tests_added: 10
  completed: 2026-09-01
---

# Phase 04 Plan 03: Gate dos Endpoints de Lista do Catalogo — Summary

Os dois endpoints publicos de lista passam a resolver tenant pelo funil gateado nos **dois**
branches — inclusive o `?empresaId=`, que ate aqui nao passava por resolucao nenhuma — e o
resolvedor slug->id sem gate de status deixa de existir no codebase.

## What Was Built

**Task 1 e 2 — os dois handlers de lista** (`app/api/catalogo/{produtos,combos}/route.ts`)

Os dois arquivos ficaram byte-paralelos, como ja eram. O corpo do `try` virou:

1. `slug` e `empresaIdParam` lidos em constantes separadas — a versao anterior reatribuia
   `empresaId` com o resultado da resolucao de slug, o que fundia "o cliente mandou um id" com
   "eu derivei um id" numa variavel so e tornava impossivel decidir entre 400 e 200 `[]` depois.
2. Uma unica expressao condicional resolve a empresa: `findPublicavelById(empresaIdParam)` se o
   parametro existe, senao `findPublicavelBySlug(slug)` se o slug existe, senao `null`. A
   precedencia de `empresaId` sobre `slug` (comportamento vigente) sai de graca da ordem.
3. `if (!empresaIdParam && !empresa)` → o 400 existente, com a string literal intocada.
4. `if (!empresa)` → `NextResponse.json([])`.
5. `listCatalogo(empresa.id)`.

`notFound()` nao aparece em nenhum dos dois arquivos (Pitfall 3 / T-04-07: o `try` o converteria
num 500).

**Task 3 — o sexto caminho e a remocao do resolvedor** (`app/services/empresa.service.ts`)

O handler de `GET /api/empresas/slug/[slug]` **nao foi tocado**: ele ja devolve 404 quando
`findBySlug` devolve `null`, e o plano 04-01 ja pos o gate dentro de `findBySlug`. O que faltava
era prova. `resolveIdBySlug` foi removida do service e do seu teste, e no lugar dela ficou um
comentario normativo contra a reintroducao.

## Key Implementation Detail: por que a condicao do 400 olha o PARAMETRO, nao o erro

A parte nao obvia deste plano e que os dois branches falham de formas **diferentes** de proposito.
A tabela de paridade do 04-RESEARCH.md (linhas 3 e 4) e assimetrica: slug inexistente devolve 400,
`empresaId` inexistente devolve 200 `[]`. Nao e elegante, mas e o comportamento vigente, e
espelha-lo e a coisa conservadora a fazer — um bloqueio que devolvesse 404 nos dois seria *mais*
distinguivel do resto do trafego, nao menos.

Por isso a condicao do 400 e `!empresaIdParam && !empresa` e nao um teste sobre o motivo da falha.
O handler literalmente nao consegue saber se o `null` veio de "nao existe" ou de "bloqueada" —
`findPublicavel*` colapsa os dois num unico retorno (04-01) — e essa impossibilidade e a
mitigacao de T-04-01, nao uma limitacao. O que o handler pode saber e qual porta o visitante
bateu, e e isso, e so isso, que escolhe a forma da resposta.

O ternario aninhado com um unico `await` alcancavel e deliberado pelo mesmo motivo que 04-01
contava queries: se alguem escrever `resolver por slug e depois re-resolver por id`, a resposta
continua identica e o tempo nao, e "existe mas esta bloqueada" custaria dois round trips contra um
de "nao existe" (T-04-02). Os testes afirmam `not.toHaveBeenCalled()` no resolvedor do outro
branch nos quatro caminhos, de rejeicao e de sucesso.

## Tasks Completed

| Task | Nome | Gate | Commit |
|------|------|------|--------|
| 1 | Gate em `/api/catalogo/produtos` | RED | `53358c2` |
| 1 | Gate em `/api/catalogo/produtos` | GREEN | `03472b0` |
| 2 | Gate em `/api/catalogo/combos` | RED | `88cc904` |
| 2 | Gate em `/api/catalogo/combos` | GREEN | `2528aa3` |
| 3 | Sexto caminho provado + resolvedor removido | — | `d508428` |

Nenhum commit de REFACTOR: as duas implementacoes sairam na forma final no GREEN.

## Verification Evidence

| Gate | Resultado |
|------|-----------|
| `npx vitest run app/api/catalogo/produtos/route.test.ts` | 9 testes, exit 0 |
| `npx vitest run app/api/catalogo/combos/route.test.ts` | 9 testes, exit 0 |
| `npx vitest run "app/api/empresas/slug/[slug]/route.test.ts" app/services/empresa.service.test.ts` | 51 testes, exit 0 |
| Conjunto de verificacao do plano (4 arquivos) | **69 testes**, exit 0 |
| `npm test` (suite inteira, regressao) | 80 arquivos, **785 testes**, exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 erros (1 warning pre-existente: `Link` nao usado em `app/registro/page.tsx`, decisao `[01-04]`) |
| `grep -rn "resolveIdBySlug" app lib e2e scripts` | **nenhuma linha** (exit 1) |
| `grep -n "resolveIdBySlug"` nos dois handlers de lista | nenhuma linha |
| `grep -c "findPublicavel"` nos dois handlers de lista | **2** em cada — criterio pedia >= 2 |
| `grep -n "notFound"` nos dois handlers de lista | nenhuma linha (T-04-07) |
| `grep -c "Informe o parâmetro empresaId ou slug." app/api/catalogo/produtos/route.ts` | **1** (mensagem inalterada) |
| `git diff --stat package.json package-lock.json` | vazio (T-04-SC: nenhum pacote novo) |
| `git diff --diff-filter=D --name-only` nos 5 commits | nenhum arquivo deletado |

Prova de nao-vacuidade (RED antes de GREEN): Task 1 falhou com **7 de 9** testes vermelhos e
Task 2 tambem com **7 de 9**. Os 2 que ja passavam em cada arquivo eram o "400 sem parametros" e
o "500 em erro inesperado", que o plano preserva inalterados de proposito.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `npx tsc --noEmit` falhava por tipos gerados ausentes no worktree

- **Encontrado em:** Task 1, ao rodar o criterio de aceite de tsc.
- **Problema:** `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'` — unico erro
  da saida, num arquivo que este plano nao toca. `LayoutProps` e global gerado pelo Next em
  `.next/types/**`, que um worktree recem-criado nunca teve.
- **Correcao:** `npx next typegen` (exit 0). `npx tsc --noEmit` passou a sair 0 nas tres vezes
  seguintes.
- **Arquivos versionados alterados:** nenhum (`.next/` e gitignored).
- **Commit:** nenhum.
- **Nota:** identico ao desvio 1 do 04-01. E ambiental por worktree, nao residual — todo executor
  paralelo desta fase vai reencontra-lo.

### 2. [Rule 1 - Bug no criterio de aceite] O comentario normativo casaria com o gate de grep

- **Encontrado em:** Task 3, ao escrever a justificativa da remocao.
- **Problema:** o plano manda registrar em comentario a razao de `resolveIdBySlug` ter saido, e no
  mesmo folego exige que `grep -rn "resolveIdBySlug" app lib e2e scripts` nao retorne **nenhuma**
  linha. Escrever o nome antigo no comentario faria o texto normativo acusar a si mesmo — o mesmo
  formato de bug ja documentado no desvio 2 do 04-01.
- **Correcao:** o comentario descreve a coisa proibida sem nomea-la ("um resolvedor slug->id SEM
  gate de status") e aponta o substituto (`findPublicavelBySlug`). O conteudo normativo esta
  inteiro e o gate ficou verde de verdade.
- **Arquivos modificados:** `app/services/empresa.service.ts` (apenas comentario).
- **Commit:** `d508428`.

## Notas de Implementacao

**Os imports dos handlers continuam relativos.** `app/api/catalogo/*/route.ts` importa
`"../../../services/empresa.service"`, e os testes fazem `vi.mock` pela **mesma string**. Trocar
para `@/` — que e a convencao do CLAUDE.md — quebraria os mocks silenciosamente: o handler passaria
a carregar o service real, que abriria conexao com o banco no ambiente `node` do Vitest. A
convencao perde aqui por uma razao mecanica, e ha um comentario no topo de cada teste registrando
isso para o proximo editor.

**Os testes de "slug inexistente" e "slug bloqueado" sao mock-identicos** nos dois handlers, e isso
e o ponto, nao um descuido: se algum dia for possivel escrever um teste que os distinga pela
resposta, a mitigacao T-04-01 quebrou.

## Known Stubs

Nenhum. Os tres tasks estao implementados e cobertos por teste.

**Nota de escopo (nao e stub):** este plano fecha os caminhos 2 a 8 da tabela de paridade
(os 4 endpoints de catalogo mais o `/api/empresas/slug/[slug]`). O caminho 1 — a pagina
`GET /{slug}` e seu layout — e do plano 04-02, e o branding generico da tela de login bloqueada
(T-04-12) e do 04-04.

## Threat Flags

Nenhuma superficie de seguranca nova fora do `<threat_model>` do plano. Nenhum endpoint, rota,
schema ou caminho de arquivo foi criado — os dois arquivos de handler modificados mantiveram
metodo, path e forma de resposta.

Mitigacoes atribuidas, todas implementadas: T-04-01 (paridade exata de status e corpo com a tabela
do 04-RESEARCH.md; nenhuma resposta menciona pagamento), T-04-02 (uma unica resolucao de tenant,
provada por `not.toHaveBeenCalled()` no resolvedor do outro branch), T-04-03 (resolvedor sem gate
removido do codebase), T-04-04 (o branch `?empresaId=` gateado por `findPublicavelById`), T-04-07
(`notFound()` ausente dos dois handlers, provado por grep), T-04-SC (`package.json` e
`package-lock.json` intocados).

## Self-Check: PASSED

Arquivos verificados no disco:

- FOUND: `app/api/catalogo/produtos/route.ts`
- FOUND: `app/api/catalogo/produtos/route.test.ts`
- FOUND: `app/api/catalogo/combos/route.ts`
- FOUND: `app/api/catalogo/combos/route.test.ts`
- FOUND: `app/api/empresas/slug/[slug]/route.test.ts`
- FOUND: `app/services/empresa.service.ts`
- FOUND: `app/services/empresa.service.test.ts`
- FOUND: `.planning/phases/04-aplica-o-do-bloqueio/04-03-SUMMARY.md`

Commits verificados em `git log`:

- FOUND: `53358c2` test(04-03) RED task 1
- FOUND: `03472b0` feat(04-03) GREEN task 1
- FOUND: `88cc904` test(04-03) RED task 2
- FOUND: `2528aa3` feat(04-03) GREEN task 2
- FOUND: `d508428` refactor(04-03) task 3

## TDD Gate Compliance

Os dois tasks marcados `tdd="true"` seguiram RED -> GREEN, cada gate no seu proprio commit e na
ordem correta (`test(...)` antes de `feat(...)` em ambos). REFACTOR nao foi necessario e nao gerou
commit vazio. A Task 3 nao e `tdd="true"` (remocao de codigo morto + prova de comportamento ja
existente) e saiu num commit unico, como o plano especifica.
