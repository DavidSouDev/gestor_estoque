---
phase: 03-gateway-asaas-e-ingest-o-de-webhooks
plan: 05
subsystem: payments
tags: [asaas, webhook, ingestao, idempotencia, timing-safe, persist-then-ack, tdd]

status: COMPLETE
plan_complete: true

requires:
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    plan: 01
    provides: "model EventoWebhookAsaas com eventoId @unique, processadoEm, erro e tentativas"
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    plan: 03
    provides: "envelopeSchema nao-estrito, redigirEnvelope (allowlist) e fixtures de envelope"
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    provides: "avaliarAcesso (motor puro) e agendarPosResposta (trabalho pos-resposta)"
provides:
  - "POST /api/webhooks/asaas — primeiro endpoint de webhook do projeto, autenticado por token com comparacao resistente a tempo"
  - "webhookAsaasService — ledger append-only com deteccao de duplicata delegada ao Postgres"
  - "switch de despacho por evento: 8 ramos de observacao no-op de estado + 4 mutadores na fila de retrabalho"
  - "buildRequest com headers arbitrarios e rawBody (helper de teste)"
affects: [03-06, 03-07, 05-worker]

tech-stack:
  added: []
  patterns:
    - "Persist-then-ack: persistir no ledger ANTES do ack; processar depois da resposta via agendarPosResposta"
    - "Autenticidade de webhook por bearer estatico comparado com timingSafeEqual sobre hashes SHA-256"
    - "Idempotencia delegada a constraint unica do Postgres: P2002 como caminho feliz, nunca como erro"
    - "Contrato de resposta invertido: exatamente 200 em todo caminho autenticado, opaco e sem corpo"
    - "Evento nao processado NUNCA e marcado como concluido — fila de retrabalho WHERE processadoEm IS NULL"

key-files:
  created:
    - app/services/webhook-asaas.service.ts
    - app/services/webhook-asaas.service.test.ts
    - app/api/webhooks/asaas/route.ts
    - app/api/webhooks/asaas/route.test.ts
  modified:
    - tests/helpers/request.ts

key-decisions:
  - "Os 4 eventos mutadores (PAYMENT_CONFIRMED, PAYMENT_RECEIVED, SUBSCRIPTION_CREATED, CHECKOUT_PAID) chamam marcarErro e NUNCA marcarProcessado nesta wave: se a execucao parasse entre as waves, marcar como concluido seria a unica forma de perde-los"
  - "processar() nao propaga NENHUMA excecao, nem mesmo a falha de gravar o proprio erro (try/catch aninhado): ela roda depois do 200, dentro de agendarPosResposta, onde uma rejeicao nao teria para onde ir"
  - "A leitura do ledger em processar() tambem esta dentro do try/catch, nao so o switch — uma falha de conexao no findUnique rejeitaria a promise do mesmo jeito"
  - "registrarEvento recebe o envelope BRUTO do route handler, nao o resultado do safeParse: o schema estreita para {id,event} e descartaria payment/checkout/subscription, que sao exatamente o que redigirEnvelope precisa copiar"
  - "asaasWebhookToken() lancar por env ausente NAO e capturado no route: com o segredo nao configurado o endpoint esta quebrado, e um 500 (que faz o Asaas reenviar) e mais diagnostico que um 401 silencioso"
  - "buildRequest ganhou `headers` e `rawBody` como parametros OPCIONAIS aditivos, em vez de o teste montar Request cru: rawBody e o unico jeito de enviar corpo malformado (body: 'x' viraria '\"x\"', que e JSON valido)"
  - "A prosa dos comentarios do route.ts evita as sequencias literais proibidas pelos gates de grep (nome da funcao HMAC, header do Stripe, leitura do corpo como texto) — mesma convencao ja estabelecida em lib/billing/asaas/eventos.ts pelo plano 03-03"
  - "export const dynamic = 'force-dynamic' verificado como valido no Next 16.3.0: a doc bundled diz que ele so e removido quando Cache Components esta habilitado, e next.config.ts nao habilita"

