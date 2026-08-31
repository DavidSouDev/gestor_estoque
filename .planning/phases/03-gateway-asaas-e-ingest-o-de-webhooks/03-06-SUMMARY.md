---
phase: 03-gateway-asaas-e-ingest-o-de-webhooks
plan: 06
subsystem: payments
tags: [asaas, webhook, idor, monotonicidade, idempotencia, auditoria, tdd]

status: COMPLETE
plan_complete: true

requires:
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    plan: 01
    provides: "Empresa.asaasSubscriptionId @unique / asaasCustomerId, CheckoutAsaas, CausaTransicaoAcesso.WEBHOOK_PAGAMENTO"
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    plan: 02
    provides: "asaasClient.buscarPagamento e acessoAteAposPagamento (funcao pura do dueDate)"
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    plan: 03
    provides: "pagamentoSchema / checkoutSchema / assinaturaSchema nao-estritos e EVENTOS_ASSINADOS"
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    plan: 05
    provides: "webhookAsaasService (ledger, despacho, marcarProcessado/marcarErro) e a rota de webhook"
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    provides: "avaliarAcesso (motor puro) e acessoService.registrarTransicao (compare-and-swap)"
provides:
  - "resolverEmpresaId — traducao de evento em empresaId EXCLUSIVAMENTE pelo mapa local"
  - "capturarAssinatura / capturarCheckoutPago — captura dos identificadores externos do Asaas"
  - "aplicarPagamentoConfirmado — re-fetch autoritativo + escrita monotonica de acessoAte + auditoria"
  - "switch de despacho COMPLETO: os 12 eventos assinados mais o desconhecido, todos com terminacao garantida"
affects: [03-07, 04-bloqueio, 05-worker]

tech-stack:
  added: []
  patterns:
    - "Resolucao de tenant por mapa local: identificador do payload nunca autoriza (C-08 / ASVS V4)"
    - "Re-fetch autoritativo como controle compensatorio da ausencia de assinatura de payload"
    - "Guarda de monotonicidade no WHERE do updateMany, decisao por count === 0 — sem if, sem lock, sem coluna de versao"
    - "acessoAte como funcao PURA do dueDate: reentrega produz o mesmo instante, logo vira no-op"
    - "Status de acesso derivado por avaliarAcesso e auditado pelo CAS da Fase 2, nunca escrito como literal"
    - "Invariante de terminacao: todo caminho de processar acaba em processadoEm OU erro"

key-files:
  created: []
  modified:
    - app/services/webhook-asaas.service.ts
    - app/services/webhook-asaas.service.test.ts
    - .planning/phases/03-gateway-asaas-e-ingest-o-de-webhooks/03-VALIDATION.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Os tres handlers recebem o sub-objeto do payload como `unknown`, nao como o tipo do dominio: o plano previa validacao por safeParse DENTRO do metodo, e tipar o parametro como AsaasPayment/AsaasSubscription afirmaria a forma antes de valida-la. O objeto com forma garantida em aplicarPagamentoConfirmado e `autoritativo`, que veio da API"
  - "PAYMENT_CONFIRMED e PAYMENT_RECEIVED compartilham handler: a guarda de status roda sobre a resposta AUTORITATIVA, nao sobre o nome do evento, e a escrita monotonica torna o segundo (do mesmo vencimento) um no-op"
  - "STATUS_QUE_CONCEDEM_ACESSO e `readonly string[]`, nao tupla de literais: o vocabulario de status e de terceiro e a comparacao precisa aceitar qualquer string sem erro de tipo"
  - "capturarCheckoutPago resolve por checkoutId ANTES de customer, entao a segunda consulta nunca roda no caminho feliz — e o mapa gravado por nos na criacao do checkout tem prioridade sobre o id de cliente do payload"
  - "count === 0 chama marcarProcessado, nao marcarErro: o evento foi TRATADO corretamente, so nao havia o que mudar. Deixa-lo na fila faria o worker da Fase 5 retenta-lo para sempre"
  - "A leitura dos fatos acontece ANTES do updateMany porque `anterior` da auditoria precisa ser o ultimoStatusAuditado observado antes da escrita; o CAS de registrarTransicao resolve a corrida que essa janela abre"
  - "O cliente do Asaas e mockado por MODULO (vi.mock com importOriginal) e nao por spy: os testes precisam provar ordem de invocacao e comportamento sob rejeicao sem nunca tocar a rede, preservando AsaasApiError real"

