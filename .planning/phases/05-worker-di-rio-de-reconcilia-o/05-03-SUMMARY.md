---
phase: 05-worker-di-rio-de-reconcilia-o
plan: 03
subsystem: api
tags: [cron, worker, billing, timing-safe-compare, prisma, vitest, next-route-handler]

# Dependency graph
requires:
  - phase: 05-worker-di-rio-de-reconcilia-o (plano 05-01)
    provides: valor WORKER_DIARIO no enum CausaTransicaoAcesso (schema + migration)
  - phase: 05-worker-di-rio-de-reconcilia-o (plano 05-02)
    provides: planejarReconciliacao / Transicao / LIMIAR / PISO e o accessor cronSecret()
  - phase: 02-modelo-de-dados-e-decisao-de-acesso
    provides: avaliarAcesso puro sobre os 4 fatos e o compare-and-swap de acessoService.registrarTransicao
  - phase: 03-gateway-asaas-e-ingestao-de-webhooks
    provides: idioma do gate de segredo estático time-safe e do 401 sem corpo
provides:
  - "GET /api/cron/reconciliacao-diaria — o gatilho HTTP do worker diário (WRK-01, WRK-02)"
  - "Gate de segredo estático time-safe sobre Authorization: Bearer, compatível com Vercel Cron e crontab sem mudança de código"
  - "Contrato do corpo de resposta de D-04: 7 chaves de topo, 5 no freio — a única superfície de observabilidade da fase"
  - "Escrita em lotes de 5 com isolamento de falha por empresa (D-05)"
