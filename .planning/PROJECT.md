# Gestor de Estoque — Controle de Pagamento e Assinatura

## What This Is

Um gestor de estoque e catálogo multi-tenant (SaaS): cada empresa (tenant) cadastra seus produtos, gerencia estoque e expõe um catálogo público (`/{slug}`) para seus clientes. Esta fase do projeto adiciona controle de pagamento/assinatura: empresas pagam para continuar usando o painel admin e ter o catálogo publicado, com um gateway de pagamento externo cuidando da cobrança recorrente.

## Core Value

Uma empresa que não paga (após o prazo de carência) perde acesso ao admin e tem o catálogo despublicado — sem exceções e sem que dados de pagamento fiquem armazenados no nosso sistema.

## Requirements

### Validated

- ✓ Multi-tenant: cada Empresa é isolada por `empresaId` em todas as queries — existente
- ✓ Autenticação JWT + cookie de sessão para admin — existente
- ✓ Cadastro de produtos, combos, promoções e movimentação de estoque por empresa — existente
- ✓ Catálogo público por slug (`/{slug}`) consumido pelos clientes da empresa — existente
- ✓ Upload de imagens via Cloudflare R2 — existente
- ✓ Registro de nova empresa (`/registro`) com criação de sessão admin — existente
- ✓ Correção do bug crítico do singleton do Prisma (`lib/prisma.ts`) — client publicado incondicionalmente em `globalThis` em todos os ambientes, contagem de conexões do Postgres verificada estável sob carga (`pg_stat_activity`) — Validado na Fase 1: Pré-requisitos de Produção (INFRA-01)
- ✓ Sessão do admin revalida a conta no banco a cada request via DAL `revalidarConta` (`lib/auth-guard.ts`), fail-closed, ligado em `requireAdminSession` e `requireAuth` — Validado na Fase 1: Pré-requisitos de Produção (INFRA-02). Nota: isto entrega a **infraestrutura** de revalidação; a regra de status de pagamento em si (`avaliarAcesso`) ainda não existe — plugará em `revalidarConta` na Fase 2 (decisão D-04)
- ✓ Janela de carência de 10 dias quando o pagamento atrasa, antes do bloqueio — Validado na Fase 4: Aplicação do Bloqueio (ACC-02)
- ✓ Banner de aviso em destaque em todas as telas do admin durante a carência, mostrando dias restantes e pedindo o pagamento (não aparece no catálogo público) — Validado na Fase 4: Aplicação do Bloqueio (ACC-01)
- ✓ Bloqueio após os 10 dias de carência: perda de acesso ao painel admin **e** despublicação do catálogo público daquela empresa (sem mensagem de pagamento no catálogo — apenas indisponível/idêntico a "não existe"). O catálogo tem **6** caminhos de leitura públicos (corrigido pela pesquisa da Fase 4 — o roadmap original citava 5; `GET /api/empresas/slug/[slug]` também é público) — todos gateados pelo mesmo funil de serviço — Validado na Fase 4: Aplicação do Bloqueio (ACC-02, ACC-03)
- ✓ Reativação automática ao pagar a cobrança corrente do gateway (não é cobrado retroativamente pelos meses em que ficou bloqueada) — Validado na Fase 4: Aplicação do Bloqueio (ACC-04), apoiado na extensão monotônica de `acessoAte` já provada na Fase 3
- ✓ Webhook do gateway é idempotente (não processa o mesmo evento duas vezes) e sempre responde 200 rapidamente, processando de forma assíncrona — Validado na Fase 3: Gateway Asaas e Ingestão de Webhooks (GTW-04), com reentrega real testada contra o Asaas Sandbox
- ✓ Worker diário reconcilia todas as empresas (expira trials, inicia carências, aplica bloqueios), idempotente e seguro mesmo rodando duas vezes no mesmo dia ou pulando um dia — Validado na Fase 5: Worker Diário de Reconciliação (WRK-01), com prova ao vivo contra Postgres real (idempotência observada em duas chamadas HTTP consecutivas, não apenas em mock)
- ✓ Worker exposto como endpoint HTTP (`GET /api/cron/reconciliacao-diaria`) protegido por `CRON_SECRET` (gate time-safe), funcionando independente da decisão final de hosting (Vercel Cron, VPS cron) — Validado na Fase 5: Worker Diário de Reconciliação (WRK-02); a decisão de hosting em si (D-07) continua adiada

### Active

- [ ] Modelo de dados baseado em datas/fatos (`acessoAte`, `trialFim`, `canceladoEm`) com uma função pura de decisão de acesso — não um campo de "status" calculado e armazenado como fonte da verdade
- [ ] Campo de status de pagamento por Empresa (projeção derivada, não fonte da verdade): `em_dia`, `atrasado`, `vitalicio`, `cancelado`, `bloqueado`, `trial`
- [ ] Período de trial de 14 dias para empresas novas, sem exigir pagamento no registro
- [ ] Status `vitalicio` só pode ser ativado manualmente no banco de dados (sem UI de admin/superadmin para isso em v1)
- [ ] Integração com gateway de pagamento externo para assinatura recorrente automática (cobrança mensal, sem armazenar dados de cartão/pagamento no nosso sistema)
- [ ] Webhook do gateway atualiza o status de pagamento da empresa (sucesso/falha de cobrança)
- [ ] Gateway de pagamento: Asaas (checkout hospedado com assinatura recorrente) — decidido após pesquisa (ver `.planning/research/STACK.md`)
- [ ] Cancelamento de plano pelo usuário: acesso mantido até o fim dos 30 dias do último pagamento; depois disso, mesmo fluxo de bloqueio
- [ ] Tela de termos de uso exibida no momento do registro da conta, com aceite obrigatório
- [ ] Endpoint para atualizar os termos de uso, restrito a um novo papel `SUPERADMIN` (hoje só existe `ADMIN`, que é por empresa — sem esse papel novo, qualquer admin de qualquer empresa poderia reescrever os termos da plataforma)
- [ ] Aceite de termos por Usuario (login individual, não por empresa): se `termos.atualizadoEm` for mais recente que o aceite do usuário, modal obrigatório aparece ao logar no admin — sistema não pode ser usado sem aceitar
- [ ] Tela de gerenciamento de assinatura para o usuário: ver status do pagamento e cancelar o plano

