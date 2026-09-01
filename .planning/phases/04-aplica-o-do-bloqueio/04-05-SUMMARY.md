---
phase: 04-aplica-o-do-bloqueio
plan: 05
subsystem: acesso-e-bloqueio
tags: [acc-01, acc-02, server-action, checkout, tela-de-bloqueio, ui]

requires:
  - "assinaturaService.criarCheckout(empresaId) — Fase 03-01"
  - "getVerifiedSession — lib/session.ts (Fase 01)"
  - "revalidarConta / ContaAtiva.statusAcesso — lib/auth-guard.ts (Fase 02)"
  - "acessoBloqueado(status) — lib/avaliar-acesso.ts (plano 04-01)"
  - "logout(slug) — app/[slug]/admin/_lib/auth-actions.ts (Fase 01, REUSADA sem reescrita)"
  - "empresaService.findHeaderData(id) — Fase 01"
provides:
  - "iniciarPagamento(slug) — Server Action de checkout, sem token no cliente"
  - "PagarButton (variant: banner | bloqueado) — CTA unico de pagamento"
  - "BloqueadoCard — markup da tela de suspensao"
  - "rota /[slug]/admin/bloqueado, FORA do grupo (protected)"
affects:
  - "04-06: requireAdminSession passa a redirecionar para /[slug]/admin/bloqueado (destino ja existe)"
  - "04-07 (banner de carencia): consome PagarButton variant=banner e iniciarPagamento"
  - "04-08 (e2e): a rota e o alvo do assert de ausencia de loop de redirect"

tech-stack:
  added: []
  patterns:
    - "Server Action como CTA autenticado: cookie httpOnly + CSRF embutido, zero rede no cliente"
    - "redirect() SEMPRE fora do try — NEXT_REDIRECT seria engolido pelo catch"
    - "Rota de escape fora do route group cujo layout a redireciona (anti-loop estrutural)"
    - "useFormStatus (nao o hook de estado de action) quando a action devolve void e termina em redirect"
    - "Igualdade de props entre dois status como prova executavel de 'uma copia so' (D-06)"

key-files:
  created:
    - "app/[slug]/admin/_lib/assinatura-actions.ts"
    - "app/[slug]/admin/_lib/assinatura-actions.test.ts"
    - "app/[slug]/admin/_components/pagar-button.tsx"
    - "app/[slug]/admin/_components/pagar-button.test.tsx"
    - "app/[slug]/admin/bloqueado/page.tsx"
    - "app/[slug]/admin/bloqueado/page.test.ts"
    - "app/[slug]/admin/bloqueado/_components/bloqueado-card.tsx"
    - "app/[slug]/admin/bloqueado/_components/bloqueado-card.test.tsx"
  modified: []

decisions:
  - "D-06 e provado por igualdade de PROPS (BLOQUEADO vs CANCELADO), nao por snapshot de HTML: as duas actions ligadas por .bind sao funcoes distintas a cada chamada, entao um snapshot compararia identidade de funcao e nao a copia"
  - "O caso defensivo de conta nula na rota bloqueado vai para /admin (condicao unica do plano), nao para o login: getVerifiedSession ja revalidou a conta no MESMO request e a revalidacao e deduplicada, entao o caminho e inalcancavel na pratica; o que o teste trava e que a tela nunca renderize sem conta"
  - "PagarButton importa por caminho relativo (../../_components/pagar-button) seguindo o precedente local de app/[slug]/**; o alias @/ continua usado para lib/ e services/"
  - "A variante bloqueado ganha focus:ring-2 dentro da propria constante de classe, em vez de concatenacao condicional no JSX — mantem o gate de 'string copiada da UI-SPEC' legivel num lugar so"

metrics:
  duration: "~9min"
  tasks: 3
  files: 8
  commits: 6
  tests_added: 29
  completed: 2026-09-01
---

# Phase 04 Plan 05: Caminho de Pagamento e Tela de Bloqueio — Summary

O cliente suspenso agora tem para onde ir e por onde pagar: uma rota dedicada fora do grupo
protegido, um CTA que nunca toca a rede a partir do browser, e uma Server Action que leva o
navegador ao checkout hospedado sem expor um único token ao JavaScript do cliente.

