---
phase: 06-termos-de-uso-e-aceite
plan: 08
subsystem: testing
tags: [e2e, playwright, gates-estaticos, term-02, term-04, nao-vacuidade, validation, fechamento-de-fase]

# Dependency graph
requires:
  - phase: 06-termos-de-uso-e-aceite
    plan: 03
    provides: "POST /api/termos autorizado pela role lida do banco + scripts/seed-superadmin.ts idempotente"
  - phase: 06-termos-de-uso-e-aceite
    plan: 05
    provides: "rota /{slug}/admin/aceitar-termos com guarda simetrica e Server Action de aceite"
  - phase: 06-termos-de-uso-e-aceite
    plan: 07
    provides: "checkbox de aceite no registro e os 9 specs e2e ja atualizados (suite e2e verde)"
provides:
  - "e2e/aceite-de-termos.spec.ts — TERM-04 fim a fim contra Postgres real, 4 casos"
  - "e2e/helpers.ts: seedSuperadmin() e publicarNovaVersaoDeTermos() (aditivos)"
  - "scripts/gates-fase-06.mjs — 5 gates estaticos com descarte de linhas de comentario"
  - "npm run gates:fase-06"
  - "06-VALIDATION.md fechado: wave_0_complete true, contagens medidas, 3 human-check de go-live"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Publicacao de termos no e2e pela superficie REST real (SUPERADMIN autenticado), fechando TERM-02 e TERM-04 com um mecanismo so"
    - "Gate de grep com descarte de linhas de comentario como pre-requisito de existencia, nao refinamento (decisao [04-09] aplicada a uma fase inteira de JSDoc normativo)"
    - "Nao-vacuidade de gate provada por sonda temporaria revertida com `git checkout -- <arquivo>`, sem tocar em suite de teste sobre codigo enfraquecido"
    - "Checagem de FORMA de DTO como complemento das agulhas conhecidas, com a limitacao escrita no proprio gate ('nao e analisador de fluxo')"
    - "Timeout de PRIMEIRA VISITA nomeado e documentado no spec alfabeticamente primeiro da suite, que paga a compilacao sob demanda do next dev"

key-files:
  created:
    - e2e/aceite-de-termos.spec.ts
    - scripts/gates-fase-06.mjs
  modified:
    - e2e/helpers.ts
    - package.json
    - .planning/phases/06-termos-de-uso-e-aceite/06-VALIDATION.md

key-decisions:
  - "Mecanismo de publicacao no e2e: opcao (b) do plano — POST /api/termos autenticado como SUPERADMIN — sem obstaculo encontrado; a opcao (a) provaria so a metade de baixo (o gate reagindo a uma linha na tabela)"
  - "O cabecalho normativo do proprio gate teve que ser reescrito para nao conter as agulhas inteiras: a fase gastou sete planos aprendendo que prosa nao pode mover contador de gate, e o gate seria o primeiro a violar a propria regra"
  - "Gate 3 trata 'interface do DTO nao encontrada' como FALHA, nao como OK: renomear o DTO nao pode desligar a checagem em silencio"
  - "As sondas de nao-vacuidade foram sondas TEMPORARIAS nos arquivos reais, revertidas por `git checkout -- <arquivo>`, e nenhuma suite foi executada sobre elas — o bloqueio de ambiente que o plano 06-03 encontrou nao se repetiu"
  - "Gates 3 e 5 nao foram sondados, e o motivo esta escrito no 06-VALIDATION.md: o 5 e comparacao numerica trivial e o 3 falha por construcao se o DTO sumir"

patterns-established:
  - "Helper de e2e que carrega a instrucao de recuperacao na propria mensagem de assercao (`expect(status, 'rode npm run seed:superadmin ...')`)"
  - "Tabela de assuncoes conscientes no VALIDATION.md, separada das lacunas, para o verificador de fim de fase nao confundir as duas"

requirements-completed: [TERM-01, TERM-02, TERM-03, TERM-04]

# Metrics
duration: 22min
completed: 2026-09-02
---

