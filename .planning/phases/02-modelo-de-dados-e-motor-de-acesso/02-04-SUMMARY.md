---
phase: 02-modelo-de-dados-e-motor-de-acesso
plan: 04
subsystem: backend
tags: [billing, auditoria, compare-and-swap, concorrencia, pos-resposta, next-after]

requires:
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    plan: 01
    provides: "model AuditoriaAcesso, enums StatusAcesso e CausaTransicaoAcesso, coluna Empresa.ultimoStatusAuditado"
provides:
  - "agendarPosResposta(tarefa) — wrapper de after() do next/server com fallback inline fora de escopo de request e catch obrigatorio com log [acesso]"
  - "acessoService.registrarTransicao({ empresaId, anterior, novo, causa }) — o UNICO caminho de escrita de AuditoriaAcesso, idempotente sob concorrencia"
  - "acessoService — singleton exportado de app/services/acesso.service.ts"
affects: [02-06-gate-de-conformidade, 04-enforcement, 05-worker-diario]

tech-stack:
  added: []
  patterns:
    - "Efeito colateral fora do caminho do response via `after()` do next/server, isolado num wrapper que degrada para execucao inline quando nao ha escopo de request (E468)"
    - "Compare-and-swap com `updateMany` condicional + escrita condicionada a `count === 1` — idempotencia sob concorrencia sem constraint unica artificial"
    - "Guarda barata antes de qualquer I/O (`anterior === novo`) para funcao que roda a cada request autenticado"

key-files:
  created:
    - lib/agendar-pos-resposta.ts
    - lib/agendar-pos-resposta.test.ts
    - app/services/acesso.service.ts
    - app/services/acesso.service.test.ts
  modified: []

key-decisions:
  - "O efeito colateral de auditoria mora num metodo de servico (acessoService.registrarTransicao), nao dentro de avaliarAcesso — a funcao pura do plano 02-03 continua pura e a comparacao com o estado anterior e responsabilidade de quem chama (CONTEXT §Claude's Discretion)"
  - "O CAS usa a propria coluna Empresa.ultimoStatusAuditado como registrador atomico: o `where` casa o valor ESPERADO do status anterior, inclusive `null` (igualdade a NULL valida no Prisma), que e o caso da primeirissima transicao pos-REGISTRO/BACKFILL"
  - "Read-then-write descartado explicitamente: buscar a ultima linha, comparar em memoria e criar nao e atomico e gravaria duas linhas identicas sob concorrencia"
  - "O fallback inline de agendarPosResposta nao e defensive coding — e requisito: revalidarConta roda em 3 contextos sem escopo de request (Vitest, worker HTTP da Fase 5, scripts) e sem ele a suite inteira quebraria com E468 quando o plano 02-06 plugar a auditoria"
  - "Nenhum caminho de leitura de AuditoriaAcesso foi criado (gate de grep proibindo findMany/findFirst/findUnique no service) — decisao de seguranca, T-02-19"
  - "JSDoc de agendarPosResposta descreve as alternativas rejeitadas (temporizador do runtime, promise solta) sem citar os identificadores literais, porque o acceptance criteria do plano roda um grep que nao distingue codigo de comentario"

patterns-established:
  - "Teste de contrato de `after()` dividido em dois: o caso fora de escopo roda SEM mock de next/server (prova real do E468 capturado), o caso com escopo usa vi.doMock + vi.resetModules + import dinamico, ja que vi.mock e hoisted por arquivo"
  - "Nao-vacuidade provada por reversao temporaria: remover a guarda D-16 faz falhar exatamente o teste de D-16"

requirements-completed: [BILL-05]

duration: 5min
completed: 2026-08-31
---

# Phase 02 Plan 04: Escrita da Trilha de Auditoria Summary

**O sistema passou a ter um unico caminho de escrita de `AuditoriaAcesso` que grava exatamente uma linha por transicao real de status — zero I/O quando nao houve mudanca, no-op silencioso quando outro request concorrente ja registrou a mesma transicao — e um agendador que tira essa escrita do caminho do response sem quebrar nos tres contextos onde nao existe escopo de request do Next.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-08-31T16:51:00Z
- **Completed:** 2026-08-31T16:56:00Z
- **Tasks:** 2
- **Files created:** 4 (nenhum arquivo existente modificado)

## What Was Built

### Task 1 — `lib/agendar-pos-resposta.ts` (commit `fce2366`)

`agendarPosResposta(tarefa: () => Promise<unknown>): void` embrulha a tarefa numa closure
`seguro` com `.catch` obrigatorio (`console.error("[acesso] efeito pos-resposta falhou:", erro)`),
tenta `after(seguro)` do `next/server`, e no `catch` executa `void seguro()` inline.

