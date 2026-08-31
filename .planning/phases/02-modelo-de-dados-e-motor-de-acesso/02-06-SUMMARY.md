---
phase: 02-modelo-de-dados-e-motor-de-acesso
plan: 06
subsystem: backend
tags: [billing, auth, acesso, auditoria, revalidacao, after, react-cache, bill-01]

requires:
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    plan: 01
    provides: "colunas de billing na Empresa (acessoAte, trialFim, canceladoEm, acessoVitalicio, ultimoStatusAuditado), model AuditoriaAcesso e enums StatusAcesso/CausaTransicaoAcesso"
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    plan: 03
    provides: "avaliarAcesso, FatosDeAcesso e ResultadoAcesso (lib/avaliar-acesso.ts)"
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    plan: 04
    provides: "acessoService.registrarTransicao (compare-and-swap) e agendarPosResposta (after + fallback inline)"
  - phase: 01-pr-requisitos-de-produ-o
    plan: 02
    provides: "revalidarConta com React.cache, select explicito e fail-closed (o ponto de extensao D-04 ocupado aqui)"
provides:
  - "ContaAtiva passa a carregar statusAcesso, acessoExpiraEm e carenciaAte, derivados a cada request autenticado pelos 4 fatos de billing (BILL-02)"
  - "Transicao de status observada durante um request gera exatamente UMA linha de AuditoriaAcesso com causa AVALIACAO_SESSAO, fora do ciclo do response (BILL-05, D-16, D-19)"
  - "Gate de grep de ultimoStatusAuditado verde: nenhum caminho de decisao de acesso le a coluna de bookkeeping (BILL-01 / OQ-2)"
  - "acessoVitalicio marcado direto no banco passa a valer no request seguinte, sem UI e sem nenhuma outra alteracao (BILL-04)"
affects: [04-enforcement, 05-worker-diario]

tech-stack:
  added: []
  patterns:
    - "Relogio lido no chamador impuro (const agora = new Date() dentro de revalidarConta) e injetado na funcao pura — avaliarAcesso continua sem I/O e sem relogio proprio"
    - "Comparacao com o estado persistido e responsabilidade do chamador, nao da funcao pura: revalidarConta compara resultado.status com ultimoStatusAuditado antes de agendar qualquer efeito"
    - "Efeito colateral disparado por GET sai do caminho do response via agendarPosResposta; o React.cache() de revalidarConta garante um agendamento por request"
    - "Stub default global de teste tem que representar uma linha REAL da tabela: estender o mock antes de estender o consumidor evita quebra em massa que esconde o sinal da mudanca"

key-files:
  created: []
  modified:
    - tests/setup/prisma-mock.ts
    - lib/auth-guard.ts
    - lib/auth-guard.test.ts

key-decisions:
  - "Assinaturas de requireAdminSession e requireAuth mantidas em AuthTokenPayload (decisao [01-03]): os 3 campos novos entram apenas em ContaAtiva, que e aditiva e nao quebra nenhum dos ~40 call sites"
  - "carenciaAte devolvido agora, mesmo sem consumidor nesta fase, para ACC-01 (Fase 4) nao re-derivar a aritmetica de carencia num segundo lugar"
  - "Import de @prisma/client dividido em dois: `import type { StatusAcesso, UserRole }` (so tipo) e `import { CausaTransicaoAcesso }` (usado como valor em AVALIACAO_SESSAO)"
  - "A avaliacao de acesso entra DENTRO do try existente: um bug nela cai no mesmo fail-closed de erro de banco, que e o comportamento correto para uma guarda de auth"
  - "Fixture e asserção do primeiro teste de auth-guard.test.ts atualizadas junto com a Task 2 (nao na Task 3) para que todo commit da sequencia fique verde"
  - "Suite e2e executada contra o servidor de dev ja em execucao (PLAYWRIGHT_PORT=3001) em vez de encerrar um processo do usuario"

patterns-established:
  - "Gate de conformidade por grep com lista de arquivos permitidos como prova executavel de um requisito negativo (BILL-01: 'nenhuma decisao le o status persistido')"
  - "Asseracao sobre as chaves exatas do select (Object.keys(...).sort()) como rede contra campo removido chegar como undefined na funcao pura, em silencio"