### Out of Scope

- Múltiplos planos/preços — decidido adiar até validar que o modelo de plano único é rentável
- UI de admin/superadmin para ativar acesso vitalício — ativação manual direta no banco por enquanto
- Cobrança manual por boleto/link avulso — optou-se por assinatura recorrente automática via gateway
- Múltiplos usuários/papéis com bloqueio diferenciado por papel — hoje existe apenas um usuário admin por empresa; toda a empresa é bloqueada/desbloqueada em conjunto
- Armazenamento de dados de cartão/pagamento no banco próprio — gateway externo cuida disso (requisito de segurança do usuário)

## Context

**Codebase existente** (mapeado em `.planning/codebase/`):
- Next.js 16 App Router + React 19, TypeScript estrito, Tailwind 4
- PostgreSQL via Prisma 7 (`@prisma/adapter-pg`), singleton em `lib/prisma.ts`
- Modelos atuais: `Empresa`, `Usuario`, `Produto`, `ProdutoImagem`, `Combo`, `ComboItem`, `Promocao`, `PromocaoItem`, `MovimentacaoEstoque`
- Auth: JWT (jose) com payload `{ sub, empresaId, empresaSlug, email, role }`, sessão via cookie HTTPOnly (`lib/session.ts`), verificação em `lib/api-auth.ts`
- Integração de pagamento Asaas (checkout hospedado + webhook idempotente) construída e homologada na Fase 3; enforcement de bloqueio (admin + catálogo) construído na Fase 4
- Hosting de produção não está definido no código — precisa ser decidido para o worker diário (candidatos: Vercel Cron Jobs vs cron em VPS)
- `CONCERNS.md` já identificou 1 bug crítico de produção (singleton do Prisma) e 1 risco de segurança alto (endpoint sem autenticação) — não fazem parte deste milestone, mas valem revisão futura

**Motivação:** o sistema hoje só verifica se o admin está logado, sem nenhum controle de cobrança. Esta é a primeira monetização real do produto.

**Estado atual:** Fase 5 (Worker Diário de Reconciliação) concluída em 2026-09-01 — `GET /api/cron/reconciliacao-diaria` reconcilia todas as empresas por lote, idempotente, com freio composto (>20% E ≥5 perdas) contra bloqueio em massa; hosting continua adiado (D-07) e o endpoint é agnóstico por construção. Checkpoint humano de `CRON_SECRET` aprovado. 916 testes unitários + 24 e2e verdes, gates estáticos das Fases 4 e 5 em 6/6 cada. Código revisado sem achados críticos (3 warnings advisórios sobre os gates não estarem no CI ainda). Próxima: Fase 6 (Termos de Uso e Aceite).

## Constraints

- **Segurança/PCI**: não armazenar dados de pagamento (cartão, etc.) no banco próprio — gateway externo deve cuidar disso — pedido explícito do usuário
- **Compatibilidade**: mudanças de auth/bloqueio devem respeitar o isolamento multi-tenant existente (`empresaId`) e não quebrar o catálogo público para empresas em dia
- **Escopo do worker**: a lógica de avaliação diária de status precisa rodar de forma confiável mesmo sem hosting definido ainda — decisão de plataforma de cron é um bloqueador de pesquisa
- **Modelo de dados**: status de pagamento é por Empresa; aceite de termos é por Usuario — não confundir os dois escopos

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Status de pagamento vinculado à Empresa, não ao Usuario | Todos os logins de uma empresa devem ser bloqueados juntos quando a assinatura atrasa | — Pending |
| Assinatura recorrente automática via gateway (não cobrança manual por link) | Menos fricção para o cliente, cobrança automática mês a mês | — Pending |
| Plano único por enquanto | Simplicidade para v1; múltiplos planos só se o modelo se provar rentável | — Pending |
| Trial de 14 dias para empresas novas | Tempo suficiente para testar catálogo/estoque sem exigir pagamento imediato no registro | — Pending |
| Aceite de termos de uso por Usuario (não por Empresa) | Cada login precisa concordar individualmente com os termos vigentes | — Pending |
| Gateway de pagamento: Asaas | Pesquisa recomendou Asaas sobre Stripe — Pix sem exigir aprovação/convite no Brasil (Stripe exige), sem mensalidade, ~4% de taxa, NFS-e nativa, cobranças por período mapeiam bem para o modelo de acesso | — Pending |
| Reativação cobra apenas o mês corrente, não os meses em atraso | Gateways de assinatura não suportam cobrança retroativa nativamente; cobrar por período sem prestação de serviço é arriscado sob o CDC | — Pending |
| Status de acesso derivado de datas (`acessoAte`, `trialFim`), não de um campo de status já calculado | O worker diário vira uma rede de segurança (reconciliador), não a autoridade — uma falha no cron não libera nem bloqueia incorretamente | Confirmado na Fase 5 — `ultimoStatusAuditado` é bookkeeping do compare-and-swap, nunca fonte de decisão (gate estático `gates:fase-05` prova isso) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-01 after Phase 5 completion*
