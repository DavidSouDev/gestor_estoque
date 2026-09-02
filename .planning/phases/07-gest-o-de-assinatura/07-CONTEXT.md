# Phase 7: Gestão de Assinatura - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Phase Boundary

O usuário (admin de uma empresa) enxerga e controla a própria assinatura direto no painel — vê o status atual, a data até quando o acesso está pago, a próxima cobrança, e consegue cancelar sem falar com ninguém. Cobre SUB-01 a SUB-03.

Esta fase **conecta** uma UI nova ao backend Asaas que já existe (`assinaturaService.criarCheckout`, Fase 3) e ao motor de acesso que já existe (`avaliarAcesso`/`revalidarConta`, Fase 2) e ao enforcement de bloqueio que já existe (Fase 4) — não recalcula nada, só expõe e adiciona a ação de cancelar. O único código de integração novo com o Asaas é **ler o status de uma assinatura existente** (`asaasClient.buscarAssinatura`, já existe) e **cancelar uma assinatura existente** (endpoint de cancelamento do Asaas — não existe ainda no `asaasClient`, é trabalho desta fase).

Fora do escopo: qualquer mudança no motor de decisão de acesso (`avaliarAcesso`) ou no enforcement de bloqueio (Fase 4) — uma empresa cancelada que passa do fim do período pago já é bloqueada pelo mesmo fluxo que qualquer outra empresa inadimplente (decisão D-06 da Fase 4, `CANCELADO` = mesmo tratamento que `BLOQUEADO`); esta fase não precisa e não deve reimplementar isso. Também fora de escopo: pausar assinatura (só cancelar), múltiplos planos/preços, notificações proativas de trial acabando (isso é o banner de carência da Fase 4, já existe), qualquer UI de superadmin.

</domain>

<decisions>
## Implementation Decisions

### Sincronização pós-checkout (critério de sucesso #2)
- **D-01:** Ao voltar do checkout hospedado do Asaas, o status reflete o pagamento "em segundos" via **polling no cliente com backoff**, não uma consulta síncrona bloqueando o render inicial da página. A tela de retorno consulta o status a cada poucos segundos até refletir o pagamento ou atingir um limite razoável de tentativas — número exato de tentativas/intervalo é Claude's Discretion (ver abaixo), a pesquisa da Fase 3 (`FEATURES.md`) já recomenda esse padrão em vez de esperar o próximo webhook.

### Fonte do status exibido (SUB-01)
- **D-02:** Status atual e "próxima cobrança" vêm de uma **consulta viva ao Asaas a cada carregamento da tela** (`asaasClient.buscarAssinatura(asaasSubscriptionId)`), não de um campo espelhado localmente atualizado só por webhook. Justificativa do usuário: sempre atual, sem depender de webhook ter chegado — aceita a dependência de uma chamada de rede externa por carregamento de página. Isso é consistente com `03-RESEARCH.md`: Asaas não tem webhook de assinatura financeiro robusto (só `SUBSCRIPTION_CREATED/UPDATED/INACTIVATED/DELETED`, o estado financeiro vem de eventos `PAYMENT_*`), então uma consulta viva ao endpoint de assinatura é a fonte mais confiável de "próxima cobrança".
- **D-02b (decorrência):** Se a consulta ao Asaas falhar (rede, gateway fora do ar), a tela precisa de um estado degradado claro (ex.: "não foi possível carregar o status agora, tente novamente") — não travar a página nem mostrar dado desatualizado como se fosse atual. Mecanismo exato (retry, mensagem) é Claude's Discretion.

### Fluxo e confirmação de cancelamento (SUB-02, critério de sucesso #3)
- **D-03:** Cancelar exige uma **confirmação explícita via modal**, mostrando a **data exata** até quando o acesso continua ativo antes do segundo clique de confirmação (ex.: "ativo até 14/09/2026, não será renovado") — recomendação já capturada em `FEATURES.md`: sem essa frase o usuário abre chamado ou faz chargeback. Um clique não cancela nada.
- **D-04:** Cancelar precisa **de fato parar as cobranças futuras no Asaas** (chamar o endpoint de cancelamento da assinatura), não só gravar `canceladoEm` localmente e deixar a assinatura "aberta" no gateway. A migration de `03-04-PLAN.md` documentou explicitamente que `endDate` foi **omitido de propósito** ao criar a assinatura — "assinatura aberta até cancelamento (SUB-02, Fase 7)" — esta é a fase que fecha esse ciclo. `asaasClient` ainda não tem um método de cancelamento; é trabalho novo desta fase (não existe research prévia documentando o endpoint exato — o planner/researcher precisa investigar a doc do Asaas para `DELETE /v3/subscriptions/{id}` ou equivalente).
- **D-05 (segurança, não é discricionário — já mapeado em `03-PITFALLS.md` Pitfall 11):** O cancelamento **nunca** aceita um `assinaturaId`/`asaasSubscriptionId` vindo do cliente. O id é derivado exclusivamente de `session.empresaId` no servidor (mesmo padrão de `iniciarPagamento` em `assinatura-actions.ts`) — a Server Action de cancelar não recebe nenhum id como parâmetro. Isso fecha o vetor de IDOR "uma empresa cancela a assinatura de outra" que a pesquisa já identificou nominalmente para esta fase.

