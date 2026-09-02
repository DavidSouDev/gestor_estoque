---
phase: 07-gest-o-de-assinatura
plan: 01
subsystem: payments
tags: [asaas, billing, timezone, intl, pure-functions, tdd, vitest]

# Dependency graph
requires:
  - phase: 02-decisao-de-acesso
    provides: "avaliarAcesso, FatosDeAcesso, meiaNoiteEmSaoPaulo — as regras D-03/D-05 e o relogio de parede de Sao Paulo que este plano compoe"
  - phase: 03-gateway-asaas
    provides: "lib/billing/asaas/client.ts (chamar(), access_token, timeout, AsaasApiError) e tipos.ts com a regra GTW-01/T-03-08"
provides:
  - "acessoEfetivoAte(fatos) — a data real de fim de acesso, max(trialFim, acessoAte), imune ao Pitfall 2"
  - "ultimoDiaDeAcessoEmSaoPaulo(fatos) — o ULTIMO DIA de acesso em dd/mm/aaaa, unico produtor dessa string"
  - "formatarDiaEmSaoPaulo(instante) — unica formatacao de dia com timeZone explicito"
  - "AsaasAssinaturaRemovida — resposta de DELETE /subscriptions/{id}, 2 campos"
  - "asaasClient.removerAssinatura(id) — o unico cancelamento de assinatura que existe"
