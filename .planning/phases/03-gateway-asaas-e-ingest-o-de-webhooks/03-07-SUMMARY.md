---
phase: 03-gateway-asaas-e-ingest-o-de-webhooks
plan: 07
subsystem: payments
tags: [asaas, sandbox, homologacao, webhook, idempotencia, idor, dotenv, tenant-resolution]

status: COMPLETE
plan_complete: true

requires:
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    plan: 02
    provides: "asaasClient, config fail-fast e ASAAS_CHECKOUT_BASE_URL como env var"
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    plan: 03
    provides: "EVENTOS_ASSINADOS — a lista canonica de 12 eventos"
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    plan: 04
    provides: "POST /api/assinaturas/checkout e o mapa CheckoutAsaas"
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    plan: 06
    provides: "resolverEmpresaId, aplicarPagamentoConfirmado, capturarAssinatura"
provides:
  - "webhook registrado no Asaas Sandbox, idempotente por API (scripts/registrar-webhook-asaas.ts)"
  - "resolucao de tenant pelo checkoutSession autoritativo — destrava o PRIMEIRO pagamento de todo cliente"
  - "carregador unico de .env para scripts e aplicacao (scripts/resolvedor-ts.mjs)"
  - "evidencia end-to-end contra o gateway real: A1/A3/A4/A5/A9 e Open Questions 1 e 2 resolvidas"
affects: [04-bloqueio, 05-worker, 07-assinatura]

tech-stack:
  added: []
  patterns:
    - "Registro de webhook idempotente por `name`, com `interrupted: false` servindo tambem de comando de reativacao da fila"
    - "Lista de eventos assinados importada da constante canonica, nunca redigitada no script de setup"
    - "Ponte de tenant pelo `checkoutSession` do objeto RE-BUSCADO: identificador externo so vale quando casa com linha que nos gravamos"
    - "Um unico leitor de `.env` (`@next/env`) para scripts e runtime — elimina divergencia de expansao de variavel"
    - "Drenagem da fila de retrabalho (`processadoEm IS NULL`) como caminho de recuperacao, distinto da reentrega HTTP"

key-files:
  created:
    - scripts/registrar-webhook-asaas.ts
    - scripts/resolvedor-ts.mjs
    - .planning/phases/03-gateway-asaas-e-ingest-o-de-webhooks/deferred-items.md
  modified:
    - package.json
    - vitest.config.mts
    - lib/billing/asaas/client.ts
    - lib/billing/asaas/tipos.ts
    - app/services/webhook-asaas.service.ts
    - app/services/webhook-asaas.service.test.ts
    - .planning/phases/03-gateway-asaas-e-ingest-o-de-webhooks/03-VALIDATION.md

key-decisions:
  - "O script de setup usa o `asaasClient` (metodos novos listarWebhooks/criarWebhook/atualizarWebhook) em vez de fetch cru: a URL, o header de auth e o formato de corpo do Asaas continuam existindo num arquivo so"
  - "`sendType` e parametro do chamador, nao default do cliente: a escolha do modo de entrega e decisao de operacao e precisa ficar visivel no script"
  - "Sem runner de TypeScript instalado — o Node 22+ ja executa `.ts`; o que faltava (alias `@/` e extensao implicita) foi resolvido por hook de resolucao proprio, mantendo a promessa do threat model de nao instalar pacote nenhum"
  - "O `.env` dos scripts passa pelo `@next/env`, o mesmo leitor da aplicacao — `--env-file` do Node discorda dele na expansao de `$` e a divergencia produz bug silencioso"
  - "A fila de retrabalho foi drenada chamando `processar` (o que o worker da Fase 5 fara), NAO pelo botao de reenvio: um reenvio bate na guarda de idempotencia e nao reprocessa — sao mecanismos diferentes e confundi-los esconderia o defeito"
  - "A correcao de resolucao de tenant foi aplicada DENTRO do 03-07, fora do `files_modified` declarado — justificativa na secao de desvios"

