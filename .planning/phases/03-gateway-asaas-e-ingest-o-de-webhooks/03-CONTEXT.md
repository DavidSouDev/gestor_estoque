# Phase 3: Gateway Asaas e Ingestão de Webhooks - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Empresas conseguem assinar e pagar mensalmente pelo Asaas via checkout hospedado, e os eventos de cobrança chegam ao sistema de forma confiável e idempotente — sem que nenhum dado de pagamento (cartão, etc.) seja armazenado no banco próprio. Cobre GTW-01 a GTW-04.

Escopo desta fase: **só o backend** — cliente HTTP tipado próprio para a API do Asaas (sem SDK oficial disponível), endpoint que cria a sessão de checkout hospedado, e o endpoint de webhook (autenticidade, idempotência, resposta 200 imediata, processamento assíncrono, extensão de `acessoAte` / início de carência).

Fora do escopo: qualquer UI (banner de carência é Fase 4/ACC-01, botão/tela de "assinar" é Fase 4 ou 7), o worker diário de reconciliação (Fase 5), e a tela de gestão de assinatura do usuário (Fase 7).

</domain>

<decisions>
## Implementation Decisions

### Gateway e comparação
- **D-01:** Mantido Asaas (decisão já travada no PROJECT.md) mesmo após comparação direta com Mercado Pago, apresentada nesta discussão porque o usuário já tem conta no Mercado Pago. Motivo de manter: a API `preapproval` do Mercado Pago é mais fraca para o requisito de reativação por período ("N meses atrasados, quitar todos para reativar") — o modelo do Asaas, onde cada mês vira um `payment` independente com seu próprio Pix/status `OVERDUE`, resolve isso quase de graça. O Mercado Pago venceria em Pix mais barato (0,99% vs Asaas) e por já ter conta pronta (elimina a fricção de onboarding), mas isso não superou a fraqueza de modelagem para reativação.
- **D-02:** Preço mensal do plano único: **R$29,90/mês** (substitui a suposição de ~R$49,90 usada na pesquisa de comparação de taxas — recalcular a taxa efetiva do Asaas neste ticket ao planejar, não copiar o número da pesquisa).

### Momento e escopo do checkout
- **D-03:** O checkout do Asaas é iniciado **perto do fim do trial** (quando o trial está acabando/venceu), não no momento do registro. A empresa usa os 14 dias livremente sem precisar informar método de pagamento no cadastro.
- **D-04:** Esta fase constrói **só o backend** do checkout — o endpoint que cria a sessão no Asaas e devolve o link/URL hospedada. O ponto de entrada de UI (botão/banner que a empresa vê para iniciar o checkout) fica para a Fase 4 (banner de carência, ACC-01) ou Fase 7 (gestão de assinatura) — não construir nenhuma tela nesta fase.

### Conta e ambiente Asaas
- **D-05:** Não existe conta Asaas (sandbox ou produção) no momento desta discussão. O usuário vai criar a conta sandbox por fora e adicionar as credenciais (API key) no `.env` quando o plano pedir — isso vira um checkpoint de `human-action` no plano (pedido de credenciais), não um bloqueador de pesquisa/discussão.
- **D-06 (carregado de `02-RESEARCH.md`/`STACK.md`, não re-discutido):** Sandbox em `https://api-sandbox.asaas.com/v3`; tokenização de cartão já habilitada em sandbox, mas em produção exige liberação com gerente de contas — mais um motivo para usar exclusivamente o Checkout hospedado, nunca tokenização client-side.

### Falha ao criar assinatura
- **D-07:** Se a chamada ao Asaas falhar ao criar a assinatura/checkout (erro de rede, chave inválida, 500 do gateway), a resposta é um erro claro na tela com opção de tentar de novo — **nenhuma assinatura parcial ou registro inconsistente fica salvo no banco**. Não construir mecanismo de retry automático nem estado de "tentativa pendente" nesta fase (isso ficaria a cargo do worker da Fase 5, que está fora de escopo aqui).

