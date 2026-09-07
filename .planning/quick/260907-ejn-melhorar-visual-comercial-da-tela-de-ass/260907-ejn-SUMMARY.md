---
phase: quick-260907-ejn
plan: 01
subsystem: ui
tags: [react, tailwind, assinatura, ui-spec, tdd]

# Dependency graph
requires:
  - phase: 07-gest-o-de-assinatura
    provides: "A tela `/{slug}/admin/assinatura` (`AssinaturaCard`), o `07-UI-SPEC.md` travado e o gate estático `gates:fase-07`"
provides:
  - "Hierarquia comercial na tela de assinatura: moldura nos três tiles, peso 600 no valor do plano e zona própria para o CTA"
  - "Uma linha de reforço abaixo do CTA que só renderiza para quem tem o que pagar"
  - "Registro executável (5 testes) de que os deltas existem E de que nenhuma proibição do UI-SPEC foi violada"
  - "Adendo §260907-ejn no `07-UI-SPEC.md` com os deltas aplicados e os movimentos recusados, cada um com a regra que o recusou"
  - "A decisão do operador sobre o modo SIMPLES documentada no próprio `simples-top-bar.tsx`"
affects: [assinatura, ui-spec, futuros pedidos de "deixar a tela mais vendedora"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Retoque visual sob contrato travado: a lista de movimentos RECUSADOS vira artefato de primeira classe (JSDoc + adendo do UI-SPEC), não conhecimento perdido na conversa"
    - "Teste de proibição que passa em RED e em GREEN de propósito (guarda de peso 700), ao lado dos testes de delta que falham em RED"

key-files:
  created: []
  modified:
    - "app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx"
    - "app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx"
    - ".planning/phases/07-gest-o-de-assinatura/07-UI-SPEC.md"
    - "app/[slug]/admin/(protected)/_components/simples/simples-top-bar.tsx"

key-decisions:
  - "[260907-ejn] O destaque comercial veio de composição (moldura, peso 600, régua + zona própria), nunca de cor: o accent do tenant tem 3 usos permitidos e os 3 já estavam gastos"
  - "[260907-ejn] O valor de `Próxima cobrança` fica em peso 400 DE PROPÓSITO — dar a um campo que pode faltar o mesmo peso de um que nunca falta faria o estado degradado parecer quebrado em vez de parcial"
  - "[260907-ejn] Preço NÃO vira número-herói: o tamanho Display é exclusivo da data de `Acesso até` (§Typography, regra do Display único), então o preço ganha peso, não tamanho"
  - "[260907-ejn] Task 2 — operador escolheu `manter` o ícone de Assinatura do modo SIMPLES como está; o motivo foi gravado no código, não só no planejamento"
  - "[260907-ejn] A lista de 10 movimentos recusados virou artefato versionado (JSDoc + adendo do UI-SPEC) para que o próximo pedido de 'deixar mais vendedor' não recomece do zero"

patterns-established:
  - "Orçamento de UI-SPEC: antes de retocar uma superfície sob contrato, levantar PERMITIDO vs RECUSADO e deixar a segunda lista no código"
  - "Paridade de classe entre tiles como invariante testável — é ela que mantém verdadeira a asserção de que só a Zona 2 degrada"

requirements-completed: [SUB-01-VISUAL]

# Metrics
duration: 13min
completed: 2026-09-07
---

# Quick 260907-ejn: Visual comercial da tela de Assinatura Summary

**A tela onde o produto pede dinheiro deixou de ler como formulário de configuração — três deltas de composição (moldura nos tiles, peso no preço, zona própria para o CTA) sem amendar uma única regra do `07-UI-SPEC.md`.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-09-07T13:40:00Z
- **Completed:** 2026-09-07T13:53:00Z
- **Tasks:** 2 de 2
- **Files modified:** 4

## Accomplishments

### Task 1 — Hierarquia comercial do card (TDD)

Cinco asserções novas escritas ANTES do componente, num `describe("hierarquia visual (quick 260907-ejn)")` que não toca em nenhum bloco existente. **RED confirmado: 4 dos 5 casos falharam contra o markup antigo.** O quinto (guarda de peso 700) passa antes e depois de propósito — ele não descreve um delta, descreve uma proibição, e existe para falhar no dia em que alguém tentar dar ênfase com `bold`.

Os três deltas aplicados, e o token que autoriza cada um:

| # | Delta | Classe exata | Autorização |
|---|-------|--------------|-------------|
| 1 | Moldura nos **três** tiles | `rounded-xl border border-slate-100 bg-slate-50 p-4` | §Color lista `slate-100` como token de borda de card |
| 2 | Peso no valor do plano | `mt-1 text-sm/[1.5] font-semibold text-slate-800` | §Typography: 14px/600 já é o token de rótulo de botão, não um quinto token |
| 3 | Zona própria para o CTA | `<form>` vira `mt-6 border-t border-slate-100 pt-6` + um `<p className="mt-3 text-xs text-slate-500">` abaixo do botão | Mesmo token de borda; tamanho Meta e cor de texto secundário, ambos da tabela |

A copy nova é uma só — `O acesso é liberado assim que o pagamento for confirmado.` — e vive DENTRO do bloco `podePagar`, então nunca aparece para quem já tem acesso ativo, vitalício ou degradado. Ela afirma só o que o sistema faz (webhook confirma → acesso libera), sem claim contratual, sem meio de pagamento e sem repetir o preço.

### Task 2 — Modo SIMPLES: decisão do operador registrada no código

**Escolha do operador: `manter` (opção A — manter como está e apenas documentar).** Nenhuma mudança de código, nenhuma classe nova, nenhum teste editado. O parágrafo acrescentado ao comentário JSX acima do `<Link>` de Assinatura em `simples-top-bar.tsx` registra as três regras que bloqueiam o reforço (§Touch Targets exige paridade com os irmãos da barra; §Color não permite a cor do tenant nesse botão; o teste `usa o mesmo tratamento visual da engrenagem` afirma a paridade de propósito) e o fato que reduz a urgência: um tenant SIMPLES em carência já recebe o `AvisoCarencia` âmbar com botão de pagar em toda tela do admin, nos dois modos de interface.

## Movimentos comerciais RECUSADOS (não reintroduzir)

Esta lista é o entregável que impede o próximo pedido de "deixar mais vendedor" de recomeçar do zero. Está versionada em dois lugares — no JSDoc de `assinatura-card.tsx` e no adendo do `07-UI-SPEC.md`.

| Movimento desejado | Regra que o proíbe |
|--------------------|--------------------|
| Preço em 24px, como número-herói | §Typography, "exactly one Display value on the screen" — o Display é exclusivo da data de `Acesso até` |
| Qualquer `font-bold` (peso 700) | §Typography: markup novo desta fase não usa peso 700 |
| Tiles, pill ou borda tingidos com a cor do tenant | §Color: os 3 usos do accent já estão gastos (fundo + anel do botão de pagar, linha ativa do `AdminNav`) |
| Tiles em emerald/gradiente para "vender" | §Color: a rampa emerald é semântica, restrita ao pill nos estados ativo e vitalício |
| Peso 600 no valor de `Próxima cobrança` | Faria o estado degradado parecer quebrado em vez de parcial (D-02b) |
| Fundir a Zona 2 no grid da Zona 1 | §Component Contracts: a separação de zonas **é** o mecanismo de degradação de D-02b |
| Selo de preço, badge de desconto, comparativo de planos | §Non-Goals: escolha de plano/preço está fora do milestone. R$ 29,90 é exibido, nunca escolhido |
| Histórico de cobranças, bandeira do cartão, "pagamento seguro via …" | §Non-Goals + a restrição central do milestone: nenhum dado de pagamento toca este sistema, e o vocabulário do gateway nunca aparece (BILL-01) |
| Shell maior / `shadow-xl` | §Component Contracts: a shell é o card do dashboard, não o takeover de `bloqueado-card.tsx` |
| Segundo bloco âmbar para a carência | §Non-Goals: o layout já renderiza `AvisoCarencia` acima de `children` em toda tela do admin |
| Biblioteca de ícones/animação/modal | §Non-Goals + Gate 6, que falha em qualquer instalação |

## Verification Results

| Verificação | Resultado |
|-------------|-----------|
| `npx vitest run assinatura-card` | 39/39 (34 pré-existentes intactos + 5 novos) |
| `npm test` | **1176/1176** em 100 arquivos (baseline 1171 + 5 novos) |
| `npm run lint` | **0 erros** (2 warnings pré-existentes: `Link` não usado em `app/registro/page.tsx`, decisão registrada em `[01-04]`; `fatosDeTrial` em `reconciliacao.service.test.ts`) |
| `npm run gates:fase-07` | **6/6 OK** |
| `npx vitest run simples-top-bar` | 7/7, arquivo de teste **não editado** |
| Grep peso 700 na rota (fontes) | **0** |
| Grep `primaryColor` em `assinatura-card.tsx` | **3** — igual a antes (campo da interface, destructuring, prop do `PagarButton`) |
| Grep `text-2xl` em `assinatura-card.tsx` | **1** — o valor Display continua sendo só a data de `Acesso até` |
| `git diff --exit-code package.json package-lock.json` | vazio — zero dependência nova |
| `npx tsc --noEmit` | 1 erro **pré-existente e ambiental**, ver abaixo |

### `tsc`: o único erro é ambiental, não do retoque

```
app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'.
```

`LayoutProps` é um tipo GERADO pelo Next.js em `.next/types/**`, que o `tsconfig.json` inclui (linhas 29-30). Este worktree nunca rodou `next dev`/`next build`, então `.next/` não existe e o global não é gerado. `app/layout.tsx` não foi tocado por esta task (`git status` limpo para ele) e nenhum dos 4 arquivos modificados aparece na saída do `tsc`. Fora de escopo — não foi "corrigido" aqui.

### E2E: NÃO executado

O Postgres local responde na 5432, mas **o worktree não tem `.env`** (é gitignored e não é copiado para worktrees), então `npm run dev` — que o `playwright.config.ts` usa como `webServer` — não sobe sem `DATABASE_URL`/`JWT_SECRET`. O plano marca o e2e como opcional nesta task. **Nenhum resultado foi inventado ou transcrito.**

Os três locators e2e relevantes são preservados por construção, e os testes de componente cobrem os mesmos invariantes:
- `getByText("Acesso até", { exact: true }).locator("..")` — rótulo e valor continuam sendo dois `<p>` irmãos diretos dentro do `div` do tile; nada foi inserido entre eles.
- `getByText("Sem assinatura", { exact: true })` — o texto do pill não foi envolvido em nenhum elemento novo.
- `getByRole("button", { name: "Assinar agora" })` — a copy do botão não mudou; o `<p>` novo é irmão POSTERIOR do botão, dentro do mesmo `<form>`.

## Deviations from Plan

### 1. [Rule 1 — Bug no plano] O Teste 2, como escrito, contradizia o Delta 1

- **Found during:** Task 1, ao escrever as asserções.
- **Issue:** O `<behavior>` pedia que `tileDe("Acesso até").className`, `tileDe("Plano").className` e `tileDe("Próxima cobrança").className` fossem **iguais entre si**. Mas o tile da Zona 2 é `mt-4 rounded-xl bg-slate-50 p-4` — ele carrega um `mt-4` que os tiles da Zona 1 não têm, porque é o que o separa do grid. O `<action>` do mesmo plano manda trocar apenas a substring `rounded-xl bg-slate-50 p-4` e diz "nenhum outro elemento, classe, string ou prop muda". Igualdade estrita só seria possível removendo o `mt-4` — uma quarta mudança de markup, não autorizada, que colaria a Zona 2 no grid.
- **Fix:** A asserção afirma o invariante real, que é o que o plano de fato queria ("os três tiles compartilham a mesma moldura"): os três `className` contêm a moldura idêntica `rounded-xl border border-slate-100 bg-slate-50 p-4`; os dois tiles da Zona 1 são byte-idênticos entre si (é essa paridade que sustenta a asserção pré-existente do estado degradado); e o da Zona 2 é exatamente `mt-4 ${MOLDURA}` — diferença de espaçamento, não de moldura, verificada explicitamente.
- **Files modified:** `assinatura-card.test.tsx`
- **Commit:** `d118501`

### 2. [Rule 1 — Bug no plano] O grep de peso 700 acusava o próprio teste que prova a ausência

- **Found during:** Task 1, verificação.
- **Issue:** O grep do `<verify>` varre `--include='*.tsx'` sem excluir arquivos de teste, e devolveu **1** em vez de 0. A ocorrência é a linha `container.querySelectorAll('[class*="font-bold"], [class*="font-extrabold"]')` — ou seja, exatamente a asserção que o próprio plano mandou escrever para provar que peso 700 NÃO existe.
- **Fix:** Rodado com `--exclude='*.test.tsx'`, devolvendo **0**. Esta é a mesma disciplina que o `scripts/gates-fase-07.mjs` já aplica na função `ehFonte`, documentada lá como condição de existência dos gates: "os testes desta fase citam os identificadores proibidos DE PROPÓSITO". Nenhuma prosa foi reescrita para mover contador de grep.
- **Files modified:** nenhum (correção de comando de verificação)
- **Commit:** n/a

### 3. [Processo] RED e GREEN commitados separadamente

O plano pedia um commit por task. Como a Task 1 é `tdd="true"`, ela virou dois commits — `test(...)` com o arquivo de teste sozinho (essa árvore falha de verdade: 4 casos vermelhos) e `feat(...)` com o componente e o UI-SPEC. A sequência RED→GREEN fica auditável no `git log` em vez de depender desta prosa.

## Known Stubs

Nenhum. Os três deltas são markup renderizado; nenhum dado novo, nenhuma prop nova, nenhuma fonte de dados por ligar.

## Threat Flags

Nenhuma superfície de segurança nova. O plano previu `T-ejn-01` (a copy nova não interpola dado do gateway — é literal estática, e o teste `nunca exibe o vocabulário de status do gateway` roda nos cinco estados e segue verde) e `T-ejn-04` (a frase afirma só o que o sistema faz, sem claim contratual — "sem fidelidade"/"sem multa"/"pagamento seguro" ficaram fora, já que os Termos de Uso seguem sob revisão jurídica pendente). `dangerouslySetInnerHTML` continua com 0 ocorrências. Zero instalação de pacote (`git diff package.json` vazio, Gate 6 OK).

## Commits

| Hash | Commit |
|------|--------|
| `d118501` | `test(quick-260907-ejn): provar os tres deltas visuais da tela de assinatura` (RED) |
| `326486c` | `feat(quick-260907-ejn): dar hierarquia comercial a tela de assinatura` (GREEN) |
| `0ef0d3a` | `docs(quick-260907-ejn): registrar por que o icone de assinatura fica discreto` (Task 2) |

## Pendências

- **Verificação humana da tela** (`<human-check>` da Task 1) não foi executada — exige `npm run dev` com `.env`, que não existe neste worktree. Confirmar visualmente: tiles lendo como blocos e não manchas cinza; preço saltando como valor com a data de `Acesso até` ainda sendo o maior número da tela; botão lendo como fim de seção. Se o botão aparecer preto, é o fallback `#18181b` de tenant sem `primaryColor` — não é defeito desta tela.
- **E2E** não executado (sem `.env` no worktree). Rodar `npm run test:e2e` no repo principal, se desejado; os casos relevantes são os de `e2e/cancelamento-de-assinatura.spec.ts`.

## Self-Check: PASSED

Arquivos (5/5 encontrados em disco): `assinatura-card.tsx`, `assinatura-card.test.tsx`, `07-UI-SPEC.md`, `simples-top-bar.tsx`, `260907-ejn-SUMMARY.md`.

Commits (3/3 encontrados no `git log`): `d118501`, `326486c`, `0ef0d3a`.

`must_haves` do plano, conferidos por grep:

| Verificação | Esperado | Medido |
|-------------|----------|--------|
| `assinatura-card.tsx` contém `font-semibold text-slate-800` | ≥1 | 4 |
| `assinatura-card.tsx` — `min_lines` | ≥280 | 333 |
| `assinatura-card.test.tsx` contém `font-bold` | ≥1 | 1 |
| `07-UI-SPEC.md` contém `260907-ejn` | ≥1 | 2 |
| `key_link` — `PagarButton variant="bloqueado"` | ≥1 | 1 |
| `key_link` — `Addendum — quick 260907-ejn` | ≥1 | 2 |