requirements-completed: [GTW-01, GTW-02, GTW-03, GTW-04]

metrics:
  duration: ~4h (majoritariamente bloqueado em gates humanos e diagnostico de ambiente)
  tasks: 3
  files: 10
  tests_added: 6
completed: 2026-09-01
---

# Phase 03 Plan 07: Homologação contra o Asaas Sandbox

**O gateway real desmentiu duas suposições da pesquisa e expôs um impasse que nenhum mock reproduzia — um cliente que pagou R$ 29,90 continuava em carência, a caminho do bloqueio. O defeito foi encontrado, corrigido e provado com números: `acessoAte` saiu de `NULL` para `2026-10-01 03:00:00` com auditoria `WEBHOOK_PAGAMENTO`.**

## Performance

- **Duração:** ~4 h de relógio, com 4 checkpoints humanos (cadastro da conta, correção do `.env`, decisão de escopo, reenvio pelo painel)
- **Tasks:** 3/3
- **Commits:** 6

## What Was Built

### Task 1 — Credenciais de sandbox (checkpoint humano)

Executada pelo operador. Re-verificada por mim programaticamente, sem imprimir valor nenhum: as 5 variáveis presentes, `ASAAS_WEBHOOK_TOKEN` com 64 caracteres, `APP_BASE_URL` em `https://`, chave com prefixo `$aact_hmlg_` (**A2 confirmada**), `.env` fora do versionamento (`.gitignore:37`).

Um bloqueio não previsto pelo plano apareceu aqui: a conta de sandbox recém-criada tinha `commercialInfo`, `bankAccountInfo`, `documentation` e `general` todos em `PENDING`, e o Asaas responde `"A criação do checkout está desabilitada. Regularize a situação cadastral."` nesse estado. Só o operador podia resolver — completar cadastro exige dados de identidade num site de terceiro.

### Task 2 — `scripts/registrar-webhook-asaas.ts`

| Símbolo | Contrato |
|---------|----------|
| `asaasClient.listarWebhooks()` | `() => Promise<AsaasLista<AsaasWebhook>>` |
| `asaasClient.criarWebhook(input)` | `(RegistrarWebhookInput) => Promise<AsaasWebhook>` |
| `asaasClient.atualizarWebhook(id, input)` | `(string, RegistrarWebhookInput) => Promise<AsaasWebhook>` |
| `npm run asaas:webhook` | registro idempotente, ponto de entrada único |

Idempotência pela chave `name`: busca `gestor-estoque-billing`, cria se não existe, reescreve se existe. Comprovado — duas execuções, o mesmo id `6053247d-f420-4a87-bfe7-01e23961d56a`.

O corpo sempre inclui `interrupted: false`, o que faz do mesmo comando o **caminho de reativação** da fila depois das 15 falhas consecutivas que a pausam (Pitfall 2). Não existe endpoint separado para isso.

`AsaasWebhook` **não declara `authToken`** de propósito: o campo volta na resposta do Asaas, e qualquer campo tipado vira caminho possível para um log ou uma persistência acidental do segredo (T-03-44). Sem tipo, o compilador recusa.

**Nenhum pacote foi instalado**, como o threat model exigia. O Node 22+ já executa `.ts` por type stripping nativo; o que faltava era o alias `@/` do `tsconfig` e a extensão implícita nos imports relativos da `lib/`. `scripts/resolvedor-ts.mjs` resolve os dois por hook de resolução. A alternativa — reescrever os imports da `lib/` com extensão explícita só para agradar um script de setup — trocaria uma dificuldade de execução por dívida no código de produção.

### Task 3 — Gate automatizado + homologação end-to-end

**Gate automatizado, os quatro verdes no mesmo estado do repo:**

