# Roadmap: Gestor de Estoque — Controle de Pagamento e Assinatura

## Overview

O sistema hoje só verifica se o admin está logado — não existe nenhuma noção de pagamento. A jornada deste milestone parte de uma correção de infraestrutura que é pré-requisito real (singleton do Prisma + sessão que relê o banco a cada request), passa por um modelo de dados baseado em fatos (`acessoAte`, `trialFim`, `canceladoEm`) com uma única função pura de decisão de acesso, integra o gateway Asaas com ingestão idempotente de webhooks, aplica o bloqueio nos três pontos de estrangulamento (admin, API e os cinco caminhos de leitura do catálogo público), e só então libera o worker diário para efetivamente bloquear alguém. Termos de uso versionados correm em paralelo à cadeia de cobrança, e a tela de gestão de assinatura fecha o milestone sobre uma base já validada em produção.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Pré-requisitos de Produção** - Prisma singleton corrigido e sessão do admin relendo o banco a cada request (completed 2026-08-31)
- [x] **Phase 2: Modelo de Dados e Motor de Acesso** - Fatos de billing na Empresa + função pura `avaliarAcesso` com auditoria (completed 2026-08-31)
- [x] **Phase 3: Gateway Asaas e Ingestão de Webhooks** - Assinatura recorrente via checkout hospedado com webhook idempotente
- [ ] **Phase 4: Aplicação do Bloqueio** - Banner de carência, bloqueio do admin e despublicação do catálogo
- [ ] **Phase 5: Worker Diário de Reconciliação** - Endpoint protegido que expira trials, inicia carências e aplica bloqueios
- [ ] **Phase 6: Termos de Uso e Aceite** - Termos versionados, papel SUPERADMIN e modal obrigatório de aceite
- [ ] **Phase 7: Gestão de Assinatura** - Tela de status e cancelamento com data exata de fim de acesso

## Phase Details

### Phase 1: Pré-requisitos de Produção

**Goal**: Uma mudança feita no banco sobre uma empresa passa a valer no request seguinte, e a aplicação suporta a carga de worker + webhooks sem esgotar o pool de conexões
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02
**Success Criteria** (what must be TRUE):

  1. O cliente Prisma é uma única instância reaproveitada em todos os ambientes (incluindo produção) — rajadas de requests e reloads não abrem novas conexões, e a contagem de conexões do Postgres permanece estável sob carga repetida
  2. Uma alteração feita diretamente no banco sobre a Empresa ou o Usuario do admin logado passa a valer no próximo request, sem esperar os 7 dias do JWT nem exigir novo login
  3. Uma Empresa ou Usuario removido/desativado no banco tem a sessão ativa invalidada imediatamente, em vez de continuar navegando com o token antigo
  4. Todos os fluxos existentes (admin, registro, catálogo público) continuam funcionando exatamente como antes — nenhuma regressão de comportamento ou de isolamento por `empresaId`

