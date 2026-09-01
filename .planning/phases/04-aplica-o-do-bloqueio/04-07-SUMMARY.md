---
phase: 04-aplica-o-do-bloqueio
plan: 07
subsystem: acesso-e-bloqueio
tags: [acc-01, banner, carencia, ui, layout, server-component]

requires:
  - "diasRestantesDeCarencia(carenciaAte, agora) — lib/avaliar-acesso.ts (plano 04-01)"
  - "PagarButton variant=banner — app/[slug]/admin/_components/pagar-button.tsx (plano 04-05)"
  - "iniciarPagamento(slug) — app/[slug]/admin/_lib/assinatura-actions.ts (plano 04-05)"
  - "revalidarConta / ContaAtiva.statusAcesso + carenciaAte — lib/auth-guard.ts (Fase 02)"
  - "requireAdminSession(slug) — lib/session.ts (Fase 01)"
provides:
  - "AvisoCarencia + AvisoCarenciaProps — banner de carencia (ACC-01)"
  - "renderizacao do banner acima do conteudo nos DOIS branches de (protected)/layout.tsx"
  - "primeiro consumidor da variante banner do PagarButton"
affects:
  - "04-09 (gates da fase): o grep de ausencia sob app/[slug]/(catalogo) ja passa"
  - "04-08 (e2e): o banner e o alvo visual do caminho de carencia"
  - "Fase 7: se um segundo aviso aparecer, este e o n=1 do qual extrair um Alert generico"

tech-stack:
  added: []
  patterns:
    - "Componente de aviso como funcao pura de um numero: relogio lido no layout, injetado na lib pura, nunca no componente"
    - "Um unico no de banner montado antes dos returns e renderizado nos dois branches — impossivel cobrir um modo e esquecer o outro"
    - "revalidarConta chamada de novo no layout por React.cache: le status vivo sem segunda query"
    - "Comentario normativo no layout registrando que ele NAO e boundary de autorizacao (Next 16 partial rendering)"

key-files:
  created:
    - "app/[slug]/admin/(protected)/_components/aviso-carencia.tsx"
    - "app/[slug]/admin/(protected)/_components/aviso-carencia.test.tsx"
  modified:
    - "app/[slug]/admin/(protected)/layout.tsx"

decisions:
  - "O corpo do aviso e escolhido por `diasRestantes <= 0` e nao `=== 0`: diasRestantesDeCarencia ja garante >= 0, mas fechar o caso por <= elimina qualquer chance de um chamador futuro cair no ramo do plural com um numero negativo"
  - "carenciaAte e extraida para uma const antes do calculo (`conta?.statusAcesso === CARENCIA ? conta.carenciaAte : null`) em vez do `emCarencia && conta.carenciaAte !== null` literal do plano: a forma do plano nao estreita o tipo Date|null para o argumento de diasRestantesDeCarencia e nao compila; a const preserva a semantica e o narrowing por alias mantem tsc limpo"
  - "Os literais `{children}` e as palavras dos greps de gate foram mantidos fora dos comentarios: os criterios de aceite contam ocorrencias textuais, e a prosa normativa casaria com o proprio gate (mesmo conflito ja documentado nos planos 04-01 e 04-05)"

metrics:
  duration: "~7min"
  tasks: 2
  files: 3
  commits: 3
  tests_added: 8
  completed: 2026-09-01
---

# Phase 04 Plan 07: Banner de Carência — Summary

Durante a carência, todo o painel — nos dois modos de interface — passa a exibir um aviso âmbar
persistente com os dias restantes e o mesmo botão de pagamento da tela de suspensão, enquanto o
catálogo público segue intocado.

## What Was Built

**Task 1 — `AvisoCarencia`** (`app/[slug]/admin/(protected)/_components/aviso-carencia.tsx`)

Server component sem `"use client"`: o único pedaço interativo é o `PagarButton` do plano 04-05,
que já é client. Recebe `diasRestantes: number` e `pagarAction: () => Promise<void>` e não faz mais
nada — uma função de um número para um `<section>`. As três variantes de cópia (`vence hoje` /
`vence amanhã` / `vence em N dias`) saem de uma função local pura, com as strings copiadas
literalmente da UI-SPEC, inclusive a menção ao catálogo. Sem botão de fechar, sem adiar, sem estado.

**Task 2 — renderização nos dois branches** (`app/[slug]/admin/(protected)/layout.tsx`)

O layout passa a chamar `revalidarConta` para ler o status vivo, calcula os dias restantes com o
relógio lido ali mesmo e monta **um único** nó `bannerCarencia` **antes** dos dois `return`. Esse nó
é renderizado acima do conteúdo dentro do `<main>` no branch SIMPLES e no branch COMPLETO.