| Gate | Resultado |
|------|-----------|
| `npm run test` | **79 arquivos, 713 casos, 0 falhas** (+6 novos) |
| `npm run lint` | **0 erros** (2 warnings pré-existentes) |
| `npx tsc --noEmit` | exit **0** |
| `psql -f prisma/checks/asaas-schema.sql` | exit **0** — `INV-1..INV-7 OK` |

**Homologação (linha `03-H1`):** checkout real criado pela rota (`200` em 1,617 s), pago com o cartão de teste do sandbox, eventos recebidos pela URL pública HTTPS, acesso concedido e auditado.

## Verification — a evidência numérica

**Empresa de teste `homologacao-asaas-0307`** (`e0307000-0000-4000-8000-000000000307`), com `trialFim` propositalmente vencido para a primeira cobrança cair no mesmo dia:

| Medida | Antes | Depois |
|--------|-------|--------|
| `acessoAte` | **NULL** | **2026-10-01 03:00:00** |
| `asaasSubscriptionId` | NULL | `sub_olnv6hyy59omcslo` |
| `asaasCustomerId` | NULL | `cus_000008967137` |
| `ultimoStatusAuditado` | **CARENCIA** | **EM_DIA** |
| `AuditoriaAcesso` (linhas) | 0 | **1** — `CARENCIA → EM_DIA`, causa `WEBHOOK_PAGAMENTO` |

`2026-10-01 03:00:00` é a meia-noite de São Paulo — `dueDate 2026-09-01` mais um ciclo mensal, derivado do objeto autoritativo, sem tocar no relógio. O valor bate exatamente com o previsto antes do teste.

**Ledger, com a ordem REAL de entrega:**

| ordem de entrega | evento | `dateCreated` | `processadoEm` | `erro` |
|---|---|---|---|---|
| 1 (12:20:20.869) | `PAYMENT_CONFIRMED` | 09:20:19 | 12:33:17.097 | — |
| 2 (12:20:22.606) | `SUBSCRIPTION_CREATED` | 09:20:17 | 12:33:17.792 | — |
| 3 (12:20:22.654) | `CHECKOUT_PAID` | 09:20:17 | 12:20:22.677 | — |

3 linhas, todas com terminação; **0** eventos com `processadoEm` e `erro` ambos nulos.

**Demais exigências do plano:**

| Exigência | Observado |
|---|---|
| Token errado no header | **401** |
| Sem header | **401** |
| Reentrega do mesmo `PAYMENT_CONFIRMED` pelo painel | ledger permaneceu em **3 linhas** (mesmo `eventoId`, `createdAt` original preservado), `acessoAte` **inalterado**, `AuditoriaAcesso` ainda em **1** |
| `penalizedRequestsCount` após todas as entregas reais | **0** |
| `interrupted` | `false` |

A reentrega foi feita pela aba **"Logs de Webhooks"** do painel (não em "Webhooks", que é só configuração). Nota operacional para a Fase 5.

## O defeito que a homologação encontrou

Este é o resultado mais importante do plano, e o motivo pelo qual ele existia.

### Sintoma

Pagamento aprovado, três eventos entregues, `HTTP 200` em todos — e `acessoAte` continuou `NULL`. Os dois eventos mutadores terminaram com `erro = "empresa nao resolvida"`, na fila de retrabalho.

### Causa raiz — três fatos reais que se combinam

1. **`sendType: "SEQUENTIALLY"` não ordena entre recursos.** Os `dateCreated` provam: a assinatura e o checkout nasceram às 09:20:17 e a cobrança às 09:20:19, mas a **cobrança foi entregue primeiro**. São filas por recurso, não uma fila global. A pesquisa assumiu ordem cronológica preservada (**Open Question 2 → RESPONDIDA, contra a expectativa**).
2. **`externalReference` não propaga** (**A3 → REFUTADA**). Nós o definimos no checkout; ele volta apenas no `CHECKOUT_PAID`. Confirmado contra a API, não só pelo payload: `GET /payments/{id}` e `GET /subscriptions/{id}` devolvem `externalReference: null`, e consultar por ele devolve `totalCount: 0`.
3. **`CHECKOUT_PAID` traz `customer: null`.** O evento que resolve o tenant não tem o `cus_…` para gravar.