# Phase 6 Plan 08: Fechamento da Fase — e2e Fim a Fim, Gates Estaticos e VALIDATION Summary

**O ciclo completo de TERM-04 provado contra Postgres real em 4 casos (gate, aceite com persistencia verificada por segunda navegacao, saida por logout sem loop, espelho REST 403→200 no mesmo Bearer token e precedencia do bloqueio nas duas direcoes), mais os 5 gates estaticos que travam as quatro violacoes que nenhum teste pega — com a nao-vacuidade de tres deles demonstrada por sonda revertida — e o `06-VALIDATION.md` fechado com as contagens realmente observadas.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-09-02T14:00:37Z (base `fd69652`)
- **Completed:** 2026-09-02T14:22:19Z
- **Tasks:** 3
- **Files:** 5 (2 criados, 3 modificados)

## Accomplishments

- **`e2e/aceite-de-termos.spec.ts` fecha o unico buraco de prova que a fase ainda tinha.** Ate aqui a fase tinha 1019 testes unitarios afirmando o comportamento sobre mocks; agora existe a prova de que a mecanica funciona contra um banco de verdade — inclusive a parte que so um banco real pode provar: que o aceite **persiste**. O Caso 1 nao para no redirect da action; ele navega uma SEGUNDA vez, para outra page protegida, e e essa navegacao que falharia se `AceiteTermo` e `Usuario.termoAceitoId` nao tivessem sido gravados na mesma transacao.
- **O mecanismo de publicacao exercita TERM-02 de verdade.** Escolhida a opcao (b) do plano: o SUPERADMIN e criado por `execFileSync` de `scripts/seed-superadmin.ts` num `beforeAll` (o mesmo padrao sincrono de `seedFatosBilling`) e publica por `POST /api/termos` com Bearer token. Cada versao nova passa pela autorizacao que **le a role do banco no request atual** — ou seja, o e2e prova TERM-02 e TERM-04 com um mecanismo so, em vez de simular a publicacao por INSERT direto.
- **Os 4 casos cobrem os 4 modos de falha distintos**, e nao 4 variacoes do mesmo: gate+persistencia (T-06-05 pela UI), saida sem loop (T-06-30, criterio de sucesso #4 do roadmap), espelho REST no MESMO token sem novo login (T-06-05 pela API, provando que o gate le estado fresco a cada request) e o estado (bloqueado, pendente) nas duas direcoes (T-06-26 — o caso que **daria timeout** se a guarda simetrica estivesse errada).
- **`scripts/gates-fase-06.mjs` implementa a regra que os SETE planos anteriores pediram, cada um por conta propria.** O cabecalho normativo enumera as sete colisoes observadas (06-01 `ON CONFLICT`, 06-02 `P2002`, 06-03 as duas formas de comparacao de papel, 06-04 `permitirEmpresaBloqueada`, 06-05 `next=` e `useFormStatus`, 06-06 `registrarAceite`, 06-07 os tres comentarios reescritos a mao) para que a razao da regra fique no arquivo e nao so no historico de planejamento.
- **A nao-vacuidade dos Gates 1, 2 e 4 foi demonstrada, nao afirmada.** Cada sonda produziu saida 1 com arquivo e linha exatos, e os gates seguintes continuaram rodando — a politica de saida das duas irmas foi reproduzida e observada em execucao.
- **Bateria completa verde:** 95 arquivos / 1019 testes Vitest, 28 testes Playwright sem retry, `gates:fase-04` 6/6, `gates:fase-05` 6/6, `gates:fase-06` 5/5, `lint` 0 erros e `tsc --noEmit` 0. Zero pacotes instalados; `git diff package.json` no plano inteiro e **exatamente uma linha adicionada**.

## Task Commits

1. **Task 1: `e2e/aceite-de-termos.spec.ts` + helpers aditivos** — `233427d` (test)
2. **Task 2: `scripts/gates-fase-06.mjs` + `package.json`** — `55ee3f6` (feat)
3. **Task 3: fechamento de `06-VALIDATION.md`** — `491fed1` (docs)

## Files Created/Modified

- `e2e/aceite-de-termos.spec.ts` (novo, 4 casos) — cabecalho registrando a escolha do mecanismo de publicacao e por que a alternativa provaria menos; `registrarPelaUI` e `tokenDeApi` privados no molde de `bloqueio-por-inadimplencia.spec.ts`; constante `PRIMEIRA_VISITA` documentada.
- `e2e/helpers.ts` (+93/-1) — `SUPERADMIN_E2E` (credenciais fixas, com o motivo da fixidez escrito: o script e idempotente por email, entao um valor estavel evita acumular um tenant interno por rodada), `seedSuperadmin()` e `publicarNovaVersaoDeTermos()`. **As tres funcoes existentes (`seedFatosBilling`, `expectGoneFromCatalogo`, `uniqueEmpresa`) nao foram tocadas.**
- `scripts/gates-fase-06.mjs` (novo, 456 linhas) — cabecalho normativo nos seis blocos do molde da Fase 5; infraestrutura copiada (`RAIZ`, `ok`, `falha`, `linhasDeCodigo`, `ocorrencias`, `arquivosSob`, `ehFonte`, `fontesDaAplicacao`) mais `camposDaInterface`, especifica desta fase; 5 gates.
- `package.json` (+1) — `"gates:fase-06": "node scripts/gates-fase-06.mjs"`, no formato exato das duas irmas.
- `.planning/phases/06-termos-de-uso-e-aceite/06-VALIDATION.md` (+90/-33) — frontmatter fechado, mapa de verificacao com identificadores reais e duas linhas novas (Gates 1 e 4), Wave 0 com o plano que fechou cada item, secao nova com as contagens medidas, os 3 human-check e a tabela de assuncoes conscientes.

## Os 5 gates

| Gate | Invariante | Escopo varrido | Agulhas (todas concatenadas) |
|------|-----------|----------------|------------------------------|
| 1 | Autorizacao nunca pela role do JWT (T-06-01) | `app/` + `lib/`, so fontes | `auth.role ===`, `session.role ===`, `payload.role ===` |
| 2 | `TermoDeUso` e imutavel (TERM-03 / D-07, T-06-17) | `app/` + `lib/`, so fontes | `termoDeUso.` + `update` / `delete` / `updateMany` / `deleteMany` / `upsert` |
| 3 | `role` nao e gravavel por HTTP (T-06-02) | `app/api/` + `app/services/`, so fontes, **mais** a forma de `CreateUsuarioDTO` e `UpdateUsuarioDTO` | `role: data.role`, `role: body.role`, `role: input.role`, `role: dto.role` |
| 4 | Sem paleta ambar nas superficies de termos (T-06-37) | `app/[slug]/admin/aceitar-termos/` (recursivo) + `app/registro/_components/register-form.tsx` | `amber-` |
| 5 | Nenhum pacote instalado na fase (T-06-SC) | `package.json` | 11 deps / 20 devDeps |

`app/registro/page.tsx` fica **fora** do escopo do Gate 4, e a exclusao esta comentada no proprio gate: o gradiente `#f59e0b` daquele arquivo e pre-existente, nao e utilitario Tailwind, e o plano 06-07 preservou a linha caractere a caractere de proposito. Varre-lo produziria um falso positivo permanente que ninguem poderia corrigir sem violar outra decisao. `scripts/seed-superadmin.ts` tambem fica fora (nao esta em `app/` nem em `lib/`) e e o unico lugar legitimo que escreve `role`.

## Prova de nao-vacuidade dos gates

Cada sonda foi inserida numa **linha de codigo** do arquivo real, o gate rodou, e a sonda foi revertida com `git checkout -- <arquivo>` antes de qualquer commit. Nenhuma suite de teste foi executada sobre codigo enfraquecido — o bloqueio de ambiente que o plano 06-03 encontrou nao se repetiu, porque aqui a verificacao e um script de analise estatica, nao a suite.

| Gate | Sonda | Saida observada |
|------|-------|-----------------|
| 1 | `if (auth.role === "X") { }` em `app/api/termos/route.ts` | exit **1**, `app/api/termos/route.ts:117: if (auth.role === "X") ...` |
| 2 | `const sondaGate2 = () => prisma.termoDeUso.update({});` em `app/services/termo.service.ts` | exit **1**, `app/services/termo.service.ts:115: const sondaGate2 = ...` |
| 4 | `bg-slate-50` -> `bg-amber-50` em `aceite-card.tsx` | exit **1**, `.../aceite-card.tsx:53: <div className="... bg-amber-50 p-4">` |

Nas tres execucoes os **outros quatro gates continuaram rodando e reportando OK**, confirmando em execucao a politica de saida herdada das duas irmas ("1 na primeira violacao, mas todos os gates rodam"). `git status --short` ficou limpo apos cada reversao.

Os Gates 3 e 5 **nao** foram sondados, e o motivo esta registrado no `06-VALIDATION.md`: o 5 e uma comparacao numerica trivialmente verificavel, e o 3 ja falha por construcao se um dos DTOs for renomeado — `camposDaInterface` devolve `null` e o gate trata isso como FALHA, nao como OK.

## Decisions Made

- **Opcao (b) para publicar no e2e, sem obstaculo concreto.** O plano manda preferir (b) salvo obstaculo e registrar o motivo se acabar em (a). Nao houve obstaculo: o SUPERADMIN nasce com `acessoVitalicio` (D-02, entao nao e bloqueado por billing) e e isento do gate de termos (D-03, primeiro termo do curto-circuito de `termosPendentes`) — ou seja, ele consegue logar e publicar mesmo depois de publicar uma versao que trava todo mundo. Os dois impasses gemeos que a fase resolveu por decisao sao exatamente o que torna esta opcao viavel.
- **Credenciais do SUPERADMIN de e2e sao FIXAS.** `scripts/seed-superadmin.ts` e idempotente por email; um email sorteado por rodada acumularia um tenant interno (empresa + usuario + linha de auditoria) por execucao da suite, para sempre. O helper carrega, na propria mensagem de assercao, o comando de recuperacao para o caso de o email ja estar ocupado por outra credencial.
- **O cabecalho do gate foi reescrito para nao conter as agulhas inteiras.** A primeira redacao citava `auth.role ===`, `session.role ===`, `termoDeUso.update` e `bg-amber-50` literalmente, ao explicar por que sao proibidos — exatamente a armadilha que o arquivo existe para documentar. Cinco mencoes foram reescritas preservando o sentido ("uma mutacao de Prisma sobre `TermoDeUso`", "as duas formas de comparacao de papel sobre o token", "um utilitario de fundo da paleta ambar do Tailwind"). Todas as 13 agulhas contam **0** no arquivo.
- **`camposDaInterface` devolve `null` quando a interface some, e `null` e FALHA.** Um gate que passasse silenciosamente porque nao achou o que verificar e pior que gate nenhum: ele produz confianca falsa. Se alguem renomear `CreateUsuarioDTO`, o build fica vermelho pedindo para atualizar a constante — nao para remover a checagem.
- **A nota de "sem celula pendente" no VALIDATION evita o proprio marcador literal.** O criterio de aceite conta o marcador no arquivo; uma nota dizendo "nao ha marcador" contendo o marcador teria sido a oitava colisao desta familia na mesma fase. A nota registra que faz isso e por que.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree sem `node_modules`, sem `.env` e sem os tipos gerados do Next**
- **Found during:** setup, antes da Task 1
- **Issue:** O worktree nasce so com arquivos versionados. Sem `node_modules` nenhum comando roda; sem `.env` nao ha `DATABASE_URL`; sem `.next/types` o `tsc` falha em `app/layout.tsx` (`tsconfig.json` inclui `.next/types/**/*.ts`). Identico ao desvio 1 dos planos 06-01 a 06-07.
- **Fix:** `node_modules` trazido por copia **hard-linked** (`cp -al`), NAO por symlink — seguindo literalmente o contrato que o SUMMARY do 06-07 deixou para quem rodasse e2e em worktree: o Turbopack do Next 16 entra em panico com `Symlink [project]/node_modules is invalid, it points out of the filesystem root` e o `next dev` do Playwright nem sobe. `.env` copiado, mais `npx next typegen`. **Nenhum pacote instalado.**
- **Files modified:** nenhum arquivo versionado (ambos cobertos pelo `.gitignore`)
- **Verification:** `git status --short` vazio apos o setup; `npx tsc --noEmit` exit 0 no baseline; `npm run test:e2e` subiu o servidor sem panico de symlink.
- **Committed in:** n/a (artefatos gitignored)

**2. [Rule 1 - Flakiness real] Dois dos quatro casos e2e estouraram timeout na primeira execucao**
- **Found during:** Task 1, primeira execucao de `npx playwright test e2e/aceite-de-termos.spec.ts`
- **Issue:** `4 passed` so com retry: o Caso 3 estourou os 15s de `actionTimeout` no primeiro `GET /api/produtos` e o Caso 4 estourou os 10s de `expect` no redirect pos-registro (o botao ficou em `Criando conta...` com a action ainda em voo). A causa e ambiental e mensuravel: `aceite-de-termos.spec.ts` e o **primeiro arquivo da suite em ordem alfabetica**, entao e ele que paga a compilacao sob demanda do `next dev` de `/registro`, `/{slug}/admin`, `/{slug}/admin/produtos`, `/{slug}/admin/aceitar-termos`, `/{slug}/admin/bloqueado` e `GET /api/produtos` — os specs seguintes as encontram compiladas. Nao e defeito do produto, e nao pode ser deixado como "flaky aceitavel": um spec que so passa no retry nao e prova de nada.
- **Fix:** Constante `PRIMEIRA_VISITA = 30_000` (acompanhando o `navigationTimeout` global) aplicada as seis assercoes de primeira visita, com um comentario de 12 linhas registrando a medicao, o motivo e — explicitamente — que isto **nao** e mascara de loop de redirect: um loop nao termina em 30s nem em 300s, ele estoura com `ERR_TOO_MANY_REDIRECTS`.
- **Files modified:** `e2e/aceite-de-termos.spec.ts`
- **Verification:** segunda execucao **4/4 verdes em 27.5s, sem retry**; e a suite completa `npm run test:e2e` saiu **28/28 sem retry**.
- **Committed in:** `233427d`

**3. [Rule 2 - Higiene do proprio gate] O cabecalho de `gates-fase-06.mjs` continha 5 agulhas escritas inteiras**
- **Found during:** Task 2, ao verificar o criterio "nenhuma agulha proibida aparece escrita inteira no arquivo"
- **Issue:** Ao explicar por que cada forma e proibida, o cabecalho normativo as citava literalmente — `auth.role ===` (2x), `session.role ===`, `termoDeUso.update` (2x) e `bg-amber-50`. Todas em linhas de comentario, entao o gate atual nao as veria; mas a segunda camada de defesa do arquivo existe precisamente para que **ampliar o escopo de um gate no futuro nao transforme este arquivo na primeira violacao que ele mesmo reporta**, e um gate que precisa que ninguem nunca varra `scripts/` nao tem essa propriedade.
- **Fix:** As cinco mencoes reescritas preservando integralmente o sentido. Contagem final: as 13 agulhas contam **0** no arquivo.
- **Files modified:** `scripts/gates-fase-06.mjs`
- **Verification:** loop de `grep -Fc` sobre as 13 agulhas devolve 0 em todas; `npm run gates:fase-06` continua 5/5 OK; `npx eslint scripts/gates-fase-06.mjs` exit 0.
- **Committed in:** `55ee3f6`

---

**Total deviations:** 3 auto-fixadas (1 Rule 3 de ambiente, 1 Rule 1 de flakiness real, 1 Rule 2 de higiene). Nenhum desvio de escopo. Zero pacotes instalados; `git diff package.json` do plano inteiro contem exatamente uma linha adicionada.

## Criterios de aceite com valor diferente do literal (nao sao desvios de comportamento)

| Criterio | Valor literal | Como ficou | Intencao satisfeita? |
|---|---|---|---|
| `git diff e2e/helpers.ts` contem apenas adicoes | 93 adicoes, **1 remocao** | A remocao e a linha de `import type`, que passou de `{ Locator, Page }` para `{ APIRequestContext, Locator, Page }` — o tipo novo e exigido pela assinatura do helper de publicacao | **Sim.** O parenteses do proprio criterio ("nenhuma das tres funcoes existentes foi alterada") e o que importa, e `seedFatosBilling`, `expectGoneFromCatalogo` e `uniqueEmpresa` estao byte a byte identicas |
| `npm run test:e2e` com total **>= 26** ("os 22 existentes mais os 4 novos") | 26 | **28** | **Sim, com folga.** O numero 22 e o registrado em STATE.md ao fim da Fase 4; a Fase 5 acrescentou 2 specs de worker depois daquele registro, e o SUMMARY do 06-07 ja corrigiu a base para 24. 24 + 4 = 28 |
| `npm run test` com **>= 876** (baseline da Fase 4) | 876 | **1019** | Sim |
| `git diff package.json` mostra exatamente UMA linha adicionada | 1 | **1 adicao, 0 remocoes** | Sim — desta vez sem o `-1 +2` que o plano 06-03 registrou: a linha de `gates:fase-05` ja terminava em virgula |

## Verification Results

| Verificacao | Esperado | Resultado |
|-------------|----------|-----------|
| `npx playwright test e2e/aceite-de-termos.spec.ts` | exit 0, 4 casos | **4 passed (27.5s)**, exit 0, sem retry |
| `npm run test:e2e` | exit 0, >= 26 | **28 passed (2.4min)**, exit 0, sem retry |
| `npm run test` | exit 0, >= 876 | 95 arquivos / **1019 testes**, exit 0 |
| `npx tsc --noEmit` | exit 0 | exit 0 |
| `npm run lint` | exit 0 | exit 0, **0 erros** (2 warnings pre-existentes, em arquivos nao tocados) |
| `npm run gates:fase-06` | exit 0, `5/5 gates OK` | exit 0, **`Resultado: 5/5 gates OK.`** |
| `npm run gates:fase-04` | exit 0 | exit 0, **6/6 gates OK** |
| `npm run gates:fase-05` | exit 0 | exit 0, **6/6 gates OK** |
| `node -e "...scripts['gates:fase-06']?0:1"` | exit 0 | exit 0 |
| Nao-vacuidade Gate 1 (sonda + reversao) | exit 1 com arquivo e linha | exit 1, `app/api/termos/route.ts:117` |
| Nao-vacuidade Gate 2 (sonda + reversao) | exit 1 com arquivo e linha | exit 1, `app/services/termo.service.ts:115` |
| Nao-vacuidade Gate 4 (sonda + reversao) | exit 1 com arquivo e linha | exit 1, `.../aceite-card.tsx:53` |
| 13 agulhas proibidas escritas inteiras em `gates-fase-06.mjs` | 0 | **0 em todas as 13** |
| `wc -l scripts/gates-fase-06.mjs` (`min_lines: 150`) | >= 150 | **456** |
| `grep -c "gates:fase-06" package.json` | >= 1 | 1 |
| `git diff package.json` | 1 linha adicionada | 1 adicao, 0 remocoes |
| `git diff --stat e2e/` no plano | so `aceite-de-termos.spec.ts` e `helpers.ts` | exatamente esses dois; os 9 specs do 06-07 nao foram tocados |
| Caso 2 afirma URL final `/{slug}/admin/login` | sim | sim, mais o formulario de login visivel, mais a contagem de redirects HTTP < 5, mais a prova de que a sessao morreu |
| Caso 3: 403 antes e 200 depois no MESMO Bearer token | sim | sim, com linha de base 200 antes da publicacao e nenhum login entre os dois |
| Caso 4: `/aceitar-termos` redireciona para `/bloqueado` | sim | sim, nas duas direcoes, sem timeout |
| `06-VALIDATION.md` com `wave_0_complete: true` | sim | sim |
| Marcador de pendencia na coluna `Plan` | 0 | **0 no arquivo inteiro** |
| 3 human-check registrados com instrucao acionavel | sim | sim, com consequencia de pular em cada um |
| deps / devDeps | 11 / 20 | 11 / 20 |
| delecoes de arquivo rastreado nos 3 commits | nenhuma | nenhuma (`git diff --diff-filter=D` vazio nos tres) |

## Threat Model Coverage

| Threat ID | Disposition | Como ficou |
|-----------|-------------|------------|
| T-06-01 | mitigate | Gate 1 varre `app/` e `lib/` por `auth.role ===` / `session.role ===` / `payload.role ===` em linhas de codigo; nao-vacuidade demonstrada por sonda revertida (exit 1, arquivo e linha) |
| T-06-17 | mitigate | Gate 2 varre as cinco formas de mutacao de `TermoDeUso`; complementa a FK `onDelete: Restrict` (06-01) e o teste de ausencia de metodo (06-02). Nao-vacuidade demonstrada |
| T-06-02 | mitigate | Gate 3 = agulhas conhecidas **+** checagem de forma dos dois DTOs de `usuario.service.ts`, com a limitacao ("nao e analisador de fluxo") escrita no proprio gate. `scripts/seed-superadmin.ts` fora do escopo varrido, por ser a unica escrita legitima |
| T-06-37 | mitigate | Gate 4 varre os arquivos novos da fase por `amber-`; `app/registro/page.tsx` excluido com o motivo comentado. Nao-vacuidade demonstrada |
| T-06-05 | mitigate | Caso 3 do e2e: 200 (base) → 403 (pos-publicacao) → 200 (pos-aceite), tudo no MESMO Bearer token, sem novo login — a prova de que o gate le estado fresco a cada request |
| T-06-26 | mitigate | Caso 4 exercita o estado (bloqueado, pendente) contra banco real, nas DUAS direcoes; terminou em 27.5s de suite, nao em timeout |
| T-06-30 | mitigate | Caso 2 prova a saida por `Sair da conta` ate o formulario de login renderizar, com contagem de redirects HTTP < 5 e a confirmacao de que a sessao morreu de verdade |
| T-06-38 | mitigate | human-check 1 registrado em `06-VALIDATION.md` com instrucao acionavel: o texto real e publicado como NOVA versao via endpoint antes do deploy; a v1 nunca e editada (D-07) |
| T-06-39 | mitigate | human-check 3 registrado com a ordem completa (as tres migrations nomeadas → deploy → seed) e o motivo de a inversao quebrar |
| T-06-03 | accept | Registrado na tabela de assuncoes conscientes do `06-VALIDATION.md`, com a observacao de que o Gate 3 desta fase trava a forma que permitiria escalar para SUPERADMIN por ali |
| T-06-40 | accept | A1 e A2 registrados na mesma tabela, com o custo de mudar depois explicitado |
| T-06-SC | mitigate | Gate 5 conta 11 deps / 20 devDeps com a mensagem sobre slopsquatting. A Package Legitimacy Audit de `06-RESEARCH.md` esta vazia — nenhum `[ASSUMED]`, `[SUS]` ou `[SLOP]` — entao o gate de legitimidade e vacuamente satisfeito e nenhum checkpoint humano de verificacao de pacote foi disparado |

## Known Stubs

Nenhum introduzido por este plano.

Permanece o stub **herdado do plano 06-01**, e ele agora tem dono e instrucao: o texto da v1 dos termos e um placeholder que comeca com `[TEXTO PROVISORIO - ...]`. Este plano nao o resolve (nao pode: e conteudo juridico, nao codigo) mas fecha o processo em volta dele — o human-check 1 de `06-VALIDATION.md` diz **quem** publica, **como** (nova versao via `POST /api/termos`, nunca `UPDATE` da v1), **quando** (antes do deploy em producao) e **o que custa pular** (todos os clientes terao aceitado um placeholder).

## Threat Flags

Nenhuma superficie de seguranca nova. Os dois arquivos criados sao um spec de teste e um script de analise estatica; nenhum deles roda em producao, expoe rede, toca schema ou introduz caminho de auth. As unicas escritas que o spec faz no banco sao pelas superficies publicas ja existentes (`/registro`, `POST /api/termos`, e o script de seed).

## Issues Encountered

**1. `06-PATTERNS.md` nao existe no worktree.** O bloco `<read_first>` da Task 2 manda ler a secao "### `scripts/gates-fase-06.mjs`" de `.planning/phases/06-termos-de-uso-e-aceite/06-PATTERNS.md`. O arquivo esta **untracked** no checkout principal (aparece como `??` no `git status` de origem), entao nao veio para o worktree, que nasce so com arquivos versionados. A especificacao dos cinco gates foi tomada do bloco `<action>` da propria task, que a descreve integralmente — gate a gate, com escopo, agulhas, mensagem de falha e exclusoes. Nada ficou por decidir. Fica registrado para que o verificador saiba por que aquela referencia nao foi consultada, e para que alguem commite o arquivo se ele for para valer.

**2. Nenhum bloqueador em aberto.** O flaky pre-existente de `combo-crud` que o 06-07 registrou nao apareceu nesta execucao (28/28 sem retry).

## User Setup Required

**Para rodar a suite e2e desta fase pela primeira vez em qualquer ambiente novo** (dev de outro desenvolvedor, CI, maquina limpa): nada manual. O `beforeAll` de `e2e/aceite-de-termos.spec.ts` cria o SUPERADMIN sozinho, e o script e idempotente.

**Se o email `superadmin-e2e@teste.com` ja estiver ocupado por um usuario criado com outra credencial**, o login do helper falha com 200-esperado/401-recebido e a mensagem da assercao ja traz o comando de recuperacao. O script **nao** sobrescreve a credencial de quem ja esta la, de proposito.

**Operacional, antes do go-live:** os tres human-check de `06-VALIDATION.md` (texto juridico real, comunicacao aos clientes existentes, ordem de deploy). Nenhum deles tem acao de codigo.

## Next Phase Readiness

- **A fase esta fechada do lado automatizado.** Os quatro requisitos (TERM-01 a TERM-04) tem cobertura unitaria, de componente, de rota e e2e contra banco real, mais gates estaticos para as quatro decisoes que nenhum teste pega. O que resta sao os 3 human-check, que por construcao nao podem ser fechados dentro do repositorio.
- **Para quem for escrever `gates-fase-07.mjs`:** copie a forma daqui, nao da Fase 5. A diferenca util e `camposDaInterface` — checagem de FORMA de um tipo, que complementa as agulhas de grep onde o grep sozinho daria falso positivo (o caso de `role:`, que aparece legitimamente em toda projecao de `select`).
- **Os gates continuam fora do CI.** O `.github/workflows/tests.yml` roda `npm run test` e `npm run test:e2e`, mas nao `gates:fase-04/05/06` — o mesmo warning advisorio que a revisao de codigo da Fase 5 ja levantou. Tres fases acumularam 17 gates que so rodam se alguem lembrar de rodar. Candidato natural a um item de fase futura: uma linha no workflow.
- **Contrato para quem rodar e2e em worktree (reafirmado):** `cp -al` para `node_modules`, nunca symlink. O contrato do 06-07 foi seguido e funcionou de primeira.

## Self-Check: PASSED

Arquivos declarados, todos presentes em disco: `e2e/aceite-de-termos.spec.ts`, `scripts/gates-fase-06.mjs`, `e2e/helpers.ts`, `package.json`, `.planning/phases/06-termos-de-uso-e-aceite/06-VALIDATION.md`.

Commits declarados, todos presentes no historico da branch: `233427d`, `55ee3f6`, `491fed1`.

Nenhuma delecao de arquivo rastreado em nenhum dos tres commits (`git diff --diff-filter=D --name-only` vazio nos tres).

---
*Phase: 06-termos-de-uso-e-aceite*
*Completed: 2026-09-02*
