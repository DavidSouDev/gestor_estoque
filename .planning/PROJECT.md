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

### Active

- [ ] Modelo de dados baseado em datas/fatos (`acessoAte`, `trialFim`, `canceladoEm`) com uma função pura de decisão de acesso — não um campo de "status" calculado e armazenado como fonte da verdade
- [ ] Campo de status de pagamento por Empresa (projeção derivada, não fonte da verdade): `em_dia`, `atrasado`, `vitalicio`, `cancelado`, `bloqueado`, `trial`
- [ ] Período de trial de 14 dias para empresas novas, sem exigir pagamento no registro
- [ ] Status `vitalicio` só pode ser ativado manualmente no banco de dados (sem UI de admin/superadmin para isso em v1)
- [ ] Worker diário que avalia o status de pagamento de cada empresa e aplica as regras de carência/bloqueio
- [ ] Integração com gateway de pagamento externo para assinatura recorrente automática (cobrança mensal, sem armazenar dados de cartão/pagamento no nosso sistema)
- [ ] Webhook do gateway atualiza o status de pagamento da empresa (sucesso/falha de cobrança)
- [ ] Gateway de pagamento: Asaas (checkout hospedado com assinatura recorrente) — decidido após pesquisa (ver `.planning/research/STACK.md`)
- [ ] Janela de carência de 10 dias quando o pagamento atrasa, antes do bloqueio
- [ ] Banner de aviso em destaque em todas as telas do admin durante a carência, mostrando dias restantes e pedindo o pagamento (não aparece no catálogo público)
- [ ] Bloqueio após os 10 dias de carência: perda de acesso ao painel admin **e** despublicação do catálogo público daquela empresa (sem mensagem de pagamento no catálogo — apenas indisponível). O catálogo tem 5 caminhos de leitura públicos hoje (páginas + endpoints, incluindo um que aceita `empresaId` direto) — todos precisam do mesmo guard, não só a página
- [ ] Webhook do gateway é idempotente (não processa o mesmo evento duas vezes) e sempre responde 200 rapidamente, processando de forma assíncrona
- [ ] Reativação automática ao pagar a cobrança corrente do gateway (não é cobrado retroativamente pelos meses em que ficou bloqueada — decisão revisada após pesquisa: gateways de assinatura não suportam cobrança retroativa nativamente, e cobrar por período sem prestação de serviço é arriscado sob o CDC)
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
- Nenhuma integração de pagamento ou webhook existe hoje (`INTEGRATIONS.md`)
- Hosting de produção não está definido no código — precisa ser decidido para o worker diário (candidatos: Vercel Cron Jobs vs cron em VPS)
- `CONCERNS.md` já identificou 1 bug crítico de produção (singleton do Prisma) e 1 risco de segurança alto (endpoint sem autenticação) — não fazem parte deste milestone, mas valem revisão futura

**Motivação:** o sistema hoje só verifica se o admin está logado, sem nenhum controle de cobrança. Esta é a primeira monetização real do produto.

**Estado atual:** Fase 1 (Pré-requisitos de Produção) concluída em 2026-08-31 — singleton do Prisma corrigido e sessão revalidando no banco a cada request, ambos com evidência automatizada + checkpoint humano (contagem de conexões `pg_stat_activity`: 1 → 5, estável). Próxima: Fase 2 (Modelo de Dados e Motor de Acesso).

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
| Status de acesso derivado de datas (`acessoAte`, `trialFim`), não de um campo de status já calculado | O worker diário vira uma rede de segurança (reconciliador), não a autoridade — uma falha no cron não libera nem bloqueia incorretamente | — Pending |

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
*Last updated: 2026-08-31 after Phase 1 completion*
