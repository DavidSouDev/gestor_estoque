---
phase: 02-modelo-de-dados-e-motor-de-acesso
plan: 03
subsystem: backend
tags: [billing, motor-de-acesso, funcao-pura, fuso-horario, dst, maquina-de-estados]

requires:
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    plan: 01
    provides: "enum StatusAcesso no schema Prisma (6 valores) e as 4 colunas de billing na Empresa"
provides:
  - "meiaNoiteEmSaoPaulo(instante, deslocamentoDias) — limite superior EXCLUSIVO de um dia local de America/Sao_Paulo, correto nas transicoes historicas de DST"
  - "avaliarAcesso(fatos, agora) — funcao pura que deriva um dos 6 StatusAcesso a partir dos 4 fatos de billing"
  - "FatosDeAcesso / ResultadoAcesso — o contrato de entrada e saida do motor de acesso"
  - "DIAS_DE_CARENCIA (10) e DIAS_DE_TRIAL (14) como constantes exportadas"
affects: [02-04-acesso-service, 02-05-trial-no-registro, 02-06-gate-de-conformidade, 04-enforcement, 05-worker-diario]

tech-stack:
  added: []
  patterns:
    - "Relogio por parametro (`agora: Date`) em vez de `new Date()` interno — as viradas de data exatas viram testaveis sem fake timers"
    - "Matematica de fuso por ponto-fixo com o desvio SEMPRE medido contra o alvo, nunca contra o valor corrente (Intl + tzdata do ICU, zero dependencia nova)"
    - "Tabela de cenarios compartilhada entre `it.each` e o teste de cobertura de enum — a mesma lista prova comportamento e exaustividade"

key-files:
  created:
    - lib/fuso-sao-paulo.ts
    - lib/fuso-sao-paulo.test.ts
    - lib/avaliar-acesso.ts
    - lib/avaliar-acesso.test.ts
  modified: []

key-decisions:
  - "Retorno e o objeto ResultadoAcesso { status, expiraEm, carenciaAte }, nao uma string: `carenciaAte` e devolvido agora para que ACC-01 (Fase 4) nao re-derive a aritmetica de carencia num segundo lugar"
  - "Os dois modulos moram em lib/, nao em app/services/: a convencao do repo e que *.service.ts toca Prisma e lib/*.ts guarda utilitarios puros"
  - "Implementacao de fuso copiada literalmente da versao verificada da pesquisa, sem 'melhoria' — a versao ingenua passa em 100% dos casos de 2026 e erra por 1-2h em 2017/2018"
  - "Os 3 casos de DST historico sao obrigatorios mesmo o produto so lidando com datas futuras: sao a unica prova de que o algoritmo esta certo e nao acertando por sorte"
  - "DIAS_DE_TRIAL exportada com o `+1` de D-18 documentado na propria const, para o plano 02-05 nao ter que redescobrir a aritmetica"

patterns-established:
  - "Nao-vacuidade provada por reversao temporaria: trocar `<` por `<=` na regra do trial faz falhar exatamente o caso de virada exata"

requirements-completed: [BILL-02, BILL-04]

duration: 8min
completed: 2026-08-31
---

# Phase 02 Plan 03: Motor de Decisao de Acesso Summary

**O sistema passou a saber dizer, para qualquer combinacao dos 4 fatos de billing e qualquer data/hora, exatamente qual dos 6 `StatusAcesso` a empresa tem — por uma funcao pura com o relogio injetado por parametro, apoiada num helper de fuso cuja correcao esta provada contra as duas transicoes historicas de horario de verao do Brasil.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-31T16:42:00Z
- **Completed:** 2026-08-31T16:50:00Z
- **Tasks:** 2
- **Files created:** 4 (nenhum arquivo existente modificado)

## Accomplishments