## Key Implementation Detail: o banner é montado uma vez e usado duas

O modo de falha óbvio deste plano é implementar o aviso, testá-lo no modo COMPLETO e deixar o modo
SIMPLES sem ele — ACC-01 exige *todas* as telas do admin, e o modo de interface é escolha do tenant.
A defesa não é disciplina: é montar `bannerCarencia` uma única vez, acima dos dois `return`, de modo
que os branches compartilhem literalmente a mesma expressão. Cobrir um e esquecer o outro passa a
exigir uma edição deliberada em dois lugares, e o critério de aceite conta exatamente três
ocorrências do símbolo (uma definição, dois usos).

O segundo ponto não óbvio é **o que o layout deliberadamente não faz**. Seria natural, tendo o status
em mãos, renderizar a tela de suspensão no lugar do conteúdo. No App Router isso é uma barreira
puramente visual: os segmentos filhos continuam executando e continuam saindo no RSC Payload, e o
layout sequer re-renderiza em navegação client-side. O arquivo carrega um comentário normativo
proibindo essa transformação e apontando para a DAL de sessão como o boundary real (T-04-06).

Pelo mesmo motivo o `new Date()` mora no layout e não no componente: a aritmética de fuso tem um
único dono (`diasRestantesDeCarencia`), o componente é testável sem nenhum controle artificial de
tempo, e o gate de grep que proíbe leitura de relógio dentro do banner é o que mantém isso verdadeiro
para o próximo editor (T-04-20).

## Tasks Completed

| Task | Nome | Gate | Commit |
|------|------|------|--------|
| 1 | `AvisoCarencia` | RED | `b65532f` |
| 1 | `AvisoCarencia` | GREEN | `72f34c8` |
| 2 | Banner nos dois branches do layout | — | `ca2f479` |

Nenhum commit de REFACTOR: o componente saiu na forma final no GREEN.

## Verification Evidence

| Gate | Resultado |
|------|-----------|
| `npx vitest run "app/[slug]/admin/(protected)/_components/aviso-carencia.test.tsx"` | 1 arquivo, **8 testes**, exit 0 |
| `npm test` (suíte inteira, regressão) | 86 arquivos, **851 testes**, exit 0 |
| `npx tsc --noEmit` | exit 0, sem saída |
| `npm run lint` | 0 erros (1 warning pré-existente: `Link` não usado em `app/registro/page.tsx`) |
| `git diff --stat package.json` | vazio (T-04-SC: nenhum pacote novo) |
| `grep -n "new Date()\|Date.now()\|toLocaleDateString\|useState\|localStorage" aviso-carencia.tsx` | nenhuma linha (exit 1) |
| `grep -c "role=\"status\"" aviso-carencia.tsx` | **1** |
| `grep -c "role=\"alert\"" aviso-carencia.tsx` | **0** |
| `grep -c "Pagamento pendente" aviso-carencia.tsx` | **1** |
| `grep -c "vence hoje\|vence amanhã\|vence em" aviso-carencia.tsx` | **3** |
| `grep -c "bannerCarencia" layout.tsx` | **3** (1 definição + 2 usos) |
| `grep -c "{children}" layout.tsx` | **2** (os dois branches continuam existindo) |
| `grep -c "diasRestantesDeCarencia" layout.tsx` | **2** (import + uso) |
| `grep -rn "AvisoCarencia\|aviso-carencia" "app/[slug]/(catalogo)"` | nenhuma linha (T-04-19) |
| `grep -n "Bloqueado\|bloqueado" layout.tsx` | nenhuma linha, nem de código nem de comentário (T-04-06) |

Prova de não-vacuidade (RED antes de GREEN): o RED falhou na resolução do import
(`Failed to resolve import "./aviso-carencia"`), com **0 testes executados**.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `npx tsc --noEmit` falhava por tipos gerados ausentes no worktree

- **Encontrado em:** antes da Task 1, na preparação do ambiente.
- **Problema:** `Cannot find name 'LayoutProps'` — tipo GLOBAL que o Next gera em `.next/types/**`,
  inexistente num worktree recém-criado. Mesmo achado dos planos 04-01 e 04-05.
- **Correção:** `npx next typegen` (exit 0).
- **Arquivos versionados alterados:** nenhum (`.next/` é gitignored).
- **Commit:** nenhum.

### 2. [Rule 3 - Blocking] A forma literal do cálculo no plano não compila

- **Encontrado em:** Task 2.
- **Problema:** o plano especifica
  `const emCarencia = conta?.statusAcesso === StatusAcesso.CARENCIA && conta.carenciaAte !== null;`
  seguido de `diasRestantesDeCarencia(conta.carenciaAte, new Date())`. A assinatura da função exige
  `Date`, e o TypeScript não propaga o estreitamento feito dentro de `emCarencia` para o acesso
  posterior a `conta.carenciaAte`, que continua `Date | null` — erro de compilação.
