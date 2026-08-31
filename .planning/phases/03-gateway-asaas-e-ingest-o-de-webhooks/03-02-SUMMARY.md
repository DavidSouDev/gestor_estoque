---
phase: 03-gateway-asaas-e-ingest-o-de-webhooks
plan: 02
subsystem: backend
tags: [billing, asaas, gateway, config, datas, fuso-horario, pci, asvs-v7, asvs-v14]

requires:
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    provides: meiaNoiteEmSaoPaulo (lib/fuso-sao-paulo.ts) e avaliarAcesso (lib/avaliar-acesso.ts)
provides:
  - "lib/billing/asaas/config.ts — cinco acessores lazy fail-fast das env vars ASAAS_*/APP_BASE_URL e VALOR_PLANO_MENSAL"
  - "lib/billing/asaas/datas.ts — comoDiaEmSaoPaulo, acessoAteAposPagamento (pura, com clamp de fim de mes) e primeiraCobrancaEmSaoPaulo"
  - "lib/billing/asaas/tipos.ts — AsaasCheckout, AsaasPayment, AsaasSubscription, CriarCheckoutInput sem nenhum campo de dado de pagamento"
  - "lib/billing/asaas/client.ts — asaasClient (criarCheckout, buscarPagamento, buscarAssinatura) e AsaasApiError"
affects: [03-04-criacao-de-checkout, 03-05-webhook-handler, 03-06-escrita-monotonica, 03-07-teste-sandbox, 05-worker-reconciliacao]

tech-stack:
  added: []
  patterns:
    - "Acessor lazy fail-fast por variavel de ambiente (funcao, nao const de modulo): preserva a semantica de nao ter default e mantem o import livre de efeito colateral, permitindo testar rotas que importam o modulo sem configurar o ambiente inteiro"
    - "Data-calendario 'YYYY-MM-DD' do Asaas ancorada ao meio-dia UTC antes de qualquer normalizacao de fuso — 9h de folga para cada lado torna a conversao imune a transicao de offset"
    - "Aritmetica de ciclo mensal por remontagem de string com clamp (Math.min(dia, ultimoDiaDoMesAlvo)), nunca por mutador nativo de mes"
    - "Cliente de servico externo traduz 100% das falhas (HTTP e transporte) numa classe de erro de dominio propria, logando no maximo um prefixo do corpo"

key-files:
  created:
    - lib/billing/asaas/config.ts
    - lib/billing/asaas/config.test.ts
    - lib/billing/asaas/datas.ts
    - lib/billing/asaas/datas.test.ts
    - lib/billing/asaas/tipos.ts
    - lib/billing/asaas/client.ts
    - lib/billing/asaas/client.test.ts
  modified:
    - .gitignore

key-decisions:
  - "Acessores lazy em vez de throw no topo do modulo (diverge de 03-RESEARCH Code Example #1): route.test.ts precisa importar o handler do webhook sem configurar o ambiente. Idioma ja estabelecido por lib/storage/r2.ts. Fail-fast preservado — muda o momento, nao a rigidez"
  - "String vazia e tratada como ausente em obrigatorio(): ASAAS_API_KEY= num .env mal preenchido e indistinguivel, na pratica, de nao ter a chave"
  - "CORRECAO da formula da pesquisa: o ultimo dia do mes alvo e Date.UTC(ano, mes + 1, 0), nao Date.UTC(ano, mes, 0). A formula original produzia a data invalida 2021-02-31 para dueDate 2021-01-31 — exatamente o caso que GTW-03 exige acertar"
  - "primeiraCobrancaEmSaoPaulo mantem a assinatura de um argumento e le o relogio internamente; os testes injetam o tempo com vi.setSystemTime em vez de um segundo parametro, preservando o contrato do plano"
  - "Configuracao lida ANTES do try/catch do fetch: env var ausente e erro de configuracao e precisa subir como tal, nunca mascarada como AsaasApiError de rede"
  - "AsaasApiError carrega status e codigos, mas a message e sempre generica: os codigos ficam disponiveis para decisao programatica sem que a descricao do Asaas vaze para o usuario"

patterns-established:
  - "Toda data vinda do Asaas passa obrigatoriamente por lib/billing/asaas/datas.ts — nenhum outro arquivo pode chamar new Date() sobre um campo do gateway"
  - "Ausencia de tipo como controle de seguranca: campos de PII/cartao nao sao declarados, entao o compilador recusa qualquer caminho acidental de persistencia"

requirements-completed: []

duration: 12min
completed: 2026-08-31
---

# Phase 03 Plan 02: Fundacao `lib/billing/asaas/` Summary