O efeito combinado é um **impasse**, não um atraso: `PAYMENT_CONFIRMED` só resolvia por `asaasSubscriptionId` (escrito por `SUBSCRIPTION_CREATED`); `SUBSCRIPTION_CREATED` só resolvia por `asaasCustomerId` (que seria escrito por `CHECKOUT_PAID`, mas vem nulo). Nenhum dos dois conseguiria se ancorar **nunca** — retentar não adiantaria, porque o dado que falta não existe em nenhum dos payloads.

### Correção

A API autoritativa devolve, no pagamento **e** na assinatura, o campo que fecha o circuito:

```
GET /payments/pay_or03tjzi6b6sa6lc      -> checkoutSession = "e8f41895-…"
GET /subscriptions/sub_olnv6hyy59omcslo -> checkoutSession = "e8f41895-…"
```

Esse é o id do checkout que **nós** criamos e gravamos em `CheckoutAsaas`. E o passo 2 de `resolverEmpresaId` já existia exatamente para essa janela — o comentário dele diz *"Cobre a janela em que a cobrança chega antes de a assinatura existir (Open Question 2)"*. O passo estava implementado; **ninguém nunca o alimentava** nos ramos de pagamento e assinatura, porque a pesquisa não sabia que `checkoutSession` existia nesses objetos.

Três mudanças:

1. `checkoutSession` declarado em `AsaasPayment` e `AsaasSubscription`.
2. `aplicarPagamentoConfirmado` passa `checkoutId: autoritativo.checkoutSession` ao resolver.
3. `capturarAssinatura` ganhou o **re-fetch autoritativo** que o ramo de pagamento já tinha — necessário porque o payload do webhook não traz `checkoutSession`, só o objeto da API traz.

**A propriedade de segurança não foi afrouxada.** O `checkoutSession` vem do re-fetch feito com a nossa chave contra o servidor deles, nunca do corpo não assinado, e ainda assim não autoriza sozinho: só vale se casar com uma linha de `CheckoutAsaas` que nós gravamos ao criar o checkout. A cadeia de confiança continua terminando numa escrita nossa (C-08 / ASVS V4 preservados). Há teste dedicado provando que um `checkoutSession` forjado no payload é ignorado.

### Não-vacuidade provada por mutação

Removi `checkoutId: autoritativo.checkoutSession` do ramo de pagamento: **exatamente 2** dos 6 casos novos quebraram. Revertido, os 90 do arquivo voltaram a passar.

## Deviations from Plan

### 1. [Rule 1 — Bug] Correção da resolução de tenant, fora do `files_modified` declarado

- **Encontrado em:** Task 3, na homologação end-to-end
- **Arquivos:** `app/services/webhook-asaas.service.ts`, `app/services/webhook-asaas.service.test.ts`, `lib/billing/asaas/tipos.ts` — artefatos do plano 03-06, não deste
- **Por que foi feito aqui, e não num plano novo:** parei e levei a decisão ao operador em vez de decidir sozinho, porque a mudança toca o caminho anti-IDOR e o projeto está com `security_enforcement: true` / `security_block_on: high`. A escolha registrada foi **corrigir dentro do 03-07**. O argumento decisivo: os critérios de sucesso deste plano exigem `acessoAte` estendido, e fechar a fase sem isso significaria declarar GTW-03 verde apenas contra mocks — sendo que foram os mocks que produziram o defeito.
- **Threat register:** a mudança **fortalece** T-03-31 (resolução de tenant). Ver a linha nova na tabela abaixo.
- **Commit:** `062a1c8`

### 2. [Rule 3 — Bloqueio] Escopo do vitest excluía os worktrees de agente

