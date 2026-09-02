---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 6 UI-SPEC approved
last_updated: "2026-09-02T15:27:54.992Z"
last_activity: 2026-09-02
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 40
  completed_plans: 40
  percent: 86
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-31)

**Core value:** Uma empresa que não paga (após o prazo de carência) perde acesso ao admin e tem o catálogo despublicado — sem exceções e sem que dados de pagamento fiquem armazenados no nosso sistema.
**Current focus:** Phase 07 — gestão-de-assinatura

## Current Position

Phase: 7
Plan: Not started
Status: Ready to plan
Last activity: 2026-09-02

**Checkpoint fechado:** `04-09-PLAN.md` Task 3 — contagem prévia obrigatória contra o banco alvo
antes do merge (04-RESEARCH.md §Achado crítico 5 / §Pitfall 8), no mesmo espírito do checkpoint de
`pg_stat_activity` da Fase 1 (`01-05`) e do de homologação em sandbox da Fase 3 (`03-07`). O
operador rodou `npm run acesso:contagem` contra o banco alvo e as duas verificações manuais de
runtime, e aprovou sem reserva ("testei e está bom, segue pra proxima"). Os números não foram
transcritos e não foram inventados — a evidência registrada é a aprovação, não a distribuição.
Estado do repo: `gates:fase-04` 6/6, `npm test` 876/876, e2e 22/22, `tsc` 0, `lint` 0.

**Duas suposições do RESEARCH confirmadas contra runtime real:** A3 (layout NÃO é boundary de
autorização — a segurança está no `requireAdminSession` de cada page; banner stale é falha benigna)
e A4 (`redirect()` para URL externa funciona a partir de Server Action; o fallback de navegar no
cliente NÃO foi necessário).