patterns-established:
  - "Pattern: route handler de webhook devolve resposta unica e opaca em todos os caminhos de sucesso, para nao virar oraculo de enumeracao"
  - "Pattern: teste de persist-then-ack prova a relacao TEMPORAL (promise pendente + invocationCallOrder), nao apenas que ambos foram chamados"
  - "Pattern: lista de eventos duplicada no teste de proposito, para que mover um evento de grupo no service quebre o caso"

requirements-completed: [GTW-02]
requirements-partial:
  - "GTW-04: metade estrutural entregue (idempotencia por eventoId unico + no-op de estado dos 8 eventos de observacao). A metade de mutacao — escrita monotonica de acessoAte e re-fetch autoritativo — e do plano 03-06"

metrics:
  duration: 12min
  tasks: 2
  files: 5
  tests_added: 45
completed: 2026-08-31
---

# Phase 03 Plan 05: Ingestao de Webhooks do Asaas

**Primeiro endpoint de webhook do projeto: autenticidade por token em comparacao resistente a tempo, idempotencia decidida pelo Postgres, exatamente 200 em todo caminho autenticado, e processamento delegado para depois da resposta — com os oito eventos de observacao provados como no-op de estado por assercao de ausencia.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2/2 (ambas TDD, gates RED e GREEN separados)
- **Commits:** 4

## What Was Built

### Task 1 — `webhookAsaasService` (ledger, despacho, ramos de observacao)

`app/services/webhook-asaas.service.ts` (classe nao-exportada + singleton `const`, C-02):

| Metodo | Contrato |
|--------|----------|
| `registrarEvento(eventoId, evento, bruto)` | `Promise<"NOVO" \| "DUPLICADO">`; persiste `redigirEnvelope(bruto)`, traduz `P2002` em `"DUPLICADO"`, re-lanca qualquer outro erro |
| `marcarProcessado(eventoId, empresaId?)` | preenche `processadoEm`, limpa `erro`, grava `empresaId` so quando informado |
| `marcarErro(eventoId, mensagem)` | grava `erro` truncado em 500 chars e `tentativas: { increment: 1 }`; **nao** preenche `processadoEm` |
| `processar(eventoId)` | le o ledger, despacha por `switch`, nunca propaga excecao |

O docblock de topo (43 linhas) fixa as tres invariantes do arquivo: o Postgres decide o que e duplicado (um `findFirst` antes do insert perde a corrida entre entregas concorrentes), o payload persistido e sempre a versao redigida, e status de acesso e derivado por `avaliarAcesso` — jamais escrito.

O ramo de `PAYMENT_OVERDUE` carrega o comentario mais longo do arquivo, explicando que **nao escrever e o requisito, nao uma omissao**: `avaliarAcesso()` ja devolve `CARENCIA` assim que `agora >= acessoAte`, e `acessoAte` e por construcao a meia-noite de Sao Paulo do vencimento nao pago — a carencia de 10 dias comeca sozinha. Escrever ali seria redundante, perigoso (uma entrega atrasada encurtaria a carencia de quem ja pagou) e contrario a BILL-01/D-16.

### Task 2 — `POST /api/webhooks/asaas`

`app/api/webhooks/asaas/route.ts`, com `runtime = "nodejs"` e `dynamic = "force-dynamic"`.

Ordem obrigatoria do Pattern 2:

1. `tokenValido(request.headers.get("asaas-access-token"))` falso → `401` sem corpo.
2. `await request.json()` falha → log com prefixo + `200`.
3. `envelopeSchema.safeParse` falha → log sem o corpo + `200`.
4. `registrarEvento` → `"DUPLICADO"` → `200` sem agendar; throw → `500`.
5. `agendarPosResposta(() => webhookAsaasService.processar(id))`.
6. `200`.

`tokenValido` compara `createHash("sha256")` dos dois lados com `timingSafeEqual`. O hash resolve duas coisas: iguala o tamanho dos buffers (sem ele `timingSafeEqual` lancaria com um token de comprimento inesperado) e torna o proprio comprimento do segredo nao-observavel.

## Verification

