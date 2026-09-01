# Phase 4: Aplicação do Bloqueio - Context

**Gathered:** 2026-09-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Uma empresa que não paga (após os 10 dias de carência) perde de fato o acesso ao admin e tem o catálogo público despublicado — sem brecha por API, Server Action ou rota alternativa do catálogo. Cobre ACC-01 a ACC-04.

Esta fase **conecta** enforcement de UI/API ao motor de decisão que já existe (`avaliarAcesso` / `revalidarConta`, Fase 2) e ao checkout que já existe no backend (Fase 3) — não cria nenhum modelo de dados novo nem nova lógica de cálculo de status. O trabalho é: banner de carência no admin, tela de bloqueio total no admin, guarda nas rotas `/api/*`, e guarda nos 5 caminhos de leitura do catálogo público.

Fora do escopo: worker diário de reconciliação (Fase 5, quem *dispara* as transições de status sem request), termos de uso (Fase 6), tela completa de gestão de assinatura com histórico/cancelamento (Fase 7 — esta fase só precisa de um link/botão de pagamento reaproveitando o checkout da Fase 3, não uma tela de gerenciamento completa).

</domain>

<decisions>
## Implementation Decisions

### Banner de carência (ACC-01)
- **D-01:** O banner inclui um botão/link "Pagar agora" que aciona o checkout hospedado do Asaas já construído no backend na Fase 3 (`POST /api/assinaturas/checkout`). Esta fase é quem primeiro dá uma UI a esse endpoint — a Fase 7 depois constrói a tela completa de gestão de assinatura, mas o caminho de pagamento não pode esperar até lá.
- **D-02:** O banner aparece em **todas** as telas do admin durante a carência (via `app/[slug]/admin/(protected)/layout.tsx`, que já envolve 100% das páginas protegidas) e **nunca** no catálogo público — consistente com o texto já travado do ACC-01 no roadmap.
- **D-03:** Durante a carência, o catálogo público continua **totalmente funcional** — clientes da empresa continuam comprando normalmente. O bloqueio do catálogo (ACC-03) só entra em vigor depois que a carência vence e o status vira `BLOQUEADO`/`CANCELADO`. O banner de carência é estritamente um aviso interno ao admin, sem qualquer efeito no catálogo.

### Tela de bloqueio total do admin (ACC-02)
- **D-04:** Quando a empresa está `BLOQUEADO` (ou `CANCELADO`, ver D-06), toda tentativa de navegar no admin cai numa tela dedicada de bloqueio — não um redirect silencioso para login nem um erro genérico. A tela mostra: mensagem explicando a suspensão por falta de pagamento, o mesmo botão de pagamento do banner (D-01), e uma opção de logout (para o usuário não ficar preso sem conseguir sair da sessão).
- **D-05:** Chamadas diretas a `/api/*` de uma empresa bloqueada recebem um erro claro (guarda em `requireAuth`, ponto único já mapeado em `lib/api-auth.ts`) — sem exceção por rota. O endpoint `POST /api/webhooks/asaas` fica de fora dessa guarda por definição (é o próprio mecanismo que desbloqueia; não passa por `requireAuth`, usa autenticação por token separada da Fase 3).

### Tratamento de CANCELADO (D-06, ligado à D-08 da Fase 2)
- **D-06:** Uma empresa com status `CANCELADO` recebe **exatamente o mesmo tratamento** de bloqueio (mesma tela de admin, mesmo catálogo fora do ar) que uma empresa `BLOQUEADO` por atraso. Não existe uma segunda tela ou mensagem diferenciada para quem cancelou voluntariamente — mantém a decisão D-08 da Fase 2 de que a distinção entre os dois status é só o rótulo interno para fins de auditoria/investigação, não o comportamento visível.

### Catálogo bloqueado (ACC-03)
- **D-07:** Os 5 caminhos de leitura pública (mapeados no scout desta discussão: página+layout do catálogo, `GET /api/catalogo/produtos`, `GET /api/catalogo/produtos/[id]`, `GET /api/catalogo/combos`, `GET /api/catalogo/combos/[id]`) tratam uma empresa bloqueada **exatamente como uma empresa/slug/id inexistente** — mesmo código de resposta, mesmo formato de corpo, nenhuma menção a pagamento. Isso vale inclusive para os dois endpoints que aceitam `empresaId` diretamente por query string, sem passar pelo slug — não é permitido vazar para um visitante externo que aquela empresa existe mas está com o pagamento atrasado.

