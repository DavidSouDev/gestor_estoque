---
phase: 04-aplica-o-do-bloqueio
plan: 04
subsystem: acesso-e-bloqueio
tags: [acc-02, acc-03, d-09, t-04-12, branding-generico, achado-critico-2]

requires:
  - "empresaService.findBrandingBySlug (nao gateado) — plano 04-01"
  - "empresaService.findBySlug gateado por status — plano 04-01"
provides:
  - "getEmpresaBranding(slug) — loader de branding deliberadamente sem gate (app/[slug]/_lib/empresa.ts)"
  - "getEmpresaCatalogo(slug) documentado como caminho GATEADO, proibido em superficie pre-auth"
  - "BRANDING_GENERICO (#18181b / #3f3f46) na tela de login"
  - "prova automatizada de que catalogo 404a e login responde para o MESMO slug bloqueado"
affects:
  - "04-05 / 04-06: a tela de bloqueio pos-login herda a shell markup desta pagina e o mesmo glifo de cadeado"
  - "04-09: o gate de grep de cache cross-request agora cobre 2 loaders neste arquivo"

tech-stack:
  added: []
  patterns:
    - "Dois loaders irmaos no mesmo modulo: um gateado por status, outro nao, cada um com JSDoc normativo dizendo por que"
    - "Somente React.cache no caminho de leitura por request (ACC-04 / D-08, decisao [01-02])"
    - "Variante de UI data-only: valores trocados, strings de classe intocadas"
    - "Ternario encadeado para inserir uma variante sem reindentar o ramo existente"

key-files:
  created:
    - "app/[slug]/_lib/empresa.test.ts"
  modified:
    - "app/[slug]/_lib/empresa.ts"
    - "app/[slug]/admin/login/page.tsx"

decisions:
  - "O booleano `bloqueada` atravessa o loader ate a pagina em vez de o loader ja devolver branding trocado: a decisao e de APRESENTACAO, e centraliza-la no loader esconderia de quem le a pagina que existem duas variantes"
  - "O `<p>` subtitulo virou `{!bloqueada && <p .../>}` numa linha so, em vez de bloco indentado: mantem o literal de classe como linha de contexto no diff, o que e exatamente o que o gate data-only pede para conferir"
  - "O cadeado da variante bloqueada usa `h-8 w-8` — o mesmo tamanho que a UI-SPEC ja especifica para o cadeado do tile da tela de bloqueio (linha 265), e nao um tamanho novo"

metrics:
  duration: "~7min"
  tasks: 2
  files: 3
  commits: 3
  tests_added: 6
  completed: 2026-09-01
---

# Phase 04 Plan 04: Loader de Branding Sem Gate e Branding Generico no Login — Summary

A leitura que alimenta o catalogo e a que alimenta a tela de login deixaram de ser a mesma funcao:
para o mesmo slug bloqueado, o catalogo agora devolve 404 e o login continua respondendo 200 — com
o visual do sistema, nao o da loja.

## What Was Built

**Task 1 — `getEmpresaBranding` ao lado de `getEmpresaCatalogo`** (`app/[slug]/_lib/empresa.ts`)

- `getEmpresaBranding(slug)`: `React.cache` + `notFound()` sobre `empresaService.findBrandingBySlug`,
  forma identica ao loader existente. Devolve o branding com `bloqueada: boolean` e **nunca** gateia
  por status.
- JSDoc normativo nos dois loaders. No de branding: existe para que a tela de login de uma empresa
  BLOQUEADA continue respondendo 200 — se virasse 404, o cliente que quer pagar nao logaria, nao
  alcancaria a tela de bloqueio e nao teria caminho ate o pagamento. Proibicao explicita de
  acrescentar gate de status ali. No de catalogo: e o caminho GATEADO (ACC-03 / D-07), proibido em
  qualquer superficie pre-autenticacao.
- Somente o cache de request do React, com a razao escrita no proprio arquivo (ACC-04 / D-08,
  decisao `[01-02]` do STATE.md).
- `app/[slug]/_lib/empresa.test.ts` (NOVO, `@vitest-environment node`): `vi.hoisted` + mock de
  `next/navigation` no formato de `lib/session.test.ts`, cobrindo os 6 comportamentos de
  `<behavior>`.

**Task 2 — variante de branding generico no login (D-09)** (`app/[slug]/admin/login/page.tsx`)

- A pagina passou a consumir `getEmpresaBranding`. Efeito colateral valioso: ela deixou de carregar
  produtos, combos e promocoes inteiros (o fan-out de `findBySlug`) so para desenhar um logo — agora
  e uma query de branding.
