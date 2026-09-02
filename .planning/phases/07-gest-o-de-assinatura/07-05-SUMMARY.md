---
phase: 07-gest-o-de-assinatura
plan: 05
subsystem: billing-ui
tags: [server-action, react-19, use-transition, subscription-cancel, tdd, vitest, a11y, idor]

# Dependency graph
requires:
  - phase: 07-gest-o-de-assinatura
    plan: 04
    provides: "assinaturaService.cancelar(empresaId) — gateway primeiro, banco depois, 404 tratado como ja-cancelada"
  - phase: 07-gest-o-de-assinatura
    plan: 01
    provides: "ultimoDiaDeAcessoEmSaoPaulo — produtor unico da string dd/mm/aaaa consumida como prop"
  - phase: 04-aplicacao-do-bloqueio
    provides: "InlineError de bloqueado-card.tsx; a frase travada de aviso-carencia.tsx; o idioma de action ja vinculada ao slug"
  - phase: 01-pre-requisitos-de-producao
    provides: "getVerifiedSession — sessao revalidada no banco, de onde sai o empresaId"
provides:
  - "cancelarAssinatura(slug) — Server Action de aridade 1, sem nenhum parametro de id (D-05)"
  - "CancelarAssinatura — client component de gatilho + view de confirmacao de dois cliques (D-03)"
  - "CancelarAssinaturaProps — contrato { ultimoDiaDeAcesso: string; cancelarAction: () => Promise<{ error?: string }> }"