- `lib/fuso-sao-paulo.ts` — `meiaNoiteEmSaoPaulo(instante, deslocamentoDias = 0)` implementado como ponto-fixo de 2 iteracoes sobre `Intl.DateTimeFormat("en-CA", { timeZone: FUSO, ... })`, com o desvio medido contra o alvo original. Trata o `"24"` que o ICU pode emitir para meia-noite. JSDoc define a semantica normativa: o retorno e o **limite superior exclusivo** do dia local, que combinado com a comparacao inclusiva de D-02 representa exatamente "o fim do dia em Sao Paulo" (D-01).
- `lib/fuso-sao-paulo.test.ts` — 17 casos em tabela, incluindo os 14 pares da tabela verificada da pesquisa. Os tres cenarios de DST passam com os valores exatos: `2018-02-16T12:00:00Z + 1d → 2018-02-17T02:00:00.000Z` (dentro do offset −02), `2018-02-17T12:00:00Z + 1d → 2018-02-18T03:00:00.000Z` (meia-noite ambigua) e `2017-10-14T12:00:00Z + 1d → 2017-10-15T02:00:00.000Z` (meia-noite inexistente). Mais o default de `deslocamentoDias`, o caso 0 explicito e um caso de pureza/nao-mutacao do argumento.
- `lib/avaliar-acesso.ts` — a maquina de estados de D-02..D-10 nas 6 regras da ordem normativa, cada uma anotada com a decisao que a origina. `if (fatos.acessoVitalicio)` e literalmente a **primeira instrucao do corpo** (linha 56), antes inclusive do fail-closed.
- `lib/avaliar-acesso.test.ts` — 21 testes: 19 cenarios em tabela (`it.each`) + o teste de cobertura de enum + o teste de pureza. Cada cenario afirma os **tres** campos do retorno (`status`, `expiraEm`, `carenciaAte`) com `toISOString()` exato, nao so o status.
- **Nao-vacuidade comprovada por reversao temporaria:** trocando `agora < fatos.trialFim` por `agora <= fatos.trialFim`, o teste `"no instante exato de trialFim o trial acabou e começa a carencia (D-02)"` falha e os outros 20 continuam verdes — o limite inclusivo de D-02 esta de fato travado por teste. O arquivo foi restaurado a partir de uma copia no scratchpad e a suite voltou a verde antes do commit.
- Zero dependencia nova (`date-fns` / `luxon` descartados na pesquisa; `Temporal` indisponivel neste Node), consistente com T-02-SC.

## Task Commits

1. **Task 1: `lib/fuso-sao-paulo.ts` — helper de fuso verificado, com testes de DST historico** — `037c51d` (feat)
2. **Task 2: `lib/avaliar-acesso.ts` — a maquina de estados dos 6 status** — `8b5948c` (feat)

## Files Created/Modified

- `lib/fuso-sao-paulo.ts` (criado, 62 linhas) — `FUSO` como unica const de modulo; `formatador` instanciado uma vez no escopo do modulo; `partes()` e `paredeLocalComoUTC()` internas; um unico export nomeado. Nenhum import.
- `lib/fuso-sao-paulo.test.ts` (criado, 167 linhas) — duas tabelas (`casos` e `casosDeHorarioDeVerao`) + 3 casos individuais.
- `lib/avaliar-acesso.ts` (criado, 110 linhas) — importa `StatusAcesso` de `@prisma/client` como **valor** (nao `import type`) e `meiaNoiteEmSaoPaulo` por `@/lib/fuso-sao-paulo`, seguindo a convencao do repo para irmaos dentro de `lib/`.
- `lib/avaliar-acesso.test.ts` (criado, 344 linhas) — linha do tempo de referencia documentada no topo (TRIAL_FIM 15/09, carencia do trial 25/09, ACESSO_ATE 01/10, carencia do acesso 11/10), todas as datas como instantes UTC explicitos.

## Verification Evidence