- **Correção:** a data é extraída antes,
  `const carenciaAte = conta?.statusAcesso === StatusAcesso.CARENCIA ? conta.carenciaAte : null;`,
  e `emCarencia` vira `carenciaAte !== null`. O narrowing por alias de const cobre as duas
  utilizações e `tsc` fica limpo. A semântica é idêntica à do plano (só há banner quando o status é
  `CARENCIA` **e** existe data de fim de carência) e todos os critérios de contagem seguem válidos.
- **Arquivos modificados:** `app/[slug]/admin/(protected)/layout.tsx`.
- **Commit:** `ca2f479`.

### 3. [Rule 1 - Bug no critério de aceite] A prosa normativa casava com o próprio gate

- **Encontrado em:** Task 2, ao validar os critérios de aceite.
- **Problema:** o critério exige `grep -c "{children}"` = 2, mas a ação do plano manda escrever um
  comentário registrando que o layout não pode substituir `{children}` por uma tela de bloqueio — e
  a forma natural de escrever isso cita o literal, elevando a contagem para 4. Terceira ocorrência
  desta classe de gate auto-derrotado nesta fase (planos 04-01 e 04-05 documentam as anteriores).
- **Correção:** o comentário passou a nomear o alvo por descrição ("o conteúdo da rota", "o conteúdo
  filho") em vez do literal. O conteúdo normativo — inclusive a citação a
  `node_modules/next/dist/docs/01-app/02-guides/authentication.md` e a T-04-06 — está inteiro. Pela
  mesma razão, os comentários evitam a palavra do gate de "não é boundary de bloqueio" e nomeiam a
  tela como "de suspensão", deixando o gate verde sem enfraquecer o registro.
- **Arquivos modificados:** `app/[slug]/admin/(protected)/layout.tsx`.
- **Commit:** `ca2f479`.

## Notas de Implementação

**O `PagarButton` não precisa de mock de `react-dom` neste teste.** Fora de um envio em andamento,
`useFormStatus` devolve o estado default (`pending: false`), então o botão renderiza com o rótulo
`Pagar agora` sem nenhuma substituição de módulo — mesmo caminho que o teste do `BloqueadoCard` já
usa. O mock com `importOriginal` só é necessário quando o teste precisa *forçar* o estado pendente.

**O teste conta os botões.** Além de procurar por um controle chamado `fechar|dispensar`, ele afirma
`getAllByRole("button")` com comprimento 1. Um botão de dispensar com qualquer outro rótulo (um `×`,
um "Depois") escaparia do regex, mas não da contagem.

**Nenhum teste novo para o layout.** `app/**/layout.tsx` está excluído da cobertura por configuração
(`vitest.config.mts:23`) e o plano não pediu teste de layout; o que trava o comportamento dele são os
critérios de contagem de símbolos e o e2e do plano 04-08.

## Known Stubs

Nenhum. O banner está implementado, ligado nos dois branches e coberto por teste.

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As mitigações atribuídas
foram implementadas: T-04-06 (comentário normativo + o layout continua hospedando só UI, sem
nenhum caminho que substitua o conteúdo filho), T-04-19 (nenhuma referência ao banner sob
`app/[slug]/(catalogo)`, provado por grep), T-04-20 (aritmética exclusivamente em
`diasRestantesDeCarencia`, com relógio injetado pelo layout e gate de grep proibindo leitura de
relógio no componente), T-04-08 (`revalidarConta` via `React.cache`; nenhum cache cross-request
introduzido), T-04-SC (`package.json` intocado; SVG inline, nenhuma biblioteca de banner).

## Self-Check: PASSED

Arquivos verificados no disco:

- FOUND: `app/[slug]/admin/(protected)/_components/aviso-carencia.tsx`
- FOUND: `app/[slug]/admin/(protected)/_components/aviso-carencia.test.tsx`
- FOUND: `app/[slug]/admin/(protected)/layout.tsx`

Commits verificados em `git log`:

- FOUND: `b65532f` test(04-07) RED task 1
- FOUND: `72f34c8` feat(04-07) GREEN task 1
- FOUND: `ca2f479` feat(04-07) task 2

## TDD Gate Compliance

A Task 1 (`tdd="true"`) seguiu RED → GREEN, cada gate no seu próprio commit e na ordem correta
(`test(...)` antes de `feat(...)`). REFACTOR não foi necessário e não gerou commit vazio. A Task 2
não é marcada como TDD no plano — é integração de um componente já testado no layout, cujo gate é a
contagem de símbolos mais a suíte inteira em verde.