Tres coisas que o wrapper garante e que nenhuma alternativa garantiria:

1. **A escrita sai do caminho do response.** Escrever auditoria dentro do render de um
   layout/page bloquearia o TTFB de toda tela do admin, disparado por um simples GET (T-02-17).
2. **Uma falha de auditoria nunca derruba o request que a originou** (ASVS V7, T-02-16). O
   `.catch` e interno ao wrapper, entao quem chama nao precisa lembrar de colocar um.
3. **Nao quebra fora de escopo de request** (T-02-20). O `after` do Next 16.3 lanca `E468`
   quando o `AsyncLocalStorage` de request nao existe — o que e o caso no Vitest, no worker HTTP
   da Fase 5 e em qualquer script de manutencao.

O JSDoc registra por que `after` e nao um temporizador do runtime (morre com a invocacao em
serverless) nem uma promise solta (some do rastro de erro e ninguem a drena no encerramento):
o Next drena os callbacks de `after` pendentes no `SIGTERM` e os executa mesmo quando o render
falha, redireciona ou devolve 404.

3 testes. O caso "fora de escopo de request" roda **sem** mockar `next/server` — e a prova real
de que o `E468` e capturado e a tarefa roda inline, e nao uma simulacao do cenario.

### Task 2 — `app/services/acesso.service.ts` (commit `c807578`)

`acessoService.registrarTransicao({ empresaId, anterior, novo, causa })` — classe `AcessoService`
nao exportada + `export const acessoService = new AcessoService()`, na forma dos outros services
do repo.

O metodo tem duas invariantes:

- **D-16 (guarda barata):** `if (params.anterior === params.novo) return null;` **antes** de abrir
  qualquer transacao. `avaliarAcesso` vai rodar dentro de `revalidarConta`, ou seja a cada request
  autenticado; sem esta guarda cada page view do admin viraria uma linha de auditoria (T-02-18).
  Zero I/O, nao apenas "zero escrita".
- **Compare-and-swap:** dentro de `prisma.$transaction` interativa (sempre `tx.`, nunca `prisma.`),
  `tx.empresa.updateMany({ where: { id, ultimoStatusAuditado: anterior }, data: { ultimoStatusAuditado: novo } })`.
  Se `count === 0`, outro request concorrente ja registrou a transicao → `return null`, no-op sem
  excecao. Se `count === 1`, `tx.auditoriaAcesso.create` com exatamente 4 campos (T-02-15).

A linha carrega apenas `empresaId`, `statusAnterior`, `statusNovo` e `causa`; `createdAt` vem do
`@default(now())` do schema. **D-17 proibe** snapshot dos fatos de billing.

8 testes, cobrindo D-16 (com asseracao explicita de que `$transaction` **nao** foi chamado),
o `where` exato do CAS, D-17 por asseracao exata de 4 chaves (nao `objectContaining` — e a exatidao
que prova a ausencia de snapshot), concorrencia com `count: 0`, primeira transicao com
`anterior: null`, e as 3 causas de D-14/D-19 chegando intactas ao `create`.

## Escopo Negativo Respeitado

Confirmado por gate automatizado, nao por leitura:

- **Nenhum caminho de leitura de auditoria** — `grep -cE "findMany|findFirst|findUnique" app/services/acesso.service.ts` = 0 (T-02-19).
- **Nenhum endpoint** de auditoria criado.
- **Nada plugado em `revalidarConta`** — isso e o plano 02-06.
- **`acessoVitalicio` nao e auditado** (D-15 aceita a limitacao).
- **Nenhum pacote novo** instalado (T-02-SC).

## Verification Results

| Gate | Resultado |
|------|-----------|
| `npx vitest run lib/agendar-pos-resposta.test.ts` | 3/3 verdes |
| `npx vitest run app/services/acesso.service.test.ts` | 8/8 verdes (minimo exigido: 6) |
| `npx vitest run app/services/acesso.service.test.ts -t "concorr"` | 1 executado, verde |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (1 warning pre-existente de `Link` nao usado em `app/registro/page.tsx`, mantido de proposito desde 01-04) |
| `npm run test` | 515 testes / 71 arquivos, todos verdes |

Gates de grep do Task 1: `unstable_after` = 0, `from "next/server"` = 1, `[acesso]` = 2,
`console.log` = 0, `setTimeout|setImmediate` = 0.

Gates de grep do Task 2: `updateMany` = 1, `count === 0` = 1, `export const acessoService` = 1,
`export default` = 0, `export class` = 0, `findMany|findFirst|findUnique` = 0.