| Comando | Resultado |
|---|---|
| `npx vitest run lib/fuso-sao-paulo.test.ts` | **17 passed** (minimo exigido: 9) |
| `npx vitest run lib/avaliar-acesso.test.ts` | **21 passed** (minimo exigido: 18) |
| `npx vitest run lib/avaliar-acesso.test.ts -t "vitalicio"` | 2 passed \| 19 skipped |
| `npx vitest run lib/avaliar-acesso.test.ts -t "trial"` | 6 passed \| 15 skipped |
| `npx vitest run lib/avaliar-acesso.test.ts -t "carencia"` | 5 passed \| 16 skipped |
| `npx vitest run lib/avaliar-acesso.test.ts -t "backfill"` | 1 passed \| 20 skipped |
| Teste de cobertura de enum | verde — os 6 valores de `StatusAcesso` sao devolvidos por pelo menos um cenario |
| Reversao temporaria `<` → `<=` na regra do trial | **1 failed** (`"no instante exato de trialFim..."`), 20 passed — teste nao-vacuo; revertido |
| `grep -vE '^\s*(//\|\*\|/\*)' lib/fuso-sao-paulo.ts \| grep -E 'from "@/lib/prisma"\|new Date\(\)'` | vazio |
| `grep -vE '^\s*(//\|\*\|/\*)' lib/avaliar-acesso.ts \| grep -E 'new Date\(\)\|Intl\.\|from "@/lib/prisma"\|process\.env'` | vazio |
| `grep -c "America/Sao_Paulo" lib/fuso-sao-paulo.ts` | `1` |
| `grep -cE "\-3\|UTC-03\|GMT-3"` em `lib/fuso-sao-paulo.ts` (comentarios filtrados) | `0` — offset nao hardcodado |
| `grep -c "StatusAcesso.VITALICIO" lib/avaliar-acesso.ts` | `1`, e a checagem e a primeira instrucao do corpo (linha 56) |
| `grep -cE "useFakeTimers\|@vitest-environment node"` nos 2 testes | `0` em ambos |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 erros, 1 warning pre-existente (`Link` nao usado em `app/registro/page.tsx`, mantido desde 01-04) |
| `npm run test` | 69 arquivos / **504 testes** passando (466 da linha de base pos-02-02 + 38 novos, zero regressao) |
| `git diff --diff-filter=D HEAD~1 HEAD` | vazio nos dois commits — nenhum arquivo deletado |

## Decisions Made

- **Retorno como objeto, nao string.** `ResultadoAcesso { status, expiraEm, carenciaAte }`. `carenciaAte` sai daqui porque ACC-01 (Fase 4) precisa de "dias restantes" no banner; devolve-lo evita que a aritmetica de carencia seja re-derivada num segundo lugar e saia de sincronia com esta.
- **`lib/`, nao `app/services/`.** As duas funcoes nao tocam Prisma; `app/services/*.service.ts` e reservado para quem faz I/O. O wrapper com efeito colateral de auditoria (D-16) e do plano 02-04, e mora em service — a fronteira e essa.
- **Copia literal do algoritmo de fuso.** A pesquisa registra que a versao ingenua (desvio medido contra o valor corrente) passa em todos os casos de 2026 e erra por 1-2h em 2017/2018. Nao foi reescrita, nao foi "simplificada".
- **Os 3 casos de DST sao obrigatorios.** O Brasil aboliu o horario de verao em 2019, entao todo caso de 2026+ passa tambem com o algoritmo errado. Sem 2017/2018 a suite nao prova nada sobre a corretude do algoritmo.
- **`DIAS_DE_TRIAL` exportada com o `+1` de D-18 documentado na const.** O consumidor (plano 02-05) escreve `meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1)`; a explicacao de por que o dia do cadastro e o dia 0 mora junto do numero, nao so no CONTEXT.
- **Titulos de teste em ASCII sem acento para as palavras-chave.** `vitalicio`, `carencia` e `backfill` aparecem sem acento nos nomes porque o filtro `-t` do vitest e sensivel a caractere — os gates de `02-VALIDATION.md` dependem disso.

## Deviations from Plan

Nenhum desvio. O plano foi executado exatamente como escrito.

Duas escolhas de discricao dentro do que o plano ja autorizava, registradas por transparencia:

1. A tabela de fuso cobre os **14** pares da pesquisa (colunas `+1d` e `+15d`), nao apenas os 7 da coluna `+1d`. O plano pedia "os 7 pares"; incluir tambem `+15d` custa zero e exercita o caso em que o proprio deslocamento cruza uma mudanca de offset (`2018-02-16 + 15d`, que cai fora do DST).
2. Foram adicionados dois testes de pureza (um por modulo) que afirmam que a mesma entrada devolve o mesmo resultado e que os `Date` recebidos nao sao mutados. Nao estavam listados como obrigatorios, mas fecham o criterio de sucesso #5 pelo lado do comportamento, e nao so pelo lado do grep.