- **Situação:** `npm run test` coletava `.claude/worktrees/<id>/`, que são cópias completas do repositório num commit antigo. A suíte rodava duas vezes (158 arquivos) e reportava 78 falhas vindas de código obsoleto — falso-vermelho no gate da fase.
- **Correção:** `"**/.claude/**"` no `exclude` do `vitest.config.mts`. Suíte de volta a 79 arquivos.
- **Commit:** `a29b223`

### 3. [Rule 1 — Bug] Escape de `$` no `.env` quebrou os scripts na direção oposta

Detalhado na seção *Pitfall de ambiente* abaixo. **Commit:** `1cf9f78`

### 4. [Rule 1 — Bug] Teste passando por vazamento de mock

- **Encontrado em:** ao introduzir o re-fetch em `capturarAssinatura`
- **Situação:** `vi.clearAllMocks()` zera as chamadas mas **preserva as implementações**. O mock do Prisma tem `mockReset` próprio no setup global; o do cliente do Asaas não tinha. O caso "SUBSCRIPTION_CREATED sai da fila de retrabalho" estava passando pelo `mockResolvedValue` definido em outro `describe`, não pelo próprio arranjo.
- **Correção:** `asaasMock.buscarPagamento.mockReset()` / `buscarAssinatura.mockReset()` no `beforeEach`. O caso passou a falhar sem stub próprio — como deveria — e recebeu o seu.
- **Commit:** `062a1c8`

### 5. Fila de retrabalho drenada por `processar`, não pelo botão de reenvio

O plano previa usar o reenvio do painel para reprocessar. Não funcionaria: um reenvio carrega o **mesmo `eventoId`**, colide no `@unique` do ledger e o endpoint responde 200 **sem processar** — é a guarda de idempotência fazendo o trabalho dela. Recuperação e reentrega são mecanismos diferentes. Drenei a fila chamando `processar` sobre `processadoEm IS NULL` (exatamente o que o worker da Fase 5 fará) e usei o botão do painel para o que ele de fato prova: **replay pelo caminho HTTP real**, que confirmou "nada muda".

## Suposições e Open Questions — veredito

| # | Claim | Veredito | Evidência |
|---|-------|----------|-----------|
| **A1** | URL de checkout em sandbox é `.../checkoutSession/show?id=<id>` | **CORRIGIDA** | `link` vem **preenchido** (não `null`) e a forma é `.../checkoutSession/show/<id>` — **caminho**, não query string. O código prefere `checkout.link`, então o caminho feliz está correto; o valor de `ASAAS_CHECKOUT_BASE_URL` produziria URL quebrada se o fallback fosse usado. Ver pendências. |
| **A2** | Prefixo `$aact_hmlg_` em sandbox | **CONFIRMADA** | verificado sem imprimir o valor |
| **A3** | `externalReference` propaga para assinatura e cobranças | **REFUTADA** | `null` no payload e na API; consulta por ele devolve `totalCount: 0`. Foi a mitigação do desenho (mapa local como fonte) que evitou o pior. |
| **A4** | `nextDueDate` aceita `"YYYY-MM-DD HH:mm:ss"` | **CONFIRMADA** | enviado `"2026-09-01 00:00:00"`, ecoado como `2026-09-01T03:00:00Z` — meia-noite de SP exata |
| **A5** | Omitir `endDate` cria assinatura sem prazo | **CONFIRMADA** | `200` com `"endDate": null` |
| **A9** | `payment.subscription` já vem na 1ª cobrança | **CONFIRMADA** | `sub_olnv6hyy59omcslo` presente — mas **não bastava**, porque o mapa local para esse id ainda não existia |
| **OQ 1** | Host do checkout em sandbox / quando `link` vem preenchido | **RESPONDIDA** | `link` vem preenchido na criação; host `sandbox.asaas.com` |
| **OQ 2** | `PAYMENT_CONFIRMED` chega antes ou depois de `SUBSCRIPTION_CREATED`? | **RESPONDIDA — antes** | e `SEQUENTIALLY` não garante ordem entre recursos. É a metade do defeito. |
| **A6** | Tarifas do Asaas | não reconfirmada | fora do escopo desta fase; segue como decisão comercial pendente |
| **A7** | `zod@4.5.4` seguro | resolvida no plano 03-03 | — |
| **A8** | Sem rate limit relevante | **CONFIRMADA na prática** | dezenas de chamadas na homologação, nenhum `429` |

