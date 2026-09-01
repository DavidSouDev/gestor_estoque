---
phase: 04-aplica-o-do-bloqueio
plan: 02
subsystem: acesso-e-bloqueio
tags: [acc-03, catalogo-publico, idor, soft-delete, multi-tenant]

requires:
  - "lib/empresa-publicavel.ts (EMPRESA_PUBLICAVEL_SELECT, empresaPodePublicar) — 04-01"
  - "lib/avaliar-acesso.ts (podePublicarCatalogo, avaliarAcesso) — 04-01 / Fase 02-03"
  - "Empresa.deletedAt / acessoAte / trialFim / canceladoEm / acessoVitalicio"
provides:
  - "produtoService.findCatalogoById gateado por tenant e por status (assinatura inalterada)"
  - "comboService.findCatalogoById gateado por tenant e por status (assinatura inalterada)"
  - "Precedente do select aninhado no call site (gate sem query extra) para os demais planos do catalogo"
affects:
  - "GET /api/catalogo/produtos/[id] e GET /api/catalogo/combos/[id]: passam a 404 para empresa bloqueada/cancelada/soft-deletada"
  - "04-03: os caminhos de LISTA seguem o mesmo molde; os dois caminhos por id ja estao fechados"
  - "Handlers de rota: NAO foram tocados — o gate inteiro mora no service"

tech-stack:
  added: []
  patterns:
    - "Select aninhado da empresa dona montado NO CALL SITE, nunca dentro da constante compartilhada de select"
    - "Gate de status em memoria sobre a MESMA linha ja lida — 1 query em todo desfecho, inclusive na rejeicao"
    - "Desestruturacao de descarte da chave interna antes do retorno, para preservar o formato publico"
    - "Relogio congelado (fake timers) nos testes porque o service le new Date() internamente"

key-files:
  created: []
  modified:
    - "app/services/produto.service.ts"
    - "app/services/produto.service.test.ts"
    - "app/services/combo.service.ts"
    - "app/services/combo.service.test.ts"
    - "app/api/catalogo/produtos/[id]/route.test.ts"
    - "app/api/catalogo/combos/[id]/route.test.ts"

decisions:
  - "O gate usa empresaPodePublicar (o predicado nomeado de 04-01) em vez de avaliarAcesso + podePublicarCatalogo inline, como o snippet do 04-RESEARCH sugeria: mantem UM ponto de mudanca se admin e catalogo divergirem na Fase 7"
  - "Nenhum handler de rota foi modificado — e justamente por nao existir branch novo no handler que as duas respostas 404 sao byte-identicas por construcao, e nao por coincidencia"
  - "O select aninhado fica no call site e nao em PRODUTO_CATALOGO_SELECT/COMBO_CATALOGO_SELECT: aquelas constantes sao compartilhadas com listCatalogo (e PRODUTO_CATALOGO_SELECT ainda e aninhada dentro de COMBO_CATALOGO_SELECT), entao mexer nelas mudaria o corpo publico de outros endpoints"
  - "Fixtures de billing duplicadas nos dois arquivos de teste em vez de extraidas para um helper: o projeto co-loca fixtures por arquivo de teste, e a duplicacao aqui e a prova visual de que os dois gates sao byte-paralelos"

metrics:
  duration: "~9min"
  tasks: 2
  files: 6
  commits: 4
  tests_added: 20
  completed: 2026-09-01
---

# Phase 04 Plan 02: Gate por id no catalogo publico — Summary

Os dois caminhos publicos de leitura por id (`produtoService.findCatalogoById` e
`comboService.findCatalogoById`) passam a gatear pelo status da empresa DONA do recurso e a
filtrar por tenant vivo — dentro do MESMO `findFirst`, sem query extra e sem mudar um campo
sequer do corpo publico.

## What Was Built

**Task 1 — `produtoService.findCatalogoById`** (`app/services/produto.service.ts`)

- `empresa: { deletedAt: null }` acrescentado ao `where`. Fecha um bug **pre-existente**: ate
  aqui o metodo nao filtrava por tenant nenhum, entao os produtos de uma empresa removida por
  soft delete continuavam publicamente legiveis por id (T-04-05).