## What Was Built

**Task 1 — `iniciarPagamento`** (`app/[slug]/admin/_lib/assinatura-actions.ts`)

Server Action de uma única export, `"use server"` na primeira linha. Lê a sessão com
`getVerifiedSession` — a variante que **não** bloqueia por status de acesso — confere
`session.empresaSlug === slug`, chama `assinaturaService.criarCheckout(session.empresaId)` direto
(sem passar por HTTP) e redireciona o navegador para a URL absoluta externa devolvida. Falha do
gateway vira `console.error("[assinatura] …")` e `?erro=checkout`; nada da resposta do Asaas chega
ao usuário.

**Task 2 — `PagarButton`** (`app/[slug]/admin/_components/pagar-button.tsx`)

Client component com `useFormStatus`, duas variantes visuais e uma única string de rótulo. Vive
sempre dentro de um `<form action={iniciarPagamento.bind(null, slug)}>`. Sem `onClick`, sem
chamada de rede, sem hook de estado de action — a action devolve `void` e termina em `redirect()`.

**Task 3 — rota `/[slug]/admin/bloqueado`** (`page.tsx` + `_components/bloqueado-card.tsx`)

Guarda simétrica própria (sessão → tenant → `acessoBloqueado`), branding com o mesmo fallback do
layout do painel, e um card sem nenhum chrome de admin: cadeado âmbar, `<h1>` único
`Acesso suspenso`, uma frase para os dois rótulos de suspensão, bloco de erro inline condicional,
CTA de pagamento e `Sair da conta` (reusando a action `logout` existente).

## Key Implementation Detail: a posição do arquivo é a mitigação

O ponto não óbvio deste plano não é o markup — é **onde a pasta mora**. A partir do plano 04-06,
a DAL de sessão do admin passa a mandar empresa bloqueada para esta rota. Se a rota morasse dentro
de `(protected)`, entrar nela dispararia o layout que acabou de mandar o usuário para ela:
`ERR_TOO_MANY_REDIRECTS`, e o cliente que quer pagar fica preso num loop. Nenhuma linha de código
dentro do arquivo evita isso; o que evita é a árvore de diretórios. Por isso o critério de aceite
é um `ls` que **falha** (`app/[slug]/admin/(protected)/bloqueado` não existe) e por isso o
comentário de bloco no topo da página registra o incidente da Fase 1 — mover a pasta reintroduz o
bug sem alterar uma linha (T-04-14).

O mesmo raciocínio de "estrutura como garantia" aparece duas vezes mais: `redirect()` fora do
`try` (dentro, o `catch` engoliria `NEXT_REDIRECT` e a navegação simplesmente não aconteceria), e
a escolha de `getVerifiedSession` em vez da DAL bloqueante — o caminho de pagamento é o único que
uma empresa suspensa ainda percorre, e blindá-lo trancaria o cliente do lado de fora sem meio de
voltar (T-04-10).

## Tasks Completed

| Task | Nome | Gate | Commit |
|------|------|------|--------|
| 1 | Server Action `iniciarPagamento` | RED | `1101d7a` |
| 1 | Server Action `iniciarPagamento` | GREEN | `6fa2dbd` |
| 2 | `PagarButton` | RED | `2797fd3` |
| 2 | `PagarButton` | GREEN | `722bf63` |
| 3 | Rota `bloqueado` + `BloqueadoCard` | RED | `c22f859` |
| 3 | Rota `bloqueado` + `BloqueadoCard` | GREEN | `193521f` |

Nenhum commit de REFACTOR: as três implementações saíram na forma final no GREEN.

## Verification Evidence

