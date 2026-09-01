---
phase: 04-aplica-o-do-bloqueio
plan: 01
subsystem: acesso-e-bloqueio
tags: [acc-02, acc-03, bill-01, predicado-de-bloqueio, funil-publicavel]

requires:
  - "lib/avaliar-acesso.ts (avaliarAcesso, FatosDeAcesso) — Fase 02-03"
  - "lib/fuso-sao-paulo.ts (meiaNoiteEmSaoPaulo) — Fase 02-03"
  - "Empresa.acessoAte / trialFim / canceladoEm / acessoVitalicio — migration da Fase 02-01"
provides:
  - "acessoBloqueado(status) — predicado unico de bloqueio (ACC-02)"
  - "podePublicarCatalogo(status) — predicado unico de publicacao (ACC-03)"
  - "diasRestantesDeCarencia(carenciaAte, agora) — aritmetica do banner (ACC-01)"
  - "EMPRESA_PUBLICAVEL_SELECT + empresaPodePublicar (lib/empresa-publicavel.ts)"
  - "FatosPublicaveis (interface)"
  - "empresaService.findPublicavelBySlug / findPublicavelById / findBrandingBySlug"
  - "empresaService.findBySlug gateado por status"
affects:
  - "04-02 / 04-03: os 6 caminhos publicos do catalogo passam a consumir findPublicavel*"
  - "04-04: renderiza branding generico quando findBrandingBySlug devolver bloqueada: true"
  - "04-05: banner de carencia consome diasRestantesDeCarencia"
  - "produto.service / combo.service: importam EMPRESA_PUBLICAVEL_SELECT sem ciclo"

tech-stack:
  added: []
  patterns:
    - "Record<StatusAcesso, boolean> exaustivo como gate de compilacao (T-04-15)"
    - "Modulo neutro (lib/) para quebrar ciclo de import entre services"
    - "Decisao de acesso em memoria sobre 1 query, nunca filtro em SQL (BILL-01)"
    - "Gate antes do fan-out para paridade de numero de queries (T-04-02)"
    - "Relogio injetado por parametro nas funcoes puras; fake timers so onde o service le new Date()"

key-files:
  created:
    - "lib/empresa-publicavel.ts"
    - "lib/empresa-publicavel.test.ts"
  modified:
    - "lib/avaliar-acesso.ts"
    - "lib/avaliar-acesso.test.ts"
    - "app/services/empresa.service.ts"
    - "app/services/empresa.service.test.ts"

decisions:
  - "A tabela BLOQUEIO_ESPERADO do teste e escrita a mao, nao derivada de BLOQUEIA[s]: derivar tornaria o teste uma tautologia incapaz de pegar inversao de valor"
  - "findPublicavel* usam UMA condicao (!empresa || !empresaPodePublicar(...)) em vez de dois early returns: 'nao existe' e 'bloqueada' convergem textualmente no mesmo retorno, sem caminho separado que alguem possa instrumentar/logar diferente depois"
  - "diasRestantesDeCarencia devolve 0 para data invalida (fail-closed): mostrar 'vence hoje' pede o pagamento, mostrar NaN nao pede nada"
  - "Math.round e nao Math.ceil: os dois extremos ja sao meias-noites locais e um dia de mudanca de offset tem 23h ou 25h — ceil produziria +1 espurio"
  - "EMPRESA_BRANDING_PUBLICO_SELECT carrega os 4 fatos de billing de proposito, para decidir 'bloqueada' sem uma segunda query; os fatos crus sao desestruturados para fora do retorno"

metrics:
  duration: "~12min"
  tasks: 2
  files: 6
  commits: 4
  tests_added: 58
  completed: 2026-09-01
---

# Phase 04 Plan 01: Predicados de Bloqueio e Funil Publicavel — Summary

Um unico `Record<StatusAcesso, boolean>` exaustivo passa a definir o que "bloqueado" significa
para admin e catalogo, e o `empresa.service` ganha um funil de leitura publicavel que gasta
exatamente uma query em qualquer desfecho — inclusive quando rejeita.

## What Was Built

**Task 1 — predicados exaustivos e aritmetica de dias restantes** (`lib/avaliar-acesso.ts`, `lib/empresa-publicavel.ts`)