**Aviso herdado pela Fase 5:** o roadmap ("enforcement validado em produção antes de o worker da
Fase 5 poder bloquear alguém") induz a achar que o bloqueio seria gradual. Não é, e agora está no
ar: a Fase 4 sozinha já bloqueia a cada request autenticado. O worker da Fase 5 é rede de segurança
para empresas *sem* request, não o gatilho.

**Checkpoint fechado:** `03-07-PLAN.md` — homologacao end-to-end contra o Asaas Sandbox,
com quatro acoes humanas encadeadas (criar/completar a conta de sandbox, corrigir a expansao
de `$` no `.env`, decidir o escopo da correcao de resolucao de tenant, reenviar o evento pelo
painel). Evidencia numerica: `acessoAte` **NULL -> 2026-10-01 03:00:00**, auditoria
**CARENCIA -> EM_DIA** com causa `WEBHOOK_PAGAMENTO`, `penalizedRequestsCount = 0`, 401 nos
dois testes de rejeicao, reentrega sem efeito. `03-VALIDATION.md` esta com `status: approved`
e nenhuma linha pendente.

**Achado critico da fase:** a homologacao refutou a suposicao A3 (`externalReference` NAO
propaga do checkout para a cobranca/assinatura) e a premissa de que `sendType: SEQUENTIALLY`
preserva ordem cronologica entre recursos. As duas juntas produziam um impasse: um cliente
que pagou nao recebia acesso. Corrigido no proprio 03-07 pela ponte do `checkoutSession`
autoritativo — ver `03-07-SUMMARY.md`.

Progress: [██████████] 100% (9/9 planos da fase 04)

## Performance Metrics

**Velocity:**

- Total plans completed: 40
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |
| 02 | 6 | - | - |
| 03 | 7 | - | - |
| 04 | 9 | - | - |
| 05 | 5 | - | - |
| 06 | 8 | - | - |

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
| Phase 03 P07 | ~4h | 3 tasks | 10 files |
| Phase 04 P08 | ~25min | 2 tasks | 3 files |
| Phase 04 P09 | 22min | 3 tasks | 3 files |

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
- [Phase 03]: [03-07] A3 REFUTADA contra o gateway real: `externalReference` NAO propaga do checkout para a cobranca nem para a assinatura (null nos dois, e consulta por ele devolve totalCount 0)
- [Phase 03]: [03-07] `sendType: SEQUENTIALLY` NAO preserva ordem cronologica entre recursos — `PAYMENT_CONFIRMED` foi entregue ANTES de `SUBSCRIPTION_CREATED` apesar de ter `dateCreated` posterior; sao filas por recurso
- [Phase 03]: [03-07] Resolucao de tenant ganhou a ponte `checkoutSession` (do objeto RE-BUSCADO na API, nunca do payload) — sem ela o PRIMEIRO pagamento de todo cliente e insoluvel e quem pagou fica sem acesso
- [Phase 03]: [03-07] `checkout.customer` vem null no `CHECKOUT_PAID`; o `cus_…` so existe em `SUBSCRIPTION_CREATED`
- [Phase 03]: [03-07] Reenvio pelo painel do Asaas NAO reprocessa evento ja registrado (colide no @unique do ledger) — e a recuperacao NAO e do botao nem do worker da Fase 5: D-06 escopou o worker para reavaliar apenas os fatos de billing locais, sem chamar o Asaas. A fila processadoEm IS NULL segue sem dono
- [Phase 03]: [03-07] Chave de API do Asaas comeca com `$` e o `@next/env` a expande como referencia de variavel: sem escape `\$` ela vira string vazia SO dentro do next dev. Scripts do projeto passaram a usar o mesmo leitor da aplicacao
- [Phase 03]: [03-07] Nenhum runner de TypeScript instalado — Node 22+ executa `.ts` nativamente; alias `@/` e extensao implicita resolvidos por hook proprio em `scripts/resolvedor-ts.mjs`
- [Phase 04]: [04-08] O habilitador de teste de billing e um script versionado em scripts/ com guarda de NODE_ENV=production, nunca um endpoint de teste: o allowlist de BILL-04 permanece intacto e a divida fica fora do codigo de producao
- [Phase 04]: [04-08] O e2e afirma as formas flexionadas (suspenso/suspensa/suspensao) e nao o radical suspens: o payload RSC do next dev carrega um marcador interno do React cujo nome compartilha esse radical
- [Phase 04]: [04-08] A tela de login de empresa bloqueada e medida em contexto de browser anonimo: a guarda 'ja estou logado' devolveria a sessao ativa ao painel antes de renderizar, e limpar cookies destruiria a sessao que prova a reativacao sem novo login
- [Phase ?]: [04-09] Gates estaticos da fase viraram script executavel (npm run gates:fase-04) e descartam linhas de comentario antes de contar: os JSDoc normativos da fase citam literalmente os identificadores proibidos e invalidariam um grep cru
- [Phase ?]: [04-09] A contagem previa de impacto deriva status por avaliarAcesso sobre cada empresa, nunca por WHERE de SQL: D-03, D-05, Pitfall 5 e as meias-noites de America/Sao_Paulo sao quatro chances de a copia divergir da aplicacao
- [Phase ?]: [04-09] Checkpoint da contagem previa aprovado pelo operador sem reserva; os numeros nao foram transcritos e nao foram inventados — o que fica registrado e a aprovacao, nao a distribuicao
- [Phase ?]: [04-09] A3 confirmada contra runtime real: layout NAO e boundary de autorizacao, a seguranca esta no requireAdminSession de cada page e o banner stale e falha benigna
- [Phase ?]: [04-09] A4 confirmada contra runtime real: redirect() para URL externa funciona a partir de Server Action; o fallback de devolver a URL e navegar no cliente NAO foi necessario
- [Phase 06]: Gate de aceite de termos e uma rota dedicada (/{slug}/admin/aceitar-termos) fora de (protected), nao um modal — mesma decisao arquitetural do banner de bloqueio da Fase 4 (layout nao e boundary de autorizacao)
- [Phase 06]: Autorizacao de POST /api/termos e sempre pela role revalidada do banco (revalidarConta), nunca pelo role do JWT — gate estatico gates:fase-06 prova isso
- [Phase 06]: TermoDeUso e imutavel por design (FK onDelete: Restrict em AceiteTermo.termoId) — nova versao juridica publica-se como INSERT, nunca UPDATE
- [Phase 06]: Aceite de termos nasce atomico com a conta no registro (quarta escrita da mesma $transaction em empresaService.registerComUsuario) — nao existe caminho de servidor que crie conta sem aceite
- [Phase 06]: Revisao de seguranca da fase (/gsd-secure-phase 06) foi pulada por decisao explicita do usuario para avancar a Fase 7 — pendente, nao esquecida

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

- ~~Preço mensal ainda não definido em PROJECT.md~~ — RESOLVIDO: R$ 29,90 (D-02), cobrado de verdade no sandbox
- ~~Confirmação do Asaas (sandbox, header de autenticação do webhook, aprovação do checkout)~~ — RESOLVIDO no plano 03-07 com pagamento real
- Decisão de hosting/scheduler e estratégia de pooling do Prisma — necessária antes da Phase 5
- Revisão jurídica (CDC) sobre bloqueio e não-cobrança retroativa — fora do escopo técnico
- `.env.example` precisa de dois ajustes que o executor não pôde aplicar (permissão negada no diretório): escape `\$` em `ASAAS_API_KEY` e nota sobre a forma real de `ASAAS_CHECKOUT_BASE_URL`. Texto pronto em `03-07-SUMMARY.md` § Pendências
- A conta de sandbox exige cadastro completo (`commercialInfo`/`bankAccountInfo`/`documentation` aprovados) antes de o checkout ser habilitado — repetir na conta de produção antes do go-live
- Fila de retrabalho `EventoWebhookAsaas WHERE processadoEm IS NULL` segue SEM dreno depois da Fase 5 (D-06/D-10): um cliente que pagou e cujo webhook falhou permanece bloqueado até intervenção manual. Candidata a fase futura — exige `webhookAsaasService.processar`, que re-busca no Asaas.
- ~~BLOQUEANTE do merge da Fase 04 — checkpoint `04-09` Task 3 (contagem prévia contra o banco alvo + verificações A3/A4)~~ — RESOLVIDO em 2026-09-01: o operador rodou a contagem contra o banco alvo e as duas verificações manuais, e aprovou sem reserva
- ⚠️ [Phase 06] Revisão de segurança da fase (`/gsd-secure-phase 06`) não rodou — pulada por decisão explícita do usuário para seguir para a Fase 7. Code review advisório já apontou 2 warnings não-bloqueantes (stale-slug em `aceitar-termos`, senha do seed do SUPERADMIN via CLI arg) — ver `06-REVIEW.md`
- ⚠️ [Phase 06] Texto jurídico da v1 dos termos ainda é o placeholder `[TEXTO PROVISORIO - ...]` — publicar a versão real via `POST /api/termos` antes do deploy em produção (item de UAT confirmado como pendente de ação, não de código)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-09-02T15:35:00Z
Stopped at: Phase 6 complete, ready to plan Phase 7
Resume file: None