patterns-established:
  - "Pattern: cross-check que loga divergencia e mantem o mapa local como autoridade — nunca deixa o valor externo vencer"
  - "Pattern: teste de nao-vacuidade por mutacao — a guarda `lt` foi trocada por `gt` e 4 casos quebraram, provando que as assercoes exatas medem a invariante"
  - "Pattern: matriz it.each sobre a lista canonica de eventos importada do modulo, verificando a invariante de terminacao em vez do efeito de cada ramo"

requirements-completed: [GTW-03, GTW-04]

metrics:
  duration: 18min
  tasks: 3
  files: 4
  tests_added: 38
completed: 2026-08-31
---

# Phase 03 Plan 06: Dinheiro Vira Acesso — Resolução de Tenant, Escrita Monotônica e Auditoria

**Os quatro ramos mutadores que o plano 03-05 deixou na fila de retrabalho agora existem: a empresa afetada vem sempre do mapa local, o pagamento é reconferido na API do Asaas antes de qualquer escrita, e `acessoAte` cresce — nunca encolhe — a partir do vencimento autoritativo, com a transição auditada pelo compare-and-swap da Fase 2.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 3/3 (Tasks 1 e 2 em TDD com gates RED e GREEN separados; Task 3 é task de prova/fechamento)
- **Commits:** 5

## What Was Built

### Task 1 — `resolverEmpresaId` e captura dos identificadores externos

| Símbolo | Contrato |
|---------|----------|
| `resolverEmpresaId(dados)` | `({subscription?, checkoutId?, customer?, externalReference?}) => Promise<string \| null>` |
| `capturarAssinatura(eventoId, subscription)` | `(string, unknown) => Promise<void>` — ramo de `SUBSCRIPTION_CREATED` |
| `capturarCheckoutPago(eventoId, checkout)` | `(string, unknown) => Promise<void>` — ramo de `CHECKOUT_PAID` |

A ordem de resolução é do identificador mais específico para o mais genérico, e **toda etapa consulta uma coluna que nós gravamos**: `Empresa.asaasSubscriptionId` (`@unique`) → `CheckoutAsaas.asaasCheckoutId` (`@unique`) → `Empresa.asaasCustomerId`. A referência externa nunca entra numa cláusula de filtro: quando o mapa local já resolveu e os dois divergem, um `console.error` registra o par e **o mapa local prevalece**; quando o mapa não resolve, o método devolve `null` e o evento fica na fila de retrabalho. Aceitá-la como fonte seria IDOR direto — quem forjasse um webhook escolheria a empresa alvo escrevendo o id dela no corpo.

`capturarAssinatura` é o único ponto do sistema que aprende o id `sub_…` (Pitfall 8): o evento de checkout pago traz apenas a configuração da recorrência, nunca o id da assinatura criada. A escrita usa `prisma.empresa.update` dedicado — o allowlist de campos do service de Empresa (D-02-02) proíbe campos de billing por design, e contorná-lo por mass assignment é exatamente o que T-03-35 previne.

### Task 2 — `aplicarPagamentoConfirmado` (GTW-03)

Sequência obrigatória, nesta ordem:

1. `pagamentoSchema.safeParse` — payload inválido não chega a falar com o gateway.
2. **Re-fetch autoritativo** `asaasClient.buscarPagamento(id)`. `AsaasApiError` → `marcarErro`, sem escrita e sem propagar.
3. **Guarda de status** sobre a resposta: só `CONFIRMED`, `RECEIVED` e `RECEIVED_IN_CASH`.
4. `resolverEmpresaId` sobre os identificadores **do objeto autoritativo**.
5. Leitura dos fatos com `select` explícito dos 4 fatos de billing + `ultimoStatusAuditado` (C-07).
6. `acessoAteAposPagamento(autoritativo.dueDate)` — puro, nunca do relógio.
7. `updateMany` com `OR: [{acessoAte: null}, {acessoAte: {lt: novoAcessoAte}}]`.
8. `count === 0` → `marcarProcessado` e sai. `count === 1` → `avaliarAcesso` deriva o status novo e `acessoService.registrarTransicao` audita com causa `WEBHOOK_PAGAMENTO`.

