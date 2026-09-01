# Phase 4: Aplicação do Bloqueio - Research

**Researched:** 2026-09-01
**Domain:** Enforcement de autorização por status de assinatura em Next.js 16 App Router (multi-tenant, RSC + Route Handlers)
**Confidence:** HIGH (codebase), HIGH (Next.js 16.3.0 — docs empacotados no próprio `node_modules`), LOW (convenções web sobre 402/enumeração)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Banner de carência (ACC-01)**
- **D-01:** O banner inclui um botão/link "Pagar agora" que aciona o checkout hospedado do Asaas já construído no backend na Fase 3 (`POST /api/assinaturas/checkout`). Esta fase é quem primeiro dá uma UI a esse endpoint — a Fase 7 depois constrói a tela completa de gestão de assinatura, mas o caminho de pagamento não pode esperar até lá.
- **D-02:** O banner aparece em **todas** as telas do admin durante a carência (via `app/[slug]/admin/(protected)/layout.tsx`, que já envolve 100% das páginas protegidas) e **nunca** no catálogo público — consistente com o texto já travado do ACC-01 no roadmap.
- **D-03:** Durante a carência, o catálogo público continua **totalmente funcional** — clientes da empresa continuam comprando normalmente. O bloqueio do catálogo (ACC-03) só entra em vigor depois que a carência vence e o status vira `BLOQUEADO`/`CANCELADO`. O banner de carência é estritamente um aviso interno ao admin, sem qualquer efeito no catálogo.

**Tela de bloqueio total do admin (ACC-02)**
- **D-04:** Quando a empresa está `BLOQUEADO` (ou `CANCELADO`, ver D-06), toda tentativa de navegar no admin cai numa tela dedicada de bloqueio — não um redirect silencioso para login nem um erro genérico. A tela mostra: mensagem explicando a suspensão por falta de pagamento, o mesmo botão de pagamento do banner (D-01), e uma opção de logout (para o usuário não ficar preso sem conseguir sair da sessão).
- **D-05:** Chamadas diretas a `/api/*` de uma empresa bloqueada recebem um erro claro (guarda em `requireAuth`, ponto único já mapeado em `lib/api-auth.ts`) — sem exceção por rota. O endpoint `POST /api/webhooks/asaas` fica de fora dessa guarda por definição (é o próprio mecanismo que desbloqueia; não passa por `requireAuth`, usa autenticação por token separada da Fase 3).

**Tratamento de CANCELADO**
- **D-06:** Uma empresa com status `CANCELADO` recebe **exatamente o mesmo tratamento** de bloqueio (mesma tela de admin, mesmo catálogo fora do ar) que uma empresa `BLOQUEADO` por atraso. Não existe uma segunda tela ou mensagem diferenciada para quem cancelou voluntariamente — mantém a decisão D-08 da Fase 2 de que a distinção entre os dois status é só o rótulo interno para fins de auditoria/investigação, não o comportamento visível.

**Catálogo bloqueado (ACC-03)**
- **D-07:** Os 5 caminhos de leitura pública (mapeados no scout desta discussão: página+layout do catálogo, `GET /api/catalogo/produtos`, `GET /api/catalogo/produtos/[id]`, `GET /api/catalogo/combos`, `GET /api/catalogo/combos/[id]`) tratam uma empresa bloqueada **exatamente como uma empresa/slug/id inexistente** — mesmo código de resposta, mesmo formato de corpo, nenhuma menção a pagamento. Isso vale inclusive para os dois endpoints que aceitam `empresaId` diretamente por query string, sem passar pelo slug — não é permitido vazar para um visitante externo que aquela empresa existe mas está com o pagamento atrasado.

**Reativação automática (ACC-04)**
- **D-08:** Nenhum mecanismo novo de "reativação" precisa ser construído nesta fase além do enforcement em si — como `revalidarConta` já reavalia o status a cada request (Fase 1/2) e o webhook da Fase 3 já estende `acessoAte` de forma monotônica, o próximo request de um admin após o pagamento cair naturalmente mostra o admin liberado de novo. Esta fase só precisa garantir que a guarda checa o status vivo (via `revalidarConta`/`ContaAtiva.statusAcesso`) a cada vez, nunca um valor em cache além do `React.cache()` por-request já existente.

### Claude's Discretion

- Código de resposta HTTP exato usado pelos 5 caminhos do catálogo para simular "não encontrado" (404 puro vs. o mesmo formato de erro que `resolveIdBySlug`/`findBySlug` já usam para slug/id inexistente) — desde que seja indistinguível do caso real de não-existência.
- Estrutura exata do componente de banner e da tela de bloqueio (nome de arquivo, se client ou server component) — não existe padrão de `Banner`/`Alert`/`Aviso` reutilizável hoje no projeto (confirmado no scout), então esta fase estabelece o primeiro.
- Onde exatamente a checagem de `statusAcesso` entra em `requireAdminSession`/`requireAuth` (dentro da própria função vs. wrapper adicional) — desde que os ~40 call sites de `requireAdminSession` e todas as rotas que usam `requireAuth` fiquem cobertos sem precisar editar cada chamador individualmente.
- Texto exato do banner e da tela de bloqueio (copy) — segue o tom já usado no projeto (mensagens diretas em português, ex. "Sessão inválida.").

### Deferred Ideas (OUT OF SCOPE)

- Tela completa de gestão de assinatura (histórico de pagamentos, cancelamento pelo usuário, data exata de fim de acesso) — pertence à Fase 7; esta fase só entrega o botão mínimo de pagamento dentro do banner/tela de bloqueio.
- Qualquer UI de superadmin ou ativação de `acessoVitalicio` pela UI — fora de escopo do milestone inteiro (PROJECT.md §Out of Scope).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACC-01 | Banner de aviso em destaque aparece em todas as telas do admin (exceto catálogo público) durante a carência, mostrando dias restantes e pedindo o pagamento | §Pattern 3 (banner no layout + `carenciaAte` já vem pronto de `ContaAtiva`); §Pitfall 4 (partial rendering: layouts não re-renderizam em navegação client-side — o banner pode ficar stale); §Pattern 5 (CTA de pagamento por Server Action, não por `fetch`) |
| ACC-02 | Após os 10 dias de carência, todos os usuários daquela Empresa perdem acesso ao painel admin | §Recomendação 1 (guarda no DAL, não em `proxy.ts` nem no layout); §Pattern 1 (`requireAdminSession` → `redirect` para rota de bloqueio FORA de `(protected)`); §Pattern 2 (`requireAuth` lança `AuthError(status)` — os 29 handlers já propagam `error.status` sem edição); §Pitfall 1 (allowlist do checkout senão ninguém consegue pagar) |
| ACC-03 | Catálogo público da Empresa bloqueada fica indisponível (sem mensagem de pagamento) — o guard é aplicado nos 5 caminhos de leitura pública existentes, não só na página principal | §Achado crítico 1 (são **6** caminhos, não 5 — `GET /api/empresas/slug/[slug]` está fora do CONTEXT.md); §Pattern 4 (funil único `findPublicavel*` no service); §Tabela de paridade de resposta; §Pitfall 2 (timing side-channel por query extra); §Achado crítico 2 (`getEmpresaCatalogo` também alimenta a tela de login do admin) |
| ACC-04 | Reativação acontece automaticamente ao pagar a cobrança do período corrente do gateway — sem cobrança retroativa dos meses em que ficou bloqueada | §Pattern 6 (nenhum cache cross-request pode entrar no caminho da guarda); `avaliarAcesso` já é puro e re-derivado por request (verificado em `lib/auth-guard.ts:88`); §Pitfall 6 (`unstable_cache`/`'use cache'` proibidos aqui) |
</phase_requirements>

---

## Summary

Esta fase não inventa nada: ela liga o motor de decisão da Fase 2 (`avaliarAcesso` → `ContaAtiva.statusAcesso`) a quatro superfícies de enforcement — o layout do admin (banner), as páginas/Server Actions do admin (tela de bloqueio), as rotas `/api/*` autenticadas, e os caminhos públicos do catálogo. Todo o trabalho pesado (derivar status dos 4 fatos de billing, per-request, fail-closed, com auditoria) já está feito e testado. O risco desta fase é quase inteiramente de **cobertura** e de **canais laterais**, não de algoritmo.

Três achados mudam materialmente o plano em relação ao que o CONTEXT.md assume. **Primeiro:** existe um sexto caminho público de leitura do catálogo — `GET /api/empresas/slug/[slug]` — completamente sem autenticação, que devolve produtos, combos e promoções inteiros via `empresaService.findBySlug`. O D-07 lista cinco. Gatear cinco e esquecer o sexto deixa o ACC-03 falso. **Segundo:** `getEmpresaCatalogo` (o wrapper que chama `findBySlug` e dispara `notFound()`) é consumido não só pelo catálogo mas **também por `app/[slug]/admin/login/page.tsx`**, que o usa só para pegar logo e cores. Colocar o gate dentro de `findBySlug` faz a tela de login de uma empresa bloqueada virar 404 — e um usuário bloqueado que não consegue nem logar nunca consegue pagar, invertendo o objetivo da fase. **Terceiro:** o CONTEXT.md afirma que "não existe `middleware.ts` no projeto"; isso é verdade pela letra, mas o Next 16 renomeou middleware para **proxy**, e `proxy.ts` existe na raiz e já faz a checagem otimista de cookie do admin. A pergunta "middleware ou guarda por função?" já foi respondida por este repositório — e a resposta atual (proxy otimista + DAL autoritativo) é exatamente a que a documentação do Next 16 recomenda.

O quarto ponto é de arquitetura de segurança e vem da própria documentação do Next 16: **um layout não controla se o resto da rota renderiza**. Segmentos filhos continuam executando e continuam aparecendo no RSC payload mesmo que o layout renderize outra coisa; e, por partial rendering, layouts não re-renderizam em navegação client-side. Portanto a tela de bloqueio **não pode** ser implementada como "o layout renderiza `<Bloqueado/>` em vez de `{children}`". A guarda tem que morar no DAL (`requireAdminSession`), que já é chamado pelas 59 ocorrências em 19 arquivos de página/action — inclusive o próprio layout.

