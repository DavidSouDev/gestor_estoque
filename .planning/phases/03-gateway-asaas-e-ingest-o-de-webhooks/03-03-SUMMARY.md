---
phase: 03-gateway-asaas-e-ingest-o-de-webhooks
plan: 03
subsystem: payments
tags: [asaas, webhook, zod, validacao, redacao, pii, fixtures, tdd]

status: COMPLETE
plan_complete: true

requires:
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    provides: motor de acesso puro (avaliarAcesso) que consumira os fatos derivados do webhook
provides:
  - "schemas zod nao-estritos do envelope Asaas e dos objetos por evento"
  - "redigirEnvelope — allowlist positiva que remove PII/dados de cartao antes de qualquer persistencia"
  - "EVENTOS_ASSINADOS — lista canonica dos 12 eventos registrados no Asaas"
  - "fixtures reusaveis de envelope Asaas (PAYMENT_/CHECKOUT_/SUBSCRIPTION_)"
affects: [03-05, 03-06, 03-07]

tech-stack:
  added: ["zod@^4.5.4"]
  patterns:
    - "Validacao tolerante de payload de terceiro: safeParse sobre schema nao-estrito"
    - "Redacao por allowlist positiva antes de persistir payload de fornecedor"
    - "Fixture que carrega dados sensiveis de proposito para tornar o teste de redacao nao-vacuo"

key-files:
  created:
    - lib/billing/asaas/eventos.ts
    - lib/billing/asaas/eventos.test.ts
    - tests/helpers/asaas.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Gate de legitimidade do zod@^4.5.4 APROVADO: repo colinhacks/zod, 274.747.331 downloads/semana, sem postinstall — veredito SUS confirmado como falso positivo do heuristico too-new (fecha A7)"
  - "zod ja existia na arvore como dep transitiva DEV (4.4.3); o install promoveu para dep de producao direta (4.5.4) sem trazer nenhum pacote novo"
  - "Schemas usam z.object() (strip) e nao z.looseObject() (passthrough): ambos sao nao-estritos, mas strip nao propaga campo desconhecido do Asaas para o resultado parseado — defesa em profundidade para GTW-01"
  - "Comentarios do arquivo evitam as sequencias literais .strict() e .parse( para que os gates de grep continuem sendo sinal real sobre o codigo, nao ruido de prosa"
  - "Nao-vacuidade da redacao provada por reversao temporaria: com a implementacao ingenua (persistir payload bruto), os 4 testes de redacao falham"

patterns-established:
  - "Pattern: schema de webhook de terceiro declara SO os campos consumidos, nunca espelha o DTO do fornecedor"
  - "Pattern: allowlist positiva (nunca denylist) para qualquer payload externo que va ao banco"

requirements-completed: []

duration: 18min
completed: 2026-08-31
---

# Phase 03 Plan 03: Schemas e Redacao do Payload Asaas

**Camada declarativa de ingestao do Asaas: schemas zod deliberadamente tolerantes a campos novos (para nao pausar a fila de sincronizacao) e uma funcao de redacao por allowlist positiva que impede dados de cartao e CPF/CNPJ de alcancarem o banco.**

## Performance

- **Duration:** ~18 min (19:17 → 19:35)
- **Tasks:** 3/3
- **Files modified:** 5 (3 criados, 2 modificados)
- **Testes:** 17 novos casos; suite total 525 → 542, 71 → 72 arquivos

## Accomplishments

### Task 1 — Gate humano de legitimidade do `zod`: APROVADO

O `03-RESEARCH.md` § Package Legitimacy Audit devolveu veredito **SUS** para a unica dependencia
nova da fase. O gate era `gate="blocking-human"` e **nao auto-aprovavel**. Registro do operador,
reverificado de forma independente via `npm view zod` e a API de downloads do npm:

| Sinal | Valor observado | Confere |
|-------|-----------------|---------|
| **Repositorio** | `git+https://github.com/colinhacks/zod.git` (repo oficial colinhacks) | Sim |
| **Mantenedor** | `colinhacks <colinmcd94@gmail.com>` | Sim |
| **Downloads semanais** | **274.747.331** | Sim (ordem de 200M+) |
| **Scripts de install** | Nenhum `postinstall`/`preinstall` (so `prepublishOnly`/`build`/`test`, que nao rodam no install do consumidor) | Sim |
| **Linhagem** | `4.5.4` dentro da linha continua 4.x, nao release isolado de conta nova | Sim |

**Decisao: `aprovado`.** O flag `SUS` veio do heuristico `too-new`, que mede a data da ultima
publicacao e nao a idade/confianca do pacote — **falso positivo confirmado**. Fecha a suposicao
**A7** do Assumptions Log.

**Precondicao verificada antes da aprovacao:** `git diff --stat -- package.json package-lock.json`
vazio no momento do checkpoint; nenhum install anterior ao gate.

### Task 2 — `zod@^4.5.4` em `dependencies`

Descoberta relevante durante a verificacao: **`zod` ja existia na arvore como dependencia
transitiva de DESENVOLVIMENTO na versao 4.4.3** (`"dev": true` no lockfile). O install promoveu-o
a dependencia de producao direta em 4.5.4. Consequencia pratica: **nenhum pacote novo entrou na
arvore** — o diff do lockfile e de 5 linhas, restrito a propria entrada do `zod`. Isso reduz ainda
mais a superficie do risco avaliado no gate, ja que o pacote ja era transitivamente confiado.

`zod` entrou em `dependencies` (nao `devDependencies`) porque roda em runtime no route handler de
webhook, nao apenas em teste. Nenhum pacote proibido (`asaas`, `asaas-sdk`) presente.

### Task 3 — `eventos.ts`, testes e fixtures (TDD)

**`lib/billing/asaas/eventos.ts`** — quatro schemas nao-estritos (`envelopeSchema`,
`pagamentoSchema`, `checkoutSchema`, `assinaturaSchema`), a lista `EVENTOS_ASSINADOS` com os 12
eventos, e `redigirEnvelope`.

O comentario no topo do arquivo documenta a regra estruturante com a citacao literal do Asaas: novos
atributos entram sem aviso, e excecoes causadas por isso interrompem a fila de sincronizacao — 15
falhas consecutivas pausam a fila e eventos parados 14 dias sao apagados permanentemente. Dai as
tres consequencias inegociaveis: nenhum modo estrito, nenhum parse que lanca, e cada schema
declarando so o que o processamento consome.

`EVENTOS_ASSINADOS` traz comentario explicito de que **nao e filtro de rejeicao**: evento fora da
lista e registrado no ledger e respondido com 200 + log, nunca com erro.

`redigirEnvelope` e uma **allowlist positiva**: constroi um objeto novo copiando so as chaves
permitidas (`id`, `event`, `dateCreated` no topo; 7 campos de `payment`; 4 de `checkout`; 4 de
`subscription`). O comentario explica por que allowlist e nao denylist — uma denylist **falha
aberta** no dia em que o Asaas adicionar um campo sensivel novo, e o custo desse erro e PII e dado
de cartao no banco e nos backups de forma permanente. `dateCreated` fica **string**, sem conversao
para `Date` (Pitfall 6). Entrada nao-objeto devolve `{}` sem lancar.

**`tests/helpers/asaas.ts`** — factories com overrides, no formato de `tests/helpers/fixtures.ts`.
`envelopePagamento()` carrega **de proposito** `creditCard`, `customerData.cpfCnpj`,
`pixTransaction`, `bankSlipUrl`, `invoiceUrl` e `transactionReceiptUrl`; sem eles o teste de
redacao passaria trivialmente. `envelopeCheckout()` reproduz fielmente a armadilha do **Pitfall 8**:
`checkout.subscription` tem `cycle`/`nextDueDate` mas **nao tem `id`** — qualquer codigo futuro que
tente ler `checkout.subscription.id` falha em teste, nao em producao.