- `select` deixou de ser `PRODUTO_CATALOGO_SELECT` puro e virou
  `{ ...PRODUTO_CATALOGO_SELECT, empresa: { select: EMPRESA_PUBLICAVEL_SELECT } }`, montado no
  call site.
- O retorno deixou de ser o do `findFirst` direto: `null` se nao achou, `null` se
  `!empresaPodePublicar(produto.empresa, new Date())`, senao o objeto **sem** a chave `empresa`.
- JSDoc registrando ACC-03, D-06, D-07, T-04-02, T-04-04 e T-04-05, e em particular por que a
  empresa dona vem no mesmo `findFirst`.

**Task 2 — `comboService.findCatalogoById`** (`app/services/combo.service.ts`)

A mesma transformacao, campo a campo, trocando `prisma.produto` por `prisma.combo` e
`PRODUTO_CATALOGO_SELECT` por `COMBO_CATALOGO_SELECT`. O `visivel: true` do combo foi
preservado (o produto usa `visivelCatalogo`) — os dois campos **nao** foram uniformizados.

**Handlers de rota: zero linhas alteradas.** Só os testes ganharam o caso de paridade.

## Key Implementation Detail: por que os handlers nao foram tocados

A tentacao natural era acrescentar um branch "empresa bloqueada" no handler. Isso teria dois
defeitos. Primeiro, `notFound()` dentro do `try` existente vira **500**, nao 404 — fail-open
silencioso (Pitfall 3 / T-04-07); por isso o criterio de aceite tem um grep proibindo
`notFound` nesses dois arquivos, e ele passa. Segundo, e mais importante: com o gate inteiro no
service, "empresa bloqueada" e "id inexistente" percorrem **literalmente o mesmo caminho de
codigo** no handler — o `if (!produto)` que ja existia. A resposta 404 e byte-identica por
construcao, e nao por duas ramificacoes que alguem pode fazer divergir depois (logando uma
delas, por exemplo).

O teste de paridade afirma isso comparando os dois corpos entre si (`toEqual(corpoInexistente)`),
alem de compara-los com o literal esperado.

## Key Implementation Detail: paridade de queries e o select no call site

Nenhum desfecho ganhou uma segunda ida ao banco. Os quatro fatos de billing chegam por select
aninhado no mesmo `findFirst`, e a decisao acontece em memoria. Uma segunda query so no caminho
de rejeicao faria "existe mas esta bloqueada" custar o dobro de "nao existe" e devolveria a
enumeracao de tenants por medida de tempo (T-04-02). Os testes afirmam
`toHaveBeenCalledTimes(1)` nos dois casos de rejeicao.

O select aninhado e montado no call site de proposito. `PRODUTO_CATALOGO_SELECT` e reutilizada
por `listCatalogo` **e** aninhada dentro de `COMBO_CATALOGO_SELECT` (`combo.service.ts:52`);
acrescentar `empresa` na constante teria vazado os fatos de billing no corpo publico da lista de
produtos, na lista de combos e dentro de cada item de combo de uma vez so.

## Tasks Completed

| Task | Nome | Gate | Commit |
|------|------|------|--------|
| 1 | Gate de tenant e status em produto | RED | `c4eace6` |
| 1 | Gate de tenant e status em produto | GREEN | `ac4855d` |
| 2 | Espelho do gate em combo | RED | `87ae6fa` |
| 2 | Espelho do gate em combo | GREEN | `2ad979f` |

Nenhum commit de REFACTOR: as duas implementacoes sairam na forma final no GREEN.

## Verification Evidence

