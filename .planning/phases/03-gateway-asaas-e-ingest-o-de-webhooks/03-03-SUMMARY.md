---
phase: 03-gateway-asaas-e-ingest-o-de-webhooks
plan: 03
subsystem: payments
tags: [asaas, webhook, zod, validacao, redacao, pii, fixtures]

status: BLOCKED_ON_TOOLING
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

key-decisions:
  - "Gate de legitimidade do zod@^4.5.4: APROVADO pelo operador em 2026-08-31 (veredito SUS confirmado como falso positivo do heuristico too-new)"

patterns-established: []

requirements-completed: []

duration: 0min (bloqueado)
completed: null
---

# Phase 03 Plan 03: Schemas e Redacao do Payload Asaas — PARCIAL (bloqueado no install)

**O gate humano da Task 1 foi APROVADO e esta registrado abaixo, mas a Task 2 nao pode ser executada: o comando `npm install zod@^4.5.4` foi negado pelo classificador de permissoes do Claude Code, nao pelo plano.**

## Status

| Task | Nome | Estado |
|------|------|--------|
| 1 | Gate de legitimidade do pacote `zod` (veredito SUS) | **APROVADO** — veredito registrado abaixo |
| 2 | Instalar zod pinado em `^4.5.4` | **BLOQUEADA** — `npm install` negado pelo sistema de permissoes |
| 3 | `eventos.ts` (schemas nao-estritos + redacao) e fixtures | Nao iniciada (depende do `zod` da Task 2) |

**Tasks completas: 1/3** (apenas o gate de verificacao, que nao produz codigo).

## Task 1 — Gate de legitimidade do `zod`: APROVADO

O acceptance criteria da Task 1 exige o registro textual do repositorio observado, dos downloads
semanais observados e da decisao. Registro do operador, verificado independentemente via
`npm view zod` e a API de downloads do npm:

| Sinal verificado | Valor observado | Confere com a auditoria |
|------------------|-----------------|--------------------------|
| **Repositorio** | `git+https://github.com/colinhacks/zod.git` (repo oficial colinhacks) | Sim |
| **Mantenedor** | `colinhacks <colinmcd94@gmail.com>` | Sim |
| **Downloads semanais** | **274.747.331** | Sim (ordem de 200M+) |
| **Scripts de install** | Nenhum `postinstall`/`preinstall` (so `prepublishOnly`/`build`/`test`, que nao rodam no install do consumidor) | Sim |
| **Linhagem da versao** | `4.5.4` faz parte da linha continua 4.x, nao um release isolado de conta nova | Sim |

**Decisao: `aprovado`.** O flag `SUS` foi confirmado como **falso positivo** do heuristico
`too-new`, que mede a data da ultima publicacao e nao a idade/confianca do pacote. Isto fecha a
suposicao **A7** do Assumptions Log de `03-RESEARCH.md`.

**Precondicao do gate verificada antes da aprovacao:** `git diff --stat -- package.json package-lock.json`
estava vazio no momento do checkpoint; `zod`, `asaas` e `asaas-sdk` todos ausentes; 10 `dependencies`.

## Task 2 — BLOQUEADA pelo sistema de permissoes

Com a aprovacao humana em maos, o comando exato prescrito pelo plano foi tentado:

```
npm install zod@^4.5.4
```

Resultado: **negado pelo classificador de auto-mode do Claude Code** ("Blocked by classifier"),
em duas tentativas (com e sem sandbox). Este bloqueio e do **ambiente de execucao**, nao do plano
nem do operador — a aprovacao de legitimidade foi concedida.

Estado atual confirmado, inalterado:

- `node_modules/zod` — **ausente**
- `package.json` / `package-lock.json` — sem diff
- `asaas` / `asaas-sdk` — ausentes (nenhum pacote proibido entrou)

### Por que nenhum contorno foi tentado

O protocolo do executor exclui explicitamente instalacoes de pacote das regras de auto-fix
(Rule 3 — "package manager installs"). Nao foi tentado: instalar um pacote de nome parecido,
trocar por outra biblioteca de validacao, nem vendorizar `zod` a mao. Nenhuma dessas acoes esta
autorizada, e a substituicao silenciosa de um pacote e exatamente o risco que o gate existe para
prevenir.

A alternativa registrada em `03-RESEARCH.md` § Alternatives Considered (type guards manuais, sem
dependencia nova) **tambem nao foi adotada por conta propria**: o plano determina que ela so entra
em cena se o gate for *rejeitado*, e exige replanejamento das Tasks 2 e 3 antes de qualquer
execucao. O gate foi aprovado, entao o caminho correto continua sendo `zod`.

## Deviations from Plan

Nenhuma deviation de codigo. O unico desvio e a interrupcao da Task 2 por falta de permissao de
ambiente para executar `npm install`, reportada ao inves de contornada.

## Self-Check: PASSED

- Gate da Task 1 registrado com os tres itens exigidos (repositorio, downloads, decisao)
- Nenhum artefato de codigo reivindicado como criado (nenhum foi)
- Nenhum pacote proibido presente
- Nenhuma escrita em STATE.md ou ROADMAP.md (propriedade do orquestrador)

## Proximo passo

Desbloquear a execucao de `npm install` para este executor (regra de permissao Bash) e retomar a
partir da **Task 2**. O gate da Task 1 **nao precisa ser repetido** — a aprovacao esta registrada
acima. As Tasks 2 e 3 permanecem por executar.