| Gate | Resultado |
|------|-----------|
| `npx vitest run` nos 4 arquivos do plano | 4 arquivos, **29 testes**, exit 0 |
| `npx vitest run` (suíte inteira, regressão) | 84 arquivos, **805 testes**, exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 erros (1 warning pré-existente: `Link` não usado em `app/registro/page.tsx`) |
| `git diff --stat package.json` | vazio (T-04-SC: nenhum pacote novo) |
| `head -1 assinatura-actions.ts` | `"use server";` |
| `grep -n "fetch(\|requireAdminSession" assinatura-actions.ts` | nenhuma linha |
| `awk '/try \{/,/\}/' assinatura-actions.ts \| grep -c "redirect("` | **0** |
| `head -1 pagar-button.tsx` | `"use client";` |
| `grep -c "Pagar agora" pagar-button.tsx` | **1** |
| `grep -n "onClick\|fetch(\|useActionState\|py-2.5" pagar-button.tsx` | nenhuma linha |
| `grep -n "bg-amber-600" pagar-button.tsx` | 1 linha (`:28`) |
| `ls -d "app/[slug]/admin/bloqueado"` | existe |
| `ls -d "app/[slug]/admin/(protected)/bloqueado"` | falha (exit 2) — a rota NÃO está no grupo protegido |
| `grep -n "requireAdminSession" bloqueado/page.tsx` | nenhuma linha |
| `grep -n "AdminNav\|SimplesTopBar"` nos dois arquivos da rota | nenhuma linha |
| `grep -c "acessoBloqueado" bloqueado/page.tsx` | **2** (import + uso) |
| `grep -c "<h1" bloqueado-card.tsx` | **1** |
| `grep -c "statusAcesso" bloqueado-card.tsx` | **0** (a cópia não ramifica — D-06) |

Prova de não-vacuidade (RED antes de GREEN): os três RED falharam por módulo inexistente
(`Cannot find module './assinatura-actions'`, `Failed to resolve import "./pagar-button"`,
`Failed to resolve import "./bloqueado-card"`), com 0 testes executados em cada.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `npx tsc --noEmit` falhava por tipos gerados ausentes no worktree

- **Encontrado em:** Task 1, no critério de aceite de tsc.
- **Problema:** `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'` — tipo GLOBAL
  gerado pelo Next em `.next/types/**`, que um worktree recém-criado nunca teve.
- **Correção:** `npx next typegen` (exit 0), exatamente como o plano 04-01 já havia documentado.
- **Arquivos versionados alterados:** nenhum (`.next/` é gitignored).
- **Commit:** nenhum.

### 2. [Rule 1 - Bug no critério de aceite] O gate `py-2.5` casava com o próprio comentário exigido

- **Encontrado em:** Task 2, ao validar os critérios de aceite.
- **Problema:** o critério exige que `grep -n "py-2.5"` não retorne nenhuma linha, mas a ação do
  plano manda documentar o alvo de toque de 44px — e a forma natural de escrever isso cita
  literalmente o valor proibido. Mesma classe de gate auto-derrotado que o plano 04-01 encontrou
  duas vezes.