### Claude's Discretion
- Estrutura exata do cliente HTTP tipado para a API do Asaas (não usar os pacotes `asaas`/`asaas-sdk` do npm — comunitários e desatualizados, per `02-RESEARCH.md`/`STACK.md` § "What NOT to Use" e Package Legitimacy Audit).
- Estratégia de validação de payload do webhook (ex.: `zod`, já recomendado em `STACK.md`).
- Mecanismo exato de idempotência do webhook (ex.: tabela de eventos processados vs. campo único) — desde que satisfaça GTW-04 (mesmo evento 2x não processa 2x; evento antigo fora de ordem não sobrescreve estado mais recente).
- Nome do novo valor de `CausaTransicaoAcesso` para transições originadas por webhook (D-14 da Fase 2 reservou esse ponto de extensão; ex.: `WEBHOOK_PAGAMENTO`).
- Estratégia de log/observabilidade do webhook (Sentry vs. `pino` vs. `console.error` com prefixo, seguindo o padrão `[acesso]`/`[auth-guard]` já estabelecido) — `STACK.md` recomenda Sentry dado que hoje há zero error tracking e uma falha silenciosa aqui pode significar cliente pagante bloqueado incorretamente.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/ROADMAP.md` §"Phase 3: Gateway Asaas e Ingestão de Webhooks" — goal e 5 success criteria, incluindo a nota de pesquisa obrigatória (Asaas não tem SDK oficial nem webhook de assinatura formal).
- `.planning/REQUIREMENTS.md` §"Gateway de Pagamento" — GTW-01 a GTW-04 (texto completo).
- `.planning/PROJECT.md` §"Key Decisions" — Asaas como gateway já travado; reativação cobra só o mês corrente, sem retroativo.

### Pesquisa de projeto (comparação de gateways e arquitetura)
- `.planning/research/STACK.md` §"Gateway Comparison — Stripe vs Mercado Pago vs Asaas vs Pagar.me vs Iugu" — matriz completa e veredito, base da decisão D-01 desta discussão.
- `.planning/research/STACK.md` §"Recommended Stack" — cliente HTTP próprio (não usar `asaas`/`asaas-sdk` do npm), `zod` pra validação de webhook, PostgreSQL advisory locks, Sentry.
- `.planning/research/STACK.md` §"Daily Worker / Cron — a decisão que não depende do hosting" — confirma que a escolha de hosting (ainda em aberto) não bloqueia esta fase; arquitetura é reconciliadora baseada em datas absolutas.
- `.planning/research/PITFALLS.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/SUMMARY.md` — ler durante `/gsd-plan-phase 3 --research` para riscos operacionais específicos do Asaas (fila de webhook pausando após 15 falhas consecutivas, retenção de 14 dias).

### Ponto de extensão da Fase 2
- `.planning/phases/02-modelo-de-dados-e-motor-de-acesso/02-CONTEXT.md` §D-14 — enum `CausaTransicaoAcesso` reserva o ponto de extensão para uma causa de webhook; hoje só tem `REGISTRO`, `BACKFILL`, `AVALIACAO_SESSAO`.
- `prisma/schema.prisma` — modelo `Empresa` (`acessoAte`, `trialFim`, `canceladoEm`, `acessoVitalicio`), modelo `AuditoriaAcesso`, enums `StatusAcesso`/`CausaTransicaoAcesso` — todos já existem, esta fase estende a auditoria e escreve `acessoAte` pela primeira vez.
- `lib/avaliar-acesso.ts` — função pura que decide o status a partir dos fatos; um pagamento confirmado precisa estender `acessoAte` de forma que essa função continue determinando `EM_DIA` corretamente.
- `app/services/acesso.service.ts` (`registrarTransicao`) — padrão de compare-and-swap para auditoria; um handler de webhook que grava transição deve seguir o mesmo padrão, não reinventar.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/services/*.service.ts` — padrão de classe + singleton já estabelecido; um `asaasClient` (cliente HTTP tipado) e um `assinaturaService`/`webhookService` devem seguir o mesmo estilo.
- `acessoService.registrarTransicao` (Fase 2) — compare-and-swap já implementado; o handler de webhook que atualiza `acessoAte` deve reusar esse serviço para a parte de auditoria, não duplicar a lógica de CAS.
- Padrão de erro (`HttpError`/`AuthError` com `status`) já estabelecido em `lib/api-auth.ts` — o endpoint de webhook deve seguir a mesma convenção de resposta.

### Established Patterns
- Nenhum endpoint de webhook existe hoje no projeto (`INTEGRATIONS.md`: "Incoming: None detected") — este é o primeiro. Seguir a convenção de rotas `app/api/*/route.ts` já usada em todo o projeto.
- Zero error tracking hoje (`INTEGRATIONS.md`) — se Sentry for adotado nesta fase (Claude's Discretion), é a primeira introdução dessa ferramenta no projeto.

### Integration Points
- `lib/avaliar-acesso.ts` / `app/services/acesso.service.ts` — onde a lógica de "webhook confirmado estende acessoAte" e "webhook atrasado inicia carência" se conecta ao motor de acesso já existente.
- `prisma/schema.prisma` — precisa de um novo campo/tabela para idempotência do webhook (ex.: registro do `eventId` do Asaas já processado) e do novo valor de causa de auditoria.

</code_context>

<specifics>
## Specific Ideas

- Preço do plano: R$29,90/mês (D-02).
- Nenhuma referência visual/UX específica — esta fase é backend puro (integração + webhook), sem superfície própria de UI (D-04).

</specifics>

<deferred>
## Deferred Ideas

- Botão/tela para iniciar o checkout — pertence à Fase 4 (banner de carência) ou Fase 7 (gestão de assinatura), não a esta fase (D-04).
- Retry automático de assinatura que falhou ao criar — descartado para esta fase (D-07); poderia voltar como ideia se o worker da Fase 5 quiser assumir isso.
- Reavaliação de Mercado Pago como gateway — descartada nesta discussão (D-01) por causa da fraqueza da API `preapproval` para o requisito de reativação por período; poderia ser revisitada no futuro se o Asaas se provar operacionalmente ruim (ex.: a fila de webhook pausando após 15 falhas se tornar um problema recorrente na prática).

</deferred>

---

*Phase: 3-Gateway Asaas e Ingestão de Webhooks*
*Context gathered: 2026-08-31*
