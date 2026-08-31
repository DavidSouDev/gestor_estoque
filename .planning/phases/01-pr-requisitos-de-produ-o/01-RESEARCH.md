# Phase 1: Pré-requisitos de Produção - Research

**Researched:** 2026-08-31
**Domain:** Next.js 16 App Router — ciclo de vida do Prisma Client (driver adapter `pg`) + Data Access Layer (DAL) com revalidação de sessão no banco
**Confidence:** HIGH

## Summary

Esta fase corrige dois bugs já diagnosticados. Nenhum dos dois exige biblioteca nova, decisão de arquitetura aberta ou pesquisa de mercado — a pesquisa aqui serve para dar ao planner (a) o estado exato do código, (b) o padrão correto verificado contra as fontes autoritativas locais (docs do Next.js 16.3.0 empacotadas em `node_modules/next/dist/docs/`, skill local `prisma-client-api`, código-fonte de `@prisma/adapter-pg` e `pg-pool`), e (c) três armadilhas que quebram a fase se não forem previstas no plano.

**INFRA-01 (Prisma singleton):** o diagnóstico do `CONCERNS.md` está certo na conclusão mas errado no mecanismo. Módulos ES/CJS são cacheados pelo Node, então "todo import cria um novo client" não é literalmente verdade. O problema real é que o Next.js 16 compila o código de servidor em **camadas webpack distintas** (`rsc`, `ssr`, `api-node`, `action-browser`, `instrument`, `middleware` — verificado em `node_modules/next/dist/lib/constants.js:331-372`); o mesmo arquivo importado de camadas diferentes vira **instâncias de módulo diferentes em runtime**, cada uma com seu próprio `PrismaClient` e seu próprio `pg.Pool` (default `max: 10`, verificado em `node_modules/pg-pool/index.js:89`). Como `lib/prisma.ts` é importado tanto por Server Components/Actions (camada `rsc`/`action-browser`) quanto por Route Handlers (`api-node`), hoje em produção o processo abre pools redundantes. Adicionado a isso: em serverless (Vercel, a recomendação de hosting do `STACK.md`) e nas próximas fases (worker diário + webhooks do Asaas), esse multiplicador vira exaustão de pool. O fix é de 3 linhas e foi **provado empiricamente** nesta sessão (ver Code Examples).

**INFRA-02 (revalidação no banco):** o Next.js 16 documenta exatamente o padrão pedido pelo CONTEXT.md — um DAL com `verifySession()` embrulhado em `React.cache()`, invocável de Server Components, Server Actions e Route Handlers (`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1129-1231`). A implementação é um helper novo em `lib/` consumido por `session.ts` e `api-auth.ts`. **Três armadilhas dominam o risco desta fase**, todas confirmadas no código: (1) o `app/[slug]/admin/login/page.tsx` redireciona para `/admin` sempre que o cookie JWT é válido — combinado com o novo fail-closed no layout, isso produz **loop infinito de redirect** para um usuário desativado; (2) `cookies().delete()` **não pode** ser chamado de um Server Component, então `requireAdminSession` não tem como limpar o cookie ao falhar; (3) **14 arquivos de teste existentes quebram** ao adicionar a query de revalidação, porque o `prismaMock` global devolve `undefined` por default e o caminho fail-closed transforma todos os 200 esperados em 401/redirect.

**Primary recommendation:** dois arquivos novos (`lib/auth-guard.ts` + seu teste) e cinco arquivos editados (`lib/prisma.ts`, `lib/session.ts`, `lib/api-auth.ts`, `app/[slug]/admin/login/page.tsx`, `app/registro/page.tsx`), mais um stub default no `tests/setup/prisma-mock.ts` para preservar os 14 arquivos de teste existentes. Sem dependências novas.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Comportamento em falha de revalidação**
- **D-01:** Se a query de revalidação ao banco falhar (timeout, erro de conexão), a sessão é tratada como inválida — **fail-closed**. Redireciona para login (`requireAdminSession`) ou lança `AuthError` 401 (`requireAuth`). Nunca deixa passar uma sessão que não pôde ser confirmada. Consistente com o Core Value ("sem exceções") e evita abrir uma janela de acesso indevido por instabilidade momentânea do banco.

**Escopo da checagem no banco**
- **D-02:** A revalidação nesta fase verifica apenas `Usuario.ativo === true` e `Empresa.deletedAt === null`. Não inclui nenhuma lógica de status de pagamento — esses campos (`acessoAte`, `trialFim`, etc.) só existem a partir da Fase 2.
- **D-03:** A função de revalidação deve buscar o Usuario e a Empresa atuais do banco (não confiar em nenhum dado do payload do JWT além do `sub`/`empresaId` para localizar os registros) e comparar contra o token antes de autorizar.
- **D-04:** Esta função é o ponto de extensão natural para a Fase 2 plugar a avaliação de acesso por pagamento (`avaliarAcesso`) depois — mas nesta fase ela faz **apenas** a checagem de existência/ativo acima. Não construir abstrações antecipadas para o payload de pagamento; a Fase 2 estende quando os fatos existirem.

**Onde a revalidação é aplicada**
- **D-05:** A revalidação no banco é aplicada em **ambas** as camadas de auth: `requireAdminSession` (`lib/session.ts`, usado por Server Components/layouts/Server Actions do admin) e `requireAuth` (`lib/api-auth.ts`, usado pelas rotas `app/api/*` com Bearer token).
- **D-06:** `proxy.ts` (Edge) **não muda** — continua fazendo apenas a checagem otimista de JWT (sem Prisma), como já documentado no comentário existente e confirmado pela pesquisa do projeto (Edge não roda Prisma/`pg`). A revalidação real acontece nas camadas server (session/api-auth), nunca no proxy.

**Custo por request**
- **D-07:** A revalidação é deduplicada dentro do mesmo request usando `React.cache()` (mesmo padrão já usado em `getEmpresaCatalogo()`), para que múltiplas chamadas a `requireAdminSession` dentro do mesmo request (layout + page + Server Action) resultem em **uma única query** ao banco, não uma por chamada. Isso é especialmente importante logo após corrigir o singleton do Prisma (INFRA-01) — não queremos reintroduzir pressão de conexões por outro caminho.
- **D-08:** Note que `React.cache()` deduplica por request do lado do servidor; Server Actions disparadas via navegador contam como requests HTTP separados da página que as invocou, então cada Server Action ainda dispara sua própria query (não há como evitar isso sem um cache cross-request, que está fora de escopo aqui).

### Claude's Discretion
- Estrutura exata do retorno da função de revalidação (throw vs. objeto tipado) — desde que fail-closed e cache por-request sejam respeitados.
- Nome e local exato da função de revalidação compartilhada entre `session.ts` e `api-auth.ts` (ex.: novo helper em `lib/`).
- Estratégia de teste para a correção do singleton do Prisma (unit vs. verificação manual de contagem de conexões).

### Deferred Ideas (OUT OF SCOPE)
- Extensão da função de revalidação para checar status de pagamento (`acessoAte`, carência, bloqueio) — pertence à Fase 2 (modelo de dados) e Fase 4 (aplicação do bloqueio). Esta fase só prepara o ponto de extensão (D-04), não implementa a lógica de pagamento.
- Gate no catálogo público (`getEmpresaCatalogo` e os 5 caminhos de leitura pública) — pertence à Fase 4 (Aplicação do Bloqueio), não a esta fase.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Bug crítico do singleton do Prisma (`lib/prisma.ts`) é corrigido antes de qualquer código de billing entrar em produção | § Pattern 1 (padrão de singleton verificado contra a skill `prisma-client-api` + código-fonte de `@prisma/adapter-pg`); § Pitfall 4 (mecanismo real: camadas webpack do Next 16); § Validation Architecture (teste unitário **provado viável** nesta sessão — falha hoje, passa após o fix) |
| INFRA-02 | Sessão do admin revalida o status no banco a cada request (não confia apenas no JWT de 7 dias) | § Pattern 2 (DAL + `React.cache()`, padrão explicitamente documentado nas docs do Next.js 16.3.0 empacotadas); § Pattern 3 (integração em `session.ts` e `api-auth.ts` com `redirect()` fora de `try/catch`); § Pitfall 1 (loop de redirect na página de login — bloqueador); § Pitfall 2 (`cookies().delete()` proibido em Server Component); § Pitfall 3 (14 arquivos de teste que quebram) |

