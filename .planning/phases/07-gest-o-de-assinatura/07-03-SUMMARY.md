---
phase: 07-gest-o-de-assinatura
plan: 03
subsystem: ui
tags: [react, nextjs, navigation, tailwind, vitest, accessibility]

# Dependency graph
requires:
  - phase: 04-aplicacao-do-bloqueio
    provides: "PagarButton com as variantes banner/bloqueado, AvisoCarencia e BloqueadoCard — os dois consumidores cujos rotulos nao podiam mudar"
provides:
  - "PagarButtonProps.label e PagarButtonProps.pendingLabel — props opcionais de rotulo, com defaults byte-identicos aos originais"
  - "ICONS.assinatura e o item de nav Assinatura em admin-nav.tsx (modo COMPLETO)"
  - "Link icone-only com title=Assinatura em simples-top-bar.tsx (modo SIMPLES)"
  - "Caminho de navegacao ate /{slug}/admin/assinatura para 100% dos tenants, nos dois modos de interface"
affects: [07-01, 07-02, 07-04, assinatura, cancelamento, e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extensao de componente compartilhado por props opcionais com defaults congelados, em vez de um segundo componente irmao"
    - "vi.doMock + vi.resetModules + import dinamico para variar usePathname dentro de um arquivo cujo vi.mock e fixo"

key-files:
  created: []
  modified:
    - "app/[slug]/admin/_components/pagar-button.tsx"
    - "app/[slug]/admin/_components/pagar-button.test.tsx"
    - "app/[slug]/admin/(protected)/_components/admin-nav.tsx"
    - "app/[slug]/admin/(protected)/_components/admin-nav.test.tsx"
    - "app/[slug]/admin/(protected)/_components/simples/simples-top-bar.tsx"
    - "app/[slug]/admin/(protected)/_components/simples/simples-top-bar.test.tsx"

key-decisions:
  - "PagarButton ganhou label/pendingLabel opcionais em vez de um segundo CTA de pagamento — dois botoes teriam de permanecer visual e comportamentalmente identicos para sempre"
  - "Defaults literais byte-identicos ('Pagar agora' / 'Redirecionando...') porque os testes da Fase 4 e os locators e2e dependem deles"
  - "A entrada de nav foi duplicada em SimplesTopBar: admin-nav.tsx so renderiza para modoInterface COMPLETO, e sem a segunda entrada SUB-02 seria falso para todos os tenants SIMPLES"
  - "O path do icone de cartao e duplicado entre os dois arquivos de proposito — ICONS e privado de admin-nav.tsx (client component) e exporta-lo criaria acoplamento sem beneficio"
  - "Assinatura fecha a lista de buildNavItems: os seis itens existentes estao ordenados por frequencia diaria de uso e assinatura e o destino menos visitado"

patterns-established:
  - "Rotulo variavel, chrome congelado: props de texto nunca alcancam o objeto CLASSES, e nenhuma variante nova e criada para acomodar copy"
  - "Controle so-de-icone sempre com title — e o unico nome acessivel disponivel, e ha caso de teste por getByTitle para cada um"

requirements-completed: [SUB-01, SUB-02]

# Metrics
duration: 8min
completed: 2026-09-02
---

# Phase 7 Plan 03: Entradas de Navegacao e Extensao do CTA de Pagamento Summary

**Item de nav "Assinatura" nos dois modos de interface do admin (sidebar COMPLETO e barra de icones SIMPLES) e duas props opcionais de rotulo no `PagarButton`, com os defaults da Fase 4 congelados byte-a-byte.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-09-02T15:13:00Z
- **Completed:** 2026-09-02T15:21:00Z
- **Tasks:** 2 (ambas TDD, ciclo RED/GREEN completo)
- **Files modified:** 6 (3 de codigo, 3 de teste)

## Accomplishments

- `PagarButton` aceita `label`/`pendingLabel` opcionais sem que o banner de carencia e a tela de bloqueio mudem uma letra — os 5 casos originais do componente e as suites de `aviso-carencia` e `bloqueado-card` passam sem nenhuma alteracao.
- Tenants em modo COMPLETO ganham "Assinatura" como ultimo item da barra lateral, com estado ativo correto na rota e sem ativar nenhum outro item por prefixo.
- Tenants em modo SIMPLES ganham um icone de cartao entre a engrenagem e o sair, com `title="Assinatura"` — sem esta entrada, SUB-02 ("o usuario pode cancelar a assinatura") seria falso para essa populacao inteira.
- 12 casos de teste novos, todos aditivos; suite completa em 1031/1031, `tsc --noEmit` e `npm run lint` em 0, e `git diff package.json` vazio.

## Task Commits

Cada task foi commitada atomicamente, com o ciclo TDD visivel no historico:

1. **Task 1: PagarButton ganha label/pendingLabel opcionais** — `4b80e88` (test, RED) → `20efa60` (feat, GREEN)
2. **Task 2: entradas de navegacao para /assinatura nos dois modos** — `33228fe` (test, RED) → `ff0306d` (feat, GREEN)

Nenhuma das duas tasks precisou de commit de refactor: as duas edicoes sao aditivas e nao deixaram nada a limpar.

## Files Created/Modified

- `app/[slug]/admin/_components/pagar-button.tsx` — duas props opcionais de rotulo, defaults literais na desestruturacao, ternario final passa a usar as variaveis. JSDoc registra que as props afetam APENAS o texto e que a tela de assinatura usa a variante `bloqueado`.
- `app/[slug]/admin/_components/pagar-button.test.tsx` — `describe` novo "rotulos alternativos" com 5 casos; os 5 originais intactos.
- `app/[slug]/admin/(protected)/_components/admin-nav.tsx` — `ICONS.assinatura` (path de cartao de credito, Heroicons outline) e um item ao fim de `buildNavItems`.
- `app/[slug]/admin/(protected)/_components/admin-nav.test.tsx` — 4 casos novos: href, ordem completa da lista, ausencia de estado ativo fora da rota, e um `describe` separado que remonta o modulo com `usePathname` em `/loja-teste/admin/assinatura`.
- `app/[slug]/admin/(protected)/_components/simples/simples-top-bar.tsx` — um `Link` entre a engrenagem e o form de logout, classe identica a da engrenagem, com comentario explicando a duplicacao deliberada do path.
- `app/[slug]/admin/(protected)/_components/simples/simples-top-bar.test.tsx` — 3 casos novos: href por `getByTitle`, ordem entre engrenagem e sair, e paridade de classe com a engrenagem.

## Decisions Made

Todas as decisoes de fundo ja vinham travadas pela UI-SPEC; a execucao seguiu o plano. Duas escolhas de granularidade foram tomadas aqui:

- **Um caso de teste extra, alem dos `<behavior>` do plano, para `pendingLabel`.** O caso especificado passa `pendingLabel="Redirecionando..."`, que e o proprio valor do default — sozinho ele passaria mesmo com a prop desligada e nao provaria o wiring. Foi acrescentado um caso irmao com um valor distinto ("Abrindo o checkout...") que falha se a prop nao estiver ligada ao ternario. O caso original do plano foi mantido.
- **`vi.doMock` + `vi.resetModules` + import dinamico**, entre as tres opcoes que o plano oferecia para variar `usePathname`. Mantem tudo num arquivo so, nao altera o `vi.mock` fixo existente (os casos anteriores continuam vendo `/loja-teste/admin/produtos`), e nao exigiu um segundo arquivo de teste fora da convencao de nomes do projeto. Verificado empiricamente: nao produz duplicacao de instancia do React nem "Invalid hook call".

## Deviations from Plan

None — plan executed exactly as written. Nenhuma regra de desvio (1-4) foi acionada.

O unico ajuste foi aditivo e esta descrito em "Decisions Made": um caso de teste a mais para tornar a assercao de `pendingLabel` discriminante. Nenhum arquivo fora do escopo do plano foi tocado, nenhuma dependencia foi instalada, e nenhuma linha de `CLASSES`, de copy da Fase 4 ou de bloco de renderizacao existente foi editada.

## Issues Encountered

- **`npx tsc --noEmit` falhava com `TS2304: Cannot find name 'LayoutProps'` em `app/layout.tsx`.** Nao e um erro de codigo: `LayoutProps` e um tipo global gerado pelo Next.js em `.next/types`, e este worktree nunca tinha rodado um build. Resolvido com `npx next typegen`; depois disso `tsc --noEmit` sai 0. `app/layout.tsx` nao foi tocado por este plano. **Vale registrar para os outros agentes da wave:** todo worktree novo precisa de `npx next typegen` antes de `tsc --noEmit` significar alguma coisa.

## Deferred Issues

Dois warnings de lint pre-existentes, em arquivos que este plano nao toca — fora do escopo (`npm run lint` sai 0; sao warnings, nao erros):

- `app/registro/page.tsx:1` — `'Link' is defined but never used`
- `app/services/reconciliacao.service.test.ts:35` — `'fatosDeTrial' is defined but never used`

## Verification

| Verificacao | Resultado |
|---|---|
| `vitest run` nos 4 arquivos do plano | 33/33 verdes |
| `npm test` (suite completa) | 95 arquivos, 1031/1031 verdes |
| `npx tsc --noEmit` | exit 0 (apos `next typegen`) |
| `npm run lint` | exit 0 (2 warnings pre-existentes, fora do escopo) |
| `git diff package.json package-lock.json` | vazio — nenhuma dependencia nova (T-07-SC) |
| `grep -c '"banner"\|"bloqueado"' pagar-button.tsx` | 2, igual ao original — nenhuma variante nova |
| diff de `pagar-button.tsx` dentro de `CLASSES` | nenhuma linha alterada (T-07-14) |
| diff de `admin-nav.tsx` no `items.map`, `active` e logout | nenhuma linha alterada |
| diff de `simples-top-bar.tsx` na engrenagem e no logout | nenhuma linha alterada; o Link novo esta entre os dois |

## Success Criteria

1. **Tenant COMPLETO ve "Assinatura" como ultimo item, com estado ativo correto** — coberto por 4 casos, incluindo a lista completa em ordem e a nao-ativacao de "Minha Loja" e "Inicio" em `/assinatura`.
2. **Tenant SIMPLES ve um icone de cartao entre a engrenagem e o sair, com `title="Assinatura"`** — coberto por 3 casos, incluindo ordem via `compareDocumentPosition`.
3. **`PagarButton` aceita `label`/`pendingLabel` e as duas telas da Fase 4 renderizam byte-identicas** — coberto pelos 5 casos originais intactos mais as suites de `aviso-carencia` e `bloqueado-card` no mesmo comando.
4. **Nenhuma classe de `CLASSES`, copy da Fase 4 ou bloco de renderizacao existente editado** — confirmado por inspecao de diff (tabela acima).

## Threat Model Coverage

| Threat | Disposicao | Como foi tratado |
|---|---|---|
| T-07-13 (EoP, link de nav) | accept | Link nao e autorizacao; a rota vive em `(protected)` e cada page chama `requireAdminSession`. Nada neste plano toca auth. |
| T-07-14 (Tampering, defaults do CTA) | mitigate | Defaults literais byte-identicos; `aviso-carencia` e `bloqueado-card` rodam no mesmo comando de verificacao e falhariam se um rotulo mudasse. |
| T-07-15 (DoS, SIMPLES sem rota) | mitigate | Entrada em `SimplesTopBar` implementada e testada. |
| T-07-16 (Info Disclosure, nome acessivel) | mitigate | `title="Assinatura"` com caso de teste por `getByTitle`. |
| T-07-SC (Tampering, npm) | accept | Nenhuma dependencia nova; icone e SVG inline. `git diff package.json` vazio. |

Nenhuma superficie de seguranca nova foi introduzida: as tres edicoes sao de apresentacao, sem endpoint, sem I/O, sem acesso a dados e sem mudanca de schema. Sem `## Threat Flags`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Os dois pontos de entrada estao prontos e apontam para `/{slug}/admin/assinatura`. **A rota em si e entregue por outro plano desta fase** (`app/[slug]/admin/(protected)/assinatura/page.tsx`, listado em "Simbolos criados por OUTROS planos"). Ate esse plano ser mesclado, os links resolvem para 404 — composicao esperada da wave, nao um stub.
- `PagarButton` esta pronto para receber `label="Assinar agora"` e `label="Reativar assinatura"` na tela de assinatura, usando `variant="bloqueado"` conforme a UI-SPEC.
- O spec e2e de cancelamento (outro plano) pode ancorar em `getByTitle("Assinatura")` para SIMPLES e no link de nome acessivel "Assinatura" para COMPLETO.
- Nenhum bloqueador.

---
*Phase: 07-gest-o-de-assinatura*
*Plan: 03*
*Completed: 2026-09-02*