**Primary recommendation:** manter `proxy.ts` como está (pré-filtro otimista, zero I/O de banco), colocar a checagem autoritativa de `statusAcesso` **dentro de `requireAdminSession` e `requireAuth`** com opt-out explícito de exatamente um endpoint (o checkout), redirecionar o admin bloqueado para uma rota `/[slug]/admin/bloqueado` que vive **fora** de `(protected)`, e funilar os 6 caminhos públicos por um único par de funções de service (`findPublicavelBySlug` / `findPublicavelById`) que faz **uma só query** e decide com `avaliarAcesso` em memória — o que elimina o canal de tempo de graça.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decidir se a empresa tem acesso | Lib pura (`lib/avaliar-acesso.ts`) | — | Já existe, é puro, relógio injetado, testado. Nenhuma outra camada pode re-derivar essa aritmética (BILL-01) |
| Ler os fatos de billing e derivar status por request | DAL (`lib/auth-guard.ts` `revalidarConta`) | — | Já existe, `React.cache` por request, fail-closed. Ponto único de I/O de auth |
| Bloquear navegação no admin (pages/layouts/Server Actions) | DAL (`lib/session.ts` `requireAdminSession`) | — | 59 call sites já convergem aqui. Layout **não** serve como boundary (Next 16 docs) |
| Bloquear chamadas `/api/*` autenticadas | DAL (`lib/api-auth.ts` `requireAuth`) | — | 43 call sites; os 29 handlers já mapeiam `error.status` genericamente |
| Pré-filtro barato de rota do admin | Proxy (`proxy.ts`) | — | Já existe e deve continuar cookie-only. Docs do Next 16 proíbem I/O de banco aqui |
| Despublicar catálogo (6 caminhos) | Service (`app/services/empresa.service.ts`) | Route handlers (forma da resposta) | O gate tem que estar abaixo dos 6 route/page entrypoints, senão um caminho novo nasce sem gate |
| Banner de carência (UI) | Layout do admin (`(protected)/layout.tsx`) | — | Único ponto que envolve os dois branches de render (SIMPLES e COMPLETO). É UI, não boundary de segurança |
| Tela de bloqueio (UI) | Route segment fora de `(protected)` | — | Se ficasse dentro de `(protected)` o próprio `requireAdminSession` a redirecionaria (loop) |
| Iniciar pagamento a partir da UI | Server Action (`_lib/*-actions.ts`) | Service (`assinatura.service.criarCheckout`) | O browser não tem Bearer token — o cookie é httpOnly. Ver §Achado crítico 3 |

---

## Achados Críticos (leia antes de planejar)

### Achado crítico 1 — São SEIS caminhos públicos de leitura, não cinco

`GET /api/empresas/slug/[slug]` (`app/api/empresas/slug/[slug]/route.ts`) é **totalmente público** (nenhuma chamada a `requireAuth`) e devolve o objeto completo de `empresaService.findBySlug`, que inclui `produtos`, `combos` e `promocoes`. [VERIFIED: leitura direta de `app/api/empresas/slug/[slug]/route.ts`]

O D-07 do CONTEXT.md enumera cinco caminhos e não menciona este. A pesquisa de milestone anterior **já havia identificado** o sexto (`.planning/research/PITFALLS.md:80-85` e o checklist em `:539`), mas ele não sobreviveu até o CONTEXT.md desta fase. [VERIFIED: `.planning/research/PITFALLS.md`]

Boa notícia: ele compartilha `findBySlug` com o caminho da página, então um único gate no service cobre os dois.

**Ação para o planner:** o critério de sucesso #3 diz "cinco caminhos". Trate como **seis**. Um gate de grep que enumere os arquivos de entrada pública é a forma executável de impedir que um sétimo nasça sem gate.

### Achado crítico 2 — `getEmpresaCatalogo` alimenta a tela de LOGIN do admin

```
app/[slug]/(catalogo)/layout.tsx  ─┐
app/[slug]/(catalogo)/page.tsx    ─┼─→ getEmpresaCatalogo(slug) ─→ empresaService.findBySlug ─→ notFound()
app/[slug]/admin/login/page.tsx   ─┘
```

[VERIFIED: `grep -rn "getEmpresaCatalogo" app` → 3 consumidores]

`app/[slug]/admin/login/page.tsx:19` chama `getEmpresaCatalogo(slug)` só para renderizar `empresa.logo`, `empresa.nome`, `empresa.primaryColor` e `empresa.accentColor`. Se o gate de bloqueio entrar dentro de `findBySlug`, **a tela de login de uma empresa bloqueada passa a devolver 404** — e o usuário bloqueado não consegue logar, não alcança a tela de bloqueio, e portanto **não consegue pagar**. Isso quebra o critério de sucesso #5 e é o pior modo de falha possível para esta fase (churn garantido, cliente querendo pagar e sem conseguir).

**Ação para o planner:** separar as duas leituras. A tela de login precisa de uma leitura **de branding, indiferente ao status** (o service já tem `findBranding(id)`; falta o equivalente por slug). O catálogo passa a usar uma leitura **publicável**. Como bônus, isso corrige um desperdício existente: hoje a tela de login carrega produtos+combos+promoções inteiros para desenhar um logo.

### Achado crítico 3 — O botão "Pagar agora" NÃO pode chamar `POST /api/assinaturas/checkout` do browser

- `requireAuth` lê **exclusivamente** `Authorization: Bearer <token>` (`lib/api-auth.ts:27-28`). [VERIFIED: leitura direta]
- A sessão do browser é o cookie `admin_session`, `httpOnly: true` (`lib/session.ts:14`). JavaScript do cliente não consegue lê-lo. [VERIFIED]
- `grep -rn "fetch(" app --include=*.tsx --include=*.ts` (excluindo testes) retorna **zero** ocorrências: não existe nenhum `fetch` de client component no projeto inteiro. Toda mutação é Server Action. [VERIFIED: grep]

Logo, um client component não tem como autenticar uma chamada a `POST /api/assinaturas/checkout`. As saídas seriam: (a) expor o JWT ao JS — regressão de segurança séria; (b) fazer `requireAuth` aceitar cookie — amplia a superfície da função mais crítica do sistema e adiciona um vetor de CSRF onde hoje não há nenhum; (c) **Server Action** que chama `assinaturaService.criarCheckout(empresaId)` direto e faz `redirect(url)`.

**Recomendação: (c).** Preserva a intenção do D-01 (reaproveitar o backend de checkout da Fase 3 — `criarCheckout(empresaId: string)` é chamável direto, `app/services/assinatura.service.ts:37`), respeita o modelo de auth do projeto, e Server Actions já vêm com proteção de CSRF embutida (POST-only + comparação `Origin` vs `Host`). [CITED: `node_modules/next/dist/docs/01-app/02-guides/data-security.md:546-550`] `redirect()` aceita URL absoluta externa, então mandar o navegador para o checkout hospedado do Asaas é suportado. [CITED: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:55`]

`POST /api/assinaturas/checkout` continua existindo e continua sendo o endpoint canônico (a Fase 7 pode consumi-lo) — apenas não é ele quem serve o botão.

### Achado crítico 4 — Um layout NÃO é um boundary de autorização

Documentação do Next 16.3.0, textual: *"A layout also does not control whether the rest of the route renders. Route segments and parallel route slots are rendered by the router, so a layout that hides or swaps them does not stop them from running or from appearing in the RSC Payload."* e *"Due to Partial Rendering, be cautious when doing checks in Layouts as these don't re-render on navigation, meaning the user session won't be checked on every route change."* [CITED: `node_modules/next/dist/docs/01-app/02-guides/authentication.md:1350-1354`]

E, explicitamente: *"A common pattern in SPAs is to `return null` in a layout or a top-level component if a user is not authorized. This pattern is **not recommended** since Next.js applications have multiple entry points, which will not prevent nested route segments and Server Actions from being accessed."* [CITED: idem, `:1456`]

Consequência direta: `(protected)/layout.tsx` pode hospedar o **banner** (UI) mas **não** a tela de bloqueio como substituição de `{children}`. A guarda tem que ser o `redirect()` dentro de `requireAdminSession`, que já é chamado por cada page e cada action.

### Achado crítico 5 — Ligar esta fase bloqueia empresas retroativamente no primeiro request

`revalidarConta` já deriva `statusAcesso` de `acessoAte`/`trialFim`/`canceladoEm`/`acessoVitalicio` a cada request autenticado, hoje, e apenas não age sobre o resultado (`lib/auth-guard.ts:44-46`). No instante em que a guarda passar a agir, **toda empresa cujos fatos de billing já estejam vencidos há mais de 10 dias é bloqueada no request seguinte** — sem esperar o worker da Fase 5, sem aviso.

O STATE.md registra a decisão de roadmap "Enforcement (Phase 4) precisa estar validado em produção antes de o worker (Phase 5) poder bloquear alguém", o que sugere que o bloqueio seria gradual. Não é: a Fase 4 sozinha já bloqueia. O worker da Fase 5 é rede de segurança para empresas *sem* request (auditoria/e-mail), não o gatilho.

**Ação para o planner:** incluir uma tarefa de contagem (query read-only contra o banco de produção/staging: quantas empresas cairiam em `BLOQUEADO`/`CANCELADO` hoje) **antes** do merge, como `checkpoint:human-verify`. É a diferença entre um deploy e um incidente.

---

## Standard Stack

Esta fase **não instala nenhum pacote novo**. Todo o material necessário já está no repositório.

### Core (já presentes)
| Módulo | Versão / Local | Purpose | Why Standard |
|--------|----------------|---------|--------------|
| `next` | 16.3.0 | `redirect`, `notFound`, `unstable_rethrow`, Server Actions, `proxy.ts` | Framework do projeto; docs empacotados em `node_modules/next/dist/docs/` são a fonte autoritativa (ver AGENTS.md) [VERIFIED: `node -p "require('./node_modules/next/package.json').version"` → `16.3.0`] |
| `react` | 19.2.8 | `cache()` para dedupe por request, `useActionState` | Já é o mecanismo de dedupe do DAL (`lib/auth-guard.ts:48`) |
| `lib/avaliar-acesso.ts` | interno | `avaliarAcesso`, `StatusAcesso`, `DIAS_DE_CARENCIA = 10` | Função pura da Fase 2; **única** autoridade sobre status (BILL-01) |
| `lib/auth-guard.ts` | interno | `revalidarConta` → `ContaAtiva{statusAcesso, acessoExpiraEm, carenciaAte}` | Ponto de extensão preparado explicitamente para esta fase (comentário em `:44-46`) |
| `lib/http-error.ts` / `lib/api-auth.ts` | interno | `HttpError`, `AuthError` (ambos com `.status`) | Convenção de erro do projeto; os 29 handlers já propagam `.status` |
| `lib/fuso-sao-paulo.ts` | interno | `meiaNoiteEmSaoPaulo` | Aritmética de fuso do banner ("dias restantes") não pode ser re-derivada |
| `vitest` | 4.1.10 | Suíte unitária/componente | `vitest.config.mts`, setup em `tests/setup/` |
| `@playwright/test` | 1.62.1 | E2E contra Postgres real | `playwright.config.ts`, porta 3100 |

### Supporting
| Módulo | Purpose | When to Use |
|--------|---------|-------------|
| `next/navigation` → `redirect` | Mandar o admin bloqueado para a tela de bloqueio; mandar o browser para o checkout do Asaas | Pages, layouts, Server Actions. **Nunca** dentro de `try` |
| `next/navigation` → `notFound` | 404 do catálogo (página) | Server Components e Route Handlers. **Nunca** dentro de `try` sem `unstable_rethrow` |
| `next/navigation` → `unstable_rethrow` | Deixar `NEXT_REDIRECT`/`NEXT_HTTP_ERROR_FALLBACK` escaparem de um `catch` existente | Só se `notFound()`/`redirect()` precisar mesmo ficar dentro de um `try` já existente |
| `tests/setup/prisma-mock.ts` | Stub default de conta ativa (`prismaMock.usuario.findFirst`) | Todo teste novo de guarda sobrescreve `empresa.{acessoAte,trialFim,canceladoEm,acessoVitalicio}` neste stub para produzir o status desejado |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `redirect()` para `/[slug]/admin/bloqueado` | `forbidden()` + `forbidden.tsx` (Next 15+) | Exige `experimental.authInterrupts: true` no `next.config.ts`, é marcado `version: experimental` nos docs, e o `forbidden.tsx` é global (não recebe o `slug`), então não dá para renderizar o botão de pagamento do tenant. [CITED: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md`] **Não usar nesta fase.** |
| Checagem no DAL | Checagem em `proxy.ts` | Ver §Recomendação 1 — proibido pelos docs e caro em conexões |
| Gate no service (`findPublicavel*`) | Gate em cada `route.ts` | Route-level não sobrevive à próxima rota de catálogo que alguém criar; é exatamente o modo de falha que produziu 6 caminhos hoje |
| `AuthError("...", 402)` | `AuthError("...", 403)` | Ver §Decisão de status HTTP |
| Server Action para o checkout | `fetch` client + cookie em `requireAuth` | Ver §Achado crítico 3 |

