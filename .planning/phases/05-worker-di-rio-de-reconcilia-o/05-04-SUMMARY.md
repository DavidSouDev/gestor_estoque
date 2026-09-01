---
phase: 05-worker-di-rio-de-reconcilia-o
plan: 04
subsystem: testing
tags: [e2e, playwright, cron, worker, billing, seed, ci, next-env]

# Dependency graph
requires:
  - phase: 05-worker-di-rio-de-reconcilia-o (plano 05-03)
    provides: "GET /api/cron/reconciliacao-diaria e o contrato de 7 chaves do corpo de resposta (D-04)"
  - phase: 05-worker-di-rio-de-reconcilia-o (plano 05-02)
    provides: "cronSecret() fail-closed, LIMIAR e PISO do freio de bloqueio em massa"
  - phase: 05-worker-di-rio-de-reconcilia-o (plano 05-01)
    provides: "valor WORKER_DIARIO no enum CausaTransicaoAcesso, aplicado por migration"
  - phase: 04-aplicacao-do-bloqueio
    provides: "scripts/seed-fatos-billing.ts e e2e/bloqueio-por-inadimplencia.spec.ts"
provides:
  - "flag --auditado <status> em scripts/seed-fatos-billing.ts — a unica forma versionada de produzir uma empresa com transicao PENDENTE"
  - "seedFatosBilling(slug, status, opcoes?) e o tipo StatusSeed em e2e/helpers.ts, compartilhados pelos dois specs de billing"
  - "e2e/worker-reconciliacao.spec.ts — prova de WRK-01 e WRK-02 contra Postgres real"
  - "CRON_SECRET no bloco env: de nivel de workflow do CI"
  - "leitura do .env pelo processo do Playwright, com o mesmo leitor da aplicacao"