requirements-completed: [BILL-02, BILL-04, BILL-05]

duration: 9min
completed: 2026-08-31
---

# Phase 02 Plan 06: Motor de Acesso Plugado em revalidarConta Summary

**A cada request autenticado o sistema passou a derivar o status de acesso da empresa a partir dos 4 fatos de billing e a expo-lo em `ContaAtiva`, gravando exatamente uma linha de auditoria `AVALIACAO_SESSAO` quando (e so quando) o status muda — sem bloquear ninguem, sem alterar assinaturas publicas e sem que nenhuma decisao de acesso leia o status persistido.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-31T17:04:00Z
- **Completed:** 2026-08-31T17:13:00Z
- **Tasks:** 3
- **Files modified:** 3 (nenhum arquivo criado)

## What Was Built

### Task 1 — `tests/setup/prisma-mock.ts` (commit `e24b75c`)

O stub default de `usuario.findFirst` — a fixture global que mantem os 12 arquivos de teste de rota
autenticada passando — ganhou os 5 campos de billing dentro de `empresa`: `acessoAte: null`,
`trialFim: new Date("2099-01-01T03:00:00.000Z")`, `canceladoEm: null`, `acessoVitalicio: false` e
`ultimoStatusAuditado: "TRIAL"`.

Esta task veio **primeiro de proposito**. Sem ela, no instante em que a Task 2 fizesse `revalidarConta`
ler os campos, a funcao pura receberia `undefined` e todos os testes de rota autenticada quebrariam de
uma vez, escondendo o sinal real da mudanca. O efeito ficou visivel na pratica: apos a Task 2, a suite
acusou **exatamente 1 falha** (a fixture local do proprio `auth-guard.test.ts`) contra 517 verdes.

`trialFim` e um literal fixo em 2099, nunca um valor relativo ao relogio — a suite tem varios testes com
`vi.useFakeTimers()`, e um valor relativo a tornaria sensivel ao tempo
(`grep -cE "Date.now\(\)|new Date\(\)" tests/setup/prisma-mock.ts` = 0). Com `trialFim` no futuro e os
demais fatos nulos, a avaliacao devolve `TRIAL`, igual ao `ultimoStatusAuditado` do stub: e a
combinacao **neutra**, que nao faz nenhum teste existente agendar escrita de auditoria por efeito
colateral.

O comentario normativo do `beforeEach` foi **estendido**, nao substituido: o texto sobre `mockReset` e
sobre a ordem dentro do `beforeEach` continua intacto, com um paragrafo novo explicando por que a conta
default precisa de fatos consistentes e por que a data e literal.

### Task 2 — `lib/auth-guard.ts` (commit `ec2b210`)

Tres mudancas, todas aditivas.

**1. Interface `ContaAtiva`** ganhou `statusAcesso: StatusAcesso`, `acessoExpiraEm: Date | null` e
`carenciaAte: Date | null` — 8 campos no total. `requireAdminSession` e `requireAuth` continuam
devolvendo `AuthTokenPayload` (decisao [01-03]); `lib/session.ts` e `lib/api-auth.ts`, os dois unicos
consumidores de `revalidarConta`, so leem campos nomeados (`conta.empresaSlug`, e o truthiness de
`conta`), entao acrescentar campos nao toca em nenhum deles — nenhum dos dois arquivos aparece no diff.

**2. `select` aninhado de `empresa`** estendido de `{ slug: true }` para as 6 chaves `slug`,
`acessoAte`, `trialFim`, `canceladoEm`, `acessoVitalicio`, `ultimoStatusAuditado`. A projecao continua
explicita: **nenhum `include`** foi introduzido em nenhum nivel, e o comentario que proibe `include` no
modelo `Usuario` (por arrastar `senhaHash`) foi preservado literalmente. O `where` — isolamento por
`empresaId`, `ativo: true` e `empresa.deletedAt: null` — esta textualmente inalterado, provado pelo
teste de `where` continuar verde sem edicao.

**3. Avaliacao e agendamento**, dentro do mesmo `try`, depois do `if (!usuario) return null`:

- `const agora = new Date();` — o relogio e lido aqui, no chamador impuro, e injetado; `avaliarAcesso`
  nunca o le por conta propria (T-02-13).
- `avaliarAcesso({ acessoAte, trialFim, canceladoEm, acessoVitalicio }, agora)`, os 4 fatos e nada
  mais. `ultimoStatusAuditado` **nao** entra no objeto de fatos.
- Guarda de D-16: `if (acesso.status !== usuario.empresa.ultimoStatusAuditado)` agenda
  `acessoService.registrarTransicao({ empresaId, anterior, novo, causa: AVALIACAO_SESSAO })` via
  `agendarPosResposta`. A comparacao com o estado persistido e responsabilidade **deste** chamador, nao
  da funcao pura. Sem ela, cada page view do admin viraria uma linha (T-02-18).
- Os tres campos novos no objeto de retorno, vindos de `resultado.status`, `resultado.expiraEm` e
  `resultado.carenciaAte`.

O `catch` fail-closed com o log `[auth-guard]` esta inalterado — e a avaliacao entra **dentro** do
`try` de proposito, para que um bug nela caia no mesmo fail-closed. O wrapper `cache()` tambem esta
inalterado: e o que garante uma avaliacao (e portanto um agendamento) por request, mesmo com layout,
page e componentes chamando `revalidarConta`.

O JSDoc que dizia "Hoje NAO existe nenhuma logica de pagamento nesta funcao" foi reescrito: descreve a
derivacao a partir dos 4 fatos, o fato de `ultimoStatusAuditado` ser so bookkeeping, e traz o aviso
explicito de que **esta funcao nao bloqueia ninguem** — enforcement e ACC-01..ACC-04, na Fase 4.

### Task 3 — `lib/auth-guard.test.ts` (commit `b71902f`)

O arquivo foi de 5 para **10 casos**. Os 5 originais (`where`, `null` quando nao encontra conta ativa,
fail-closed em erro de banco, retorno da conta e "nunca seleciona senhaHash") continuam verdes; apenas
a fixture e a asserção `toEqual` do primeiro foram estendidas — nunca relaxadas para
`objectContaining`.

Casos novos:

1. **`seleciona os 6 campos de empresa exigidos pela avaliação de acesso`** — le
   `mock.calls[0][0].select.empresa.select` e trava as 6 chaves. Sem isso, remover um campo do `select`
   faria a funcao pura receber `undefined` em silencio em vez de falhar.
2. **`deriva o status dos fatos, nunca do status já auditado`** — `acessoVitalicio: true` com
   `ultimoStatusAuditado: "BLOQUEADO"` devolve `statusAcesso: "VITALICIO"`. E a prova executavel de
   BILL-01 (a coluna de bookkeeping nao decide nada) e do criterio de sucesso #3 da fase (marcar
   `acessoVitalicio` direto no banco vale no request seguinte, sem UI e sem nenhuma outra alteracao).
3. **`não agenda auditoria quando o status não mudou`** — fixture neutra,
   `expect(registrarTransicao).not.toHaveBeenCalled()` (D-16).
4. **`agenda uma única auditoria AVALIACAO_SESSAO quando o status muda`** — `trialFim` em 2020, com a
   carencia de 10 dias ha muito vencida, produz `BLOQUEADO` contra um `ultimoStatusAuditado` de
   `TRIAL`. Asseracao exata: `toHaveBeenCalledTimes(1)` e `toHaveBeenCalledWith` com as 4 chaves
   `empresaId`, `anterior: "TRIAL"`, `novo: "BLOQUEADO"`, `causa: "AVALIACAO_SESSAO"` (D-19).
5. **`não derruba o request quando a auditoria falha`** — `registrarTransicao` rejeitando; a conta
   continua sendo devolvida (nao `null`), com `statusAcesso` correto, e `console.error` recebeu uma
   mensagem com prefixo `[acesso]` (ASVS V7, T-02-29).