**A fundacao isolada do gateway ficou de pe com as tres armadilhas silenciosas da fase fechadas por teste: segredo ausente agora lanca em vez de virar string vazia, `31/01 + 1 ciclo` da `28/02` (e `29/02` em ano bissexto) em vez de data invalida, e o corpo de resposta do Asaas nunca chega inteiro ao log.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-31T22:15:00Z
- **Completed:** 2026-08-31T22:27:00Z
- **Tasks:** 3 (todas em ciclo RED/GREEN)
- **Files:** 7 criados, 1 modificado

## What Was Built

### Task 1 — `config.ts`: acessores lazy fail-fast

`obrigatorio(nome)` le `process.env[nome]` e lanca `Error` com prefixo `[asaas]` e o nome literal da variavel quando o valor e `undefined` **ou** string vazia. Os cinco acessores (`asaasApiUrl`, `asaasApiKey`, `asaasWebhookToken`, `asaasCheckoutBaseUrl`, `appBaseUrl`) passam por ele. Nenhum default. `VALOR_PLANO_MENSAL = 29.9` (D-02).

Este e o terceiro segredo do projeto e o primeiro que **nao** repete o defeito de coalescencia silenciosa para vazio ja presente em `JWT_SECRET` e nas credenciais do R2 (T-03-06).

### Task 2 — `datas.ts`: aritmetica pura e determinista

- `comoDiaEmSaoPaulo("2021-01-01")` ancora ao meio-dia UTC (09:00 em SP), preservando o dia-calendario. Sem a ancora, `new Date("2021-01-01")` seria 31/12 as 21:00 em SP e custaria um dia inteiro de acesso ao cliente que pagou.
- `acessoAteAposPagamento(dueDate)` e **pura do argumento** — nunca le o relogio. E o que torna a escrita monotonica do plano 03-06 idempotente sob reentrega (T-03-10).
- Todo o fuso e delegado a `meiaNoiteEmSaoPaulo`; zero aritmetica de offset manual.
- `primeiraCobrancaEmSaoPaulo(trialFim)` devolve `"YYYY-MM-DD HH:mm:ss"` (A4), derivando o dia da parede de Sao Paulo via `Intl`, nunca de `toISOString()`.

### Task 3 — `tipos.ts` + `client.ts`: cliente tipado da API v3

`chamar<T>()` monta a URL, injeta o header `access_token` e um `AbortSignal.timeout(15s)` obrigatorio (T-03-09), e traduz **toda** falha — HTTP e de transporte — em `AsaasApiError`. Falha de rede vira `status: 0` sem vazar a exception original. `criarCheckout` monta a assinatura recorrente com `endDate` omitido de proposito (A5). Nenhum metodo de tokenizacao de cartao existe (T-03-11).

## Key Implementation Details

**A correcao mais importante:** `03-RESEARCH.md` § Code Examples #5 (copiada literalmente para o `<action>` da Task 2) calcula o ultimo dia do mes alvo como `new Date(Date.UTC(ano, mes, 0)).getUTCDate()` com `mes` 1-based. Isso devolve o ultimo dia do **mes corrente**, nao do seguinte: para `dueDate = "2021-01-31"` da 31, montando a string `"2021-02-31"` e produzindo `Invalid Date`. A forma correta e `Date.UTC(ano, mes + 1, 0)`, que ainda faz o rollover de dezembro sozinho (indice 13). Verificado fora da implementacao antes de escrever o codigo.

**Verificacao independente das datas:** os instantes esperados nos testes nao foram derivados da implementacao. Cada dia alvo teve seu instante UTC calculado por busca do unico offset cuja parede em `America/Sao_Paulo` e `00:00:00` daquele dia, usando `Intl` diretamente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Formula de clamp de fim de mes off-by-one na especificacao do plano**

- **Found during:** Task 2
- **Issue:** O `<action>` prescreve `new Date(Date.UTC(ano, mes, 0)).getUTCDate()` como "o ultimo dia do mes seguinte". Com `mes` 1-based isso e o ultimo dia do mes **corrente** — para `2021-01-31` da 31 e monta `"2021-02-31"`, uma data invalida. O `<behavior>` do mesmo plano exige `28/02`.
- **Fix:** `Date.UTC(ano, mes + 1, 0)`. O `<behavior>` (autoridade) foi codificado nos testes antes da implementacao, entao a formula errada teria falhado em RED.
- **Files modified:** `lib/billing/asaas/datas.ts`
- **Commit:** `2526d40`

**2. [Rule 3 - Blocker] `.gitignore` impedia versionar o template de ambiente**

- **Found during:** Task 1
- **Issue:** `.gitignore` ignora `.env*`, o que inclui `.env.example`. O arquivo exigido pela Task 1 nunca poderia ser commitado.
- **Fix:** Excecao `!.env.example` com comentario justificando (template sem segredos e a unica documentacao executavel das variaveis exigidas).
- **Files modified:** `.gitignore`
- **Commit:** `048fa2a`