- `BRANDING_GENERICO` (`#18181b` / `#3f3f46`) e as variaveis derivadas `primaryColor` /
  `accentColor` / `bloqueada`. Quando bloqueada: `<h1>` vira `Painel Administrativo`, o subtitulo
  some, o tile mostra o cadeado em vez de logo/inicial, e a ancora `← Voltar ao catálogo` nao e
  renderizada (o catalogo 404a — o link dead-endaria e por si so sinalizaria o estado).
- Comentario de bloco no topo do componente citando D-09 e T-04-12: o vazamento residual (404 no
  catalogo, 200 no login) e aceito, mitigado por branding generico, e a alternativa — 404 no login —
  trancaria o cliente do lado de fora.
- Nenhuma palavra sobre pagamento/assinatura/cobranca no que e renderizado; o assunto so aparece no
  comentario que explica por que ele nao pode aparecer.

## Key Implementation Detail: por que o `bloqueada` sobe ate a pagina

Seria mais curto fazer `getEmpresaBranding` ja devolver o branding generico quando a empresa esta
bloqueada — a pagina nem saberia da existencia das duas variantes. Foi rejeitado de proposito: o
loader e uma camada de **acesso a dados**, e trocar valores de marca ali transformaria uma decisao
de apresentacao em algo invisivel para quem le a tela. Pior, o proximo consumidor de branding
(a tela de bloqueio pos-login, plano 04-05/06) receberia o branding mascarado sem pedir — e la, ja
atras da autenticacao, mascarar nao faz sentido: o dono da loja sabe que a loja e dele. O booleano
sobe cru e cada superficie decide.

## Tasks Completed

| Task | Nome | Gate | Commit |
|------|------|------|--------|
| 1 | Loader de branding sem gate | RED | `9391808` |
| 1 | Loader de branding sem gate | GREEN | `2a3c797` |
| 2 | Branding generico no login (D-09) | — | `2e20b0c` |

Nenhum commit de REFACTOR: a implementacao saiu na forma final no GREEN.

## Verification Evidence

| Gate | Resultado |
|------|-----------|
| `npx vitest run "app/[slug]/_lib/empresa.test.ts"` | 6 testes, exit 0 |
| `npx vitest run "app/[slug]/_lib/empresa.test.ts" "app/[slug]/admin/_components/login-form.test.tsx"` | 2 arquivos, 9 testes, exit 0 |
| `npx vitest run` (suite inteira, regressao) | 81 arquivos, **782 testes**, exit 0 (era 776 + 6 novos) |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 erros (1 warning pre-existente: `Link` nao usado em `app/registro/page.tsx`, decisao `[01-04]`) |
| `grep -c "cache(" "app/[slug]/_lib/empresa.ts"` | **2** |
| `grep -n "findBrandingBySlug" "app/[slug]/_lib/empresa.ts"` | 1 linha (`:42`) |
| `grep -vE "^\s*(//\|\*\|/\*)" "app/[slug]/_lib/empresa.ts" \| grep -c "unstable_cache\|use cache"` | **0** |
| `grep -n "getEmpresaCatalogo" "app/[slug]/admin/login/page.tsx"` | nenhuma linha |
| `grep -n "getEmpresaBranding" "app/[slug]/admin/login/page.tsx"` | 2 linhas (`:3` import, `:49` chamada) |
| `grep -n "#18181b" "app/[slug]/admin/login/page.tsx"` | 2 linhas (`:10` JSDoc, `:15` valor) |
| `grep -inE "pagamento\|assinatura\|suspens\|cobran" login/page.tsx \| grep -vE "^\s*[0-9]+:\s*(//\|\*\|/\*)"` | nenhuma linha — os termos so existem em comentario |
| `grep -rn "getEmpresaCatalogo" app` | so `(catalogo)/page.tsx`, `(catalogo)/layout.tsx`, `_lib/empresa.ts` e o teste novo |
| `git diff HEAD~2 HEAD --stat -- package.json package-lock.json` | vazio (T-04-SC: nenhum pacote novo) |

Prova de nao-vacuidade (RED antes de GREEN): a Task 1 falhou com **3 testes** vermelhos
(`getEmpresaBranding is not a function`) e 3 verdes — os 3 verdes sao os de `getEmpresaCatalogo`,
que ja estavam corretos porque o gate mora no service desde o plano 04-01. O RED nao foi vacuo: os
tres casos vermelhos sao exatamente os do comportamento novo.

