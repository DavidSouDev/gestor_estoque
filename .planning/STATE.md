---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 3 context gathered
last_updated: "2026-08-31T22:10:49.737Z"
last_activity: 2026-08-31 -- Phase 03 execution started
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 18
  completed_plans: 11
  percent: 29
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-31)

**Core value:** Uma empresa que não paga (após o prazo de carência) perde acesso ao admin e tem o catálogo despublicado — sem exceções e sem que dados de pagamento fiquem armazenados no nosso sistema.
**Current focus:** Phase 03 — gateway-asaas-e-ingest-o-de-webhooks

## Current Position

Phase: 03 (gateway-asaas-e-ingest-o-de-webhooks) — EXECUTING
Plan: 1 of 7
Status: Executing Phase 03
Last activity: 2026-08-31 -- Phase 03 execution started

**Checkpoint fechado:** `01-05-PLAN.md` Task 2 (`checkpoint:human-verify`, `gate="blocking"`)
foi **aprovado** pelo operador em 2026-08-31. Parte A: `pg_stat_activity` foi de **1** conexao
antes para **5** depois de ~2 min de carga mista admin+API contra `npm run build` + `npm start`
— abaixo do `max` default de 10 do pool, sem crescimento continuo (criterio de sucesso #1,
INFRA-01 fechado). Parte B: os 5 fluxos (registro, admin, logout+login, catalogo anonimo,
lentidao) passaram sem problema (criterio #4). Parte C: ciencia de D-01/T-01-10 registrada.
`01-VALIDATION.md` esta com `nyquist_compliant: true` e 13/13 linhas verdes. O servidor de
producao usado na medicao foi encerrado.

**A conclusao formal da Fase 1 no ROADMAP.md e do orquestrador**, apos a verificacao de fase —
por isso o checkbox da Phase 1 continua desmarcado ali de proposito.

Progress: [██████████] 100% (planos da fase 01)

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |
| 02 | 6 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 6m | 2 tasks | 3 files |
| Phase 01 P02 | 5m | 2 tasks | 2 files |
| Phase 01 P03 | 6m | 3 tasks | 5 files |
| Phase 01 P04 | 9m | 3 tasks | 6 files |
| Phase 01 P05 | 58m | 2 tasks | 2 files |
| Phase 02 P01 | 12m | 3 tasks | 3 files |
| Phase 02 P02 | 5m | 2 tasks | 3 files |
| Phase 02 P03 | 8m | 2 tasks | 4 files |
| Phase 02 P04 | 5min | 2 tasks | 4 files |
| Phase 02 P05 | 8min | 2 tasks | 3 files |
| Phase 02 P06 | 9min | 3 tasks | 3 files |

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
- [Phase ?]: [01-04] Guardas publicas de login/registro usam getVerifiedSession — a tela publica passa a usar a mesma verdade da tela protegida (fim do loop de redirect)
- [Phase ?]: [01-04] Login (API e Server Action) rejeita usuario.empresa.deletedAt por veracidade, nao por comparacao com null
- [Phase ?]: [01-04] Warning de lint do 'Link' nao usado em app/registro/page.tsx mantido — remove-lo estouraria o teto de diff do acceptance criteria
- [Phase ?]: [01-05] Gate automatizado da fase 1 verde no mesmo estado do repo (lint 0, tsc 0, 463 testes unitarios, 20 e2e locais); nyquist_compliant segue false ate a medicao humana de pg_stat_activity
- [Phase ?]: [01-05] Fase 1 NAO pode ser declarada concluida sem os dois numeros de pg_stat_activity (T-01-16) — checkpoint bloqueante, nao auto-aprovavel
- [Phase ?]: [01-05] Fase 1 fechada com evidencia real: pg_stat_activity 1 -> 5 conexoes sob carga mista contra build de producao (criterio #1 comprovado, INFRA-01 fechado)
- [Phase ?]: [01-05] INFRA-02 atendido nesta fase apenas pela INFRAESTRUTURA de revalidacao (D-02); a metade 'status de pagamento' do requisito e reaberta na Fase 2 para plugar avaliarAcesso dentro de revalidarConta (D-04)
- [Phase ?]: [01-05] Sizing do max do pool (default 10) e escolha entre DATABASE_URL pooled vs. direta ficam para a fase de deploy/hosting, quando worker (Fase 5) e webhooks (Fase 3) existirem
- [Phase ?]: [01-05] Nota operacional D-01/T-01-10: pico de 401 e redirects em producao pode significar Postgres fora do ar, nao sessoes revogadas — distinguir pelo prefixo [auth-guard] nos logs
- [Phase ?]: [01-05] Todo JWT de 7 dias ja emitido passa a ser revalidado no primeiro request apos o deploy: contas ativas nao notam diferenca, contas revogadas caem na hora (esse e o objetivo)
- [Phase ?]: [02-01] Backfill de billing roda como DML dentro da propria migration (D-11/D-12/D-13) — nao script separado, nao db push
- [Phase ?]: [02-01] trialFim gravado com duplo AT TIME ZONE e interval de 15 dias (D-18): meia-noite de America/Sao_Paulo independente do TimeZone da sessao do Postgres
- [Phase ?]: [02-01] Invariantes de dados provadas por gate SQL versionado (prisma/checks/backfill-billing.sql) com RAISE EXCEPTION, nao por inspecao manual
- [Phase ?]: [02-01] ultimoStatusAuditado existe como bookkeeping com comentario normativo; conformidade a BILL-01 sera provada por gate de grep no plano 02-06
- [Phase ?]: [02-02] Choke point de escrita da Empresa e o service, nao o route handler — route handler e Server Action convergem em empresaService.update
- [Phase ?]: [02-02] Allowlist positivo de 10 campos com guarda !== undefined (nao truthiness) preserva a semantica Prisma usada por marca/actions.ts
- [Phase ?]: [02-02] Escritas legitimas futuras nos campos de billing (acessoService, webhook Asaas) NAO podem passar por empresaService.update nem entrar no allowlist — exigem metodo dedicado
- [Phase ?]: [02-02] Nao-vacuidade do teste comprovada por reversao temporaria: com data cru, 'nao aceita campos de billing' falha na asserção exata
- [Phase 02-03]: avaliarAcesso devolve o objeto ResultadoAcesso { status, expiraEm, carenciaAte } — carenciaAte sai daqui para ACC-01 (Fase 4) nao re-derivar a aritmetica de carencia
- [Phase 02-03]: Motor de acesso mora em lib/ (funcao pura, zero I/O); o wrapper de auditoria com efeito colateral e do plano 02-04 e mora em app/services/
- [Phase 02-03]: meiaNoiteEmSaoPaulo copiado literalmente da versao verificada — a versao ingenua passa em 100% dos casos de 2026 e erra por 1-2h em 2017/2018; os 3 casos de DST historico sao a unica prova de corretude
- [Phase 02-03]: Relogio por parametro (agora: Date), nunca new Date() interno — e o que torna as 3 viradas exatas de D-02 testaveis sem fake timers (T-02-13)
- [Phase 02-03]: DIAS_DE_TRIAL exportada com o +1 de D-18 documentado na propria const para o plano 02-05 (registro) nao redescobrir a aritmetica
- [Phase 02]: [02-04] O efeito colateral de auditoria mora em acessoService.registrarTransicao, nao dentro de avaliarAcesso — a funcao pura do 02-03 continua pura
- [Phase 02]: [02-04] Compare-and-swap usa Empresa.ultimoStatusAuditado como registrador atomico: updateMany condicional + create so quando count === 1; read-then-write descartado por nao ser atomico
- [Phase 02]: [02-04] Guarda D-16 (anterior === novo) retorna ANTES de abrir transacao — zero I/O, nao apenas zero escrita, porque a funcao roda a cada request autenticado
- [Phase 02]: [02-04] Fallback inline de agendarPosResposta e requisito, nao defensive coding: revalidarConta roda em 3 contextos sem escopo de request e o after() do Next lanca E468 neles
- [Phase 02]: [02-04] Nenhum caminho de leitura de AuditoriaAcesso criado (gate de grep proibindo findMany/findFirst/findUnique) — decisao de seguranca T-02-19
- [Phase ?]: [02-05] trialFim e calculado em empresaService.registerComUsuario, nao na Server Action — so dentro do service o valor entra na mesma transacao que cria Empresa+Usuario
- [Phase ?]: [02-05] A primeira linha de AuditoriaAcesso (causa REGISTRO) usa tx.auditoriaAcesso.create direto, nao acessoService.registrarTransicao: aquele opera no prisma global e o compare-and-swap e desnecessario para uma empresa que acabou de nascer
- [Phase ?]: [02-05] Registro deixa acessoAte/canceladoEm/acessoVitalicio nos defaults do schema — e o que mantem BILL-04, D-09 e D-10 verdadeiros desde o dia 1
- [Phase ?]: [02-05] O e2e nao conecta ao banco: navegar por uma segunda tela protegida e a prova indireta do trial; o valor exato de trialFim fica com o teste unitario e o gate SQL do 02-01
- [Phase ?]: [02-06] revalidarConta deriva statusAcesso dos 4 fatos a cada request e expoe statusAcesso/acessoExpiraEm/carenciaAte em ContaAtiva — assinaturas de requireAdminSession/requireAuth inalteradas
- [Phase ?]: [02-06] A comparacao com ultimoStatusAuditado (D-16) mora no chamador impuro, nao na funcao pura: revalidarConta so agenda auditoria quando o status calculado difere do persistido
- [Phase ?]: [02-06] Gate de grep de ultimoStatusAuditado verde (0 violacoes fora da lista de 9 arquivos) — conformidade a BILL-01/OQ-2 provada de forma executavel
- [Phase ?]: [02-06] human-check 02-06-H1 (after() dentro de React.cache contra Postgres real) PENDENTE — colhido no UAT de fim de fase; se falhar, o fallback inline mantem a auditoria correta, so sem ganho de TTFB

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

Last session: 2026-08-31T21:21:27.589Z
Stopped at: Phase 3 context gathered
Resume file: .planning/phases/03-gateway-asaas-e-ingest-o-de-webhooks/03-CONTEXT.md
