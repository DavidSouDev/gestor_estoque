---
phase: 01-pr-requisitos-de-produ-o
plan: 01
subsystem: infra
tags: [prisma, singleton, connection-pool, next-bundle-layers]
requires: []
provides:
  - "Singleton de PrismaClient válido em todos os ambientes (um pool por processo)"
  - "Gate automatizado do singleton em lib/prisma.test.ts"
affects:
  - "Toda query Prisma do app (lib/prisma.ts é o ponto único de acesso ao banco)"
  - "Fase 3 (webhooks) e Fase 5 (worker diário) — novos pontos de entrada que herdam o pool corrigido"
tech_stack:
  added: []
  patterns:
    - "Factory module-local (createPrismaClient) para tirar leitura de env do tempo de import"
    - "Publicação incondicional em globalThis como escopo compartilhado entre camadas de bundle do Next"
    - "Teste com vi.unmock + import dinâmico para escapar do mock global de tests/setup/prisma-mock.ts"
key_files:
  created:
    - lib/prisma.test.ts
  modified:
    - lib/prisma.ts
    - .planning/codebase/CONCERNS.md
decisions:
  - "Atribuição a globalThis é incondicional (sem guarda por ambiente) — globalThis é o único escopo compartilhado entre as camadas de bundle do Next"
  - "DATABASE_URL passa a ser lido dentro da factory, não em tempo de import do módulo"
  - "Dimensionamento de max do pool e escolha entre URL pooled vs. direta permanecem fora de escopo (entrada da fase de deploy/hosting)"
metrics:
  duration_minutes: 6
  tasks_completed: 2
  files_changed: 3
  completed_at: "2026-08-31"
requirements: [INFRA-01]
---

# Phase 01 Plan 01: Correção do Singleton do Prisma — Summary

Singleton de `PrismaClient` passa a ser publicado em `globalThis` em todos os ambientes, eliminando os pools de conexão redundantes que o Next.js abria uma vez por camada de bundle em produção.

## What Was Built

**Task 1 — `lib/prisma.ts` + `lib/prisma.test.ts` (commit `7eed1db`)**

O bug do INFRA-01 era a guarda `if (process.env.NODE_ENV !== "production")` em volta da atribuição do client ao `globalThis`: em produção o client nunca era publicado no escopo global, então cada camada de bundle do servidor do Next (`rsc`, `ssr`, `api-node`, `action-browser`, `instrument`) instanciava o seu próprio `PrismaClient`, cada um com o seu próprio `pg.Pool` (`max` default = 10).

Três mudanças, conforme RESEARCH § Pattern 1:

1. A construção do client foi extraída para a factory module-local `createPrismaClient()`, que instancia o `PrismaPg` **dentro** dela. Efeito colateral desejado (T-01-11): `process.env.DATABASE_URL` deixa de ser materializado em tempo de import por qualquer camada que apenas importe o módulo.
2. O cast `globalThis as unknown as { prisma: PrismaClient | undefined }` e o fallback `??` foram preservados sem alteração.
3. A guarda por ambiente foi removida — `globalForPrisma.prisma = prisma;` agora é incondicional, com um comentário explicando que o cache de módulos do Node não basta porque camadas de bundle distintas instanciam o módulo separadamente.

**Task 2 — `.planning/codebase/CONCERNS.md` (commit `fea100d`)**

Apenas a seção "Prisma Client Singleton Misconfiguration (Production Bug)" foi reescrita (título, severidade e listagem de arquivo preservados; nenhum outro cabeçalho `###` tocado). A afirmação falsa "every module that imports `lib/prisma.ts` creates a NEW `PrismaClient` instance" foi substituída pelo mecanismo real e verificável, com a referência `node_modules/next/dist/lib/constants.js:331-372`. O bloco "Fix approach" agora reflete o código de fato implementado, e a seção está marcada como resolvida na Fase 1 — plano 01-01.

## RED observado antes do fix

Conforme exigido pelo plano (RESEARCH § Pitfall 4 — sem o RED observado, um revisor futuro pode concluir que o bug não existe e reverter o fix), `lib/prisma.test.ts` foi criado **primeiro** e executado contra o código antigo:

```
 ❯ lib/prisma.test.ts (2 tests | 2 failed) 104ms
     × reaproveita a mesma instância entre reavaliações do módulo em produção 96ms
     × publica o client no globalThis em produção 5ms

 FAIL  reaproveita a mesma instância entre reavaliações do módulo em produção
RangeError: Maximum call stack size exceeded

 FAIL  publica o client no globalThis em produção
AssertionError: expected undefined to be defined
 ❯ lib/prisma.test.ts:34:57

 Test Files  1 failed (1)
      Tests  2 failed (2)
```