## Verification Evidence

| Gate | Resultado |
|------|-----------|
| `npx vitest run lib/billing/asaas/eventos.test.ts` | **17 passed** (criterio: >= 11) |
| `npx tsc --noEmit` | exit 0 |
| `npm run test` | **542 passed / 72 arquivos** (era 525/71) |
| `npm run lint` | 0 errors (1 warning pre-existente, ver Deviations) |
| `grep -c "\.strict()" lib/billing/asaas/eventos.ts` | **0** |
| `grep -cE "\.parse\(" lib/billing/asaas/eventos.ts` | **0** |
| `grep -c "creditCard" tests/helpers/asaas.ts` | 5 (criterio: >= 1) |
| `grep -c "cpfCnpj" tests/helpers/asaas.ts` | 3 (criterio: >= 1) |
| `zod` pinado em `^4.5.4` / proibidos ausentes | verificado por `node -e`, exit 0 |

### Prova de nao-vacuidade (reversao temporaria)

Seguindo o padrao estabelecido no plano 02-02, a redacao foi provada por reversao: substituindo
`redigirEnvelope` pela implementacao ingenua (`return bruto`, isto e, persistir o payload bruto —
exatamente o defeito descrito no Pitfall 9), **4 testes falham** com as assercoes esperadas:

```
× nao deixa nenhum campo sensivel sobreviver, em nenhuma profundidade
    AssertionError: expected '{"id":"evt_05b708…' not to contain 'creditCard'
× preserva exatamente os campos que a Fase 5 reconcilia
× sobre envelope de checkout preserva so id, status, customer e externalReference
× e allowlist, nao denylist: um campo sensivel novo do Asaas nao vaza
    AssertionError: expected '{"id":"evt_05b708…' not to contain 'SEGREDO-NAO-PREVISTO'
```

O arquivo foi restaurado integralmente em seguida (`grep -c TEMPORARIO` == 0) e a suite voltou a
17/17.

## TDD Gate Compliance

| Gate | Commit | Estado |
|------|--------|--------|
| RED | `b077e1f` `test(03-03)` | Teste falhando antes da implementacao (`Cannot find package '@/lib/billing/asaas/eventos'`) |
| GREEN | `5687da5` `feat(03-03)` | 17/17 passando |
| REFACTOR | — | Nao necessario; nenhuma mudanca estrutural apos o verde |

Sequencia correta: `test(...)` precede `feat(...)`.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `npx tsc --noEmit` falhava por tipos gerados ausentes

- **Encontrado em:** Task 2 (verificacao pos-install)
- **Problema:** `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`. `LayoutProps<"/">` e um **tipo global gerado** pelo Next 16 em `.next/types/**` (incluido pelo `tsconfig.json`), e este worktree nunca rodou build.
- **Diagnostico:** condicao ambiental do worktree limpo, **nao** relacionada ao `zod`.
- **Correcao:** `npx next typegen` (comando do Next 16.3.0, confirmado em `node_modules/next/dist/cli/next-typegen.js` conforme AGENTS.md). Gera apenas artefatos em `.next/`, que e gitignored — nenhum arquivo de repo alterado.
- **Commit:** nenhum (nada versionado mudou)

### 2. Interpretacao: `z.object()` (strip) em vez de `.passthrough()`