| Gate | Resultado |
|------|-----------|
| `npx vitest run app/services/produto.service.test.ts "app/api/catalogo/produtos/[id]/route.test.ts"` | 2 arquivos, 28 testes, exit 0 |
| `npx vitest run app/services/combo.service.test.ts "app/api/catalogo/combos/[id]/route.test.ts"` | 2 arquivos, 28 testes, exit 0 |
| `npm test` (suite inteira, regressao) | 80 arquivos, **799 testes**, exit 0 (era 776 no fim do 04-01) |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 erros (1 warning pre-existente: `Link` nao usado em `app/registro/page.tsx`, decisao `[01-04]`) |
| `grep -n "empresa: { deletedAt: null }" app/services/produto.service.ts` | linha 132 (+ 119, JSDoc) |
| `grep -n "empresa: { deletedAt: null }" app/services/combo.service.ts` | linha 102 (+ 89, JSDoc) |
| `grep -n "empresaPodePublicar" app/services/produto.service.ts` | linhas 4 e 148 |
| `grep -n "empresaPodePublicar" app/services/combo.service.ts` | linhas 3 e 117 |
| `grep -c "prisma.produto.findFirst" app/services/produto.service.ts` | **2** — inalterado (1 em `findCatalogoById`, 1 em `findById`) |
| `grep -n "notFound" "app/api/catalogo/produtos/[id]/route.ts"` | nenhuma linha |
| `grep -n "notFound" "app/api/catalogo/combos/[id]/route.ts"` | nenhuma linha |
| `git diff --stat fa68811 HEAD -- package.json package-lock.json` | vazio (T-04-SC: nenhum pacote novo) |
| `npx eslint --report-unused-disable-directives` nos dois services | exit 0 — as diretivas de descarte sao necessarias, nao decorativas |
| `git diff --diff-filter=D --name-only fa68811 HEAD` | vazio (nenhum arquivo deletado) |

Prova de nao-vacuidade (RED antes de GREEN): Task 1 falhou com **5 testes** vermelhos e Task 2
tambem com **5** — em ambos os casos as falhas foram exatamente as asercoes de gate (`toBeNull`
nos status bloqueados, `empresa: { deletedAt: null }` no `where`, select aninhado, e a chave
`empresa` vazando no retorno).

## Deviations from Plan

### 1. [Rule 3 - Blocking] `npx tsc --noEmit` falhava por tipos gerados ausentes no worktree

- **Encontrado em:** Task 1, ao rodar o criterio de aceite de tsc.
- **Problema:** `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'` — tipo
  GLOBAL gerado pelo Next em `.next/types/**`, que nunca existiu neste worktree recem-criado.
  Identico ao que o 04-01 documentou.
- **Correcao:** `npx next typegen` (exit 0). `npx tsc --noEmit` passou a sair 0.
- **Arquivos versionados alterados:** nenhum (`.next/` e gitignored).
- **Commit:** nenhum.

### 2. [Rule 3 - Blocking] Fixture existente de `comboService.findCatalogoById` quebrava com o gate

- **Encontrado em:** Task 2.
- **Problema:** o teste "busca um combo ativo, visivel e nao deletado pelo id" ja existia e
  afirmava a forma EXATA da chamada (`toHaveBeenCalledWith({ where: {...}, select:
  COMBO_CATALOGO_SELECT })`). Com o filtro de tenant e o select aninhado, essa igualdade exata
  passou a ser falsa por definicao. Produto nao tinha o problema porque nao tinha teste
  equivalente.
- **Correcao:** o teste foi atualizado para a nova forma completa (nao afrouxado para
  `objectContaining`) e a fixture passou a carregar os 4 fatos de billing. A igualdade exata foi
  mantida de proposito: e ela que prova que **nada alem** de `empresa` entrou no select — se
  alguem acrescentar um campo ao select publico sem querer, este teste quebra.
- **Commit:** `87ae6fa`.

### 3. [Rule 2 - Correcao preventiva] Cobertura do descarte da chave `empresa` no combo reforcada

- **Encontrado em:** Task 2, escrevendo o espelho dos testes.
- **Problema:** o plano pedia so `not.toHaveProperty("empresa")`. Isso pega a chave vazando, mas
  nao pegaria um campo de billing vazando achatado no nivel de cima (ex.: um `...combo.empresa`
  no lugar do descarte).
- **Correcao:** o teste de combo afirma tambem `toEqual(comboBase)` — igualdade EXATA com a
  fixture sem billing. Qualquer fato de billing que sobreviva ao retorno, em qualquer formato,
  quebra o teste.
- **Commit:** `87ae6fa`.

