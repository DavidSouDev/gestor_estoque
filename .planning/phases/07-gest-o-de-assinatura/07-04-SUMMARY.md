---
phase: 07-gest-o-de-assinatura
plan: 04
subsystem: payments
tags: [asaas, billing, subscription-cancel, prisma, tdd, vitest, mutation-testing]

# Dependency graph
requires:
  - phase: 02-decisao-de-acesso
    provides: "FatosDeAcesso — os 4 fatos de billing que FatosDeAssinatura estende; D-06 (cancelar nao encurta o periodo pago)"
  - phase: 03-gateway-asaas
    provides: "assinaturaService.criarCheckout e a fronteira D-07; asaasClient.buscarAssinatura; AsaasApiError com status"
  - phase: 07-gest-o-de-assinatura
    plan: 01
    provides: "asaasClient.removerAssinatura (DELETE /subscriptions/{id}) e acessoEfetivoAte / ultimoDiaDeAcessoEmSaoPaulo"
provides:
  - "assinaturaService.fatosDeAssinatura(empresaId) — os 4 fatos + asaasSubscriptionId, sem nenhum I/O de gateway"
  - "assinaturaService.consultarAssinatura(id) — leitura viva com degradacao explicita (origem: asaas | indisponivel)"
  - "assinaturaService.cancelar(empresaId) — gateway primeiro, banco depois; 404 tratado como ja-cancelada"
  - "FatosDeAssinatura — interface que ESTENDE FatosDeAcesso"
  - "StatusAssinatura — contrato de 3 campos, sem o enum de status do fornecedor"
  - "criarCheckout limpa canceladoEm na reativacao (fecha o Pitfall 6)"
