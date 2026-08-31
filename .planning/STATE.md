---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-02-PLAN.md
last_updated: "2026-08-31T16:10:25.130Z"
last_activity: 2026-08-31 -- Phase 01 execution started
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 5
  completed_plans: 3
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-31)

**Core value:** Uma empresa que não paga (após o prazo de carência) perde acesso ao admin e tem o catálogo despublicado — sem exceções e sem que dados de pagamento fiquem armazenados no nosso sistema.
**Current focus:** Phase 01 — pr-requisitos-de-produ-o

## Current Position

Phase: 01 (pr-requisitos-de-produ-o) — EXECUTING
Plan: 4 of 5
Status: Ready to execute
Last activity: 2026-08-31 -- Phase 01 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 6m | 2 tasks | 3 files |
| Phase 01 P02 | 5m | 2 tasks | 2 files |
| Phase 01 P03 | 6m | 3 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Status de acesso derivado de fatos (`acessoAte`, `trialFim`, `canceladoEm`) por uma função pura — o worker diário é rede de segurança, não autoridade
- [Roadmap]: Gateway Asaas com checkout hospedado — nenhum dado de pagamento no banco próprio
- [Roadmap]: Enforcement (Phase 4) precisa estar validado em produção antes de o worker (Phase 5) poder bloquear alguém
- [Roadmap]: Reativação cobra apenas o período corrente, sem cobrança retroativa dos meses bloqueados
- [Roadmap]: Termos de uso (Phase 6) é independente da cadeia de cobrança e pode ser paralelizado
- [Phase ?]: [01-01] Singleton do Prisma publicado em globalThis sem guarda por ambiente — globalThis e o unico escopo compartilhado entre as camadas de bundle do Next
- [Phase ?]: [01-01] Dimensionamento de max do pool e URL pooled vs. direta ficam para a fase de deploy/hosting
- [Phase ?]: [01-02] revalidarConta devolve null (fail-closed) tambem em erro de banco — o try/catch mora inteiramente dentro do DAL
- [Phase ?]: [01-02] Somente React.cache no DAL de auth — unstable_cache e 'use cache' sao cross-request e reintroduziriam a janela de staleness
- [Phase ?]: [01-03] Retorno de requireAdminSession/requireAuth continua AuthTokenPayload — devolver ContaAtiva quebraria ~40 call sites
- [Phase ?]: [01-03] Mensagem unica 'Sessao invalida.' para conta inativa, empresa removida e erro de banco (T-01-06)
- [Phase ?]: [01-03] Stub default de conta ativa no setup global bastou — nenhum dos 12 arquivos de rota autenticada precisou de stub local

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

- Preço mensal ainda não definido em PROJECT.md — necessário antes da Phase 3
- Confirmação do Asaas (sandbox, header de autenticação do webhook, aprovação do checkout) — necessária antes da Phase 3
- Decisão de hosting/scheduler e estratégia de pooling do Prisma — necessária antes da Phase 5
- Revisão jurídica (CDC) sobre bloqueio e não-cobrança retroativa — fora do escopo técnico

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-31T16:10:08.175Z
Stopped at: Completed 01-02-PLAN.md
Resume file: None