**Nao-vacuidade comprovada por reversao temporaria:** removendo a guarda
`if (params.anterior === params.novo) return null;`, o teste "D-16: nao toca o banco quando o
status avaliado e igual ao ultimo auditado" falha (1 failed | 7 passed). A guarda foi restaurada
imediatamente e a suite voltou a 8/8 antes do commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Acceptance criteria com gate de grep auto-contraditorio (Task 2)**

- **Found during:** Task 2
- **Issue:** O acceptance criteria manda verificar que nao ha `prisma.` dentro do callback de
  `$transaction` com
  `test -z "$(sed -n '/\$transaction/,/^  }/p' app/services/acesso.service.ts | grep -E '\bprisma\.')"`.
  O range do `sed` **comeca na propria linha** `return prisma.$transaction(async (tx) => {`, que
  contem `prisma.` por construcao. O gate e insatisfazivel com o import que o mesmo plano exige
  (`import { prisma } from "@/lib/prisma"`) — so passaria renomeando o import (ex.: `prisma as db`),
  o que violaria a convencao do repositorio e a instrucao explicita do plano.
- **Fix:** implementada a **intencao** do gate (dentro do callback so ha `tx.`, nenhuma chamada
  `prisma.`) e verificada com o gate corrigido, que pula a linha de abertura:
  `sed -n '/\$transaction/,/^  }/p' app/services/acesso.service.ts | tail -n +2 | grep -E '\bprisma\.'`
  → sem saida. Nenhuma contorcao de codigo foi introduzida para satisfazer o grep literal.
- **Files modified:** nenhum (defeito do plano, nao do codigo)
- **Commit:** `c807578`

**2. [Rule 3 - Blocking] Conflito entre a instrucao de JSDoc e o gate de grep de temporizadores (Task 1)**

- **Found during:** Task 1
- **Issue:** A `<action>` manda documentar em JSDoc "por que `after` e nao `setTimeout` nem promise
  solta", enquanto o acceptance criteria exige
  `grep -cE "setTimeout|setImmediate" lib/agendar-pos-resposta.ts` = 0 "fora de comentarios" — mas
  `grep -c` conta linhas de comentario igualmente.
- **Fix:** o JSDoc cobre integralmente o conteudo pedido (por que nao um temporizador que morre com
  a invocacao serverless, por que nao uma promise solta que some do rastro de erro, e o contraste
  com a drenagem de `after` no `SIGTERM`) sem citar os identificadores literais. O gate literal passa
  com 0 e o requisito de documentacao esta atendido.
- **Files modified:** `lib/agendar-pos-resposta.ts`
- **Commit:** `fce2366`

### Notas de implementacao (nao sao desvios)

- O terceiro caso de teste do Task 1 usa `vi.doMock` + `vi.resetModules` + `import()` dinamico em
  vez de `vi.mock`, porque `vi.mock` e hoisted para o topo do **arquivo** e mockaria `next/server`
  tambem para o primeiro caso — que precisa justamente do modulo real para provar o `E468`.
- O teste registra explicitamente que o comportamento real de `after()` dentro de um render do Next
  (o callback rodar so depois do response sair) nao e reproduzivel em Vitest; a prova real e o
  `<human-check>` do plano 02-06.

## Authentication Gates

Nenhum.

## Known Stubs

Nenhum. Ambos os artefatos estao completos e testados; o unico "nao ligado ainda" e intencional e
esta no escopo negativo do plano — `agendarPosResposta` e `acessoService.registrarTransicao` ainda
nao tem call site em producao, porque plugar os dois em `revalidarConta` e o plano 02-06.

## Threat Flags

Nenhuma superficie de seguranca nova alem da ja registrada no `<threat_model>` do plano. Nenhum
endpoint, nenhuma rota, nenhum caminho de leitura, nenhuma dependencia nova.

## Para o Proximo Plano (02-06)

- Chamar `acessoService.registrarTransicao` **sempre** por dentro de `agendarPosResposta` — o
  service em si nao agenda nada, e a escrita e sincrona se chamada direto.
- O `anterior` a passar e `empresa.ultimoStatusAuditado` (o ultimo status **auditado**), nao o
  status derivado do request anterior — e essa coluna que o CAS usa como registrador.
- A causa para transicoes observadas durante um request autenticado e `AVALIACAO_SESSAO` (D-19).
- Empresas sem nenhum login continuam nao auditadas ate a Fase 5 (worker, WRK-01) existir — e
  limitacao aceita, nao regressao.

## Self-Check: PASSED

Os 4 arquivos declarados existem em disco e os 2 commits de task (`fce2366`, `c807578`) existem no
historico de `gateway_pagamento`.