O service e mockado com `vi.mock("@/app/services/acesso.service", ...)` expondo `registrarTransicao`
como `vi.fn()`, com `mockReset` + `mockResolvedValue(null)` num `beforeEach` local. A chamada e
observavel no Vitest porque, fora de escopo de request do Next, `agendarPosResposta` degrada para
execucao inline (plano 02-04) — isso esta documentado em comentario no proprio teste, junto com o
ponteiro para o `<human-check>` deste plano, que e quem verifica o comportamento real de `after()`.

## Gate de Conformidade de BILL-01 (OQ-2)

Os unicos arquivos do repositorio que mencionam `ultimoStatusAuditado`:

```
app/services/acesso.service.test.ts
app/services/acesso.service.ts
app/services/empresa.service.test.ts
app/services/empresa.service.ts
lib/auth-guard.test.ts
lib/auth-guard.ts
prisma/migrations/20260831193038_add_billing_a_empresa/migration.sql
prisma/schema.prisma
tests/setup/prisma-mock.ts
```

Todos dentro da lista permitida — **0 violacoes**. Nas duas ocorrencias de `lib/auth-guard.ts` a coluna
aparece apenas como (a) chave do `select` e (b) argumento `anterior` do compare-and-swap; nunca como
entrada de decisao. O objeto `FatosDeAcesso` passado a `avaliarAcesso` tem exatamente os 4 fatos.

## Escopo Negativo Respeitado

- **Nenhum bloqueio.** `grep -vE '^\s*(//|\*|/\*)' lib/auth-guard.ts | grep -E 'BLOQUEADO|CANCELADO|CARENCIA'`
  = 0 linhas: o codigo nao ramifica por status de bloqueio. Contas em `CARENCIA`, `BLOQUEADO` e
  `CANCELADO` continuam autenticando exatamente como antes.
- **Nenhum `include`** em linha de codigo (Pitfall 7) — projecao explicita mantida, teste de
  `senhaHash` verde.
- **Nenhum arquivo sob `app/[slug]/admin/`** no diff (Pitfall 8). O diff do plano inteiro sao 3
  arquivos: `lib/auth-guard.ts`, `lib/auth-guard.test.ts`, `tests/setup/prisma-mock.ts`.
- **Assinaturas publicas inalteradas:** `lib/session.ts` e `lib/api-auth.ts` nao foram tocados.
- **Nenhum pacote novo** (T-02-SC).

## Verification Results

| Gate | Resultado |
|------|-----------|
| `npx vitest run lib/auth-guard.test.ts` | 10/10 verdes (eram 5) |
| Gate de grep de `ultimoStatusAuditado` | 0 arquivos fora da lista permitida |
| `npm run lint` | exit 0 (1 warning pre-existente de `Link` nao usado em `app/registro/page.tsx`, mantido de proposito desde 01-04) |
| `npx tsc --noEmit` | exit 0 |
| `npm run test` | 523 testes / 71 arquivos, todos verdes (eram 518) |
| Ocorrencias de `E468` / "outside a request scope" na suite | 0 |
| `npm run test:e2e` | 20/20 verdes contra Postgres real |

Gates de grep da Task 2: `avaliarAcesso(` = 1, `agendarPosResposta(` = 1, `AVALIACAO_SESSAO` = 1,
`include` em codigo = 0, ramificacao por status de bloqueio = 0.
Gates de grep da Task 1: `acessoVitalicio` = 1, `ultimoStatusAuditado` = 1, relogio relativo = 0.

Os 20 testes e2e exercitam o caminho real com `after()` dentro de um render do Next contra Postgres
real (registro cria empresas em `TRIAL`, e a navegacao no admin roda `revalidarConta` a cada request) —
nenhum `E468` e nenhuma regressao. Isso **nao substitui** o `<human-check>` abaixo, que exige forcar uma
transicao e contar as linhas da trilha.

## Human Check PENDENTE (nao verificado por este executor)

O `<human-check>` da Task 3 (item **02-06-H1** de `02-VALIDATION.md`) **NAO foi executado** — o projeto
usa `workflow.human_verify_mode: end-of-phase`, entao ele e colhido no UAT ao fim da fase. Nenhum
resultado dele foi fabricado aqui.

**O que precisa ser verificado manualmente:**

