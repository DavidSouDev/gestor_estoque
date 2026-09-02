---
phase: 06-termos-de-uso-e-aceite
plan: 04
subsystem: auth
tags: [termos-de-uso, auth-guard, gate, react-cache, prisma, tdd, vitest]

# Dependency graph
requires:
  - phase: 06-termos-de-uso-e-aceite
    plan: 01
    provides: "Usuario.termoAceitoId, model TermoDeUso e o par de stubs neutros de termos em tests/setup/prisma-mock.ts"
  - phase: 06-termos-de-uso-e-aceite
    plan: 02
    provides: "termoVigente() deduplicada por React.cache, devolvendo null num banco sem termos"
provides:
  - "ContaAtiva.termosPendentes — predicado unico de TERM-04, derivado uma unica vez dentro de revalidarConta"
  - "Gate web: redirect para /{slug}/admin/aceitar-termos em requireAdminSession, sempre DEPOIS do gate de assinatura"
  - "Gate REST: AuthError 403 'Termos de uso pendentes de aceite.' em requireAuth, cobrindo as 43 chamadas sem editar nenhum dos 29 handlers"
  - "Prova por teste da precedencia bloqueio-antes-de-termos nas duas superficies (metade da prova de ausencia de loop)"
affects: [06-05, 06-06, 06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Predicado de autorizacao derivado UMA vez no DAL e apenas consumido pelos dois guards — nenhum guard reimplementa a comparacao"
    - "Isencao de role decidida sobre a role lida do BANCO, nunca sobre a do JWT, porque ela CONCEDE acesso"
    - "Assimetria fail-open/fail-closed comentada nos dois lados para impedir 'harmonizacao' futura"
    - "Coluna escalar denormalizada entra no select existente de graca; relacao aninhada custaria uma query a mais (relationJoins nao habilitado)"

key-files:
  created: []
  modified:
    - lib/auth-guard.ts
    - lib/auth-guard.test.ts
    - lib/session.ts
    - lib/session.test.ts
    - lib/api-auth.ts
    - lib/api-auth.test.ts
    - app/api/assinaturas/checkout/route.test.ts
    - app/api/produtos/route.test.ts

key-decisions:
  - "As DUAS superficies autenticadas foram gateadas (web + REST) — decisao explicita do plano, nao omissao; sem o espelho REST um ADMIN com termos pendentes seguiria mutando dados por Bearer token"
  - "403 e literal em lib/api-auth.ts, sem constante nova: STATUS_ASSINATURA_SUSPENSA existe para justificar um codigo nao-padrao (402), e 403 nao precisa desse tipo de justificativa"
  - "Nenhuma opcao nova em OpcoesDeAuth: o gate de termos NAO tem opt-out, para nao reabrir a classe de fail-open que o JSDoc de permitirEmpresaBloqueada fechou"
  - "termoVigente() e chamada depois do guard de !usuario: um token de conta revogada nao paga pela segunda query"
  - "Os stubs locais de tres arquivos de teste ganharam termoAceitoId neutro — sem isso os casos passariam a medir o gate errado (ou a falhar)"

requirements-completed: [TERM-04]

# Metrics
duration: 12min
completed: 2026-09-02
---

# Phase 6 Plan 04: Gate de Termos nas Duas Superficies Autenticadas Summary

**`ContaAtiva.termosPendentes` derivado uma unica vez dentro de `revalidarConta` (SUPERADMIN isento, falha ABERTA sem termo publicado) e consumido por dois gates — `redirect` para `/{slug}/admin/aceitar-termos` no admin web e `AuthError` 403 nas 21 rotas REST — sempre DEPOIS do gate de assinatura, com a precedencia provada por teste nas duas superficies.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-09-02T10:15:40Z
- **Completed:** 2026-09-02T10:27:30Z
- **Tasks:** 3 (todas `tdd="true"`, ciclo RED/GREEN cumprido em cada uma)
- **Files modified:** 8 (0 criados — este plano so estende arquivos existentes)

## Accomplishments

- `lib/auth-guard.ts` passou a expor `termosPendentes: boolean` em `ContaAtiva`, derivado do curto-circuito `role !== SUPERADMIN && vigente !== null && termoAceitoId !== vigente.id`. A ordem dos tres termos esta comentada termo a termo como decisao: a isencao do SUPERADMIN e **mitigacao de impasse** (quem publica a versao vigente nao pode ser trancado por ela) e a falha ABERTA sem termo publicado e a assimetria deliberada do RESEARCH.
- `termoAceitoId` entrou no `select` **escalar** existente — nenhuma query nova por causa dele. O custo do caminho autenticado subiu de 1 para 2 queries por request (a segunda e `termoVigente()`), contra as 3 que a opcao de relacao aninhada custaria; o paragrafo novo no JSDoc do modulo registra o numero, o porque e a consequencia aceita de T-06-27.
- `lib/session.ts` ganhou o gate web imediatamente **depois** do de assinatura, com `redirect()` fora de qualquer `try/catch`. O comentario registra as tres coisas exigidas: por que a ordem e fixa (T-04-10), que a isencao do SUPERADMIN nao e re-decidida ali, e por que o destino mora fora do grupo `(protected)`.
- `lib/api-auth.ts` ganhou o espelho REST — `throw new AuthError("Termos de uso pendentes de aceite.", 403)` — **uma linha que cobre as 43 chamadas sem editar nenhum dos 29 handlers**, porque todos propagam `error.status` genericamente. Nenhuma opcao nova em `OpcoesDeAuth`.
- `app/[slug]/admin/(protected)/layout.tsx` **nao foi tocado** (diff vazio), como o plano exige: layout nao e boundary de autorizacao (Pitfall 3, T-06-04).
- Suite completa subiu de **934 para 956 testes** (91 arquivos), com `tsc --noEmit` e `lint` limpos e `git diff package.json` vazio (T-06-SC).

## Task Commits

1. **Task 1 RED: teste falhando de `ContaAtiva.termosPendentes`** - `9f00791` (test)
2. **Task 1 GREEN: derivacao no DAL** - `91f703b` (feat)
3. **Task 2 RED: teste falhando do gate web** - `83be666` (test)
4. **Task 2 GREEN: redirect em `requireAdminSession`** - `b32c060` (feat)
5. **Task 3 RED: teste falhando do gate REST** - `aebc420` (test)
6. **Task 3 GREEN: `AuthError` 403 em `requireAuth` + fixtures locais** - `883718c` (feat)

Nenhuma fase REFACTOR foi necessaria em nenhuma das tres tasks: as implementacoes sao de 1 a 3 linhas de logica cada, sem duplicacao a extrair.

## Files Created/Modified

- `lib/auth-guard.ts` (+61/-2) - campo `termosPendentes` na interface com JSDoc no formato de `carenciaAte`; `termoAceitoId: true` no `select` raiz; `import { termoVigente }` e a derivacao comentada; paragrafo novo no JSDoc do modulo sobre o custo de 2 queries e o fail-closed compartilhado. `UserRole` passou de `import type` para import de valor (a comparacao usa `UserRole.SUPERADMIN`).
- `lib/auth-guard.test.ts` (+137) - `describe` novo com **9 casos**: os quatro do eixo aceite/role, os dois do SUPERADMIN, o banco sem termo, o erro na tabela de termos (com assercao do prefixo `[auth-guard]`) e a projecao (`termoAceitoId: true` na raiz, ausencia de `include`). Fixture local ganhou `termoAceitoId` neutro e a assercao exata de `toEqual` ganhou `termosPendentes: false`.
- `lib/session.ts` (+22) - gate novo de 3 linhas com 18 de comentario normativo, entre o gate de assinatura e o `return`.
- `lib/session.test.ts` (+100) - `describe` novo com **6 casos**, incluindo o de precedencia (bloqueio E termos pendentes -> `/bloqueado`, com assercao negativa de que `/aceitar-termos` nao foi chamado) e o de SUPERADMIN vitalicio sem aceite. Helper `stubComTermos` no molde de `stubComStatus`.
- `lib/api-auth.ts` (+17) - gate novo de 3 linhas com 22 de comentario normativo, depois do gate de assinatura.
- `lib/api-auth.test.ts` (+122) - `describe` novo com **7 casos**, incluindo os dois obrigatorios (402 vence 403; `permitirEmpresaBloqueada: true` ainda da 403), ambos afirmando o `status` numerico.
- `app/api/assinaturas/checkout/route.test.ts` (+9) - dois stubs locais ganharam `termoAceitoId` neutro (ver desvio 2).
- `app/api/produtos/route.test.ts` (+5) - stub local do `describe` de gate de assinatura ganhou `termoAceitoId` neutro (ver desvio 2).

## Decisions Made

- **Gatear as duas superficies foi tratado como decisao tomada, nao presumida.** O RESEARCH (Achado Critico 2) exige que o planner decida explicitamente, e o plano decidiu; a execucao so implementou. O comentario em `lib/api-auth.ts` carrega o argumento inteiro para que uma futura remocao seja uma decisao consciente, nao uma limpeza.
- **`termoVigente()` e chamada depois do guard `if (!usuario) return null`.** O plano diz "depois de obter `usuario` e antes de montar o retorno"; posicionar a chamada imediatamente antes do `return` mantem o guard de conta revogada barato — um token de conta desativada continua custando 1 query, nao 2.
- **`UserRole` virou import de valor.** A comparacao e `usuario.role !== UserRole.SUPERADMIN`, com o enum do Prisma em vez de string literal — o mesmo padrao que o PATTERNS aponta para o endpoint de publicacao. `StatusAcesso` continua como `import type`.
- **A isencao e decidida sobre `usuario.role` lido do banco** (T-06-01). Como ela **concede** acesso, uma role obsoleta no JWT de 7 dias bastaria para pular o gate — por isso a comparacao mora dentro de `revalidarConta`, e o teste de SUPERADMIN em `lib/api-auth.test.ts` registra isso no comentario.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree sem `node_modules`, sem `.env` e sem os tipos gerados do Next**
- **Found during:** setup, antes da Task 1
- **Issue:** O worktree e criado so com arquivos versionados. Sem `node_modules` nenhum comando roda; sem `.env` o `DATABASE_URL` nao existe; sem `.next/types` o `tsc` falha em `app/layout.tsx` com `TS2304: Cannot find name 'LayoutProps'`. Identico ao desvio 1 dos planos 06-01 e 06-02.
- **Fix:** Symlinks de `node_modules` e `.env` apontando para o checkout principal (ambos cobertos pelo `.gitignore`), mais `npx next typegen`. **Nenhum pacote instalado.**
- **Files modified:** nenhum arquivo versionado
- **Verification:** `git status --short` vazio apos os symlinks; `npx tsc --noEmit` saiu 0 no baseline, antes de qualquer codigo novo.
- **Committed in:** n/a (artefatos gitignored)

**2. [Rule 3 - Blocking] Tres arquivos de teste carregavam stubs locais de `usuario.findFirst` SEM `termoAceitoId`**
- **Found during:** Task 1 (os dois de `lib/`) e Task 3 (os dois de `app/api/`, detectados pelo `npm run test` do gate GREEN)
- **Issue:** O plano 06-01 acertou o stub **global** de `tests/setup/prisma-mock.ts`, mas quatro stubs **locais** sobrescrevem `usuario.findFirst` sem o campo novo. Com `termoAceitoId` `undefined`, a comparacao `undefined !== "termo-1"` da `termosPendentes === true`. Efeito concreto: os dois casos de `app/api/assinaturas/checkout/route.test.ts` que provam o opt-out de T-04-10 passaram a receber **403 em vez de 200** — o gate de termos disparava antes de o handler ser alcancado. Os de `lib/session.test.ts` e `lib/api-auth.test.ts` teriam o mesmo destino ao final das Tasks 2 e 3.
- **Fix:** Cada stub local ganhou `termoAceitoId` apontando para o `id` do termo que o stub global devolve — a mesma **combinacao NEUTRA** que o plano 06-01 escolheu e documentou. Comentario em cada ponto dizendo por que o campo esta ali (o caso mede o gate de assinatura, e so ele).
- **Files modified:** `lib/auth-guard.test.ts`, `lib/session.test.ts`, `lib/api-auth.test.ts`, `app/api/assinaturas/checkout/route.test.ts`, `app/api/produtos/route.test.ts`
- **Verification:** `npm run test` verde, 956/956. Nao-vacuidade confirmada em sentido inverso: os dois casos de checkout falharam de verdade (`expected 403 to be 200`) antes do ajuste.
- **Committed in:** `9f00791`, `83be666`, `883718c`

**3. [Rule 3 - Blocking] O unico caso de assercao exata de `ContaAtiva` teve que mudar**
- **Found during:** Task 1, fase RED
- **Issue:** O plano manda "nao alterar os casos existentes", mas o primeiro caso de `lib/auth-guard.test.ts` afirma o objeto inteiro com `toEqual`. Acrescentar um campo a `ContaAtiva` torna essa assercao falsa por construcao.
- **Fix:** Acrescentado `termosPendentes: false` ao objeto esperado — a mudanca minima possivel, e ela e desejavel: e o que torna o caso um contrato completo da forma de `ContaAtiva` em vez de um subconjunto. Nenhuma outra assercao existente foi tocada.
- **Files modified:** `lib/auth-guard.test.ts`
- **Verification:** o caso e um dos 19 verdes do arquivo.
- **Committed in:** `9f00791`

---

**Total deviations:** 3 auto-fixadas (todas Rule 3). Nenhum desvio de escopo, nenhum pacote instalado, `git diff package.json` vazio.

## Nota sobre um criterio de aceitacao literal (nao e desvio de comportamento)

O criterio da Task 3 pede que `grep -c "permitirEmpresaBloqueada" lib/api-auth.ts` **continue com o mesmo valor de antes**. O valor cru foi de **2 para 3** — porque o proprio `<action>` da Task 3 exige, no ponto (d), um comentario que **nomeia a flag**. Os dois requisitos do plano se contradizem literalmente.

A intencao do criterio ("nenhuma opcao nova em `OpcoesDeAuth`") esta satisfeita e foi medida do jeito certo:

| Medicao | Antes (`HEAD~1`) | Depois |
|---|---|---|
| `grep -c` cru | 2 | 3 |
| `grep -c` **descartando linhas de comentario** | **2** | **2** |

E a mesma classe de situacao ja registrada pela decisao `[04-09]` e repetida pelo plano 06-02: **o gate `gates:fase-06` do plano 06-08 precisa descartar linhas de comentario antes de contar neste arquivo.**

## Verification Results

| Verificacao | Esperado | Resultado |
|-------------|----------|-----------|
| `npx vitest run lib/auth-guard.test.ts` | >= 7 casos novos, exit 0 | **9 casos novos** (19 no arquivo), exit 0 |
| `npx vitest run lib/session.test.ts` | >= 5 casos novos, exit 0 | **6 casos novos** (32 no arquivo), exit 0 |
| `npx vitest run lib/api-auth.test.ts` | >= 5 casos novos, exit 0 | **7 casos novos** (27 no arquivo), exit 0 |
| `npm run test` (suite completa) | verde | 91 arquivos / **956 testes** (eram 934) |
| `npx tsc --noEmit` | exit 0 | exit 0 |
| `npm run lint` | exit 0 | exit 0, 0 erros (2 warnings pre-existentes, em arquivos nao tocados) |
| `grep -c "termosPendentes" lib/auth-guard.ts` | >= 3 | 3 |
| `grep -c "termoAceitoId: true" lib/auth-guard.ts` | 1 | 1 |
| `grep -c "include:" lib/auth-guard.ts` | 0 | 0 |
| caso `termosPendentes === false` para SUPERADMIN com `termoAceitoId: null` | existe | existe (mais um com versao antiga) |
| caso `termosPendentes === false` com `termoDeUso.findFirst` devolvendo `null` | existe | existe |
| `grep -c "aceitar-termos" lib/session.ts` | 1 | 1 |
| ordem em `lib/session.ts` | `acessoBloqueado` antes de `termosPendentes` | linha **139** < linha **161** |
| caso de precedencia web (bloqueio + pendente -> `/bloqueado`) | existe | existe, com assercao negativa de `/aceitar-termos` |
| `git diff --stat "app/[slug]/admin/(protected)/layout.tsx"` | vazio | vazio |
| `grep -c "termosPendentes" lib/api-auth.ts` | 1 | 1 |
| `grep -c "403" lib/api-auth.ts` | >= 1 | 7 (1 de codigo, 6 de comentario normativo) |
| ordem em `lib/api-auth.ts` | `acessoBloqueado` antes de `termosPendentes` | linha **124** < linha **154** |
| `grep -c "permitirEmpresaBloqueada" lib/api-auth.ts` | inalterado | 2 -> 2 descartando comentario; 2 -> 3 cru (ver nota acima) |
| caso 402 (nao 403) com bloqueio + termos pendentes | existe | existe |
| caso 403 com `permitirEmpresaBloqueada: true` | existe | existe |
| `git diff package.json` | vazio | vazio |

## Threat Model Coverage

| Threat ID | Disposition | Como ficou |
|-----------|-------------|------------|
| T-06-05 | mitigate | Espelho do gate em `requireAuth` com `AuthError` 403; 7 casos, incluindo o de interacao com a flag de opt-out |
| T-06-04 | mitigate | Gate na DAL de sessao, chamada por cada page e cada Server Action. `(protected)/layout.tsx` com diff vazio |
| T-06-01 | mitigate | A isencao e decidida sobre `usuario.role` lido do banco dentro de `revalidarConta`, nunca sobre a role do token; comentada no teste de SUPERADMIN de `lib/api-auth.test.ts` |
| T-06-12 | mitigate | D-03 como PRIMEIRO termo do curto-circuito, comentado nominalmente como mitigacao de impasse (Pitfall 9), com "simplificar removendo o caso especial TRAVA A PLATAFORMA" escrito no codigo |
| T-06-13 | mitigate | `vigente === null` implica `termosPendentes = false`; caso de teste dedicado, assimetria comentada no codigo e no teste |
| T-06-26 | mitigate | Ordem fixa (login, bloqueio, termos) provada pelo caso de precedencia em `lib/session.test.ts`, com assercao negativa. A metade complementar (guarda simetrica que NAO checa termos em `/bloqueado`) e do plano 06-05 |
| T-06-27 | accept | A query de `termoVigente()` cai no `catch` fail-closed; caso de teste afirma `null` **e** o prefixo `[auth-guard]` no log. Registrado no JSDoc do modulo |
| T-06-28 | mitigate | `termoAceitoId` entrou no `select` explicito; `grep -c "include:" lib/auth-guard.ts` = 0, e ha teste afirmando a ausencia de `include` nos args da query |
| T-06-SC | mitigate | `git diff package.json` vazio; zero pacotes instalados |

## Threat Flags

Nenhuma superficie de seguranca nova fora do `<threat_model>` do plano. As tres modificacoes sao gates que **restringem** acesso; nenhum endpoint novo, nenhum caminho de escrita novo, nenhuma mudanca de schema.

## Known Stubs

Nenhum. Os tres gates estao completos e ligados; nenhum valor vazio, placeholder ou `TODO` foi introduzido.

## User Setup Required

Nenhuma. Nada de servico externo, nada de variavel de ambiente nova.

## Next Phase Readiness

⚠️ **ATENCAO OPERACIONAL — a partir deste plano, os e2e ficam vermelhos ate 06-05 e 06-06 landarem.** A migration `20260902120200_seed_termo_v1` (plano 06-01) publica um termo v1, e todo usuario existente tem `termoAceitoId = null`. Com o gate ligado, qualquer login no admin passa a redirecionar para `/{slug}/admin/aceitar-termos` — rota que **so nasce no plano 06-05** — e o registro so passa a gravar `termoAceitoId` no **06-06**. Isso e sequenciamento esperado de wave, nao regressao: a suite unitaria (956/956) esta verde porque os stubs carregam a combinacao neutra. **Nao rodar os e2e desta fase antes de 06-05 + 06-06 estarem mergeados.**

- **06-05 (tela de aceite)** ja tem o destino do redirect definido e o predicado pronto em `conta.termosPendentes`. A guarda simetrica da pagina precisa das tres condicoes na ordem do RESEARCH (`!conta` -> `/admin`; `acessoBloqueado` -> `/bloqueado`; `!termosPendentes` -> `/admin`) e **`bloqueado/page.tsx` nao pode ganhar checagem de termos** — seria o loop do estado (sim, sim). A metade em teste dessa prova ja existe em `lib/session.test.ts`.
- **06-06 (registro atomico)** precisa manter a assimetria: `termoVigente()` devolvendo `null` **recusa** o cadastro, enquanto o gate deste plano com o mesmo `null` **nao bloqueia**. Os dois lados estao comentados; nao "harmonizar".
- **06-07 / e2e** precisa marcar o checkbox de aceite no helper de registro de cada spec **antes** de qualquer navegacao autenticada, senao o gate deste plano manda todo spec para a tela de aceite.
- **06-08 (gates)** precisa descartar linhas de comentario antes de contar em `lib/api-auth.ts` (ver a nota sobre `permitirEmpresaBloqueada`), alem dos dois arquivos ja apontados pelo plano 06-02.

## Self-Check: PASSED

Arquivos declarados, todos presentes em disco e modificados: `lib/auth-guard.ts`, `lib/auth-guard.test.ts`, `lib/session.ts`, `lib/session.test.ts`, `lib/api-auth.ts`, `lib/api-auth.test.ts`, `app/api/assinaturas/checkout/route.test.ts`, `app/api/produtos/route.test.ts`.

Commits declarados, todos presentes no historico da branch: `9f00791`, `91f703b`, `83be666`, `b32c060`, `aebc420`, `883718c`.

Nenhum arquivo deletado por nenhum dos 6 commits (`git diff --diff-filter=D` vazio em cada um).

---
*Phase: 06-termos-de-uso-e-aceite*
*Completed: 2026-09-02*
