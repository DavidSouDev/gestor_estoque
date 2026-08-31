---
phase: 03-gateway-asaas-e-ingest-o-de-webhooks
plan: 04
subsystem: payments
tags: [asaas, checkout, assinatura-recorrente, prisma, next-route-handler, vitest, tdd]

# Dependency graph
requires:
  - phase: 03-01
    provides: "modelo CheckoutAsaas e campos Empresa.asaasCustomerId/asaasSubscriptionId no schema"
  - phase: 03-02
    provides: "asaasClient.criarCheckout, AsaasApiError, VALOR_PLANO_MENSAL, appBaseUrl, asaasCheckoutBaseUrl, primeiraCobrancaEmSaoPaulo"
  - phase: 02
    provides: "requireAuth com revalidacao de conta, HttpError, fatos de billing (trialFim)"
provides:
  - "assinaturaService.criarCheckout(empresaId) -> { url, checkoutId }"
  - "POST /api/assinaturas/checkout autenticado"
  - "mapa local CheckoutAsaas (asaasCheckoutId -> empresaId) gravado apos o 2xx do Asaas"
affects: [03-06 webhook de eventos, 04 enforcement e banner de carencia, 07 gestao de assinatura]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ordem D-07: chamada ao gateway externo ANTES de qualquer escrita, com fronteira marcada em comentario e provada por assercao de ausencia"
    - "Route handler com catch de tres ramos (AuthError -> HttpError -> generico), corrigindo o analog que so tratava AuthError"

key-files:
  created:
    - app/services/assinatura.service.ts
    - app/services/assinatura.service.test.ts
    - app/api/assinaturas/checkout/route.ts
    - app/api/assinaturas/checkout/route.test.ts
  modified: []

key-decisions:
  - "A URL de sucesso/cancelamento/expiracao e a mesma (o painel do tenant): retorno em successUrl nao e prova de pagamento e nada nesta fase o trata como tal — quem escreve o resultado e o webhook (03-06)"
  - "criarCheckout nao grava nada em Empresa: asaasCustomerId/asaasSubscriptionId so existem depois que o pagador conclui o checkout, e sao preenchidos pelos eventos de webhook"
  - "O corpo do request e ignorado por completo no route handler — nao ha campo util, e ler qualquer coisa dele abriria caminho para IDOR (T-03-15)"
  - "Status 200 (nao 201) na resposta do endpoint: nenhum recurso nosso e criado do ponto de vista do chamador"
  - "O criterio de aceitacao grep -c requireAuth == 1 e insatisfazivel (a linha de import tambem casa); a invariante real — um unico call site — foi verificada por grep -c 'requireAuth(request)' == 1"

patterns-established:
  - "Fronteira D-07 explicita: bloco de comentario delimitando o ponto do codigo antes do qual nenhuma escrita pode existir, ancorado no teste de ausencia correspondente"
  - "Projecao EMPRESA_CHECKOUT_SELECT: const de select explicito no topo do service, include proibido por gate de grep (C-07)"

requirements-completed: [GTW-01]

# Metrics
duration: 6min
completed: 2026-08-31
---

# Phase 3 Plan 04: Checkout Hospedado do Asaas Summary

**`assinaturaService.criarCheckout` + `POST /api/assinaturas/checkout` criam uma assinatura mensal recorrente no checkout hospedado do Asaas e devolvem a URL, chamando o gateway antes de qualquer escrita (D-07) e sem nenhum dado de cartao tocar o nosso sistema.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-08-31T19:41Z
- **Completed:** 2026-08-31T19:47Z
- **Tasks:** 2 (ambas TDD, 4 commits)
- **Files modified:** 4 criados, 0 modificados

## Accomplishments

- `assinaturaService.criarCheckout(empresaId)` monta o `CriarCheckoutInput` com `VALOR_PLANO_MENSAL` (D-02) e `nextDueDate` derivado de `empresa.trialFim` via `primeiraCobrancaEmSaoPaulo` (D-03), chama o Asaas **uma unica vez** e so entao grava o mapa `CheckoutAsaas`.
- A ordem D-07 esta provada de forma executavel: quando o Asaas rejeita, o teste assere a **ausencia** de `checkoutAsaas.create`, `empresa.update`, `empresa.updateMany`, `auditoriaAcesso.create` e `$transaction`. Nenhuma linha orfa de "assinatura pendente" pode nascer.
- Falha de gateway vira `HttpError` 502 com mensagem generica; o `console.error` leva apenas `[asaas]`, `empresaId` e o `status` do `AsaasApiError` — nunca o corpo da resposta (C-05 / T-03-17), com teste provando que uma string sensivel presente na mensagem do erro nao chega ao log.
- `POST /api/assinaturas/checkout` deriva o tenant exclusivamente de `auth.empresaId` e ignora o corpo por completo; o caso C-08 prova que um `empresaId` de outra empresa no corpo nunca chega ao service.
- Zero superficie de UI (D-04): nenhum `.tsx` criado. `git diff --name-only` do plano lista apenas os 4 arquivos `.ts`.

## Task Commits