### Adjustments

**3. Mencoes literais removidas de comentarios para satisfazer gates de grep**

Os `<acceptance_criteria>` usam greps de arquivo inteiro (`grep -c "setMonth" datas.ts == 0`, `grep -c "Authorization" client.ts == 0`), que contam ocorrencias em comentarios. Os docblocks que explicavam **por que** esses padroes sao proibidos foram reescritos sem citar os tokens ("os mutadores de mes nativos do `Date`", "nao e um esquema de bearer token"). O conteudo normativo foi preservado.

## Known Gaps

### BLOQUEADO: `.env.example` nao pode ser criado por este agente

`.env.example` e o unico artefato da Task 1 que **nao** foi entregue. A ferramenta de escrita e negada para o padrao `.env*` pelas configuracoes de permissao do usuario (regra de nivel global — nao existe `.claude/settings.json` no projeto):

```
File is covered by a Read deny rule in your permission settings and cannot be written.
```

Contornar uma regra de negacao de permissao via shell **nao** foi feito de proposito: a regra existe para proteger arquivos de ambiente, e burla-la silenciosamente e exatamente o comportamento que ela previne.

**Acao humana necessaria** — uma das duas:
1. Criar `.env.example` manualmente (conteudo pronto abaixo), ou
2. Liberar `.env.example` na regra de permissao e reexecutar apenas esta parte.

O `!.env.example` do `.gitignore` ja esta commitado, entao o arquivo passa a ser versionavel assim que existir.

Conteudo a criar na raiz do projeto:

```dotenv
# Copie este arquivo para `.env` e preencha com os valores do seu ambiente.
# Todos os valores abaixo sao EXEMPLOS — nenhum segredo real vive neste arquivo.

# --- Banco de dados ---
DATABASE_URL="postgresql://USUARIO:SENHA@localhost:5432/gestor_estoque"

# --- Autenticacao ---
# Gere com: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
JWT_SECRET="troque-por-um-valor-aleatorio-longo"

# --- Armazenamento de imagens (Cloudflare R2, SDK compativel com S3) ---
R2_ACCOUNT_ID="id-da-conta-cloudflare"
R2_ACCESS_KEY_ID="access-key-do-token-r2"
R2_SECRET_ACCESS_KEY="secret-key-do-token-r2"
R2_BUCKET="gestor-estoque"
R2_PUBLIC_URL="https://imagens.exemplo.com"

# --- Gateway de pagamento (Asaas) ---
# Base da API v3. Sandbox conforme D-06; producao e https://api.asaas.com/v3
ASAAS_API_URL="https://api-sandbox.asaas.com/v3"

# Chave de API do painel do Asaas. Vai no header `access_token` de toda chamada.
ASAAS_API_KEY="chave-de-api-do-painel-asaas"

# ATENCAO: este token NAO vem do painel — nos o geramos e o registramos ao criar
# o webhook. Ele volta em todo evento no header `asaas-access-token`.
# Gere com (64 chars, dentro do limite 32..255 do Asaas):
#   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
ASAAS_WEBHOOK_TOKEN="gere-64-chars-hexadecimais"

# Base do checkout hospedado, para montar a URL quando `link` vem nulo.
# Producao: https://asaas.com/checkoutSession/show
# O host de sandbox abaixo e a suposicao A1, a confirmar no plano 03-07.
ASAAS_CHECKOUT_BASE_URL="https://sandbox.asaas.com/checkoutSession/show"

# --- Aplicacao ---
# Origem publica. Compoe as URLs de callback e a URL do webhook. Sem barra final.
APP_BASE_URL="http://localhost:3000"
```

### Fora de escopo (pre-existente, nao tocado)

- `npx tsc --noEmit` sai **1**, com um unico erro: `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`. `LayoutProps` e um tipo global **gerado pelo Next.js 16** em `.next/types/**`, incluido pelo `tsconfig.json`. O worktree nao tem `.next` construido, entao o tipo nao existe. Nenhum erro vem de `lib/billing`. Some depois de um `next dev`/`next build`.
- `npm run lint`: 0 erros, 1 warning pre-existente (`'Link' is defined but never used` em `app/registro/page.tsx`), nenhum nos arquivos deste plano.

## Requirements

`requirements-completed` esta **vazio de proposito**. GTW-01 e GTW-03 aparecem no frontmatter do plano, mas ambos so se completam com os planos que consomem esta fundacao (criacao do checkout, handler do webhook, escrita monotonica). Marca-los agora seria falso. O orquestrador deve fecha-los ao final da fase.

## Verification