### Local da tela (SUB-01, SUB-02)
- **D-06:** Nova rota dedicada `/{slug}/admin/assinatura` dentro de `(protected)`, seguindo o mesmo padrão de `marca`/`estoque`/`combos`/`produtos`/`promocoes` já existentes — com link novo em `admin-nav.tsx`. Não é uma seção dentro de uma tela existente.

### Claude's Discretion
- Número exato de tentativas de polling e intervalo entre elas na tela de retorno do checkout (D-01) — desde que convirja em segundos (não minutos) e tenha um limite finito com fallback claro se esgotar sem confirmar o pagamento.
- Endpoint exato do Asaas para cancelar assinatura e shape do novo método em `asaasClient`/`assinaturaService` (D-04) — pesquisar a doc do Asaas; não existe research prévia documentando isso.
- Texto exato da tela (copy) — segue o tom direto já usado no projeto.
- Onde exatamente inserir o novo item no `admin-nav.tsx` (ordem/posição) — segue o padrão visual já estabelecido pelos itens existentes.
- Tratamento de erro ao chamar o Asaas para cancelar (o que fazer se o Asaas responder erro ao tentar cancelar) — não deixar a UI achar que cancelou se a chamada ao gateway falhou; `canceladoEm` local só é gravado depois de confirmar o cancelamento no Asaas, não antes/em paralelo (evita o estado "achamos que cancelou mas o Asaas ainda vai cobrar").

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/ROADMAP.md` §"Phase 7: Gestão de Assinatura" — goal e 4 success criteria.
- `.planning/REQUIREMENTS.md` §"Gestão de Assinatura" — SUB-01 a SUB-03, texto completo.
- `.planning/PROJECT.md` §"Key Decisions" — R$29,90/mês (D-02 da Fase 3), reativação cobra só o período corrente sem retroativo.

### Segurança — leitura obrigatória antes de planejar
- `.planning/research/PITFALLS.md` §"Pitfall 11: Multi-tenant isolation leaks introduced by the new billing surfaces" — o cenário nominal "Cancel-subscription action taking an assinaturaId from the form body" é exatamente o que esta fase constrói; a mitigação (derivar tudo de `session.empresaId`, nunca aceitar id do cliente) é D-05 acima.
- `.planning/research/PITFALLS.md` §"Security Mistakes" (tabela) — linha "Client-supplied assinaturaId/customerId in cancel or status endpoints".
- `.planning/research/PITFALLS.md` linha ~558 — checklist E2E: "as company A, attempt to read/cancel company B's subscription by id; verify 404" — vira caso de teste obrigatório desta fase.

### Pesquisa de UX/produto já feita para esta fase
- `.planning/research/FEATURES.md` §"Tela de gerenciamento de assinatura" e §"Cancelamento self-service com acesso até o fim do período pago" — recomendação de mostrar a data exata ao confirmar cancelamento (base da D-03).
- `.planning/research/SUMMARY.md` §"Phase 6: Subscription Management UI + Polish" (numeração antiga do roadmap de pesquisa — corresponde à Fase 7 atual) — "post-checkout sync + backoff polling" (base da D-01), "cancellation flow with exact access-until date".

### Pontos de extensão já preparados por fases anteriores
- `app/services/assinatura.service.ts` (`assinaturaService.criarCheckout`) — padrão de service a seguir; ganha um novo método de cancelamento nesta fase.
- `lib/billing/asaas/client.ts` (`asaasClient`) — já tem `buscarAssinatura(id)`; precisa ganhar um método de cancelamento (D-04, sem research prévia do endpoint exato).
- `lib/billing/asaas/tipos.ts` §`AsaasSubscription` — shape já tipado (`id`, `customer`, `status`, `cycle`, `nextDueDate`).
- `prisma/schema.prisma` §`model Empresa` — `asaasSubscriptionId` (`@unique`, já capturado pelo webhook da Fase 3), `asaasCustomerId`, `canceladoEm`, `acessoAte` — todos os campos que esta fase precisa já existem, nenhuma migration de schema nova é esperada além de possivelmente um novo valor de `CausaTransicaoAcesso` se o cancelamento gravar uma transição de auditoria.
- `app/[slug]/admin/_lib/assinatura-actions.ts` (`iniciarPagamento`) — padrão de Server Action a seguir para a nova ação de cancelar: deriva tudo de `getVerifiedSession()`, nunca lê id do `FormData`, usa `redirect()` fora de qualquer `try/catch`.
- `.planning/phases/03-gateway-asaas-e-ingest-o-de-webhooks/03-04-PLAN.md` linha ~114 — nota explícita de que `endDate` foi omitido na criação da assinatura de propósito, para esta fase fechar o ciclo (base da D-04).
- `.planning/phases/04-aplica-o-do-bloqueio/04-CONTEXT.md` §D-01, §D-06 — botão de pagamento já reaproveita `POST /api/assinaturas/checkout`; `CANCELADO` recebe o mesmo tratamento de bloqueio que `BLOQUEADO` (esta fase não precisa reimplementar bloqueio, só disparar o cancelamento).
- `app/[slug]/admin/(protected)/_components/admin-nav.tsx` — padrão de navegação lateral/topo a estender com o novo item (D-06).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `assinaturaService` (classe + singleton) — padrão de service já estabelecido, esta fase adiciona um método, não cria um service novo.
- `asaasClient.buscarAssinatura(id)` — já existe e já tipado; usado direto para D-02.
- Padrão de erro (`HttpError`/`AuthError` com `.status`) — segue o mesmo em qualquer nova rota/action.
- `getVerifiedSession()` — mesma função de sessão usada por `iniciarPagamento`, reaproveitada pela nova action de cancelar.

### Established Patterns
- Rotas do admin protegido seguem `app/[slug]/admin/(protected)/{secao}/page.tsx` + `actions.ts` colocados por rota (não um diretório central de `components/`).
- Nenhuma chamada de rede parte de client component (mesma nota de `assinatura-actions.ts`) — toda integração com Asaas passa por Server Action ou Server Component.
- `admin-nav.tsx` já lista as seções existentes (marca, estoque, combos, produtos, promoções) — o padrão de adicionar uma nova seção já está estabelecido, só falta seguir.

### Integration Points
- `asaasClient` (`lib/billing/asaas/client.ts`) — ganha o novo método de cancelamento.
- `assinaturaService` (`app/services/assinatura.service.ts`) — ganha o método que orquestra "cancelar no Asaas, depois gravar `canceladoEm` local" (nessa ordem, D-04/Claude's Discretion).
- `admin-nav.tsx` — novo item de navegação para `/{slug}/admin/assinatura`.
- Nova rota `app/[slug]/admin/(protected)/assinatura/page.tsx` + `actions.ts` — tela de status + ação de cancelar.

</code_context>

<specifics>
## Specific Ideas

- Copy de confirmação de cancelamento deve mostrar a data exata, no formato já sugerido pela pesquisa: "ativo até {data}, não será renovado" (D-03).
- Preço do plano (R$29,90/mês, já travado desde a Fase 3) pode aparecer na tela de status, mas não é uma decisão nova desta fase.

</specifics>

<deferred>
## Deferred Ideas

- Pausar assinatura em vez de cancelar — `FEATURES.md` menciona como ideia v1.x (Stripe suporta nativamente `paused`; Asaas não foi pesquisado para isso). Fora do escopo desta fase.
- Múltiplos planos/preços — já está em `PROJECT.md` §Out of Scope do milestone inteiro.
- Notificações proativas de trial acabando/carência — já coberto pelo banner da Fase 4 (ACC-01); esta fase não adiciona um canal de notificação novo.
- Portal hospedado do próprio gateway (o que o Stripe Customer Portal ofereceria de graça) — não se aplica, o gateway escolhido foi Asaas (D-01 da Fase 3), que não tem portal de autoatendimento pronto (`STACK.md`) — por isso esta fase constrói a tela do zero.

</deferred>

---

*Phase: 7-Gestão de Assinatura*
*Context gathered: 2026-09-02*