1. **Task 1: assinaturaService.criarCheckout (RED)** — `679bb01` (test)
2. **Task 1: assinaturaService.criarCheckout (GREEN)** — `6466b8d` (feat)
3. **Task 2: POST /api/assinaturas/checkout (RED)** — `8256b28` (test)
4. **Task 2: POST /api/assinaturas/checkout (GREEN)** — `9b13658` (feat)

Nenhum passo REFACTOR foi necessario: ambas as implementacoes ficaram no formato final ja na primeira passagem verde.

## Files Created/Modified

- `app/services/assinatura.service.ts` — cria o checkout hospedado recorrente no Asaas e persiste o mapa `CheckoutAsaas -> Empresa` apos o 2xx. Exporta `assinaturaService` e o tipo `CheckoutCriado`.
- `app/services/assinatura.service.test.ts` — 12 casos: chamada exata ao Asaas, D-03 sem trial vigente, ausencia de escrita em falha (D-07), 502 generico, redacao do log (C-05), assercao exata do `checkoutAsaas.create`, `link` presente vs. nulo (A1), 404 de empresa inexistente, `select` explicito sem `include` (C-07), ausencia de dados de pagamento nos argumentos do Prisma, e ausencia de escrita em `Empresa`.
- `app/api/assinaturas/checkout/route.ts` — `POST` autenticado; catch de tres ramos; 200 com `{ url, checkoutId }`.
- `app/api/assinaturas/checkout/route.test.ts` — 6 casos: 401 sem sessao (service nem chamado), 200 com o payload, IDOR C-08, 502 de D-07, 404 repassado, 500 generico sem vazar detalhe.

## Verificacao

| Gate | Resultado |
|------|-----------|
| `npx vitest run app/services/assinatura.service.test.ts` | 12/12 verdes (criterio: >= 9) |
| `npx vitest run app/api/assinaturas/checkout/route.test.ts` | 6/6 verdes (criterio: >= 5) |
| `npm run test` (suite completa) | 77 arquivos, 606 testes verdes |
| `npm run lint` | 0 erros (1 warning pre-existente em `app/registro/page.tsx`, documentado em 01-04) |
| `npx tsc --noEmit` | exit 0 |
| `grep -v '^\s*//' assinatura.service.ts \| grep -c "29.9"` | 0 (o valor vem de `VALOR_PLANO_MENSAL`, presente 3x) |
| `grep -cE "creditCard\|cpfCnpj\|customerData\|creditCardToken" assinatura.service.ts` | 0 |
| `grep -c "include:"` / `grep -c "select:"` no service | 0 / 1 |
| `grep -cE "\.\./\.\./lib\|\.\./lib" assinatura.service.ts` | 0 |
| `grep -cE "body.*empresaId\|empresaId.*body" route.ts` | 0 |
| `grep -c 'requireAuth(request)' route.ts` | 1 (ver deviacao 3) |
| `grep -c "HttpError" route.ts` | 2 (criterio: >= 1) |
| `grep -cE 'from "\.\./' route.ts` | 0 |
| Nenhum `.tsx` criado (D-04) | confirmado por `git diff --name-only` |
| Nenhuma delecao de arquivo | confirmado por `git diff --diff-filter=D` |

## Decisions Made