affects: [05-05 (gate de plataforma), deploy/hosting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chamada de drenagem antes do seed: assenta transicoes pendentes acumuladas no banco local para as contagens seguintes serem atribuiveis so a empresa do teste"
    - "Prova de nao-vacuidade por remocao da fixture: tirar --auditado tem que derrubar o passo de aplicacao com transicoesDetectadas igual a 0"
    - "Fixture de transicao pendente por desalinhamento deliberado de ultimoStatusAuditado, isolada atras de uma flag de CLI que nao altera o caminho default"

key-files:
  created:
    - e2e/worker-reconciliacao.spec.ts
  modified:
    - scripts/seed-fatos-billing.ts
    - e2e/helpers.ts
    - e2e/bloqueio-por-inadimplencia.spec.ts
    - playwright.config.ts
    - .github/workflows/tests.yml

key-decisions:
  - "Import de NAMESPACE de @next/env no playwright.config.ts, e nao default: o pacote e CJS empacotado com __esModule: true e SEM default, entao a forma default do plano viraria undefined sob a transformacao para CJS que o Playwright aplica ao config"
  - "REQUIREMENTS.md nao foi tocado: e artefato compartilhado da fase e a marcacao de WRK-01/WRK-02 cabe ao orquestrador depois que a wave inteira fechar"
  - "A validacao de --auditado usa a MESMA forma do bloco de --status (erro() + return sem tocar o banco), em vez de um parser generico — consistencia local vale mais que abstracao aqui"

patterns-established:
  - "Todo e2e de worker precisa de uma chamada de drenagem antes da fixture: sem ela as contagens carregam o lixo de execucoes anteriores do banco local"
  - "Fixture que existe para tornar um teste nao-vacuo vem com o experimento de remocao registrado no SUMMARY"

requirements-completed: [WRK-01, WRK-02]

# Metrics
duration: 16 min
completed: 2026-09-01
---

# Phase 5 Plano 04: E2E do Worker Diário de Reconciliação Summary

**A flag `--auditado` abre a única fixture capaz de produzir uma transição pendente, e sobre ela `e2e/worker-reconciliacao.spec.ts` prova contra Postgres real que uma empresa que ninguém logou sai de TRIAL para BLOQUEADO por uma chamada HTTP — e que a chamada seguinte não transiciona ninguém.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-01T17:41:00Z
- **Completed:** 2026-09-01T17:57:00Z
- **Tasks:** 4 (Task 1 era checkpoint, resolvido pelo orquestrador antes do dispatch)
- **Files modified:** 6 (1 criado, 5 modificados)

## Accomplishments

- **O e2e deixou de ser impossível.** Antes deste plano, qualquer teste ponta a ponta do worker seria vácuo por construção: o seed da Fase 4 alinha `ultimoStatusAuditado` ao status derivado de propósito, então a empresa semeada nasce SEM transição pendente e um worker completamente quebrado passaria verde. A flag `--auditado` desalinha os dois deliberadamente.
- **A não-vacuidade foi medida, não afirmada.** Removendo `{ auditado: "trial" }` da chamada de seed, o passo de aplicação cai exatamente como previsto — `transicoesDetectadas` Expected 1 / Received 0. Revertido antes de commitar.
- **WRK-01 provado no único regime que importa.** A empresa é registrada pela UI e depois **nunca mais faz um request autenticado**. A Fase 4 já bloqueia a cada request, então esse isolamento é o que separa a prova do worker da prova do gate: a única coisa entre TRIAL e BLOQUEADO é a chamada HTTP.
- **WRK-02 provado contra o servidor real**, incluindo o segredo errado de **mesmo comprimento** — o caso que distingue "a comparação de tempo constante funciona" de "a chamada estourou por tamanho de buffer" — e a asserção de **corpo vazio**, sem a qual um 401 que explicasse o motivo passaria despercebido.
- **O piso do freio ganhou prova ponta a ponta.** Uma perda absoluta contra um banco pequeno é exatamente o cenário em que o freio percentual sozinho suprimiria a única transição legítima; `freio.disparou === false` no passo de aplicação é a demonstração de que o worker efetivamente bloqueia.
- **Suíte inteira verde: 24 testes e2e** (os 22 anteriores + 2 novos), 916 unitários, `tsc` e `lint` limpos, `gates:fase-04` 6/6.

## Task Commits

1. **Task 1: Gravar CRON_SECRET no `.env` local** — checkpoint `human-action`, resolvido pelo usuário antes do dispatch. Re-verificado neste worktree com o comando não-divulgante do plano: `CRON_SECRET presente com 64 caracteres`. Nenhum commit (o `.env` não é versionado).
2. **Task 2: Flag `--auditado`, `CRON_SECRET` no CI e leitura do `.env` no Playwright** — `1081a14` (feat)
3. **Task 3: Extrair `seedFatosBilling` para `e2e/helpers.ts`** — `e613a7b` (refactor)
4. **Task 4: E2E do worker contra Postgres real** — `d949464` (test)

## Files Created/Modified

- `e2e/worker-reconciliacao.spec.ts` (172 linhas, criado) — 2 testes. `SEGREDO` lido do ambiente com falha ruidosa na ausência, `ROTA` sem barra final, `SEGREDO_ERRADO` de mesmo comprimento, `chamarWorker` e `registrarPelaUI` locais.
- `scripts/seed-fatos-billing.ts` (198 → 244 linhas) — `STATUS_ENUM` (`Record<StatusPedido, StatusAcesso>`), leitura e validação de `--auditado`, escrita condicional de `ultimoStatusAuditado` e linha extra no log.
- `e2e/helpers.ts` (31 → 92 linhas) — `StatusSeed` e `seedFatosBilling`, com o JSDoc migrado da função local mais o parágrafo sobre `opcoes.auditado`; `RAIZ` passou para cá.
- `e2e/bloqueio-por-inadimplencia.spec.ts` (247 → 211 linhas) — perdeu a função local, os imports órfãos e `RAIZ`; **nenhuma asserção alterada**.
- `playwright.config.ts` (37 → 71 linhas) — carrega o `.env` antes de `defineConfig`. `webServer`, `projects`, `use`, `retries` e `workers` intocados.
- `.github/workflows/tests.yml` — `CRON_SECRET` no bloco `env:` de nível de workflow, com o comentário de T-05-19 marcando que é literal de CI.

## Decisions Made

- **Import de namespace de `@next/env`, e não default.** Ver o desvio 1 abaixo: a forma default do plano quebraria em runtime, silenciosamente, e o `tsc` não pegaria.
- **`REQUIREMENTS.md` não foi tocado.** WRK-01 e WRK-02 continuam `Pending` no arquivo. É artefato compartilhado da fase, e o plano 05-05 (gate de plataforma) ainda está por vir — a marcação cabe ao orquestrador depois do fechamento da wave, não a um agente de worktree.
- **A validação de `--auditado` repete a forma do bloco de `--status`** em vez de fatorar um validador comum. Com dois casos, a abstração custaria mais leitura do que economiza.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] O import default de `@next/env` prescrito pelo plano seria `undefined` em runtime no `playwright.config.ts`**