O comentário do passo 6 registra por que a guarda mora no `WHERE`: um `if` em memória lê, decide e escreve em três momentos distintos, e entre a leitura e a escrita o worker diário da Fase 5 pode ter movido `acessoAte` — a decisão nasce velha. No `WHERE`, o Postgres avalia e aplica no mesmo comando.

### Task 3 — Fechamento do despacho e prova de GTW-04

O `switch` cobre os 12 eventos de `EVENTOS_ASSINADOS` com ramo explícito mais o `default`, e o marcador provisório do plano 03-05 não existe mais. A **invariante de terminação** — todo caminho acaba em `processadoEm` ou em `erro`, nunca em nenhum dos dois — subiu para o docblock do arquivo e é verificada por `it.each` sobre 13 entradas.

`03-VALIDATION.md` foi ressincronizado: IDs reais de task no lugar dos placeholders, todas as linhas verdes, `nyquist_compliant: true`, e a única linha manual (`03-H1`, o checkpoint de sandbox do plano 03-07) explicitamente marcada como tal.

## Verification

| Gate | Exigido | Resultado |
|------|---------|-----------|
| `npx vitest run app/services/webhook-asaas.service.test.ts` | ≥ 42 casos | **84 casos, verde** |
| `npm run test` (suite completa) | verde | 79 arquivos, 707 casos, verde |
| `npm run lint` | verde | 0 erros (1 warning pré-existente em `app/registro/page.tsx`) |
| `npx tsc --noEmit` | sai 0 | **0** |
| `grep -cE 'where:.*externalReference\|externalReference:.*where'` | 0 | 0 |
| `grep -cE 'checkout\.subscription\.id\|subscription\?\.id.*checkout'` | 0 | 0 |
| `grep -c 'empresaService'` | 0 | 0 |
| `grep -cE 'auditoriaAcesso\.create'` | 0 | 0 |
| `grep -c 'CausaTransicaoAcesso.WEBHOOK_PAGAMENTO'` | ≥ 1 | 1 |
| literal de status fora de comentário | 0 | 0 |
| `grep -cE 'handler de mutacao pendente\|TODO\(03-06\)'` | 0 | 0 |
| `new Date()` no arquivo | só em `marcarProcessado` e no `agora` de `avaliarAcesso` | 2 ocorrências, ambas conformes |
| `03-VALIDATION.md` | `nyquist_compliant: true` | ✅, nenhuma linha pendente fora da manual |

### Não-vacuidade provada por mutação

A guarda `{ lt: novoAcessoAte }` foi temporariamente trocada por `{ gt: … }` e **4 casos quebraram**, incluindo o cenário completo de fora-de-ordem. A alteração foi revertida e a suíte voltou a 84 verdes — as asserções exatas medem a invariante, não a forma do código.

## Success Criteria

- [x] Pagamento confirmado estende `acessoAte` em um ciclo mensal derivado de `dueDate` e encerra a carência por derivação, sem coluna de carência
- [x] A empresa afetada é sempre resolvida pelo mapa local; a referência externa sozinha nunca resolve (teste citando C-08)
- [x] Evento antigo reentregue produz `count === 0`: sem escrita, sem auditoria, empresa em dia permanece em dia
- [x] A mesma confirmação entregue duas vezes produz o mesmo `acessoAte` (dois relógios congelados)
- [x] Toda transição aplicada gera auditoria com causa `WEBHOOK_PAGAMENTO` via o CAS da Fase 2
- [x] Nenhum dos 12 eventos assinados fica sem handler; todo caminho termina com `processadoEm` ou `erro`

