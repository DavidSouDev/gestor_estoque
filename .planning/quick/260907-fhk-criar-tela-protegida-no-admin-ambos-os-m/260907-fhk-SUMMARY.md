---
phase: quick-260907-fhk
plan: 01
subsystem: ui
tags: [next, react, server-component, termos-de-uso, navegacao, acessibilidade]

# Dependency graph
requires:
  - phase: 06-termos-de-uso
    provides: "`lib/termo-vigente.ts` (leitura da versão vigente, deduplicada por React.cache), `TermoDeUso` imutável e o Gate 4 de `scripts/gates-fase-06.mjs`"
  - phase: 07-gest-o-de-assinatura
    provides: "`(protected)/assinatura/page.tsx` como modelo estrutural de rota protegida e o precedente de ícone irmão na `SimplesTopBar` (quick 260907-ejn)"
provides:
  - "Rota `/{slug}/admin/termos` — releitura só-leitura dos Termos de Uso vigentes dentro do painel protegido"
  - "`TermoLeituraCard`, card puro com caixa rolável acessível e estado vazio honesto"
  - "Caminho de navegação visível até a tela nos DOIS modos de interface (item na `AdminNav`, quarto ícone na `SimplesTopBar`)"
  - "Gate 4 da Fase 6 estendido à superfície nova de termos"