- **Found during:** Task 2
- **Issue:** O `<action>` manda usar "import default de `@next/env` seguido de `nextEnv.loadEnvConfig(...)`", idioma copiado de `scripts/resolvedor-ts.mjs`. Ele funciona **lá** porque aquele arquivo é `.mjs` real e o loader ESM do Node ignora a marca `__esModule` de módulos CJS, entregando `module.exports` como default. O `playwright.config.ts` não é ESM real: o Playwright o transforma para CJS, e aí a interop respeita a marca. Sondagem do pacote instalado: `esm flag: true | named: function | default: undefined`. A forma default daria `nextEnv === undefined` e um `TypeError` na carga do config — e o `tsc` **não** pegaria, porque `esModuleInterop` habilita `allowSyntheticDefaultImports` e o default sintético existe só no sistema de tipos.
- **Fix:** Import de namespace (`import * as nextEnv from "@next/env"`), que funciona sob as duas interops. O critério de aceitação `grep -c "loadEnvConfig" playwright.config.ts` **retorna 1** — a forma nomeada sugerida como fallback pelo plano retornaria 2 (linha do import + linha da chamada) e reprovaria o gate, então o namespace é também a única das três formas que satisfaz o gate e o runtime ao mesmo tempo. A razão está registrada no JSDoc do próprio arquivo.
- **Files modified:** `playwright.config.ts`
- **Verification:** `tsc --noEmit` sai 0; o spec do worker recebe 200 com o segredo correto, o que só acontece se o processo de teste tiver realmente lido o `.env`.
- **Committed in:** `1081a14`

**2. [Rule 3 - Blocking] Turbopack recusa `node_modules` como symlink para fora da raiz do projeto**

- **Found during:** Task 3
- **Issue:** As notas de ambiente das waves anteriores mandam symlinkar `node_modules` da raiz do repositório, e isso basta para `vitest` e `tsc`. Mas este é o primeiro plano da fase que sobe o `next dev` (o `webServer` do Playwright), e o Turbopack aborta: `Symlink [project]/node_modules is invalid, it points out of the filesystem root`. Nenhum teste e2e rodaria.
- **Fix:** Symlink trocado por uma árvore de **hardlinks** (`cp -al`), que o Turbopack enxerga como arquivos reais e que não ocupa disco adicional. **Sem `npm install`** — nenhum pacote resolvido da rede, e `gates:fase-04` Gate 6 (11 deps / 20 devDeps) continua verde. `node_modules` é gitignored: nada a commitar.
- **Files modified:** nenhum (ambiente do worktree apenas)
- **Verification:** `npm run test:e2e` sai 0 com 24 testes.
- **Committed in:** n/a

---

**Total deviations:** 2 auto-fixed (ambos blocking, ambos de ambiente/interop)
**Impact on plan:** Nenhum desvio de escopo, nenhuma asserção enfraquecida e nenhum critério de aceitação contornado. O primeiro corrige uma instrução do plano que teria quebrado em runtime sem falhar no `tsc`; o segundo é infraestrutura de worktree, invisível no repositório.

## Prova de Não-Vacuidade (exigida pelo critério de aceitação da Task 4)

Removida temporariamente a opção `auditado` da chamada de seed do passo 3, deixando `seedFatosBilling(slug, "bloqueado")`:

| Passo | Antes | Depois da remoção |
|---|---|---|
| 4 — `transicoesDetectadas` | 1 | **0** (Expected 1 / Received 0) |
| Resultado do spec | 2 passed | **1 failed / 1 passed** |

O teste do gate (WRK-02) continuou passando, como esperado — ele não depende da fixture. **Revertido antes de commitar**, confirmado pelos 2 testes verdes na execução seguinte e pelo `git status` limpo depois do commit.

Isto é exatamente o que a mitigação T-05-21 pede: sem a flag da Task 2, este e2e seria vácuo — mediria zero transições contra um worker de qualquer qualidade, inclusive nenhuma.