**Nota sobre o texto do INFRA-02:** o requisito escrito diz "revalida o **status de pagamento**". Nesta fase, por D-02, só existem `Usuario.ativo` e `Empresa.deletedAt` — não há campo de pagamento no schema ainda. O requisito é considerado atendido nesta fase pela **infraestrutura** de revalidação; a parte de pagamento é plugada na Fase 2/4 (D-04). O planner deve refletir isso nos critérios de verificação para não criar um falso "não atendido".
</phase_requirements>

---

## Project Constraints (from CLAUDE.md / AGENTS.md)

Diretivas acionáveis extraídas — o plano **não** pode contradizê-las:

| # | Diretiva | Origem | Impacto nesta fase |
|---|----------|--------|--------------------|
| C-01 | **"This is NOT the Next.js you know"** — ler o guia relevante em `node_modules/next/dist/docs/` antes de escrever código; APIs e convenções podem divergir do conhecimento de treinamento | `AGENTS.md` | Cumprido nesta pesquisa: todo padrão do Next abaixo foi lido das docs empacotadas da versão 16.3.0 instalada, não de memória. O bloco de `AGENTS.md` é reescrito pelo `next dev` — se aparecer no diff, commitar junto |
| C-02 | Imports internos usam sempre o alias `@/` — nunca `../` entre diretórios | `CLAUDE.md` § Import Organization | O novo helper importa `@/lib/prisma` e `@/lib/jwt`. Atenção: `app/api/auth/login/route.ts` usa `../../../services/...` (violação preexistente) — **não** corrigir nesta fase (fora de escopo) |
| C-03 | Nomes de arquivo em kebab-case; utilitários em `lib/[nome].ts`; testes co-localizados como `[nome].test.ts` | `CLAUDE.md` § Naming Patterns | `lib/auth-guard.ts` + `lib/auth-guard.test.ts` |
| C-04 | `console.error()` para exceções; sem biblioteca de logging estruturado; nunca vazar detalhes do erro ao cliente | `CLAUDE.md` § Logging / Error Handling | O `catch` do fail-closed loga com `console.error` e devolve mensagem genérica |
| C-05 | Erros de negócio via `HttpError`; erros de auth via `AuthError` (ambos com `status`) | `CLAUDE.md` § Error Handling | Reutilizar `AuthError` já existente em `lib/api-auth.ts` — não criar classe nova |
| C-06 | Projeções nomeadas (`SAFE_SELECT`, `PRODUTO_CATALOGO_SELECT`) para não vazar campos sensíveis (ex.: `senhaHash`) | `CLAUDE.md` § Module Design | A query de revalidação usa `select` explícito; **nunca** `include` nem select implícito do modelo `Usuario` (que traria `senhaHash`) |
| C-07 | Multi-tenancy: todo acesso filtra por `empresaId`; rotas verificam posse antes de mutar | `CLAUDE.md` § Architectural Constraints | A query de revalidação filtra por `id` **e** `empresaId` juntos — não apenas por `id` |
| C-08 | Serviços exportam classe + instância singleton (`export const xService = new XService()`); TypeScript estrito; 2 espaços; ponto e vírgula obrigatório | `CLAUDE.md` § Code Style / Module Design | O helper é uma função exportada em `lib/`, não um service — coerente com `lib/jwt.ts`, `lib/session.ts`, `lib/api-auth.ts` |
| C-09 | GSD Workflow Enforcement — nenhuma edição direta fora de um comando GSD | `CLAUDE.md` | O planner produz PLAN.md; execução via `/gsd-execute-phase` |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ciclo de vida do pool de conexões Postgres | Node.js server (módulo `lib/`, escopo de processo via `globalThis`) | — | O pool pertence ao processo, não ao request. `globalThis` é o único escopo compartilhado entre as camadas webpack do Next e sobrevive ao HMR do dev |
| Verificação de assinatura/expiração do JWT | Edge (`proxy.ts`) + Node server (`lib/jwt.ts`) | — | `jose` roda nos dois runtimes; a checagem no Edge é **otimista** apenas (D-06) |
| Revalidação da conta no banco (`ativo`/`deletedAt`) | Node server — DAL (`lib/auth-guard.ts`) | — | Requer Prisma/`pg`, que não roda no Edge. As docs do Next mandam explicitamente evitar checagem de banco no Proxy (`authentication.md:1031`) |
| Autorização de páginas/Server Actions do admin | Node server — Server Component (`lib/session.ts` chamado do layout `(protected)`) | — | `cookies()` + `redirect()` só existem no server; é o ponto mais alto da árvore do admin |
| Autorização de rotas `app/api/*` | Node server — Route Handler (`lib/api-auth.ts`, camada webpack `api-node`) | — | Bearer token; sem cookies e sem `redirect()` — o contrato é lançar `AuthError` |
| Guarda "já estou logado" das páginas públicas de login/registro | Node server — Server Component (`login/page.tsx`, `registro/page.tsx`) | — | Precisa da **mesma** verdade do DAL, senão gera loop de redirect (§ Pitfall 1) |
| Bloqueio por pagamento | — (**fora de escopo**: Fases 2/4) | — | D-04: esta fase só cria o ponto de extensão |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | 7.9.1 (instalado) | ORM / acesso ao Postgres | Já é o ORM do projeto. `[VERIFIED: package.json + node_modules]` |
| `@prisma/adapter-pg` | 7.9.1 (instalado) | Driver adapter obrigatório no Prisma 7 | Prisma 7 exige driver adapter; já configurado. `[VERIFIED: node_modules/@prisma/adapter-pg/dist/index.mjs]` |
| `pg` | 8.22.0 (instalado) | Pool de conexões Postgres | Dependência transitiva do adapter; `max` default = 10. `[VERIFIED: node_modules/pg-pool/index.js:89]` |
| `react` (`cache`) | 19.2.8 (instalado) | Memoização por request do DAL | Padrão prescrito pelas docs do Next.js 16.3.0 para DAL de auth. `[VERIFIED: node_modules/next/dist/docs/.../authentication.md:1135-1231]` |
| `jose` | 6.2.10 (instalado) | Verificação do JWT | Já em uso; **inalterado** nesta fase |
| `vitest` + `vitest-mock-extended` | 4.1.10 / 5.1.1 (instalados) | Testes unitários com `prismaMock` | Infra de teste já montada em `tests/setup/` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@playwright/test` | 1.62.1 (instalado) | Regressão end-to-end (critério de sucesso #4) | Suíte existente em `e2e/` roda contra Postgres real; usar para provar "nenhuma regressão" |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `React.cache()` para dedupe por request | `unstable_cache` / `"use cache"` do Next | **Errado aqui.** Esses caches são **cross-request e persistentes** — cachear a validade de uma sessão entre requests reintroduz exatamente a janela de 7 dias que a fase existe para fechar. `React.cache` é explicitamente "scoped to the current request only" `[CITED: node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md:588]` |
| `React.cache()` | `AsyncLocalStorage` próprio | Reinventa o que o React já dá e não integra com o escopo de render do RSC |
| Nada | pacote `server-only` | Marcaria `lib/auth-guard.ts` como server-only em tempo de build. **Não recomendado nesta fase:** dependência nova, e o helper importa `@/lib/prisma` (que já quebraria o build se chegasse ao cliente). Verdict do gate de legitimidade: `SUS` (sem repositório declarado) — ver § Package Legitimacy Audit |
| Revalidar a cada request | Encurtar o JWT para ~15 min + refresh token | Não atende ao critério de sucesso #3 ("sessão invalidada **imediatamente**") e é uma reescrita muito maior do fluxo de auth |
| Query única com filtro relacional | Duas queries (`usuario.findUnique` + `empresa.findUnique`) | Dobra o custo por request sem ganho; o filtro relacional `empresa: { deletedAt: null }` resolve em um round-trip |

**Installation:**
```bash
# Nenhuma dependência nova. Esta fase não instala nada.
```

**Version verification:** todas as versões acima foram lidas de `package.json` e confirmadas em `node_modules/` no dia da pesquisa (2026-08-31). Nenhum pacote novo é proposto, portanto não há risco de versão obsoleta vinda de dados de treinamento.

---

## Package Legitimacy Audit

**Esta fase não instala nenhum pacote externo.** Todo o trabalho usa dependências já presentes em `package.json` e no lockfile, verificadas em `node_modules/`.

Um único pacote foi *considerado e descartado* (ver Alternatives Considered). Auditado mesmo assim, por rigor:

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `server-only` | npm | publicado 2022-09-03 (~4 anos) | ~16M/semana | nenhum declarado no manifesto | `[SUS]` (`no-repository`) | **Não usado** — descartado por escolha de escopo, não por risco |

`[VERIFIED: gsd-tools query package-legitimacy check --ecosystem npm server-only]`

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `server-only` — não entra no plano; se um plano futuro o propuser, exigir `checkpoint:human-verify` antes de instalar.

---

## Architecture Patterns

### System Architecture Diagram

```text
                      ┌──────────────────────────────────────────┐
   request HTTP  ───▶  │  proxy.ts  (Edge — INALTERADO, D-06)      │
                      │  cookie presente? assinatura JWT ok?      │
                      │  payload.empresaSlug === :slug da URL?     │
                      │  SEM acesso ao banco / SEM Prisma          │
                      └───────────┬───────────────┬───────────────┘
                        falha ────┘               └──── passa (otimista)
                          │                              │
                 redirect /:slug/admin/login              │
                                          ┌──────────────┴───────────────┐
                                          ▼                              ▼
                       ┌─────────────────────────────┐   ┌──────────────────────────────┐
                       │ Server Component / Action   │   │ Route Handler  app/api/*     │
                       │ (camada webpack rsc /       │   │ (camada webpack api-node)    │
                       │  action-browser)            │   │                              │
                       │ requireAdminSession(slug)   │   │ requireAuth(request)         │
                       │  · lê cookie admin_session  │   │  · lê header Bearer          │
                       │  · verifyAuthToken (jose)   │   │  · verifyAuthToken (jose)    │
                       └───────────┬─────────────────┘   └──────────┬───────────────────┘
                                   │                                │
                                   └───────────┬────────────────────┘
                                               ▼
                              ┌─────────────────────────────────────────┐
                              │  lib/auth-guard.ts  —  DAL (NOVO)       │
                              │  revalidarConta(usuarioId, empresaId)   │
                              │  embrulhado em React.cache()            │
                              │  → 1 query por request (D-07)           │
                              └───────────┬─────────────────────────────┘
                                          ▼
                              ┌─────────────────────────────────────────┐
                              │  lib/prisma.ts  (CORRIGIDO — INFRA-01)  │
                              │  1 PrismaClient por PROCESSO, guardado  │
                              │  em globalThis → compartilhado entre    │
                              │  TODAS as camadas webpack               │
                              └───────────┬─────────────────────────────┘
                                          ▼
                              ┌─────────────────────────────────────────┐
                              │  pg.Pool (lazy, max=10)  →  PostgreSQL  │
                              │  SELECT usuario WHERE id=? AND          │
                              │    empresaId=? AND ativo=true           │
                              │    AND empresa.deletedAt IS NULL        │
                              └───────────┬─────────────────────────────┘
                                          │
                    ┌─────────────────────┴──────────────────────┐
                    ▼                                            ▼
        conta encontrada e ativa                    null  |  erro de banco
                    │                                            │
                    ▼                                     (D-01 fail-closed)
        segue para a página / handler              ┌──────────────┴──────────────┐
                                                   ▼                             ▼
                                       Server Component:              Route Handler:
                                       redirect /:slug/admin/login    throw AuthError 401
                                                   │
                                                   ▼
                            ┌──────────────────────────────────────────────┐
                            │ login/page.tsx — guarda "já logado"          │
                            │ DEVE usar a MESMA verdade do DAL,            │
                            │ senão devolve o usuário ao admin → LOOP      │
                            │ (§ Pitfall 1)                                 │
                            └──────────────────────────────────────────────┘
```

### Recommended Project Structure

```text
lib/
├── prisma.ts          # EDITADO — singleton em globalThis em TODOS os ambientes (INFRA-01)
├── auth-guard.ts      # NOVO   — DAL: revalidarConta() com React.cache (INFRA-02)
├── auth-guard.test.ts # NOVO   — testes do DAL (ativo/deletado/erro de banco/dedupe)
├── prisma.test.ts     # NOVO   — teste do singleton sob NODE_ENV=production
├── session.ts         # EDITADO — requireAdminSession + novo getVerifiedSession
├── session.test.ts    # EDITADO — success paths precisam de stub do prismaMock
├── api-auth.ts        # EDITADO — requireAuth passa a revalidar
├── api-auth.test.ts   # EDITADO — idem
└── jwt.ts             # INALTERADO

app/
├── [slug]/admin/login/page.tsx   # EDITADO — guarda "já logado" usa o DAL (anti-loop)
├── [slug]/admin/(protected)/layout.tsx  # INALTERADO (herda o novo comportamento)
├── registro/page.tsx             # EDITADO — mesma guarda
└── api/**/route.ts               # INALTERADOS (herdam via requireAuth)