## Pitfall de ambiente descoberto: `$` no `.env` sob o Next

**Não é bug do nosso código, mas custou horas e vai custar de novo se não ficar registrado.**

O `@next/env` (leitor de `.env` do Next) passa o arquivo por `dotenv-expand`, que trata `$` como início de referência a outra variável. **Toda chave de API do Asaas começa com `$`** (`$aact_…`). Como `aact_hmlg_…` não existe como variável de ambiente, a chave virava **string vazia** — sem erro, sem aviso, **só dentro do `next dev`**.

O sintoma era desconcertante: `POST /api/assinaturas/checkout` devolvia 502 em **17 ms**, enquanto a chamada idêntica pelo mesmo módulo `asaasClient` fora do Next devolvia 200. O tempo foi o que denunciou — 17 ms é curto demais para uma ida ao gateway, então a falha era antes do `fetch`. Reproduzido isolado com `@next/env`: sem aspas, com aspas simples e com aspas duplas, os três dão string vazia; só `\$` preserva o valor.

E a correção criou um segundo bug na direção oposta: `node --env-file` **não** processa esse escape e passava a entregar a barra invertida literal, quebrando `npm run asaas:webhook` com 401.

**Correção estrutural:** os scripts do projeto passaram a carregar o `.env` pelo **mesmo leitor da aplicação** (`@next/env`, via `scripts/resolvedor-ts.mjs`), em vez de `--env-file`. O que o script vê é, por construção, o que a aplicação vê. Nenhum pacote novo — `@next/env` é o leitor do próprio `next`, que já é dependência.

Varri o resto do `.env` sem imprimir valores: **só `ASAAS_API_KEY` contém `$`**. `DATABASE_URL`, `JWT_SECRET` e as cinco credenciais do R2 não sofrem do problema.

## Threat Register — dispositions realizadas

| Threat ID | Como ficou |
|-----------|-----------|
| T-03-39 | `.env` fora do versionamento confirmado (`git check-ignore` → `.gitignore:37`); todas as verificações de credencial feitas por comprimento/prefixo, sem imprimir valor |
| T-03-40 | `APP_BASE_URL` em `https://` validado na Task 1 e por falha explícita do script; entregas reais chegaram por TLS |
| T-03-41 | **Verificado contra tráfego real**, não mock: token errado → 401, sem header → 401, ambos pela URL pública |
| T-03-42 | **Verificado em dois níveis**: reentrega pelo painel (mesmo `eventoId` colidiu, ledger em 3 linhas, nada mudou) e reprocessamento no nível de domínio (escrita monotônica → no-op, `acessoAte` e auditoria idênticos) |
| T-03-43 | `penalizedRequestsCount = 0` e `interrupted: false` após todas as entregas reais, incluindo a reentrega |
| T-03-44 | O script imprime id, url, `sendType`, contagem de eventos, `enabled`, `interrupted` e `penalizedRequestsCount` — nunca `authToken` nem a chave. `AsaasWebhook` sequer declara `authToken`. |
| T-03-45 | Apenas a chave de sandbox foi usada; a conta de produção não existe |
| T-03-31 | **Reforçado.** A resolução ganhou uma âncora que faltava, e ela continua sendo uma coluna que nós gravamos. O identificador vem do re-fetch autoritativo, nunca do corpo não assinado — há teste provando que um `checkoutSession` forjado no payload é ignorado. Sem `checkoutSession` e sem mapa local, continua não havendo escrita. |
| T-03-SC | Nenhum pacote instalado |

## Success Criteria