**Instalação:** nenhuma. Confirme com `git diff package.json` vazio ao fim da fase.

**Verificação de versão:** `node -p "require('./node_modules/next/package.json').version"` → `16.3.0` [VERIFIED: execução local]

## Package Legitimacy Audit

**Nenhum pacote externo é instalado nesta fase.** Todos os módulos usados já constam de `package.json` e foram instalados em fases anteriores.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| *(nenhum novo)* | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Se o planner introduzir qualquer dependência (por exemplo uma biblioteca de banner/toast), ela sai do escopo desta pesquisa e exige um novo ciclo de verificação de legitimidade antes do install.*

---

## Architecture Patterns

### System Architecture Diagram

```
                        ┌──────────────────────────────────────────┐
   VISITANTE PÚBLICO    │              proxy.ts                    │
   (sem sessão)  ──────▶│  matcher: /:slug/admin/:path*            │
                        │  NÃO casa "/" nem "/api/*" → next()      │
                        │  cookie-only, ZERO I/O de banco          │
                        └────────────────┬─────────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
        ▼                                ▼                                ▼
 CAMINHOS PÚBLICOS               ADMIN (UI/RSC)                    API AUTENTICADA
 (6 portas)                                                        (/api/*, Bearer)
        │                                │                                │
        │                                ▼                                ▼
        │                   requireAdminSession(slug)            requireAuth(request)
        │                     [lib/session.ts]                    [lib/api-auth.ts]
        │                                │                                │
        │                                └──────────┬─────────────────────┘
        │                                           ▼
        │                             revalidarConta(usuarioId, empresaId)
        │                             [lib/auth-guard.ts · React.cache]
        │                                           │  1 query · select dos 4 fatos
        │                                           ▼
        │                                  avaliarAcesso(fatos, agora)
        │                                  [lib/avaliar-acesso.ts · PURA]
        │                                           │
        │                                           ▼
        │                              ┌────────────┴────────────┐
        │                              │   statusAcesso           │
        │                              └────────────┬────────────┘
        │                     ┌────────────┬────────┴────┬──────────────┐
        │                     ▼            ▼             ▼              ▼
        │            VITALICIO/TRIAL   CARENCIA    BLOQUEADO/CANCELADO  (n/a)
        │              EM_DIA             │              │
        │                  │              │              ├─ UI: redirect →
        │                  │              │              │   /[slug]/admin/bloqueado
        │                  ▼              ▼              │   (FORA de (protected))
        │              segue normal   segue normal +     │
        │                             banner no layout   └─ API: throw AuthError(status)
        │                                                   → handler devolve error.status
        │                                                   ✱ EXCEÇÃO: ação de checkout
        │
        ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │ FUNIL ÚNICO DO CATÁLOGO — app/services/empresa.service.ts          │
  │                                                                   │
  │  findPublicavelBySlug(slug)   findPublicavelById(empresaId)        │
  │        │                              │                           │
  │        └──────────┬───────────────────┘                           │
  │                   ▼                                               │
  │      1 QUERY: {id, deletedAt, acessoAte, trialFim,                │
  │                canceladoEm, acessoVitalicio}                      │
  │                   ▼                                               │
  │      avaliarAcesso(...) → podePublicarCatalogo(status)?           │
  │                   ▼                                               │
  │            true → {id}          false → null                      │
  │                                   (idêntico a "não existe")       │
  └───────────────────────────────────────────────────────────────────┘
        │
        ├─ GET /{slug} (page+layout) ─────────→ notFound() → 404
        ├─ GET /api/empresas/slug/[slug] ─────→ 404 {message:"Empresa não encontrada."}
        ├─ GET /api/catalogo/produtos?slug= ──→ 400 (mesma forma de slug inexistente)
        ├─ GET /api/catalogo/produtos?empresaId= → 200 []
        ├─ GET /api/catalogo/combos?…  ───────→ idem
        ├─ GET /api/catalogo/produtos/[id] ───→ 404 {message:"Produto não encontrado."}
        └─ GET /api/catalogo/combos/[id] ─────→ 404 {message:"Combo não encontrado."}

  ┌───────────────────────────────────────────────────────────────────┐
  │ CAMINHO DE PAGAMENTO (tem que sobreviver ao bloqueio)             │
  │  /[slug]/admin/login        → branding SEM gate de status         │
  │  /[slug]/admin/bloqueado    → tela de bloqueio (fora de protected)│
  │        ├─ Server Action iniciarPagamento → criarCheckout          │
  │        │      → redirect(url externa do Asaas)                    │
  │        └─ Server Action logout → destroySession → /admin/login    │
  │  POST /api/webhooks/asaas   → token próprio, NÃO passa requireAuth│
  └───────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
lib/
├── avaliar-acesso.ts            # + predicado exportado (acessoBloqueado / podePublicarCatalogo)
├── auth-guard.ts                # inalterado (já devolve statusAcesso)
├── session.ts                   # + gate em requireAdminSession
└── api-auth.ts                  # + gate em requireAuth (com opt-out)

app/services/
└── empresa.service.ts           # + findPublicavelBySlug / findPublicavelById
                                 # + findBrandingBySlug (login, SEM gate)

app/[slug]/
├── _lib/empresa.ts              # getEmpresaCatalogo passa a usar o caminho publicável
└── admin/
    ├── login/page.tsx           # passa a usar findBrandingBySlug
    ├── bloqueado/               # NOVO — fora de (protected)
    │   ├── page.tsx
    │   └── _components/
    └── (protected)/
        ├── layout.tsx           # + <AvisoCarencia/> nos DOIS branches (SIMPLES e COMPLETO)
        ├── _components/
        │   └── aviso-carencia.tsx
        └── _lib/
            └── assinatura-actions.ts   # NOVO — Server Action iniciarPagamento
```

### Pattern 1: Gate de navegação dentro do DAL, com rota de bloqueio fora de `(protected)`

**What:** `requireAdminSession` continua fazendo o que faz e ganha um segundo `redirect`, para a tela de bloqueio, quando o status derivado for `BLOQUEADO` ou `CANCELADO`.

**When to use:** todas as 59 chamadas em 19 arquivos (`page.tsx`, `layout.tsx`, `actions.ts`, `simples-actions.ts`) passam a ser cobertas sem editar nenhuma delas — que é literalmente o critério da Claude's Discretion. [VERIFIED: `grep -rn "requireAdminSession" app | grep -v test | wc -l` → 59]

```typescript
// lib/session.ts — forma da extensão (o redirect FICA FORA de qualquer try/catch)
export async function requireAdminSession(slug: string): Promise<AuthTokenPayload> {
  const session = await getSession();

  const conta =
    session && session.empresaSlug === slug
      ? await revalidarConta(session.sub, session.empresaId)
      : null;

  // redirect() lança NEXT_REDIRECT — mantenha-o FORA de qualquer try/catch.
  if (!session || !conta || conta.empresaSlug !== slug) {
    redirect(`/${slug}/admin/login`);
  }

  // ACC-02 / D-04 / D-06: BLOQUEADO e CANCELADO recebem o MESMO tratamento.
  if (acessoBloqueado(conta.statusAcesso)) {
    redirect(`/${slug}/admin/bloqueado`);
  }

  return session;
}
```

Por que a rota `bloqueado` fica **fora** de `(protected)`: se ficasse dentro, o layout de `(protected)` chamaria `requireAdminSession`, que redirecionaria de novo para `bloqueado` → `ERR_TOO_MANY_REDIRECTS`. O projeto já sofreu exatamente essa classe de loop na Fase 1 (documentada em `lib/session.ts:50-55` e provada por `e2e/sessao-revogada.spec.ts` passo 7) — o e2e novo deve repetir esse assert.

A página `bloqueado/page.tsx` precisa da sua própria guarda simétrica (mesmo formato da `login/page.tsx`): sessão válida + slug bate + status **é** bloqueado; caso contrário `redirect(/{slug}/admin)` (se está tudo em dia) ou `redirect(/{slug}/admin/login)` (se não há sessão). `proxy.ts` já exige cookie válido para qualquer `/:slug/admin/:path*` que não seja `login`, então a rota `bloqueado` herda esse pré-filtro de graça — mas ele é otimista e não substitui a guarda da página.

### Pattern 2: Gate de API com opt-out de exatamente um endpoint

**What:** `requireAuth` lança `AuthError` quando o status é bloqueado; a assinatura ganha um segundo parâmetro opcional.

**When to use:** cobre as 43 chamadas de `requireAuth` sem editar rota nenhuma — **todos os 29 handlers já devolvem `{ status: error.status }`**, nenhum hardcoda 401. [VERIFIED: `grep -rn "instanceof AuthError" -A 2 app/api --include=route.ts | grep "status:"` → 29 ocorrências, todas `error.status`]