proxy.ts                          # INALTERADO (D-06)

tests/setup/prisma-mock.ts        # EDITADO — stub default de conta ativa (§ Pitfall 3)
```

### Pattern 1: Singleton do Prisma preso ao `globalThis` (INFRA-01)

**What:** instanciar o `PrismaClient` uma única vez por **processo** e publicá-lo em `globalThis`, em todos os ambientes — não só em desenvolvimento.

**When to use:** sempre, em Next.js. `globalThis` é o único escopo compartilhado entre as diferentes camadas de bundle do servidor e sobrevive à reavaliação de módulos do HMR.

**Example:**
```typescript
// lib/prisma.ts  (versão corrigida)
// Fonte do padrão: .agents/skills/prisma-client-api/references/constructor.md § Singleton Pattern
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Sem guarda de NODE_ENV: o cache global vale para dev, teste e produção.
// Em produção ele impede que camadas de bundle distintas (rsc / api-node /
// action-browser / instrument) criem cada uma o seu próprio pool.
globalForPrisma.prisma = prisma;
```

Três diferenças em relação ao código atual, todas propositais:

1. **A guarda `if (process.env.NODE_ENV !== "production")` some.** É a correção do INFRA-01.
2. **O `new PrismaPg(...)` sai do escopo de módulo e entra na factory.** Hoje o adapter é construído em todo import, mesmo quando o client é reaproveitado pelo `??`. Não é catastrófico (o `pg.Pool` só nasce dentro de `connect()` — `[VERIFIED: node_modules/@prisma/adapter-pg/dist/index.mjs:731-749]`), mas é lixo alocado e faz `process.env.DATABASE_URL!` ser lido em tempo de import. A skill oficial do Prisma usa a factory.
3. **A atribuição ao global é incondicional.** Idêntica na prática a `globalForPrisma.prisma ??= prisma` — o `??` da linha anterior já garante que só há uma instância.

**Divergência consciente da skill:** a skill `prisma-client-api` mostra o mesmo padrão *com* a guarda `NODE_ENV !== 'production'`. Essa guarda existe porque a skill mira o caso genérico (Node puro, onde o cache de módulos do Node já basta e o global só serve contra HMR). Sob o modelo de múltiplas camadas de bundle do Next.js App Router, o cache de módulos do Node **não** basta. Remover a guarda é estritamente mais seguro e não tem downside conhecido: a única coisa que ela evita é "vazar" a referência num global em produção — o que é exatamente o que queremos. `[CITED: .agents/skills/prisma-client-api/references/constructor.md]` + `[VERIFIED: node_modules/next/dist/lib/constants.js:331-372]`

### Pattern 2: DAL de revalidação com `React.cache()` (INFRA-02)

**What:** uma função única, memoizada por request, que vai ao banco confirmar que a conta ainda existe e está ativa, e devolve `null` em qualquer caso de dúvida (inclusive erro de infraestrutura).

**When to use:** chamada por toda camada de auth do lado servidor. É o padrão que as docs do Next.js 16 chamam de Data Access Layer e recomendam invocar "in your data requests, Server Actions, Route Handlers". `[CITED: node_modules/next/dist/docs/01-app/02-guides/authentication.md:1173]`

**Example:**
```typescript
// lib/auth-guard.ts  (NOVO)
import { cache } from "react";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface ContaAtiva {
  usuarioId: string;
  empresaId: string;
  empresaSlug: string;
  email: string;
  role: UserRole;
}

/**
 * Confirma no banco que a conta do token ainda está ativa.
 *
 * Fail-closed (D-01): devolve `null` tanto para "não existe / inativa /
 * empresa removida" quanto para qualquer erro de banco. Quem chama nunca
 * autoriza um `null`.
 *
 * Deduplicada por request via React.cache (D-07): layout + page + componentes
 * do mesmo render compartilham UMA query.
 *
 * Ponto de extensão da Fase 2 (D-04): a avaliação de pagamento entra aqui,
 * lendo os campos de billing da Empresa. Hoje NÃO existe lógica de pagamento.
 */