- `BLOQUEIA`: const de modulo privada, tipada `Record<StatusAcesso, boolean>`, com as seis
  chaves escritas explicitamente. `TRIAL`, `EM_DIA`, `CARENCIA` e `VITALICIO` sao `false`;
  `BLOQUEADO` e `CANCELADO` sao `true` (D-06: rotulo distinto, comportamento identico).
- `acessoBloqueado(status)` (ACC-02) e `podePublicarCatalogo(status)` (ACC-03). O segundo existe
  como nome proprio, e nao como negacao inline no chamador, porque admin e catalogo podem
  divergir na Fase 7.
- `diasRestantesDeCarencia(carenciaAte, agora)`: ancorada em `meiaNoiteEmSaoPaulo(agora, 1)`,
  com `Math.round` e clamp em 0. Unico lugar autorizado a calcular "faltam N dias" (Pitfall 5).
- `lib/empresa-publicavel.ts` (NOVO): `EMPRESA_PUBLICAVEL_SELECT`, `FatosPublicaveis` e
  `empresaPodePublicar(fatos, agora)`. Mora em `lib/` e nao no service porque
  `empresa.service.ts` ja importa `produtoService`/`comboService`/`promocaoService` — publicar
  daqui e o que permite que esses services importem a projecao sem fechar um ciclo.

**Task 2 — funil publicavel e branding** (`app/services/empresa.service.ts`)

- `findPublicavelBySlug` / `findPublicavelById`: 1 `findFirst` com `EMPRESA_PUBLICAVEL_SELECT`,
  decisao em memoria, retorno `{ id }` ou `null`. So o `id` sai; nenhum fato de billing atravessa.
- `findBySlug` gateado: os 4 fatos entram no `select`, o gate mora logo depois do
  `if (!empresa)` e ANTES do `Promise.all`, e os fatos sao desestruturados para fora do corpo
  publico antes do retorno.
- `findBrandingBySlug`: `EMPRESA_BRANDING_PUBLICO_SELECT` (branding + 4 fatos numa query),
  devolve branding + `bloqueada: boolean`, sem os fatos crus. Deliberadamente **nao** gateada.
- `resolveIdBySlug` ganhou o comentario normativo que a proibe em caminho publico de catalogo.

## Key Implementation Detail: por que a paridade e de QUERIES, nao so de resposta

A parte nao obvia deste plano nao e devolver `null` para empresa bloqueada — e devolver `null`
gastando o **mesmo numero de idas ao banco** que um slug inexistente. Se o gate morasse depois do
`Promise.all`, a resposta seria identica e o tempo nao: "existe mas esta bloqueada" custaria 4
queries e "nao existe" custaria 1, e um visitante anonimo enumeraria tenants pelo relogio
(T-04-02). Por isso os testes afirmam `toHaveBeenCalledTimes(1)` nos **dois** casos de rejeicao e
`not.toHaveBeenCalled()` no fan-out — a asercao de contagem e a mitigacao, nao um detalhe de
performance.

Pelo mesmo motivo o status nao e filtrado em SQL: um `WHERE acessoAte > now()` duplicaria a regra
de negocio de `avaliarAcesso` e a aritmetica de fuso de `meiaNoiteEmSaoPaulo` dentro do banco
(violando BILL-01) e apagaria D-03 — a carencia continua publicando o catalogo, e um `WHERE`
ingenuo a derrubaria.

## Tasks Completed

| Task | Nome | Gate | Commit |
|------|------|------|--------|
| 1 | Predicados exaustivos e dias restantes | RED | `6881035` |
| 1 | Predicados exaustivos e dias restantes | GREEN | `2e92363` |
| 2 | Funil publicavel e branding no service | RED | `62b261a` |
| 2 | Funil publicavel e branding no service | GREEN | `05cfea1` |

Nenhum commit de REFACTOR: as duas implementacoes sairam na forma final no GREEN.

## Verification Evidence