Nota sobre o `RangeError` no teste 1: a asserção `toBe` falhou (as duas instâncias eram objetos distintos, exatamente o bug) e o `RangeError` veio do serializador de diff do Vitest ao tentar comparar profundamente dois proxies de `PrismaClient`. É um sinal de falha legítimo, apenas com mensagem ruidosa. Após o fix o diff não é mais gerado.

Após o fix, o mesmo comando ficou verde:

```
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

## Verification Results

| Verificação | Resultado |
|-------------|-----------|
| `npx vitest run lib/prisma.test.ts` | 2 testes passando, exit 0 |
| `npx vitest run lib/` | 11 arquivos, 51 testes passando |
| `npx vitest run` (suíte completa) | 66 arquivos, 443 testes passando — zero regressões |
| `npx tsc --noEmit` | exit 0, sem erro novo |
| `npm run lint` | exit 0 (1 warning pré-existente e não relacionado em `app/registro/page.tsx`) |
| `grep -c 'NODE_ENV' lib/prisma.ts` | `0` |
| `grep -c 'function createPrismaClient' lib/prisma.ts` | `1` |
| `grep -c 'globalForPrisma.prisma = prisma'` (fora de comentários) | `1` |
| `grep -c 'DATABASE_URL' lib/prisma.ts` | `1`, dentro do corpo de `createPrismaClient` |
| `grep -c 'every module that imports' CONCERNS.md` | `0` |
| `grep -c 'constants.js' CONCERNS.md` | `1` |
| `grep -c 'createPrismaClient' CONCERNS.md` | `2` |
| `grep -c 'Fase 1' CONCERNS.md` | `1` |
| `git diff` em CONCERNS.md toca outros `###` | não |

## Threat Model Coverage

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-01-07 (DoS — pools redundantes) | mitigate | Mitigado: atribuição incondicional a `globalThis`, com gate em `lib/prisma.test.ts`. Verificação de contagem real de conexões fica para o plano 01-05 |
| T-01-11 (Info disclosure — `DATABASE_URL` em tempo de import) | mitigate | Mitigado: leitura movida para dentro de `createPrismaClient()` |
| T-01-12 (Tampering — documentação com mecanismo falso) | mitigate | Mitigado: mecanismo corrigido com referência verificável em CONCERNS.md |
| T-01-SC (supply chain) | accept | Zero pacotes instalados nesta execução, como previsto |

## Deviations from Plan

**1. [Ajuste de redação] Comentário reescrito para não conter a string literal `NODE_ENV`**
- **Encontrado em:** Task 1, na verificação dos critérios de aceite
- **Conflito:** o plano pedia (a) um comentário explicando por que não há guarda de `NODE_ENV` e (b) `grep -c 'NODE_ENV' lib/prisma.ts` retornando `0`. A primeira redação do comentário citava `NODE_ENV` literalmente e fazia o grep retornar `1`.
- **Resolução:** o comentário foi reescrito para "Atribuição incondicional, sem guarda por ambiente", preservando integralmente a explicação do mecanismo (camadas de bundle, `pg.Pool` por instância, `globalThis` como escopo compartilhado) e satisfazendo os dois critérios. Nenhuma mudança de comportamento.
- **Arquivo:** `lib/prisma.ts`
- **Commit:** `7eed1db`

Fora isso, o plano foi executado exatamente como escrito. Nenhuma regra de desvio 1–4 foi acionada; nenhum pacote instalado; `prisma/schema.prisma` intocado; nenhuma migration.

## Out of Scope (confirmado)

Registrado conforme pedido pelo plano (RESEARCH § Open Questions #5): o **dimensionamento de `max` do pool** e a **escolha entre connection string *pooled* e direta** continuam fora de escopo deste plano. Ambos são entrada da fase de deploy/hosting, que também decide a plataforma do cron do worker diário (bloqueador já registrado em STATE.md). Este plano garante apenas *um pool por processo*; quantos processos existem e quão grande cada pool deve ser é decisão de hosting.

## Known Stubs

Nenhum. As duas tarefas entregaram código e documentação completos, sem placeholders.

## Self-Check: PASSED

- `lib/prisma.ts` — FOUND
- `lib/prisma.test.ts` — FOUND
- `.planning/codebase/CONCERNS.md` — FOUND
- commit `7eed1db` — FOUND
- commit `fea100d` — FOUND