export const revalidarConta = cache(
  async (usuarioId: string, empresaId: string): Promise<ContaAtiva | null> => {
    try {
      const usuario = await prisma.usuario.findFirst({
        where: {
          id: usuarioId,
          empresaId,            // isolamento multi-tenant (C-07)
          ativo: true,          // D-02
          empresa: {
            deletedAt: null,    // D-02
          },
        },
        select: {               // select explícito: nunca traz senhaHash (C-06)
          id: true,
          email: true,
          role: true,
          empresaId: true,
          empresa: {
            select: { slug: true },
          },
        },
      });

      if (!usuario) {
        return null;
      }

      return {
        usuarioId: usuario.id,
        empresaId: usuario.empresaId,
        empresaSlug: usuario.empresa.slug,
        email: usuario.email,
        role: usuario.role,
      };
    } catch (error) {
      // Fail-closed: erro de banco NÃO autoriza (D-01).
      console.error("[auth-guard] falha ao revalidar conta:", error);
      return null;
    }
  }
);
```

Por que **retornar `null`** em vez de lançar (área de discricionariedade do CONTEXT.md): os dois consumidores têm contratos de falha incompatíveis — `requireAdminSession` precisa chamar `redirect()` (que por si só **lança** `NEXT_REDIRECT`) e `requireAuth` precisa lançar `AuthError`. Um helper que lança forçaria cada chamador a embrulhar em `try/catch`, e um `try/catch` em volta de `redirect()` é justamente o erro que as docs do Next mandam evitar (§ Pitfall 5). Retornando `null`, o `try/catch` fica **inteiramente dentro** do helper e cada camada decide sua própria falha.

Por que **`findFirst` e não `findUnique`**: `findUnique` só aceita campos únicos no `where` e não aceita filtro relacional (`empresa: { deletedAt: null }`). `findFirst` aceita os dois e resolve em uma query. `[CITED: .agents/skills/prisma-client-api]`

### Pattern 3: integrar nas duas camadas de auth, com `redirect()` fora do `try`

```typescript
// lib/session.ts  (trechos editados)
import { revalidarConta } from "@/lib/auth-guard";

/**
 * Sessão verificada no banco, sem redirecionar. Use nas telas públicas que
 * precisam decidir "esse usuário já está logado?" — login e registro.
 * Devolver o payload aqui SEM revalidar recria o loop de redirect.
 */
export async function getVerifiedSession(): Promise<AuthTokenPayload | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const conta = await revalidarConta(session.sub, session.empresaId);

  return conta ? session : null;
}

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

  return session;
}
```

```typescript
// lib/api-auth.ts  (trecho editado)
import { revalidarConta } from "@/lib/auth-guard";

