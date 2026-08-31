---
phase: 03-gateway-asaas-e-ingest-o-de-webhooks
plan: 03
subsystem: payments
tags: [asaas, webhook, zod, validacao, redacao, pii, fixtures]

status: BLOCKED_AT_CHECKPOINT
plan_complete: false

requires:
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    provides: motor de acesso puro (avaliarAcesso) que consumira os fatos derivados do webhook
provides:
  - "(pendente) schemas zod nao-estritos do envelope Asaas"
  - "(pendente) redigirEnvelope — allowlist positiva contra PII/dados de cartao"
  - "(pendente) fixtures reusaveis de envelope Asaas"
affects: [03-05, 03-06]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions: []

patterns-established: []

requirements-completed: []

duration: 0min (bloqueado no gate)
completed: null
---

# Phase 03 Plan 03: Schemas e Redacao do Payload Asaas — PARCIAL (bloqueado no gate humano)

**Execucao pausada na Task 1 (`checkpoint:human-verify`, `gate="blocking-human"`): o install de `zod@^4.5.4` exige aprovacao humana explicita e nenhuma tarefa foi executada ainda.**

## Status

| Task | Nome | Estado |
|------|------|--------|
| 1 | Gate de legitimidade do pacote `zod` (veredito SUS) | **AGUARDANDO OPERADOR HUMANO** |
| 2 | Instalar zod pinado em `^4.5.4` | Nao iniciada (bloqueada pela Task 1) |
| 3 | `eventos.ts` (schemas nao-estritos + redacao) e fixtures | Nao iniciada (bloqueada pela Task 1) |

**Tasks completas: 0/3.** Nenhum commit de codigo foi produzido por este plano.

## Performance

- **Duration:** 0 min de implementacao (apenas leitura de contexto + verificacao de precondicao do gate)
- **Tasks:** 0 completas de 3
- **Files modified:** 0 (fora este SUMMARY)

## Precondicao do gate — VERIFICADA

O criterio de aceitacao da Task 1 exige provar que nenhum install ocorreu antes da aprovacao:

```
$ git diff --stat -- package.json package-lock.json
(vazio)
```

Estado atual das dependencias, confirmado por `node -e` sobre `package.json`:

| Pacote | Estado |
|--------|--------|
| `zod` | **ABSENT** (nem em `dependencies` nem em `devDependencies`) |
| `asaas` (proibido) | ABSENT |
| `asaas-sdk` (proibido) | ABSENT |
| total de `dependencies` | 10 (inalterado) |

Nenhum comando `npm install` foi executado. A arvore esta limpa no momento do checkpoint.

## Gate pendente: legitimidade do `zod`

O `03-RESEARCH.md` § Package Legitimacy Audit devolveu veredito **SUS** para a unica dependencia
nova da fase. O sinal disparado foi o heuristico `too-new`, que mede a data da **ultima
publicacao** (`4.5.4`, publicada 2026-08-29) e nao a idade do pacote — leitura registrada como
suposicao **A7** no Assumptions Log e avaliada pelo pesquisador como quase certamente falso
positivo. Ainda assim o protocolo do projeto proibe auto-aprovacao: `workflow.auto_advance`
nao se aplica a `gate="blocking-human"`.

**Aguardando do operador, textualmente (exigido pelo acceptance criteria da Task 1):**

1. O repositorio observado em npmjs.com
2. O numero de downloads semanais observado
3. A decisao: `aprovado` ou `rejeitado`

**Se rejeitado:** `zod` nao deve ser instalado. A alternativa registrada em `03-RESEARCH.md`
§ Alternatives Considered (type guards manuais escritos a mao, sem dependencia nova) passa a ser
o caminho, e as Tasks 2 e 3 precisam ser **replanejadas** antes de qualquer execucao.

## Deviations from Plan

Nenhuma. O plano foi seguido exatamente: a Task 1 e a primeira task e e um gate bloqueante,
portanto a execucao parou nela conforme especificado.

## Self-Check: PASSED

- Precondicao do gate verificada (`git diff --stat` de `package.json`/`package-lock.json` vazio)
- Nenhum artefato de codigo reivindicado como criado (nenhum foi)
- Nenhuma escrita em STATE.md ou ROADMAP.md (propriedade do orquestrador)

## Proximo passo

Retomar este plano a partir da **Task 1** apos a resposta do operador. As Tasks 2 e 3
permanecem integralmente por executar.