### Gate data-only da UI (criterio de aceite da Task 2)

`git diff "app/[slug]/admin/login/page.tsx" | grep -E "^[-+].*className" | grep -v "^[-+][^-+]*{"`
devolve 6 linhas. Conferidas uma a uma, **nenhum literal de classe Tailwind existente foi alterado**:

| Linha do gate | Natureza |
|---------------|----------|
| `+ className="h-8 w-8"` | **classe nova**, no `<svg>` do cadeado que a UI-SPEC §Generic-branding login copy (tile) e §Iconography mandam renderizar. `h-8 w-8` e o mesmo tamanho que a UI-SPEC ja fixa para o cadeado da tela de bloqueio (linha 265) |
| `-`/`+` do `<h1 ...>` | literal `text-xl font-bold text-slate-800` byte-identico nos dois lados; mudou so a expressao dentro da tag. A linha nao foi filtrada porque os hifens dos nomes de classe casam com `[^-+]*` antes do `{` |
| `-` do `<p ...>` | o `+` correspondente (`{!bloqueada && <p className="mt-1 text-sm text-slate-500">…`) FOI filtrado pelo grep; mesmo literal, envolvido numa condicao |
| `-`/`+` da ancora | movimento de indentacao de +2 espacos por causa do `{!bloqueada && (…)}`; literal byte-identico |

O `font-bold` do `<h1>` continua onde estava (UI-SPEC §Typography "Legacy weight carve-out").

## Deviations from Plan

### 1. [Rule 3 - Blocking] `npx tsc --noEmit` falhava por tipos gerados ausentes no worktree

- **Encontrado em:** Task 1, no criterio de aceite de tsc.
- **Problema:** `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'` — tipo GLOBAL
  gerado pelo Next em `.next/types/**`, que um worktree recem-criado nunca gerou. Identico ao
  desvio 1 do plano 04-01.
- **Correcao:** `npx next typegen` (exit 0). `npx tsc --noEmit` passou a sair 0.
- **Arquivos versionados alterados:** nenhum (`.next/` e gitignored).
- **Commit:** nenhum.

## Notas de Implementacao

**O ternario encadeado no tile do logo nao e estilistico.** Escrever
`{bloqueada ? (<svg/>) : empresa.logo ? (<img/>) : (empresa.nome.charAt(0))}` mantem o ramo do
`<img>` na MESMA profundidade de indentacao de antes — extrair a variante para um bloco aninhado
teria reindentado o `<img className="h-full w-full rounded-2xl object-cover" />` e produzido um par
`-`/`+` de literal de classe no diff, exatamente o ruido que o gate data-only existe para detectar.

**`React.cache` nao memoiza fora de um contexto de render.** Por isso o teste usa um slug distinto
por caso dentro de cada loader (e reaproveita `"bloqueada"` entre loaders diferentes, que tem caches
independentes): o teste continua correto se o comportamento de memoizacao mudar.

## Known Stubs

Nenhum. Os dois loaders e as duas variantes da tela estao implementados e cobertos.

## Threat Flags

Nenhuma superficie de seguranca nova fora do `<threat_model>` do plano. As mitigacoes atribuidas
foram implementadas: T-04-12 (branding generico + proibicao textual de citar cobranca na tela),
T-04-01 (`getEmpresaCatalogo` segue chamando `notFound()`), T-04-10 (`getEmpresaBranding` sem gate,
mantendo o caminho de pagamento aberto), T-04-08 (somente `React.cache`, gate de grep verde),
T-04-SC (`package.json` intocado).

## Self-Check: PASSED

Arquivos verificados no disco:

- FOUND: `app/[slug]/_lib/empresa.ts`
- FOUND: `app/[slug]/_lib/empresa.test.ts`
- FOUND: `app/[slug]/admin/login/page.tsx`
- FOUND: `.planning/phases/04-aplica-o-do-bloqueio/04-04-SUMMARY.md`

Commits verificados em `git log`:

- FOUND: `9391808` test(04-04) RED task 1
- FOUND: `2a3c797` feat(04-04) GREEN task 1
- FOUND: `2e20b0c` feat(04-04) task 2

## TDD Gate Compliance

A Task 1 (`tdd="true"`) seguiu RED -> GREEN, cada gate no seu proprio commit e na ordem correta
(`test(04-04)` antes de `feat(04-04)`). REFACTOR nao foi necessario e nao gerou commit vazio. A
Task 2 e `type="auto"` sem `tdd`, coberta pelos testes de componente existentes do `LoginForm` mais
os gates de grep/tsc/lint do plano.