- [x] Credenciais de sandbox no ambiente, fora do versionamento, `APP_BASE_URL` em HTTPS
- [x] Webhook registrado com `SEQUENTIALLY` e os 12 eventos importados de `EVENTOS_ASSINADOS`; script idempotente (mesmo id em duas execuções)
- [x] Checkout real de R$ 29,90/mês criado pela rota, aberto e pago com cartão de teste
- [x] Eventos chegaram; `acessoAte` estendido; `asaasSubscriptionId` e `asaasCustomerId` capturados; auditoria com causa `WEBHOOK_PAGAMENTO`
- [x] Token errado e ausência de token → 401; reentrega do mesmo evento não mudou nada
- [x] `penalizedRequestsCount = 0`
- [x] Suposições do Assumptions Log confirmadas ou corrigidas, com teste atualizado onde exigiu correção de código
- [x] `03-VALIDATION.md` com `status: approved` e nenhuma linha pendente

## Known Stubs

Nenhum.

## Pendências não-bloqueantes

**`.env.example` precisa de dois ajustes que eu não consegui aplicar** — o arquivo está num diretório negado pelas minhas permissões de leitura e escrita. Texto sugerido, para o operador aplicar:

```dotenv
# Chave de API do Asaas. ATENÇÃO: escape o `$` inicial com barra invertida.
# O Next carrega o .env via @next/env -> dotenv-expand, que interpreta `$` como
# referência a outra variável; sem o escape a chave vira string vazia DENTRO do
# next dev, sem erro nenhum, e toda chamada ao gateway falha com 401/502.
ASAAS_API_KEY=\$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGRjOA==

# Base do checkout hospedado. Confirmado contra o sandbox em 2026-09-01: a forma
# real é /checkoutSession/show/<id> (CAMINHO, não `?id=<id>`). Na prática a
# resposta de criação já traz `link` preenchido e o código o prefere; esta base é
# fallback.
ASAAS_CHECKOUT_BASE_URL=https://sandbox.asaas.com/checkoutSession/show
```

Demais itens fora de escopo em `deferred-items.md` (ESLint também percorre os worktrees de agente; worktree órfão em `git worktree list`).

## Nota para a Fase 5 (worker)

- A fila de retrabalho é `WHERE processadoEm IS NULL` e a mensagem em `erro` já discrimina o passo que falhou. Drená-la é chamar `webhookAsaasService.processar(eventoId)` — foi assim que a recuperação desta homologação foi feita, e funcionou.
- **Reenvio pelo painel não reprocessa evento já registrado** (colide no `@unique`). Recuperação é trabalho do worker, não do botão.
- O painel do Asaas expõe as entregas em **"Logs de Webhooks"**; a aba "Webhooks" é só configuração.
- A empresa de teste `homologacao-asaas-0307` ficou no banco de desenvolvimento com assinatura ativa no sandbox — útil para a Fase 4 (bloqueio) e a Fase 7 (cancelamento), ou removível sem impacto.

## Self-Check: PASSED

Arquivos verificados no disco:

- FOUND: `scripts/registrar-webhook-asaas.ts`
- FOUND: `scripts/resolvedor-ts.mjs`
- FOUND: `.planning/phases/03-gateway-asaas-e-ingest-o-de-webhooks/03-07-SUMMARY.md`
- FOUND: `.planning/phases/03-gateway-asaas-e-ingest-o-de-webhooks/deferred-items.md`

Commits verificados em `git log`:

- FOUND: `e7b32d1` — feat(03-07): register the Asaas billing webhook idempotently by API
- FOUND: `a29b223` — fix(03-07): stop vitest from running agent worktree copies of the repo
- FOUND: `a35deba` — docs(03-07): log out-of-scope findings from the sandbox homologation gate
- FOUND: `1cf9f78` — fix(03-07): load .env through Next's own loader in project scripts
- FOUND: `062a1c8` — fix(03-07): resolve tenant via authoritative checkoutSession on first payment