**Plans**: 5 plans
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Corrigir o singleton do Prisma em todos os ambientes (INFRA-01) + corrigir o mecanismo descrito no CONCERNS.md
- [x] 01-02-PLAN.md — Criar o DAL `lib/auth-guard.ts` (`revalidarConta`) fail-closed e memoizado por request (INFRA-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — Ligar a revalidação em `lib/session.ts` e `lib/api-auth.ts` + stub default no setup de testes

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md — Eliminar o loop de redirect nas guardas públicas, alinhar o login ao DAL e provar por e2e

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md — Gate automatizado da fase + checkpoint humano da estabilidade de conexões do Postgres

### Phase 2: Modelo de Dados e Motor de Acesso

**Goal**: O sistema sabe dizer, para qualquer empresa e qualquer data, exatamente qual é o status de acesso dela — derivado de fatos armazenados, nunca de um status pré-calculado
**Depends on**: Phase 1
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05
**Success Criteria** (what must be TRUE):

  1. Uma empresa nova criada em `/registro` recebe automaticamente 14 dias de trial e usa o sistema normalmente, sem nenhum dado de pagamento
  2. Dado um conjunto de fatos (`acessoAte`, `trialFim`, `canceladoEm`, `acessoVitalicio`) e uma data/hora, o sistema retorna exatamente um status entre trial, em dia, carência, bloqueado, cancelado e vitalício — inclusive nas datas exatas de virada (fim do trial, fim da carência, fim do período pago)
  3. Marcar `acessoVitalicio` diretamente no banco faz a empresa passar a ser tratada como vitalícia, sem nenhuma outra alteração ou UI necessária
  4. Toda mudança de status de acesso fica registrada em auditoria com status anterior, novo status, causa e horário — é possível investigar por que uma empresa específica foi bloqueada
  5. Após a migração, nenhuma empresa existente fica bloqueada ou em carência por efeito colateral do backfill

**Plans**: 6 plans
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Schema de billing (4 fatos + 2 enums + AuditoriaAcesso) e migration com backfill executado contra Postgres real (BILL-01, BILL-05)
- [x] 02-02-PLAN.md — Allowlist anti-mass-assignment em `empresaService.update`, fechando a auto-concessão de acesso vitalício por PATCH (BILL-04, BILL-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-03-PLAN.md — Motor puro: `meiaNoiteEmSaoPaulo` + `avaliarAcesso` com os 6 status e as viradas exatas (BILL-02, BILL-04)
- [x] 02-04-PLAN.md — Auditoria: `agendarPosResposta` (`after()` com fallback inline) + `acessoService.registrarTransicao` com compare-and-swap (BILL-05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-05-PLAN.md — Trial de 14 dias e auditoria `REGISTRO` na transação de registro, com prova e2e (BILL-03, BILL-05)
- [x] 02-06-PLAN.md — Plugar `avaliarAcesso` em `revalidarConta` e auditar transições de sessão (BILL-02, BILL-04, BILL-05)

### Phase 3: Gateway Asaas e Ingestão de Webhooks

**Goal**: Empresas conseguem assinar e pagar mensalmente pelo Asaas, e os eventos de cobrança chegam ao nosso sistema de forma confiável, sem que nenhum dado de pagamento seja armazenado aqui
**Depends on**: Phase 2
**Requirements**: GTW-01, GTW-02, GTW-03, GTW-04
**Success Criteria** (what must be TRUE):

  1. A empresa inicia a assinatura recorrente por um checkout hospedado do Asaas e conclui o pagamento; nenhum dado de cartão ou meio de pagamento existe no nosso banco depois disso
  2. Um webhook de pagamento confirmado estende o `acessoAte` da empresa em um período e encerra qualquer carência em curso
  3. Um webhook de pagamento atrasado ou falho inicia a contagem da carência de 10 dias para aquela empresa
  4. O mesmo evento entregue duas vezes não é processado duas vezes, e um evento antigo chegando fora de ordem não sobrescreve um estado mais recente — uma empresa em dia nunca é bloqueada por reentrega
  5. O endpoint de webhook rejeita payloads não autênticos e responde 200 imediatamente nos autênticos, processando o restante fora do ciclo do request

**Plans**: 7 plans
Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Schema Asaas (ledger de eventos, mapa de checkout, enum WEBHOOK_PAGAMENTO) + migration aplicada contra Postgres real (GTW-01..04)
- [x] 03-02-PLAN.md — Fundação `lib/billing/asaas`: config fail-fast, datas determinísticas, tipos e cliente HTTP tipado (GTW-01, GTW-03)
- [x] 03-03-PLAN.md — Gate humano de legitimidade do `zod` + install pinado + schemas não-estritos e redação de PII (GTW-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-04-PLAN.md — Checkout hospedado recorrente de R$29,90/mês, sem nenhuma escrita antes do 2xx do gateway (GTW-01)
- [x] 03-05-PLAN.md — Endpoint de webhook: token timing-safe, sempre 200, persist-then-ack e ramos de no-op de estado (GTW-02, GTW-04)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-06-PLAN.md — Resolução de tenant por mapa local, escrita monotônica de `acessoAte` e auditoria `WEBHOOK_PAGAMENTO` (GTW-03, GTW-04)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-07-PLAN.md — Credenciais sandbox (human-action), registro do webhook e homologação end-to-end (GTW-01..04)

**Research flag**: resolvido em `03-RESEARCH.md` — a autenticação do webhook é um token estático no header `asaas-access-token` (não HMAC), e `PAYMENT_OVERDUE` é no-op de estado porque `avaliarAcesso` já deriva CARENCIA de `acessoAte`

**Progresso**: 7/7 planos completos. Homologado contra o Asaas Sandbox em 2026-09-01 com
pagamento real: `acessoAte` `NULL → 2026-10-01 03:00:00`, auditoria `CARENCIA → EM_DIA` com
causa `WEBHOOK_PAGAMENTO`, `penalizedRequestsCount = 0`, reentrega sem efeito. A homologação
refutou a suposição A3 (`externalReference` não propaga) e a premissa de ordenação do
`sendType`, expondo um impasse de resolução de tenant que foi corrigido no plano 03-07 —
ver `03-07-SUMMARY.md`.

### Phase 4: Aplicação do Bloqueio

**Goal**: Uma empresa que não paga perde de fato o admin e tem o catálogo despublicado — sem brecha por API, Server Action ou rota alternativa do catálogo
**Depends on**: Phase 3
**Requirements**: ACC-01, ACC-02, ACC-03, ACC-04
**Success Criteria** (what must be TRUE):

  1. Durante a carência, um banner em destaque aparece em todas as telas do admin com os dias restantes e o pedido de pagamento — e nada disso aparece no catálogo público
  2. Passados os 10 dias de carência, todos os usuários daquela Empresa perdem acesso ao painel admin e veem uma tela de bloqueio, tanto navegando pela UI quanto chamando `/api/*` diretamente
  3. O catálogo público de uma empresa bloqueada fica indisponível pelos **seis** caminhos de leitura pública — incluindo o endpoint que aceita `empresaId` direto e `GET /api/empresas/slug/[slug]`, identificado em `04-RESEARCH.md` §Achado crítico 1 — e não exibe nenhuma mensagem sobre pagamento
  4. Empresas em dia, em trial ou vitalícias continuam com admin e catálogo funcionando normalmente após a ativação dos guards
  5. Ao pagar a cobrança do período corrente, o acesso ao admin e o catálogo voltam automaticamente, sem cobrança retroativa dos meses bloqueados e sem intervenção manual

**Plans**: 9 plans
Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Predicados exaustivos de bloqueio + funil publicável e leitura de branding no `empresa.service`

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — Gate de tenant nas leituras por id de produto e combo + fecha o buraco da empresa soft-deletada
- [x] 04-03-PLAN.md — Gate dos endpoints públicos de lista (`?slug=` e `?empresaId=`) e remoção do resolvedor sem gate
- [x] 04-04-PLAN.md — Leitura de branding sem gate + login com branding genérico (D-09)
- [x] 04-05-PLAN.md — Caminho de pagamento (Server Action + `PagarButton`) e tela de bloqueio fora de `(protected)`

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 04-06-PLAN.md — Gates autoritativos no DAL (`requireAdminSession` + `requireAuth`) com opt-out único do checkout
- [ ] 04-07-PLAN.md — Banner de carência nos dois branches do layout protegido

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 04-08-PLAN.md — Script de seed dos fatos de billing + e2e de bloqueio por inadimplência

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 04-09-PLAN.md — Gates da fase como script executável + checkpoint humano da contagem prévia de empresas afetadas

**UI hint**: yes

### Phase 5: Worker Diário de Reconciliação

**Goal**: As transições de estado acontecem sozinhas todo dia (trial expira, carência começa, bloqueio é aplicado) mesmo quando nenhum webhook chega, e sem risco de bloquear em massa por engano
**Depends on**: Phase 4
**Requirements**: WRK-01, WRK-02
**Success Criteria** (what must be TRUE):

  1. Uma empresa cujo trial termina sem pagamento aparece bloqueada no dia seguinte, sem ninguém executar nada manualmente
  2. Rodar o worker duas vezes no mesmo dia, ou pular um dia inteiro, leva ao mesmo estado final correto — nenhuma empresa é penalizada duas vezes nem escapa da regra
  3. O endpoint do worker recusa qualquer chamada sem o `CRON_SECRET` e funciona igual atrás de Vercel Cron ou de um crontab em VPS, sem mudança de código
  4. Uma falha do gateway ou um erro em uma empresa específica não interrompe o processamento das demais e não gera bloqueio em massa — a anomalia é sinalizada em vez de aplicada silenciosamente

**Plans**: TBD
**Research flag**: yes — decisão de hosting/scheduler ainda em aberto (pooling do Prisma e plataforma de cron)

### Phase 6: Termos de Uso e Aceite

**Goal**: Ninguém usa a plataforma sem ter aceitado a versão vigente dos termos, e só a plataforma (não os admins das empresas) pode publicar novos termos
**Depends on**: Phase 1
**Requirements**: TERM-01, TERM-02, TERM-03, TERM-04
**Success Criteria** (what must be TRUE):

  1. O cadastro em `/registro` só pode ser concluído após ler e aceitar os termos vigentes — sem aceite, não há conta criada
  2. Publicar uma nova versão dos termos só funciona autenticado como `SUPERADMIN`; um `ADMIN` de qualquer empresa recebe negação ao tentar
  3. Versões anteriores dos termos permanecem íntegras e cada aceite fica registrado contra a versão específica que o usuário viu, com data/hora
  4. Um usuário cujo último aceite é anterior à versão vigente encontra um modal obrigatório ao logar no admin e não consegue usar o sistema até aceitar — mas consegue sair/deslogar sem ficar preso em um loop

**Plans**: TBD
**UI hint**: yes

### Phase 7: Gestão de Assinatura

**Goal**: O usuário enxerga e controla a própria assinatura — vê o status, sabe até quando tem acesso e consegue cancelar sem falar com ninguém
**Depends on**: Phase 4 (aplicação do bloqueio) e Phase 3 (gateway); agendada após Phase 5
**Requirements**: SUB-01, SUB-02, SUB-03
**Success Criteria** (what must be TRUE):

  1. O usuário vê em uma tela do admin o status atual da assinatura da empresa, a data até quando o acesso está pago e a próxima cobrança
  2. Ao voltar do checkout, o status exibido reflete o pagamento em segundos, sem depender do próximo webhook ou do worker do dia seguinte
  3. O usuário cancela o plano pela própria tela e vê a data exata até quando manterá o acesso (fim dos 30 dias do último pagamento)
  4. Uma empresa cancelada que ultrapassa o fim do período pago é bloqueada pelo mesmo fluxo das demais — admin bloqueado e catálogo despublicado

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

Phase 6 (Termos de Uso) não depende da cadeia de cobrança (Phases 2-5) e pode ser antecipada/paralelizada se conveniente — só exige Phase 1.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pré-requisitos de Produção | 5/5 | Complete    | 2026-08-31 |
| 2. Modelo de Dados e Motor de Acesso | 6/6 | Complete    | 2026-08-31 |
| 3. Gateway Asaas e Ingestão de Webhooks | 6/7 | In Progress|  |
| 4. Aplicação do Bloqueio | 5/9 | In Progress|  |
| 5. Worker Diário de Reconciliação | 0/TBD | Not started | - |
| 6. Termos de Uso e Aceite | 0/TBD | Not started | - |
| 7. Gestão de Assinatura | 0/TBD | Not started | - |

## Requirement Coverage

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1 | INFRA-01, INFRA-02 | 2 |
| 2 | BILL-01, BILL-02, BILL-03, BILL-04, BILL-05 | 5 |
| 3 | GTW-01, GTW-02, GTW-03, GTW-04 | 4 |
| 4 | ACC-01, ACC-02, ACC-03, ACC-04 | 4 |
| 5 | WRK-01, WRK-02 | 2 |
| 6 | TERM-01, TERM-02, TERM-03, TERM-04 | 4 |
| 7 | SUB-01, SUB-02, SUB-03 | 3 |

**Total:** 24/24 v1 requirements mapped — no orphans, no duplicates.

## Open Decisions Before Planning

Carregadas de `.planning/research/SUMMARY.md` (Gaps to Address) — não bloqueiam a Phase 1:

- **Preço mensal** ainda não definido em PROJECT.md (comparação de taxas assumiu ~R$49,90/mês) — confirmar antes da Phase 3
- **Confirmação final do Asaas** (sandbox, header de autenticação do webhook, requisitos de aprovação do checkout) — antes da Phase 3
- **Hosting/scheduler** (Vercel Cron vs. crontab em VPS, estratégia de pooling do Prisma) — antes da Phase 5
- **Revisão jurídica (CDC)** sobre bloqueio e não-cobrança retroativa — fora do escopo técnico

---
*Roadmap created: 2026-08-31*