```typescript
// lib/api-auth.ts
export interface OpcoesDeAuth {
  /**
   * Deixa passar empresa BLOQUEADA/CANCELADA. Existe para UM caso e só um:
   * o endpoint de checkout — bloquear o caminho de pagamento tranca o cliente
   * do lado de fora sem como voltar (Pitfall 1). Qualquer segunda ocorrência
   * desta flag é um bug; o gate de grep do plano deve provar que é única.
   */
  permitirEmpresaBloqueada?: boolean;
}

export async function requireAuth(
  request: Request,
  opcoes: OpcoesDeAuth = {}
): Promise<AuthTokenPayload> {
  // ...verificação de token e revalidarConta como hoje...

  if (!conta) {
    throw new AuthError("Sessão inválida.", 401);
  }

  if (!opcoes.permitirEmpresaBloqueada && acessoBloqueado(conta.statusAcesso)) {
    throw new AuthError("Assinatura suspensa por falta de pagamento.", 402);
  }

  return payload;
}
```

`app/api/assinaturas/checkout/route.ts` é o único a chamar `requireAuth(request, { permitirEmpresaBloqueada: true })`.

`POST /api/webhooks/asaas` não precisa de nada: ele não chama `requireAuth` (usa comparação time-safe de token próprio) e declara `export const runtime = "nodejs"`. [VERIFIED: leitura de `app/api/webhooks/asaas/route.ts`]

**Anti-padrão explícito:** criar um `requireAuthComAssinatura` novo e trocar caso a caso nas 13 rotas. Isso é fail-**open** por default — uma rota nova nasce insegura. A flag de opt-out é fail-closed por default.

### Pattern 3: Predicado único, exaustivo, para os dois gates

**What:** um só lugar decide o que "bloqueado" significa, para admin e para catálogo.

```typescript
// lib/avaliar-acesso.ts
/**
 * D-06: CANCELADO e BLOQUEADO têm comportamento idêntico — o rótulo distinto é
 * só para auditoria (D-08 da Fase 2). D-03: CARENCIA NÃO bloqueia nada; é só
 * aviso no admin, e o catálogo segue no ar.
 *
 * `Record` exaustivo em vez de `status !== "EM_DIA"`: se um sétimo StatusAcesso
 * entrar no enum, isto vira erro de compilação em vez de silenciosamente
 * bloquear (ou silenciosamente liberar) o valor novo.
 */
const BLOQUEIA: Record<StatusAcesso, boolean> = {
  [StatusAcesso.TRIAL]: false,
  [StatusAcesso.EM_DIA]: false,
  [StatusAcesso.CARENCIA]: false,
  [StatusAcesso.VITALICIO]: false,
  [StatusAcesso.BLOQUEADO]: true,
  [StatusAcesso.CANCELADO]: true,
};

export function acessoBloqueado(status: StatusAcesso): boolean {
  return BLOQUEIA[status];
}

/** ACC-03. Hoje é a negação de `acessoBloqueado`; existe como nome próprio
 *  porque admin e catálogo podem divergir no futuro (Fase 7). */
export function podePublicarCatalogo(status: StatusAcesso): boolean {
  return !acessoBloqueado(status);
}
```

A pesquisa de milestone anterior listou "verify `trial` is not blocked by an `!== 'em_dia'` check" no checklist de "Looks Done But Isn't" — o `Record` exaustivo é a forma executável de garantir isso. [VERIFIED: `.planning/research/PITFALLS.md:~535`]

### Pattern 4: Funil único do catálogo, uma query, decisão em memória

**What:** os 6 caminhos públicos resolvem o tenant por **uma** função que faz **uma** query e devolve `null` quando a empresa não existe, foi removida (soft delete), ou está bloqueada — os três casos indistinguíveis por construção.

```typescript
// app/services/empresa.service.ts
const EMPRESA_PUBLICAVEL_SELECT = {
  id: true,
  acessoAte: true,
  trialFim: true,
  canceladoEm: true,
  acessoVitalicio: true,
} as const;

/**
 * ACC-03 / D-07. Devolve null para "não existe", "removida" E "bloqueada" —
 * indistinguíveis, inclusive em NÚMERO DE QUERIES (Pitfall 2): é sempre
 * exatamente uma ida ao banco, com ou sem bloqueio.
 *
 * O status NÃO é filtrado em SQL: ele é derivado por avaliarAcesso sobre os 4
 * fatos (BILL-01). Reescrever a aritmética de carência em WHERE duplicaria a
 * regra de negócio e a lógica de fuso de meiaNoiteEmSaoPaulo.
 */
async function avaliarPublicacao(
  empresa: { id: string; acessoAte: Date | null; trialFim: Date | null;
             canceladoEm: Date | null; acessoVitalicio: boolean } | null,
  agora: Date
): Promise<{ id: string } | null> {
  if (!empresa) return null;
  const { status } = avaliarAcesso(empresa, agora);
  return podePublicarCatalogo(status) ? { id: empresa.id } : null;
}
```

`findBySlug` mantém a assinatura pública mas retorna `null` **antes** do `Promise.all` dos três services quando a empresa não é publicável — o que preserva a paridade de custo com o caso "slug inexistente" (que também retorna cedo, com 1 query).

Para `produtoService.findCatalogoById` / `comboService.findCatalogoById`, a empresa dona vem no **mesmo** `findFirst`, por select aninhado — não uma segunda query:

```typescript
async findCatalogoById(id: string) {
  const produto = await prisma.produto.findFirst({
    where: { id, ativo: true, visivelCatalogo: true, deletedAt: null,
             empresa: { deletedAt: null } },   // ← buraco pré-existente, ver abaixo
    select: {
      ...PRODUTO_CATALOGO_SELECT,
      empresa: { select: EMPRESA_PUBLICAVEL_SELECT },
    },
  });
  if (!produto) return null;
  const { status } = avaliarAcesso(produto.empresa, new Date());
  if (!podePublicarCatalogo(status)) return null;
  const { empresa: _descartada, ...publico } = produto;
  return publico;   // shape idêntico ao de hoje — nenhum consumidor quebra
}
```

**Bug pré-existente que este mesmo patch fecha:** `findCatalogoById` (produto e combo) hoje **não filtra `empresa.deletedAt`** nem `empresaId`. Os produtos de uma empresa removida por soft delete continuam publicamente legíveis por id. [VERIFIED: `app/services/produto.service.ts:101-111`, `app/services/combo.service.ts:74-84`]

E note que `PRODUTO_CATALOGO_SELECT` e `COMBO_CATALOGO_SELECT` **expõem `empresaId`** nas respostas públicas. [VERIFIED: `produto.service.ts:52`, `combo.service.ts:40`] Ou seja, qualquer visitante que navegou no catálogo enquanto a loja estava saudável guardou o UUID e pode sondar `?empresaId=<uuid>` depois. É exatamente por isso que o D-07 exige gatear o branch de `empresaId` — não é hipotético.

### Pattern 5: CTA de pagamento como Server Action

**What:** o padrão do projeto inteiro (`<form action={serverAction}>` + `useActionState`, ver `app/[slug]/admin/_components/login-form.tsx:15-16` e o `<form action={logoutAction}>` em `admin-nav.tsx:114`). O botão "Pagar agora" segue o mesmo molde.

```typescript
// app/[slug]/admin/(protected)/_lib/assinatura-actions.ts
"use server";

export async function iniciarPagamento(slug: string): Promise<void> {
  // Mesma guarda do resto do admin, mas SEM bloquear a empresa suspensa:
  // é o único caminho que ela ainda pode percorrer.
  const session = await requireAdminSessionParaPagamento(slug);

  let url: string;
  try {
    ({ url } = await assinaturaService.criarCheckout(session.empresaId));
  } catch (erro) {
    // HttpError 502 do Asaas / 404 de empresa. Não vaza detalhe do gateway.
    console.error("[assinatura] falha ao iniciar checkout", erro);
    redirect(`/${slug}/admin/bloqueado?erro=checkout`);
  }

  // FORA do try: redirect lança NEXT_REDIRECT e um catch o engoliria.
  redirect(url); // URL absoluta externa — suportado
}
```

Duas coisas que o planner não pode perder:
1. `redirect()` **fora** do `try`. A convenção já está escrita no próprio repo: *"redirect() lança NEXT_REDIRECT — mantenha-o FORA de qualquer try/catch"* (`lib/session.ts:98`), e a Server Action `login` já segue esse formato (`auth-actions.ts`). [VERIFIED: leitura direta]
2. A tela de bloqueio **e** o banner de carência usam a **mesma** action. Na carência a empresa não está bloqueada, então a variante normal de `requireAdminSession` já serve; na tela de bloqueio é preciso a variante que tolera o status suspenso.

### Anti-Patterns to Avoid

- **Layout como boundary:** `layout.tsx` renderizar `<Bloqueado/>` no lugar de `{children}`. Os segmentos filhos continuam executando e continuam no RSC payload. [CITED: Next 16 docs, authentication.md:1352]
- **Estender `proxy.ts` com I/O de banco:** ver §Recomendação 1.
- **`notFound()` ou `redirect()` dentro de um `try` existente:** os handlers de catálogo já são `try { ... } catch { 500 }`. Um `notFound()` dentro deles vira **500**, não 404 — fail-open silencioso. [CITED: Next 16 docs, unstable_rethrow.md]
- **`status !== "EM_DIA"` como teste de bloqueio:** derruba TRIAL, CARENCIA e VITALICIO junto. Use o `Record` exaustivo.
- **Filtrar status em SQL (`WHERE acessoAte > now()`):** duplica a regra de negócio e a aritmética de fuso; viola BILL-01/D-03 e vai divergir de `avaliarAcesso` no primeiro ajuste.
- **Novo wrapper `requireAuthComAssinatura` adotado rota a rota:** fail-open por default.
- **Bloquear o endpoint/ação de checkout junto com o resto:** trava o cliente sem caminho para pagar.
- **`unstable_cache` / `'use cache'` no caminho da guarda:** cross-request; quebra o D-08 (reativação automática). A decisão `[01-02]` do STATE.md já proíbe isso explicitamente.

---

## Decisão de status HTTP

### `/api/*` autenticado (empresa bloqueada) — Claude's Discretion, recomendação: **402**

- 402 Payment Required é semanticamente específico para "acesso negado exclusivamente porque a assinatura venceu", em oposição a 403 Forbidden ("autenticado mas sem permissão — pagar não resolve"). [ASSUMED — derivado de resultados de WebSearch, não de RFC]
- MDN ainda classifica 402 como não-padrão / reservado para uso futuro, sem convenção acordada entre implementações. [ASSUMED — WebSearch, LOW]
- Aqui o chamador **já está autenticado como a própria empresa inadimplente**, então não existe vazamento cross-tenant nesta resposta e o D-05 pede explicitamente "um erro claro". O único consumidor é o próprio painel.
- Custo de trocar depois: zero — é um número num `throw` em `lib/api-auth.ts`.