affects: [05-04 (e2e do worker), 05-05 (gate de plataforma), deploy/hosting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route handler de batch: gate de segredo → agora único → findMany → passada pura → freio → escrita em lotes → corpo JSON"
    - "Concorrência limitada com Promise.allSettled por lote, dimensionada abaixo do max do pool do Postgres"
    - "Asserção de query por objeto inteiro (sem matcher parcial) como prova executável do filtro de soft-delete e do select fechado"

key-files:
  created:
    - app/api/cron/reconciliacao-diaria/route.ts
    - app/api/cron/reconciliacao-diaria/route.test.ts
  modified: []

key-decisions:
  - "GET (não POST) porque o Vercel Cron dispara exclusivamente GET; POST-only quebraria o critério de sucesso #3 na primeira das duas plataformas candidatas"
  - "Nenhum arquivo de configuração de plataforma criado (D-07): o agendamento sugerido vive como prosa no JSDoc, não como config commitada"
  - "Prosa do teste evita o nome literal do matcher parcial do vitest, seguindo a convenção já registrada em app/api/webhooks/asaas/route.ts — o gate de grep precisa sinalizar código, não comentário"
  - "Fixtures de erro usam sentinelas separadas para message, name e propriedade extra, o que torna a asserção negativa de sanitização capaz de pegar tanto String(erro) quanto a serialização do objeto inteiro"

patterns-established:
  - "Batch endpoint gateado por segredo estático: o único caminho do sistema autorizado a cruzar empresaId, com a justificativa normativa escrita no próprio arquivo"
  - "Par de não-vacuidade obrigatório para todo teste de freio: o cenário logo acima do limiar e o logo abaixo"

requirements-completed: [WRK-01, WRK-02]

# Metrics
duration: 14 min
completed: 2026-09-01
---

# Phase 5 Plano 03: Endpoint do Worker Diário de Reconciliação Summary

**`GET /api/cron/reconciliacao-diaria` com gate de segredo time-safe sobre `Authorization: Bearer`, duas passadas (plano puro → escrita em lotes de 5 com `allSettled`) e corpo JSON de observabilidade com as 7 chaves contratadas por D-04.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-01T17:08:00Z
- **Completed:** 2026-09-01T17:22:00Z
- **Tasks:** 3
- **Files modified:** 2 (ambos criados)

## Accomplishments

- **O gatilho que faltava.** A Fase 4 já bloqueia a cada request autenticado; este endpoint é a rede de segurança para a empresa que nunca mais aparece — cujo trial venceu e cujo catálogo continuaria no ar indefinidamente porque nenhum request dispararia a reavaliação.
- **Gate de segredo com prova nas três formas de erro.** Sem header, segredo errado de mesmo comprimento, segredo errado de comprimento diferente, e header sem o prefixo `Bearer ` — todos 401 com corpo vazio e zero queries ao banco. O SHA-256 dos dois lados antes da comparação de tempo constante neutraliza tanto o vazamento por timing quanto o vazamento do comprimento do segredo.
- **Idempotência provada sem construir infraestrutura para ela.** Duas invocações seguidas com o mock refletindo o estado já gravado: a segunda não escreve nada. Nenhum ledger de execução, nenhuma marca d'água — a propriedade cai fora da pureza de `avaliarAcesso` somada ao compare-and-swap.
- **Freio de bloqueio em massa provado ponta a ponta pelo HTTP**, incluindo o par de não-vacuidade (4 empresas / 1 perda **não** arma, graças ao piso absoluto) que impede um freio sempre-armado de passar despercebido.
- **916 testes unitários verdes** (eram 906 na entrada do plano), `tsc --noEmit` e `lint` limpos, e `gates:fase-04` continua 6/6.

## Task Commits

1. **Task 1: Route handler — gate, duas passadas, escrita em lotes e corpo de resposta** — `4a0dc48` (feat)
2. **Task 2: Testes do gate (WRK-02) e das transições (WRK-01)** — `b429a2b` (test)
3. **Task 3: Testes de D-04, D-05 e do freio ponta a ponta** — `60f22fd` (test)

_Nota: o plano tem `type: execute` e ordena implementação antes dos testes (a Task 2 lista o arquivo da Task 1 no seu `read_first`), então os commits seguem `feat → test → test` em vez do ciclo RED/GREEN por task. A não-vacuidade — o que o gate RED normalmente compra — foi comprada explicitamente pelas quatro injeções documentadas abaixo._

## Files Created/Modified

- `app/api/cron/reconciliacao-diaria/route.ts` (291 linhas) — o endpoint: config de rota (`runtime`, `dynamic`, `maxDuration`), `segredoValido`, `aplicar` (lotes de `CONCORRENCIA = 5`) e o `GET` em sete passos. JSDoc de módulo com as sete coisas que um refactor bem-intencionado desfaria.
- `app/api/cron/reconciliacao-diaria/route.test.ts` (587 linhas, 20 testes) — quatro `describe`: autenticidade, transições, isolamento de falha + sanitização, e freio ponta a ponta, mais o contrato de chaves de D-04.

## Decisions Made

- **`GET` que muta estado, deliberadamente.** O instinto REST diz `POST` e está errado aqui: o Vercel Cron dispara exclusivamente `GET` e não há como configurar outro método. Registrado no JSDoc com a saída de escape (exportar os dois delegando à mesma função) para quem vier depois com a mesma objeção.
- **Nenhum `vercel.json`.** D-07 adia a escolha de host; o `10 3 * * *` e o `curl` equivalente vivem como documentação no JSDoc. A corretude vem da avaliação dos fatos contra `agora`, não do instante do agendamento — pular um dia não muda o resultado do dia seguinte.
- **Testes de isolamento de erro usam transições de CARÊNCIA, não de bloqueio.** Sete perdas em sete empresas armariam o freio, zerariam as aplicáveis e o teste passaria a provar outra coisa. Usar transições não-perigosas desacopla os testes de D-05 do freio de D-01.
- **Um teste a mais do que o plano pediu.** O plano especifica "7 empresas, a **sétima** rejeitando" para provar que "a falha de um lote não interrompe o laço" — mas rejeitar no *último* lote não prova isso. Mantive o teste da sétima (a letra do plano) e acrescentei o par com a **segunda** rejeitando (a intenção do plano): a falha acontece no primeiro lote e as duas empresas do segundo ainda são despachadas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `timingSafeEqual` mencionado no JSDoc colidia com o próprio critério de aceitação**

- **Found during:** Task 1
- **Issue:** O `<action>` do plano manda escrever no JSDoc a frase "`timingSafeEqual` exige buffers de mesmo tamanho", mas o critério de aceitação exige `grep -c "timingSafeEqual"` retornando **exatamente 2** (import + uso). Seguir a prosa ao pé da letra produziria 3 ocorrências e reprovaria o gate.
- **Fix:** A justificativa foi preservada integralmente, reescrita como "a comparação de tempo constante exige buffers de mesmo tamanho". Nenhuma informação perdida; o gate volta a contar só o código.
- **Files modified:** `app/api/cron/reconciliacao-diaria/route.ts`
- **Verification:** `grep -c "timingSafeEqual"` retorna 2.
- **Committed in:** `4a0dc48`

**2. [Rule 3 - Blocking] `objectContaining` na prosa do teste colidia com o gate de grep**

- **Found during:** Task 2
- **Issue:** As três menções eram todas em comentários explicando por que o matcher parcial **não** é usado, mas `grep -c "objectContaining"` retornava 3 contra um critério de 0.
- **Fix:** Prosa reescrita para "matcher parcial", com uma nota explícita no cabeçalho do arquivo apontando a convenção — que não é invenção minha: `app/api/webhooks/asaas/route.ts:31-35` já registra exatamente esta regra ("o gate precisa continuar sendo sinal real sobre o código, não ruído vindo dos comentários").
- **Files modified:** `app/api/cron/reconciliacao-diaria/route.test.ts`
- **Verification:** `grep -c "objectContaining"` retorna 0; os 20 testes continuam verdes.
- **Committed in:** `b429a2b` / `60f22fd`

**3. [Rule 2 - Missing Critical] Teste adicional de continuação do laço entre lotes**

- **Found during:** Task 3
- **Issue:** O teste especificado (sétima empresa rejeitando, no **último** lote) não consegue distinguir "o laço continuou depois de um lote com falha" de "o laço parou logo após a falha" — as duas hipóteses produzem `aplicadas === 6`. A invariante que o plano diz querer provar ficaria sem prova.
- **Fix:** Acrescentado o par com a **segunda** empresa rejeitando (primeiro lote), afirmando que a sétima ainda foi despachada. O teste da sétima foi mantido como está.
- **Files modified:** `app/api/cron/reconciliacao-diaria/route.test.ts`
- **Verification:** A injeção `Promise.allSettled` → `Promise.all` derruba os dois testes.
- **Committed in:** `60f22fd`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing critical)
**Impact on plan:** Nenhum desvio de escopo. Dois são reconciliações entre a prosa do plano e seus próprios critérios de aceitação, resolvidas preservando a informação e mantendo o gate como sinal real. O terceiro fecha um buraco de prova no teste especificado.