1. `npm run dev`, criar empresa nova em `/registro`, confirmar que `/{slug}/admin` abre.
2. Forcar a transicao direto no banco:
   `UPDATE "Empresa" SET "trialFim" = now() - interval '30 days' WHERE "slug" = '{slug}';`
   via `npx prisma db execute --file <arquivo>`.
3. Recarregar `/{slug}/admin` **uma vez** e conferir que existe **exatamente 1** linha em
   `AuditoriaAcesso` com `causa = 'AVALIACAO_SESSAO'`, `statusAnterior = 'TRIAL'`,
   `statusNovo = 'BLOQUEADO'` para aquela empresa.
4. Recarregar mais 3 vezes: a contagem tem que continuar **1**, e `ultimoStatusAuditado` tem que valer
   `BLOQUEADO`.
5. Confirmar que o admin continua acessivel e o catalogo publico `/{slug}` continua no ar (esta fase
   nao bloqueia ninguem), e que nenhum `E468` aparece no console do `next dev`.

**Por que so um humano pode fechar:** e a unica prova da assumption **A6** de `02-RESEARCH.md` — que o
`after()` do Next funciona chamado de dentro de uma funcao envolvida por `React.cache()`. A doc do Next
documenta o sentido inverso (usar `cache` dentro de `after`), e esse comportamento nao e reproduzivel
em Vitest, onde `agendarPosResposta` degrada para execucao inline. E tambem a unica prova de que o
compare-and-swap e idempotente contra um Postgres real sob reloads repetidos. O Playwright nao pode
faze-la: por convencao do repositorio o processo do Playwright nao carrega `.env` nem conhece
credenciais de banco (ver `e2e/sessao-revogada.spec.ts:4-13`).

**Se A6 for falsa:** a alternativa ja registrada na pesquisa e agendar no chamador (`lib/session.ts` /
`lib/api-auth.ts`) em vez de dentro de `revalidarConta`. Nesse cenario o fallback inline de
`agendarPosResposta` mantem a auditoria **correta**, apenas sem o ganho de TTFB — ou seja, a
corretude de BILL-05 nao depende do resultado do check, so a performance.

## Limitacao Conhecida e Aceita (OQ-4)

Empresas cujo admin **nunca faz login** nao geram request e portanto **nao tem transicoes auditadas**
nesta fase. Isso e deliberado e corresponde a T-02-32 (`accept` no threat model): e exatamente o buraco
que **WRK-01 (Fase 5, worker diario reconciliando todas as empresas)** fecha. Nenhum substituto foi
construido agora.

Consequencia pratica para a Fase 5: o worker vai encontrar empresas cujo `ultimoStatusAuditado` esta
varios estados atras do real e vai gravar a transicao com a **sua** causa, nao com `AVALIACAO_SESSAO`.
O compare-and-swap do plano 02-04 ja torna isso seguro contra concorrencia com um login simultaneo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixture e asserção do primeiro teste movidas da Task 3 para a Task 2**

- **Found during:** Task 2
- **Issue:** A `<action>` da Task 3 ja previa que a asserção `resolves.toEqual` de
  `lib/auth-guard.test.ts:18-24` **quebraria** com a mudanca da Task 2. Mas o
  `<acceptance_criteria>` da Task 2 exige `npm run test` verde. Cumprir os dois literalmente e
  impossivel: apos a Task 2 a suite ficou em 517 verdes / 1 falha (exatamente essa asserção).
- **Fix:** os itens A.1 e A.2 da Task 3 (estender a fixture `contaAtiva` com os 5 campos de billing e
  estender a asserção `toEqual` com os 3 campos novos) foram aplicados junto com a Task 2, de modo que
  **todo commit da sequencia fica verde**. A Task 3 acrescentou apenas os 5 casos novos. Nenhuma
  cobertura foi perdida e nenhuma asserção foi relaxada — `toEqual` exato foi mantido.
- **Files modified:** `lib/auth-guard.test.ts` (parcialmente no commit da Task 2)
- **Commit:** `ec2b210`

**2. [Rule 3 - Blocking] Servidor de dev ja em execucao impedia o `webServer` do Playwright**

