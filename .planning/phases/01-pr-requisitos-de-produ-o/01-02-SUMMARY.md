---
phase: 01-pr-requisitos-de-produ-o
plan: 02
subsystem: auth
tags: [prisma, react-cache, dal, multi-tenant, fail-closed, vitest, typescript]

# Dependency graph
requires:
  - phase: 01-pr-requisitos-de-produ-o (plano 01-01)
    provides: singleton do Prisma corrigido em lib/prisma.ts (importado por lib/auth-guard.ts)
provides:
  - "lib/auth-guard.ts — DAL de revalidação de conta (revalidarConta) memoizado por request via React.cache"
  - "Interface ContaAtiva exportada: { usuarioId, empresaId, empresaSlug, email, role }"
  - "Contrato fail-closed (D-01): null para conta inexistente/inativa, empresa removida e erro de banco"
  - "lib/auth-guard.test.ts — 5 gates automatizados do DAL"
  - "Ponto de extensão documentado (D-04) onde a Fase 2 pluga avaliarAcesso"
affects: [01-03 (integração em lib/session.ts), 01-04 (integração em lib/api-auth.ts), fase 02 (avaliação de acesso), fase 04 (enforcement/bloqueio)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DAL com React.cache() retornando null em vez de redirect()/notFound() — o chamador decide o modo de falha"
    - "Projeção select explícita e estreita no modelo Usuario (include proibido — arrastaria senhaHash)"
    - "Filtro composto id + empresaId como isolamento multi-tenant em toda query de auth"

key-files:
  created:
    - lib/auth-guard.ts
    - lib/auth-guard.test.ts
  modified: []

key-decisions:
  - "findFirst e não findUnique: findUnique não aceita filtro relacional (empresa.deletedAt), e resolver em duas queries dobraria o custo por request"
  - "Retorno null em vez de exceção: os dois consumidores futuros (requireAdminSession com redirect, requireAuth com AuthError) têm contratos de falha incompatíveis; o try/catch fica inteiramente dentro do DAL"
  - "Somente React.cache (escopo de request); unstable_cache e \"use cache\" descartados por serem cross-request e reintroduzirem a janela de staleness que a fase existe para fechar"
  - "Nenhuma asserção de dedupe nos testes: React.cache é passthrough fora do render do servidor (Pitfall 6) — uma asserção dessas falharia e sugeriria erro inexistente"

patterns-established:
  - "Pattern: DAL de auth memoizado por request — cache(async (...) => {...}) no topo do módulo, try/catch só em volta da chamada Prisma, log com prefixo [auth-guard]"
  - "Pattern: teste de não-vazamento — inspecionar mock.calls[0].select e asserir ausência de senhaHash"

requirements-completed: [INFRA-02]

# Metrics
duration: 5min
completed: 2026-08-31
---

# Phase 01 Plan 02: DAL de revalidação de conta Summary

**`revalidarConta` — DAL fail-closed memoizado por request (React.cache) que confirma no banco, a cada request, que o `Usuario` do token ainda está ativo e que a `Empresa` não foi removida, fechando a janela de 7 dias do JWT**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-08-31T12:58:00Z
- **Completed:** 2026-08-31T13:03:00Z
- **Tasks:** 2
- **Files modified:** 2 (ambos criados)

## Accomplishments

- `lib/auth-guard.ts` criado: uma única query (`prisma.usuario.findFirst`) filtrando `id` + `empresaId` + `ativo: true` + `empresa.deletedAt: null`, com projeção explícita de 5 campos.
- Fail-closed (D-01) implementado e testado: erro de banco loga `[auth-guard] falha ao revalidar conta:` e devolve `null` — nunca relança, nunca autoriza.
- Isolamento multi-tenant (C-07) e não-vazamento de `senhaHash` (C-06) travados por teste automatizado.
- Ponto de extensão da Fase 2 (D-04) registrado no JSDoc, sem nenhuma abstração antecipada de pagamento.
- Suíte completa permanece verde (67 arquivos, 448 testes) — nenhum consumidor foi ligado neste plano.

## Task Commits

Cada task foi commitada atomicamente (ciclo TDD do plano `type: tdd`):

1. **Task 1: lib/auth-guard.test.ts (RED)** — `095a9ac` (test)
2. **Task 2: lib/auth-guard.ts (GREEN)** — `777a25f` (feat)

REFACTOR não foi necessário — a implementação já saiu no formato final do padrão de referência.

### Saída do RED (Task 1)

`npx vitest run lib/auth-guard.test.ts`, antes de existir `lib/auth-guard.ts`:

```
 ❯ lib/auth-guard.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  lib/auth-guard.test.ts [ lib/auth-guard.test.ts ]
Error: Cannot find module './auth-guard' imported from
  /home/david/projetos_pessoais/gestor_estoque/gestor_estoque/lib/auth-guard.test.ts
 ❯ lib/auth-guard.test.ts:4:1

 Test Files  1 failed (1)
      Tests  no tests
```

Após a Task 2: `Test Files 1 passed (1) | Tests 5 passed (5)`.

## Contrato exportado (para os planos 01-03 e 01-04)

Assinatura exata — nenhuma exploração de código necessária para consumir:

```typescript
import { revalidarConta, type ContaAtiva } from "@/lib/auth-guard";

export interface ContaAtiva {
  usuarioId: string;    // Usuario.id
  empresaId: string;    // Usuario.empresaId
  empresaSlug: string;  // Usuario.empresa.slug
  email: string;        // Usuario.email
  role: UserRole;       // enum do @prisma/client ("ADMIN" hoje)
}

revalidarConta(usuarioId: string, empresaId: string): Promise<ContaAtiva | null>
```

Regras de uso para o consumidor:

- `null` significa **não autorize** — cobre conta inexistente, `ativo=false`, `Empresa.deletedAt` preenchido **e** erro de banco. O chamador não deve tentar distinguir os casos nem embrulhar a chamada em `try/catch`.
- O `try/catch` da fase mora inteiramente dentro deste DAL. `lib/session.ts` e `lib/api-auth.ts` não ganham `try/catch` novo (Pitfall 5 — nunca envolver `redirect()` em `try/catch`).
- Argumentos vêm do payload do JWT: `revalidarConta(session.sub, session.empresaId)`.
- Mapeamento para `AuthTokenPayload`: `usuarioId` → `sub`; os demais campos têm o mesmo nome.
- Memoizada por request (`React.cache`): layout + page + componentes do mesmo render compartilham UMA query. Server Actions disparadas pelo browser são requests HTTP separados e disparam a própria query (D-08).

## Files Created/Modified

- `lib/auth-guard.ts` (novo, 72 linhas) — DAL `revalidarConta` + interface `ContaAtiva`; importa o singleton de `@/lib/prisma` e `cache` de `react`.
- `lib/auth-guard.test.ts` (novo, 72 linhas) — 5 casos: conta ativa aprovada, forma exata do `where`, conta revogada → `null`, erro de banco → `null` + `console.error`, `select` sem `senhaHash`.

## Decisions Made

- **`findFirst` em vez de `findUnique`** — `findUnique` não aceita o filtro relacional `empresa: { deletedAt: null }`; resolver em duas queries dobraria o custo por request.
- **Retornar `null` em vez de lançar** — os dois consumidores futuros têm contratos de falha incompatíveis (`redirect()` que lança `NEXT_REDIRECT` vs. `AuthError`); com `null`, cada camada decide sua própria falha.
- **Somente `React.cache`** — `unstable_cache` e `"use cache"` são cross-request/persistentes e reintroduziriam exatamente a janela de staleness que INFRA-02 fecha.
- **Nenhuma asserção de dedupe no teste** — `React.cache` é passthrough fora do render do servidor (RESEARCH § Pitfall 6); tal asserção falharia e levaria à conclusão errada de que o `cache()` foi mal aplicado.
- **`SAFE_SELECT` de `usuario.service.ts` não reutilizado** — não é exportado e carrega campos a mais; o DAL usa a própria projeção de 5 campos.

## Deviations from Plan

None — plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** nenhum. Zero instalações npm (T-01-SC respeitado), zero alterações em `prisma/schema.prisma`, zero variáveis de ambiente novas.

## Issues Encountered

None. Um aviso de lint pré-existente (`'Link' is defined but never used` em `app/registro/page.tsx`) aparece no `npm run lint`, mas é anterior a este plano e fora do escopo — `npm run lint` sai com código 0 (0 errors, 1 warning).

## Verification

| Verificação | Resultado |
|-------------|-----------|
| `npx vitest run lib/auth-guard.test.ts` | 5 passed |
| `npx vitest run` (suíte completa) | 67 arquivos, 448 testes, todos verdes |
| `npm run lint` | exit 0 (0 errors; 1 warning pré-existente e não relacionado) |
| `npx tsc --noEmit` | exit 0, nenhum erro |
| `grep -c "include:" lib/auth-guard.ts` | 0 |
| `grep -cE "unstable_cache\|use cache" lib/auth-guard.ts` | 0 |
| `grep -cE "notFound\|redirect" lib/auth-guard.ts` | 0 |
| `grep -cE "acessoAte\|trialFim\|canceladoEm\|acessoVitalicio" lib/auth-guard.ts` | 0 |
| `try {` fora de comentário em `lib/auth-guard.ts` | exatamente 1 |
| Consumidores intocados (`lib/session.ts`, `lib/api-auth.ts`, `proxy.ts`) | confirmado por `git status` |

## Threat Model Coverage

| Threat ID | Estado |
|-----------|--------|
| T-01-01 (janela de 7 dias do JWT) | mitigado — query por request; Teste 3 |
| T-01-02 (erro de banco autorizando) | mitigado — `catch` devolve `null`; Teste 4 (`mockRejectedValue`) |
| T-01-04 (token de outra empresa) | mitigado — `where` composto `id` + `empresaId`; Teste 2 asserta o `where` inteiro |
| T-01-05 (vazamento de `senhaHash`) | mitigado — `select` explícito, `include` ausente; Teste 5 |
| T-01-09 (cache cross-request) | mitigado — só `React.cache`; asserção de fonte verde |
| T-01-10 (Postgres fora do ar derruba sessões) | aceito (D-01); log com prefixo `[auth-guard]` permite distinguir nos logs. Para o VERIFICATION da fase (plano 01-05) |
| T-01-SC (instalações npm) | aceito — zero instalações neste plano |

## User Setup Required

None — nenhuma configuração de serviço externo, variável de ambiente ou migration.

## Next Phase Readiness

- `revalidarConta` está pronta para ser consumida pelo plano **01-03** (`lib/session.ts` → `getVerifiedSession`) e pelo plano **01-04** (`lib/api-auth.ts` → `requireAuth`). O contrato exato está na seção "Contrato exportado" acima.
- **Atenção para 01-03/01-04:** ao ligar os consumidores, os 14 arquivos de teste que hoje passam com Bearer token vão consultar o banco. O stub default de conta ativa no `beforeEach` de `tests/setup/prisma-mock.ts` (RESEARCH § Pitfall 3) é obrigatório — valores devem casar com `testAuthPayload` (`id: "user-1"`, `empresaId: "empresa-1"`, `empresa: { slug: "empresa-teste" }`).
- **Fase 2 (D-04):** `avaliarAcesso` entra dentro de `revalidarConta`, após a query, lendo os campos de billing da `Empresa` (que ainda não existem no schema). O JSDoc marca o local.
- Nenhum blocker novo.

## Self-Check: PASSED

- `lib/auth-guard.ts` — FOUND
- `lib/auth-guard.test.ts` — FOUND
- commit `095a9ac` — FOUND
- commit `777a25f` — FOUND

---
*Phase: 01-pr-requisitos-de-produ-o*
*Completed: 2026-08-31*