## Prova de Não-Vacuidade (exigida pelos critérios de aceitação das Tasks 2 e 3)

As quatro injeções foram aplicadas uma a uma, com os testes executados, e **todas revertidas antes de commitar** — confirmado por `git diff --stat` vazio sobre `route.ts` após cada reversão.

| # | Injeção em `route.ts` | Resultado | Teste que caiu |
|---|---|---|---|
| 1 | Remover `where: { deletedAt: null }` do `findMany` | ❌ 1 falha / 9 passes | "consulta o banco com o filtro de soft-delete e o select fechado dos 6 campos" |
| 2 | `causa: WORKER_DIARIO` → `AVALIACAO_SESSAO` | ❌ 1 falha / 9 passes | "trial vencido há 30 dias: UMA transição TRIAL→BLOQUEADO" |
| 3 | `Promise.allSettled` → `Promise.all` | ❌ 12 falhas / 8 passes | ambos os testes de 7 empresas em dois lotes, mais os de sanitização e freio |
| 4 | `r.reason.message` → `String(r.reason)` | ❌ 2 falhas / 18 passes | "a mensagem é `erro.message` e nada mais" e "rejeição com algo que não é Error" |

A injeção 4 é a que vale destacar: a sentinela em `erro.name` existe exatamente para que `String(erro)` — que produziria `"SentinelaNomeDaClasse: sentinela-mensagem-visivel"` — seja pego pela asserção negativa. Sem essa sentinela, a troca passaria despercebida.

## Verificação