| Gate | Resultado |
|------|-----------|
| `npx vitest run lib/avaliar-acesso.test.ts lib/empresa-publicavel.test.ts app/services/empresa.service.test.ts` | 3 arquivos, **106 testes**, exit 0 |
| `npx vitest run` (suite inteira, regressao) | 80 arquivos, **776 testes**, exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 erros (1 warning pre-existente: `Link` nao usado em `app/registro/page.tsx`, decisao `[01-04]`) |
| `git diff --stat package.json` | vazio (T-04-SC: nenhum pacote novo) |
| `grep -c "StatusAcesso\." lib/avaliar-acesso.ts` | **12** (6 do `avaliarAcesso` + 6 chaves do `Record`) — criterio pedia >= 12 |
| `grep -n "status !== " lib/avaliar-acesso.ts lib/empresa-publicavel.ts` | nenhuma linha |
| `grep -rn "new Date()" lib/avaliar-acesso.ts lib/empresa-publicavel.ts` | nenhuma linha |
| `grep -c "empresaPodePublicar" app/services/empresa.service.ts` | **5** — criterio pedia >= 3 |
| `grep -n "findPublicavelBySlug\|findPublicavelById\|findBrandingBySlug"` | as tres definicoes presentes (`:266`, `:290`, `:323`) |

Prova de nao-vacuidade (RED antes de GREEN): Task 1 falhou com **24 testes** vermelhos
(`diasRestantesDeCarencia is not a function`) e Task 2 com **26** (`findBrandingBySlug is not a
function` + `findBySlug` devolvendo objeto onde o gate exigia `null`).

## Deviations from Plan

### 1. [Rule 3 - Blocking] `npx tsc --noEmit` falhava por tipos gerados ausentes no worktree

- **Encontrado em:** Task 1, ao rodar o criterio de aceite de tsc
- **Problema:** `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`. `LayoutProps`
  e um tipo GLOBAL gerado pelo Next em `.next/types/**`, incluido pelo `tsconfig.json` (linhas
  29-30). Um worktree recem-criado nunca foi buildado, entao o diretorio nao existe.
- **Diagnostico:** pre-existente e ambiental — o arquivo do erro nao foi tocado por este plano, e
  o erro era o unico da saida.
- **Correcao:** `npx next typegen` (exit 0). `npx tsc --noEmit` passou a sair 0.
- **Arquivos versionados alterados:** nenhum (`.next/` e gitignored).
- **Commit:** nenhum.

### 2. [Rule 1 - Bug no criterio de aceite] Dois greds de gate eram literalmente insatisfaziveis

- **Encontrado em:** Task 1, ao validar os criterios de aceite.
- **Problema A:** os criterios exigiam que `grep -n "status !== "` e `grep -rn "new Date()"` nao
  retornassem **nenhuma** linha, mas a acao do plano tambem exigia JSDoc explicando por que o
  atalho `status !== "EM_DIA"` e proibido e que `agora` e injetado em vez de `new Date()`. O texto
  normativo casava com os proprios greps.
- **Correcao:** reescrita da prosa do JSDoc preservando o conteudo normativo sem os literais
  (`"comparar o status com EM_DIA por desigualdade"`, `"nunca le o relogio do sistema por conta
  propria"`). Os dois gates ficaram verdes de verdade, sem enfraquecer a documentacao.
  Efeito colateral: `grep -c "StatusAcesso\."` caiu de 13 para 12 — que e exatamente o numero que
  o criterio descreve (6 + 6) e continua satisfazendo o `>= 12`.
- **Problema B:** o gate de cache tinha o filtro
  `grep -v "^lib/empresa-publicavel.ts: *\*"`, que assume a saida de `grep -r` **sem** numero de
  linha. Como o comando usa `grep -rn`, a saida real e `arquivo:43: * texto` e o filtro nunca
  casa — o gate acusaria as proprias linhas de JSDoc que o plano MANDA escrever (T-04-08).
- **Correcao:** filtro corrigido para `grep -v "^[0-9]*: *\*"`, que remove as linhas de JSDoc como
  pretendido. Resultado: **nenhuma linha de codigo** referencia `unstable_cache` ou `'use cache'`
  em `lib/empresa-publicavel.ts` — a intencao do gate esta satisfeita.
  Comando corrigido, para o plano 04-09 reaproveitar:
  `grep -n "unstable_cache\|use cache" lib/empresa-publicavel.ts | grep -v "^[0-9]*: *\*" | grep -v "//"`