affects: [termos-de-uso, navegacao-do-admin, futuras-telas-do-painel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server component protegido que chama `requireAdminSession` na PRÓPRIA page, prova a ordem por asserção negativa no teste"
    - "Card de leitura sem prop de `id` e sem prop de cor — o contrato magro é o que impede a tela de virar um segundo gate"

key-files:
  created:
    - "app/[slug]/admin/(protected)/termos/page.tsx"
    - "app/[slug]/admin/(protected)/termos/page.test.ts"
    - "app/[slug]/admin/(protected)/termos/_components/termo-leitura-card.tsx"
    - "app/[slug]/admin/(protected)/termos/_components/termo-leitura-card.test.tsx"
  modified:
    - "app/[slug]/admin/(protected)/_components/admin-nav.tsx"
    - "app/[slug]/admin/(protected)/_components/admin-nav.test.tsx"
    - "app/[slug]/admin/(protected)/_components/simples/simples-top-bar.tsx"
    - "app/[slug]/admin/(protected)/_components/simples/simples-top-bar.test.tsx"
    - "scripts/gates-fase-06.mjs"

key-decisions:
  - "A rota vive DENTRO de `(protected)`, ao contrário de `aceitar-termos`: esta é o destino de quem já passou pelo guard, e portanto incapaz de gerar o `ERR_TOO_MANY_REDIRECTS` que motivou aquela a morar fora do grupo"
  - "Nenhuma rota GET de termos foi criada — a superfície REST continua sendo apenas o POST exclusivo de SUPERADMIN; um server component lê `termoVigente()` direto"
  - "`termoVigente()` devolvendo `null` renderiza estado vazio, NUNCA `redirect()`: a tela é informativa, e devolver o usuário ao painel sem explicação seria pior"
  - "O contrato de props do card exclui `id` e exclui cor de tenant de propósito — as duas ausências são o que impede a tela de virar um segundo caminho de escrita de `AceiteTermo`"
  - "Histórico de versões antigas fica FORA de escopo: exigiria uma segunda função de leitura, uma decisão de UI sobre qual versão mostrar, e a distinção entre 'a vigente' e 'a que você aceitou'"
  - "A paridade visual dos ícones da `SimplesTopBar` passa a ser afirmada entre TODOS os ícones de navegação, não só entre os dois antigos"

patterns-established:
  - "Asserção negativa como teste de segurança: `expect(termoVigenteMock).not.toHaveBeenCalled()` quando a guarda lança prova que autorização acontece ANTES de leitura"
  - "Regressão de arquitetura por `readFileSync` do próprio fonte da page (herdado de `aceitar-termos/page.test.ts`), agora cobrindo quatro identificadores proibidos"

requirements-completed: [TERM-RELEITURA]

# Metrics
duration: 18min
completed: 2026-09-07
---

# Quick 260907-fhk: Tela protegida de releitura dos Termos de Uso

**Admin logado passa a reler os Termos de Uso vigentes a qualquer momento em `/{slug}/admin/termos` — tela só-leitura dentro do painel protegido, alcançável pelo menu nos dois modos de interface.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-07T14:16:54Z
- **Completed:** 2026-09-07T14:34:53Z
- **Tasks:** 3/3
- **Files modified:** 9 (4 criados, 5 editados)

## Accomplishments

### Task 1 — Card só-leitura (`termo-leitura-card.tsx`)

Componente puro, sem `"use client"`, com contrato de props deliberadamente magro: `termo` é `{ versao, conteudo, publicadoEmFormatado } | null` e nada mais. As três ausências (sem `id`, sem prop de cor, data já formatada no servidor) estão documentadas no JSDoc com o motivo de cada uma.

A caixa de texto reusa o bloco de `aceite-card.tsx` trocando só a altura máxima (`max-h-72` → `max-h-[60vh]`, porque aqui a leitura é o propósito da tela, não um passo intermediário de um formulário). `role="region"` + `aria-label` + `tabIndex={0}`: uma caixa rolável sem filho focável é inalcançável por teclado.

Estado vazio com duas frases em parágrafos separados, sem ícone de erro e sem tinta vermelha — não é falha do usuário, e nenhuma versão ou data é inventada.

**Commits:** `df131d2` (RED, 7 casos falhando) → `03c86b9` (GREEN, 7/7).

### Task 2 — Rota protegida (`(protected)/termos/page.tsx`)

Server component async no molde de `(protected)/assinatura/page.tsx`. Corpo de quatro linhas: `await params` → `await requireAdminSession(slug)` (sem atribuir, porque nada da sessão é usado — `TermoDeUso` é global) → `await termoVigente()` → monta o card com a data formatada por `formatDate`.

JSDoc de cabeçalho cobre os quatro pontos contestáveis: por que dentro de `(protected)`, por que nenhuma guarda simétrica é replicada, por que `null` não redireciona, e por que não existe rota GET.

**Commits:** `0b4cb53` (RED, 5 casos) → `45a2ece` (GREEN, 5/5).

### Task 3 — Navegação nos dois modos + escopo do gate de cor

- **`admin-nav.tsx`:** chave `termos` em `ICONS` (glifo de documento de `aceite-card.tsx`) e oitavo item de `buildNavItems`, depois de `Assinatura`. Nenhuma outra linha mudou — `pathname.startsWith(item.href)` já funciona porque nenhum href existente é prefixo de `/admin/termos`.
- **`simples-top-bar.tsx`:** quarto `<Link>` entre o ícone de assinatura e o `<form>` de logout, com `className` copiada caractere a caractere da engrenagem e `title="Termos de Uso"` obrigatório. `Sair` continua sendo o último controle da barra.
- **`scripts/gates-fase-06.mjs`:** `"app/[slug]/admin/(protected)/termos"` acrescentado a `ESCOPO_SEM_AMBAR.diretorios`. Gate 4 passou de 4 para 7 fontes varridas.

**Commit:** `9401580`.

## Testes pré-existentes EDITADOS (e por quê)

Quatro edições, todas previstas no plano. Nenhum teste foi removido.

| Arquivo | Caso | Mudança | Por quê |
|---|---|---|---|
| `admin-nav.test.tsx` | `"é o último item da lista, depois de Minha Loja"` | O array `rotulos` passou de 7 para 8 entradas, com `"Termos de Uso"` no fim | O caso afirma a lista INTEIRA; um item novo o quebra por construção — é exatamente para isso que ele existe |
| `simples-top-bar.test.tsx` | `"usa o mesmo tratamento visual da engrenagem"` | Virou `it.each(["Assinatura", "Termos de Uso"])` no nível de fora do `describe("entrada de Assinatura")`, renomeado para `"o ícone de %s usa o mesmo tratamento visual da engrenagem"` | A decisão travada do quick 260907-ejn vale entre TODOS os ícones de navegação da barra, não só entre os dois antigos. Deixar o caso restrito a `Assinatura` deixaria o ícone novo livre para divergir |
| `admin-nav.test.tsx` | — | **Acrescentados** `describe("entrada de Termos de Uso")` e `describe("AdminNav em /termos")` | Href correto e estado ativo da rota nova (o segundo remonta o módulo, porque o mock de `usePathname` é fixo por arquivo) |
| `simples-top-bar.test.tsx` | — | **Acrescentado** `describe("entrada de Termos de Uso")` | Href correto e ordem (`Configurações` → `Termos de Uso` → `Sair`) via `compareDocumentPosition` |

Os casos existentes que buscam `/assinatura/i` continuam válidos: `"Termos de Uso"` não casa com nenhum regex já usado nos dois arquivos.

## Verificação

| Comando | Resultado |
|---|---|
| `npx vitest run termo-leitura-card` | 7/7 |
| `npx vitest run termos/page.test.ts` | 20/20 (5 novos + os 15 de `aceitar-termos`, que o padrão também casa) |
| `npx vitest run admin-nav simples-top-bar` | 20/20 |
| `npm test` | **1193/1193**, 102 arquivos (baseline no commit-base era 1176; +17 casos, nenhum removido) |
| `npx tsc --noEmit` | 0 erros |
| `npm run lint` | 0 erros, 2 warnings PRÉ-EXISTENTES (`Link` não usado em `app/registro/page.tsx`, registrado como decisão `[01-04]`; `fatosDeTrial` em `reconciliacao.service.test.ts`) |
| `npm run gates:fase-06` | **5/5** — Gate 4 agora varre 7 fontes, já incluindo a pasta nova |
| `npm run gates:fase-07` | **6/6** — nada da fase de assinatura regrediu |
| `git diff --stat -- package.json 'app/[slug]/admin/aceitar-termos' app/registro` | **VAZIO** (verificado contra o commit-base `74dca09`) |

Contagem de teste por arquivo novo/editado: card 7, page 5, `admin-nav` 8 → 10, `simples-top-bar` 7 → 10.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` ausente no worktree**

- **Found during:** Task 1 (antes do primeiro `vitest`)
- **Issue:** O worktree de agente nasce sem `node_modules`, então nenhum comando de verificação rodava.
- **Fix:** Symlink para o `node_modules` do repositório principal. **Nenhum pacote foi instalado** — `package.json` e `package-lock.json` estão intactos, e o Gate 5 da Fase 6 (11 deps / 20 devDeps) confirma isso. O link é ignorado pelo git.
- **Files modified:** nenhum arquivo versionado
- **Commit:** —

**2. [Rule 3 - Blocking] `tsc` acusava `TS2304: Cannot find name 'LayoutProps'` em `app/layout.tsx`**

- **Found during:** Task 3 (verificação final)
- **Issue:** `LayoutProps` é um tipo GLOBAL gerado pelo Next em `.next/types`, e um worktree recém-criado não tem `.next/`. O erro é artefato de ambiente, não do código: `git diff` de `app/layout.tsx` contra o commit-base é vazio.
- **Fix:** `npx next typegen` (o script oficial de geração de tipos de rota). Depois disso `tsc --noEmit` sai limpo. `.next/` é ignorado pelo git.
- **Files modified:** nenhum arquivo versionado
- **Commit:** —

**3. [Rule 1 - Ajuste de forma] Estado vazio em dois `<p>` em vez de um**

- **Found during:** Task 1 (GREEN)
- **Issue:** O plano descreve o estado vazio como um `<p>` com a primeira frase "e uma segunda frase". Com as duas frases no MESMO parágrafo, `getByText("Nenhuma versão dos Termos de Uso está publicada no momento.")` falha — o testing-library casa o texto completo do elemento.
- **Fix:** Duas frases em dois parágrafos irmãos. O comportamento especificado (frase presente, sem região de texto, sem versão inventada) é idêntico.
- **Files modified:** `app/[slug]/admin/(protected)/termos/_components/termo-leitura-card.tsx`
- **Commit:** `03c86b9`

### Fora de escopo, deliberadamente

- **Histórico de versões antigas.** `lib/termo-vigente.ts` só sabe buscar a vigente. Um seletor de versões exigiria uma segunda função de leitura, uma decisão de UI sobre qual versão o usuário "deveria" ver, e a distinção entre "a versão vigente" e "a versão que você aceitou" — três problemas que não precisam ser resolvidos para entregar o valor pedido.
- **Os 2 warnings de lint pré-existentes.** Não foram causados por este trabalho e o de `app/registro/page.tsx` é uma decisão registrada (`[01-04]`); tocá-lo violaria a restrição de não modificar `app/registro/`.

## Threat Model — dispositions aplicadas

| Threat ID | Disposition | Onde está a prova |
|---|---|---|
| T-fhk-01 (Information Disclosure) | mitigate | `requireAdminSession(slug)` é a primeira coisa na page; `page.test.ts` prova por asserção negativa que `termoVigente` NÃO é chamado quando a guarda lança |
| T-fhk-02 (Tampering / XSS) | mitigate | Dois caminhos: teste de escape com `<b>negrito</b>` literal + `container.querySelector("b") === null`, e leitura do fonte da page provando ausência do prop de HTML cru |
| T-fhk-03 (Elevation of Privilege) | accept | `TermoDeUso` é global (sem `empresaId`); a page não faz nenhuma query por empresa. A rota continua exigindo sessão de admin válida do slug |
| T-fhk-04 (Repudiation) | mitigate | `queryAllByRole("button")` length 0 e `querySelector("form")` null; `aceitar-termos/actions.ts` intocado |
| T-fhk-05 (Denial of Service) | mitigate | `null` → estado vazio, nunca `redirect()` nem `notFound()`; caso coberto em `page.test.ts` |
| T-fhk-SC (Supply chain) | mitigate | Zero import novo fora de `@/lib/*`; `git diff package.json` vazio; Gate 5 confirma 11/20 |

Nenhuma superfície de segurança nova apareceu fora do registro acima.

## Known Stubs

Nenhum. A tela consome dados reais via `termoVigente()`; o único ramo sem dados é o estado vazio, que é comportamento especificado e não placeholder.

## Human Check pendente (não bloqueante)

`260907-fhk-H1` — confirmação visual em `npm run dev` (detalhes abaixo)

## Self-Check: PASSED

- 8/8 arquivos afirmados existem em disco (4 criados + 4 dos editados verificados nominalmente).
- 5/5 commits afirmados existem no histórico: `df131d2`, `03c86b9`, `0b4cb53`, `45a2ece`, `9401580`, todos sobre o commit-base `74dca09`.
- Nenhum arquivo deletado em nenhum dos 5 commits (`git diff --diff-filter=D` vazio).
- `git stash list` vazio — nenhuma operação de stash foi usada.

## Detalhe do human check

: (a) tenant COMPLETO, clicar em "Termos de Uso" no menu lateral e conferir texto integral, versão, data, rolagem e alcance por Tab; (b) trocar para modo SIMPLES em `/{slug}/admin/marca` e conferir que o quarto ícone da barra tem tamanho, cor e hover idênticos aos vizinhos. A estrutura já está travada por teste, então isto não bloqueia o merge.