| Comando | Resultado |
|---|---|
| `npx vitest run app/api/cron/reconciliacao-diaria/route.test.ts` | ✅ 20 testes |
| `npm test` | ✅ 89 arquivos / 916 testes |
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run lint` | ✅ exit 0 (2 warnings pré-existentes, nenhum neste plano) |
| `npm run gates:fase-04` | ✅ 6/6 |

**Gates de grep de `route.ts`:** `GET`=1, `agendarPosResposta`=0, `asaas`=0, `vercel`=0, `new Date()`=1, `avaliarAcesso`=0, `deletedAt: null`=1, `Promise.allSettled`=1, `Promise.all(`=0, `timingSafeEqual`=2, `cronSecret() ===`=0, `WORKER_DIARIO`=1, sem `vercel.json`. **13/13.**

**Gates de grep de `route.test.ts`:** primeira linha `// @vitest-environment node`, datas literais=0, `not.toHaveBeenCalled`=7 (≥6), `objectContaining`=0, `falha desconhecida`=2 (≥1), `Object.keys`=2 (≥2). **6/6.**

## Issues Encountered

- **`node_modules` e `.env` ausentes no worktree** (ambos gitignored). Resolvido com symlinks para a raiz do repositório principal, conforme as notas de ambiente da wave anterior — sem `npm install` e sem nada a commitar.
- **`.next/types/` ausente**, o que faria `tsc --noEmit` falhar em `app/layout.tsx`. Resolvido com `npx next typegen` (saída gitignored).
- **Nenhum problema com o enum do Prisma:** o client gerado já continha `WORKER_DIARIO` da wave 1, então o `npx prisma generate` preventivo não foi necessário.

## Known Stubs

Nenhum. Todo caminho do handler está ligado a dados reais: o `findMany` consulta o banco de verdade, as transições vão ao `acessoService`, e as contagens do corpo vêm da lista materializada — não há valor placeholder, mock residual nem campo hardcoded na resposta.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano. O endpoint é a única porta introduzida, está no registro (T-05-01 a T-05-17) e todas as disposições `mitigate` que tocam estes dois arquivos têm asserção correspondente: T-05-01/02 (três formas de segredo errado), T-05-07 (401 sem corpo), T-05-06 (sentinelas de sanitização), T-05-16 (log sem o segredo), T-05-04 (freio ponta a ponta), T-05-05 (lotes), T-05-17 (asserção negativa de agendamento pós-resposta). T-05-08 permanece `accept`, com a justificativa normativa escrita no ponto 3 do JSDoc de módulo e a ausência total de query param como mitigação de leitura.

## User Setup Required

Nenhum arquivo `USER-SETUP.md` gerado (`user_setup: []` no plano). Vale registrar, porém, que **`CRON_SECRET` precisa existir no ambiente** para o endpoint responder 200 — o accessor é fail-closed e lança quando a variável está ausente ou vazia, virando 500. Gerar com `openssl rand -hex 32`. A configuração de host e agendador é escopo do plano 05-05.

## Next Phase Readiness

- **Pronto para 05-04 (e2e):** a rota HTTP `/api/cron/reconciliacao-diaria` existe, sem barra final, e o contrato do corpo está travado por teste executável — o e2e pode afirmar sobre as 7 chaves sem adivinhar o shape.
- **Pronto para 05-05 (gate de plataforma):** `route.ts` precisa entrar na allowlist do gate de grep que autoriza leitura de `ultimoStatusAuditado` (o worker o lê como `anterior` do compare-and-swap, nunca como fonte da verdade de acesso).
- **Sem blockers.** Nenhum pacote instalado nesta fase, então o Gate 6 de `gates:fase-04` (11 deps / 20 devDeps) continua verde.

---
*Phase: 05-worker-di-rio-de-reconcilia-o*
*Completed: 2026-09-01*

## Self-Check: PASSED

- `app/api/cron/reconciliacao-diaria/route.ts` — FOUND (291 linhas, `min_lines: 120` ✅)
- `app/api/cron/reconciliacao-diaria/route.test.ts` — FOUND (587 linhas, `min_lines: 200` ✅)
- Commit `4a0dc48` — FOUND
- Commit `b429a2b` — FOUND
- Commit `60f22fd` — FOUND
- Árvore de trabalho limpa após cada commit; nenhuma deleção de arquivo em nenhum dos três (`git diff --diff-filter=D` vazio).