**Se o usuário preferir 403**, nada na arquitetura muda. Registre como decisão do planner, não como fato.

### Caminhos públicos do catálogo — **espelhar exatamente o shape atual de "não existe"**

A Claude's Discretion permite escolher entre "404 puro" e "o mesmo formato que já existe". A recomendação é **espelhar**, porque normalizar tudo para 404 exigiria também mudar o comportamento do caso genuinamente inexistente (senão os dois voltam a divergir), o que reescreve 4 testes existentes e amplia o blast radius sem ganho de segurança.

**Tabela de paridade obrigatória** — a coluna "hoje (inexistente)" foi verificada por leitura de código e dos testes existentes:

| # | Caminho | Hoje: tenant inexistente | Blocked deve ser | Fonte |
|---|---------|--------------------------|------------------|-------|
| 1 | `GET /{slug}` (page + layout) | `notFound()` → **404**, página 404 padrão do Next (não existe `not-found.tsx` no projeto) | idêntico | `app/[slug]/_lib/empresa.ts:9` |
| 2 | `GET /api/empresas/slug/[slug]` | **404** `{"message":"Empresa não encontrada."}` | idêntico | `app/api/empresas/slug/[slug]/route.ts:17-24` |
| 3 | `GET /api/catalogo/produtos?slug=X` | **400** `{"message":"Informe o parâmetro empresaId ou slug."}` | idêntico | `app/api/catalogo/produtos/route.ts:16-26` + `route.test.ts:59-65` |
| 4 | `GET /api/catalogo/produtos?empresaId=X` | **200** `[]` (query não casa nada) | idêntico | `produto.service.ts:86-99` |
| 5 | `GET /api/catalogo/combos?slug=X` | **400**, mesma mensagem | idêntico | `app/api/catalogo/combos/route.ts` |
| 6 | `GET /api/catalogo/combos?empresaId=X` | **200** `[]` | idêntico | `combo.service.ts:59-72` |
| 7 | `GET /api/catalogo/produtos/[id]` | **404** `{"message":"Produto não encontrado."}` | idêntico | `app/api/catalogo/produtos/[id]/route.ts:16-24` |
| 8 | `GET /api/catalogo/combos/[id]` | **404** `{"message":"Combo não encontrado."}` | idêntico | `app/api/catalogo/combos/[id]/route.ts` |

Note a assimetria da linha 3 vs. 4: hoje **slug inexistente devolve 400 e empresaId inexistente devolve 200 `[]`**. Não é elegante, mas é o comportamento vigente, e é isso que precisa ser espelhado. Um bloqueio que devolvesse 404 nas duas ficaria *mais* distinguível, não menos.

Sobre o 404 da linha 1 ser um 404 **real** (e não um 200 "soft"): a documentação do Next diz que `not-found` retorna 200 para respostas em streaming e 404 para não-streaming. [CITED: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md:13`] Este projeto **não** tem `loading.tsx`, **não** tem `template.tsx` e **não** habilita `cacheComponents` no `next.config.ts` — o `notFound()` dispara do layout, antes de qualquer streaming, produzindo 404 real. [VERIFIED: `find app -name "loading*" -o -name "template*"` vazio; `cat next.config.ts`] **Se alguém adicionar `loading.tsx` ao segmento do catálogo, o 404 vira 200 silenciosamente** — vale um gate de grep.

---

## Don't Hand-Roll

| Problema | Não construa | Use | Por quê |
|----------|--------------|-----|---------|
| Decidir se uma empresa tem acesso | Um `if` novo sobre `acessoAte`/`trialFim` | `avaliarAcesso` (Fase 2) | Ordem das regras é normativa; 3 casos de DST histórico são a prova de corretude (STATE `[02-03]`) |
| Dias restantes de carência | `Math.ceil((carencia - hoje)/86400000)` | `ContaAtiva.carenciaAte` + `lib/fuso-sao-paulo.ts` | `carenciaAte` foi exposto em `ContaAtiva` **exatamente** para o ACC-01 não re-derivar (comentário em `lib/auth-guard.ts:17-21`) |
| Dedupe da query de status no request | Variável de módulo / memo próprio | `React.cache` (já em `revalidarConta`) | Memo de módulo é cross-request → vazamento entre tenants |
| Filtrar catálogo por status em SQL | `WHERE acessoAte > now() OR ...` | 1 query dos 4 fatos + `avaliarAcesso` | Duplicaria a aritmética de fuso; divergiria no primeiro ajuste |
| Proteção CSRF do botão de pagamento | Token CSRF próprio | Server Action (POST-only + Origin vs Host) | Embutido no framework [CITED: data-security.md:546-550] |
| 404 do catálogo | `new Response(null,{status:404})` na página | `notFound()` | Injeta `<meta name="robots" content="noindex">` e usa o boundary do framework [CITED: not-found.md:13,187] |
| Mapear `AuthError` → status nas rotas | Editar 29 handlers | `AuthError(msg, status)` | Os 29 já fazem `{ status: error.status }` [VERIFIED: grep] |

**Key insight:** o valor desta fase está em *não* escrever lógica nova. Cada linha de decisão de acesso escrita fora de `lib/avaliar-acesso.ts` é uma cópia que vai divergir. O trabalho é de fiação e de cobertura.

---

## Common Pitfalls

### Pitfall 1: Bloquear o caminho de pagamento junto com o resto ("cliente trancado do lado de fora")
**O que dá errado:** o gate entra em `requireAuth`/`requireAdminSession` sem exceção, e a ação de checkout — que só a empresa bloqueada precisa — passa a devolver 402 também. O cliente quer pagar e literalmente não consegue.
**Por que acontece:** o gate é feito para ser total (D-05: "sem exceção por rota"), e a exceção necessária é contraintuitiva.
**Como evitar:** opt-out explícito (Pattern 2) + a página `bloqueado` fora de `(protected)` + o `logout` continuar funcionando (ele não chama `requireAdminSession` hoje — [VERIFIED: `app/[slug]/admin/_lib/auth-actions.ts`] — mantenha assim).
**Sinais de alerta:** um teste "empresa bloqueada consegue iniciar o checkout" não existe; a flag de opt-out aparece em mais de um arquivo.

### Pitfall 2: Canal lateral de tempo — bloqueada faz mais queries que inexistente
**O que dá errado:** o gate é implementado como "resolve o tenant (query 1) → busca os fatos de billing (query 2) → decide". Para um slug inexistente a query 2 nunca acontece. A diferença de latência entre "loja não existe" (1 RTT) e "loja existe mas está bloqueada" (2 RTT) é medível remotamente e transforma o 404 idêntico num oráculo de enumeração.
**Por que acontece:** é a implementação mais natural, e ninguém conta round trips ao revisar um diff.
**Como evitar:** **uma** query em todos os caminhos (Pattern 4): o `select` que resolve a existência já traz os 4 fatos. Para os endpoints por id, `select` aninhado da empresa no mesmo `findFirst`. Para o branch `?empresaId=`, resolver a empresa uma vez no ponto de entrada e só então (ou nunca) consultar produtos — de modo que empresaId inexistente e empresaId bloqueado gastem o mesmo 1 RTT e devolvam `[]`.
**Sinais de alerta:** dois `await prisma.` no caminho de rejeição; `findBySlug` chamando `Promise.all([produtos, combos, promocoes])` antes de checar o status.
**Confiança:** o princípio (respostas indistinguíveis em status, corpo **e** tempo) é [ASSUMED — WebSearch, LOW]; a contagem de queries de cada caminho neste repo é [VERIFIED: leitura de `empresa.service.ts`, `produto.service.ts`, `combo.service.ts`].

### Pitfall 3: `notFound()` / `redirect()` engolidos pelo `try/catch` já existente
**O que dá errado:** os 4 route handlers de catálogo (e os 29 de API) são todos `try { ... } catch (error) { console.error(error); return 500 }`. `notFound()` lança `NEXT_HTTP_ERROR_FALLBACK;404` e `redirect()` lança `NEXT_REDIRECT`; ambos são capturados por esse catch e viram **500**. O bloqueio "funciona" em desenvolvimento (o dev nota o 500) e falha aberto em produção, ou pior: falha fechado com 500 para o caso legítimo também.
**Por que acontece:** o formato `try/catch → 500` é a convenção do projeto inteiro; ninguém pensa nele como um interceptador de exceções do framework.
**Como evitar:** nos route handlers, **não use `notFound()`** — devolva `NextResponse.json(..., { status })` explicitamente, que é o que a tabela de paridade exige de qualquer forma (o corpo tem que ser idêntico ao atual, e `notFound()` produziria um corpo diferente). Nas pages/layouts/actions, mantenha `notFound()`/`redirect()` fora de `try`. Se for inevitável, `unstable_rethrow(err)` como **primeira** linha do catch.
**Sinais de alerta:** `notFound()` dentro de um `try` em qualquer `route.ts`; um teste de rota que espera 404 e recebe 500.
**Confiança:** [CITED: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md` e `not-found.md:79`]

### Pitfall 4: Banner stale por partial rendering
**O que dá errado:** o banner de carência é renderizado por `(protected)/layout.tsx`. Layouts não re-renderizam em navegação client-side. O usuário paga, volta ao painel, navega entre telas — e o banner "restam 2 dias" continua ali.
**Por que acontece:** partial rendering do App Router é invisível no código.
**Como evitar:** aceitar e documentar (o boundary de segurança é o `requireAdminSession` de cada page, que sempre re-avalia — a UI é advisory). O retorno do checkout do Asaas é uma navegação de documento completa para `successUrl = {appBaseUrl}/{slug}/admin` (`assinatura.service.ts:54`), o que re-renderiza o layout inteiro — então o caso que mais importa (paguei, quero ver o banner sumir) já funciona. Se for necessário mais frescor, renderize o banner a partir de um Server Component pequeno dentro de `{children}`, não do layout.
**Sinais de alerta:** um teste e2e que espera o banner sumir após uma navegação `<Link>` (client-side) em vez de `page.goto`/reload.
**Confiança:** [CITED: Next 16 docs, authentication.md:1350]