Ver `key-decisions` no frontmatter. Em resumo: as tres URLs de callback convergem no painel do tenant porque o retorno do navegador nao e prova de pagamento; nada e gravado em `Empresa` neste fluxo; o corpo do request e integralmente ignorado; e a resposta e 200, nao 201.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` ausente no worktree**
- **Found during:** Task 1 (antes do primeiro RED)
- **Issue:** O worktree e criado sem `node_modules`, entao `npx vitest` / `npx tsc` nao rodavam.
- **Fix:** Symlink de `node_modules` para o do repositorio principal. **Nenhum pacote foi instalado** — o diretorio compartilhado ja continha o Prisma Client gerado com `checkoutAsaas` (produzido pelo plano 03-01 na Wave 1).
- **Files modified:** nenhum arquivo versionado (`/node_modules` esta no `.gitignore`).
- **Verification:** `npx vitest run` executa; `grep -c checkoutAsaas node_modules/.prisma/client/index.d.ts` = 29.
- **Committed in:** n/a (artefato ignorado pelo git)

**2. [Rule 3 - Blocking] `.next/types` ausente fazia `npx tsc --noEmit` falhar**
- **Found during:** Task 1 (verificacao de tipos)
- **Issue:** `tsconfig.json` inclui `.next/types/**/*.ts`; sem eles, `app/layout.tsx` acusa `TS2304: Cannot find name 'LayoutProps'`. Erro **ambiental**, nao causado pelas mudancas deste plano — o repositorio principal tem o diretorio gerado.
- **Fix:** `npx next typegen` dentro do worktree.
- **Files modified:** nenhum arquivo versionado (`.next/` esta no `.gitignore`).
- **Verification:** `npx tsc --noEmit` passou a sair 0.
- **Committed in:** n/a (artefato ignorado pelo git)

**3. [Documentacao] Criterio de aceitacao `grep -c "requireAuth" route.ts == 1` e insatisfazivel**
- **Found during:** Task 2 (validacao dos gates)
- **Issue:** `grep -c` conta **linhas**, e a linha de import (`import { requireAuth, AuthError } from "@/lib/api-auth";`) casa junto com o call site. O menor valor possivel para um arquivo que usa `requireAuth` e 2. O analog `app/api/produtos/route.ts` marca 3.
- **Fix:** Nenhuma mudanca de codigo. A invariante que o criterio pretendia provar — um unico ponto de autenticacao no handler — foi verificada por `grep -c 'requireAuth(request)' app/api/assinaturas/checkout/route.ts` == 1.
- **Files modified:** nenhum
- **Verification:** `grep -c 'requireAuth(request)'` = 1; `grep -c 'requireAuth'` = 2 (1 import + 1 call).
- **Committed in:** n/a (correcao de criterio, nao de codigo)

---

**Total deviations:** 3 (2 blocking ambientais, 1 correcao de criterio de aceitacao)
**Impact on plan:** Nenhum impacto no escopo ou no comportamento entregue. As duas primeiras sao setup de worktree e nao tocam arquivo versionado; a terceira e um defeito de redacao do gate, nao do codigo.

## Known Stubs

Nenhum. `criarCheckout` chama o gateway real por `asaasClient` (mockado apenas em teste) e todas as constantes vem de `lib/billing/asaas/config.ts`. A unica dependencia nao confirmada e a base de URL do checkout de sandbox (`ASAAS_CHECKOUT_BASE_URL`), que ja e variavel de ambiente e cuja confirmacao contra o sandbox real e do plano 03-07 (Open Question 1 / suposicao A1) — nao e um stub de codigo.

## Threat Flags

Nenhuma superficie nova fora do `<threat_model>` do plano. As mitigacoes T-03-15 a T-03-20 estao todas implementadas e cobertas por teste:

| Threat ID | Onde a mitigacao vive | Teste que a prova |
|-----------|----------------------|-------------------|
| T-03-15 | `route.ts` — so `auth.empresaId`, corpo ignorado | "C-08: o tenant cobrado vem da sessao mesmo com outro empresaId no corpo" |
| T-03-16 | `requireAuth` na primeira linha do handler | "T-03-16: sem Authorization devolve 401 e o service nem chega a ser chamado" |
| T-03-17 | `HttpError` generico + log so com status/empresaId | "C-05: o log da falha traz o prefixo [asaas]..." |
| T-03-18 | Fronteira D-07 no service | "D-07: quando o Asaas rejeita, NENHUMA linha e gravada no nosso banco" |
| T-03-19 | Checkout hospedado; zero referencia a campo de pagamento | "GTW-01: nenhum dado de pagamento chega ao Prisma em nenhum argumento" + gate de grep |
| T-03-20 | `EMPRESA_CHECKOUT_SELECT` com 5 campos | "C-07: a leitura da Empresa filtra deletedAt e usa select explicito..." |
| T-03-SC | Nenhum pacote instalado neste plano | `package.json` inalterado |

## Issues Encountered

Nenhum alem das duas questoes de setup de worktree documentadas acima. Os dois ciclos RED falharam pelo motivo certo (modulo inexistente) antes de cada GREEN.

## User Setup Required

Nenhuma configuracao nova de servico externo neste plano. As variaveis `ASAAS_API_URL`, `ASAAS_API_KEY`, `ASAAS_CHECKOUT_BASE_URL` e `APP_BASE_URL` ja sao exigidas por `lib/billing/asaas/config.ts` (plano 03-02) — este plano passa a consumir `APP_BASE_URL` e `ASAAS_CHECKOUT_BASE_URL` em runtime, entao a ausencia delas agora falha ruidosamente no primeiro checkout.

## Next Phase Readiness

- **Para o plano 03-06 (webhook):** `CheckoutAsaas` ja e populado com `asaasCheckoutId -> empresaId`. E esse mapa que resolve o tenant de um `CHECKOUT_PAID`, cujo payload traz apenas a configuracao da recorrencia e nao o id `sub_...` (Pitfall 8). `Empresa.asaasCustomerId` e `asaasSubscriptionId` continuam nulos de proposito — preenche-los e do webhook.
- **Para as Fases 4 e 7 (UI):** o endpoint existe e esta sem consumidor por decisao (D-04). O contrato e `POST /api/assinaturas/checkout` com sessao valida, resposta `200 { url, checkoutId }`; o cliente apenas redireciona para `url`.
- **Pendencia herdada:** a base de URL do checkout de sandbox segue como suposicao A1, a confirmar no plano 03-07.

## Self-Check: PASSED

Arquivos criados verificados em disco:
- `app/services/assinatura.service.ts` — FOUND
- `app/services/assinatura.service.test.ts` — FOUND
- `app/api/assinaturas/checkout/route.ts` — FOUND
- `app/api/assinaturas/checkout/route.test.ts` — FOUND

Commits verificados em `git log`: `679bb01`, `6466b8d`, `8256b28`, `9b13658` — todos FOUND.

---
*Phase: 03-gateway-asaas-e-ingest-o-de-webhooks*
*Plan: 04*
*Completed: 2026-08-31*