## Threat Register — dispositions realizadas

| Threat ID | Como ficou |
|-----------|-----------|
| T-03-31 | Resolução exclusiva por colunas gravadas por nós; gate de grep com 0 ocorrências da referência externa em cláusula de filtro; teste dedicado nomeando C-08 |
| T-03-32 | `buscarPagamento` antes de qualquer escrita, provado por `invocationCallOrder`; guarda de status com `it.each` sobre 4 status recusados |
| T-03-33 | `acessoAte` puro do `dueDate`; teste com `vi.setSystemTime` em 2026 e 2027 produzindo o mesmo instante |
| T-03-34 | `OR: [{acessoAte: null}, {acessoAte: {lt: novo}}]` com asserção exata; cenário completo com as datas literais `2026-10-01` e `2026-08-01` |
| T-03-35 | Escrita por `prisma.empresa.update`/`updateMany` dedicados; gate de grep com 0 ocorrências do service de Empresa |
| T-03-36 | `acessoService.registrarTransicao` com causa `WEBHOOK_PAGAMENTO`; gate de grep proibindo criação direta de linha de auditoria |
| T-03-37 | `AsaasApiError` capturado, gravado em `erro`, nunca propagado; invariante de terminação verificada por `it.each` de 13 entradas |
| T-03-38 | `avaliarAcesso` é a única origem do `novo`; teste com trial vigente prova que a derivação devolve `TRIAL` onde um literal devolveria o status de pagante |
| T-03-SC | Nenhum pacote instalado |

## Deviations from Plan

### 1. [Rule 3 — Bloqueio] Tipagem dos parâmetros de payload como `unknown`

- **Encontrado em:** Task 1, antes do primeiro GREEN
- **Situação:** a tabela *Artifacts* do plano declara `aplicarPagamentoConfirmado(eventoId, payment: AsaasPayment)`, `capturarAssinatura(…, subscription: AsaasSubscription)` e `capturarCheckoutPago(…, checkout: AsaasCheckout & { customer? })`. O mesmo plano manda validar o objeto com `safeParse` **dentro** do método. As duas coisas são incompatíveis: o valor que chega é o sub-objeto do payload lido do ledger, e declará-lo com o tipo do domínio afirmaria a forma antes de verificá-la. Além disso o resultado de `pagamentoSchema` não é atribuível a `AsaasPayment` (`value` é obrigatório lá e opcional no schema não-estrito), então o código não compilaria.
- **Correção:** os três parâmetros são `unknown` e ganham forma pelo `safeParse`. O objeto com tipo `AsaasPayment` garantido em `aplicarPagamentoConfirmado` é `autoritativo`, vindo da API. A semântica pretendida pelo plano é preservada — o que muda é qual valor carrega a garantia de forma.
- **Arquivo:** `app/services/webhook-asaas.service.ts`
- **Commit:** `b540435`

### 2. [Rule 3 — Bloqueio] `npx next typegen` para destravar `tsc --noEmit`

- **Encontrado em:** Task 1, na verificação de tipos
- **Situação:** `npx tsc --noEmit` falhava com `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'` — o mesmo erro ambiental documentado no SUMMARY do plano 03-05. `LayoutProps` é um tipo global gerado pelo Next em `.next/types/**`, que o `tsconfig.json` inclui; o worktree deste agente nunca rodou `next dev`/`next build`.
- **Correção:** `npx next typegen` (comando de geração, sem alteração de código; `.next/` é gitignored). `tsc --noEmit` passou a sair 0, cumprindo o critério de aceitação das Tasks 1 e 2 sem tocar em `app/layout.tsx`.
- **Arquivo:** nenhum arquivo versionado
- **Commit:** — (não produz diff)

### 3. Ajuste do teste herdado de fronteira de wave

O caso `it.each(EVENTOS_MUTADORES)` do plano 03-05 asseverava `erro` contendo a string `"03-06"`. Ele foi encolhido na Task 1 (para os dois eventos de pagamento) e removido na Task 2, quando ambos passaram a ter handler. O comportamento que ele protegia — evento mutador não concluído fica na fila `processadoEm IS NULL` — continua coberto, agora pelos casos de empresa não resolvida e de falha do gateway.