affects: [07-02, 07-03, 07-04, 07-05, 07-06, 07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derivacao de data de exibicao como funcao pura em lib/, nunca em componente"
    - "Formatacao de dia sempre com timeZone: America/Sao_Paulo explicito"
    - "Metodo de gateway delega a chamar(); nenhum fetch novo fora do client"

key-files:
  created: []
  modified:
    - lib/fuso-sao-paulo.ts
    - lib/fuso-sao-paulo.test.ts
    - lib/avaliar-acesso.ts
    - lib/avaliar-acesso.test.ts
    - lib/billing/asaas/tipos.ts
    - lib/billing/asaas/client.ts
    - lib/billing/asaas/client.test.ts

key-decisions:
  - "acessoEfetivoAte existe como funcao separada em vez de reusar ResultadoAcesso.expiraEm: D-05 faz expiraEm devolver trialFim durante o trial e esconderia um mes ja pago (Pitfall 2)"
  - "formatarDiaEmSaoPaulo mora em lib/fuso-sao-paulo.ts, nao em lib/format.ts: formatDate nao passa timeZone de proposito e e consumida por dezenas de telas de catalogo/estoque"
  - "ultimoDiaDeAcessoEmSaoPaulo subtrai 1 milissegundo (nao um dia inteiro) do limite superior exclusivo: funciona mesmo se o limite nao for exatamente meia-noite e atravessa mudanca de offset"
  - "O 404 de DELETE /subscriptions/{id} e propagado como AsaasApiError, nao absorvido: o client so traduz HTTP; a decisao de que 404 significa 'ja estava cancelada' e do assinaturaService (plano 07-03)"
  - "SUB-01/SUB-02 NAO foram marcados completos em REQUIREMENTS.md — este plano entrega so a fundacao pura; a capacidade visivel ao usuario chega nos planos de UI"

patterns-established:
  - "Teste de fuso obrigatorio com instante cujo dia em Sao Paulo difere do dia em UTC (2026-10-01T02:00Z → 30/09/2026); um formatador sem timeZone passa nos outros casos e falha so nesse"
  - "Teste de contraste lado a lado: um mesmo conjunto de fatos afirma avaliarAcesso().expiraEm E acessoEfetivoAte(), deixando a diferenca documentada de forma executavel"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-09-02
---

# Phase 7 Plan 01: Fundacao de Datas e Cancelamento no Gateway Summary

**As duas derivacoes puras de data que a tela de assinatura vai consumir (`acessoEfetivoAte` = max(trialFim, acessoAte), `ultimoDiaDeAcessoEmSaoPaulo` = limite exclusivo − 1ms formatado no fuso de Sao Paulo) mais `asaasClient.removerAssinatura` (DELETE /subscriptions/{id}) — 27 testes novos, zero regressao nos 1019 existentes.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-09-02T18:13:01Z
- **Completed:** 2026-09-02T18:18:44Z
- **Tasks:** 2 (ambas TDD, 4 commits)
- **Files modified:** 7

## Accomplishments

- **`acessoEfetivoAte` neutraliza o Pitfall 2.** Uma empresa em TRIAL que ja pagou (`trialFim = 15/09`, `acessoAte = 01/10`) tem `avaliarAcesso().expiraEm === trialFim` por forca de D-05. A UI que lesse esse campo diria ao usuario que ele perdeu o mes que ja pagou. A funcao nova devolve o MAIOR dos dois, e um teste afirma os dois valores **lado a lado** para os mesmos fatos — a diferenca deixou de ser conhecimento tribal e virou assercao executavel.
- **`ultimoDiaDeAcessoEmSaoPaulo` fecha as duas metades do off-by-one.** `acessoAte` e um limite superior EXCLUSIVO: `2026-10-15T03:00:00.000Z` significa acesso ate o fim de **14/10**, nao "ativo ate 15/10". A funcao subtrai 1 ms e formata com `timeZone` explicito — teste afirma exatamente `"14/10/2026"`.
- **`formatarDiaEmSaoPaulo` isola o fuso sem tocar em `lib/format.ts`.** `formatDate` continua sem `timeZone` (dezenas de telas de catalogo/estoque dependem do comportamento atual). O caso `2026-10-01T02:00:00.000Z → "30/09/2026"` e a prova executavel de que o novo formatador nao herda o fuso do servidor.
- **`asaasClient.removerAssinatura` em 3 linhas, com o contrato do endpoint no JSDoc.** Delega a `chamar()`, entao herda `access_token`, o `AbortSignal.timeout(15_000)` e o truncamento de log em 500 chars sem poder contorna-los. O JSDoc registra a nao-idempotencia (404 na segunda chamada) e o efeito colateral que preserva `acessoAte` (cobrancas pagas permanecem).

## Task Commits

Cada task foi executada em TDD (RED → GREEN); nenhuma precisou de REFACTOR.

1. **Task 1: acessoEfetivoAte e ultimoDiaDeAcessoEmSaoPaulo** — `bf99c8d` (test, RED) → `b514c19` (feat, GREEN)
2. **Task 2: asaasClient.removerAssinatura** — `adc3032` (test, RED) → `0842319` (feat, GREEN)

**Plan metadata:** ver commit `docs(07-01)` que acompanha este SUMMARY.

### TDD Gate Compliance

Ambas as tasks cumpriram a sequencia de gates:

| Task | RED (`test`) | GREEN (`feat`) | RED falhou antes do GREEN? |
|------|--------------|----------------|----------------------------|
| 1 | `bf99c8d` | `b514c19` | Sim — 20 testes falhando (`formatarDiaEmSaoPaulo is not a function`) |
| 2 | `adc3032` | `0842319` | Sim — 7 testes falhando (`removerAssinatura` inexistente) |

Nenhum teste passou inesperadamente na fase RED.

## Files Created/Modified

- `lib/fuso-sao-paulo.ts` — `+formatarDiaEmSaoPaulo` e um segundo `Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, ... })`. Puramente aditivo: `meiaNoiteEmSaoPaulo`, `partes`, `paredeLocalComoUTC` e o `formatador` existente intocados.
- `lib/fuso-sao-paulo.test.ts` — 5 casos novos para `formatarDiaEmSaoPaulo`, incluindo a composicao com `meiaNoiteEmSaoPaulo` (limite − 1 ms).
- `lib/avaliar-acesso.ts` — `+acessoEfetivoAte` e `+ultimoDiaDeAcessoEmSaoPaulo`, ambas depois de `diasRestantesDeCarencia`; o import de `@/lib/fuso-sao-paulo` ganhou `formatarDiaEmSaoPaulo`. Nada mais mudou.
- `lib/avaliar-acesso.test.ts` — 15 casos novos em dois `describe`, incluindo o de contraste com `avaliarAcesso().expiraEm`.
- `lib/billing/asaas/tipos.ts` — `+AsaasAssinaturaRemovida` com exatamente `deleted: boolean` e `id: string`.
- `lib/billing/asaas/client.ts` — `+removerAssinatura` com JSDoc normativo de 3 fatos; import de tipo estendido.
- `lib/billing/asaas/client.test.ts` — 7 casos novos em `describe("removerAssinatura (D-04, SUB-02)")`.

## Decisions Made

- **Nao marcar SUB-01/SUB-02 como completos.** O plano lista os dois no frontmatter, mas entrega apenas a fundacao pura: nenhum usuario consegue ainda ver o status nem cancelar a assinatura. Marcar agora seria uma afirmacao falsa em `REQUIREMENTS.md` e ainda correria com os outros agentes da wave escrevendo o mesmo arquivo. Os requisitos devem ser fechados pelo plano de UI que entrega a capacidade visivel (07-05/07-06) ou pelo verificador da fase.
- **`removerAssinatura` propaga o 404 em vez de absorve-lo.** `lib/billing/asaas/client.ts` e declarado como tradutor de HTTP. Absorver o 404 aqui esconderia do `assinaturaService` a informacao de que a assinatura ja nao existia — que e exatamente o que ele precisa para nao mostrar erro num duplo-clique.
- **1 ms, nao 1 dia.** Subtrair `86_400_000` daria o mesmo resultado enquanto os limites forem sempre meia-noite, mas quebraria silenciosamente no dia em que um limite for gravado com hora diferente, e interage mal com dias de 23 h/25 h. `limite - 1ms` sempre cai dentro do ultimo dia de acesso.

## Deviations from Plan

None — plan executed exactly as written. Nenhuma regra de desvio (1-4) foi acionada.

Duas observacoes de escopo, ambas **fora** do escopo deste plano e deliberadamente nao corrigidas:

1. **`npx tsc --noEmit` falhava com `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`** na primeira execucao. Nao e regressao: `LayoutProps` e um tipo global gerado pelo Next.js 16 em `.next/types`, e o worktree nunca rodou `next dev`/`next build`. Resolvido rodando `npx next typegen` (gera apenas artefatos em `.next/`, que e gitignored — nenhum arquivo de codigo tocado). Depois disso `tsc --noEmit` sai 0.
2. **`npm run lint` reporta 2 warnings pre-existentes** (`Link` nao usado em `app/registro/page.tsx`; `fatosDeTrial` nao usado em `app/services/reconciliacao.service.test.ts`). Ambos em arquivos que este plano nao toca. Lint sai 0 (warnings, nao erros). Nao corrigidos por SCOPE BOUNDARY.

## Issues Encountered

None.

## Verification

| Gate | Resultado |
|------|-----------|
| `npx vitest run lib/fuso-sao-paulo.test.ts lib/avaliar-acesso.test.ts` | 84 passed (2 files) |
| `npx vitest run lib/billing/asaas/client.test.ts` | 18 passed |
| `npm test` | **1046 passed** (95 files) — baseline era 1019, +27 novos, zero regressao |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (2 warnings pre-existentes) |
| `git diff package.json` (vs. base `f205a3c`) | vazio — nenhum pacote instalado, T-07-SC honrado |

### Acceptance criteria por task

**Task 1:**
- `lib/fuso-sao-paulo.ts` contem `export function formatarDiaEmSaoPaulo` — linha 41
- `grep -c 'timeZone: FUSO' lib/fuso-sao-paulo.ts` = **2**
- `lib/avaliar-acesso.ts` contem `export function acessoEfetivoAte` (linha 216) e `export function ultimoDiaDeAcessoEmSaoPaulo` (linha 255)
- Teste de Pitfall 2 lado a lado: presente (`"Pitfall 2: empresa em TRIAL que já pagou — expiraEm é trialFim, acessoEfetivoAte é acessoAte"`)
- Teste de `"14/10/2026"` para `acessoAte = 2026-10-15T03:00:00.000Z`: presente
- `git diff lib/avaliar-acesso.ts`: a **unica** linha removida em todo o arquivo e o `import` (estendido com `formatarDiaEmSaoPaulo`). Nenhuma remocao ou alteracao dentro de `avaliarAcesso`, `BLOQUEIA`, `acessoBloqueado`, `podePublicarCatalogo` ou `diasRestantesDeCarencia`.

**Task 2:**
- `export interface AsaasAssinaturaRemovida` com apenas `deleted` e `id` — linha 62 de `tipos.ts`
- `async removerAssinatura(id: string)` (linha 186) e `method: "DELETE"` (linha 187) em `client.ts`
- `grep -c 'fetch(' lib/billing/asaas/client.ts` = **1** (segue so o `fetch` de `chamar()`)
- `grep -c 'INACTIVE' lib/billing/asaas/client.ts` = **0** (nenhum caminho de suspensao/pausa)
- Teste `chamada().init.body` `toBeUndefined()`: presente
- Teste de 404 → `AsaasApiError` com `status === 404`: presente

### Success criteria do plano

1. ✅ `acessoEfetivoAte` devolve `acessoAte` (nao `trialFim`) para empresa em TRIAL que ja pagou, com teste contrastando contra `avaliarAcesso().expiraEm`
2. ✅ `ultimoDiaDeAcessoEmSaoPaulo` devolve o ULTIMO DIA em `dd/mm/aaaa` com `timeZone` de Sao Paulo explicito
3. ✅ `removerAssinatura` emite `DELETE /subscriptions/{id}` sem corpo, com `access_token`, propagando 404 como `AsaasApiError`
4. ✅ Nada em `avaliarAcesso`, `acessoBloqueado`, `podePublicarCatalogo` ou `diasRestantesDeCarencia` foi alterado

### Threat register

Todas as disposicoes `mitigate` do `<threat_model>` foram aplicadas:

| Threat ID | Estado |
|-----------|--------|
| T-07-01 | Aplicado — `AsaasAssinaturaRemovida` tem exatamente 2 campos |
| T-07-02 | Aplicado — nenhum `fetch` novo; `grep -c 'fetch('` continua 1 |
| T-07-03 | Aplicado — timeout herdado de `chamar()`, com teste afirmando o `AbortSignal` |
| T-07-04 | Aplicado — produtor unico da string, com teste de `"14/10/2026"` e de dia SP ≠ dia UTC |
| T-07-05 | Aplicado — `git diff` sem alteracao nas funcoes existentes (evidenciado acima) |
| T-07-SC | Honrado — `git diff package.json` vazio |

## Known Stubs

None — todos os simbolos entregues sao implementacoes completas com teste.

## Threat Flags

Nenhuma superficie de seguranca nova alem da ja registrada no `<threat_model>` do plano. `removerAssinatura` e uma saida de rede autenticada ja coberta por T-07-02/T-07-03; as duas funcoes de data sao puras, sem I/O e sem leitura de env.

## User Setup Required

None — nenhuma configuracao de servico externo. A confirmacao contra o sandbox do Asaas (premissa A3: cobrancas pagas permanecem apos o DELETE) e o checkpoint do plano 07-08.

## Next Phase Readiness

Pronto para os planos de UI e de servico da fase:

- **07-03 (`assinaturaService.cancelar`)** ja pode chamar `asaasClient.removerAssinatura(id)` e tratar o `AsaasApiError` com `status === 404` como "ja estava cancelada".
- **07-05/07-06 (tela e modal)** ja podem consumir `ultimoDiaDeAcessoEmSaoPaulo(fatos)` diretamente. **A UI nunca deve formatar `acessoAte`/`trialFim` por conta propria** — nem via `formatDate`, nem com aritmetica inline; a UI-SPEC trata isso como warning sign e o gate estatico do 07-07 deve verificar.
- **07-07 (gate estatico)** tem alvos concretos: `grep -c 'timeZone: FUSO' lib/fuso-sao-paulo.ts` = 2, `grep -c 'fetch(' lib/billing/asaas/client.ts` = 1, ausencia de `formatDate(acessoAte)` e de `new Date()` em componentes da fase.

**Pendencia de bookkeeping para o orquestrador:** SUB-01 e SUB-02 continuam `[ ]` em `REQUIREMENTS.md` de proposito (ver Decisions Made). Devem ser fechados pelo plano que entregar a capacidade visivel ao usuario, nao por este.

---
*Phase: 07-gest-o-de-assinatura*
*Completed: 2026-09-02*