| Gate | Resultado |
|------|-----------|
| `npx vitest run app/services/webhook-asaas.service.test.ts` | 28 casos, verde (minimo exigido: 14) |
| `npx vitest run app/api/webhooks/asaas/route.test.ts` | 17 casos, verde (minimo exigido: 11) |
| `npm run test` (suite completa) | 77 arquivos, 633 casos, verde |
| `npm run lint` | 0 erros (1 warning pre-existente em `app/registro/page.tsx`) |
| `grep -c timingSafeEqual` / `createHash` no route | 3 / 3 (>= 1) |
| `grep -cE '===\s*asaasWebhookToken\(\)\|asaasWebhookToken\(\)\s*==='` | 0 |
| `grep -cE 'createHmac\|ASAAS_WEBHOOK_SECRET\|constructEvent\|stripe-signature'` | 0 |
| `grep -c 'request.text()'` | 0 |
| `grep -vE '^\s*(//\|\*)' route.ts \| grep -cE 'status: (201\|202\|204\|302)'` | 0 |
| `grep -cE 'setTimeout\|void webhookAsaasService.processar\|\.then\('` no route | 0 |
| `grep -c 'export const runtime = "nodejs"'` / `dynamic` | 1 / 1 |
| Mutacao de `Empresa` no service nesta wave (grep sem comentarios) | 0 |

## Success Criteria

- [x] Header ausente/errado → 401 sem nenhum rastro no banco; header errado de comprimento diferente nao lanca
- [x] Header correto → exatamente 200 em todos os casos, incluindo malformado, desconhecido e duplicado
- [x] Persistencia acontece antes do 200 (provado por `invocationCallOrder` **e** por promise pendente)
- [x] Processamento delegado a `agendarPosResposta` e nunca await-ado no request
- [x] Mesma entrega duas vezes → 200 nas duas, uma unica execucao de processamento
- [x] `PAYMENT_OVERDUE` e os outros 7 eventos de observacao nao escrevem nenhum fato de billing
- [x] Os 4 eventos mutadores permanecem na fila `processadoEm IS NULL`

## Threat Register — dispositions realizadas

| Threat ID | Como ficou |
|-----------|-----------|
| T-03-21 | `timingSafeEqual` sobre hashes SHA-256; 401 sem corpo; gate de grep proibindo `===` com o token |
| T-03-22 | Hash iguala o comprimento; teste com header de tamanho diferente prova ausencia de excecao |
| T-03-23 | `accept` — controle compensatorio documentado no docblock de `tokenValido` (HTTPS + token estatico + ledger + monotonicidade + re-fetch do 03-06) |
| T-03-24 | `"DUPLICADO"` → 200 sem `agendarPosResposta`, provado por assercao de ausencia |
| T-03-25 | `OK()` unico; gates de grep de status; nenhum `await` externo antes do `return` |
| T-03-26 | `it.each` sobre os 8 eventos com tres assercoes de ausencia (`empresa.update`, `empresa.updateMany`, `$transaction`) |
| T-03-27 | Teste compara corpo e status dos 4 caminhos de sucesso: todos `""` e `200` |
| T-03-28 | Log so com prefixo, `eventoId` e `evento`; o corpo nunca entra no log |
| T-03-29 | `marcarErro` sem `processadoEm`, com assercao de ausencia sobre o `data` de todas as chamadas de `update` |
| T-03-30 | `transfer` — HTTPS na URL registrada e verificado no plano 03-07 |
| T-03-SC | Nenhum pacote instalado; `node:crypto` nativo |

## Deviations from Plan

Nenhuma. As duas tasks foram executadas como escritas.

Tres notas de execucao que nao sao desvios:

1. **Cast `as Prisma.InputJsonObject` no `payload`.** `redigirEnvelope` devolve `Record<string, unknown>`, que nao e atribuivel ao `InputJsonValue` do Prisma (`unknown` nao satisfaz a recursao do tipo). O cast e apenas de tipo — o valor em runtime e exatamente o objeto da allowlist, e a assercao exata do teste compara contra `redigirEnvelope(envelope)`.
2. **`try/catch` aninhado no `catch` de `processar`.** Se `marcarProcessado` falha e o `catch` chama `marcarErro`, que usa o mesmo `update` e tambem falha, a rejeicao escaparia. O guard interno e coberto por teste dedicado.
3. **A leitura do ledger ficou dentro do mesmo `try`** que envolve o `switch`, nao so o `switch`. Uma falha no `findUnique` rejeitaria a promise devolvida por `processar` do mesmo jeito.