Nenhum outro desvio: a sequência de 9 passos de `aplicarPagamentoConfirmado` e a ordem de resolução de `resolverEmpresaId` foram implementadas exatamente como escritas.

## Authentication Gates

Nenhum. Este plano não fala com o gateway em runtime — o cliente é mockado por módulo nos testes, e a homologação real contra o sandbox é o `checkpoint:human-verify` do plano 03-07.

## Known Stubs

Nenhum. Os quatro stubs declarados pelo plano 03-05 (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `SUBSCRIPTION_CREATED`, `CHECKOUT_PAID` chamando `marcarErro("handler de mutação pendente")`) foram todos substituídos por handlers reais. O gate de grep correspondente sai 0 e a matriz de 13 entradas prova que nenhum evento cai num marcador provisório.

## Threat Flags

Nenhuma superfície de segurança fora do `<threat_model>` do plano foi introduzida. As escritas novas (`Empresa.asaasSubscriptionId`, `Empresa.asaasCustomerId`, `Empresa.acessoAte`, `CheckoutAsaas.status`) já estavam previstas e todas passam pela resolução de tenant do mapa local.

## Self-Check: PASSED

Arquivos verificados no disco:

- FOUND: `app/services/webhook-asaas.service.ts`
- FOUND: `app/services/webhook-asaas.service.test.ts`
- FOUND: `.planning/phases/03-gateway-asaas-e-ingest-o-de-webhooks/03-VALIDATION.md`
- FOUND: `.planning/REQUIREMENTS.md`

Commits verificados em `git log`:

- FOUND: `6eaae54` — test(03-06): add failing tests for tenant resolution and Asaas id capture (RED, task 1)
- FOUND: `b540435` — feat(03-06): resolve tenant from local map and capture Asaas external ids (GREEN, task 1)
- FOUND: `3ad0441` — test(03-06): add failing tests for authoritative re-fetch and monotonic write (RED, task 2)
- FOUND: `efe019d` — feat(03-06): extend acessoAte monotonically from the authoritative due date (GREEN, task 2)
- FOUND: `185b266` — test(03-06): prove termination invariant and out-of-order no-op end to end (task 3)

## TDD Gate Compliance

Tasks 1 e 2 seguiram RED → GREEN com commits separados, e nenhum teste passou inesperadamente na fase RED (20 e 24 falhas respectivamente, todas por símbolo inexistente ou comportamento ausente). Nenhum REFACTOR foi necessário.

A Task 3 é, por construção do plano, uma task de **prova e fechamento**: seu `<action>` manda *revisar* o `switch`, *garantir por leitura* a invariante de terminação e *adicionar* os cenários — não introduz símbolo novo. Seus 16 casos passaram de primeira, o que é o resultado correto para uma task que verifica comportamento já entregue pelas Tasks 1 e 2. Para descartar vacuidade, a guarda monotônica foi mutada de `lt` para `gt` e 4 casos quebraram; a mutação foi revertida.

## For the Next Plan (03-07)

- Todo o código de ingestão e aplicação está pronto e verificado por unidade. O que falta é exclusivamente a homologação contra o Asaas sandbox: registrar o webhook com `sendType: "SEQUENTIALLY"`, criar um checkout, pagar com cartão de teste e confirmar que `CHECKOUT_PAID` + `PAYMENT_CONFIRMED` estendem `acessoAte`.
- Duas suposições que só o sandbox resolve: **A1** (host do checkout hospedado em sandbox, hoje uma env var) e **A3** (se a referência externa propaga do checkout para as cobranças — o design não depende dela, mas o log de divergência do `resolverEmpresaId` vai dizer a verdade na primeira entrega real).
- Fila de diagnóstico durante a homologação: `WHERE processadoEm IS NULL AND erro IS NOT NULL` mostra exatamente qual passo falhou, com a mensagem já discriminando payload inválido, falha de gateway, status recusado e empresa não resolvida.