**Total deviations:** 0 (nenhuma regra 1-4 acionada).
**Impact on plan:** nenhum. Nenhum pacote instalado.

## Issues Encountered

- Nenhum bloqueio. Os valores esperados dos 14 casos de fuso bateram na primeira execucao, confirmando que a copia literal da implementacao verificada estava correta.
- Nota de higiene de arvore: `.planning/config.json` (modificado) e `.planning/phases/01-pr-requisitos-de-produ-o/01-PATTERNS.md` (nao rastreado) ja apareciam no `git status` antes desta execucao. Nao foram tocados nem incluidos em nenhum commit deste plano.

## Threat Model Follow-up

- **T-02-10** (fatos todos nulos concedendo acesso ilimitado) — **mitigado e comprovado**: `candidatos.length === 0 → BLOQUEADO`, com o cenario `"sem nenhum fato de billing, fail-closed em BLOQUEADO"` afirmando status e os dois campos nulos.
- **T-02-11** (carencia contada so de `trialFim`) — **mitigado e comprovado**: `max(trialFim, acessoAte)` + os 4 cenarios de nulidade, incluindo o discriminante `"trial antigo e pagamento recente"` (trial vencido ha 19 dias, pagamento ha 3 → `CARENCIA` com `expiraEm === acessoAte`; contar de `trialFim` devolveria `BLOQUEADO`).
- **T-02-12** (bug de fuso de 1-3h bloqueando empresa pagante um dia antes) — **mitigado**: implementacao copiada da versao verificada + 6 asserçoes nas duas transicoes historicas de DST.
- **T-02-13** (`new Date()` interno tornando as viradas nao testaveis) — **mitigado**: `agora` por parametro, gate de grep vazio nos dois modulos, zero fake timers nos dois arquivos de teste.
- **T-02-14** (vazamento por `ResultadoAcesso`) — aceito conforme planejado: o retorno e um enum e duas datas.
- **T-02-SC** — nenhum pacote novo instalado.

## Known Stubs

Nenhum. As duas funcoes estao completas e exercitadas; nenhum valor hardcoded, placeholder ou caminho "TODO" foi introduzido.

## Threat Flags

Nenhuma superficie nova de rede, auth, acesso a arquivo ou schema foi introduzida — os dois modulos sao funcoes puras sem I/O.

## User Setup Required

None — codigo puro, sem configuracao, sem migration, sem servico externo.

## Next Phase Readiness

- **Plano 02-04 (`acesso.service.ts`)** pode consumir `avaliarAcesso` e `ResultadoAcesso` imediatamente. Lembrete de D-16: a comparacao com o ultimo status persistido e responsabilidade do wrapper, nao desta funcao — `avaliarAcesso` precisa continuar pura e o gate de grep do 02-06 vai cobrar isso.
- **Plano 02-05 (registro)** ja tem `DIAS_DE_TRIAL` e a aritmetica de D-18 documentada; deve escrever `trialFim = meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1)`.
- **Plano 02-06 (gate de conformidade):** `lib/avaliar-acesso.ts` e o unico lugar onde os 6 valores de `StatusAcesso` sao decididos; se o gate grepar por `StatusAcesso.` fora dos arquivos autorizados, estes dois modulos e seus testes precisam estar na allowlist.
- **Fase 4 (enforcement):** `carenciaAte` ja vem no retorno — o banner de "dias restantes" nao precisa recalcular nada.
- Nenhum plano fica bloqueado por este.

## Self-Check: PASSED

- Arquivos verificados em disco: `lib/fuso-sao-paulo.ts`, `lib/fuso-sao-paulo.test.ts`, `lib/avaliar-acesso.ts`, `lib/avaliar-acesso.test.ts` — os 4 presentes.
- Commits verificados em `git log`: `037c51d`, `8b5948c` — ambos presentes em `gateway_pagamento`.

---
*Phase: 02-modelo-de-dados-e-motor-de-acesso*
*Completed: 2026-08-31*