### Pitfall 5: Contagem regressiva errada por fuso (UTC vs. America/Sao_Paulo)
**O que dá errado:** "restam 2 dias" no banner e bloqueio na manhã seguinte.
**Por que acontece:** `carenciaAte` é um instante UTC já normalizado para a meia-noite de São Paulo (schema, linhas 62-63). Formatá-lo ou subtraí-lo com o fuso do servidor produz off-by-one.
**Como evitar:** derive os dias restantes do mesmo `carenciaAte` que `avaliarAcesso` devolveu, com a mesma aritmética de `lib/fuso-sao-paulo.ts`, arredondando **a favor do usuário**. Teste com `agora` às 23:30 e 00:30 BRT em torno da virada — o padrão de relógio injetado por parâmetro já existe (`avaliarAcesso(fatos, agora)`) e é o que torna isso testável sem fake timers (STATE `[02-03]`).
**Sinais de alerta:** `new Date()` dentro do componente de banner; `toLocaleDateString` sem `timeZone`.

### Pitfall 6: Cache cross-request quebrando a reativação automática (ACC-04)
**O que dá errado:** alguém envolve a leitura de status em `unstable_cache` ou `'use cache'` para "economizar query". A empresa paga, o webhook estende `acessoAte`, e o admin continua bloqueado até o cache expirar.
**Por que acontece:** a query roda em todo request e parece um alvo óbvio de otimização.
**Como evitar:** somente `React.cache` (por request). A decisão `[01-02]` do STATE.md já é normativa: *"Somente React.cache no DAL de auth — unstable_cache e 'use cache' são cross-request e reintroduziriam a janela de staleness"*. Um gate de grep proibindo `unstable_cache|use cache` em `lib/auth-guard.ts`, `lib/session.ts`, `lib/api-auth.ts` e nos caminhos do catálogo torna isso executável.
**Sinais de alerta:** `revalidate`, `next: { tags }` ou `'use cache'` aparecendo nos arquivos de guarda.

### Pitfall 7: Oráculo residual — `/{slug}` 404 mas `/{slug}/admin/login` 200
**O que dá errado:** depois do gate, uma empresa bloqueada devolve 404 no catálogo. Mas a tela de login **precisa** continuar respondendo 200 (Achado crítico 2), enquanto para um slug genuinamente inexistente ela devolve 404 hoje. Um visitante externo distingue os três estados:

| Sonda | Inexistente | Bloqueada | Saudável |
|-------|-------------|-----------|----------|
| `GET /{slug}` | 404 | 404 | 200 |
| `GET /{slug}/admin/login` | 404 | **200** | 200 |