- **Arquivos modificados:** `lib/avaliar-acesso.ts` (apenas comentarios).
- **Commit:** `2e92363`.

### 3. [Rule 2 - Correcao] Clamp de `NaN` em `diasRestantesDeCarencia`

- **Encontrado em:** Task 1, escrevendo o teste de `<behavior>` "nunca devolve NaN".
- **Problema:** `Math.max(0, NaN)` devolve `NaN`, nao `0`. Com uma `Date` invalida, o banner
  mostraria "faltam NaN dias".
- **Correcao:** guarda `if (!Number.isFinite(dias)) return 0;` antes do clamp — fail-closed
  coerente com o resto do motor de acesso.
- **Commit:** `2e92363`.

### 4. [Rule 3 - Blocking] Fixture existente de `findBySlug` quebrava com o gate

- **Encontrado em:** Task 2.
- **Problema:** o teste "combina os dados publicos..." mockava `findFirst` sem os 4 fatos de
  billing. Com o gate, `empresaPodePublicar` recebia `undefined` nos quatro campos, caia no
  fail-closed (`BLOQUEADO`) e o teste passaria a receber `null`.
- **Correcao:** fixture atualizada com `...BILLING.EM_DIA`, e a asercao de igualdade EXATA do
  retorno foi mantida — o que converteu o teste existente na prova de T-04-01 (os fatos entram na
  projecao e nao saem no corpo publico).
- **Commit:** `62b261a`.

## Notas de Implementacao

**`comRelogio` precisa ser `async` e dar `await` dentro do `try`.** Ao contrario de
`avaliarAcesso`, os metodos publicaveis do service leem o relogio internamente. Um wrapper
sincrono que restaurasse o relogio antes de a promise resolver devolveria o tempo REAL para a
decisao de acesso — o `new Date()` do service roda depois do primeiro `await` (a query), num
microtask posterior. O teste passaria hoje e comecaria a falhar sozinho no futuro.

**As duas diretivas `eslint-disable-next-line @typescript-eslint/no-unused-vars`** nas
desestruturacoes de descarte sao necessarias, nao decorativas: verificado com
`npx eslint --report-unused-disable-directives app/services/empresa.service.ts`, que nao reportou
diretiva ociosa.

## Known Stubs

Nenhum. Todas as funcoes deste plano estao implementadas e cobertas por teste.

**Nota de escopo (nao e stub):** `findPublicavelBySlug`, `findPublicavelById` e
`findBrandingBySlug` ainda **nao tem consumidor** em producao — este plano e explicitamente a
fundacao, e os 6 caminhos publicos so passam a chama-los nos planos 04-02/04-03/04-04. O gate que
ja esta ativo em producao a partir daqui e o de `findBySlug`.

## Threat Flags

Nenhuma superficie de seguranca nova fora do `<threat_model>` do plano. As mitigacoes atribuidas
foram implementadas: T-04-01 (desestruturacao dos 4 fatos + `null` uniforme), T-04-02 (1 query em
todo caminho de rejeicao, provado por contagem), T-04-08 (JSDoc normativo contra cache
cross-request), T-04-15 (`Record` exaustivo), T-04-SC (`package.json` intocado). T-04-12 segue
`accept` por decisao do plano — `findBrandingBySlug` responde para empresa bloqueada de proposito
(D-09), e o vazamento residual e reduzido no plano 04-04.

## Self-Check: PASSED

Arquivos criados verificados no disco:

- FOUND: `lib/empresa-publicavel.ts`
- FOUND: `lib/empresa-publicavel.test.ts`
- FOUND: `.planning/phases/04-aplica-o-do-bloqueio/04-01-SUMMARY.md`

Commits verificados em `git log`:

- FOUND: `6881035` test(04-01) RED task 1
- FOUND: `2e92363` feat(04-01) GREEN task 1
- FOUND: `62b261a` test(04-01) RED task 2
- FOUND: `05cfea1` feat(04-01) GREEN task 2

## TDD Gate Compliance

Os dois tasks seguiram RED -> GREEN, cada gate no seu proprio commit, na ordem correta
(`test(...)` antes de `feat(...)` em ambos). REFACTOR nao foi necessario e nao gerou commit vazio.