| Gate | Resultado |
|------|-----------|
| `npx vitest run lib/billing/asaas/config.test.ts` | 17 casos (exigido >= 6) |
| `npx vitest run lib/billing/asaas/datas.test.ts` | 18 casos (exigido >= 11) |
| `npx vitest run lib/billing/asaas/client.test.ts` | 11 casos (exigido >= 8) |
| `npx vitest run lib/billing` | 3 arquivos, 46 testes, verde |
| Suite completa `npx vitest run` | 74 arquivos, 571 testes, verde (sem regressao) |
| `npm run lint` | 0 erros novos |
| `grep -c '?? ""' config.ts` | 0 |
| `grep -c "setMonth" datas.ts` | 0 |
| `grep -c "Date.now()" datas.ts` | 0 |
| `grep -c 'from "@/lib/fuso-sao-paulo"' datas.ts` | 1 |
| `grep -cE "3 \* 60 \* 60\|10800000\|getTimezoneOffset" datas.ts` | 0 |
| `grep -c 'from "@/lib/avaliar-acesso"' datas.test.ts` | 1 |
| `grep -c "Authorization" client.ts` | 0 |
| `access_token` / `AbortSignal.timeout` em client.ts (nao-comentario) | 1 / 1 |
| `chargeTypes` em client.ts (nao-comentario) | 1, valor `["RECURRENT"]` |
| `grep -cE "creditCard\|cpfCnpj\|customerData\|pixTransaction\|bankSlipUrl\|invoiceUrl\|transactionReceiptUrl" tipos.ts` | 0 |
| `npx tsc --noEmit` | 1 erro pre-existente e ambiental (ver Known Gaps) |
| Gates de `.env.example` | **NAO EXECUTADOS** — arquivo bloqueado por permissao |

## Threat Model Coverage

| Threat | Disposicao | Como ficou |
|--------|-----------|------------|
| T-03-06 (EoP, config) | mitigado | `obrigatorio()` lanca em `undefined` e em `""`; 15 casos de teste cobrindo os cinco acessores |
| T-03-07 (Info disclosure, log) | mitigado | Log limitado a metodo, caminho, status e `slice(0, 500)`; teste espiona `console.error` com corpo de 4000 chars |
| T-03-08 (Info disclosure, tipos) | mitigado | Nenhum campo de cartao/PII declarado; gate de grep em 0 |
| T-03-09 (DoS, chamada pendurada) | mitigado | `AbortSignal.timeout(15_000)` em toda chamada; teste assere `instanceof AbortSignal` |
| T-03-10 (Tampering, acessoAte) | mitigado | Funcao pura provada com o relogio movido entre duas chamadas identicas |
| T-03-11 (Spoofing, tokenizacao) | transferido | Nenhum metodo de tokenizacao; `grep -ci tokenize` em client.ts = 0 |
| T-03-SC (Tampering, npm) | mitigado | Zero pacotes instalados — so `fetch` e `Intl` nativos |

## Commits

| Hash | Tipo | Descricao |
|------|------|-----------|
| `54ff404` | test | RED — acessores fail-fast do Asaas |
| `048fa2a` | feat | GREEN — `config.ts` + excecao no `.gitignore` |
| `ea76022` | test | RED — aritmetica de datas do Asaas |
| `2526d40` | feat | GREEN — `datas.ts` com clamp corrigido |
| `0d005b1` | test | RED — cliente HTTP do Asaas |
| `51b14b0` | feat | GREEN — `tipos.ts` + `client.ts` |

## TDD Gate Compliance

As tres tasks seguiram RED → GREEN com commits separados. Cada RED foi executado e falhou por modulo inexistente antes do GREEN correspondente. Nenhuma fase REFACTOR foi necessaria.

## Notes for Next Plans

- **03-04 (checkout):** `asaasClient.criarCheckout` ja monta o corpo inteiro; o chamador so fornece `CriarCheckoutInput`. A URL do checkout deve **preferir `checkout.link`** quando nao for nulo e so entao cair para `${asaasCheckoutBaseUrl()}?id=${checkout.id}`.
- **03-05/03-06 (webhook):** use `acessoAteAposPagamento(payment.dueDate)` diretamente no `WHERE` da escrita monotonica. A pureza da funcao e o que dispensa `if` de comparacao na aplicacao.
- **03-07 (sandbox):** confirmar A1 (host de checkout em sandbox) e A5 (`endDate` omitido) na primeira chamada real.
- Antes de qualquer plano que rode a aplicacao: `.env.example` ainda precisa ser criado (ver Known Gaps).

## Self-Check: PASSED

Todos os arquivos declarados existem em disco e todos os commits existem no historico do branch (verificado apos a escrita deste arquivo).