export async function requireAuth(request: Request): Promise<AuthTokenPayload> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new AuthError("Não autenticado.");
  }

  let payload: AuthTokenPayload;

  try {
    payload = await verifyAuthToken(token);
  } catch {
    throw new AuthError("Token inválido ou expirado.");
  }

  const conta = await revalidarConta(payload.sub, payload.empresaId);

  if (!conta) {
    // D-01: cobre conta inativa, empresa removida E erro de banco.
    throw new AuthError("Sessão inválida.", 401);
  }

  return payload;
}
```

Detalhes que o planner deve preservar:

- **Ordem em `requireAdminSession`:** só vai ao banco depois de o token ser válido *e* o slug bater. Um cookie forjado ou de outro tenant nunca gera query — evita usar a auth como vetor de carga no banco.
- **Comparar `conta.empresaSlug !== slug`:** cumpre D-03 ("comparar contra o token antes de autorizar") e fecha a janela do slug obsoleto. O slug **é mutável** (`UpdateEmpresaDTO.slug` em `app/services/empresa.service.ts:35`, exposto por `PATCH /api/empresas/[id]`), então um token de 7 dias pode carregar um slug que não existe mais.
- **O retorno continua sendo `AuthTokenPayload`**, não `ContaAtiva`. Trocar o tipo de retorno mudaria a assinatura consumida por ~40 call sites e violaria o critério de sucesso #4 (sem regressão). Se um consumidor futuro quiser os dados frescos, chama `revalidarConta` diretamente — sai de graça, pois o `React.cache` já tem o resultado no mesmo request.
- **Mensagem genérica no `AuthError`** — não distinguir "usuário inativo" de "empresa removida" de "banco fora do ar" na resposta ao cliente (C-04, e ASVS V3: não vazar estado da conta).

### Anti-Patterns to Avoid

- **Chamar Prisma no `proxy.ts`:** o Proxy roda no Edge e, segundo a doc do Next, "is meant to be invoked separately of your render code and in optimized cases deployed to your CDN"; a doc de auth é explícita: "avoid database checks to prevent performance issues" `[CITED: node_modules/next/dist/docs/01-app/02-guides/authentication.md:1031]`. Viola D-06.
- **Usar `unstable_cache` / `"use cache"` para a revalidação:** cache cross-request reintroduz a janela de staleness que a fase existe para fechar.
- **Chamar `destroySession()` dentro de `requireAdminSession`:** `cookies().delete()` só pode ser chamado em Server Function ou Route Handler `[CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:71-73]`. Chamado de um layout, lança. Ver § Pitfall 2.
- **Envolver `redirect()` em `try/catch`:** `redirect` lança `NEXT_REDIRECT`; a doc manda chamá-lo "outside the try block" `[CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:51-53]`.
- **Fazer duas queries (usuario + empresa) ou usar `include`:** dobra o custo por request; `include` no `Usuario` traz `senhaHash` (viola C-06).
- **Aumentar `max` do pool para "resolver" o INFRA-01:** mascara o bug e piora a exaustão no Postgres.
- **Criar uma abstração de "avaliação de acesso" agora:** proibido por D-04.
- **Mexer no generator do Prisma (`prisma-client-js` → `prisma-client`) ou no schema:** o schema atual não muda nesta fase; a migração de generator do Prisma 7 é churn não pedido e fora de escopo.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dedupe da revalidação dentro do request | Cache manual em `Map` + `AsyncLocalStorage` | `React.cache()` do `react` | Escopo de request já gerenciado pelo React/Next; é o padrão que a doc do Next prescreve para DAL. D-07 |
| Singleton de conexão | `Map` de clients por `DATABASE_URL`, ou "pool manager" | `globalThis` + factory (Pattern 1) | Padrão canônico do Prisma; qualquer coisa a mais reintroduz o bug por outro caminho |
| Pool de conexões Postgres | Contador/fila própria de conexões | `pg.Pool` via `@prisma/adapter-pg` | Já embutido; `max`, `idleTimeout`, `maxLifetime` e recuperação de erro já resolvidos |
| Verificação de JWT | Comparação manual de assinatura | `jose` (`lib/jwt.ts`, inalterado) | Já em uso e correto |
| Invalidação imediata de sessão | Denylist de tokens em memória / Redis | Revalidação no banco a cada request | O banco já é a fonte da verdade; denylist adiciona infra e um segundo estado a sincronizar |
| Fixture de conta ativa nos testes | Repetir o stub do `prismaMock` em 14 arquivos | Stub default em `tests/setup/prisma-mock.ts` + helper em `tests/helpers/auth.ts` | Um ponto de mudança; ver § Pitfall 3 |

**Key insight:** o valor desta fase está em **remover** código especial (a guarda de `NODE_ENV`) e em **centralizar** uma checagem em um lugar só. Toda solução customizada aqui — cache próprio, denylist, gerenciador de pool — aumenta a superfície de bug exatamente na camada onde um bug significa "empresa bloqueada continua usando" ou "empresa em dia é derrubada".

---

## Common Pitfalls

### Pitfall 1: Loop infinito de redirect entre o admin e a página de login (BLOQUEADOR)

**What goes wrong:** um usuário com `ativo = false` (ou cuja empresa tem `deletedAt` preenchido) mas com cookie JWT ainda válido entra num ping-pong `/{slug}/admin` ↔ `/{slug}/admin/login` até o browser abortar com `ERR_TOO_MANY_REDIRECTS`.

**Why it happens:** verificado no código atual —
- `app/[slug]/admin/(protected)/layout.tsx:15` chama `requireAdminSession(slug)`, que passará a redirecionar para `/{slug}/admin/login`;
- `app/[slug]/admin/login/page.tsx:13-17` faz `const session = await getSession(); if (session && session.empresaSlug === slug) redirect('/${slug}/admin')` — e `getSession()` só decodifica o JWT, **não** consulta o banco.

Resultado: layout manda para o login; o login vê um JWT válido e manda de volta para o admin; repete. Hoje isso não acontece porque o layout nunca rejeita um JWT válido — a fase cria a condição.

**How to avoid:** a guarda "já estou logado" das páginas públicas tem que usar a **mesma verdade** do layout. Trocar `getSession()` por `getVerifiedSession()` (Pattern 3) em:
- `app/[slug]/admin/login/page.tsx:13`
- `app/registro/page.tsx:8` (mesmo padrão: `if (session) redirect('/${session.empresaSlug}/admin')` → mandaria o usuário desativado para o admin, que rebate para o login)

Isso não é opcional nem cosmético — é uma tarefa obrigatória do plano, com verificação e2e própria.

**Warning signs:** `ERR_TOO_MANY_REDIRECTS`; testes Playwright estourando `navigationTimeout` de 30 s; loop de `GET /{slug}/admin` no log do dev server.

### Pitfall 2: `cookies().delete()` lança quando chamado de um Server Component

**What goes wrong:** a reação natural a "sessão revogada" é limpar o cookie antes de redirecionar. Chamado de dentro de `requireAdminSession` (que roda no layout/page), `destroySession()` lança em vez de limpar.

**Why it happens:** `[CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:71-73]` — "The `.delete` method can only be called: In a Server Function or Route Handler"; e mais adiante: "Setting cookies is not supported during Server Component rendering."

**How to avoid:** não tentar limpar o cookie em `requireAdminSession`. O cookie stale é inofensivo desde que **toda** superfície que o consome o revalide (Pitfall 1). Se em algum momento se quiser mesmo limpá-lo, o lugar é uma Server Action de logout ou um Route Handler — não o DAL. A Server Action `login` já existe (`app/[slug]/admin/_lib/auth-actions.ts`) e é um contexto onde isso seria legal.

**Warning signs:** erro em runtime "Cookies can only be modified in a Server Action or Route Handler" ao abrir qualquer página do admin.

### Pitfall 3: 14 arquivos de teste existentes quebram silenciosamente (regressão do critério #4)

**What goes wrong:** ao adicionar a query de revalidação, todo teste que hoje passa um Bearer token válido e espera 200 passa a receber 401; os testes de sucesso de `requireAdminSession` passam a lançar `REDIRECT:...`.

**Why it happens:** `tests/setup/prisma-mock.ts` instala `mockDeep<PrismaClient>()` globalmente e roda `mockReset(prismaMock)` em cada `beforeEach`. Um mock resetado devolve `undefined` de `prisma.usuario.findFirst` → `revalidarConta` retorna `null` → fail-closed. Arquivos afetados (verificado por grep de `buildAuthToken|Bearer` em `*.test.ts`):

```
app/api/combos/route.test.ts            app/api/combos/[id]/route.test.ts
app/api/empresas/route.test.ts          app/api/empresas/[id]/route.test.ts
app/api/movimentacoes/route.test.ts     app/api/movimentacoes/[id]/route.test.ts
app/api/produtos/route.test.ts          app/api/produtos/[id]/route.test.ts
app/api/promocoes/route.test.ts         app/api/promocoes/[id]/route.test.ts
app/api/usuarios/route.test.ts          app/api/usuarios/[id]/route.test.ts
lib/api-auth.test.ts                    (+ lib/session.test.ts, 3 asserts de sucesso)
```

**How to avoid:** stub default de "conta ativa" no próprio setup, aplicado **depois** do `mockReset` no mesmo `beforeEach`, casado com o `testAuthPayload` já existente em `tests/helpers/auth.ts` (`sub: "user-1"`, `empresaId: "empresa-1"`, `empresaSlug: "empresa-teste"`):

```typescript
// tests/setup/prisma-mock.ts  (adição ao beforeEach existente)
beforeEach(() => {
  mockReset(prismaMock);

  // Default: a conta do testAuthPayload existe e está ativa.
  // Testes do caminho revogado sobrescrevem com mockResolvedValue(null).
  prismaMock.usuario.findFirst.mockResolvedValue({
    id: "user-1",
    email: "admin@teste.com",
    role: "ADMIN",
    empresaId: "empresa-1",
    empresa: { slug: "empresa-teste" },
  } as never);
});
```

Cuidado com a ordem: se o stub for para um `beforeEach` de outro arquivo registrado antes, o `mockReset` o apaga. Manter no mesmo bloco, logo após o reset.

**Warning signs:** dezenas de testes falhando com 401 depois de uma mudança que "só mexeu em auth"; `npm run test:coverage` vermelho no CI (`.github/workflows/tests.yml`).

### Pitfall 4: assumir que o mecanismo descrito no CONCERNS.md é literal

**What goes wrong:** o plano (ou a verificação) tenta provar que "cada import cria um PrismaClient" e não consegue, porque não é isso que acontece — e daí conclui que o bug não existe e pula o fix.

**Why it happens:** `CONCERNS.md` diz "every module that imports `lib/prisma.ts` creates a NEW PrismaClient instance". O cache de módulos do Node/webpack impede isso **dentro de uma mesma camada de bundle**. O mecanismo real é outro: o Next.js 16 compila o servidor em camadas separadas — `rsc`, `ssr`, `api-node`, `api-edge`, `action-browser`, `instrument`, `middleware`, `shared` `[VERIFIED: node_modules/next/dist/lib/constants.js:331-372]` — e módulos em camadas diferentes são instâncias distintas em runtime. `lib/prisma.ts` é importado de Server Components/Actions **e** de todas as rotas `app/api/*`, ou seja, de pelo menos duas camadas. Some-se a isso o serverless (cada instância de lambda é um processo novo) e o worker/webhooks das Fases 3 e 5, que multiplicam pontos de entrada.

**How to avoid:** manter o fix (ele é correto e barato), e **corrigir a redação do CONCERNS.md** no plano para descrever o mecanismo real — senão a próxima pessoa que auditar vai "desmentir" o bug. O critério de sucesso #1 do roadmap ("contagem de conexões do Postgres permanece estável sob carga repetida") continua sendo a verificação certa.

**Warning signs:** revisor argumentando "Node já cacheia módulos, isso não é bug"; PR revertendo o fix.

### Pitfall 5: `try/catch` largo demais engolindo o `NEXT_REDIRECT`

**What goes wrong:** ao escrever o caminho fail-closed, envolve-se a revalidação *e* o `redirect()` no mesmo `try`. O `catch` engole o `NEXT_REDIRECT` e a página renderiza normalmente — o usuário revogado passa. Silenciosamente.

**Why it happens:** `redirect()` sinaliza via exceção `[CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:51-62]`.

**How to avoid:** o único `try/catch` da fase mora **dentro** de `revalidarConta` (Pattern 2), em volta apenas da chamada Prisma. Nem `session.ts` nem `api-auth.ts` ganham `try/catch` novo. Bom teste de revisão: `grep -c "try {" lib/session.ts` deve continuar em 0.

**Warning signs:** o teste "usuário desativado é redirecionado" passa quando esperava rejeitar; página do admin renderizando para conta inativa.

### Pitfall 6: `React.cache()` não memoiza fora do render — não teste o dedupe com Vitest

**What goes wrong:** escreve-se um teste "duas chamadas a `revalidarConta` = 1 query" e ele falha, levando à conclusão errada de que o `cache()` foi mal aplicado.

**Why it happens:** verificado empiricamente nesta sessão — sob as condições de resolução default (o build cliente do React, que é o que o Vitest carrega), `cache(fn)` é **passthrough**: 3 chamadas → 3 execuções `[VERIFIED: node -e "const {cache}=require('react') ..." → calls=3]`. A memoização só existe sob a condição de export `react-server`, com o dispatcher de cache que o Next monta durante o render no servidor.

**How to avoid:** não escrever asserção de dedupe em Vitest. Trate o `cache()` como um wrapper cuja correção vem de seguir o padrão documentado. Se quiser evidência de D-07, ela é observacional (contagem de queries num render real de dev, com `log: ['query']`) e cabe melhor num check manual de VERIFICATION do que num teste unitário. Lado bom: como o `cache()` é transparente nos testes, cada chamada bate no `prismaMock` de forma previsível.

**Warning signs:** teste de "1 query por request" falhando com 2; tentativa de configurar `resolve.conditions: ['react-server']` no Vitest (não faça — quebra os testes de componente com jsdom).

### Pitfall 7: DB fora do ar derruba todo mundo (consequência aceita de D-01)

**What goes wrong:** uma indisponibilidade momentânea do Postgres passa a expulsar todos os admins logados e a devolver 401 em todas as rotas de API. Antes desta fase, requests que não tocavam o banco sobreviviam.

**Why it happens:** é exatamente o que D-01 pede (fail-closed) — decisão travada, não um bug.

**How to avoid (mitigar, não reverter):** logar o erro com `console.error` distinguindo "conta inválida" de "falha de infraestrutura" (o cliente recebe a mesma mensagem genérica, mas o log permite diagnosticar). Registrar no VERIFICATION que 401 em massa após esta fase pode significar banco fora do ar, não sessões revogadas. Nota para a decisão de hosting: com Vercel + pooler (Neon/Supabase), usar a URL **pooled** em `DATABASE_URL` reduz a chance de o pool ser a causa `[CITED: .planning/research/STACK.md § Recomendação de hosting]`.

**Warning signs:** pico de 401/redirects correlacionado com métricas do banco, não com desativação de contas.

### Pitfall 8: login que autentica quem a revalidação depois rejeita

**What goes wrong:** `app/api/auth/login/route.ts:24` checa `!usuario || !usuario.ativo` — mas **não** checa `empresa.deletedAt`. Um usuário ativo de uma empresa removida consegue fazer login e recebe um token que a revalidação vai rejeitar no request seguinte.

**Why it happens:** as duas checagens nasceram em momentos diferentes; a de `deletedAt` só passa a existir agora.

**How to avoid:** não é obrigatório para atender INFRA-01/INFRA-02 (o fluxo termina "seguro" — o usuário simplesmente não entra), mas produz UX ruim ("login com sucesso" seguido de bounce para o login). Alinhar a condição do login com a do DAL é uma edição de uma linha. **Recomendação:** incluir como tarefa pequena e explícita, ou registrar como dívida conhecida — não deixar implícito. O mesmo vale para a Server Action `login` em `app/[slug]/admin/_lib/auth-actions.ts`, que precisa da mesma coerência.

**Warning signs:** e2e de login "verde" com asserção de URL que na verdade caiu no login de novo.

---

## Code Examples

### Verificar contagem de conexões do Postgres (critério de sucesso #1)

```sql
-- Antes e depois do fix, sob carga repetida.
-- Espera-se: número estável, limitado pelo max do pool (10 por client).
SELECT count(*) AS conexoes, application_name, state
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY application_name, state
ORDER BY conexoes DESC;
```

### Teste do singleton — **provado viável nesta sessão**

O `tests/setup/vitest.setup.ts` mocka `@/lib/prisma` para todos os arquivos de teste, o que à primeira vista impediria testar o módulo real. Foi verificado empiricamente que `vi.unmock("@/lib/prisma")` desfaz o mock global, que o `PrismaClient` real é construído sem tocar no banco (o `pg.Pool` é lazy) e que **o teste falha com o código de hoje e passa com o fix**:

```
probe sob NODE_ENV=production, com o código ATUAL de lib/prisma.ts:
  { isRealClient: true, globalSet: false, sameInstance: false }
```

`[VERIFIED: execução de vitest nesta sessão em arquivo temporário, removido em seguida]`

```typescript
// lib/prisma.test.ts  (NOVO)
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// Desfaz o mock global instalado por tests/setup/prisma-mock.ts.
vi.unmock("@/lib/prisma");

describe("prisma singleton", () => {
  afterEach(() => {
    delete (globalThis as { prisma?: unknown }).prisma;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reaproveita a mesma instância entre reavaliações do módulo em produção", async () => {
    delete (globalThis as { prisma?: unknown }).prisma;
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");

    const primeiro = await import("@/lib/prisma");
    vi.resetModules();
    const segundo = await import("@/lib/prisma");

    // Falha hoje (sameInstance: false); passa após remover a guarda de NODE_ENV.
    expect(segundo.prisma).toBe(primeiro.prisma);
  });

  it("publica o client no globalThis em produção", async () => {
    delete (globalThis as { prisma?: unknown }).prisma;
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");

    await import("@/lib/prisma");

    expect((globalThis as { prisma?: unknown }).prisma).toBeDefined();
  });
});
```

Notas de implementação verificadas: (a) `delete globalThis.prisma` antes de cada caso é obrigatório, senão o segundo teste herda o global do primeiro; (b) não asserte sobre `constructor.name` — o build do Prisma é minificado e devolve `"t"`; (c) `DATABASE_URL` já é definido em `tests/setup/vitest.setup.ts`, e nenhuma conexão real é aberta.

### Teste do DAL de revalidação

```typescript
// lib/auth-guard.test.ts  (NOVO)
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/tests/setup/prisma-mock";
import { revalidarConta } from "./auth-guard";

const contaAtiva = {
  id: "user-1",
  email: "admin@teste.com",
  role: "ADMIN",
  empresaId: "empresa-1",
  empresa: { slug: "empresa-teste" },
};

describe("revalidarConta", () => {
  it("devolve a conta quando usuário está ativo e empresa não foi removida", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await expect(revalidarConta("user-1", "empresa-1")).resolves.toMatchObject({
      usuarioId: "user-1",
      empresaSlug: "empresa-teste",
    });
  });

  it("filtra por ativo, deletedAt e empresaId na query", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await revalidarConta("user-1", "empresa-1");

    expect(prismaMock.usuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "user-1",
          empresaId: "empresa-1",
          ativo: true,
          empresa: { deletedAt: null },
        },
      })
    );
  });

  it("devolve null quando o banco não encontra conta ativa", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);

    await expect(revalidarConta("user-1", "empresa-1")).resolves.toBeNull();
  });

  it("devolve null (fail-closed) quando a query lança", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.usuario.findFirst.mockRejectedValue(new Error("connection timeout") as never);

    await expect(revalidarConta("user-1", "empresa-1")).resolves.toBeNull();
  });

  it("nunca seleciona senhaHash", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await revalidarConta("user-1", "empresa-1");

    const [args] = prismaMock.usuario.findFirst.mock.calls[0] as [{ select: Record<string, unknown> }];
    expect(args.select).not.toHaveProperty("senhaHash");
  });
});
```

Como o `prismaMock` faz `mockReset` a cada `beforeEach`, cada caso estabelece o seu próprio comportamento — o stub default do § Pitfall 3 é sobrescrito sem conflito.

---

## Runtime State Inventory

Esta não é uma fase de rename, mas altera **comportamento de auth em runtime**. O inventário abaixo cobre o que existe fora do repositório e é afetado.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `Usuario.ativo` e `Empresa.deletedAt` já existem no schema `[VERIFIED: prisma/schema.prisma:44,62]`. **Nenhuma migration** é necessária. `@@unique([empresaId])` em `Usuario` garante 1 admin por empresa — a query de revalidação por `(id, empresaId)` é inequívoca | nenhuma migração de dados |
| Live service config | Nenhum serviço externo participa desta fase (gateway/webhook só a partir da Fase 3) | nenhuma |
| OS-registered state | Nenhum cron, task scheduler ou processo registrado ainda (worker é Fase 5) | nenhuma |
| Secrets/env vars | `DATABASE_URL` e `JWT_SECRET` já existem e **não mudam de nome**. `DATABASE_URL` passa a ser lido dentro da factory em vez de no topo do módulo — mesma variável, mesmo valor. Se o hosting for Vercel, `STACK.md` recomenda `DATABASE_URL` *pooled* + `DIRECT_URL` para migrations; **decisão da fase de deploy**, não desta | nenhuma nesta fase |
| Build artifacts | `node_modules/.prisma` / cliente gerado: **não** é regenerado por esta fase (schema inalterado); o CI já roda `npx prisma generate`. Cache do `.next/`: o fix do singleton só vale a partir de um novo build/deploy | nova build/deploy |
| **Sessões vivas (específico desta fase)** | Todo JWT de 7 dias já emitido continua válido em assinatura. Após o deploy, cada um passa a ser revalidado no banco no primeiro request. Contas ativas: sem diferença perceptível. Contas inativas/empresas removidas: derrubadas na hora — **esse é o objetivo** (critério #3) | comunicar no deploy; validar em staging antes |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` fazendo auth completa | `proxy.ts` com checagem **otimista** + DAL no servidor | Next.js 16 (arquivo renomeado; `middleware.ts` deprecado) | D-06: `proxy.ts` permanece sem Prisma; a verdade mora em `session.ts`/`api-auth.ts` `[CITED: docs empacotadas 16.3.0 + .planning/research/STACK.md]` |
| Auth checada só na borda | "The majority of security checks should be performed as close as possible to your data source" — DAL | Guia de auth do Next.js App Router | Justifica textualmente a arquitetura do INFRA-02 `[CITED: authentication.md:1119]` |
| `PrismaClient` conectando direto ao banco | Driver adapter obrigatório (`@prisma/adapter-pg`) | Prisma 7 | Já adotado; o `pg.Pool` agora é criado pelo **adapter**, então cada `PrismaClient` duplicado custa um pool inteiro |
| `cookies()` síncrono | `cookies()` assíncrono (`await`) | Next.js 15 | O código já usa `await cookies()` — nada a mudar |

**Deprecated/outdated:**
- `middleware.ts` como nome de arquivo: substituído por `proxy.ts` (o projeto já migrou).
- Guarda `NODE_ENV !== "production"` no singleton do Prisma sob Next.js App Router: continua sendo o que a maioria dos exemplos mostra (inclusive a skill local do Prisma), mas é inadequada ao modelo multi-camadas do Next — ver § Pitfall 4.
- Generator `prisma-client-js` (usado no `schema.prisma`): sucedido por `prisma-client` com `output` explícito no Prisma 7. **Fora de escopo** — não tocar nesta fase.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Camadas webpack distintas do Next.js 16 (`rsc` vs `api-node`) produzem **instâncias de módulo separadas em runtime**, e é esse o mecanismo real do INFRA-01. Os *nomes* das camadas estão verificados no código do Next; a consequência em runtime é inferida do modelo de layers do webpack, não medida | Summary, Pitfall 4 | Baixo. Se estiver errado, o fix continua correto e necessário (HMR em dev, serverless, `instrumentation.ts`) — só a *explicação* precisaria ser ajustada. Uma medição direta (contar `PrismaClient` construídos num `next build && next start` sob carga mista de página + rota de API) resolve, e cabe no VERIFICATION |
| A2 | `React.cache()` deduplica dentro de Route Handlers (camada `api-node`), não só no render de Server Components. As docs listam Route Handlers como local de invocação do DAL, mas não prometem memoização explicitamente | Pattern 2, D-07 | Muito baixo. `requireAuth` é chamada **uma vez** por handler — mesmo sem dedupe, é 1 query por request |
| A3 | O stub default no `tests/setup/prisma-mock.ts` mantém os 14 arquivos de teste existentes verdes sem editá-los individualmente. A lista de arquivos e o mecanismo do `mockReset` estão verificados; o resultado agregado não foi executado | Pitfall 3 | Médio. Se algum teste afirmar sobre `prisma.usuario.findFirst` para outro fim, o stub interfere. Detectável em segundos com `npm test`; a saída é stub por arquivo em vez de global |
| A4 | Comparar `conta.empresaSlug !== slug` (slug fresco do banco) não quebra nenhum fluxo existente. O slug **é** mutável, e a troca de slug já força re-login hoje pela comparação token-vs-URL | Pattern 3 | Baixo. Se quebrar, remover essa comparação e manter só `!conta` ainda satisfaz D-02/D-03 |
| A5 | Nenhum consumidor depende de `requireAdminSession`/`requireAuth` **nunca** tocarem o banco (ex.: rota que precise responder com o Postgres fora do ar) | Pitfall 7 | Baixo — é o que D-01 pede explicitamente |

---

## Open Questions

1. **O texto do INFRA-02 fala em "status de pagamento", que não existe nesta fase**
   - O que sabemos: D-02/D-04 limitam a checagem a `ativo`/`deletedAt`; os campos de billing só chegam na Fase 2.
   - O que não está claro: como o verificador marca INFRA-02 como atendido sem campos de pagamento.
   - Recomendação: o planner declara explicitamente que INFRA-02 é atendido pela **infraestrutura** de revalidação, e registra em STATE.md que a Fase 2 deve reabrir o requisito para plugar `avaliarAcesso` no mesmo helper (D-04). Não inventar campos de pagamento agora.

2. **Corrigir o `CONCERNS.md` faz parte desta fase?**
   - O que sabemos: a redação atual descreve um mecanismo que não se sustenta (§ Pitfall 4); a conclusão e a prioridade continuam válidas.
   - Recomendação: incluir uma edição de documentação de baixo custo no plano, corrigindo o mecanismo e mantendo a severidade. Evita que um revisor futuro reverta o fix.

3. **Login deve checar `empresa.deletedAt` (Pitfall 8)?**
   - O que sabemos: é uma linha; não é estritamente necessário para INFRA-01/INFRA-02; melhora a UX e alinha login com o DAL.
   - Recomendação: incluir como tarefa pequena e explícita. Se o planner preferir escopo mínimo, registrar como dívida conhecida em STATE.md — nunca deixar implícito.

4. **Verificação do critério #1 ("conexões estáveis sob carga") é automatizável?**
   - O que sabemos: o teste unitário prova o singleton *por processo*; contagem de conexões precisa de app rodando + Postgres + geração de carga.
   - Recomendação: teste unitário como gate automatizado + um `checkpoint:human-verify` no fim da fase com a query de `pg_stat_activity` acima, executada antes e depois de exercitar admin e rotas de API. Não construir harness de carga para uma correção de 3 linhas.

5. **`max` do pool com worker + webhooks (Fases 3 e 5)**
   - O que sabemos: default é 10 por pool `[VERIFIED: pg-pool/index.js:89]`; a fase corrige a *multiplicação* de pools, não dimensiona o pool.
   - Recomendação: fora de escopo aqui. Anotar como entrada da fase de deploy/hosting — dimensionar `max` (e usar pooler se for serverless) quando worker e webhook existirem.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test | ✓ | v22 (CI); local presume igual | — |
| npm + `node_modules` instalado | tudo | ✓ | lockfile presente, deps resolvidas | — |
| `@prisma/client` / `@prisma/adapter-pg` / `pg` | INFRA-01 | ✓ | 7.9.1 / 7.9.1 / 8.22.0 | — |
| `react` (export `cache`) | INFRA-02 | ✓ | 19.2.8 | — |
| Vitest + `vitest-mock-extended` + setup do `prismaMock` | testes unitários | ✓ | 4.1.10 / 5.1.1 | — |
| Playwright (Chromium) | regressão e2e (critério #4) | ✓ (configurado; `webServer` sobe `next dev` na porta 3100) | 1.62.1 | Se o browser não estiver baixado: `npx playwright install chromium` |
| PostgreSQL rodando localmente | e2e + verificação de `pg_stat_activity` | ✗ **não verificado** nesta sessão (política proíbe ler `.env`; nenhum `pg_isready` executado) | — | Testes unitários **não** precisam de banco (pool é lazy, Prisma é mockado). O CI já provisiona `postgres:16` como service para o job e2e |

**Missing dependencies with no fallback:** nenhuma.

**Missing dependencies with fallback:**
- Postgres local: se indisponível na máquina do dev, o gate automatizado (Vitest) roda mesmo assim; e2e e a contagem de conexões ficam para o CI ou para um `checkpoint:human-verify`. O planner **não deve** assumir que existe um Postgres local rodando.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (`jsdom` default; arquivos de auth usam `// @vitest-environment node`) + Playwright 1.62.1 para e2e |
| Config file | `vitest.config.mts` (setup: `tests/setup/vitest.setup.ts` → importa `tests/setup/prisma-mock.ts`); `playwright.config.ts` |
| Quick run command | `npx vitest run lib/` |
| Full suite command | `npm test` (unit/componente) e `npm run test:e2e` (Playwright; exige Postgres) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Reavaliar o módulo sob `NODE_ENV=production` devolve a mesma instância | unit | `npx vitest run lib/prisma.test.ts` | ❌ Wave 0 |
| INFRA-01 | Client é publicado em `globalThis` em produção | unit | `npx vitest run lib/prisma.test.ts` | ❌ Wave 0 |
| INFRA-01 | Conexões do Postgres estáveis sob carga repetida (critério #1) | manual | query `pg_stat_activity` acima, antes/depois de exercitar admin + API | ❌ `checkpoint:human-verify` |
| INFRA-02 | Conta ativa + empresa viva → revalidação aprova | unit | `npx vitest run lib/auth-guard.test.ts` | ❌ Wave 0 |
| INFRA-02 | `ativo=false` ou `deletedAt` preenchido → `null` (critério #3) | unit | `npx vitest run lib/auth-guard.test.ts` | ❌ Wave 0 |
| INFRA-02 | Erro de banco → `null` (fail-closed, D-01) | unit | `npx vitest run lib/auth-guard.test.ts` | ❌ Wave 0 |
| INFRA-02 | Query filtra por `empresaId` e nunca seleciona `senhaHash` | unit | `npx vitest run lib/auth-guard.test.ts` | ❌ Wave 0 |
| INFRA-02 | `requireAdminSession` redireciona quando o banco rejeita | unit | `npx vitest run lib/session.test.ts` | ⚠️ existe — estender |
| INFRA-02 | `requireAuth` lança `AuthError` 401 quando o banco rejeita | unit | `npx vitest run lib/api-auth.test.ts` | ⚠️ existe — estender |
| INFRA-02 | Mudança no banco vale no request seguinte, sem novo login (critério #2) | integration | `npx vitest run lib/session.test.ts lib/api-auth.test.ts` (troca do stub entre chamadas) | ⚠️ existe — estender |
| INFRA-02 | Página de login **não** devolve conta revogada ao admin (anti-loop, § Pitfall 1) | e2e | `npx playwright test e2e/` (novo spec) | ❌ Wave 0 |
| Critério #4 | Nenhuma regressão em admin / registro / catálogo público | e2e + unit | `npm test && npm run test:e2e` | ✅ suíte existente (`e2e/*.spec.ts`, 39 arquivos de teste unitário) |

### Sampling Rate

- **Per task commit:** `npx vitest run lib/` (rápido, sem banco)
- **Per wave merge:** `npm test` (a suíte inteira — é onde o § Pitfall 3 aparece)
- **Phase gate:** `npm run lint && npm test && npm run test:e2e` verdes + `checkpoint:human-verify` da contagem de conexões antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `lib/prisma.test.ts` — cobre INFRA-01 (padrão de `vi.unmock` + `vi.resetModules` **já validado** nesta pesquisa)
- [ ] `lib/auth-guard.test.ts` — cobre INFRA-02 (conta ativa, revogada, erro de banco, forma da query, ausência de `senhaHash`)
- [ ] `tests/setup/prisma-mock.ts` — stub default de conta ativa após o `mockReset` (**pré-requisito** para os 14 arquivos existentes seguirem verdes)
- [ ] `e2e/sessao-revogada.spec.ts` (nome sugerido) — desativa a conta direto no banco e prova (a) perda de acesso ao admin no request seguinte e (b) **ausência de loop de redirect** na página de login
- [ ] Casos novos em `lib/session.test.ts` e `lib/api-auth.test.ts` para os caminhos revogado e erro-de-banco

Instalação de framework: nenhuma — Vitest e Playwright já estão configurados e rodando no CI.

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`. Esta fase é, na prática, uma fase de segurança: fecha uma janela de autorização de 7 dias.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | parcial | Login inalterado (bcrypt + `jose`). Único ponto tocado: coerência da checagem de conta no login (§ Pitfall 8) |
| V3 Session Management | **sim — núcleo da fase** | Sessão passa a ser revalidada contra o banco a cada request; revogação passa a ter efeito imediato (ASVS 3.3.x: terminação de sessão). Cookie continua `httpOnly` + `sameSite=lax` + `secure` em produção — inalterado |
| V4 Access Control | **sim** | Fail-closed por default (D-01); isolamento multi-tenant reforçado ao filtrar por `id` **e** `empresaId` na revalidação (C-07); defesa em profundidade: Proxy otimista + DAL autoritativo |
| V5 Input Validation | não (nesta fase) | Os inputs do DAL vêm de um JWT já verificado, não do usuário. Nenhum endpoint novo, nenhum body novo |
| V6 Cryptography | não | Nenhuma mudança em `lib/jwt.ts`; nada de cripto artesanal |
| V7 Error Handling & Logging | **sim** | `console.error` no servidor com o erro real; mensagem genérica ao cliente (C-04). Não distinguir "inativo" de "inexistente" na resposta |
| V8 Data Protection | **sim** | `select` explícito garante que `senhaHash` nunca sai do banco na revalidação (C-06) — asserção de teste dedicada |

### Known Threat Patterns for Next.js 16 + Prisma 7 + JWT

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token válido de conta já revogada (a janela de 7 dias) | Elevation of Privilege | Revalidação no banco a cada request — **o objetivo desta fase** |
| Confiar apenas na checagem da borda (Proxy/middleware) | Elevation of Privilege | DAL no servidor como autoridade; Proxy é só otimista (D-06) `[CITED: authentication.md:1119]` |
| Fail-open em erro de infraestrutura | Elevation of Privilege | `catch` → `null` → negar (D-01) |
| Cross-tenant: token de uma empresa autorizando em outra | Elevation of Privilege | Filtro composto `id` + `empresaId`; comparação de slug token↔URL↔banco |
| Vazamento de `senhaHash` por `select`/`include` amplo | Information Disclosure | `select` explícito + teste que proíbe `senhaHash` |
| Enumeração de contas por mensagens de erro distintas | Information Disclosure | Mensagem única para inativo / inexistente / erro |
| Exaustão do pool de conexões (DoS, inclusive acidental) | Denial of Service | Singleton do Prisma (INFRA-01) + 1 query por request via `React.cache` (D-07) |
| Auth virando vetor de carga no banco | Denial of Service | Só consultar o banco depois de assinatura de JWT válida **e** slug batendo |
| Cache cross-request de decisão de auth | Elevation of Privilege | Proibido `unstable_cache`/`"use cache"`; só `React.cache` (escopo de request) |

---

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (Next.js **16.3.0**, versão exata instalada) — DAL, `React.cache`, checagens otimistas no Proxy, "checks as close as possible to your data source" (linhas 1024-1231)
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:71-73` — `.delete` só em Server Function/Route Handler
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:51-62` — `redirect()` fora do bloco `try`
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md:544-588` — `React.cache` é escopo de request, sem compartilhamento entre requests
- `node_modules/next/dist/lib/constants.js:331-372` — nomes das camadas webpack (`rsc`, `ssr`, `api-node`, `api-edge`, `action-browser`, `instrument`, `middleware`, `shared`)
- `.agents/skills/prisma-client-api/references/constructor.md` (skill local do projeto) — Singleton Pattern e Next.js Pattern oficiais do Prisma com driver adapter
- `node_modules/@prisma/adapter-pg/dist/index.mjs:731-772` — `PrismaPgAdapterFactory`: `pg.Pool` criado dentro de `connect()` (lazy), não no construtor
- `node_modules/pg-pool/index.js:89` — `max` default = 10
- Execução direta nesta sessão: `node -e "const {cache}=require('react')..."` → `cache()` é passthrough fora do render (3 chamadas, 3 execuções); probe Vitest → sob `NODE_ENV=production` o código atual dá `sameInstance: false` e `globalSet: false`
- Código-fonte do projeto: `lib/prisma.ts`, `lib/session.ts`, `lib/api-auth.ts`, `lib/jwt.ts`, `proxy.ts`, `prisma/schema.prisma`, `app/[slug]/admin/login/page.tsx`, `app/registro/page.tsx`, `app/api/auth/login/route.ts`, `app/services/empresa.service.ts`, `app/[slug]/_lib/empresa.ts`, `tests/setup/*`, `tests/helpers/*`, `vitest.config.mts`, `playwright.config.ts`, `.github/workflows/tests.yml`, `package.json`
- `gsd-tools query package-legitimacy check --ecosystem npm server-only`

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` — recomendação de hosting, anti-padrão do `middleware.ts`/`proxy.ts`, pré-requisito do singleton antes de serverless
- `.planning/codebase/CONCERNS.md` § Prisma Client Singleton Misconfiguration — conclusão e prioridade corretas; mecanismo descrito de forma imprecisa (§ Pitfall 4)

### Tertiary (LOW confidence)
- Nenhuma. Nenhum resultado de busca web foi usado: todas as fontes autoritativas necessárias estavam disponíveis localmente e casadas com as versões instaladas (`brave_search`, `exa_search` e `firecrawl` estão desabilitados em `.planning/config.json`).

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — nenhuma dependência nova; todas as versões lidas de `package.json` e confirmadas em `node_modules/`
- Architecture: **HIGH** — os dois padrões vêm de fontes autoritativas casadas com a versão instalada (docs empacotadas do Next 16.3.0; skill local do Prisma). A única inferência é o mecanismo de duplicação por camada (A1), que não altera o fix
- Pitfalls: **HIGH** — Pitfalls 1, 2, 3, 5, 6, 8 verificados diretamente no código do projeto, nas docs empacotadas ou por execução nesta sessão. Pitfall 4 é parcialmente inferido (A1); Pitfall 7 é consequência direta de D-01
- Test strategy: **HIGH** — a viabilidade do teste do singleton foi provada executando Vitest nesta sessão, não assumida

**Research date:** 2026-08-31
**Valid until:** 2026-09-30 (30 dias — stack estável e travada por lockfile; revalidar se `next` ou `@prisma/client` subirem de minor)
