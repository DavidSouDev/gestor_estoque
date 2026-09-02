---
phase: 06-termos-de-uso-e-aceite
plan: 05
subsystem: frontend
tags: [termos-de-uso, server-action, rsc, guarda-simetrica, toctou, tdd, vitest, ui]

# Dependency graph
requires:
  - phase: 06-termos-de-uso-e-aceite
    plan: 02
    provides: "termoVigente() deduplicada por React.cache + termoService.registrarAceite(usuarioId, termoId) idempotente"
  - phase: 06-termos-de-uso-e-aceite
    plan: 04
    provides: "ContaAtiva.termosPendentes e o redirect para /{slug}/admin/aceitar-termos em requireAdminSession"
provides:
  - "Rota /{slug}/admin/aceitar-termos — destino do redirect de TERM-04, FORA do grupo (protected)"
  - "Server Action aceitarTermos(slug, formData) que se autoriza sozinha e grava contra a versao do servidor"
  - "AceiteCard / AceitarButton — shell de bloqueado-card em slate com glifo de documento"
  - "Prova por teste de ausencia de loop: guarda simetrica dos 5 estados + regressao que le bloqueado/page.tsx"
affects: [06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action fora de (protected) se autoriza sozinha: getVerifiedSession + conferencia de slug ANTES de qualquer I/O"
    - "Identidade de quem consente sai da sessao; o formulario carrega UM campo (a versao vista), nunca um campo de identidade"
    - "Anti-TOCTOU por igualdade contra o valor do servidor, gravando sempre o valor do servidor"
    - "Data formatada no servidor e passada como string: componente sem construcao de data, testavel sem fake timers"
    - "Teste de regressao que le o CODIGO-FONTE de outro arquivo para travar uma ausencia deliberada"

key-files:
  created:
    - app/[slug]/admin/aceitar-termos/actions.ts
    - app/[slug]/admin/aceitar-termos/actions.test.ts
    - app/[slug]/admin/aceitar-termos/_components/aceite-card.tsx
    - app/[slug]/admin/aceitar-termos/_components/aceitar-button.tsx
    - app/[slug]/admin/aceitar-termos/page.tsx
    - app/[slug]/admin/aceitar-termos/page.test.ts
  modified: []

key-decisions:
  - "Task 1 ganhou um arquivo de teste proprio (actions.test.ts) que o plano nao declarava: a task e tdd=true com bloco <behavior>, e a action concentra 4 mitigacoes do threat model (T-06-06, T-06-29, T-06-07, T-06-10)"
  - "A guarda simetrica tem 5 condicoes, nao 3: as duas primeiras (sessao e conta) sao pre-requisito do predicado, e a quinta (termo vigente) fecha a simetria mesmo sendo inalcancavel"
  - "publicadoEm formatado com formatDate() de lib/format.ts — helper existente do projeto, nenhuma funcao de data nova"
  - "O comentario sobre HTML cru na caixa do termo foi escrito SEM o identificador literal, para que o grep de proibicao continue devolvendo 0"

requirements-completed: [TERM-04]

# Metrics
duration: 14min
completed: 2026-09-02
---

# Phase 6 Plan 05: Tela de Aceite de Termos Summary

**A rota `/{slug}/admin/aceitar-termos` como replica exata da mecanica de `/bloqueado` com predicado trocado: pasta irma de `(protected)`, guarda simetrica de 5 condicoes na ordem da maquina de estados, Server Action que se autoriza sozinha e grava o aceite contra a versao lida do servidor — com 25 casos de teste novos, incluindo o de regressao que le `bloqueado/page.tsx` para travar a ausencia deliberada de checagem de termos.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-09-02T10:36:00Z
- **Completed:** 2026-09-02T10:50:00Z
- **Tasks:** 3 (duas `tdd="true"`, ciclo RED/GREEN cumprido em ambas)
- **Files created:** 6 (0 modificados — este plano nao toca nenhum arquivo existente)

## Accomplishments

- **`actions.ts` — a Server Action que se autoriza sozinha.** `getVerifiedSession()` + conferencia de `session.empresaSlug !== slug` **antes** de qualquer I/O de termos, `usuarioId` derivado de `session.sub` e de mais lugar nenhum, `termoId` do hidden input comparado por **igualdade** contra o vigente do servidor e gravacao sempre de `vigente.id`. Todos os `redirect()` fora de qualquer `try`. O JSDoc carrega as quatro decisoes exigidas — (a) Pitfall 8, (b) a regra do `usuarioId`, (c) TOCTOU e (d) a recusa do `?next=`.
- **`_components/aceite-card.tsx` + `aceitar-button.tsx` — o shell reconhecivel, em slate.** Fundo, card, barra de gradiente e bloco de logout copiados de `bloqueado-card.tsx`; tile `slate-100` com glifo de **documento** (nunca o cadeado da Fase 4); texto do termo como no de texto React com `whitespace-pre-wrap` numa caixa `role="region"` + `aria-label` + `tabIndex={0}`. `AceitarButton` usa `useFormStatus` (nao `useActionState`), com a string de classe caractere-a-caractere igual a variante `bloqueado` de `PagarButton`.
- **`page.tsx` — a guarda simetrica.** Pasta **irma** de `(protected)/` e de `bloqueado/`; docblock adaptado palavra por palavra do de `bloqueado/page.tsx`, com o paragrafo adicional que registra por que aquele arquivo **nao pode** ganhar checagem de termos. Cinco condicoes na ordem da maquina de estados, `logout.bind(null, slug)` reusando a action existente.
- **Prova de ausencia de loop, nas duas metades.** A metade "ordem dos gates" ja existia em `lib/session.test.ts` (06-04); esta plano acrescenta a metade "guardas simetricas": 3 casos cobrindo o estado (bloqueado, pendente) -> `/bloqueado` e um caso de regressao que **le o codigo-fonte** de `bloqueado/page.tsx` e falha se a string `termosPendentes` aparecer la.
- **Suite completa subiu de 987 para 1012 testes** (95 arquivos), `tsc --noEmit` e `lint` limpos (0 erros), `git diff package.json` vazio (T-06-SC).

## Task Commits

1. **Task 1 RED: teste falhando de `aceitarTermos`** - `a94b4f5` (test)
2. **Task 1 GREEN: Server Action com auto-autorizacao e guarda de TOCTOU** - `b6aa89f` (feat)
3. **Task 2: `AceiteCard` + `AceitarButton`** - `5ffa784` (feat)
4. **Task 3 RED: teste falhando da guarda simetrica** - `fcb9de3` (test)
5. **Task 3 GREEN: `page.tsx` fora de `(protected)`** - `39f5db7` (feat)

Nenhuma fase REFACTOR foi necessaria: as duas implementacoes sao lineares, sem duplicacao a extrair.

## Files Created/Modified

- `app/[slug]/admin/aceitar-termos/actions.ts` (+88, novo) - `aceitarTermos(slug, formData): Promise<void>`, ligavel por `.bind(null, slug)`. 42 linhas de JSDoc normativo cobrindo as quatro decisoes.
- `app/[slug]/admin/aceitar-termos/actions.test.ts` (+159, novo) - **10 casos**: sem sessao / tenant divergente (ambos com assercao negativa de que `termoVigente` **nao** foi chamado), sem termo vigente, TOCTOU, `termoId` ausente, `termoId` vazio, gravacao com `session.sub`, `usuarioId` forjado ignorado, falha do service com assercao de `console.error`, e o caso que prova que o `redirect` de sucesso **nao** e engolido pelo `catch`.
- `app/[slug]/admin/aceitar-termos/_components/aceite-card.tsx` (+157, novo) - server component puro. Props sao decisoes ja tomadas; `publicadoEmFormatado` chega como string.
- `app/[slug]/admin/aceitar-termos/_components/aceitar-button.tsx` (+49, novo) - client component, `useFormStatus`, rotulo `Aceitar e continuar` / `Registrando aceite...`.
- `app/[slug]/admin/aceitar-termos/page.tsx` (+109, novo) - guarda simetrica de 5 condicoes + fallback de branding + bind das duas actions.
- `app/[slug]/admin/aceitar-termos/page.test.ts` (+228, novo) - **15 casos**, incluindo os 4 status em dia parametrizados, os 2 rotulos de suspensao parametrizados e o caso de regressao da maquina de estados.

## Decisions Made

- **Task 1 ganhou `actions.test.ts`, que o plano nao declarava.** A task e `tdd="true"` e traz um bloco `<behavior>` com seis comportamentos, mas `files_modified` so lista `actions.ts` e o `<verify>` e apenas `tsc` + `lint`. Escrever os testes foi tratado como a leitura correta do `tdd="true"` — e a action concentra quatro dispositions `mitigate` do threat model (T-06-06, T-06-29, T-06-07, T-06-10); mitigacoes sem teste sao afirmacoes, nao provas. Registrado tambem como desvio 2 abaixo.
- **A guarda simetrica tem cinco condicoes, nao as tres da tabela do RESEARCH.** A tabela lista o que e especifico desta rota (`!conta`, `acessoBloqueado`, `!termosPendentes`); as duas condicoes extras sao a de sessao (que precede tudo, em ambas as rotas) e a de termo vigente (quinta, para que a guarda seja simetrica mesmo num estado que o gate torna inalcancavel). O `<action>` do plano ja pedia exatamente essa sequencia de cinco.
- **`formatDate()` de `lib/format.ts`, nao um formatador novo.** O plano pedia "o helper de data existente do projeto se houver" — ha, e ele ja produz `dd/mm/aaaa` em `pt-BR`.
- **O comentario sobre HTML cru na caixa do termo evita o identificador literal.** O `<action>` pede que a proibicao esteja comentada e o criterio de aceite exige `grep -c "dangerouslySetInnerHTML"` = **0**. Os dois so sao satisfeitos simultaneamente escrevendo a proibicao sem escrever o nome do prop — que e o que o arquivo faz ("Injetar HTML cru aqui e PROIBIDO nesta fase"). Um gate estatico futuro le 0, como deve.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree sem `node_modules`, sem `.env` e sem os tipos gerados do Next**
- **Found during:** setup, antes da Task 1
- **Issue:** O worktree e criado so com arquivos versionados. Sem `node_modules` nenhum comando roda; sem `.env` o `DATABASE_URL` nao existe; sem `.next/types` o `tsc` falha em `app/layout.tsx`. Identico ao desvio 1 dos planos 06-01, 06-02 e 06-04.
- **Fix:** Symlinks de `node_modules` e `.env` apontando para o checkout principal (ambos cobertos pelo `.gitignore`), mais `npx next typegen`. **Nenhum pacote instalado.**
- **Files modified:** nenhum arquivo versionado
- **Verification:** `git status --short` vazio apos os symlinks; `npx tsc --noEmit` saiu 0 no baseline, antes de qualquer codigo novo.
- **Committed in:** n/a (artefatos gitignored)

**2. [Rule 2 - Missing critical] Task 1 nao declarava arquivo de teste apesar de `tdd="true"`**
- **Found during:** Task 1
- **Issue:** A task e marcada `tdd="true"` e define seis comportamentos observaveis, mas nenhum arquivo de teste aparece em `<files>` nem no `files_modified` do frontmatter, e o `<verify>` e so `tsc` + `lint`. Sem teste, as quatro mitigacoes de threat model que vivem nesta action (identidade derivada da sessao, auto-autorizacao, anti-TOCTOU, destino fixo) ficariam sem prova executavel — e sao exatamente as que uma refatoracao futura desfaz sem perceber.
- **Fix:** Criado `app/[slug]/admin/aceitar-termos/actions.test.ts` com 10 casos cobrindo os seis comportamentos mais os tres cenarios de seguranca. Ciclo RED (modulo inexistente) -> GREEN cumprido.
- **Files modified:** `app/[slug]/admin/aceitar-termos/actions.test.ts` (novo)
- **Verification:** 10/10 verdes; nao-vacuidade confirmada — a suite falhou por modulo inexistente antes da implementacao.
- **Committed in:** `a94b4f5`, `b6aa89f`

---

**Total deviations:** 2 auto-fixadas (1 Rule 3, 1 Rule 2). Nenhum desvio de escopo, nenhum pacote instalado, nenhum arquivo existente tocado.

## Nota sobre dois criterios de aceitacao literais (nao sao desvios de comportamento)

Mesma classe de contradicao literal que o plano 06-04 ja registrou para `permitirEmpresaBloqueada`: o `<action>` **exige um comentario que nomeia um identificador**, e o `<acceptance_criteria>` **exige que o grep daquele identificador retorne 0 ou 1**. Os dois criterios afetados:

| Criterio | Valor cru | Descartando linhas de comentario | Intencao satisfeita? |
|---|---|---|---|
| `grep -c "next=" actions.ts` = 0 | **2** | **0** | Sim — as duas ocorrencias estao no JSDoc que o proprio `<action>` ponto (d) manda escrever. Nenhum `?next=` no codigo. |
| `grep -c "useFormStatus" aceitar-button.tsx` = 1 | **3** | **2** (import + chamada) | Sim — a terceira e o JSDoc que o `<action>` manda reproduzir de `pagar-button.tsx`, que tem exatamente as mesmas 3 ocorrencias. `useActionState` = 0. |

**Consequencia para o plano 06-08:** o gate `gates:fase-06` precisa **descartar linhas de comentario antes de contar** tambem em `app/[slug]/admin/aceitar-termos/actions.ts` e `_components/aceitar-button.tsx` — somando-se a `lib/api-auth.ts` (06-04) e aos dois arquivos ja apontados pelo 06-02. O terceiro grep dessa familia, `dangerouslySetInnerHTML` = 0, foi satisfeito **literalmente** (ver Decisions Made), porque e o unico dos tres com valor de seguranca real.

## Verification Results

| Verificacao | Esperado | Resultado |
|-------------|----------|-----------|
| `npx vitest run aceitar-termos/page` | >= 7 casos, exit 0 | **15 casos**, exit 0 |
| `npx vitest run aceitar-termos` (page + actions) | exit 0 | **25 casos**, exit 0 |
| `npm run test` (suite completa) | verde | 95 arquivos / **1012 testes** (eram 987) |
| `npx tsc --noEmit` | exit 0 | exit 0 |
| `npm run lint` | exit 0 | exit 0, **0 erros** (2 warnings pre-existentes, em arquivos nao tocados) |
| `ls "app/[slug]/admin/"` lista `(protected)`, `aceitar-termos`, `bloqueado` no mesmo nivel | sim | sim |
| `app/[slug]/admin/(protected)/aceitar-termos` | nao existe | nao existe |
| `grep -c "termosPendentes" "app/[slug]/admin/bloqueado/page.tsx"` | 0 | **0** (e ha um teste que afirma isso) |
| `grep -rc "amber" "app/[slug]/admin/aceitar-termos/"` | 0 | **0** nos 6 arquivos |
| `grep -c "getVerifiedSession" actions.ts` | >= 1 | 3 |
| `grep -c "session.sub" actions.ts` | >= 1 | 2 |
| `grep -c 'formData.get("usuarioId")' actions.ts` | 0 | 0 |
| `grep -c "use server" actions.ts` | 1 | 1 |
| `redirect(` dentro de `try` em `actions.ts` | nenhum | nenhum (o `try` contem so a chamada ao service) |
| `grep -c "dangerouslySetInnerHTML" aceite-card.tsx` | 0 | **0** |
| `grep -c "whitespace-pre-wrap" aceite-card.tsx` | 1 | 1 |
| `grep -c "new Date" aceite-card.tsx` | 0 | **0** |
| `grep -c "usuarioId" aceite-card.tsx` | 0 | **0** |
| `grep -c "Sair da conta" aceite-card.tsx` | 1 | 1 |
| `grep -c 'role="region"' aceite-card.tsx` + `tabIndex={0}` na mesma div | 1 / presente | 1 / presente |
| `grep -cE "font-medium\|font-bold"` nos dois componentes | 0 | **0 / 0** |
| `grep -c "useActionState" aceitar-button.tsx` | 0 | **0** |
| `grep -rcE "AdminNav\|SimplesTopBar" "app/[slug]/admin/aceitar-termos/"` | 0 | **0** nos 6 arquivos |
| `grep -c "logout.bind" page.tsx` | 1 | 1 (nenhuma funcao de logout nova no diretorio) |
| ordem em `page.tsx` | `getVerifiedSession` < `revalidarConta`; `acessoBloqueado` < `termosPendentes` | linha 51 < 57; linha 67 < 72 |
| caso de teste do estado (bloqueado, pendente) -> `/bloqueado` | existe | existe, parametrizado em `BLOQUEADO` e `CANCELADO` |
| `git diff --stat "app/[slug]/admin/bloqueado/"` | vazio | vazio |
| `git diff --stat "app/[slug]/admin/(protected)/layout.tsx"` | vazio | vazio |
| `git diff package.json` | vazio | vazio |
| `page.tsx` >= 50 linhas (`min_lines`) | sim | 109 linhas |
| delecoes de arquivo nos 5 commits | nenhuma | nenhuma |

## Threat Model Coverage

| Threat ID | Disposition | Como ficou |
|-----------|-------------|------------|
| T-06-06 | mitigate | `usuarioId` derivado de `session.sub`; `grep -c "usuarioId"` = 0 em `aceite-card.tsx` e nenhuma leitura de `usuarioId` do `FormData` em `actions.ts`. Caso de teste dedicado com `usuarioId` forjado no formulario, provando que ele e ignorado. |
| T-06-29 | mitigate | `getVerifiedSession()` + `session.empresaSlug !== slug` antes de qualquer I/O. Dois casos de teste com assercao negativa de que `termoVigente` **nao** foi chamado — a ORDEM e parte da mitigacao, e e ela que os testes provam. |
| T-06-07 | mitigate | Igualdade contra `vigente.id`; grava sempre `vigente.id`. Quatro casos: divergencia, ausente, vazio, sucesso. O card re-renderiza com o texto NOVO (o `page.tsx` sempre le o vigente) e a copy E1. |
| T-06-08 | mitigate | Conteudo como no de texto React + `whitespace-pre-wrap`; grep do prop de HTML cru = **0**. |
| T-06-10 | mitigate | Destino fixo `/{slug}/admin`; nenhum `?next=` no codigo (ver nota sobre o grep literal). |
| T-06-26 | mitigate | Guarda simetrica de 5 condicoes na ordem da maquina de estados + caso de regressao que **le o codigo-fonte** de `bloqueado/page.tsx` e falha se `termosPendentes` aparecer la. Complementa a metade ja provada em `lib/session.test.ts` (06-04). |
| T-06-30 | mitigate | `Sair da conta` ligado a action `logout` **existente** (nenhuma nova foi escrita), que nao chama `requireAdminSession`. Criterio de sucesso #4 do roadmap. |
| T-06-04 | mitigate | Page com guarda propria, pasta irma de `(protected)`; `(protected)/layout.tsx` com diff vazio. |
| T-06-31 | accept | Texto vigente no RSC Payload — publico por natureza, com teto de 200000 caracteres do plano 06-03. Inalterado. |
| T-06-SC | mitigate | Zero pacotes novos; `git diff package.json` vazio; nenhum componente de registry. |

## Threat Flags

Nenhuma superficie de seguranca nova fora do `<threat_model>` do plano. A rota nova e o unico endpoint acrescentado, e ela esta inteiramente coberta pelo registro acima (boundary de sessao na page e na action, boundary de `FormData` no `termoId`). Nenhuma mudanca de schema, nenhum caminho de escrita alem do `registrarAceite` ja existente.

## Known Stubs

Nenhum. Os seis arquivos estao completos e ligados: a rota renderiza dados reais de `termoVigente()` e `findHeaderData()`, a action grava pelo service real, e as duas actions do card sao binds de funcoes existentes. Nenhum valor vazio, placeholder ou `TODO`.

## User Setup Required

Nenhuma. Nada de servico externo, nada de variavel de ambiente nova.

## Next Phase Readiness

- **A advertencia operacional do 06-04 esta metade resolvida.** O redirect de TERM-04 agora aponta para uma rota que existe. Os e2e continuam dependendo do 06-06 (registro gravando `termoAceitoId`); com 06-05 e 06-06 mergeados, o funil fecha.
- **06-07 (e2e)** pode ancorar nos rotulos estaveis desta tela: `Termos de Uso` (`<h1>`), `Aceitar e continuar`, `Registrando aceite...`, `Sair da conta`, e a caixa de texto por `aria-label="Texto dos Termos de Uso"`. O parametro `?erro=termos-atualizados` e o unico que a tela le.
- **06-08 (gates)** precisa: (a) descartar linhas de comentario antes de contar `next=` em `actions.ts` e `useFormStatus` em `aceitar-button.tsx` (ver a nota acima); (b) pode contar `amber` e `dangerouslySetInnerHTML` **literalmente** nesta pasta — ambos sao 0 de verdade; (c) o gate mais valioso desta area ja e um teste unitario, nao um grep: a regressao de `termosPendentes` em `bloqueado/page.tsx` esta em `page.test.ts` e falha o `npm run test`.

## Self-Check: PASSED

Arquivos declarados, todos presentes em disco: `app/[slug]/admin/aceitar-termos/actions.ts`, `actions.test.ts`, `page.tsx`, `page.test.ts`, `_components/aceite-card.tsx`, `_components/aceitar-button.tsx`.

Commits declarados, todos presentes no historico da branch: `a94b4f5`, `b6aa89f`, `5ffa784`, `fcb9de3`, `39f5db7`.

Nenhum arquivo deletado por nenhum dos 5 commits (`git diff --diff-filter=D --name-only dea6b70 HEAD` vazio). Nenhum arquivo existente modificado: o diffstat do plano inteiro e `6 files changed, 790 insertions(+)`, sem uma unica delecao.

---
*Phase: 06-termos-de-uso-e-aceite*
*Completed: 2026-09-02*