## Notas de Implementacao

**Relogio congelado nos testes, ao contrario do padrao de `avaliar-acesso`.** As funcoes puras da
Fase 2 recebem `agora` injetado e nao precisam de fake timers. `findCatalogoById` le
`new Date()` internamente (nao ha por onde injetar sem mudar a assinatura publica, que o plano
exige preservar), entao os testes usam `vi.useFakeTimers()` + `setSystemTime(AGORA)` no
`beforeEach` do describe, com `useRealTimers()` no `afterEach`. Isso importa em especial para a
fixture de **CARENCIA**, a unica que depende de "agora esta dentro dos 10 dias": sem congelar, ela
envelheceria e o teste comecaria a falhar sozinho em meados de junho de 2026.

**A ordem dos `beforeEach` e segura.** O `beforeEach` global de `tests/setup/prisma-mock.ts` roda
primeiro (registrado no import do setup) e faz `mockReset`; o `beforeEach` do describe roda
depois e congela o relogio. Nenhum dos dois desfaz o outro.

**As duas diretivas `eslint-disable-next-line @typescript-eslint/no-unused-vars`** nas
desestruturacoes de descarte foram verificadas com `--report-unused-disable-directives` (exit 0
nos dois services): sao necessarias, nao copiadas por inercia.

## Known Stubs

Nenhum. Os dois metodos estao implementados e cobertos por teste, e ja tem consumidor real em
producao (`GET /api/catalogo/produtos/[id]` e `GET /api/catalogo/combos/[id]`) — ao contrario do
04-01, este plano ja muda comportamento observavel.

## Threat Flags

Nenhuma superficie de seguranca nova fora do `<threat_model>` do plano. As cinco mitigacoes
atribuidas foram implementadas e provadas por teste:

| Threat | Como foi provado |
|--------|------------------|
| T-04-04 | `toBeNull()` para BLOQUEADO e CANCELADO nos dois services + paridade de corpo 404 nas duas rotas |
| T-04-05 | Asercao sobre `mock.calls[0][0]` contendo `empresa: { deletedAt: null }` nos dois services |
| T-04-02 | `toHaveBeenCalledTimes(1)` no caminho de rejeicao E no caminho de id inexistente, nos dois services |
| T-04-07 | `grep -n "notFound"` vazio nos dois handlers; nenhum handler foi modificado |
| T-04-01 | `not.toHaveProperty("empresa")` nos dois + `toEqual(comboBase)` (igualdade exata) no combo |
| T-04-SC | `git diff` vazio em `package.json` / `package-lock.json` |

**Nota de escopo residual (nao e flag nova, e o limite conhecido deste plano):** os caminhos de
LISTA do catalogo (`GET /api/catalogo/produtos?empresaId=`, `GET /api/catalogo/combos?empresaId=`)
continuam **sem** gate — sao o escopo declarado do plano 04-03. Este plano fecha exclusivamente os
dois caminhos por id.

## Self-Check: PASSED

Arquivos verificados no disco:

- FOUND: `app/services/produto.service.ts`
- FOUND: `app/services/combo.service.ts`
- FOUND: `app/services/produto.service.test.ts`
- FOUND: `app/services/combo.service.test.ts`
- FOUND: `app/api/catalogo/produtos/[id]/route.test.ts`
- FOUND: `app/api/catalogo/combos/[id]/route.test.ts`
- FOUND: `.planning/phases/04-aplica-o-do-bloqueio/04-02-SUMMARY.md`

Commits verificados em `git log`:

- FOUND: `c4eace6` test(04-02) RED task 1
- FOUND: `ac4855d` feat(04-02) GREEN task 1
- FOUND: `87ae6fa` test(04-02) RED task 2
- FOUND: `2ad979f` feat(04-02) GREEN task 2

## TDD Gate Compliance

Os dois tasks seguiram RED -> GREEN, cada gate no seu proprio commit e na ordem correta
(`test(...)` antes de `feat(...)` em ambos). Nenhum teste passou inesperadamente na fase RED nas
asercoes de gate. REFACTOR nao foi necessario e nao gerou commit vazio.