- **Correção:** a prosa do JSDoc foi reescrita preservando a norma sem o literal ("o padding
  vertical de 10px usado nos inputs do login rende 40px e é proibido em botões nesta fase"). O
  gate ficou verde de verdade, sem enfraquecer a documentação.
- **Arquivos modificados:** `app/[slug]/admin/_components/pagar-button.tsx` (apenas comentário).
- **Commit:** `722bf63`.

### 3. [Rule 1 - Bug no critério de aceite] O mesmo conflito com `requireAdminSession` na página

- **Encontrado em:** Task 3.
- **Problema:** o critério exige que `grep -n "requireAdminSession"` não retorne nada em
  `bloqueado/page.tsx`, enquanto a ação do plano manda comentar que "o layout de `(protected)`
  chama `requireAdminSession`, que redireciona empresa bloqueada para cá".
- **Correção:** o comentário nomeia a função por descrição ("a DAL de sessão do admin") em vez do
  identificador. O conteúdo normativo — inclusive a referência ao incidente da Fase 1 e a T-04-14 —
  está inteiro no topo do arquivo.
- **Commit:** `193521f`.

### 4. [Rule 1 - Teste corrigido] Caso defensivo de conta nula apontava para o destino errado

- **Encontrado em:** Task 3, no GREEN.
- **Problema:** o teste RED que escrevi afirmava que `revalidarConta === null` deveria redirecionar
  para o login, mas o plano especifica uma condição ÚNICA (`!conta || !acessoBloqueado(...)`) com
  destino `/admin`. A condição única é o que mantém `grep -c "acessoBloqueado"` em 2 e evita um
  segundo caminho de rejeição que alguém possa instrumentar diferente depois.
- **Correção:** o teste passou a afirmar o destino do plano, com comentário explicando que o caso é
  inalcançável na prática (`getVerifiedSession` já revalidou a conta no mesmo request, e
  `revalidarConta` é deduplicada por `React.cache`) e que o que ele trava é a tela **nunca**
  renderizar sem conta confirmada. O destino `/admin` aplica a guarda completa de qualquer forma.
- **Commit:** `193521f`.

## Notas de Implementação

**O mock de `react-dom` precisa de `importOriginal`.** `@testing-library/react` consome
`react-dom/client`; substituir o módulo inteiro por `{ useFormStatus }` derruba o próprio `render`
e o teste falha por um motivo que não tem nada a ver com o componente.

**D-06 não dá para provar por snapshot.** A página passa `iniciarPagamento.bind(null, slug)` e
`logout.bind(null, slug)` como props, e `.bind` devolve uma função nova a cada chamada — um
snapshot compararia identidade de função, não cópia. O teste compara o `type` do elemento e os
props **visuais** entre `BLOQUEADO` e `CANCELADO`, que é exatamente a superfície que o contrato
trava.

**O mock de `redirect` tem que lançar.** Um mock que só registrasse a chamada deixaria a execução
seguir depois do redirect e esconderia justamente o bug que o `redirect`-fora-do-`try` existe para
evitar. O molde veio de `lib/session.test.ts`.

## Known Stubs

Nenhum. Os quatro artefatos estão implementados e cobertos por teste.

**Nota de escopo (não é stub):** a variante `banner` do `PagarButton` ainda não tem consumidor —
quem a monta é o banner de carência (ACC-01), em plano posterior desta fase. Ela é construída
aqui de propósito, para que exista **um** CTA de pagamento e não dois. Do mesmo modo, ninguém
ainda redireciona para `/[slug]/admin/bloqueado` em produção: o gate da DAL é o plano 04-06, e a
ordem foi escolhida para que o repositório nunca passe por um estado em que o bloqueio manda o
usuário para um 404.

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As mitigações atribuídas
foram implementadas: T-04-09 (Server Action com CSRF embutido, nenhum token exposto ao cliente),
T-04-10 (`getVerifiedSession` na action, `logout` reusada sem guarda de status, rota fora do grupo
protegido), T-04-14 (rota fora de `(protected)` + guarda simétrica própria, com gate de estrutura
de diretório), T-04-16 (só `console.error` com prefixo `[assinatura]`; usuário vê frase genérica),
T-04-17 (tenant exclusivamente de `session.empresaId`, provado por um teste que injeta
`empresaId` hostil no `FormData`), T-04-SC (`package.json` intocado).

## Self-Check: PASSED

Arquivos verificados no disco:

- FOUND: `app/[slug]/admin/_lib/assinatura-actions.ts`
- FOUND: `app/[slug]/admin/_lib/assinatura-actions.test.ts`
- FOUND: `app/[slug]/admin/_components/pagar-button.tsx`
- FOUND: `app/[slug]/admin/_components/pagar-button.test.tsx`
- FOUND: `app/[slug]/admin/bloqueado/page.tsx`
- FOUND: `app/[slug]/admin/bloqueado/page.test.ts`
- FOUND: `app/[slug]/admin/bloqueado/_components/bloqueado-card.tsx`
- FOUND: `app/[slug]/admin/bloqueado/_components/bloqueado-card.test.tsx`

Commits verificados em `git log`:

- FOUND: `1101d7a` test(04-05) RED task 1
- FOUND: `6fa2dbd` feat(04-05) GREEN task 1
- FOUND: `2797fd3` test(04-05) RED task 2
- FOUND: `722bf63` feat(04-05) GREEN task 2
- FOUND: `c22f859` test(04-05) RED task 3
- FOUND: `193521f` feat(04-05) GREEN task 3

## TDD Gate Compliance

As três tasks seguiram RED → GREEN, cada gate no seu próprio commit e na ordem correta
(`test(...)` antes de `feat(...)` em todas). REFACTOR não foi necessário e não gerou commit vazio.
