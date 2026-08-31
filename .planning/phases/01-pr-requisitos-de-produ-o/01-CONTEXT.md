# Phase 1: Pré-requisitos de Produção - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase corrige dois pré-requisitos técnicos identificados pela pesquisa do projeto como bloqueadores reais para o resto do milestone de billing:

1. **INFRA-01** — O cliente Prisma (`lib/prisma.ts`) é cacheado apenas em desenvolvimento. Em produção, cada import cria uma nova `PrismaClient` com seu próprio pool de conexões, esgotando o pool do Postgres sob carga (worker diário + webhooks vão multiplicar esse problema nas próximas fases).
2. **INFRA-02** — Hoje a sessão do admin (`requireAdminSession`, cookie) e a autenticação de API (`requireAuth`, Bearer) só verificam a assinatura/validade do JWT — nunca voltam ao banco. Um Usuario desativado (`ativo = false`) ou uma Empresa removida (`deletedAt` preenchido) continua autenticado normalmente até o JWT expirar (7 dias). Sem revalidação no banco a cada request, bloquear uma empresa nas fases futuras (4 e 5) não teria efeito real para quem já está logado.

Fora do escopo desta fase: qualquer lógica de status de pagamento (`acessoAte`, `trialFim`, carência, bloqueio) — isso é Fase 2 em diante. Esta fase só constrói a infraestrutura de revalidação; ela não decide *o que* bloqueia, só garante que o sistema *consegue* checar o banco a cada request de forma confiável e barata.

</domain>

<decisions>
## Implementation Decisions

### Comportamento em falha de revalidação
- **D-01:** Se a query de revalidação ao banco falhar (timeout, erro de conexão), a sessão é tratada como inválida — **fail-closed**. Redireciona para login (`requireAdminSession`) ou lança `AuthError` 401 (`requireAuth`). Nunca deixa passar uma sessão que não pôde ser confirmada. Consistente com o Core Value ("sem exceções") e evita abrir uma janela de acesso indevido por instabilidade momentânea do banco.

### Escopo da checagem no banco
- **D-02:** A revalidação nesta fase verifica apenas `Usuario.ativo === true` e `Empresa.deletedAt === null`. Não inclui nenhuma lógica de status de pagamento — esses campos (`acessoAte`, `trialFim`, etc.) só existem a partir da Fase 2.
- **D-03:** A função de revalidação deve buscar o Usuario e a Empresa atuais do banco (não confiar em nenhum dado do payload do JWT além do `sub`/`empresaId` para localizar os registros) e comparar contra o token antes de autorizar.
- **D-04:** Esta função é o ponto de extensão natural para a Fase 2 plugar a avaliação de acesso por pagamento (`avaliarAcesso`) depois — mas nesta fase ela faz **apenas** a checagem de existência/ativo acima. Não construir abstrações antecipadas para o payload de pagamento; a Fase 2 estende quando os fatos existirem.

### Onde a revalidação é aplicada
- **D-05:** A revalidação no banco é aplicada em **ambas** as camadas de auth: `requireAdminSession` (`lib/session.ts`, usado por Server Components/layouts/Server Actions do admin) e `requireAuth` (`lib/api-auth.ts`, usado pelas rotas `app/api/*` com Bearer token).
- **D-06:** `proxy.ts` (Edge) **não muda** — continua fazendo apenas a checagem otimista de JWT (sem Prisma), como já documentado no comentário existente e confirmado pela pesquisa do projeto (Edge não roda Prisma/`pg`). A revalidação real acontece nas camadas server (session/api-auth), nunca no proxy.

### Custo por request
- **D-07:** A revalidação é deduplicada dentro do mesmo request usando `React.cache()` (mesmo padrão já usado em `getEmpresaCatalogo()`), para que múltiplas chamadas a `requireAdminSession` dentro do mesmo request (layout + page + Server Action) resultem em **uma única query** ao banco, não uma por chamada. Isso é especialmente importante logo após corrigir o singleton do Prisma (INFRA-01) — não queremos reintroduzir pressão de conexões por outro caminho.
- **D-08:** Note que `React.cache()` deduplica por request do lado do servidor; Server Actions disparadas via navegador contam como requests HTTP separados da página que as invocou, então cada Server Action ainda dispara sua própria query (não há como evitar isso sem um cache cross-request, que está fora de escopo aqui).