affects: [07-06, 07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action que devolve ESTADO em vez de navegar, para erro renderizado em linha sem fechar a view"
    - "Confirmacao destrutiva por SUBSTITUICAO DE VIEW (nunca overlay), com foco movido de proposito no swap"
    - "Prova executavel de ausencia de IDOR por assercao de ARIDADE da funcao exportada"
    - "Copy travada extraida para constante de uma linha, para que a igualdade byte-a-byte com outra tela seja verificavel por grep"
    - "Comentarios de proibicao escritos SEM citar o token proibido, para nao invalidar o gate estatico que conta ocorrencias sem descartar comentarios"

key-files:
  created:
    - app/[slug]/admin/(protected)/assinatura/actions.ts
    - app/[slug]/admin/(protected)/assinatura/actions.test.ts
    - app/[slug]/admin/(protected)/assinatura/_components/cancelar-assinatura.tsx
    - app/[slug]/admin/(protected)/assinatura/_components/cancelar-assinatura.test.tsx
  modified: []

key-decisions:
  - "Comentarios de proibicao nao citam mais o token proibido (`redirect`, `role=dialog`, `aria-modal`, `createPortal`, `fixed inset-0`, `Intl.`): os criterios de aceitacao do plano usam grep CRU nesses tres casos, e nomear o token no JSDoc invalidaria o proprio gate que o plano 07-07 vai herdar. A regra continua registrada, descrita em portugues, com uma nota explicando por que o token esta ausente ate como citacao."
  - "A action nao usa revalidatePath: a re-renderizacao e disparada por router.refresh() no cliente e a page e dinamica por construcao (cookies() via requireAdminSession + Prisma sem unstable_cache)."
  - "O paragrafo da confirmacao e montado como UMA template string, e nao como JSX com texto interpolado em varias linhas: e o que mantem a frase final byte-identica a de aviso-carencia.tsx numa unica linha de fonte (grep-avel) e o paragrafo como um unico no de texto."
  - "O gatilho limpa o erro ao ABRIR a confirmacao, alem de limpa-lo ao abortar: sem isso, reabrir a view depois de uma falha traria a mensagem antiga como se fosse nova."
  - "jaAbriu (useRef) impede que a montagem inicial roube o foco: o useEffect de foco roda tambem no primeiro render, quando a view ja e 'padrao'."

patterns-established:
  - "Assercao de aridade (`expect(fn.length).toBe(1)`) como prova de contrato de seguranca no nivel de assinatura de funcao — um segundo parametro quebra o teste antes de qualquer revisao humana"
  - "Assercao de nao-vazamento por serializacao (`expect(JSON.stringify(retorno)).not.toContain(...)`) com PII plantada no erro do gateway"
  - "Assercao de ordem de DOM dos botoes por `screen.getAllByRole('button').map(b => b.textContent)`"

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-09-02
---

# Phase 7 Plan 05: O Caminho de Cancelamento Summary

**Uma Server Action estruturalmente incapaz de cancelar a assinatura de outra empresa — aridade 1, provada por teste — e uma confirmacao de dois cliques que mostra a data exata antes do segundo e nao mente sobre sucesso quando o gateway falha. 26 testes novos, zero overlay, zero dependencia nova.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-02T18:42:59Z
- **Completed:** 2026-09-02T18:49:43Z
- **Tasks:** 2 (ambas em TDD RED->GREEN, 4 commits)
- **Files created:** 4

## Accomplishments

- **A defesa contra o IDOR desta fase e uma AUSENCIA, e ela tem teste.** `PITFALLS.md` § Pitfall 11 nomeia palavra por palavra o cenario — *"Cancel-subscription action taking an `assinaturaId` from the form body"*. `cancelarAssinatura(slug)` nao tem parametro de id, e o caso `expect(cancelarAssinatura.length).toBe(1)` transforma isso em invariante executavel: qualquer segundo parametro (um id, ou um objeto que o carregasse) quebra o teste antes de chegar a code review. O `empresaId` sai de `getVerifiedSession()` e o identificador da assinatura no gateway e lido da propria Empresa dentro do service. Nenhum identificador atravessa a fronteira cliente->servidor — que e o que torna "empresa A cancela a assinatura de B" inalcancavel por construcao, e nao por vigilancia.

- **Consequencia direta, herdada do plano 07-04:** o 404 do gateway pode continuar sendo tratado como "ja removida" sem risco. A doc do Asaas usa o mesmo 404 para "nao existe" e para "nao pertence a conta autenticada"; o segundo caso e impossivel exatamente porque o id nunca veio do cliente. A seguranca do tratamento de erro do plano anterior depende desta assinatura de funcao — e agora ela esta travada por teste.

- **A confirmacao e uma substituicao de view, e o custo dessa escolha foi pago explicitamente.** D-03 pede "modal"; o que foi entregue e a substancia dele (confirmacao explicita, dois cliques, data exata antes do segundo) sem inventar a primitiva de overlay que a fase declinou — o projeto tem ZERO overlays e ja tem este padrao em `confirmar-remocao.tsx`. O unico beneficio que um overlay daria de graca — gestao de foco — foi implementado de proposito: `useEffect` move o foco para o `<h1>` (`tabIndex={-1}`) ao abrir e o devolve ao gatilho ao fechar, com dois casos de teste. Um terceiro caso afirma que a montagem inicial NAO rouba o foco, que e o bug que a implementacao ingenua desse `useEffect` produz.

- **Uma falha do gateway nao pode ser lida como sucesso.** No ramo de erro a view PERMANECE aberta e a mensagem aparece no `InlineError` — nenhum estado otimista de "cancelada" e renderizado, porque a escrita local e a unica coisa que torna aquilo verdadeiro (§ Pitfall 1 nomeia a variante otimista como o pior desfecho disponivel). O teste afirma as tres coisas juntas: o erro visivel, o heading ainda no documento, e `router.refresh()` NAO chamado.

- **A mensagem do gateway nao tem caminho ate a tela.** A action devolve exclusivamente as duas strings literais da UI-SPEC (E2 e E4). O teste planta PII no erro (`"Asaas: invalid customer cus_000123 <maria@exemplo.com>"`) e afirma, sobre o objeto SERIALIZADO, que nem o id do cliente, nem o e-mail, nem a palavra "Asaas" aparecem — enquanto um caso irmao confirma que o erro original chegou intacto ao `console.error` com o prefixo `[assinatura]`.

- **`pending` desabilita os DOIS botoes.** Sem isso, quem apertasse "Manter assinatura" no meio do voo veria a view fechar enquanto um cancelamento termina por tras (T-07-31). O teste usa uma promise controlada para congelar o estado pendente e afirma `toBeDisabled()` nos dois, mais o rotulo "Cancelando..." e a ausencia do rotulo afirmativo.

- **O rotulo de abortar e `Manter assinatura`, nunca `Cancelar`.** Numa tela cujo assunto e um cancelamento, `Cancelar` le igualmente como "cancelar a assinatura" e "cancelar este dialogo" — significados opostos, e os dois desfechos de leitura errada terminam em chamado de suporte ou chargeback, que e a falha exata que D-03 existe para evitar. A razao esta registrada em comentario no proprio botao.

## Task Commits

| # | Task | Gate | Commit |
|---|------|------|--------|
| 1 | `cancelarAssinatura(slug)` — a Server Action sem id (D-05) | RED (`test`) | `56f2efe` |
| 1 | idem | GREEN (`feat`) | `61f531f` |
| 2 | `CancelarAssinatura` — gatilho + confirmacao (D-03) | RED (`test`) | `f4b8c53` |
| 2 | idem | GREEN (`feat`) | `ccc2d8a` |

Nenhuma das duas tasks precisou de REFACTOR.

### TDD Gate Compliance

| Task | RED (`test`) | GREEN (`feat`) | RED falhou antes do GREEN? |
|------|--------------|----------------|----------------------------|
| 1 | `56f2efe` | `61f531f` | Sim — `Cannot find module './actions'`, 0 casos executados |
| 2 | `f4b8c53` | `ccc2d8a` | Sim — falha de resolucao de `./cancelar-assinatura`, 0 casos executados |

Nenhum teste passou inesperadamente na fase RED em nenhuma das duas tasks: em ambas o modulo sob teste ainda nao existia, entao a suite inteira falhou na importacao. Nao ha, portanto, nenhum caso de assercao negativa que pudesse ter passado vacuamente.

## Files Created/Modified

- `app/[slug]/admin/(protected)/assinatura/actions.ts` (72 linhas, novo) — `"use server"` na primeira linha; unica export `cancelarAssinatura(slug: string): Promise<{ error?: string }>`. JSDoc registra D-05 (com Pitfall 11 citado pelo nome) e a convencao INVERSA a de `iniciarPagamento`.
- `app/[slug]/admin/(protected)/assinatura/actions.test.ts` (182 linhas, novo) — `// @vitest-environment node`, 11 casos, molde de `_lib/assinatura-actions.test.ts` (`vi.hoisted`, `vi.mock` de `next/navigation`, `@/lib/session` e `@/app/services/assinatura.service`, `console.error` silenciado).
- `app/[slug]/admin/(protected)/assinatura/_components/cancelar-assinatura.tsx` (215 linhas, novo) — `"use client"` na primeira linha; `CancelarAssinatura` + `CancelarAssinaturaProps`.
- `app/[slug]/admin/(protected)/assinatura/_components/cancelar-assinatura.test.tsx` (214 linhas, novo) — 15 casos com `@testing-library/react` + `userEvent`, `vi.mock("next/navigation")` para `useRouter`.

Nenhum arquivo existente foi modificado. `confirmar-remocao.tsx`, `aviso-carencia.tsx` e `bloqueado-card.tsx` foram lidos como referencia e permanecem intocados.

## Decisions Made

- **Comentarios de proibicao nao citam o token proibido.** Tres criterios de aceitacao do plano usam grep **cru** (sem descartar comentarios): `grep -c 'redirect'` em `actions.ts`, e `grep -cE 'role="dialog"|aria-modal|createPortal|fixed inset-0'` e `grep -cE 'new Date\(|Intl\.'` no componente. O plano tambem manda registrar essas proibicoes em comentario. Escrever o token no JSDoc satisfaz uma exigencia e quebra a outra — e a que quebra e o gate, que e o artefato durável e que o plano 07-07 vai herdar. Resolucao: a regra continua escrita, em portugues, nomeando o conceito (`o papel ARIA de dialogo`, `o portal do React DOM`, `o utilitario de navegacao do next/navigation`) em vez do literal, com uma nota explicando que o token esta ausente ate como citacao justamente para o gate poder conta-lo sem pre-processamento. Nenhuma informacao se perdeu; os 4 greps devolvem 0.
- **Sem `revalidatePath`.** A re-renderizacao vem de `router.refresh()` no cliente, e a page e dinamica por construcao (`cookies()` via `requireAdminSession` + Prisma sem `unstable_cache`), como prescrito pelo plano.
- **O paragrafo travado e uma template string unica**, com a frase final extraida para a constante `CONSEQUENCIA` numa unica linha de fonte. JSX com texto interpolado quebraria a frase em varias linhas do arquivo e tornaria a igualdade byte-a-byte com `aviso-carencia.tsx` inverificavel por grep — que e precisamente o criterio de aceitacao. Como efeito colateral desejavel, o paragrafo vira um unico no de texto e o teste pode afirmar a copy inteira de uma vez.
- **O gatilho tambem limpa o erro ao ABRIR** (`setError(null)`), nao so ao abortar. Sem isso, um usuario que falhou, apertou "Manter assinatura" e reabriu a confirmacao veria a mensagem antiga como se fosse resposta ao novo clique. Coberto por caso de teste proprio.
- **`jaAbriu` (`useRef`) guarda o `useEffect` de foco.** O efeito roda tambem no primeiro render, quando a view ja e `"padrao"`; sem a guarda, montar o componente arrancaria o foco de onde quer que o usuario estivesse na pagina. Ha um caso de teste afirmando que a montagem inicial nao rouba o foco.
- **`useRouter` foi mockado, e nao `next/navigation` inteiro com `importOriginal`.** O componente importa exatamente um simbolo daquele modulo; um mock parcial acrescentaria superficie sem ganho.

## Deviations from Plan

Nenhuma regra de desvio (1-4) foi acionada. Nenhum bug, nenhuma funcionalidade critica ausente e nenhum bloqueio.

Uma tensao **interna ao proprio plano** precisou de arbitragem, registrada acima em Decisions Made: o `<action>` de cada task manda documentar as proibicoes em comentario, e tres `<acceptance_criteria>` das mesmas tasks usam grep cru sobre os tokens proibidos. As duas exigencias sao satisfeitas simultaneamente descrevendo a regra sem citar o literal. Isso foi detectado e corrigido **antes** dos commits de implementacao (ambos os arquivos foram ajustados na fase GREEN, com os testes re-executados depois), entao nenhum commit deste plano contem uma violacao de gate.

Duas observacoes de escopo, ambas **fora** do escopo deste plano e deliberadamente nao corrigidas (identicas as ja registradas em `07-01-SUMMARY.md` e `07-04-SUMMARY.md`):

1. **`npx tsc --noEmit` falha num worktree novo** com `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`. Nao e regressao: `LayoutProps` e tipo global gerado pelo Next.js 16 em `.next/types`, gitignored. Resolvido com `npx next typegen` (nenhum arquivo de codigo tocado). Depois disso `tsc --noEmit` sai 0.
2. **`npm run lint` reporta 2 warnings pre-existentes** (`Link` nao usado em `app/registro/page.tsx`; `fatosDeTrial` nao usado em `app/services/reconciliacao.service.test.ts`), ambos em arquivos que este plano nao toca. 0 errors. Nao corrigidos por SCOPE BOUNDARY.

## Issues Encountered

None.

## Verification

| Gate | Resultado |
|------|-----------|
| `npx vitest run "app/[slug]/admin/(protected)/assinatura/actions.test.ts"` | **11 passed** |
| `npx vitest run "app/[slug]/admin/(protected)/assinatura/_components/cancelar-assinatura.test.tsx"` | **15 passed** |
| `npm test` | **1119 passed** (98 files) — baseline do worktree era 1093, +26 novos, zero regressao |
| `npx tsc --noEmit` | exit 0 (apos `npx next typegen`) |
| `npm run lint` | 0 errors (2 warnings pre-existentes) |
| `git diff package.json` | vazio — T-07-SC honrado, nenhuma dependencia nova |
| `git status --porcelain confirmar-remocao.tsx` | vazio — o componente-referencia nao foi editado |

### Acceptance criteria por task

**Task 1 — `actions.ts`:**

| Criterio | Resultado |
|----------|-----------|
| `npx vitest run actions.test.ts` sai 0 | 11/11 passed |
| Primeira linha e `"use server";` | ✅ |
| Contem `export async function cancelarAssinatura(slug: string)`, sem outro parametro | 1 ocorrencia |
| `grep -v '^\s*[*/]' \| grep -cE 'assinaturaId\|subscriptionId\|customerId'` | **0** |
| `grep -c 'formData\|FormData'` | **0** |
| `grep -c 'redirect'` | **0** (tambem 0 com `-i`) |
| Teste afirmando `cancelarAssinatura.length === 1` | presente |
| Teste afirmando `cancelar` chamado com o `empresaId` da sessao mockada | presente (dois: o positivo e o que troca o `empresaId` da sessao) |
| Teste afirmando que a mensagem do erro NAO aparece no retorno | presente (com PII plantada, sobre o objeto serializado) |
| `npx tsc --noEmit` sai 0 | ✅ |

**Task 2 — `cancelar-assinatura.tsx`:**

| Criterio | Resultado |
|----------|-----------|
| `npx vitest run cancelar-assinatura.test.tsx` sai 0 | 15/15 passed |
| Primeira linha e `"use client";` | ✅ |
| Contem a string exata da frase travada, que tambem existe em `aviso-carencia.tsx` | 1 aqui / 3 la |
| Contem `Sim, cancelar assinatura`, `Manter assinatura` e `Cancelando...` | 3 linhas |
| `grep -cE 'role="dialog"\|aria-modal\|createPortal\|fixed inset-0'` | **0** |
| `grep -cE 'new Date\(\|Intl\.'` | **0** |
| `grep -cE 'assinaturaId\|subscriptionId\|customerId'` | **0** |
| `grep -c 'fetch('` | **0** |
| Teste afirmando action chamada sem nenhum argumento | presente (`toHaveBeenCalledWith()` + `mock.calls[0]` com length 0) |
| Teste afirmando view aberta apos erro | presente |
| Teste afirmando os dois botoes `disabled` no pending | presente |
| `git status --porcelain confirmar-remocao.tsx` vazio | ✅ |
| `npx tsc --noEmit` e `npm run lint` saem 0 | ✅ |

### Must-haves do plano

| Verdade | Como esta provada |
|---------|-------------------|
| Um clique nao cancela nada | Caso "um clique nao cancela — apenas substitui a view", com `expect(cancelarAction).not.toHaveBeenCalled()` |
| A data exata esta visivel ANTES do segundo clique | Caso que afirma a copy inteira (com a data) apos o PRIMEIRO clique |
| A acao nao aceita identificador vindo do cliente | `cancelarAssinatura.length === 1` + 4 greps a 0 + caso que ignora um `FormData` invasor |
| Uma falha mantem a tela aberta com o erro em linha | Caso T-07-30: erro visivel, heading presente, `router.refresh()` nao chamado |

| Artefato | Estado |
|----------|--------|
| `actions.ts` provendo `cancelarAssinatura(slug)` | contem `cancelarAssinatura`; aridade 1 |
| `cancelar-assinatura.tsx` (min_lines 60) | **215** linhas; contem `Manter assinatura` |

| Key link | Padrao | Ocorrencias |
|----------|--------|-------------|
| `actions.ts` -> `assinaturaService.cancelar` | `session.empresaId` | 2 |
| `cancelar-assinatura.tsx` -> `cancelarAssinatura` | `startTransition` | 2 |

### Success criteria do plano

1. ✅ A Server Action tem aridade 1 e nenhum identificador atravessa a fronteira cliente->servidor — provado por assercao de aridade, por 4 greps a 0 e pelo caso que planta `assinaturaId` num `FormData` e verifica que ele e ignorado
2. ✅ Um clique nao cancela; a data exata aparece antes do segundo clique, na copy travada byte-identica a de `aviso-carencia.tsx`
3. ✅ Falha do gateway mantem a confirmacao aberta com `InlineError`; sucesso chama `router.refresh()`
4. ✅ Nenhum overlay, nenhum emoji, nenhuma dependencia nova, e `confirmar-remocao.tsx` intocado

### Threat register

| Threat ID | Estado |
|-----------|--------|
| T-07-26 | Aplicado — aridade 1 com teste; `empresaId` de `getVerifiedSession()`; alvos de grep prontos para o gate de 07-07 |
| T-07-27 | Aplicado — `grep -c 'FormData'` = 0 na action; chamada por `startTransition`, nao por submit de form; nenhum input escondido no markup |
| T-07-28 | Aplicado — `session.empresaSlug !== slug` sai antes de qualquer I/O, com caso de teste que afirma `cancelar` nao chamado |
| T-07-29 | Aplicado — E2/E4 literais; caso com PII plantada afirmando nao-vazamento sobre o retorno serializado, com o par positivo no `console.error` |
| T-07-30 | Aplicado — sem estado otimista; a view so fecha apos `{}`; erro mantem a view aberta com `InlineError` |
| T-07-31 | Aplicado — `pending` desabilita os dois botoes, com caso de teste sobre promise controlada |
| T-07-32 | Aplicado — foco no `<h1>` ao abrir, de volta ao gatilho ao fechar, e nao roubado na montagem — 3 casos de teste |
| T-07-SC | Honrado — `git diff package.json` vazio; nenhuma lib de modal, nenhuma dependencia instalada |

## Known Stubs

None. Os dois artefatos sao implementacoes completas com teste. O componente ainda **nao esta montado em nenhuma page** — `app/[slug]/admin/(protected)/assinatura/page.tsx` e entregue pelo plano 07-06 —, mas isso e sequenciamento de plano declarado no proprio `<objective>`, nao um stub: nenhum valor placeholder e renderizado e nenhum caminho devolve dado falso.

## Threat Flags

Nenhuma superficie de seguranca nova alem da ja registrada no `<threat_model>` do plano. Este plano acrescenta exatamente uma fronteira cliente->servidor (a Server Action), que e o objeto de T-07-26/27/28/29. Nenhum endpoint HTTP novo, nenhuma rota nova, nenhuma alteracao de schema, nenhuma saida de rede nova (a chamada ao Asaas e a do plano 07-04, inalterada).

## User Setup Required

None.

## Next Phase Readiness

- **07-06 (page.tsx)** monta os dois artefatos: renderiza `<CancelarAssinatura ultimoDiaDeAcesso={...} cancelarAction={cancelarAssinatura.bind(null, slug)} />` **somente** quando conseguir produzir a data (`podeCancelar`). A prop e uma string obrigatoria e nao-nula, ja formatada `dd/mm/aaaa` em `America/Sao_Paulo` por `ultimoDiaDeAcessoEmSaoPaulo` (07-01) — o componente nao formata data e nao tem fallback para `null` por decisao de D-03.
- **07-07 (gate estatico)** tem alvos concretos ja verificados aqui, todos devolvendo 0 sem precisar descartar comentarios: em `actions.ts`, `redirect`, `FormData` e (fora de comentarios) `assinaturaId|subscriptionId|customerId`; no componente, `role="dialog"|aria-modal|createPortal|fixed inset-0`, `new Date\(|Intl\.`, `assinaturaId|subscriptionId|customerId` e `fetch(`. O gate de aridade tem contraparte executavel em `actions.test.ts`.
- **07-08 (e2e)** pode roteirizar os dois cliques pelos rotulos travados `Cancelar assinatura` -> `Sim, cancelar assinatura`, e o caminho de aborto por `Manter assinatura`.

**Pendencia de bookkeeping para o orquestrador:** SUB-02 continua `[ ]` em `REQUIREMENTS.md`. Este plano entrega o caminho de cancelamento completo (action + confirmacao), mas nenhum usuario ainda alcanca a tela — a capacidade visivel fecha em 07-06, quando a page monta o componente. Mesma decisao registrada em `07-01-SUMMARY.md` e `07-04-SUMMARY.md`.

## Self-Check: PASSED

- Arquivos afirmados existem: `app/[slug]/admin/(protected)/assinatura/actions.ts`, `actions.test.ts`, `_components/cancelar-assinatura.tsx`, `_components/cancelar-assinatura.test.tsx` — 4/4 FOUND
- Commits afirmados existem: `56f2efe`, `61f531f`, `f4b8c53`, `ccc2d8a` — 4/4 FOUND
- Nenhum arquivo existente modificado: `git status --short` mostrou apenas os arquivos novos deste plano antes de cada commit
- STATE.md e ROADMAP.md **nao** foram modificados (modo worktree; o orquestrador e o dono dessas escritas)

---
*Phase: 07-gest-o-de-assinatura*
*Completed: 2026-09-02*