- **Found during:** Task 3
- **Issue:** `npm run test:e2e` falhou com `Another next dev server is already running` /
  `Error: Process from config.webServer was not able to start. Exit code: 1`. O Next 16 recusa iniciar
  um segundo servidor de dev no mesmo diretorio, e havia um rodando ha ~2h49 (PID 154197, porta 3001)
  enquanto o `playwright.config.ts` tenta subir o seu na porta 3100.
- **Fix:** a suite foi executada contra o servidor existente com `PLAYWRIGHT_PORT=3001 npm run test:e2e`
  — o proprio config suporta isso (`PORT = process.env.PLAYWRIGHT_PORT ?? "3100"` e
  `reuseExistingServer: !process.env.CI`). Mesmo diretorio, mesmo codigo, mesmo banco. Nenhum arquivo de
  configuracao foi alterado e **nenhum processo do usuario foi encerrado**. Mesma condicao e mesma
  resolucao ja registradas no `02-05-SUMMARY.md`.
- **Files modified:** nenhum (condicao de ambiente)
- **Commit:** `b71902f`

### Notas de implementacao (nao sao desvios)

- O mock de `registrarTransicao` precisa de `mockResolvedValue(null)` explicito num `beforeEach`: um
  `vi.fn()` cru devolve `undefined`, e `agendarPosResposta` faz `tarefa().catch(...)` — o `.catch` sobre
  `undefined` lancaria `TypeError` sincrono, que subiria ate o fail-closed de `revalidarConta` e faria os
  testes receberem `null` por um motivo errado.
- O caso de falha de auditoria drena a fila de microtasks (`setTimeout(..., 0)`) antes de assertar o
  log: o efeito agendado roda fora do `await` de `revalidarConta`, que e precisamente o ponto do
  agendamento.

## Authentication Gates

Nenhum.

## Known Stubs

Nenhum. O caminho esta completo: request autenticado → `revalidarConta` → projecao dos 4 fatos →
`avaliarAcesso` → `statusAcesso` em `ContaAtiva` + auditoria condicional agendada. O status ainda **nao
tem consumidor de UI**, mas isso e escopo negativo declarado do plano (enforcement e ACC-01..ACC-04 na
Fase 4), nao um stub.

## Threat Flags

Nenhuma superficie de seguranca nova. Estado dos mitigantes de T-02-26 a T-02-32:

| Threat | Como ficou |
|--------|-----------|
| T-02-26 (Info Disclosure — `include` arrastando `senhaHash`) | mitigado: projecao explicita + comentario preservado + teste de `senhaHash` + gate de grep de `include` = 0 |
| T-02-27 (EoP — decisao lendo status stale) | mitigado: `FatosDeAcesso` com so os 4 fatos + caso `acessoVitalicio: true` vs `ultimoStatusAuditado: "BLOQUEADO"` + gate de grep de 0 violacoes |
| T-02-28 (DoS — escrita no render bloqueando TTFB) | mitigado no codigo (`agendarPosResposta` + `React.cache`); a confirmacao empirica de `after()` sob `cache()` depende do `<human-check>` pendente |
| T-02-29 (Repudiation — falha de auditoria derrubando o request) | mitigado: `.catch` com log `[acesso]` + caso de teste provando que a conta continua sendo devolvida |
| T-02-30 (Spoofing — sessao revogada) | `accept`, sem mudanca: `where` e fail-closed inalterados, e2e `sessao-revogada.spec.ts` verde |
| T-02-31 (DoS — `E468` derrubando os testes de rota autenticada) | mitigado: 0 ocorrencias na suite; fallback inline + stub default estendido funcionaram |
| T-02-32 (Repudiation — empresas sem login nunca auditadas) | `accept`, documentado acima como limitacao OQ-4 fechada por WRK-01 na Fase 5 |

## Self-Check: PASSED

- `lib/auth-guard.ts` — FOUND
- `lib/auth-guard.test.ts` — FOUND
- `tests/setup/prisma-mock.ts` — FOUND
- Commit `e24b75c` — FOUND
- Commit `ec2b210` — FOUND
- Commit `b71902f` — FOUND