### Reativação automática (ACC-04)
- **D-08:** Nenhum mecanismo novo de "reativação" precisa ser construído nesta fase além do enforcement em si — como `revalidarConta` já reavalia o status a cada request (Fase 1/2) e o webhook da Fase 3 já estende `acessoAte` de forma monotônica, o próximo request de um admin após o pagamento cair naturalmente mostra o admin liberado de novo. Esta fase só precisa garantir que a guarda checa o status vivo (via `revalidarConta`/`ContaAtiva.statusAcesso`) a cada vez, nunca um valor em cache além do `React.cache()` por-request já existente.

### Claude's Discretion
- Código de resposta HTTP exato usado pelos 5 caminhos do catálogo para simular "não encontrado" (404 puro vs. o mesmo formato de erro que `resolveIdBySlug`/`findBySlug` já usam para slug/id inexistente) — desde que seja indistinguível do caso real de não-existência.
- Estrutura exata do componente de banner e da tela de bloqueio (nome de arquivo, se client ou server component) — não existe padrão de `Banner`/`Alert`/`Aviso` reutilizável hoje no projeto (confirmado no scout), então esta fase estabelece o primeiro.
- Onde exatamente a checagem de `statusAcesso` entra em `requireAdminSession`/`requireAuth` (dentro da própria função vs. wrapper adicional) — desde que os ~40 call sites de `requireAdminSession` e todas as rotas que usam `requireAuth` fiquem cobertos sem precisar editar cada chamador individualmente.
- Texto exato do banner e da tela de bloqueio (copy) — segue o tom já usado no projeto (mensagens diretas em português, ex. "Sessão inválida.").

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/ROADMAP.md` §"Phase 4: Aplicação do Bloqueio" — goal e 5 success criteria (banner, bloqueio admin+API, catálogo, reativação automática).
- `.planning/REQUIREMENTS.md` §ACC-01 a ACC-04 — texto completo dos requisitos.
- `.planning/PROJECT.md` §"Active" — bloqueio sem mensagem de pagamento no catálogo, banner só no admin.

### Pontos de extensão já preparados por fases anteriores
- `lib/auth-guard.ts` — `ContaAtiva` (interface completa: `statusAcesso`, `acessoExpiraEm`, `carenciaAte`) e `revalidarConta`; comentário nas linhas ~44-46 diz explicitamente que aplicar o bloqueio é trabalho desta fase.
- `lib/avaliar-acesso.ts` — função pura `avaliarAcesso`, os 6 valores de `StatusAcesso` (`TRIAL, EM_DIA, CARENCIA, BLOQUEADO, CANCELADO, VITALICIO`), `DIAS_DE_CARENCIA = 10`.
- `lib/session.ts` (`requireAdminSession`, linha ~90) — usado por ~40 call sites em `page.tsx`/`actions.ts`/`layout.tsx` sob `(protected)/`; hoje só verifica sessão válida, não `statusAcesso`.
- `lib/api-auth.ts` (`requireAuth`, linha ~26) — usado por todas as rotas `/api/*` autenticadas (combos, produtos, promoções, movimentações, usuários, empresas, assinaturas/checkout); hoje só verifica `if (!conta)`.
- `app/[slug]/admin/(protected)/layout.tsx` — único layout compartilhado por todas as páginas do admin; ponto de inserção do banner (dois branches de render, SIMPLES e completo — banner precisa cobrir os dois).
- `app/api/assinaturas/checkout/route.ts` — endpoint da Fase 3 que cria o checkout hospedado; comentário nas linhas 6-13 já nota que não tem UI consumidora ainda — esta fase é quem constrói essa UI (D-01).

### Os 5 caminhos do catálogo público (ACC-03)
- `app/[slug]/(catalogo)/page.tsx` + `layout.tsx` → `getEmpresaCatalogo` (`app/[slug]/_lib/empresa.ts`) → `empresaService.findBySlug` (`app/services/empresa.service.ts`).
- `app/api/catalogo/produtos/route.ts` (aceita `empresaId` direto por query string) → `produtoService.listCatalogo`.
- `app/api/catalogo/produtos/[id]/route.ts` → `produtoService.findCatalogoById` (hoje sem filtro de tenant).
- `app/api/catalogo/combos/route.ts` (aceita `empresaId` direto por query string) → `comboService.listCatalogo`.
- `app/api/catalogo/combos/[id]/route.ts` → `comboService.findCatalogoById` (hoje sem filtro de tenant).
- `empresaService.resolveIdBySlug` (`app/services/empresa.service.ts`) — usado pelos endpoints de lista para resolver slug→id.

### Fases anteriores (decisões que este trabalho não deve re-decidir)
- `.planning/phases/02-modelo-de-dados-e-motor-de-acesso/02-CONTEXT.md` §D-08 — `CANCELADO` recebe o mesmo tratamento de bloqueio que `BLOQUEADO`, só o rótulo difere (base da D-06 desta fase).
- `.planning/phases/03-gateway-asaas-e-ingest-o-de-webhooks/03-CONTEXT.md` §D-04 — a Fase 3 deliberadamente não construiu UI para o checkout; esta fase é onde esse ponto de entrada de UI finalmente aparece.
- `.planning/phases/03-gateway-asaas-e-ingest-o-de-webhooks/03-07-SUMMARY.md` — homologação real do checkout+webhook contra o sandbox Asaas, incluindo o bug de resolução de tenant corrigido (`checkoutSession` autoritativo) — a extensão de `acessoAte` que alimenta a reativação automática (D-08 desta fase) já está provada em produção-símile.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ContaAtiva.statusAcesso`/`carenciaAte` (Fase 1/2) — já carregam tudo que o banner e a guarda precisam; não é necessário nenhum novo campo ou query.
- Padrão de erro (`HttpError`/`AuthError` com `status`) já estabelecido — a guarda de bloqueio em `requireAuth` deve seguir a mesma convenção de resposta.

### Established Patterns
- Nenhum componente de `Banner`/`Alert` existe hoje (confirmado por grep) — esta fase estabelece o primeiro padrão desse tipo no projeto.
- Não existe `middleware.ts` no projeto — o padrão consistente é guarda por função (`requireAdminSession`/`requireAuth`), não interceptação global; esta fase deve seguir esse padrão, não introduzir middleware como exceção.
- Componentes ficam colocados por rota em `_components/`, não em um diretório `components/` central.

### Integration Points
- `app/[slug]/admin/(protected)/layout.tsx` — inserção do banner, cobrindo os dois branches de render (SIMPLES e completo).
- `lib/session.ts` / `lib/api-auth.ts` — pontos únicos onde a checagem de `statusAcesso` bloqueia navegação e chamadas de API.
- `app/api/catalogo/**/route.ts` + `app/[slug]/(catalogo)/**` — pontos onde a checagem de `statusAcesso` da empresa dona do catálogo precisa entrar antes de qualquer leitura de produto/combo.

</code_context>

<specifics>
## Specific Ideas

- Banner e tela de bloqueio reaproveitam o endpoint `POST /api/assinaturas/checkout` (Fase 3) como CTA de pagamento — não uma nova integração, só a primeira UI sobre um backend que já existe.
- Catálogo bloqueado deve ser indistinguível de "essa loja não existe" para qualquer visitante externo — decisão de segurança/privacidade do lojista, não só UX.

</specifics>

<deferred>
## Deferred Ideas

- Tela completa de gestão de assinatura (histórico de pagamentos, cancelamento pelo usuário, data exata de fim de acesso) — pertence à Fase 7; esta fase só entrega o botão mínimo de pagamento dentro do banner/tela de bloqueio.
- Qualquer UI de superadmin ou ativação de `acessoVitalicio` pela UI — fora de escopo do milestone inteiro (PROJECT.md §Out of Scope).

</deferred>

---

*Phase: 4-Aplicação do Bloqueio*
*Context gathered: 2026-09-01*