affects: [07-05, 07-06, 07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ordem normativa gateway -> banco, com a fronteira marcada em bloco de comentario e provada por assercao de AUSENCIA de escrita"
    - "Escrita de fato de billing por prisma.empresa.update direto, nunca pelo allowlist do CRUD (BILL-04)"
    - "Degradacao explicita de leitura de gateway (origem: 'indisponivel') em vez de excecao ou valor antigo"
    - "Campo de fornecedor mantido FORA do tipo de retorno para que nao exista caminho de compilacao ate a tela"
    - "Prova de nao-vacuidade por mutacao temporaria da regra, com o resultado registrado no SUMMARY"

key-files:
  created: []
  modified:
    - app/services/assinatura.service.ts
    - app/services/assinatura.service.test.ts

key-decisions:
  - "criarCheckout passa a limpar canceladoEm (resolucao da Open Question 2 / Pitfall 6): e o unico momento em que a intencao de voltar e inequivoca e e escrita local, sem I/O de gateway"
  - "StatusAssinatura NAO declara `status`: sem campo no tipo, o enum ACTIVE/EXPIRED/INACTIVE nao tem caminho de compilacao ate a tela e nao vira segunda autoridade de status ao lado de avaliarAcesso"
  - "cancelar devolve Promise<void> em vez do { acessoAte } do exemplo da pesquisa: a data de exibicao ja e derivada por ultimoDiaDeAcessoEmSaoPaulo(fatosDeAssinatura(...)) e um segundo produtor abriria divergencia"
  - "O ramo de no-op (canceladoEm ja preenchido) vem ANTES da checagem de asaasSubscriptionId: um cliente que cancelou e teve o id limpo nao pode receber 409 ao reenviar"
  - "Nenhuma linha de auditoria em cancelar, e nenhum valor novo de CausaTransicaoAcesso: com acessoAte no futuro o status derivado nao muda (D-06), logo nao ha transicao a registrar"

patterns-established:
  - "Prova de nao-vacuidade por mutacao: reverter temporariamente a regra, rodar a suite, registrar quais casos falharam e reverter por `git checkout -- <arquivo>`"
  - "Assercao de contrato negativo emparelhada com a positiva no mesmo teste (`expect(objetoDoGateway).toHaveProperty('status')` + `expect(nossoRetorno).not.toHaveProperty('status')`), que documenta que o campo EXISTE la e foi omitido de proposito aqui"

requirements-completed: []

# Metrics
duration: 9min
completed: 2026-09-02
---

# Phase 7 Plan 04: Os Tres Metodos do assinaturaService Summary

**`fatosDeAssinatura` (leitura local sem gateway), `consultarAssinatura` (leitura viva que degrada para `origem: "indisponivel"` em vez de derrubar a pagina) e `cancelar` (Asaas primeiro, banco depois, com o 404 tratado como ja-cancelada) — mais a limpeza de `canceladoEm` em `criarCheckout` que fecha o Pitfall 6. 21 testes novos, 5 provas de nao-vacuidade por mutacao, zero regressao nos 1072 existentes.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-02T18:28:40Z
- **Completed:** 2026-09-02T18:37:44Z
- **Tasks:** 2 (Task 1 em TDD RED->GREEN, 3 commits)
- **Files modified:** 2

## Accomplishments

- **A ordem gateway -> banco virou invariante executavel, nao convencao.** `cancelar` chama `asaasClient.removerAssinatura` na linha 306 e `prisma.empresa.update` na linha 343, com o bloco `─── FRONTEIRA D-04 ───` entre as duas. A prova nao e o comentario: e o caso "D-04: quando o Asaas rejeita o cancelamento, NENHUMA linha e gravada no nosso banco", que afirma `empresa.update`, `empresa.updateMany`, `auditoriaAcesso.create` e `$transaction` todos `not.toHaveBeenCalled()`. Uma implementacao que gravasse `canceladoEm` antes da chamada passaria em todos os outros 32 testes e falharia so nesse — e o estado que ela produziria e o pior desta fase: a UI diz "cancelado" e o cartao continua sendo cobrado ate virar chargeback.

- **O 404 do gateway deixou de ser um beco sem saida.** `DELETE /v3/subscriptions/{id}` nao e idempotente: a segunda chamada devolve 404. Sem tratamento, um duplo-clique deixa a cobranca parada no Asaas e o sistema achando que o cliente continua assinante. `cancelar` inspeciona `erro instanceof AsaasApiError && erro.status === 404` e SEGUE para a gravacao local. Ler esse 404 como "ja nao existe la" e seguro por construcao, e nao por confianca: a doc do Asaas usa o mesmo 404 para "nao existe" e para "nao pertence a conta autenticada", mas o segundo caso e impossivel aqui porque o id **nunca veio do cliente** (D-05) — foi lido da propria Empresa da sessao, no `findFirst` da linha 280.

- **`StatusAssinatura` fecha BILL-01 no nivel de tipo, nao de disciplina.** O exemplo da pesquisa (§ Code Examples #2) declarava `status: string | null` no contrato. Este plano o removeu de proposito: `ACTIVE`/`EXPIRED`/`INACTIVE` e vocabulario de fornecedor que o usuario nao sabe interpretar, e exibi-lo criaria uma segunda autoridade de status ao lado de `avaliarAcesso`. Sem o campo no tipo, **nao existe caminho de compilacao** para ele chegar a tela — o gate deixou de depender de alguem lembrar da regra em code review. O teste emparelha as duas asserções (`expect(assinaturaDoAsaas).toHaveProperty("status")` e `expect(ok).not.toHaveProperty("status")`) para deixar registrado que o campo existe do lado de la e foi omitido deliberadamente do lado de ca.

- **O Pitfall 6 saiu de "bug latente" para "regra com par de testes".** Hoje nenhum caminho do sistema limpava `canceladoEm` — `aplicarPagamentoConfirmado` so estende `acessoAte`, e o worker nunca escreve nesse campo. D-09 mascara o efeito enquanto o acesso pago estiver vigente, entao o bug so apareceria meses depois: o cliente reincidente para de pagar, a auditoria o rotula `CANCELADO` em vez de `BLOQUEADO`, e a tela mostra "cancelada" para quem e assinante ativo. `criarCheckout` agora limpa o campo **depois** da fronteira D-07, com guarda `!== null` (para nao gravar a cada checkout de quem nunca cancelou) e com um terceiro teste afirmando que a falha do gateway tambem nao dispara essa escrita.

- **`FatosDeAssinatura extends FatosDeAcesso` — heranca, nao copia.** Redeclarar os 4 campos daria o mesmo tipo hoje e um segundo lugar para esquecer um campo amanha. Estendendo, o objeto devolvido por `fatosDeAssinatura` e aceito **diretamente** por `acessoEfetivoAte` e `ultimoDiaDeAcessoEmSaoPaulo` (plano 07-01), sem remontagem — que e exatamente o que a pagina 07-05 vai fazer.

## Task Commits

| # | Task | Gate | Commit |
|---|------|------|--------|
| 1 | fatosDeAssinatura, consultarAssinatura e cancelar | RED (`test`) | `b287e33` |
| 1 | idem | GREEN (`feat`) | `de018a3` |
| 2 | testes de projecao, contrato e log | `test` | `428cd81` |

Task 1 nao precisou de REFACTOR.

### TDD Gate Compliance

| Task | RED (`test`) | GREEN (`feat`) | RED falhou antes do GREEN? |
|------|--------------|----------------|----------------------------|
| 1 | `b287e33` | `de018a3` | Sim — 13 de 26 casos falhando (`assinaturaService.cancelar is not a function`, etc.) |

Nenhum teste da Task 1 passou inesperadamente na fase RED, com **duas excecoes conhecidas e esperadas**, ambas de assercao negativa:

- `"nao emite nenhum empresa.update quando canceladoEm ja e nulo"`
- `"nao limpa canceladoEm quando o gateway rejeita"`

Passaram na fase RED porque `criarCheckout` nao escrevia nada em `Empresa` naquele momento — sao os pares NEGATIVOS. A nao-vacuidade delas e garantida pelo par POSITIVO (`"limpa canceladoEm depois do 2xx do gateway"`), que falhou na RED e passou na GREEN: se a implementacao gravasse sempre, o par negativo quebraria; se nunca gravasse, o positivo quebraria. So a guarda `!== null` satisfaz os dois.

## Files Created/Modified

- `app/services/assinatura.service.ts` (122 → 359 linhas) — `+EMPRESA_ASSINATURA_SELECT`, `+FatosDeAssinatura`, `+StatusAssinatura`, `+fatosDeAssinatura`, `+consultarAssinatura`, `+cancelar`; `EMPRESA_CHECKOUT_SELECT` ganhou `canceladoEm: true` e `criarCheckout` ganhou o bloco de reativacao depois da fronteira D-07. Nenhuma linha existente de `criarCheckout` foi alterada alem disso.
- `app/services/assinatura.service.test.ts` (247 → 626 linhas) — 21 casos novos em 4 `describe` (`criarCheckout — reativacao`, `fatosDeAssinatura`, `consultarAssinatura`, `cancelar`); o `vi.mock` do client ganhou `removerAssinatura` e `buscarAssinatura` mantendo `...original`; o fixture `empresaSelecionada` ganhou `canceladoEm: null`.

## Decisions Made

- **`cancelar` devolve `Promise<void>`, e nao `{ acessoAte }` como no exemplo da pesquisa.** A pagina ja obtem a data de exibicao por `ultimoDiaDeAcessoEmSaoPaulo(await fatosDeAssinatura(...))`, que e o produtor unico dessa string desde o plano 07-01. Devolver `acessoAte` cru aqui criaria um segundo caminho para a mesma informacao — e o caminho cru e justamente o que o JSDoc de `ultimoDiaDeAcessoEmSaoPaulo` proibe (limite superior EXCLUSIVO, formatado sem `timeZone`).
- **O no-op de "ja cancelada" vem ANTES da checagem de `asaasSubscriptionId`** (ordem prescrita pelo plano, item 5b antes de 5c). A consequencia pratica importa: um cliente que ja cancelou e cujo `asaasSubscriptionId` tenha sido limpo por qualquer caminho futuro recebe `void` (idempotente) em vez de um 409 confuso ao reenviar.
- **Nenhuma linha de auditoria em `cancelar`, e nenhuma migration.** Com `acessoAte` ainda no futuro, `avaliarAcesso` continua devolvendo `EM_DIA` (D-06) — nao ha transicao de status a registrar, e inventar uma criaria evento de auditoria sem contrapartida no estado. A transicao para `CANCELADO` acontece quando o periodo expira, e quem a registra ja existe (`revalidarConta` com `AVALIACAO_SESSAO`, ou o worker com `WORKER_DIARIO`). Consequencia verificada: `git status --porcelain prisma/` vazio, nenhum valor novo de `CausaTransicaoAcesso`.
- **`fatosDeAssinatura` monta o retorno campo a campo**, em vez de um rest spread sobre `id`. O spread devolveria automaticamente qualquer campo novo que entrasse na projecao; a listagem explicita faz o compilador reclamar primeiro.

## Deviations from Plan

Nenhuma regra de desvio (1-4) foi acionada. Uma consequencia obrigatoria do proprio plano precisou de ajuste num teste existente:

**[Consequencia do item 6 do plano] Assercao exata de `select` em `criarCheckout` atualizada**
- **Encontrado em:** Task 1 (fase RED)
- **Situacao:** o item 6 manda acrescentar `canceladoEm: true` a `EMPRESA_CHECKOUT_SELECT`. O caso existente `"C-07: a leitura da Empresa filtra deletedAt e usa select explicito"` afirma o objeto de `select` por igualdade EXATA (nao `objectContaining`), entao passou a falhar por construcao.
- **Acao:** acrescentado `canceladoEm: true` a assercao, com comentario explicando por que o campo esta la. O caso continua intacto — mesma intencao, mesma assercao `not.toHaveProperty("include")`, mesmo nome. Nenhum caso existente foi removido ou enfraquecido.
- **Arquivo:** `app/services/assinatura.service.test.ts`
- **Commit:** `b287e33`

Duas observacoes de escopo, ambas **fora** do escopo deste plano e deliberadamente nao corrigidas (identicas as ja registradas em `07-01-SUMMARY.md`):

1. **`npx tsc --noEmit` falhava com `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`** na primeira execucao no worktree. Nao e regressao: `LayoutProps` e tipo global gerado pelo Next.js 16 em `.next/types`, e o worktree nunca rodou `next dev`/`next build`. Resolvido com `npx next typegen` (gera apenas artefatos em `.next/`, gitignored — nenhum arquivo de codigo tocado). Depois disso `tsc --noEmit` sai 0.
2. **`npm run lint` reporta 2 warnings pre-existentes** (`Link` nao usado em `app/registro/page.tsx`; `fatosDeTrial` nao usado em `app/services/reconciliacao.service.test.ts`), ambos em arquivos que este plano nao toca. Lint sai 0. Nao corrigidos por SCOPE BOUNDARY.

## Issues Encountered

None.

## Prova de nao-vacuidade (mutacao temporaria)

Os 7 casos da Task 2 foram escritos DEPOIS da implementacao e passaram de primeira. Conforme exigido pelo `<action>` da Task 2, cada regra correspondente foi revertida temporariamente para verificar que o teste de fato a captura. Todas as mutacoes foram desfeitas com `git checkout -- app/services/assinatura.service.ts` e a suite voltou a 33/33 antes do commit.

| # | Mutacao aplicada | Casos que falharam | Resultado |
|---|------------------|--------------------|-----------|
| 1 | `consultarAssinatura` passa a devolver `status: assinatura.status` | `BILL-01: nunca expoe o status do Asaas` + `com o gateway respondendo, devolve origem asaas...` | 2 failed / 31 passed |
| 2 | `fatosDeAssinatura` troca `select` por `include: { usuarios: true }` | `C-07: usa select explicito com os 6 campos...` | 1 failed / 32 passed |
| 3 | log de `cancelar` passa a incluir `erro.message` | `C-05: o log da falha traz [asaas], o empresaId e o status` | 1 failed / 32 passed |
| 4 | `console.error` movido para FORA do ramo de nao-404 | `C-05: o 404 engolido nao vira log de erro` (+2 colaterais) | 4 failed / 29 passed |
| 5 | escrita de `cancelar` ganha `acessoAte: new Date()` | `D-06: nao encurta o acesso ja pago` (+2 colaterais) | 4 failed / 29 passed |

Nenhum caso da Task 2 e vacuo.

## Verification

| Gate | Resultado |
|------|-----------|
| `npx vitest run app/services/assinatura.service.test.ts` | **33 passed** (12 pre-existentes + 21 novos) |
| `npm test` | **1093 passed** (96 files) — baseline do worktree era 1072, +21 novos, zero regressao |
| `npx tsc --noEmit` | exit 0 (apos `npx next typegen`) |
| `npm run lint` | exit 0 (2 warnings pre-existentes) |
| `git status --porcelain prisma/` | vazio — nenhuma migration |
| `git diff package.json` | vazio — T-07-SC honrado |

### Acceptance criteria por task

**Task 1:**
- `assinatura.service.ts` contem `EMPRESA_ASSINATURA_SELECT` (48), `FatosDeAssinatura` (69), `StatusAssinatura` (86), `async fatosDeAssinatura(` (211), `async consultarAssinatura(` (249) e `async cancelar(` (279) — 6/6
- `StatusAssinatura` declara exatamente `origem`, `proximaCobranca` e `ciclo`; nenhum campo `status` (provado tambem por mutacao #1)
- Em `cancelar`, `asaasClient.removerAssinatura` esta na linha **306** e o primeiro `prisma.empresa.update` que escreve esta na linha **343** — a escrita vem DEPOIS
- `grep -c 'FRONTEIRA' app/services/assinatura.service.ts` = **2** (D-07 em `criarCheckout`, D-04 em `cancelar`)
- `grep -v '^\s*[*/]' app/services/assinatura.service.ts | grep -c 'empresaService'` = **0**
- `grep -v '^\s*[*/]' app/services/assinatura.service.ts | grep -c 'findUnique'` = **0**
- `grep -c 'canceladoEm' app/services/empresa.service.ts` = **5**, identico ao valor antes do plano — o allowlist positivo continua intacto
- `git status --porcelain prisma/` vazio
- `npx tsc --noEmit` sai 0 e `npm run lint` sai 0
- `min_lines: 200` do must-have: arquivo com **359** linhas, contendo `removerAssinatura`

**Task 2:**
- `npx vitest run` sai 0 com todos os 12 casos anteriores ainda passando
- `expect(prismaMock.empresa.update).not.toHaveBeenCalled()` no cenario de falha do gateway em `cancelar`: presente
- `removerAssinatura` rejeitando com `AsaasApiError` 404 + `empresa.update` chamado uma vez: presente
- `not.toHaveProperty("status")` sobre o retorno de `consultarAssinatura`: presente (nos dois caminhos)
- `not.toHaveProperty("include")` sobre o argumento de `empresa.findFirst`: presente (em `fatosDeAssinatura` e em `cancelar`)
- Par limpar/nao-limpar `canceladoEm` em `criarCheckout`: presente (mais um terceiro caso de falha de gateway)
- O `vi.mock` do client continua usando `importOriginal` e espalhando `...original`
- `npm test` sai 0

### Success criteria do plano

1. ✅ `cancelar` chama o Asaas antes de qualquer escrita, e uma falha nao-404 deixa o banco intocado — provado por assercao de ausencia (4 mocks) e reforcado pela mutacao #4
2. ✅ Um 404 do gateway resulta em `canceladoEm` gravado, nao em erro para o usuario
3. ✅ `consultarAssinatura` degrada para `origem: "indisponivel"` sem lancar, e nunca expoe o enum do fornecedor
4. ✅ `criarCheckout` limpa `canceladoEm`, fechando o Pitfall 6
5. ✅ Nenhuma migration, nenhum valor novo de enum, nenhuma alteracao em `avaliar-acesso.ts`, `session.ts`, `auth-guard.ts`, `webhook-asaas.service.ts` ou `eventos.ts` — `git status` mostra exatamente 2 arquivos modificados

### Threat register

| Threat ID | Estado |
|-----------|--------|
| T-07-17 | Aplicado — bloco `FRONTEIRA D-04` + assercao de ausencia; ordem verificada por numero de linha (306 < 343) |
| T-07-18 | Aplicado — `prisma.empresa.update` dedicado; `grep -c 'empresaService'` = 0 fora de comentarios; allowlist de `empresa.service.ts` inalterado |
| T-07-19 | Aplicado — padrao C-05 nos dois logs novos, com corpo sensivel plantado e `not.toContain` (mutacao #3 confirma) |
| T-07-20 | Aplicado — `EMPRESA_ASSINATURA_SELECT` explicito; `not.toHaveProperty("include")` nos dois metodos (mutacao #2 confirma) |
| T-07-21 | Aplicado — `StatusAssinatura` nao declara `status`; teste nos dois caminhos (mutacao #1 confirma) |
| T-07-22 | Aplicado — ramo de `AsaasApiError.status === 404` seguindo para a gravacao, mais o ramo de no-op quando `canceladoEm` ja esta preenchido |
| T-07-23 | Aplicado — `HttpError` 502 sem escrita para qualquer status diferente de 404 |
| T-07-24 | Aplicado — `findFirst({ where: { id, deletedAt: null } })` nos dois metodos; `grep -c 'findUnique'` = 0 |
| T-07-25 | Aplicado — `criarCheckout` limpa `canceladoEm`, com o par de testes limpar/nao-limpar mais o caso de falha do gateway |
| T-07-SC | Honrado — `git diff package.json` vazio, nenhuma dependencia instalada |

## Known Stubs

None — os tres metodos sao implementacoes completas, com teste, e nenhum devolve valor placeholder. `origem: "indisponivel"` NAO e stub: e o estado explicito de degradacao exigido por D-02b, com caso de teste proprio.

## Threat Flags

Nenhuma superficie de seguranca nova alem da ja registrada no `<threat_model>` do plano. `cancelar` acrescenta uma saida de rede autenticada (ja coberta por T-07-17/22/23, e o timeout/redacao de log sao herdados de `chamar()`) e uma escrita local em campo de billing (T-07-18). Nenhum endpoint HTTP novo, nenhuma rota nova, nenhuma alteracao de schema.

## User Setup Required

None. A confirmacao contra o sandbox real do Asaas (premissa A3: cobrancas ja pagas permanecem apos o `DELETE`, preservando `acessoAte`) continua sendo o checkpoint do plano 07-08.

## Next Phase Readiness

Os planos de UI tem tudo de que precisam:

- **07-05 (page.tsx)** pode decidir os 4 estados de tela na ordem normativa da Pattern 3 chamando `fatosDeAssinatura(empresaId)` — que nao faz I/O de gateway — e so entao decidir se vale chamar `consultarAssinatura(fatos.asaasSubscriptionId)`. O objeto devolvido e aceito **diretamente** por `ultimoDiaDeAcessoEmSaoPaulo(fatos)`, sem remontagem.
- **07-06 (modal/Server Action)** pode chamar `assinaturaService.cancelar(session.empresaId)` sabendo que: nao lanca em duplo-submit, lanca `HttpError` 409 quando nao ha assinatura e `HttpError` 502 quando o gateway falha — as tres mensagens ja sao voltadas ao usuario final.
- **07-07 (gate estatico)** tem alvos concretos e ja verificados neste plano: `grep -c 'FRONTEIRA' app/services/assinatura.service.ts` = 2; `empresaService` e `findUnique` = 0 fora de comentarios; `canceladoEm` em `empresa.service.ts` = 5; ausencia de um campo `status` em `StatusAssinatura`.

**Pendencia de bookkeeping para o orquestrador:** SUB-01, SUB-02 e SUB-03 continuam `[ ]` em `REQUIREMENTS.md`. Este plano entrega a camada de servico completa, mas nenhum usuario ainda consegue ver o status nem clicar em cancelar — a capacidade visivel chega em 07-05/07-06. Mesma decisao registrada em `07-01-SUMMARY.md`.

## Self-Check: PASSED

- Arquivos afirmados existem: `app/services/assinatura.service.ts`, `app/services/assinatura.service.test.ts`, `.planning/phases/07-gest-o-de-assinatura/07-04-SUMMARY.md` — 3/3 FOUND
- Commits afirmados existem: `b287e33`, `de018a3`, `428cd81` — 3/3 FOUND
- Arvore de trabalho limpa apos as mutacoes de nao-vacuidade: `git status --short` vazio antes do commit da Task 2
- STATE.md e ROADMAP.md **nao** foram modificados (modo worktree; o orquestrador e o dono dessas escritas)

---
*Phase: 07-gest-o-de-assinatura*
*Completed: 2026-09-02*