## Known Stubs

Os quatro ramos de mutacao (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `SUBSCRIPTION_CREATED`, `CHECKOUT_PAID`) sao stubs **intencionais e declarados pelo plano**, marcados com `TODO(03-06)`:

| Stub | Arquivo | Motivo | Resolvido por |
|------|---------|--------|---------------|
| Grupo 2 do `switch` chama `marcarErro("handler de mutacao pendente — plano 03-06")` em vez de estender `acessoAte` | `app/services/webhook-asaas.service.ts` | Fronteira de wave declarada no `<objective>` do plano. O evento fica na fila `processadoEm IS NULL` de proposito, para nao ser perdido caso a execucao pare entre as waves | Plano 03-06 (wave 3) |

Nenhum stub silencioso: o comportamento e provado por `it.each` sobre os 4 eventos, que assere que `processadoEm` nunca aparece no `data` de nenhuma chamada de `update`.

## Threat Flags

Nenhuma superficie de seguranca fora do `<threat_model>` do plano foi introduzida.

## Notas de ambiente (fora de escopo, nao corrigido)

`npx tsc --noEmit` reporta um unico erro:

```
app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'.
```

`LayoutProps` e um helper **global gerado pelo Next** em `.next/types/**`, que o `tsconfig.json` inclui (linhas 29-30). O worktree deste agente nunca rodou `next dev`/`next build`, entao `.next/` nao existe e o tipo nao foi gerado. O erro:

- e pre-existente e ambiental — `app/layout.tsx` nao foi tocado por este plano (`git diff` da base lista apenas os 5 arquivos de `key-files`);
- desaparece assim que qualquer build ou `next dev` roda no diretorio;
- nao envolve nenhum arquivo deste plano: `npx tsc --noEmit | grep -c webhook-asaas` == 0.

Nao foi corrigido por respeito ao limite de escopo (so se auto-corrige o que a propria task quebrou).

## Self-Check: PASSED

Arquivos verificados no disco:

- FOUND: `app/services/webhook-asaas.service.ts`
- FOUND: `app/services/webhook-asaas.service.test.ts`
- FOUND: `app/api/webhooks/asaas/route.ts`
- FOUND: `app/api/webhooks/asaas/route.test.ts`
- FOUND: `tests/helpers/request.ts`

Commits verificados em `git log`:

- FOUND: `1b6f6c8` — test(03-05): add failing tests for webhookAsaasService (RED, task 1)
- FOUND: `4fd9fd2` — feat(03-05): implement webhookAsaasService ledger and event dispatch (GREEN, task 1)
- FOUND: `8f55922` — test(03-05): add failing tests for the Asaas webhook route handler (RED, task 2)
- FOUND: `b3bc1e5` — feat(03-05): implement Asaas webhook route with timing-safe token check (GREEN, task 2)

## TDD Gate Compliance

Ambas as tasks seguiram RED → GREEN com commits separados. Nenhum teste passou inesperadamente na fase RED: as duas suites falharam por modulo inexistente antes da implementacao. Nenhum REFACTOR foi necessario.

## For the Next Plan (03-06)

Ponto de extensao ja preparado:

- O `switch` de `processar` — substituir o corpo do **Grupo 2** pela resolucao de tenant (Pattern 5), re-fetch de `GET /v3/payments/{id}` e `updateMany` monotonico (Pattern 3), terminando em `marcarProcessado(eventoId, empresaId)`.
- `payload` ja vem no `select` de `processar` — o insumo dos handlers de mutacao esta disponivel sem alterar a leitura.
- `marcarProcessado(eventoId, empresaId)` ja aceita o `empresaId` resolvido.
- A fila de eventos deixados por esta wave e exatamente `WHERE processadoEm IS NULL AND erro LIKE '%03-06%'`.