## Verificação

| Comando | Resultado |
|---|---|
| Verificação do checkpoint (`CRON_SECRET`) | ✅ presente com 64 caracteres (valor nunca impresso) |
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run lint` | ✅ exit 0 (2 warnings pré-existentes, nenhum destes arquivos) |
| `npm test` | ✅ 89 arquivos / 916 testes |
| `npm run test:e2e -- bloqueio-por-inadimplencia` | ✅ 2 testes (o mesmo número de antes da extração) |
| `npm run test:e2e -- worker-reconciliacao` | ✅ 2 testes |
| `npm run test:e2e` | ✅ **24 testes** (22 + 2) |
| `npm run gates:fase-04` | ✅ 6/6 |

**Gates de grep:** `auditado` em `seed-fatos-billing.ts` = 8 (≥4) · `STATUS_ENUM` = 2 · `CRON_SECRET` em `tests.yml` = 1 · `loadEnvConfig` em `playwright.config.ts` = 1 · `seedStatus` no spec da Fase 4 = 0 · `execFileSync` no spec da Fase 4 = 0 · `export function seedFatosBilling` = 1 · `export type StatusSeed` = 1 · `test.skip` no spec novo = 0 · `api/cron/reconciliacao-diaria` = 1 (sem barra final) · datas literais = 0 · `transicoesDetectadas` = 2. **12/12.**

**CLI do seed:** `--auditado invalido` imprime a mensagem de validação e não toca o banco; sem a flag, o caminho default continua reportando `P2025` — nenhuma regressão.

## Issues Encountered

- **Turbopack e o symlink de `node_modules`** — ver o desvio 2. Vale propagar para as notas de ambiente das próximas waves: **qualquer plano que rode e2e precisa de hardlinks, não de symlink.**
- **`.next/types/` ausente** no worktree novo, o que faria `tsc --noEmit` falhar em `app/layout.tsx`. Resolvido com `npx next typegen`, conforme as notas de ambiente (saída gitignored).
- **Migrations e client já em dia:** `prisma migrate status` reporta "Database schema is up to date!" e o client gerado já expõe `WORKER_DIARIO`, então nenhum `prisma generate` foi necessário.

## Known Stubs

Nenhum. Os dois testes exercem o endpoint HTTP real contra o Postgres real; nenhuma asserção é sobre valor mockado, nenhum caminho está desligado e nenhum `test.skip` existe no arquivo — a ausência de `CRON_SECRET` derruba o spec em vez de pulá-lo.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano. As três disposições `mitigate` que tocam estes arquivos têm asserção ou prova correspondente: T-05-18 (a guarda de `NODE_ENV=production` continua a primeira linha executada do script e a flag só altera `ultimoStatusAuditado`, campo de bookkeeping que não concede acesso — quem concede são os 4 fatos, intocados pela flag), T-05-20 (o spec nunca imprime o segredo; a mensagem de ausência manda gerar um novo em vez de mostrar o esperado) e T-05-21 (tabela de não-vacuidade acima). T-05-19 permanece `accept`, com o comentário no YAML registrando a justificativa. T-05-SC: nenhum pacote instalado, Gate 6 verde.

## Next Phase Readiness

- **Pronto para 05-05 (gate de plataforma).** Reafirmando o que o 05-03 já sinalizou: `app/api/cron/reconciliacao-diaria/route.ts` precisa entrar na allowlist do gate de grep que autoriza leitura de `ultimoStatusAuditado` (o worker o lê só como `anterior` do compare-and-swap). **`scripts/seed-fatos-billing.ts` agora ESCREVE `ultimoStatusAuditado` com valor forçado** e provavelmente precisa da mesma allowlist — o gate de 05-05 deve decidir explicitamente sobre ele em vez de descobrir por falha.
- **REQUIREMENTS.md pendente de marcação.** WRK-01 e WRK-02 estão provados por unidade (05-03) e por e2e (05-04), mas continuam `Pending` no arquivo. Ação do orquestrador.
- **`CRON_SECRET` de produção continua fora de escopo** (D-07): existe no `.env` local e no CI; o painel do host é assunto do deploy.
- **Sem blockers.**

---
*Phase: 05-worker-di-rio-de-reconcilia-o*
*Completed: 2026-09-01*