- **O plano dizia:** schemas "com passthrough / tolerancia a campos desconhecidos".
- **O que foi feito:** `z.object()`, que no zod 4 e **nao-estrito** (campo desconhecido nao invalida — `success: true`, que e o requisito real do Pitfall 3) mas **remove** o campo desconhecido do resultado parseado.
- **Por que:** o `<behavior>` do proprio plano especifica "devolve os campos declarados", que e o comportamento de strip. Alem disso, strip e mais seguro para GTW-01: um campo sensivel novo do Asaas nao viaja no objeto parseado. A redacao para persistencia nao e afetada — `redigirEnvelope` opera sobre o payload **bruto**, nao sobre o parseado.
- **Impacto para os planos 03-05/03-06:** se algum consumidor precisar de campos nao declarados, deve le-los do bruto ou declarar o campo no schema — nao contar com passthrough.

### 3. Comentarios reescritos para nao derrotar os gates de grep

Os criterios de aceitacao exigem `grep -c "\.strict()"` == 0 e `grep -cE "\.parse\("` == 0. A
primeira redacao dos comentarios continha as sequencias literais em prosa explicativa, fazendo os
gates acusarem 1 e 1. Os comentarios foram reescritos ("modo estrito", "a variante de parse que
LANCA") preservando o sentido. **O gate nao foi afrouxado** — foi mantido como sinal real sobre o
codigo, com nota no proprio arquivo explicando a restricao a quem for edita-lo.

### Fora de escopo (nao corrigido)

`app/registro/page.tsx:1` — warning `'Link' is defined but never used`. Pre-existente, herdado do
plano 01-04, onde foi mantido deliberadamente (registrado em STATE.md). Nao tocado.

## Requirements

**`requirements-completed` esta vazio de proposito.** O frontmatter do plano associa este trabalho
a **GTW-02** ("endpoint de webhook verifica autenticidade, e idempotente e responde 200
imediatamente"). Este plano entrega apenas a **camada declarativa** que o endpoint vai consumir —
schemas, redacao e fixtures. **Nenhum route handler, verificacao de token, ledger de idempotencia
ou resposta 200 existe ainda**; isso e dos planos 03-05 e 03-06.

Marcar GTW-02 como concluido aqui seria falso. A decisao de fechar o requisito e do orquestrador,
apos os planos que realmente entregam o endpoint.

## Known Stubs

Nenhum. Todos os simbolos exportados tem implementacao real e coberta por teste.

## Threat Flags

Nenhuma superficie nova fora do `<threat_model>` do plano. As tres disposicoes `mitigate` do
registro STRIDE foram atendidas:

| Threat ID | Mitigacao entregue |
|-----------|--------------------|
| T-03-SC | Gate `blocking-human` executado antes do install; versao pinada `^4.5.4`; gate automatizado provando ausencia de `asaas`/`asaas-sdk` |
| T-03-12 | `redigirEnvelope` como allowlist positiva; nao-vacuidade provada por fixture que contem `creditCard`/`cpfCnpj` + reversao temporaria |
| T-03-13 | Zero modo estrito, zero parse que lanca; campo desconhecido devolve `success: true` |

## Self-Check: PASSED

Arquivos criados — verificados em disco:

- `lib/billing/asaas/eventos.ts` — FOUND
- `lib/billing/asaas/eventos.test.ts` — FOUND
- `tests/helpers/asaas.ts` — FOUND

Commits — verificados em `git log`:

- `7ef598f` chore(03-03) — FOUND
- `b077e1f` test(03-03) — FOUND
- `5687da5` feat(03-03) — FOUND

Nenhuma escrita em STATE.md ou ROADMAP.md (propriedade do orquestrador, modo worktree).

## Notes for Downstream Plans

- **03-05 / 03-06:** importem os fixtures de `@/tests/helpers/asaas`. `envelopeCheckout()` **nao**
  tem `checkout.subscription.id` de proposito (Pitfall 8) — o `sub_...` so vem de
  `envelopeAssinatura()` / `SUBSCRIPTION_CREATED`.
- **Persistencia:** sempre `redigirEnvelope(bruto)` antes de gravar ou logar. Nunca `console.error`
  com o corpo cru.
- **03-07:** `EVENTOS_ASSINADOS` e a lista exata a registrar em `POST /v3/webhooks`.
