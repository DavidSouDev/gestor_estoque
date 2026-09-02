---
phase: 07-gest-o-de-assinatura
plan: 02
subsystem: ui
tags: [react, next, server-actions, polling, billing, acessibilidade]

# Dependency graph
requires:
  - phase: 02-motor-de-acesso
    provides: "avaliarAcesso + acessoBloqueado — o predicado unico que decide se o painel destravou"
  - phase: 01-pre-requisitos-de-producao
    provides: "revalidarConta (DAL fail-closed) e getVerifiedSession"
  - phase: 04-aplicacao-do-bloqueio
    provides: "tela /{slug}/admin/bloqueado, BloqueadoCard, PagarButton e a guarda simetrica da page"
provides:
  - "consultarStatusAcesso(slug) — Server Action de leitura que responde 'o painel ja destravou?' sobre fatos LOCAIS"
  - "PollerDeStatus — client component de convergencia com backoff, teto de 7 tentativas e clearTimeout no unmount"
  - "BloqueadoCardProps.consultarStatusAction — ponto de montagem do poller na tela de bloqueio"
affects: [07-03, 07-04, 07-07, assinatura, checkout, gates-fase-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Polling de convergencia sobre fatos locais, nunca contra o gateway"
    - "Action vinculada ao tenant pelo servidor (.bind(null, slug)) como unica prop de rede de um client component"
    - "Backoff crescente com teto finito e fallback textual explicito"

key-files:
  created:
    - app/[slug]/admin/_components/poller-de-status.tsx
    - app/[slug]/admin/_components/poller-de-status.test.tsx
  modified:
    - app/[slug]/admin/_lib/assinatura-actions.ts
    - app/[slug]/admin/_lib/assinatura-actions.test.ts
    - app/[slug]/admin/bloqueado/_components/bloqueado-card.tsx
    - app/[slug]/admin/bloqueado/_components/bloqueado-card.test.tsx
    - app/[slug]/admin/bloqueado/page.tsx

key-decisions:
  - "O poller pergunta 'o painel ja destravou?' e nao 'a assinatura existe no Asaas?' — sao perguntas diferentes e o gateway nao saberia responder a primeira nos segundos em que o poller mais roda"
  - "Montagem INCONDICIONAL na tela de bloqueio: condicionar a um marcador de searchParams exigiria mudar a successUrl, que o Achado 7 manda explicitamente nao mudar"
  - "A action devolve { liberado: boolean } derivado, nunca o StatusAcesso cru — o cliente nao ganha autoridade para reinterpretar o rotulo"
  - "Props do poller sem slug e sem nenhum id: a action chega ja vinculada ao tenant pelo servidor"
  - "Copy de fallback abre com 'Se voce acabou de pagar' porque o poller monta para TODO visitante bloqueado, e a maioria nao acabou de pagar"

patterns-established:
  - "Convergencia pos-checkout: setTimeout com backoff -> Server Action de leitura local -> router.refresh() -> a guarda que JA existe faz a navegacao"
  - "clearTimeout no cleanup do useEffect provado por teste de unmount com timer pendente, nao assumido"

requirements-completed: [SUB-01]

# Metrics
duration: 14 min
completed: 2026-09-02
---

# Phase 7 Plan 02: Sincronizacao pos-checkout Summary

**Convergencia pos-checkout via polling de fatos locais: uma Server Action que deriva "o painel ja destravou?" por `acessoBloqueado`, e um client component com backoff de 7 tentagens em ~45 s que chama `router.refresh()` e deixa a guarda existente da tela de bloqueio devolver o usuario ao painel.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-02T18:08:00Z
- **Completed:** 2026-09-02T18:22:13Z
- **Tasks:** 3
- **Files modified:** 7 (2 criados, 5 modificados)

## Accomplishments

- `consultarStatusAcesso(slug)` responde a pergunta certa — "o painel ja destravou?" — sobre fatos LOCAIS, derivando o booleano pelo predicado unico da fase e nunca por comparacao de rotulo escrita a mao.
- `PollerDeStatus` converge em segundos com teto finito (7 tentativas, ~45 s), troca de texto UMA vez ao esgotar e limpa o timer no unmount — as tres coisas provadas por teste, nao assumidas.
- A tela de bloqueio da Fase 4 ganhou exatamente uma tira de status e mais nada: heading, corpo, tile ambar, botoes e copies seguem byte-identicos, com os 7 casos originais passando sem alteracao.
- Nenhuma tentativa de polling toca a API do Asaas — provado por grep filtrando comentarios, e o JSDoc registra por que a alternativa e impossivel, alem de cara.

## Task Commits

1. **Task 1: `consultarStatusAcesso` (TDD)** — `fc82d5c` (test, RED) → `ad5e07c` (feat, GREEN)
2. **Task 2: `PollerDeStatus` (TDD)** — `aab6eee` (test, RED) → `bc176fb` (feat, GREEN)
3. **Task 3: montagem na tela de bloqueio** — `9ddd739` (feat)

Nenhum dos dois ciclos de TDD precisou de passo REFACTOR: o codigo que passou no GREEN ja era o codigo final.

## Files Created/Modified

- `app/[slug]/admin/_components/poller-de-status.tsx` — client component de convergencia: `INTERVALOS_MS` de 7 posicoes, guarda `esgotou`, `clearTimeout` no cleanup, `<p role="status">` dentro da tira `mt-4 rounded-xl bg-slate-50 px-4 py-3 text-center`.
- `app/[slug]/admin/_components/poller-de-status.test.tsx` — 6 casos com fake timers: nao chama ao montar, respeita cada intervalo do backoff, `router.refresh()` uma vez ao liberar, teto na 7a tentativa com troca de copy, unmount com timer pendente, e live region polite sem papel de alerta.
- `app/[slug]/admin/_lib/assinatura-actions.ts` — acrescida a Server Action `consultarStatusAcesso`; `iniciarPagamento` intocada. O JSDoc registra as tres proibicoes (nao importar `asaasClient`, nao ler `ultimoStatusAuditado`, nao comparar rotulo a mao), cada uma uma linha plausivel que nenhum teste pegaria.
- `app/[slug]/admin/_lib/assinatura-actions.test.ts` — 7 casos novos em `describe` proprio; mock de `@/lib/auth-guard` adicionado, `@/lib/avaliar-acesso` mantido REAL de proposito.
- `app/[slug]/admin/bloqueado/_components/bloqueado-card.tsx` — prop `consultarStatusAction` e montagem incondicional do poller entre o corpo e o bloco de `erroCheckout`.
- `app/[slug]/admin/bloqueado/_components/bloqueado-card.test.tsx` — `vi.mock("next/navigation")` com router estavel (sem ele o componente novo derrubaria TODOS os casos da Fase 4) e um caso novo da tira `role="status"`.
- `app/[slug]/admin/bloqueado/page.tsx` — `consultarStatusAcesso.bind(null, slug)` passado ao card, no molde de `pagarAction`. Guarda simetrica, ordem dos `redirect` e leitura de branding identicas.

## Decisions Made

- **A pergunta do poller e local, nao do gateway.** Consultar o Asaas a cada tick multiplicaria 7 requests por pagador contra uma quota de 25.000/12 h (RESEARCH § Pitfall 3) e ainda responderia a pergunta errada: `asaasSubscriptionId` esta NULO justamente nos segundos em que o poller mais roda, porque `PAYMENT_CONFIRMED` chega antes de `SUBSCRIPTION_CREATED` (§ Achado 2).
- **Montagem incondicional, `successUrl` intocada.** Condicionar o poller a um marcador de query exigiria mudar a URL de retorno do checkout, que a UI-SPEC e o Achado 7 mandam explicitamente nao mudar. Quando o status destrava, `router.refresh()` faz a page reexecutar a guarda que ja existe e o proprio Next devolve o usuario ao painel — nenhuma logica de navegacao nova foi escrita.
- **Retorno derivado (`{ liberado }`), nao o `StatusAcesso` cru.** Alem de fechar T-07-07 (nenhum fato de billing atravessa), impede que o cliente reinterprete o rotulo.
- **Router estavel nos mocks de teste.** `useRouter` entra nas dependencias do `useEffect`; um mock que devolvesse objeto novo a cada render remontaria o timer indefinidamente e faria o teste medir outra coisa. Os dois arquivos de teste usam `vi.hoisted` com objeto unico — que e tambem o comportamento do `useRouter` real.

## Deviations from Plan

### Correcoes de acceptance criteria (nao de codigo)

**1. [Rule 1 - Criterio invalido no baseline] `grep -c 'successUrl' app/services/assinatura.service.ts` esperava 1, o baseline ja era 2**
- **Found during:** Task 3 (verificacao dos acceptance criteria)
- **Issue:** O criterio afirmava que a contagem "continua 1". A contagem no proprio commit-base do plano (`f205a3c`) ja era **2**: uma ocorrencia em comentario (linha 52) e a propriedade real (linha 70). O numero literal estava errado na hora de escrever o plano.
- **Fix:** Nenhuma mudanca de codigo. A INTENCAO do criterio — "a `successUrl` do checkout nao foi tocada por este plano" — foi verificada de forma mais forte e direta: `git diff -- app/services/assinatura.service.ts` esta VAZIO. O arquivo nao foi aberto para escrita em nenhum momento.
- **Verification:** `git show f205a3c:app/services/assinatura.service.ts | grep -c 'successUrl'` → `2` (baseline); `git diff --stat -- app/services/assinatura.service.ts` → vazio.
- **Committed in:** n/a (nenhuma alteracao de codigo)

**2. [Rule 3 - Blocking] `npx tsc --noEmit` falhava com `Cannot find name 'LayoutProps'` num worktree novo**
- **Found during:** Task 1 (primeira execucao do typecheck)
- **Issue:** `app/layout.tsx` usa `LayoutProps`, um tipo GERADO pelo Next em `.next/types/**` (incluido pelo `tsconfig.json`). Um worktree recem-criado nao tem `.next/`, entao o typecheck falhava por ausencia de artefato de build — nao por defeito de codigo. `app/layout.tsx` esta intocado desde o commit inicial do repo.
- **Fix:** `npx next typegen` (comando de geracao, sem efeito no codigo-fonte). Depois disso `npx tsc --noEmit` sai 0.
- **Files modified:** nenhum arquivo versionado; `.next/` e gitignored.
- **Verification:** `git status --short` limpo apos a geracao; `npx tsc --noEmit` sai 0.
- **Committed in:** n/a (nenhum arquivo versionado alterado)

### Ajuste de conteudo

**3. [Rule 1 - Bug] `role="alert"` literal num comentario derrubava o proprio acceptance criterion**
- **Found during:** Task 2 (verificacao dos acceptance criteria)
- **Issue:** O criterio `grep -c 'role="alert"' poller-de-status.tsx` devolve 0 e usa grep CRU, sem filtrar comentarios. O JSDoc inicial explicava a regra citando o literal `role="alert"`, e a contagem dava 1.
- **Fix:** Comentario reescrito para "o papel assertivo de alerta", exatamente a formulacao ja usada por `aviso-carencia.tsx` para a mesma regra. O significado normativo foi preservado; so o literal saiu.
- **Files modified:** `app/[slug]/admin/_components/poller-de-status.tsx`
- **Verification:** `grep -c 'role="alert"'` → 0; os 6 testes do poller continuam passando.
- **Committed in:** `bc176fb` (parte do commit da Task 2)

---

**Total deviations:** 3 (2 correcoes de criterio/ambiente sem mudanca de codigo, 1 ajuste de comentario)
**Impact on plan:** Nenhum desvio de escopo. Nenhuma linha de comportamento divergiu do plano; as tres entradas registram um numero literal errado no plano, um artefato de build ausente no worktree, e um comentario que colidia com um grep cru.

## Deferred Items

- **`REQUIREMENTS.md` nao foi alterado neste plano.** SUB-01 ("usuario pode visualizar o status atual do pagamento/assinatura") e entregue em MAIS de um plano desta fase: este entrega apenas a convergencia pos-checkout (D-01); a tela `/{slug}/admin/assinatura` com os 4 estados (`AssinaturaCard`, `assinaturaService.consultarAssinatura`) pertence a outros planos da fase, listados na secao "Simbolos criados por OUTROS planos" do proprio PLAN. Marcar SUB-01 como concluido agora seria falso, e em execucao paralela produziria conflito de merge com os planos irmaos que carregam o mesmo ID. O checkbox deve ser fechado pelo verificador de fim de fase, quando a tela existir.

## Known Stubs

Nenhum. Os tres artefatos estao ligados a dados reais de ponta a ponta: `consultarStatusAcesso` le do Postgres via `revalidarConta`, o poller recebe a action vinculada ao tenant pelo servidor, e a tela de bloqueio monta o poller com a action real.

## Threat Flags

Nenhuma superficie de seguranca nova fora do `<threat_model>` do plano. Nenhum endpoint de rede novo (a Server Action e um caminho POST ja coberto pela protecao de CSRF embutida do Next), nenhuma mudanca de schema, nenhuma nova leitura de arquivo. As mitigacoes do registro foram implementadas e provadas:

| Threat ID | Mitigacao entregue | Prova |
|-----------|--------------------|-------|
| T-07-06 (EoP) | Action sem parametro de id; `getVerifiedSession()` + `session.empresaSlug !== slug` antes de qualquer I/O | Caso "sessao de outro tenant devolve false sem chamar `revalidarConta`" |
| T-07-07 (Info disclosure) | Retorno e `{ liberado: boolean }` e nada mais | Assinatura de tipo + `toEqual({ liberado })` em todos os 7 casos |
| T-07-08 (DoS, loop sem teto) | `INTERVALOS_MS` com 7 posicoes e guarda `esgotou` | Caso que avanca +120 s apos a 7a tentativa e afirma contagem inalterada |
| T-07-09 (DoS, timer orfao) | `clearTimeout` no cleanup do `useEffect` | Caso de unmount com timer pendente afirmando que a action NAO foi chamada |
| T-07-10 (DoS, quota do Asaas) | `asaasClient` proibido no arquivo da action, com a razao em JSDoc | `grep -v '^\s*[*/]' ... \| grep -c 'asaasClient'` → 0 |
| T-07-11 (Spoofing, fail-open) | `revalidarConta` devolvendo `null` vira `{ liberado: false }` | Caso "conta revogada ou erro de banco" |
| T-07-12 (Tampering, regressao Fase 4) | Diff puramente aditivo na tela de bloqueio | Os 7 casos originais de `bloqueado-card.test.tsx` passam sem uma alteracao |

## Issues Encountered

Nenhum. Os dois ciclos de TDD tiveram RED legitimo (7 falhas por `consultarStatusAcesso is not a function`; falha de resolucao de modulo para o poller inexistente) e GREEN na primeira implementacao.

## User Setup Required

Nenhum — nenhuma configuracao de servico externo, nenhuma variavel de ambiente nova, nenhuma dependencia instalada (`git diff package.json` vazio).

## Verification Results

| Verificacao | Resultado |
|-------------|-----------|
| `npx vitest run` nos 3 arquivos do plano | verde — 13 + 6 + 8 = 27 casos |
| `npm test` (suite completa) | verde — **1033/1033** em 96 arquivos (baseline da fase: 1019; +14 deste plano) |
| `npx tsc --noEmit` | sai 0 |
| `npm run lint` | sai 0 erros (2 warnings pre-existentes e ja documentados: `Link` em `app/registro/page.tsx`, decisao registrada em `[01-04]`; `fatosDeTrial` em `reconciliacao.service.test.ts`) |
| `git diff package.json` | vazio — zero dependencias novas (T-07-SC) |

## Next Phase Readiness

- **Pronto para os planos seguintes da fase.** `PollerDeStatus` foi desenhado para os DOIS pontos de montagem previstos na UI-SPEC §5: este plano entregou o item 1 (tela de bloqueio); o item 2 (`AssinaturaCard`, **apenas no Estado A**, enquanto `asaasSubscriptionId` ainda e nulo) reusa o mesmo componente sem alteracao — basta passar `consultarAction` ja vinculada.
- **Ganchos deixados para o plano 07-07 (gates estaticos):** as proibicoes de `asaasClient` e `ultimoStatusAuditado` em `assinatura-actions.ts` estao registradas em JSDoc e sao verificaveis por grep que filtra comentarios (`grep -v '^\s*[*/]'`), no mesmo molde do `gates:fase-04`. Os dois greps ja passam hoje.
- **Sem bloqueadores.** Nenhum checkpoint aberto, nenhuma decisao pendente, nenhuma acao humana necessaria.
- **Nota para o verificador de fim de fase:** SUB-01 continua com o checkbox aberto em `REQUIREMENTS.md` de proposito — ver § Deferred Items.

## Self-Check: PASSED

- Todos os 7 arquivos de `key-files` existem em disco (`[ -f ]` verde para cada um).
- Todos os 6 commits citados existem em `git log` (`fc82d5c`, `ad5e07c`, `aab6eee`, `bc176fb`, `9ddd739`, `a56bf60`), encadeados a partir do commit-base `f205a3c`.
- `git status --short` vazio: nenhum arquivo nao rastreado e nenhuma alteracao pendente.
- Nenhuma delecao de arquivo rastreado em nenhum dos commits — os cinco diffs de codigo sao puramente aditivos.
- `STATE.md` e `ROADMAP.md` NAO foram tocados (execucao em worktree; o orquestrador escreve os dois centralmente apos o merge da wave).

---
*Phase: 07-gest-o-de-assinatura*
*Completed: 2026-09-02*