**Por que acontece:** tensão real entre dois requisitos — "indistinguível de inexistente" (D-07 / §specifics) e "o cliente tem que conseguir pagar" (critério de sucesso #5). Não há solução que satisfaça os dois integralmente.
**Como evitar / mitigar:** a mitigação viável é reduzir o que vaza, não eliminar o vazamento: fazer a tela de login de uma empresa bloqueada renderizar com branding **genérico** (sem `nome`, sem `logo`, cores default), de modo que o visitante aprenda "existe uma porta de admin neste slug" mas não a identidade nem a marca da loja — que é a parte comercialmente danosa. Alternativa: aceitar explicitamente e registrar.
**Ação:** isto é uma **decisão de produto**, não técnica. Ver §Open Questions Q1.
**Confiança:** [VERIFIED: o comportamento atual de `admin/login/page.tsx` foi lido; o 404 para slug inexistente vem de `getEmpresaCatalogo` → `notFound()`]

### Pitfall 8: Deploy bloqueia empresas retroativamente
**O que dá errado:** ver §Achado crítico 5. No primeiro request após o deploy, toda empresa com fatos de billing vencidos há >10 dias perde o admin, e o catálogo dela sai do ar.
**Como evitar:** medir antes. Uma query read-only (`SELECT count(*) ... FROM "Empresa" WHERE "deletedAt" IS NULL AND NOT "acessoVitalicio" AND ...`) ou, melhor, um script que rode `avaliarAcesso` sobre todas as empresas usando o leitor de env do projeto (`scripts/resolvedor-ts.mjs`, padrão estabelecido em 03-07) e imprima a distribuição por status. Isso é um `checkpoint:human-verify` bloqueante, não um `console.log`.
**Sinais de alerta:** o plano não tem nenhuma tarefa que olhe para o estado atual do banco antes de ligar a guarda.

---

## Code Examples

### Ler o status vivo dentro de um Server Component (sai de graça no mesmo request)

```typescript
// app/[slug]/admin/(protected)/layout.tsx
// requireAdminSession já chamou revalidarConta neste request; React.cache
// devolve o MESMO resultado sem uma segunda query.
// Fonte: comentário normativo em lib/api-auth.ts:22-24 (repo)
const session = await requireAdminSession(slug);
const conta = await revalidarConta(session.sub, session.empresaId);

// conta nunca é null aqui: requireAdminSession já teria redirecionado.
{conta?.statusAcesso === StatusAcesso.CARENCIA && (
  <AvisoCarencia
    carenciaAte={conta.carenciaAte}
    pagarAction={iniciarPagamento.bind(null, slug)}
  />
)}
```

### Server Action de logout já existente (reutilizar na tela de bloqueio)

```typescript
// app/[slug]/admin/_lib/auth-actions.ts (JÁ EXISTE, não reescrever)
export async function logout(slug: string) {
  await destroySession();
  redirect(`/${slug}/admin/login`);
}
// Consumida como <form action={logout.bind(null, slug)}> — ver admin-nav.tsx:114
```

Ela **não** chama `requireAdminSession`, então funciona da tela de bloqueio sem nenhuma exceção. [VERIFIED: leitura de `auth-actions.ts`]

### Teste de guarda seguindo o padrão já estabelecido

```typescript
// lib/api-auth.test.ts — padrão existente que o teste novo deve seguir
// Fonte: lib/api-auth.test.ts:74-88 (repo)
it("aplica uma mudança no banco já no request seguinte, com o mesmo token", async () => {
  const token = await signAuthToken(payload);
  await expect(requireAuth(buildRequest({ authorization: `Bearer ${token}` })))
    .resolves.toEqual(payload);

  // Muda o FATO de billing no mock — o token continua idêntico.
  prismaMock.usuario.findFirst.mockResolvedValue({
    ...contaBase,
    empresa: { ...empresaBase, trialFim: new Date("2020-01-01"), acessoAte: null },
  } as never);

  await expect(requireAuth(buildRequest({ authorization: `Bearer ${token}` })))
    .rejects.toMatchObject({ status: 402 });
});
```

O stub default de `tests/setup/prisma-mock.ts` já devolve `trialFim: 2099-01-01` + `ultimoStatusAuditado: "TRIAL"` — combinação deliberadamente **neutra** (não agenda auditoria). Testes de bloqueio sobrescrevem os 4 fatos; testes existentes continuam verdes sem tocar em nada. [VERIFIED: leitura de `tests/setup/prisma-mock.ts:20-45`]

### Mock de `redirect` em teste de sessão

```typescript
// lib/session.test.ts — padrão existente (linhas 5-25)
const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

// asserção:
await expect(requireAdminSession("empresa-teste"))
  .rejects.toThrow("REDIRECT:/empresa-teste/admin/bloqueado");
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` (mesma funcionalidade, nome novo) | Next.js 16 | O CONTEXT.md afirma "não existe middleware.ts" — verdade literal, mas `proxy.ts` **existe** e já faz o pré-filtro do admin. [CITED: `16-proxy.md:15`] |
| Auth check no layout | Auth check no DAL, perto da fonte de dados | Next 13→15, reforçado nos docs 16 | Layout não impede segmentos filhos de executar nem de entrar no RSC payload [CITED: authentication.md:1352] |
| `middleware` como solução de autorização | Proxy só para checagem otimista de cookie | Next 13→16 | *"should not be used as a full session management or authorization solution"* [CITED: 16-proxy.md:29] |
| `notFound()` sempre 404 | 404 se não-streaming, 200+noindex se streaming | Next 15 (PPR/Cache Components) | Adicionar `loading.tsx` ao catálogo transformaria o 404 em 200 silenciosamente [CITED: not-found.md:13] |

**Deprecated/outdated:**
- Qualquer receita de `middleware.ts` da internet: neste repo o arquivo se chama `proxy.ts` e exporta `proxy`/`default`.
- Recomendações pré-Next-15 de "proteja tudo no middleware": explicitamente contraindicadas pelos docs empacotados.

---

## Runtime State Inventory

> Esta fase não é rename/refactor/migração — a seção é fornecida apenas porque *ligar* a guarda altera o comportamento sobre dados já existentes.

| Categoria | Itens encontrados | Ação necessária |
|-----------|-------------------|-----------------|
| Dados armazenados | Empresas existentes em `Empresa` com `acessoAte`/`trialFim` já vencidos há >10 dias serão bloqueadas no primeiro request após o deploy | **Contagem prévia obrigatória** (Pitfall 8). Nenhuma migração de dados; nenhum schema novo |
| Config de serviço vivo | Nenhuma — o webhook do Asaas já está registrado (Fase 3) e não é tocado por esta fase | Nenhuma |
| Estado registrado no SO | Nenhum — não há cron/worker nesta fase (é a Fase 5) | Nenhuma |
| Segredos / env vars | Nenhuma variável nova. `ASAAS_*` e `JWT_SECRET` já existem | Nenhuma |
| Artefatos de build | Nenhum. Nenhum pacote instalado, nenhum `prisma generate` novo (schema inalterado) | Nenhuma |

---

## Project Constraints (from CLAUDE.md / AGENTS.md)

| Diretiva | Origem | Como esta fase cumpre |
|----------|--------|------------------------|
| "This is NOT the Next.js you know — leia `node_modules/next/dist/docs/` antes de escrever código" | AGENTS.md | Toda afirmação sobre Next nesta pesquisa vem dos docs empacotados da 16.3.0, não de treinamento |
| Imports internos usam `@/`, nunca `../` entre diretórios | CLAUDE.md §Import Organization | Arquivos novos usam `@/lib/...`, `@/app/services/...`. **Nota:** os route handlers de catálogo existentes usam `../../../services/...` — ao editá-los, os testes mockam pelo **mesmo caminho relativo** (`vi.mock("../../../services/produto.service")`). Trocar para `@/` quebra os mocks; ou mantenha o caminho relativo, ou atualize o `vi.mock` junto |
| Erros: `HttpError`/`AuthError` com `.status`; mensagem genérica ao cliente, detalhe no `console.error` | CLAUDE.md §Error Handling | `AuthError("Assinatura suspensa…", 402)`; nenhuma menção a pagamento nas respostas do catálogo |
| Services exportam classe + singleton `const`; `select` nomeado em constante de módulo | CLAUDE.md §Module Design | `EMPRESA_PUBLICAVEL_SELECT` como const de módulo, ao lado de `PRODUTO_CATALOGO_SELECT` |
| Componentes colocados por rota em `_components/`, não em `components/` central | CLAUDE.md §Conventions + CONTEXT.md | `aviso-carencia.tsx` em `(protected)/_components/`; tela de bloqueio em `admin/bloqueado/_components/` |
| Testes co-locados: `*.test.ts` ao lado do arquivo; e2e em `e2e/*.spec.ts` | TESTING.md | Ver §Validation Architecture |
| Isolamento multi-tenant: services filtram por `empresaId`; rotas verificam posse | CLAUDE.md §Architectural Constraints | O gate de catálogo **acrescenta** filtro de tenant onde hoje não há (`findCatalogoById`) |
| GSD: mudanças só através de comando GSD | CLAUDE.md §GSD Workflow Enforcement | Execução via `/gsd-execute-phase` |
| Sem dados de pagamento no banco próprio | CLAUDE.md §Constraints (PCI) | Nada muda: o checkout continua hospedado no Asaas; a Server Action só repassa a URL |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 402 é preferível a 403 para assinatura suspensa em API autenticada | §Decisão de status HTTP | Baixo — é um literal numérico em um `throw`; trocar custa 1 linha. Mas o usuário pode ter opinião |
| A2 | "Respostas indistinguíveis exigem paridade de tempo, não só de status/corpo" | §Pitfall 2 | Baixo — a mitigação (1 query) é também a implementação mais simples e mais rápida, então é ganho líquido mesmo se o risco for teórico |
| A3 | Layouts do App Router não re-renderizam em navegação client-side neste projeto | §Pitfall 4 | Médio — se re-renderizarem, o banner é mais fresco que o previsto (falha benigna). Se **não** re-renderizarem e alguém apoiar segurança nisso, é grave. Por isso a segurança está no `requireAdminSession`, não no layout. **Verificar manualmente no UAT** |
| A4 | `redirect()` para URL externa funciona a partir de Server Action (não só de page) | §Pattern 5 | Médio — os docs afirmam que `redirect` aceita URLs absolutas, mas o exemplo não é de Server Action com destino externo. **Verificar cedo**, num spike de 5 minutos; fallback é devolver a URL da action e navegar com `useRouter`/`window.location` no client |
| A5 | O 400 atual de "slug inexistente" nos endpoints de lista é o comportamento desejado a espelhar | §Tabela de paridade | Baixo — é literalmente o comportamento vigente e testado; espelhá-lo é a opção conservadora |
| A6 | Mitigar o oráculo do Pitfall 7 com branding genérico é aceitável para o usuário | §Pitfall 7, Q1 | Alto — é decisão de produto. Não implementar sem confirmação |

---

## Open Questions

1. **O oráculo `/{slug}/admin/login` (Pitfall 7) é aceitável?**
   - O que sabemos: a tela de login **tem** que responder para uma empresa bloqueada, senão o cliente não consegue logar para pagar (critério de sucesso #5). Hoje ela 404 para slug inexistente.
   - O que não está claro: se o usuário considera "um visitante externo descobre que existe uma porta de admin neste slug" uma violação do §specifics ("indistinguível de 'essa loja não existe' para qualquer visitante externo").
   - Recomendação: implementar a mitigação de branding genérico (login de empresa bloqueada renderiza sem nome/logo/cores da loja) e **levar a decisão ao usuário** antes de executar. Se ele aceitar o vazamento, remove-se a mitigação e ganha-se simplicidade.

2. **Como testar bloqueio em e2e, se nenhuma API pode escrever fatos de billing?**
   - O que sabemos: o allowlist de `empresaService.update` **proíbe** escrita de `acessoAte`/`trialFim`/`canceladoEm`/`acessoVitalicio` por HTTP, deliberadamente (BILL-04, decisão `[02-02]`). O processo do Playwright não carrega `.env` nem conhece credenciais de banco (comentário em `e2e/sessao-revogada.spec.ts`). Postgres 16.15 está rodando localmente. [VERIFIED: `pg_isready` → accepting connections]
   - O que não está claro: se vale criar um script de seed sob `scripts/` (usando `scripts/resolvedor-ts.mjs`, o padrão de 03-07 para rodar `.ts` com o leitor de env da aplicação) invocado pelo spec, ou se o e2e cobre só o caminho feliz e o bloqueio fica 100% em Vitest.
   - Recomendação: **script de seed em `scripts/`** invocado por `child_process` no spec. É o mesmo padrão já aprovado na Fase 3, não abre endpoint de teste em produção, e é o único jeito de provar o critério #2 ("tanto navegando pela UI quanto chamando `/api/*`") ponta a ponta. Se o planner discordar, o mínimo aceitável em e2e é: empresa em trial (caminho feliz) continua funcionando após ligar os guards — critério de sucesso #4.

3. **A ação de pagamento deve viver em `(protected)/_lib/` ou fora?**
   - O que sabemos: o banner (carência, não bloqueada) vive dentro de `(protected)`; a tela de bloqueio vive fora. As duas precisam da mesma action.
   - Recomendação: colocar em `app/[slug]/admin/_lib/assinatura-actions.ts` (nível do `admin`, ao lado de `auth-actions.ts`, que já é compartilhado entre login e protected). Evita um import cruzando o group boundary.

4. **Quantas empresas seriam bloqueadas hoje?** (Pitfall 8)
   - Não respondível sem acesso ao banco de produção. É um `checkpoint:human-verify` do plano, não uma pergunta de pesquisa.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build, testes, scripts | ✓ | v25.9.0 local (CI usa v22 — `.github/workflows/tests.yml`) | — |
| npm | Deps | ✓ | 11.12.1 | — |
| PostgreSQL | E2E + script de seed (Q2) | ✓ | 16.15, `accepting connections` em `/var/run/postgresql:5432` | — |
| `psql` | Contagem prévia do Pitfall 8 | ✓ | 16.15 | script `.ts` via `resolvedor-ts.mjs` |
| Playwright + Chromium | E2E | ✓ | 1.62.1, browsers em `~/.cache/ms-playwright` (chromium-1234) | — |
| Vitest | Suíte unitária | ✓ | 4.1.10 | — |
| Docker | — | ✓ | disponível, não necessário | — |
| Next 16 docs empacotados | Verificação de API (AGENTS.md) | ✓ | `node_modules/next/dist/docs/` | — |
| Asaas Sandbox | Não necessário nesta fase | n/a | — | A fase não chama o gateway em teste; `criarCheckout` é mockado |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** nenhuma.

**Nota:** Node local (v25.9.0) diverge do CI (v22). Nada nesta fase depende de API específica de versão, mas se um script de seed for criado (Q2), ele usa type-stripping nativo — disponível nas duas.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (jsdom default; `// @vitest-environment node` para lib/service/rota) + Playwright 1.62.1 |
| Config file | `vitest.config.mts`, `playwright.config.ts` |
| Quick run command | `npx vitest run <caminho-do-arquivo>` |
| Full suite command | `npm test` (Vitest) · `npm run test:e2e` (Playwright, porta 3100) |

Setup relevante: `tests/setup/vitest.setup.ts` → `tests/setup/prisma-mock.ts` (mock profundo de `PrismaClient` + stub default de conta ativa). Helpers: `tests/helpers/request.ts` (`buildRequest`, `buildParams`), `tests/helpers/auth.ts` (`buildAuthToken`, `testAuthPayload`). `vitest.config.mts` exclui `**/.claude/**` (worktrees de agente) — não remover.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACC-01 | Banner renderiza com dias restantes e CTA quando status = CARENCIA | component | `npx vitest run "app/[slug]/admin/(protected)/_components/aviso-carencia.test.tsx"` | ❌ Wave 0 |
| ACC-01 | Banner ausente em TRIAL/EM_DIA/VITALICIO | component | idem | ❌ Wave 0 |
| ACC-01 | Dias restantes corretos na virada 23:30 / 00:30 BRT | unit | `npx vitest run lib/avaliar-acesso.test.ts` (estender) | ✅ existe |
| ACC-01 | Banner não aparece no catálogo público | grep gate | `! grep -rn "AvisoCarencia" "app/[slug]/(catalogo)"` | ❌ Wave 0 |
| ACC-02 | `requireAdminSession` redireciona para `/bloqueado` em BLOQUEADO **e** CANCELADO | unit | `npx vitest run lib/session.test.ts` | ✅ existe |
| ACC-02 | `requireAdminSession` NÃO redireciona em TRIAL/EM_DIA/CARENCIA/VITALICIO | unit | idem | ✅ existe |
| ACC-02 | `requireAuth` lança status de bloqueio em BLOQUEADO/CANCELADO | unit | `npx vitest run lib/api-auth.test.ts` | ✅ existe |
| ACC-02 | `requireAuth` com `permitirEmpresaBloqueada` deixa o checkout passar | unit | idem | ✅ existe |
| ACC-02 | Rota de exemplo devolve o status do `AuthError` sem edição | unit | `npx vitest run app/api/produtos/route.test.ts` | ✅ existe |
| ACC-02 | Página `/bloqueado` redireciona quem não está bloqueado | unit | `npx vitest run "app/[slug]/admin/bloqueado/page.test.ts"` | ❌ Wave 0 |
| ACC-02 | Tela de bloqueio tem logout e CTA de pagamento | component | `npx vitest run "app/[slug]/admin/bloqueado/_components/*.test.tsx"` | ❌ Wave 0 |
| ACC-02 | Predicado exaustivo: os 6 status mapeados | unit | `npx vitest run lib/avaliar-acesso.test.ts` | ✅ existe |
| ACC-03 | `findBySlug` devolve null para bloqueada, **sem** disparar as 3 queries de catálogo | unit | `npx vitest run app/services/empresa.service.test.ts` | ✅ existe |
| ACC-03 | Paridade de queries: bloqueada e inexistente gastam o mesmo nº de `prisma.*` | unit | idem (`expect(prismaMock.produto.findMany).not.toHaveBeenCalled()`) | ✅ existe |
| ACC-03 | `/{slug}` 404 para bloqueada (via `getEmpresaCatalogo`) | unit | `npx vitest run "app/[slug]/_lib/empresa.test.ts"` | ❌ Wave 0 |
| ACC-03 | `GET /api/empresas/slug/[slug]` → 404 mesmo corpo | unit | `npx vitest run "app/api/empresas/slug/[slug]/route.test.ts"` | ✅ existe |
| ACC-03 | `?slug=` bloqueado → 400 com a mensagem existente | unit | `npx vitest run app/api/catalogo/produtos/route.test.ts` | ✅ existe |
| ACC-03 | `?empresaId=` bloqueado → 200 `[]` | unit | idem | ✅ existe |
| ACC-03 | `/[id]` de produto de empresa bloqueada → 404 mesmo corpo | unit | `npx vitest run "app/api/catalogo/produtos/[id]/route.test.ts"` | ✅ existe |
| ACC-03 | idem para combos (lista + `[id]`) | unit | `npx vitest run app/api/catalogo/combos/route.test.ts "app/api/catalogo/combos/[id]/route.test.ts"` | ✅ existe |
| ACC-03 | `findCatalogoById` também rejeita empresa com `deletedAt` | unit | `npx vitest run app/services/produto.service.test.ts app/services/combo.service.test.ts` | ✅ existe |
| ACC-03 | Login do admin de empresa bloqueada **continua** renderizando | unit | `npx vitest run app/services/empresa.service.test.ts` (`findBrandingBySlug`) | ✅ existe |
| ACC-04 | Mesmo token: bloqueado agora, liberado no request seguinte após `acessoAte` futuro | unit | `npx vitest run lib/api-auth.test.ts` | ✅ existe |
| ACC-04 | Nenhum cache cross-request nos arquivos de guarda | grep gate | `! grep -rEn "unstable_cache\|'use cache'" lib/auth-guard.ts lib/session.ts lib/api-auth.ts` | ❌ Wave 0 |
| ACC-02+03 | Gate de unicidade: `permitirEmpresaBloqueada` só no checkout | grep gate | `test $(grep -rl "permitirEmpresaBloqueada" app | wc -l) -eq 1` | ❌ Wave 0 |
| ACC-03 | Gate de enumeração: nenhum `loading.tsx` sob `app/[slug]/(catalogo)` | grep gate | `! find "app/[slug]/(catalogo)" -name "loading*"` | ❌ Wave 0 |
| #4 (roadmap) | Empresa em trial mantém admin e catálogo funcionando | e2e | `npx playwright test e2e/bloqueio-por-inadimplencia.spec.ts` | ❌ Wave 0 |
| #2 (roadmap) | Empresa bloqueada: UI cai na tela de bloqueio **e** `/api/produtos` rejeita com o mesmo token, sem loop de redirect | e2e | idem (depende de Q2) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <arquivos de teste tocados>` (< 30 s)
- **Per wave merge:** `npm test && npm run lint && npx tsc --noEmit`
- **Phase gate:** `npm test` + `npm run test:e2e` verdes + os 4 gates de grep + o `checkpoint:human-verify` da contagem do Pitfall 8

### Wave 0 Gaps
- [ ] `app/[slug]/admin/(protected)/_components/aviso-carencia.test.tsx` — cobre ACC-01
- [ ] `app/[slug]/admin/bloqueado/page.test.ts` — cobre ACC-02 (guarda simétrica, anti-loop)
- [ ] `app/[slug]/admin/bloqueado/_components/*.test.tsx` — cobre ACC-02 (logout + CTA)
- [ ] `app/[slug]/_lib/empresa.test.ts` — cobre ACC-03 (`getEmpresaCatalogo` → `notFound`)
- [ ] `e2e/bloqueio-por-inadimplencia.spec.ts` — cobre critérios #2 e #4 (depende da resolução de Q2)
- [ ] Script de seed de fatos de billing sob `scripts/` (Q2) — habilitador do e2e acima
- [ ] Os 4 gates de grep como script verificável (não como instrução em prosa)
- [ ] Instalação de framework: **nenhuma** — Vitest e Playwright já configurados

---

## Security Domain

### Applicable ASVS Categories (nível 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | **sim** | Ponto único de decisão (`avaliarAcesso`) + dois choke points de enforcement (`requireAdminSession`, `requireAuth`) + um funil de catálogo. Nenhuma regra duplicada |
| V2 Authentication | não | Login/JWT/bcrypt inalterados nesta fase |
| V3 Session Management | não | Cookie `httpOnly`+`secure`+`sameSite: lax`, 7d; sem mudança. O `destroySession` da tela de bloqueio reusa o caminho existente |
| V4 Access Control | **sim** | **Núcleo da fase.** Deny-by-default (opt-out explícito, não opt-in), verificação server-side em cada request, nunca em cache cross-request, nunca só no layout/cliente |
| V5 Input Validation | parcial | `empresaId`/`id` vêm de query string e path e vão direto ao Prisma — parametrizado, sem SQLi. Um UUID inválido simplesmente não casa. Nenhuma validação nova é necessária; **não** adicione validação de formato que responda diferente de "não encontrado" (recriaria o oráculo) |
| V6 Cryptography | não | Nada criptográfico novo |
| V7 Error Handling & Logging | **sim** | Respostas do catálogo genéricas e idênticas ao caso inexistente; nenhuma menção a pagamento; detalhe só em `console.error` server-side (convenção do projeto) |
| V13 API | **sim** | 402/403 consistente em todas as rotas via `error.status`; webhook fora da guarda por design |

### Known Threat Patterns for Next.js 16 + Prisma + multi-tenant

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Enumeração de tenant por forma de resposta | Information Disclosure | Tabela de paridade obrigatória (§Decisão de status HTTP); nenhuma resposta pública menciona pagamento |
| Enumeração de tenant por **tempo** de resposta | Information Disclosure | Paridade de round trips: 1 query em todos os caminhos de rejeição (Pattern 4 / Pitfall 2) |
| Bypass por caminho de leitura esquecido (6 portas) | Elevation of Privilege | Gate no service, não na rota; gate de grep enumerando os entrypoints públicos |
| Sondagem direta por `empresaId`/`id` (estilo IDOR) | Information Disclosure | O gate incide sobre o status derivado da empresa **dona** do recurso, não sobre a resolução de slug. `empresaId` já é exposto no corpo público do catálogo — assumir que o atacante o tem |
| Empresa soft-deleted ainda legível por `findCatalogoById` | Information Disclosure | Adicionar `empresa: { deletedAt: null }` — buraco pré-existente fechado pelo mesmo patch |
| Guarda só no layout / só no cliente | Elevation of Privilege | Guarda no DAL; layout não impede segmentos filhos nem o RSC payload [CITED: Next 16 docs] |
| `notFound()`/`redirect()` engolidos por `try/catch` → fail-open com 500 | Tampering / Denial of Service | Não usar `notFound()` dentro dos handlers com `try`; `unstable_rethrow` como primeira linha se inevitável |
| Cache cross-request congelando autorização | Elevation of Privilege | Somente `React.cache`; gate de grep contra `unstable_cache`/`'use cache'` |
| CSRF no botão de pagamento | Spoofing | Server Action (POST-only + Origin vs Host) em vez de `fetch` com credencial [CITED: data-security.md:546-550] |
| Auto-DoS: cliente bloqueado sem caminho para pagar | Denial of Service | Opt-out do checkout + `logout` sem guarda + login sem gate de status |
| Auth virando vetor de carga no banco | Denial of Service | Ordem preservada: banco só é consultado após token válido e slug conferido (convenção já documentada em `lib/session.ts:76-78`); **nenhuma** query nova em `proxy.ts` |
| Bloqueio retroativo em massa no deploy | Denial of Service (auto-infligido) | Contagem prévia como checkpoint bloqueante (Pitfall 8) |

---

## Sources

### Primary (HIGH confidence)
- Inspeção direta do repositório: `lib/session.ts`, `lib/api-auth.ts`, `lib/auth-guard.ts`, `lib/avaliar-acesso.ts`, `lib/http-error.ts`, `proxy.ts`, `next.config.ts`, `app/[slug]/(catalogo)/{page,layout}.tsx`, `app/[slug]/_lib/empresa.ts`, `app/[slug]/admin/login/page.tsx`, `app/[slug]/admin/_lib/auth-actions.ts`, `app/[slug]/admin/(protected)/layout.tsx`, `app/[slug]/admin/(protected)/_components/{admin-nav,confirm-submit-button}.tsx`, `app/[slug]/admin/_components/login-form.tsx`, `app/api/catalogo/**/route.ts`, `app/api/empresas/slug/[slug]/route.ts`, `app/api/assinaturas/checkout/route.ts`, `app/api/webhooks/asaas/route.ts`, `app/services/{empresa,produto,combo,assinatura}.service.ts`, `prisma/schema.prisma`, `tests/setup/*`, `tests/helpers/*`, `lib/{api-auth,session}.test.ts`, `e2e/{sessao-revogada.spec.ts,helpers.ts}`, `vitest.config.mts`, `playwright.config.ts`, `TESTING.md`
- Documentação Next.js 16.3.0 empacotada em `node_modules/next/dist/docs/` (fonte oficial exigida pelo AGENTS.md): `01-app/01-getting-started/16-proxy.md`, `01-app/02-guides/authentication.md`, `01-app/02-guides/data-security.md`, `01-app/03-api-reference/04-functions/{not-found,forbidden,unstable_rethrow,redirect}.md`, `01-app/03-api-reference/03-file-conventions/not-found.md`
- Comandos executados: `node -p "require('./node_modules/next/package.json').version"` → 16.3.0; `grep -rn "instanceof AuthError" -A 2 app/api --include=route.ts` → 29 handlers, todos `error.status`; `grep -rn "requireAdminSession" app | grep -v test | wc -l` → 59; `grep -rn "fetch(" app --include=*.tsx --include=*.ts | grep -v test` → 0; `pg_isready` → accepting connections
- Documentos de planejamento do próprio projeto: `.planning/{ROADMAP,REQUIREMENTS,STATE}.md`, `.planning/research/{PITFALLS,ARCHITECTURE}.md`, `.planning/phases/04-*/04-CONTEXT.md`

### Secondary (MEDIUM confidence)
- Nenhuma — nenhum resultado de busca web foi corroborado por fonte oficial nesta sessão.

### Tertiary (LOW confidence)
- WebSearch "HTTP 402 vs 403 for SaaS subscription suspension" — agregado de blogs de API + MDN sobre 402 ser não-padrão. Usado apenas para a recomendação (revogável) de status code.
- WebSearch "tenant enumeration / timing side channel para contas suspensas" — princípio geral (paridade de status + corpo + tempo). Usado apenas para justificar a exigência de paridade de queries, que é um ganho independente de perf.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhum pacote novo; todas as versões lidas de `package.json`/`node_modules`
- Architecture: HIGH — todos os pontos de extensão lidos linha a linha; comportamento de Next confirmado nos docs empacotados da versão exata instalada
- Pitfalls: HIGH para 1, 2, 3, 6, 7, 8 (verificados no código/docs); MEDIUM para 4 (comportamento de partial rendering citado dos docs, não medido) e 5 (padrão de fuso já provado na Fase 2)
- Segurança: HIGH para o mapa de superfícies (6 caminhos enumerados por leitura); LOW para a escolha 402 vs 403 (convenção, não norma)

**Research date:** 2026-09-01
**Valid until:** 2026-10-01 (30 dias — stack estável, sem dependência externa nova; reavaliar se o Next subir de minor)