### Claude's Discretion
- Estrutura exata do retorno da função de revalidação (throw vs. objeto tipado) — desde que fail-closed e cache por-request sejam respeitados.
- Nome e local exato da função de revalidação compartilhada entre `session.ts` e `api-auth.ts` (ex.: novo helper em `lib/`).
- Estratégia de teste para a correção do singleton do Prisma (unit vs. verificação manual de contagem de conexões).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Bug do singleton do Prisma (INFRA-01)
- `.planning/codebase/CONCERNS.md` §"Prisma Client Singleton Misconfiguration" — descreve o bug exato (`NODE_ENV !== "production"` guard), impacto e fix approach recomendado.
- `lib/prisma.ts` — arquivo a corrigir.

### Revalidação de sessão (INFRA-02)
- `lib/session.ts` — `requireAdminSession()`, `getSession()` — camada de auth para Server Components/Actions do admin (cookie).
- `lib/api-auth.ts` — `requireAuth()` — camada de auth para rotas `app/api/*` (Bearer token).
- `lib/jwt.ts` — `verifyAuthToken()`, shape do `AuthTokenPayload`.
- `proxy.ts` — checagem otimista de JWT no Edge; **não** deve ganhar acesso a Prisma (ver research abaixo).
- `prisma/schema.prisma` — modelos `Usuario` (`ativo: Boolean`) e `Empresa` (`deletedAt: DateTime?`) usados na checagem.

### Pesquisa do projeto (arquitetura de auth/gating)
- `.planning/research/STACK.md` — linha "`middleware.ts` para bloquear tenant inadimplente" na tabela de anti-padrões: confirma que o Next.js 16 renomeou `middleware.ts` para `proxy.ts` (deprecado sob o nome antigo) e que a doc do framework recomenda **não** fazer query Prisma no Proxy — gate deve ficar no layout do admin (Server Component) + em `lib/api-auth.ts` para rotas de API + dentro da função que serve o catálogo público. Esta fase implementa a parte de session/api-auth dessa arquitetura; o catálogo público é tratado na Fase 4.
- `.planning/research/STACK.md` §"Recomendação de hosting" — reforça que corrigir o singleton do Prisma é pré-requisito antes de qualquer decisão de hosting serverless (Vercel), pois em serverless o bug de INFRA-01 vira exaustão de pool imediatamente.

### Requisitos e roadmap
- `.planning/REQUIREMENTS.md` §"Infraestrutura" — INFRA-01, INFRA-02 (texto completo dos requisitos).
- `.planning/ROADMAP.md` §"Phase 1: Pré-requisitos de Produção" — goal e 4 success criteria desta fase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `React.cache()` já é usado em `getEmpresaCatalogo()` (padrão de dedupe por-request no projeto) — reutilizar a mesma técnica para a revalidação de sessão (D-07).
- `AuthError` (`lib/api-auth.ts`) já existe com `status` — reutilizar para o caminho fail-closed em `requireAuth`.

### Established Patterns
- `requireAdminSession` já usa `redirect()` do Next.js para sessão inválida — o caminho fail-closed de INFRA-02 segue o mesmo padrão, só passa a incluir "não encontrado/inativo no banco" como mais um motivo de redirect, além do que já existe (token ausente, `empresaSlug` não bate).
- `@@unique([empresaId])` em `Usuario` — hoje só existe **um** usuário (admin) por empresa. Isso simplifica a query de revalidação (busca por `empresaId`, não precisa lidar com múltiplos usuários da mesma empresa nesta fase).

### Integration Points
- `app/[slug]/admin/(protected)/layout.tsx` chama `requireAdminSession(slug)` uma vez — é o ponto mais alto da árvore onde a revalidação entra em vigor para todas as páginas do admin protegido.
- Todas as rotas em `app/api/*/route.ts` chamam `requireAuth(request)` no início de cada handler — a mudança em `lib/api-auth.ts` propaga automaticamente para todas elas sem editar cada rota.

</code_context>

<specifics>
## Specific Ideas

No specific UI/UX requirements — esta fase é infraestrutura pura, sem superfície visível para o usuário final (exceto no caso de falha: usuário ativo normalmente não deve notar nenhuma diferença).

</specifics>

<deferred>
## Deferred Ideas

- Extensão da função de revalidação para checar status de pagamento (`acessoAte`, carência, bloqueio) — pertence à Fase 2 (modelo de dados) e Fase 4 (aplicação do bloqueio). Esta fase só prepara o ponto de extensão (D-04), não implementa a lógica de pagamento.
- Gate no catálogo público (`getEmpresaCatalogo` e os 5 caminhos de leitura pública) — pertence à Fase 4 (Aplicação do Bloqueio), não a esta fase.

None — discussão ficou dentro do escopo da fase além dos itens acima, que já são fases futuras conhecidas no roadmap.

</deferred>

---

*Phase: 1-Pré-requisitos de Produção*
*Context gathered: 2026-08-31*
