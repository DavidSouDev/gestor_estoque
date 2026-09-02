# Phase 6: Termos de Uso e Aceite - Research

**Researched:** 2026-09-02
**Domain:** Autorização por papel (RBAC de 2 valores), versionamento imutável de documento legal, gate de sessão em Next.js App Router
**Confidence:** HIGH (quase tudo verificável contra o próprio repositório; a única área MEDIUM/LOW é retenção legal de prova de consentimento)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Papel SUPERADMIN e modelo de dados**
- **D-01:** `Usuario` hoje exige `empresaId` obrigatório e é único por empresa (`@@unique([empresaId])`) — não existe conceito de usuário "sem empresa" no schema atual. O papel `SUPERADMIN` **não** força mudança nesse modelo: uma empresa interna/dedicada da plataforma é criada (seed, direto no banco — mesmo espírito de `acessoVitalicio` hoje, sem UI) e o usuário `SUPERADMIN` é um `Usuario` normal dentro dela, com `role: SUPERADMIN`. Login segue o fluxo padrão (`/{slug-interno}/admin/login`), sem rota nova de autenticação.
- **D-02:** A empresa interna que hospeda o `SUPERADMIN` recebe `acessoVitalicio: true` no seed — do contrário ela teria trial/carência/bloqueio como qualquer tenant normal, e o próprio superadmin ficaria bloqueado por "falta de pagamento" fictícia. Nenhuma lógica nova: reaproveita o campo que já tem precedência absoluta em `avaliarAcesso` (Fase 2, D-03).
- **D-03:** O `SUPERADMIN` fica **isento** do gate obrigatório de aceite de termos (TERM-04/D-08 abaixo). Isso exige um caso especial explícito no código do gate (checar `role === SUPERADMIN` e pular), documentado como tal — não é a regra geral silenciosamente ignorada.

**Publicação de termos (TERM-02) — só API, sem UI**
- **D-04:** Esta fase constrói **apenas o endpoint** de publicação (`POST` ou similar, protegido por `role: SUPERADMIN`) — nenhuma tela de admin para escrever/editar o texto. Mesmo padrão de `acessoVitalicio`: quem publica usa curl/Postman/script.
- **D-05:** O conteúdo do termo é **texto puro** (string simples), não Markdown/HTML. Renderizado preservando quebras de linha (`white-space: pre-wrap`). Evita risco de XSS por HTML não sanitizado e não introduz dependência nova de parser/renderer de Markdown no projeto.
- **D-06:** Um `ADMIN` comum (de qualquer empresa) que tentar chamar o endpoint de publicação recebe negação — consistente com o critério de sucesso #2 do roadmap. Segue o padrão de erro já estabelecido (`AuthError`/`HttpError` com `.status`), sem novo formato de resposta.

**Versionamento imutável (TERM-03)**
- **D-07:** Cada publicação cria uma **nova linha** imutável (nunca `UPDATE` numa versão existente) — a versão vigente é a mais recente por data de publicação. Cada aceite (`Usuario` × versão) fica registrado com data/hora, análogo ao padrão de auditoria já usado em `AuditoriaAcesso` (Fase 2): tabela de fatos, nunca reescrita.

**Gate obrigatório no admin (TERM-04)**
- **D-08:** Segue o **mesmo padrão estabelecido na Fase 4** para bloqueio total: `requireAdminSession` (ou ponto equivalente) faz o `redirect()` para uma rota dedicada (ex: `/{slug}/admin/aceitar-termos`) quando `role !== SUPERADMIN` e o último aceite do usuário é anterior à versão vigente — **não** um modal client-side sobreposto na página. A rota dedicada fica **fora** do grupo `(protected)`.
- **D-09:** A rota dedicada de aceite tem: o texto completo da versão vigente, um botão de aceitar (Server Action que grava o aceite e redireciona de volta para o admin) e uma opção de logout — para o usuário não ficar preso sem conseguir sair.
- **D-10:** Depois de aceitar, o usuário volta para o admin (home ou a página que estava tentando acessar — decisão de implementação do planner, sem preferência forte do usuário).

**Fluxo de registro (TERM-01)**
- **D-11:** Checkbox obrigatório "Li e aceito os Termos de Uso" no formulário de `/registro` (mesmo componente `RegisterForm`), com um link ou modal que mostra o texto completo da versão vigente sem sair da tela. Sem aceite marcado, o registro não é submetido (validação client-side) e o backend também recusa.
- **D-12:** O aceite registrado no registro é contra a versão vigente **no momento do cadastro** — se não houver nenhuma versão de termos publicada ainda (banco vazio), é uma condição de borda que o planner/pesquisa precisa resolver. **Não decidido na discussão — resolvido nesta pesquisa (ver `## Decisão da Borda "Banco Sem Termos"`).**

### Claude's Discretion
- Nome exato do endpoint de publicação (ex: `POST /api/termos`) e da tabela/modelo Prisma (`Termo`/`TermoDeUso`, `AceiteTermos`) — seguir convenção já usada (`Empresa`, `AuditoriaAcesso`).
- Exato shape do texto do link/modal no registro (D-11) — componente novo vs. reaproveitar algum padrão existente de modal, se houver.
- Onde exatamente a checagem de aceite pendente entra no fluxo de sessão (dentro de `requireAdminSession` vs. um wrapper novo) — desde que a rota dedicada (D-08) fique fora do grupo `(protected)` e o gate rode antes do render da página, nunca depois.
- Nome exato da rota de aceite (`/aceitar-termos`, `/termos-pendentes`, etc.).
- Estratégia de seed da empresa interna do SUPERADMIN (script separado vs. migration com dado) — desde que D-01/D-02 sejam respeitados.

### Deferred Ideas (OUT OF SCOPE)
- Tela de admin para o SUPERADMIN escrever/editar o texto dos termos (UI de publicação) — descartada para esta fase (D-04).
- Suporte a Markdown/HTML formatado no texto dos termos — descartado para esta fase (D-05).
- Rota de autenticação separada para SUPERADMIN (fora do fluxo `/{slug}/admin/login`) — descartada (D-01).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TERM-01 | Tela de termos de uso é exibida no registro da conta, com aceite obrigatório para concluir o cadastro | `## Ponto de Extensão 3` (transação de `registerComUsuario`), `## Pitfall 4` (TOCTOU de versão), `## Pitfall 6` (blast radius nos 9 specs e2e), `## Decisão da Borda "Banco Sem Termos"` |
| TERM-02 | Novo papel `SUPERADMIN` (distinto do `ADMIN` por empresa) é o único autorizado a atualizar os termos de uso via endpoint | `## Achado Crítico 1` (role fresca vs. role do JWT), `## Ponto de Extensão 1` (fluxo de `role` end-to-end), `## Pitfall 1` (enum + transação de migration), `## Ponto de Extensão 5` (seed do SUPERADMIN) |
| TERM-03 | Termos são versionados de forma imutável; cada aceite de um Usuario fica registrado contra uma versão específica | `## Schema Recomendado`, `## Don't Hand-Roll` |
| TERM-04 | Se a versão vigente dos termos for mais recente que o último aceite do usuário, um modal obrigatório bloqueia o uso do admin até o aceite | `## Ponto de Extensão 2` (onde ler o último aceite), `## Máquina de Estados do Gate` (prova de ausência de loop), `## Achado Crítico 2` (superfície REST não coberta pelo requisito literal) |
</phase_requirements>

---

## Summary

Esta fase é, tecnicamente, **quase toda repetição de padrões que o repositório já provou em produção** — e essa é a principal descoberta. O gate de TERM-04 é o gate de `BLOQUEADO` da Fase 4 com um predicado diferente; a tabela de aceites é a `AuditoriaAcesso` da Fase 2 com outras colunas; a migration de enum é a `add_worker_diario_causa` da Fase 5 com outro valor; o seed do SUPERADMIN é o `scripts/seed-fatos-billing.ts` da Fase 4 com outro alvo. Praticamente nada aqui exige invenção, e quase tudo que poderia dar errado já deu errado uma vez neste projeto e está documentado em comentário normativo. **Zero pacotes novos são necessários** (`zod` já é dependência; texto puro dispensa parser de Markdown).

O que *não* é repetição, e onde a fase pode falhar, são cinco coisas concretas. (1) `role` existe no JWT há cinco fases, mas o JWT tem janela de 7 dias — usar `auth.role` para autorizar a publicação de termos é uma escalação de privilégio de 7 dias de duração; a role tem que vir de `revalidarConta`, que lê o banco a cada request. (2) O requisito TERM-04 fala em "bloqueia o uso do admin", mas o sistema tem uma **segunda** superfície autenticada — as 21 rotas `app/api/**` atrás de `requireAuth` — e um ADMIN com termos pendentes continuaria mutando dados por Bearer token se o gate ficar só no `requireAdminSession`. (3) A empresa interna do SUPERADMIN, por ter `acessoVitalicio: true`, passa no predicado `empresaPodePublicar` e **ganha um catálogo público em `/{slug-interno}`**. (4) A ordem entre o gate de bloqueio e o gate de termos, mais as guardas simétricas das duas rotas fora de `(protected)`, é a única parte da fase onde um erro produz `ERR_TOO_MANY_REDIRECTS` — há uma máquina de estados fechada abaixo que resolve isso. (5) Os **9 arquivos de spec e2e do projeto registram pela UI de `/registro`**; um checkbox obrigatório novo quebra todos eles de uma vez, e a CI roda `prisma migrate deploy` sem nenhum passo de seed.

O ponto (5) resolve sozinho a pergunta em aberto D-12: a v1 dos termos **tem que nascer numa migration**, porque a CI não tem — e não deveria ganhar — um passo de seed, e porque um registro que falha por "não há termos publicados" transformaria um erro de operação numa indisponibilidade total do funil de aquisição.

**Primary recommendation:** Modelar `TermoDeUso` (imutável, com `versao Int @unique`) + `AceiteTermo` (fato append-only, `@@unique([usuarioId, termoId])`) e denormalizar `Usuario.termoAceitoId` como *bookkeeping* para que o gate custe **1 query extra por request, não 2**; calcular `termosPendentes` dentro de `revalidarConta` e **aplicar** o bloqueio nos dois guards (`requireAdminSession` → `redirect`, `requireAuth` → `AuthError 403`), exatamente como a Fase 4 fez com `acessoBloqueado`; semear a v1 dos termos por **migration** e o SUPERADMIN por **script versionado em `scripts/`** (duas migrations separadas se o seed for por SQL — ver Pitfall 1).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Publicação de nova versão (TERM-02) | API / Backend (`app/api/**/route.ts`) | Database | D-04 escopou para endpoint-only; autorização precisa da role **fresca do banco**, não do token |
| Imutabilidade do versionamento (TERM-03) | Database / Storage | API | Imutabilidade real vem de FK `onDelete: Restrict` + ausência de qualquer método `update` no service — não de disciplina no código de aplicação |
| Registro do aceite (TERM-03) | Database / Storage | Frontend Server | Fato append-only; a atomicidade com a criação de conta só existe dentro da transação do service |
| Gate de aceite pendente (TERM-04) | Frontend Server (DAL de sessão) | API / Backend | `redirect()` antes do render (D-08); espelho obrigatório em `requireAuth` para a superfície REST (Achado Crítico 2) |
| Aceite no cadastro (TERM-01) | Frontend Server (Server Action) | Database | Validação dupla; a gravação atômica mora em `empresaService.registerComUsuario` |
| Exibição do texto do termo | Frontend Server (RSC) | Browser | Texto puro renderizado como nó de texto React (escape automático); `white-space: pre-wrap` é CSS puro — zero JS necessário |
| Seed do SUPERADMIN | Ops / script versionado | Database | Fora do runtime da aplicação, como `seed-fatos-billing.ts` (precedente `[04-08]`) |
| Seed da v1 dos termos | Database (migration) | — | A CI roda `prisma migrate deploy` e **nada mais**; migration é o único ponto que todos os ambientes atravessam |

---

## Project Constraints (from CLAUDE.md / AGENTS.md)

Diretivas acionáveis extraídas de `CLAUDE.md` e `AGENTS.md`, com a mesma autoridade das decisões travadas do CONTEXT.md:

| Diretiva | Origem | Impacto nesta fase |
|----------|--------|--------------------|
| **Este NÃO é o Next.js do seu treinamento** — ler `node_modules/next/dist/docs/` antes de escrever código | `AGENTS.md` | Docs empacotados foram consultados nesta pesquisa; ver `## State of the Art` |
| Imports internos sempre com alias `@/`, nunca `../` entre diretórios | `CLAUDE.md` § Import Organization | Novos arquivos (`app/services/termo.service.ts`, rota de aceite) seguem |
| Services: `[entity].service.ts` + teste co-localizado `[entity].service.test.ts`; classe + singleton `export const xService = new XService()` | `CLAUDE.md` § Naming / Module Design | `termo.service.ts` + `termo.service.test.ts` |
| `select` explícito, **nunca `include`**, em qualquer query que toque `Usuario` — `include` arrastaria `senhaHash` | `CLAUDE.md` § Module Design (C-06) | Toda leitura nova de aceite/usuário |
| Erros com `.status` (`HttpError` 400-default, `AuthError` 401-default); handlers propagam `error.status` genericamente | `CLAUDE.md` § Error Handling | Negação de `ADMIN` no endpoint de publicação (D-06) não precisa de formato novo |
| Isolamento multi-tenant: todo service filtra por `empresaId`; rotas conferem posse antes de mutar | `CLAUDE.md` § Architectural Constraints (C-07) | `TermoDeUso` é **global, sem `empresaId`** — é a segunda exceção legítima do projeto (a primeira é o worker diário). Precisa de comentário normativo, como o worker tem |
| Enum Prisma para valores fechados | `CLAUDE.md` § Established Patterns | `SUPERADMIN` entra em `UserRole`, nunca como booleano separado |
| `console.error()` para exceções; **nunca vazar detalhe ao cliente** | `CLAUDE.md` § Logging / Error Handling | Erro no endpoint de publicação: mensagem genérica + log |
| GSD Workflow Enforcement: nada de edição direta fora de comando GSD | `CLAUDE.md` | Operacional, não afeta o plano |

**Skills do projeto disponíveis:** `.agents/skills/` e `.claude/skills/` contêm 9 skills de Prisma (idênticos nos dois diretórios). Os relevantes são `prisma-client-api` (referências `model-queries.md`, `relations.md`, `transactions.md`, `query-options.md`) e `prisma-cli` (workflow de `migrate`). `prisma-upgrade-v7` é informativo apenas — o projeto já está em 7.9.1 e o generator é `prisma-client-js`.

---

## Achado Crítico 1 — `role` existe end-to-end, mas a do JWT tem 7 dias de idade

**Pergunta de pesquisa #2, respondida:** `role` **já flui completo**, sem nenhum ponto que o descarte:

| Ponto | Carrega `role`? | Origem do valor |
|-------|-----------------|-----------------|
| `lib/jwt.ts` — `AuthTokenPayload` | ✅ `role: UserRole` (linha 11) | Assinado no login/registro |
| `lib/jwt.ts` — `verifyAuthToken` | ✅ `payload.role as UserRole` (linha 40) | Decodificado do token |
| `lib/session.ts` — `createAdminSession` / `getSession` / `getVerifiedSession` / `requireAdminSession` | ✅ (retornam `AuthTokenPayload`) | **Token — até 7 dias de idade** |
| `lib/api-auth.ts` — `requireAuth` | ✅ (retorna `AuthTokenPayload`) | **Token — até 7 dias de idade** |
| `lib/auth-guard.ts` — `ContaAtiva.role` | ✅ `role: UserRole` (linha 14) | **Banco, no request atual** |
| `app/[slug]/admin/_lib/auth-actions.ts` — `login` | ✅ `role: usuario.role` (linha 44) | Banco, no instante do login |
| `app/registro/actions.ts` — `register` | ✅ `role: usuario.role` (linha 66) | Banco, no instante do registro |

**A consequência de segurança:** `requireAuth` e `requireAdminSession` devolvem deliberadamente o **payload do token**, não a `ContaAtiva` — decisão `[01-03]` do STATE.md ("devolver ContaAtiva quebraria ~40 call sites"). O JSDoc de `lib/api-auth.ts:61-64` diz textualmente: *"Quem precisar dos dados frescos chama `revalidarConta` diretamente — sai de graça, o `React.cache` já tem o resultado no mesmo request."*

Portanto, no endpoint de publicação:

```ts
// ERRADO — role de até 7 dias atrás. Um SUPERADMIN rebaixado para ADMIN
// continua publicando termos por uma semana inteira.
const auth = await requireAuth(request);
if (auth.role !== UserRole.SUPERADMIN) throw new AuthError("...", 403);

// CERTO — role lida do banco neste request, deduplicada por React.cache,
// custo zero porque requireAuth já executou a MESMA query.
const auth = await requireAuth(request);
const conta = await revalidarConta(auth.sub, auth.empresaId);
if (conta?.role !== UserRole.SUPERADMIN) throw new AuthError("...", 403);
```

O mesmo vale para a isenção do SUPERADMIN no gate (D-03): a isenção deve ser decidida sobre `conta.role`, nunca sobre `session.role`. Como a isenção *concede* acesso, uma role stale ali é ainda pior — bastaria um token antigo para pular o gate. **Na prática o gate já vive dentro de `revalidarConta`** (ver Ponto de Extensão 2), então a role certa é a que está à mão.

`[VERIFIED: lib/jwt.ts, lib/session.ts, lib/api-auth.ts, lib/auth-guard.ts, app/[slug]/admin/_lib/auth-actions.ts, app/registro/actions.ts — lidos nesta sessão]`

---

## Achado Crítico 2 — TERM-04 tem duas superfícies, e o requisito só nomeia uma

O requisito diz "bloqueia o uso do **admin**". O sistema tem duas superfícies autenticadas:

1. **Admin web** — 43 call sites de `requireAdminSession` em 22 arquivos (pages, layout e Server Actions dos grupos `(protected)`).
2. **REST API** — 21 arquivos de rota em `app/api/**` atrás de `requireAuth`; o JSDoc de `lib/api-auth.ts:69-70` registra "43 chamadas desta função ... 29 handlers".

Um `ADMIN` com termos pendentes que faça `POST /api/auth/login` e use o Bearer token continua criando produtos, movimentando estoque e alterando a marca da empresa **sem nunca ter visto os termos**. O e2e `bloqueio-por-inadimplencia.spec.ts` mostra que esse caminho é real e usado: ele autentica por `/api/auth/login` e opera por header `Authorization` num contexto separado do browser.

A Fase 4 tratou exatamente essa dualidade e resolveu com **um único predicado aplicado nos dois guards**: `acessoBloqueado(conta.statusAcesso)` aparece em `lib/session.ts:139` (redirect) e em `lib/api-auth.ts:124` (throw 402). Recomendação: repetir literalmente a estrutura.

| Superfície | Guard | Ação recomendada |
|------------|-------|------------------|
| Admin web | `requireAdminSession` | `redirect(\`/${slug}/admin/aceitar-termos\`)` |
| REST API | `requireAuth` | `throw new AuthError("Termos de uso pendentes de aceite.", 403)` |

**Por que 403 e não 402:** 402 é o código já usado para "pague e resolve"; aqui pagar não resolve nada — é o caso canônico de 403 Forbidden (autenticado, sem permissão), o mesmo raciocínio que o JSDoc de `STATUS_ASSINATURA_SUSPENSA` faz ao contrário. Um `403` também não vaza informação de outro tenant.

**Decisão que o planner precisa tomar explicitamente (não presuma):** se gatear a API está dentro ou fora do escopo de TERM-04. Gatear é a leitura correta de "ninguém usa a plataforma sem ter aceitado" (goal da fase no ROADMAP), e é uma linha de código. **Não** gatear é defensável só se registrado como decisão consciente. O que não pode acontecer é o gate ficar só na web por omissão.

`[VERIFIED: grep de requireAdminSession/requireAuth em app/ e lib/; app/api/** enumerado; e2e/bloqueio-por-inadimplencia.spec.ts lido]`

---

## Achado Crítico 3 — A empresa interna do SUPERADMIN ganha um catálogo público

`empresaPodePublicar(empresa, agora)` (`lib/empresa-publicavel.ts:48`) delega a `avaliarAcesso`, onde `acessoVitalicio: true` tem **precedência absoluta** (Fase 2, D-03). Logo:

- D-02 pede `acessoVitalicio: true` na empresa interna →
- `avaliarAcesso` devolve `VITALICIO` →
- `podePublicarCatalogo(VITALICIO)` é verdadeiro →
- `app/[slug]/(catalogo)/page.tsx` renderiza **um catálogo público vazio em `/{slug-interno}`** para qualquer visitante anônimo que adivinhe o slug.

Isso não quebra nada e não vaza dado de cliente (a empresa não tem produtos), mas **revela a existência do tenant interno** — e o slug interno é justamente a porta de login do SUPERADMIN (`/{slug-interno}/admin/login`, D-01). É uma divulgação de informação de mesma natureza que a Fase 4 já reduziu deliberadamente (T-04-12, branding neutro para empresa bloqueada).

**Não existe caminho de enumeração:** `GET /api/empresas` é escopado ao tenant do token (`empresaService.findById(auth.empresaId)`, `app/api/empresas/route.ts:9`) e `empresaService.list()` (que devolve todas) **não tem nenhum consumidor de rota**. `GET /api/empresas/slug/[slug]` exige o slug exato.

**Mitigações, em ordem de custo:**

| Opção | Custo | Tradeoff |
|-------|-------|----------|
| Slug interno longo e não-adivinhável (ex: `plataforma-interna-<8 hex>`) | Uma linha no seed | Obscuridade, não controle — mas reduz a superfície a ~zero na prática e não toca código de produção |
| `deletedAt` na empresa interna | — | **REJEITADO:** `revalidarConta` filtra `empresa: { deletedAt: null }` (`lib/auth-guard.ts:57`) — o SUPERADMIN não conseguiria logar |
| Allowlist de slugs reservados no funil público | Código novo em caminho crítico e testado | Reabre o canal lateral de tempo que T-04-01/T-04-02 fecharam (a rejeição passaria a custar diferente) |
| Aceitar e documentar | Zero | Honesto; o catálogo vazio não diz nada além de "existe um tenant com este slug" |

**Recomendação:** slug interno não-adivinhável **+** nota no seed explicando por quê. Não mexer no funil público — o custo de regressão ali é desproporcional ao ganho.

`[VERIFIED: lib/empresa-publicavel.ts, lib/avaliar-acesso.ts, app/[slug]/(catalogo)/page.tsx, app/api/empresas/route.ts, app/services/empresa.service.ts — lidos nesta sessão]`

---

## Standard Stack

### Core (tudo já instalado — esta fase adiciona ZERO pacotes)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` + `prisma` | 7.9.1 | Schema, migrations e queries dos dois modelos novos | ORM único do projeto; driver adapter `@prisma/adapter-pg` já configurado |
| `next` | 16.3.0 | Route Handler de publicação, RSC da tela de aceite, Server Actions | Framework do projeto; `redirect()` é o mecanismo de gate validado na Fase 4 |
| `react` | 19.2.8 | `cache()` para dedup por request; escape automático do texto do termo | `React.cache` é a **única** memoização permitida no DAL de auth (decisão `[01-02]` do STATE.md) |
| `zod` | ^4.5.4 (declarada) | Validação do corpo do endpoint de publicação (ASVS V5) | Já é dependência direta; usada em `lib/billing/asaas/eventos.ts:39` |
| `vitest` + `vitest-mock-extended` | 4.1.10 / 5.1.1 | Testes unitários do service e das rotas | `tests/setup/prisma-mock.ts` já expõe `prismaMock` global |
| `@playwright/test` | 1.62.1 | e2e do fluxo de registro-com-aceite e do gate | 9 specs existentes; helper `seedFatosBilling` é o modelo do seed de superadmin |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Texto puro + `white-space: pre-wrap` | `react-markdown` / `marked` + `dompurify` | **Vetado por D-05.** Também adicionaria 2-3 pacotes e uma superfície de XSS que hoje não existe |
| `zod` no corpo do publish | Validação manual (`typeof x === "string"`) | Manual é o que `app/registro/actions.ts` faz hoje e é aceitável; `zod` é preferível aqui porque o corpo é JSON externo, não `FormData` de formulário próprio |
| `React.cache` para o termo vigente | `unstable_cache` / `'use cache'` | **PROIBIDO** pela decisão `[01-02]` e pelo JSDoc de `lib/empresa-publicavel.ts:44-47`: são cross-request e congelariam a autorização |

**Installation:** nenhuma. `npm install` não roda nesta fase.

---

## Package Legitimacy Audit

**Esta fase não instala nenhum pacote externo.** O gate de legitimidade é vacuamente satisfeito.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(nenhum pacote novo)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

### Nota de ambiente (pré-existente, NÃO introduzida por esta fase)

`npm ls zod` reporta divergência entre o declarado e o instalado:

```
└── zod@4.4.3 invalid: "^4.5.4" from the root project
npm error code ELSPROBLEMS
```

O `package-lock.json` resolve `zod@4.5.4` (`node_modules/zod`, linha 11050), mas a árvore instalada tem **4.4.3**, deduplicada a partir de `eslint-config-next → eslint-plugin-react-hooks → zod-validation-error`. Consequências: `npm ls` sai com código de erro, e um `npm ci` limpo pode produzir uma árvore diferente da atual. Como esta fase passa a usar `zod` em caminho de produção novo, vale um `npm ci` antes de começar para confirmar qual versão a CI realmente instala.

`[VERIFIED: npm ls zod, package-lock.json:11049-11053 — executado nesta sessão]`

---

## Schema Recomendado

Nomes seguem a convenção do projeto (PascalCase singular, campos em português sem acento, `id String @id @default(uuid())`, `createdAt` implícito nos modelos de fato).

```prisma
enum UserRole {
  ADMIN
  SUPERADMIN   // Fase 6 (TERM-02). Entra por migration PRÓPRIA — ver Pitfall 1.
}

/// Documento legal versionado e IMUTÁVEL (TERM-03 / D-07).
///
/// DELIBERADAMENTE SEM `empresaId`: é a segunda tabela global do sistema (a
/// primeira exceção ao isolamento por tenant do C-07 é o worker diário). Os
/// termos são da PLATAFORMA, não de um tenant — dar-lhe `empresaId` permitiria a
/// um ADMIN publicar os próprios termos, que é exatamente o que D-06 proíbe.
///
/// Nenhum método `update` ou `delete` existe em `termo.service.ts`, e isso é o
/// contrato — não um esquecimento. Publicar = INSERT. Sempre.
model TermoDeUso {
  id String @id @default(uuid())

  /// Versão monotônica legível por humano. `@unique` é o que impede duas
  /// publicações concorrentes de nascerem com o mesmo número: a segunda recebe
  /// P2002 e vira 409, em vez de duas "v3" diferentes no banco.
  versao Int @unique

  /// Texto PURO (D-05). Nunca Markdown, nunca HTML. Renderizado como nó de
  /// texto React (escape automático) com `white-space: pre-wrap`.
  conteudo String

  publicadoEm DateTime @default(now())

  /// Nulo apenas na v1 semeada por migration, que não tem autor humano.
  /// `SetNull` (e não `Cascade`) porque apagar o usuário que publicou não pode
  /// apagar o documento legal que centenas de pessoas aceitaram.
  publicadoPorId String?
  publicadoPor   Usuario? @relation("TermosPublicados", fields: [publicadoPorId], references: [id], onDelete: SetNull)

  aceites AceiteTermo[]

  @@index([publicadoEm])
}

/// Fato append-only de aceite (TERM-03). Mesma natureza de `AuditoriaAcesso`:
/// escrito uma vez, nunca reescrito, nunca apagado pela aplicação.
///
/// Escopo é o USUÁRIO, não a empresa (PROJECT.md § Constraints: "status de
/// pagamento é por Empresa; aceite de termos é por Usuario").
model AceiteTermo {
  id String @id @default(uuid())

  usuarioId String
  usuario   Usuario @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  termoId String
  /// `Restrict`: o banco recusa apagar uma versão de termo que alguém aceitou.
  /// É a imutabilidade imposta pelo Postgres, não pela disciplina de quem lê o
  /// código daqui a um ano.
  termo   TermoDeUso @relation(fields: [termoId], references: [id], onDelete: Restrict)

  aceitoEm DateTime @default(now())

  /// Torna o aceite IDEMPOTENTE: duplo clique, retry de rede e reenvio de
  /// formulário colidem em P2002, que o service trata como "já aceitou" em vez
  /// de gravar duas linhas indistinguíveis.
  @@unique([usuarioId, termoId])
  @@index([usuarioId, aceitoEm])
}

model Usuario {
  // ... campos existentes inalterados ...

  /// BOOKKEEPING — ver `## Ponto de Extensão 2` para a justificativa completa.
  /// Aponta para a ÚLTIMA versão aceita. A fonte da verdade auditável continua
  /// sendo AceiteTermo; esta coluna existe para o gate custar 1 query e não 2
  /// por request autenticado. Escrita EXCLUSIVAMENTE na mesma `$transaction`
  /// que insere a linha de AceiteTermo — nunca isolada.
  /// NÃO está no allowlist de `usuarioService.update`: não é gravável por HTTP.
  termoAceitoId String?
  termoAceito   TermoDeUso? @relation("UltimoAceite", fields: [termoAceitoId], references: [id], onDelete: SetNull)

  aceitesTermos   AceiteTermo[]
  termosPublicados TermoDeUso[] @relation("TermosPublicados")
}
```

### Decisões de campo, com o porquê

| Decisão | Alternativa descartada | Motivo |
|---------|------------------------|--------|
| `versao Int @unique` **e** `publicadoEm` | só `publicadoEm` | D-07 diz "mais recente por data de publicação"; `publicadoEm` sozinho pode empatar (duas publicações no mesmo milissegundo) e depende do relógio do servidor. `orderBy: [{ publicadoEm: "desc" }, { versao: "desc" }]` satisfaz D-07 literalmente e desempata de forma determinística |
| `conteudo` guarda o **texto**, não um ponteiro | referência a arquivo/URL | Prova de consentimento exige reconstruir o que o usuário viu; um ponteiro para conteúdo mutável destrói isso `[CITED: consenso de práticas de consent record — ver Sources]` |
| `onDelete: Restrict` no `termo` | `Cascade` | `Cascade` permitiria apagar uma versão e evaporar todos os aceites dela — o oposto de TERM-03 |
| `@@unique([usuarioId, termoId])` | fato puro sem unique (como `AuditoriaAcesso`) | Ganha idempotência de graça. Custo: um usuário não pode "reaceitar" a mesma versão duas vezes — que é a semântica desejada. Divergência consciente do padrão `AuditoriaAcesso`, e deve estar comentada como tal |
| Sem `empresaId` em `AceiteTermo` | denormalizar `empresaId` | PROJECT.md § Constraints proíbe explicitamente confundir os dois escopos |
| Sem `ipAddress` / `userAgent` no aceite | capturar para prova jurídica | Ver `## Assumptions Log` A1 — requisito legal não confirmado, e capturar IP é processamento de dado pessoal novo que ninguém pediu |

---

## Ponto de Extensão 1 — Enum `UserRole` e o alcance de `SUPERADMIN`

**Estado atual verificado:**

```prisma
enum UserRole {
  ADMIN            // único valor hoje
}

model Usuario {
  role  UserRole @default(ADMIN)
  // ...
  @@unique([empresaId])   // UM usuário por empresa
}
```

**Quem lê `UserRole` hoje (busca exaustiva):** `lib/jwt.ts` (tipo), `lib/auth-guard.ts` (tipo + projeção), `app/services/usuario.service.ts` (`SAFE_SELECT`), `app/services/empresa.service.ts` (`findById` → `include.usuarios.select.role`), `app/[slug]/admin/_lib/auth-actions.ts`, `app/registro/actions.ts`, `tests/helpers/auth.ts`, `tests/setup/prisma-mock.ts`. **Nenhum deles compara `role` com nada** — não há um único `if (role === ...)` no código de produção. Confirma a "ausência confirmada" registrada no CONTEXT.md: esta fase introduz o primeiro uso de `role` para autorização.

**Nada assume cardinalidade 1 no enum:** não existe `Record<UserRole, X>` exaustivo (o padrão que `scripts/seed-fatos-billing.ts` usa para `StatusAcesso` e que quebraria por compilação ao ganhar um valor). Adicionar `SUPERADMIN` **não quebra compilação em lugar nenhum**.

**`@@unique([empresaId])` acomoda D-01? Sim, com uma consequência a registrar:** a empresa interna terá exatamente **um** usuário — o SUPERADMIN. Se um dia for preciso um segundo superadmin, ele exige uma **segunda empresa interna**. Isso é uma limitação real do modelo escolhido em D-01, não um bug; deve estar escrita no seed para que quem precisar do segundo não descubra por tentativa e erro.

**Efeito colateral positivo:** `usuarioService.create` recusa criar um segundo usuário numa empresa que já tem um (`app/services/usuario.service.ts:63-70` + P2002 em `empresaId`). Como `POST /api/usuarios` **não tem `requireAuth`** (pré-existente, verificado em `app/api/usuarios/route.ts:29-32`), essa constraint é o que impede um anônimo de anexar um usuário à empresa interna. E `CreateUsuarioDTO` **não tem campo `role`** e `usuarioService.create` monta o `data` com allowlist explícita — então **`role` não é gravável por HTTP em nenhum caminho**, nem no `create` nem no `update` (`UpdateUsuarioDTO` também não tem `role`, e `usuarioService.update` monta `updateData` campo a campo).

⚠️ **Recomendação de hardening (fora do escopo estrito, mas adjacente):** `POST /api/usuarios` sem autenticação é a superfície mais próxima da nova fronteira de privilégio. Ele não pode criar um SUPERADMIN nem tocar a empresa interna, mas pode criar um ADMIN em qualquer empresa que ainda não tenha um. O planner deve pelo menos adicionar um **gate de grep executável** (padrão `npm run gates:fase-0X`) provando que nenhum caminho HTTP escreve `role`, e considerar propor a autenticação daquele endpoint como item separado.

`[VERIFIED: prisma/schema.prisma, app/services/usuario.service.ts, app/api/usuarios/route.ts, app/api/usuarios/[id]/route.ts, grep de UserRole em app/ lib/ scripts/ tests/]`

---

## Ponto de Extensão 2 — Onde ler o "último aceite" sem estourar o orçamento de queries

**Pergunta de pesquisa #3, respondida.**

### Custo atual do caminho autenticado

`revalidarConta` (`lib/auth-guard.ts:48-130`) é **1 query** por request, deduplicada por `React.cache`, compartilhada entre layout + page + Server Actions do mesmo render. Todo o design de auth do projeto orbita esse número: o JSDoc de `lib/api-auth.ts` chama a segunda leitura de "sai de graça", `layout.tsx:31-33` justifica não pagar query extra, e a Fase 1 fechou com medição real de `pg_stat_activity` (1 → 5 conexões).

### O que o gate precisa saber

`termosPendentes = (existe termo vigente) && (último termo aceito pelo usuário ≠ o vigente)`

São dois dados: **o vigente** (global) e **o último aceito** (por usuário).

### As três opções, com custo real

| Opção | Queries/request | Como |
|-------|-----------------|------|
| **A** — relação aninhada em `revalidarConta` + leitura do vigente | **3** | `aceitesTermos: { take: 1, orderBy: { aceitoEm: "desc" } }` **+** `termoVigente()` |
| **B — RECOMENDADA** — `Usuario.termoAceitoId` denormalizado + leitura do vigente | **2** | Coluna escalar entra no `select` existente **de graça**; só `termoVigente()` é query nova |
| **C** — cache cross-request do vigente | 1-2 | **PROIBIDO** — `unstable_cache` / `'use cache'` violam a decisão `[01-02]` |

**Por que A custa 3 e não 2:** o Prisma carrega relações aninhadas com **queries separadas** por padrão. O `relationLoadStrategy: "join"` exige o preview feature `relationJoins`, que **não está habilitado** — `prisma/schema.prisma` não declara `previewFeatures`, e `grep -c relationLoadStrategy node_modules/.prisma/client/index.d.ts` devolve **0**. Habilitá-lo só para isto é mexer no generator do projeto inteiro por um ganho de uma query. `[VERIFIED: prisma/schema.prisma; grep no client gerado — executado nesta sessão]`

### Por que B é consistente com o projeto (e onde ela diverge)

`Usuario.termoAceitoId` tem **exatamente a mesma forma** que `Empresa.ultimoStatusAuditado`: uma coluna denormalizada cujo único propósito declarado é *"detectar transição sem uma segunda query por request"* (comentário em `prisma/schema.prisma:74-77`). Precedente direto, mesmo problema, mesma solução.

**A divergência honesta, que precisa de comentário no schema:** `ultimoStatusAuditado` carrega a regra *"NENHUMA decisão de acesso pode lê-lo"*. `termoAceitoId` **é lido para decidir**. A diferença de natureza justifica a diferença de regra — `ultimoStatusAuditado` é *derivável* de 4 fatos que mudam sozinhos com a passagem do tempo (por isso lê-lo seria congelar uma derivação), enquanto `termoAceitoId` **é** o fato (um evento discreto que só muda quando alguém aceita) — mas se isso não estiver escrito, o próximo leitor vai aplicar a regra errada a uma das duas colunas. O invariante que mantém B correta é **um escritor único**: só a transação de aceite escreve, e sempre junto do INSERT em `AceiteTermo`.

### Onde o cálculo mora

Dentro de `revalidarConta`, projetando o resultado em `ContaAtiva`:

```ts
export interface ContaAtiva {
  // ... campos existentes ...
  /**
   * TERM-04. Já resolvido aqui (e não re-derivado pelo chamador) pelo MESMO
   * motivo de `carenciaAte`: os dois guards precisam do booleano e nenhum deles
   * pode reimplementar a comparação. SUPERADMIN é sempre `false` (D-03).
   */
  termosPendentes: boolean;
}
```

E a leitura do vigente, deduplicada, ao lado de `revalidarConta`:

```ts
/**
 * Versão vigente dos termos (D-07). `React.cache` e SÓ ele: `unstable_cache` /
 * `'use cache'` são cross-request e fariam um termo recém-publicado demorar a
 * valer — a mesma armadilha que T-04-08 documenta para o catálogo.
 *
 * Devolve `null` quando NÃO HÁ nenhum termo publicado, e esse `null` NÃO gateia
 * ninguém — ver "Assimetria deliberada" abaixo.
 */
export const termoVigente = cache(async () => {
  return prisma.termoDeUso.findFirst({
    orderBy: [{ publicadoEm: "desc" }, { versao: "desc" }],
    select: { id: true, versao: true, conteudo: true, publicadoEm: true },
  });
});
```

### Assimetria deliberada: o gate falha ABERTO, o registro falha FECHADO

| Caminho | Sem termo publicado | Por quê |
|---------|---------------------|---------|
| Gate (`termosPendentes`) | **não bloqueia** | Gatear contra um documento inexistente derrubaria **todos os tenants de uma vez**, e a recuperação dependeria de o SUPERADMIN conseguir logar (ele consegue, por D-03 — mas a janela de indisponibilidade total é inaceitável para um erro de operação) |
| Registro (`registerComUsuario`) | **recusa com erro** | A falha atinge **um** cadastro, não a base inteira; e criar conta sem aceite viola TERM-01 diretamente |

Essa assimetria é intencional e **tem que estar comentada nos dois lugares**, senão um leitor futuro "corrige" um dos dois para casar com o outro.

### Cuidado com o `try/catch` fail-closed

`revalidarConta` envolve tudo num `try/catch` que devolve `null` em erro de banco (decisão `[01-02]`). A query de `termoVigente()` cai dentro desse mesmo catch — o que é o comportamento certo (erro de banco não autoriza), mas significa que **uma falha na tabela de termos derruba a sessão inteira**, não só o gate. Aceitável e consistente; só precisa estar registrado para o diagnóstico não confundir "termos quebrados" com "conta revogada" (o prefixo `[auth-guard]` nos logs já é a ferramenta de distinção prevista pela nota operacional D-01/T-01-10).

---

## Ponto de Extensão 3 — Registro atômico (TERM-01)

**Pergunta de pesquisa #5, respondida.** `empresaService.registerComUsuario` (`app/services/empresa.service.ts:78-156`) já é uma `prisma.$transaction` com três escritas: `empresa.create` → `usuario.create` → `auditoriaAcesso.create`. A quarta escrita entra ali, e o `termoAceitoId` do usuário sai já preenchido:

```
prisma.$transaction(async (tx) => {
  empresa    = tx.empresa.create({...})              // existente
  usuario    = tx.usuario.create({ ..., termoAceitoId: termo.id })   // + 1 campo
  tx.auditoriaAcesso.create({...})                   // existente
  tx.aceiteTermo.create({ usuarioId: usuario.id, termoId: termo.id })  // NOVO
})
```

**Onde ler o termo:** antes de abrir a transação (como `generateUniqueSlug` e `bcrypt.hash` já fazem nas linhas 79-80). Manter I/O de leitura fora da transação interativa é a mesma disciplina de pool que o JSDoc de `aplicar()` em `app/api/cron/reconciliacao-diaria/route.ts` documenta.

**Assinatura do DTO:** `RegisterComUsuarioDTO` ganha `termoAceitoId: string` (o id que o **usuário viu no formulário**, não o que o servidor descobrir sozinho — ver Pitfall 4).

**Tratamento de erro:** o `catch` existente já mapeia P2002 em `email` e `slug` para `HttpError` 409. Adicionar o caso "não há termo vigente" como `HttpError(…, 409 ou 503)` **antes** da transação.

**A Server Action `register`** (`app/registro/actions.ts:15-81`) ganha duas validações no mesmo estilo das seis que já tem (`if (!x) return { error: "..." }`):
1. checkbox marcado (`formData.get("aceiteTermos") === "on"`);
2. `termoId` do hidden input presente e não vazio.

E o `app/registro/page.tsx` passa a ler `termoVigente()` para passar `{ id, conteudo }` ao `RegisterForm`.

### O SUPERADMIN NÃO reutiliza este caminho

Confirmado: `registerComUsuario` escreve `trialFim`, `ultimoStatusAuditado: TRIAL` e uma `AuditoriaAcesso` de causa `REGISTRO`, e **não aceita** `role` nem `acessoVitalicio` (nenhum caminho de aplicação pode escrevê-los — comentário nas linhas 91-96, BILL-04/D-09/D-10). O seed do SUPERADMIN precisa de caminho próprio (Ponto de Extensão 5).

---

## Ponto de Extensão 4 — Réplica exata do padrão `/admin/bloqueado`

**Pergunta de pesquisa #4, respondida.** A mecânica da Fase 4 tem **três peças**, e todas as três precisam ser replicadas:

**(1) O redirect no guard** — `lib/session.ts:137-141`, DEPOIS do redirect de login:

```ts
if (acessoBloqueado(conta.statusAcesso)) {
  redirect(`/${slug}/admin/bloqueado`);
}
```

**(2) A pasta FORA do grupo** — `app/[slug]/admin/bloqueado/` é irmã de `(protected)/`, não filha. O comentário de cabeçalho de `bloqueado/page.tsx:1-15` diz que *"a posição deste arquivo na árvore é a mitigação (T-04-14); mover a pasta para dentro de `(protected)` reintroduz o bug sem alterar uma linha de código"*.

**(3) A guarda simétrica própria da página** — `bloqueado/page.tsx:36-51`, com os `redirect()` fora de qualquer `try`:

```ts
const session = await getVerifiedSession();
if (!session || session.empresaSlug !== slug) redirect(`/${slug}/admin/login`);

const conta = await revalidarConta(session.sub, session.empresaId);
if (!conta || !acessoBloqueado(conta.statusAcesso)) redirect(`/${slug}/admin`);
```

**Estrutura de arquivos a criar (espelho 1:1):**

```
app/[slug]/admin/
├── (protected)/                 # existente — NÃO tocar a árvore
├── bloqueado/                   # existente — modelo
│   ├── _components/bloqueado-card.tsx
│   ├── page.test.ts
│   └── page.tsx
└── aceitar-termos/              # NOVO — irmã, nunca filha de (protected)
    ├── _components/aceite-card.tsx      # server component puro, props = decisão já tomada
    ├── actions.ts                       # Server Action de aceite + reuso de logout
    ├── page.test.ts                     # mesmo shape do teste de bloqueado
    └── page.tsx
```

**Reuso direto:** `logout` de `app/[slug]/admin/_lib/auth-actions.ts:50-53` já faz `destroySession()` + `redirect(login)` e é ligado por `logoutAction={logout.bind(null, slug)}` — é exatamente o que D-09 pede, sem escrever nada novo. `BloqueadoCard` é o modelo visual (shell repetido da tela de login, sem chrome de admin, sem importar `AdminNav`).

`[VERIFIED: app/[slug]/admin/bloqueado/page.tsx, app/[slug]/admin/bloqueado/_components/bloqueado-card.tsx, app/[slug]/admin/bloqueado/page.test.ts, app/[slug]/admin/_lib/auth-actions.ts, lib/session.ts, app/[slug]/admin/(protected)/layout.tsx]`

---

## Máquina de Estados do Gate (prova de ausência de loop)

Com **dois** gates ativos (bloqueio de assinatura + termos pendentes) e **duas** rotas fora de `(protected)`, existem quatro estados e seis transições. A tabela abaixo é a especificação; qualquer implementação que a satisfaça é livre de loop.

**Ordem obrigatória em `requireAdminSession`:**
1. sessão inválida / slug divergente → `/{slug}/admin/login`
2. `acessoBloqueado(conta.statusAcesso)` → `/{slug}/admin/bloqueado`
3. `conta.termosPendentes` → `/{slug}/admin/aceitar-termos`

**Por que bloqueio ANTES de termos:** quem está bloqueado tem que chegar à tela de pagamento; forçá-lo a aceitar termos primeiro insere um passo entre o cliente e a receita, e a Fase 4 já pagou o preço de aprender que trancar o caminho do pagamento é uma negação de serviço auto-infligida (Pitfall 1 / T-04-10 no JSDoc de `OpcoesDeAuth`).

**Guardas simétricas das duas rotas:**

| Rota | Guarda |
|------|--------|
| `/admin/bloqueado` | `!conta` ou `!acessoBloqueado` → `/{slug}/admin`. **NÃO checa termos.** |
| `/admin/aceitar-termos` | `!conta` → `/{slug}/admin`; `acessoBloqueado` → `/{slug}/admin/bloqueado`; `!termosPendentes` → `/{slug}/admin` |

**Verificação exaustiva:**

| Estado (bloqueado, pendente) | `/admin` | `/admin/bloqueado` | `/admin/aceitar-termos` | Loop? |
|---|---|---|---|---|
| (não, não) | renderiza | → `/admin` | → `/admin` | ✅ não |
| (não, sim) | → `/aceitar-termos` | → `/admin` → `/aceitar-termos` | renderiza | ✅ não |
| (sim, não) | → `/bloqueado` | renderiza | → `/bloqueado` | ✅ não |
| (sim, sim) | → `/bloqueado` | renderiza | → `/bloqueado` | ✅ não |
| SUPERADMIN | renderiza (empresa é `VITALICIO` por D-02, `termosPendentes` é `false` por D-03) | → `/admin` | → `/admin` | ✅ não |

**A transição perigosa é `/bloqueado` checar termos.** Se ela o fizesse, o estado (sim, sim) viraria `/bloqueado` → `/aceitar-termos` → `/bloqueado` → … Não checar termos ali é **requisito**, não omissão — e merece comentário no arquivo dizendo isso.

**Saída sempre disponível (critério de sucesso #4):** o `logout` na tela de aceite destrói o cookie e vai para `/login`; `proxy.ts:19-21` libera `rest === "login"` sem cookie, então não há como ficar preso. `proxy.ts` também já exige cookie válido para `/{slug}/admin/aceitar-termos` (matcher `/:slug/admin/:path*`), então a rota nova herda o pré-filtro otimista de graça — como `/bloqueado` herdou.

**Depois de aceitar (D-10):** redirecionar para `/{slug}/admin`, sem parâmetro `?next=`. Um `?next=` seria um vetor de **open redirect** e exigiria validação de destino (allowlist de path relativo) — custo desproporcional ao ganho de UX. Se o planner quiser preservar o destino mesmo assim, a validação obrigatória é: começar com `/${slug}/admin`, não conter `//` nem `:`.

---

## Ponto de Extensão 5 — Seeds: v1 dos termos e SUPERADMIN

### Decisão da Borda "Banco Sem Termos" (resolve D-12)

**Recomendação: semear a v1 por MIGRATION.** Três evidências, cada uma suficiente sozinha:

1. **A CI não tem passo de seed.** `.github/workflows/tests.yml` (job `e2e`) roda `npx prisma generate` → `npx prisma migrate deploy` → `npx playwright install` → `npm run test:e2e`. Migration é o **único** ponto que todo ambiente atravessa.
2. **Os 9 specs e2e registram pela UI.** Sem v1 no banco, `/registro` recusa e **toda a suíte e2e cai**, não só os testes de termos.
3. **O funil de aquisição é o pior lugar para uma dependência operacional.** "Ninguém consegue criar conta até alguém rodar um curl" é uma indisponibilidade total de receita disfarçada de erro de configuração.

**Alternativas descartadas:**

| Alternativa | Por que não |
|-------------|-------------|
| Erro claro 503 até o SUPERADMIN publicar | Deixa a plataforma sem funil de cadastro entre o deploy e a publicação manual, e quebra a CI |
| Passo de seed novo na CI | Adiciona superfície ao workflow e ao onboarding de dev; a migration faz o mesmo sem passo novo |
| Registrar sem aceite quando não há termos | Viola TERM-01 diretamente |

**Forma da migration (SQL puro, sem enum envolvido — 1 migration basta):**

```sql
-- Fase 6 (TERM-01/TERM-03): v1 dos termos, semeada para que /registro funcione
-- desde a primeira migration aplicada. Sem esta linha, `prisma migrate deploy`
-- num banco limpo (inclusive o da CI) deixa o cadastro inoperante.
-- `publicadoPorId` é NULL: a v1 não tem autor humano, por construção.
-- Idempotente contra reaplicação em banco já semeado.
INSERT INTO "TermoDeUso" ("id", "versao", "conteudo", "publicadoEm", "publicadoPorId")
VALUES (gen_random_uuid(), 1, '<texto placeholder — substituir pelo texto real antes do go-live>', now(), NULL)
ON CONFLICT ("versao") DO NOTHING;
```

⚠️ **O texto da v1 é conteúdo jurídico, não código.** O planner **deve** criar um `checkpoint:human-verify` para o usuário fornecer/aprovar o texto real antes do merge. Um placeholder que chega em produção significa que todos os clientes aceitaram um lorem ipsum.

### Seed do SUPERADMIN — script, não migration

**Recomendação: `scripts/seed-superadmin.ts`, no padrão exato de `scripts/seed-fatos-billing.ts`.**

Precedente direto (decisão `[04-08]` do STATE.md): *"O habilitador de teste de billing é um script versionado em `scripts/` com guarda de `NODE_ENV=production`, nunca um endpoint de teste"*. Aqui a guarda de produção **não** se aplica (o superadmin é necessário em produção), mas todo o resto vale:

- roda por `npm run seed:superadmin -- --email ... --senha ...` com `--import ./scripts/resolvedor-ts.mjs`;
- lê o `.env` pelo **mesmo leitor da aplicação** (`@next/env` via o resolvedor) — o incidente do `$` na chave do Asaas (decisão `[03-07]`) é o motivo pelo qual isso não é negociável;
- `bcrypt.hash(senha, 10)`, igual a `usuarioService.create` e `registerComUsuario`;
- transação criando `Empresa` (com `acessoVitalicio: true`, `slug` não-adivinhável, `ultimoStatusAuditado: VITALICIO`) + `Usuario` (`role: SUPERADMIN`) + `AuditoriaAcesso` inicial;
- idempotente: se o email já existir, não recria;
- **nunca** senha hard-coded no arquivo — vem por argumento ou env var.

**Por que script e não migration:** uma migration com `INSERT ... role = 'SUPERADMIN'` colide com o Pitfall 1 (exigiria uma segunda migration) **e** embutiria uma senha/hash no histórico do repositório para sempre.

**Consumo pelo e2e:** se um spec precisar de um SUPERADMIN autenticado para provar TERM-02, o padrão é `execFileSync` a partir de `e2e/helpers.ts`, exatamente como `seedFatosBilling` faz hoje (síncrono de propósito: quando retorna, a linha já está no banco).

`[VERIFIED: .github/workflows/tests.yml, scripts/seed-fatos-billing.ts, scripts/resolvedor-ts.mjs, e2e/helpers.ts, package.json scripts]`

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Imutabilidade da versão do termo | Flag `imutavel: true` + checagem no service | Ausência de método `update`/`delete` no service **+** `onDelete: Restrict` na FK | A checagem em código é contornável pelo próximo `prisma.termoDeUso.update` que alguém escrever; a FK é o Postgres recusando |
| Idempotência do aceite (duplo clique, retry) | `findFirst` antes do `create` | `@@unique([usuarioId, termoId])` + tratar P2002 como sucesso | Read-then-write perde a corrida entre dois requests concorrentes — o mesmíssimo argumento já escrito para `EventoWebhookAsaas.eventoId` no schema (linhas 336-341) |
| Numeração monotônica da versão | `MAX(versao) + 1` lido e depois escrito | `versao Int @unique`, P2002 → 409 | Idem: duas publicações simultâneas leriam o mesmo `MAX` |
| Redirect loop do gate | Flag na sessão / cookie "já vi a tela" | Rota fora de `(protected)` + guarda simétrica (Fase 4) | O padrão já está validado em produção; qualquer coisa nova reabre uma classe de bug que o projeto já pagou duas vezes |
| Bloquear a superfície REST | Editar os 29 handlers de `app/api` | Um `throw` em `requireAuth` | A Fase 4 cobriu 43 chamadas com uma condição; todo handler já propaga `error.status` |
| Renderizar o texto do termo | Sanitizador de HTML / parser de Markdown | Nó de texto React + `whitespace-pre-wrap` (Tailwind) | D-05; React escapa por padrão. `dangerouslySetInnerHTML` seria a única forma de introduzir XSS aqui |
| Consulta "termo vigente" repetida no render | Passar o termo por prop através de 5 componentes | `React.cache` no leitor | Padrão já usado por `revalidarConta` e `getEmpresaCatalogo` |
| Hash de senha do superadmin | Qualquer coisa que não seja `bcrypt.hash(senha, 10)` | `bcryptjs` com custo 10 | Mesmo custo de `usuarioService.create` e `registerComUsuario`; divergir cria duas políticas de senha |

**Key insight:** neste domínio, quase toda "regra de negócio" é na verdade uma **constraint de banco** disfarçada. Imutabilidade, unicidade de versão e idempotência de aceite são todas expressáveis em DDL, e todas as três se tornam contornáveis no instante em que viram `if` no TypeScript. O repositório já tomou essa decisão três vezes (`asaasSubscriptionId @unique`, `eventoId @unique`, `@@unique([empresaId])`) e documentou o raciocínio; esta fase repete.

---

## Common Pitfalls

### Pitfall 1 — Migration que adiciona valor ao enum E o usa

**O que dá errado:** a migration que faz `ALTER TYPE "UserRole" ADD VALUE 'SUPERADMIN'` e, no mesmo arquivo, um `INSERT ... role = 'SUPERADMIN'`, falha na aplicação.

**Por quê:** o Prisma Migrate roda cada arquivo de migration dentro de uma transação, e a documentação do PostgreSQL é explícita: *"If `ALTER TYPE ... ADD VALUE` (the form that adds a new value to an enum type) is executed inside a transaction block, the new value cannot be used until after the transaction has been committed."*

**Como evitar:** duas migrations. A primeira **só** adiciona o valor; qualquer DML que o use vai na segunda. **O repositório já viveu isto** — `prisma/migrations/20260901195303_add_worker_diario_causa/migration.sql` tem o incidente documentado como "Pitfall 7" no próprio arquivo, e o comentário do enum `CausaTransicaoAcesso` no schema repete o aviso.

**Como isso interage com o seed do SUPERADMIN:** um script rodando em runtime **não** está na transação da migration, então não é afetado. É mais um argumento a favor de script em vez de migration para o superadmin.

**Sinal de alerta:** `ERROR: unsafe use of new value "SUPERADMIN" of enum type "UserRole"` durante `prisma migrate dev`.

`[VERIFIED: postgresql.org/docs/current/sql-altertype.html — citação literal obtida nesta sessão; prisma/migrations/20260901195303_add_worker_diario_causa/migration.sql]`

### Pitfall 2 — Autorizar pela role do JWT

Ver `## Achado Crítico 1`. Janela de escalação de privilégio de até 7 dias. **Sinal de alerta:** qualquer `auth.role ===` ou `session.role ===` no código de produção. Candidato natural a **gate de grep executável** (`npm run gates:fase-06`), no padrão dos gates das Fases 4 e 5 — que, atenção, descartam linhas de comentário antes de contar, justamente porque os JSDoc normativos citam os identificadores proibidos (decisão `[04-09]`).

### Pitfall 3 — Colocar o gate no `layout.tsx`

`app/[slug]/admin/(protected)/layout.tsx:12-20` carrega um comentário normativo dizendo que ele **não é e não pode virar** o boundary de autorização: segmentos filhos continuam executando e saindo no RSC Payload mesmo que o layout renderize outra coisa, e layouts não re-renderizam em navegação client-side. Os docs empacotados do Next 16.3.0 confirmam textualmente: *"A common pattern in SPAs is to `return null` in a layout or a top-level component if a user is not authorized. This pattern is **not recommended** since Next.js applications have multiple entry points, which will not prevent nested route segments and Server Actions from being accessed."* (`node_modules/next/dist/docs/01-app/02-guides/authentication.md:1456`).

**Sinal de alerta:** qualquer diff que toque `(protected)/layout.tsx` para adicionar lógica de termos. O único motivo legítimo de tocar aquele arquivo nesta fase é **nenhum**.

### Pitfall 4 — TOCTOU: gravar o aceite contra uma versão que o usuário não viu

**O que dá errado:** o usuário abre `/registro`, lê a v3, e enquanto preenche o formulário o SUPERADMIN publica a v4. Se o servidor resolver "a vigente" no momento do submit, grava-se um aceite da v4 contra alguém que leu a v3. Isso destrói a única propriedade que justifica a existência da tabela: **provar o que a pessoa viu**.

**Como evitar:** o `termoId` viaja como **hidden input** no formulário (registro e tela de aceite). No servidor:

```
if (termoIdRecebido !== vigente.id) {
  // Não gravar. Re-renderizar com o texto NOVO e pedir de novo.
  return { error: "Os termos foram atualizados. Leia a nova versão e aceite novamente." };
}
```

**Janela:** minúscula (publicações são raras). **Custo do bug:** um registro de consentimento inválido, que é o pior tipo de bug num sistema cujo único produto é o registro de consentimento.

**Nota de segurança:** o hidden input é dado controlado pelo cliente — por isso a checagem é **igualdade contra o vigente do servidor**, nunca "usa o que veio". Não há caminho para o cliente escolher qual versão aceitar.

### Pitfall 5 — Nunca ler o texto do termo por `include`

Qualquer query que traga `Usuario` junto do termo aceito deve usar `select` explícito. `usuarioService.validatePassword` já usa `include: { empresa: true }` (`app/services/usuario.service.ts:130-135`) — é uma exceção pré-existente que devolve `senhaHash` de propósito (a função compara a senha). **Não replicar esse padrão** nas leituras novas: C-06 do CLAUDE.md proíbe `include` no modelo `Usuario` justamente porque arrasta o hash.

### Pitfall 6 — O checkbox obrigatório quebra os 9 specs e2e de uma vez

**Blast radius verificado:** os **9** arquivos de spec em `e2e/` registram pela UI de `/registro` (13 ocorrências do locator `Criar minha loja`), e **cada spec define seu próprio helper de registro** — não há um helper compartilhado em `e2e/helpers.ts` para isso. Um checkbox `required` novo faz o submit não disparar e **os 9 specs falham por timeout**, com a mensagem de erro apontando para o lugar errado.

**Blast radius unitário:** `app/registro/_components/register-form.test.tsx` e `app/registro/page.tsx` (que precisará buscar o termo e passá-lo por prop).

**Ordem de trabalho recomendada:** (a) migration com a v1 semeada; (b) schema + service; (c) atualizar os 9 helpers de registro e2e **no mesmo commit** do checkbox; (d) só então o gate. Fazer (d) antes de (c) produz uma suíte vermelha por dois motivos simultâneos, o que torna o diagnóstico caro.

### Pitfall 7 — Cachear a leitura do termo vigente cross-request

`unstable_cache` e `'use cache'` fariam um termo recém-publicado demorar a valer e — pior — um usuário que **acabou de aceitar** continuaria sendo redirecionado para a tela de aceite até o cache expirar. É a mesma armadilha que T-04-08 documenta para o catálogo e que a decisão `[01-02]` já proíbe. **Só `React.cache`.** O JSDoc de `lib/empresa-publicavel.ts:44-47` tem o texto pronto para adaptar.

### Pitfall 8 — Server Action de aceite sem autorização própria

Os docs do Next 16.3.0 são explícitos: *"Treat Server Actions with the same security considerations as public-facing API endpoints, and verify if the user is allowed to perform a mutation."* (`authentication.md:1461`). A action de aceite mora numa rota **fora** de `(protected)`, portanto **nenhum guard a cobre**. Ela precisa chamar `getVerifiedSession()` + conferir o slug por conta própria, exatamente como `iniciarPagamento` faz em `app/[slug]/admin/_lib/assinatura-actions.ts:29`.

Sem isso, qualquer pessoa com um `admin_session` válido consegue gravar aceite em nome de outro usuário forjando o `usuarioId` — ou simplesmente o `usuarioId` nunca deve vir do formulário: **derive-o da sessão, sempre**.

### Pitfall 9 — Deadlock de autoridade

Padrão que este repositório já evitou duas vezes (webhook do Asaas e worker de cron, ambos documentados como "impasse" nos respectivos JSDoc): a autoridade que resolve um bloqueio não pode estar sujeita a ele. Aqui a cadeia é: SUPERADMIN publica termos → gate de termos bloquearia o SUPERADMIN → ninguém publica. **D-03 (isenção) é a mitigação**, e D-02 (`acessoVitalicio`) é a mitigação do impasse gêmeo com o gate de pagamento. Ambas precisam de comentário dizendo *que são mitigação de impasse*, não conveniência — senão a próxima pessoa que "simplificar removendo o caso especial" trava a plataforma.

---

## Code Examples

Todos os trechos abaixo são **adaptações diretas de código verificado neste repositório**, não invenções.

### Gate nos dois guards (espelho do padrão `acessoBloqueado` da Fase 4)

```ts
// lib/session.ts — dentro de requireAdminSession, DEPOIS do gate de bloqueio.
// Fonte do padrão: lib/session.ts:137-141 (Fase 4, ACC-02).
if (acessoBloqueado(conta.statusAcesso)) {
  redirect(`/${slug}/admin/bloqueado`);
}

// TERM-04. Fica DEPOIS do gate de assinatura de propósito: quem está bloqueado
// tem que chegar à tela de pagamento antes de qualquer outra coisa (o mesmo
// raciocínio de `permitirEmpresaBloqueada` em lib/api-auth.ts).
// SUPERADMIN já sai `false` de `revalidarConta` (D-03) — a isenção não é
// re-decidida aqui, para não existirem duas cópias da regra.
if (conta.termosPendentes) {
  redirect(`/${slug}/admin/aceitar-termos`);
}
```

```ts
// lib/api-auth.ts — dentro de requireAuth, depois do gate de assinatura.
// Fonte do padrão: lib/api-auth.ts:124-129.
if (conta.termosPendentes) {
  throw new AuthError("Termos de uso pendentes de aceite.", 403);
}
```

### Endpoint de publicação (autorização com role FRESCA)

```ts
// app/api/termos/route.ts
// Padrão do handler copiado de app/api/usuarios/route.ts (try/catch + AuthError
// + HttpError + console.error + mensagem genérica no 500).
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { revalidarConta } from "@/lib/auth-guard";
import { HttpError } from "@/lib/http-error";
import { termoService } from "@/app/services/termo.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ASVS V5: o corpo é JSON externo. Limite superior explícito — sem ele, um
// `conteudo` de 50 MB entra no Postgres e depois no RSC Payload de toda tela
// de aceite.
const CorpoPublicacao = z.object({
  conteudo: z.string().trim().min(1).max(200_000),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    // D-06 / TERM-02. A role vem do BANCO, nunca do token — este `revalidarConta`
    // é gratuito: `requireAuth` acabou de executá-lo e o React.cache o deduplica.
    // Ver `lib/api-auth.ts:61-64`.
    const conta = await revalidarConta(auth.sub, auth.empresaId);

    if (conta?.role !== UserRole.SUPERADMIN) {
      // 403, não 402: pagar não resolveria. Mensagem sem revelar o que faltou.
      throw new AuthError("Ação não permitida.", 403);
    }

    const { conteudo } = CorpoPublicacao.parse(await request.json());

    const termo = await termoService.publicar({ conteudo, publicadoPorId: conta.usuarioId });

    return NextResponse.json(termo, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError || error instanceof HttpError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Corpo inválido." }, { status: 400 });
    }

    console.error(error);

    return NextResponse.json({ message: "Erro ao publicar termos." }, { status: 500 });
  }
}
```

### Service: publicar (INSERT sempre) e aceitar (transação idempotente)

```ts
// app/services/termo.service.ts
// Convenção do projeto: classe + singleton (`export const termoService = ...`).
// NÃO existe método `update` nem `delete` aqui, e isso é o contrato de TERM-03.

async publicar(data: { conteudo: string; publicadoPorId: string }) {
  const ultimo = await prisma.termoDeUso.findFirst({
    orderBy: { versao: "desc" },
    select: { versao: true },
  });

  try {
    return await prisma.termoDeUso.create({
      data: {
        versao: (ultimo?.versao ?? 0) + 1,
        conteudo: data.conteudo,
        publicadoPorId: data.publicadoPorId,
      },
      select: { id: true, versao: true, publicadoEm: true },
    });
  } catch (error) {
    // Duas publicações concorrentes leram o mesmo `MAX(versao)`. A constraint
    // única é a defesa correta — um findFirst antes do insert perde a corrida,
    // exatamente como o comentário de `EventoWebhookAsaas.eventoId` registra.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError("Outra publicação ocorreu em paralelo. Tente novamente.", 409);
    }
    throw error;
  }
}

async registrarAceite(usuarioId: string, termoId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Fato imutável primeiro...
      await tx.aceiteTermo.create({ data: { usuarioId, termoId } });
      // ...e o bookkeeping na MESMA transação. Nunca isolado: é esse acoplamento
      // que garante que `Usuario.termoAceitoId` seja sempre reconstruível a
      // partir de AceiteTermo.
      await tx.usuario.update({ where: { id: usuarioId }, data: { termoAceitoId: termoId } });
    });
  } catch (error) {
    // P2002 = já aceitou esta versão (duplo clique / retry). Não é erro:
    // o estado desejado já está no banco.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}
```

### Renderização do texto (D-05, sem XSS)

```tsx
{/* Nó de texto React: escape automático. `dangerouslySetInnerHTML` NUNCA. */}
<div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
  {termo.conteudo}
</div>
```

### Disclosure do termo no registro (sem componente de modal novo)

O projeto **não tem componente de modal reutilizável** (confirmado na Fase 4 e nesta pesquisa). Existe, porém, `app/[slug]/admin/(protected)/_components/collapsible-section.tsx` — um `<details>/<summary>` estilizado, 15 linhas, zero JS. Reaproveitar o **padrão** (não importar o arquivo, que vive dentro de `(protected)`) resolve D-11 sem estabelecer um sistema de modais:

```tsx
<details className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
  <summary className="cursor-pointer select-none text-sm font-medium text-slate-600">
    Ler os Termos de Uso (v{termo.versao})
  </summary>
  <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-slate-600">
    {termo.conteudo}
  </div>
</details>

<label className="flex items-start gap-2 text-xs text-slate-600">
  <input type="checkbox" name="aceiteTermos" required className="mt-0.5" />
  <span>Li e aceito os Termos de Uso</span>
</label>
<input type="hidden" name="termoId" value={termo.id} />
```

`required` no input é a metade client-side de D-11; a Server Action recusar sem ele é a metade server-side. **As duas, sempre** — "nunca confiar só no client" é o padrão explícito de `app/registro/actions.ts`.

---

## Runtime State Inventory

Esta fase não é rename/refactor, mas **introduz estado novo em bancos que já existem** (dev, e2e local, e o banco de produção da Fase 4). O inventário abaixo é o que existe *fora* do repositório e precisa de tratamento.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | Todas as linhas de `Usuario` existentes terão `termoAceitoId = NULL` após a migration. Com a v1 semeada, **100% dos usuários existentes entram em `termosPendentes = true`** e verão a tela de aceite no próximo request autenticado. | **Nenhuma. Isto é o comportamento desejado** (goal da fase: "ninguém usa a plataforma sem ter aceitado a versão vigente"). Mas precisa ser comunicado — todo cliente ativo verá uma tela nova sem aviso prévio. Candidato a checkpoint humano antes do deploy |
| **Live service config** | Nenhuma. Asaas (webhook, checkout) não conhece termos de uso; nenhum workflow externo referencia estas tabelas. | Nenhuma — verificado por grep em `lib/billing/` e `app/api/webhooks/` |
| **OS-registered state** | Nenhuma. O único agendamento do projeto é o cron de `/api/cron/reconciliacao-diaria`, que opera sobre os 4 fatos de billing e não toca termos (D-06 da Fase 5). | Nenhuma |
| **Secrets/env vars** | Nenhuma variável nova. A senha do SUPERADMIN é argumento de linha de comando do seed, não env var de aplicação. | Nenhuma. **NÃO** adicionar `SUPERADMIN_PASSWORD` ao `.env` — nada em runtime precisa dela |
| **Build artifacts** | `node_modules/.prisma/client` precisa de `prisma generate` após a mudança de schema (a CI já faz; dev local precisa lembrar). Ver também a divergência `zod@4.4.3` vs `^4.5.4` em `## Package Legitimacy Audit`. | `npx prisma generate` local; `npm ci` para normalizar a árvore |

**Ordem de deploy:** migration (enum) → migration (v1 dos termos) → deploy da aplicação → `npm run seed:superadmin` em produção. Rodar o seed antes do deploy da aplicação é inofensivo; rodar a migration de enum depois do código que usa `SUPERADMIN` produz erro de runtime no Prisma.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Tudo | ✓ | v22 (CI e `package.json` engines implícitos) | — |
| PostgreSQL | Migrations, e2e | ✓ (CI: `postgres:16` service; local: `DATABASE_URL`) | 16 na CI | — |
| `prisma` CLI | `migrate dev` / `migrate deploy` / `generate` | ✓ | 7.9.1 (dependência direta) | — |
| `gen_random_uuid()` (pgcrypto/builtin) | Migration de seed da v1 | ✓ | Builtin desde PG 13 | `uuid_generate_v4()` ou UUID literal fixo |
| Playwright + Chromium | e2e | ✓ | 1.62.1 | — |
| Vitest | Unit/component | ✓ | 4.1.10 | — |
| `zod` | Validação do publish | ⚠️ | Lock diz 4.5.4; instalado 4.4.3 | Validação manual (padrão de `app/registro/actions.ts`) — mas melhor resolver a árvore com `npm ci` |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** apenas a divergência de `zod` acima, que é de árvore instalada e não de disponibilidade.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit/component) + Playwright 1.62.1 (e2e) |
| Config file | `vitest.config.mts` / `playwright.config.ts` |
| Setup global | `tests/setup/vitest.setup.ts` → importa `tests/setup/prisma-mock.ts` |
| Quick run command | `npx vitest run <caminho-do-arquivo>` |
| Full suite command | `npm run test` (Vitest) · `npm run test:e2e` (Playwright, exige Postgres) |
| Gate de fase (padrão) | `npm run gates:fase-06` — script `.mjs` em `scripts/`, no molde de `gates-fase-04.mjs` / `gates-fase-05.mjs` |

**Padrão de mock a replicar** (`tests/setup/prisma-mock.ts`): `mockDeep<PrismaClient>()` do `vitest-mock-extended`, exposto como `prismaMock`, resetado num `beforeEach` global que **também** re-stuba `prismaMock.usuario.findFirst` com uma conta ativa default. ⚠️ **Esse stub default vai precisar ganhar `termoAceitoId`** — se ficar `undefined`, e `termoVigente()` devolver um termo, **todo teste autenticado existente passa a ter `termosPendentes = true`** e recebe 403/redirect. Mesma classe de regressão em massa que a Fase 2 causou ao adicionar fatos de billing àquele stub, e que o próprio comentário do arquivo documenta. **Item de Wave 0 obrigatório.**

**Padrão de teste de página com `redirect`** (`app/[slug]/admin/bloqueado/page.test.ts`): `// @vitest-environment node`, `vi.hoisted` para os mocks, `redirectMock` que **lança** `REDIRECT:<url>`, e asserções `await expect(renderizar()).rejects.toThrow("REDIRECT:/...")`. Copiar literalmente para a tela de aceite.

**Padrão de teste de service** (`app/services/acesso.service.test.ts`): `// @vitest-environment node`, `prismaMock` importado do setup, e um helper `mockTransaction()` que faz `prismaMock.$transaction.mockImplementation(cb => Promise.resolve(cb(prismaMock)))`. Necessário para testar `registrarAceite` e a transação de registro.

**Padrão de teste de rota role-gated:** não existe ainda — esta fase cria o primeiro. A base é `tests/helpers/request.ts` (`buildRequest({ token })`) + `tests/helpers/auth.ts` (`buildAuthToken({ role: "SUPERADMIN" })`). ⚠️ **Atenção:** `buildAuthToken` altera o **token**; para que a rota autorize, o que precisa mudar é o retorno de `prismaMock.usuario.findFirst` (a role fresca). Um teste que só troque a role do token e espere 201 **estará testando a implementação errada** — e, se passar, prova que o código caiu no Pitfall 2. Escrever **os dois** casos: token SUPERADMIN + banco ADMIN → **403** (prova a não-vacuidade), e token+banco SUPERADMIN → 201.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TERM-01 | Server Action recusa registro sem `aceiteTermos` | unit | `npx vitest run app/registro/actions.test.ts` | ❌ Wave 0 (arquivo não existe) |
| TERM-01 | Registro grava `AceiteTermo` na mesma transação de Empresa+Usuario | unit | `npx vitest run app/services/empresa.service.test.ts` | ✅ existe, estender |
| TERM-01 | Checkbox obrigatório e `<details>` com o texto renderizam | component | `npx vitest run app/registro/_components/register-form.test.tsx` | ✅ existe, estender |
| TERM-01 | Cadastro completo pela UI com aceite | e2e | `npx playwright test e2e/cadastro-e-login.spec.ts` | ✅ existe, **atualizar (Pitfall 6)** |
| TERM-02 | SUPERADMIN publica → 201; ADMIN → 403; anônimo → 401 | unit | `npx vitest run app/api/termos/route.test.ts` | ❌ Wave 0 |
| TERM-02 | Role stale no token não autoriza (não-vacuidade do Pitfall 2) | unit | `npx vitest run app/api/termos/route.test.ts` | ❌ Wave 0 |
| TERM-02 | Nenhum caminho HTTP escreve `role` | gate (grep) | `npm run gates:fase-06` | ❌ Wave 0 |
| TERM-03 | `publicar` sempre INSERT; versão incrementa; P2002 → 409 | unit | `npx vitest run app/services/termo.service.test.ts` | ❌ Wave 0 |
| TERM-03 | `registrarAceite` grava fato + bookkeeping na mesma tx; P2002 é idempotente | unit | `npx vitest run app/services/termo.service.test.ts` | ❌ Wave 0 |
| TERM-03 | Service não expõe `update`/`delete` de `TermoDeUso` | gate (grep) | `npm run gates:fase-06` | ❌ Wave 0 |
| TERM-04 | `revalidarConta` calcula `termosPendentes`; SUPERADMIN sempre `false`; sem termo publicado → `false` | unit | `npx vitest run lib/auth-guard.test.ts` | ✅ existe, estender |
| TERM-04 | `requireAdminSession` redireciona para `/aceitar-termos`, e só depois do gate de bloqueio | unit | `npx vitest run lib/session.test.ts` | ✅ existe, estender |
| TERM-04 | `requireAuth` devolve 403 com termos pendentes | unit | `npx vitest run lib/api-auth.test.ts` | ✅ existe, estender |
| TERM-04 | Guarda simétrica da rota de aceite (4 estados da máquina) | unit | `npx vitest run "app/[slug]/admin/aceitar-termos/page.test.ts"` | ❌ Wave 0 |
| TERM-04 | Gate → aceita → volta ao admin; logout funciona sem loop | e2e | `npx playwright test e2e/aceite-de-termos.spec.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run <arquivos tocados>` (< 5 s)
- **Per wave merge:** `npm run test` + `npm run lint` + `npx tsc --noEmit`
- **Phase gate:** `npm run test` verde, `npm run test:e2e` verde (Postgres real), `npm run gates:fase-06` verde, antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/setup/prisma-mock.ts` — adicionar `termoAceitoId` ao stub default de `usuario.findFirst` **antes** de qualquer outra coisa (senão a suíte inteira fica vermelha por um motivo só)
- [ ] Decidir e implementar o stub default de `termoVigente()` na suíte (mockar o módulo, ou stubar `prismaMock.termoDeUso.findFirst`)
- [ ] `app/services/termo.service.test.ts` — cobre TERM-02, TERM-03
- [ ] `app/api/termos/route.test.ts` — cobre TERM-02 (inclusive o caso de não-vacuidade)
- [ ] `app/[slug]/admin/aceitar-termos/page.test.ts` — cobre TERM-04 (4 estados)
- [ ] `app/registro/actions.test.ts` — cobre TERM-01 (não existe teste da Server Action de registro hoje)
- [ ] `e2e/aceite-de-termos.spec.ts` — cobre TERM-04 fim a fim, inclusive logout
- [ ] `scripts/gates-fase-06.mjs` + entrada em `package.json` — gates de grep (descartar linhas de comentário, decisão `[04-09]`)
- [ ] Atualizar os helpers de registro dos **9** specs e2e (Pitfall 6)

*Nenhum gap de framework: `lib/session.test.ts`, `lib/auth-guard.test.ts` e `lib/api-auth.test.ts` já existem e só precisam ser estendidos.*

---

## Security Domain

### Applicable ASVS Categories (nível 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Arquitetura | sim | DAL única (`revalidarConta`) calcula o predicado; guards aplicam. Zero duplicação da regra |
| V2 Authentication | não (sem mudança) | Login/sessão inalterados; SUPERADMIN usa o fluxo existente (D-01) |
| V3 Session Management | parcial | Cookie `admin_session` httpOnly/sameSite=lax/secure em produção — inalterado. A tela de aceite **não** cria sessão nova |
| V4 Access Control | **sim — núcleo da fase** | Primeira checagem de `role` do projeto. Deve ler a role **do banco** (`revalidarConta`), não do JWT. Deny-by-default: qualquer role ≠ SUPERADMIN → 403 |
| V5 Input Validation | **sim** | `zod` no corpo do publish (`conteudo` string, trim, min 1, max 200 000). `termoId` do formulário validado por **igualdade contra o vigente do servidor**, nunca usado como veio |
| V6 Cryptography | não (sem mudança) | Senha do superadmin usa `bcrypt.hash(…, 10)`, idêntico ao resto |
| V7 Error Handling & Logging | sim | Mensagens genéricas ao cliente; `console.error` no servidor. Não distinguir "não é superadmin" de "não autenticado" no corpo |
| V13 API | sim | `POST /api/termos` sem query param; corpo estritamente `{ conteudo }` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Escalação por role stale no JWT (7 dias) | Elevation of Privilege | Autorizar por `revalidarConta().role`; gate de grep proibindo `auth.role ===` / `session.role ===` |
| Escalação por escrita de `role` via HTTP | Elevation of Privilege | Allowlists de `usuarioService.create`/`update` não incluem `role` **(verificado)**; travar com gate de grep |
| Segundo usuário anexado à empresa da plataforma | Elevation of Privilege | `@@unique([empresaId])` + guarda de `usuarioService.create` **(verificado)**. ⚠️ `POST /api/usuarios` continua sem `requireAuth` — hardening recomendado |
| Vazamento de dados por gate em `layout.tsx` | Information Disclosure | Gate na DAL de sessão, chamada por cada page (Pitfall 3) |
| Bypass do gate pela superfície REST | Elevation of Privilege | Espelho em `requireAuth` (Achado Crítico 2) |
| Aceite gravado em nome de outro usuário | Spoofing / Tampering | `usuarioId` **sempre** derivado da sessão; nunca do `FormData` (Pitfall 8) |
| Aceite contra versão não vista (TOCTOU) | Repudiation | `termoId` hidden + igualdade contra o vigente (Pitfall 4) |
| XSS pelo texto dos termos | Tampering | Texto puro + nó de texto React; `dangerouslySetInnerHTML` proibido (D-05) |
| DoS por `conteudo` gigante | Denial of Service | `max(200_000)` no zod — o texto entra no RSC Payload de toda tela de aceite |
| Open redirect no retorno pós-aceite | Tampering | Não usar `?next=`; ir direto para `/{slug}/admin` |
| Enumeração do tenant interno | Information Disclosure | Slug não-adivinhável (Achado Crítico 3) |
| Impasse: SUPERADMIN bloqueado pelo próprio gate | Denial of Service | D-02 (`acessoVitalicio`) + D-03 (isenção), ambos comentados **como mitigação de impasse** (Pitfall 9) |

**Nota de escopo:** rate limiting no endpoint de publicação **não** é recomendado nesta fase — há um único chamador humano e o projeto não tem infraestrutura de rate limiting. Registrar como aceito conscientemente.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `return null` no layout para bloquear rota | Gate na DAL, chamada por cada page/Server Action | App Router (Next 13+); reafirmado nos docs de 16.3.0 | Padrão já adotado pela Fase 4 — esta fase só o repete |
| Proxy/middleware como boundary de autorização | Proxy faz checagem **otimista** de cookie; autorização real na DAL | Docs de 16.3.0, § Authorization | `proxy.ts` já segue |
| Server Actions "protegidas pelo componente que as chama" | Server Actions são endpoints públicos e verificam autorização por conta própria | Docs de 16.3.0, `authentication.md:1459-1461` | A action de aceite precisa de guarda própria (Pitfall 8) |
| Migration única para enum + backfill | Duas migrations obrigatórias | PostgreSQL 12 relaxou a restrição, mas o valor segue inutilizável dentro da transação | Já documentado no repo (Fase 5, Pitfall 7) |
| Carregamento de relações por JOIN | Prisma carrega relações com queries separadas por padrão | `relationJoins` continua preview e **não está habilitado** aqui | Motiva a denormalização de `termoAceitoId` (Ponto de Extensão 2) |

**Deprecated/outdated (não usar nesta fase):**
- `unstable_cache` / `'use cache'` em qualquer leitura de autorização — proibido pela decisão `[01-02]` e por T-04-08.
- Modal client-side sobreposto como gate — vetado por D-08 e pelos docs do Next.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O aceite **não** precisa capturar IP/user-agent para valor jurídico no Brasil (LGPD/CDC); `usuarioId + termoId + aceitoEm` bastam | `## Schema Recomendado` | Se a assessoria jurídica exigir IP/UA, é migration nova + captura de dado pessoal adicional. **Barato agora, caro depois.** Confirmar com o usuário — a nota de STATE.md "Revisão jurídica (CDC) sobre bloqueio... fora do escopo técnico" sugere que essa revisão ainda não aconteceu |
| A2 | Registros de aceite podem desaparecer junto com o `Usuario` (`onDelete: Cascade` herdado de `Empresa`) | `## Schema Recomendado` | Se houver dever de retenção da prova de consentimento após o encerramento da conta, o cascade destrói a prova exatamente quando ela importa. O projeto já enfrentou isso e resolveu de forma OPOSTA em `EventoWebhookAsaas` (FK deliberadamente ausente, comentário no schema) |
| A3 | Um único SUPERADMIN basta (consequência de `@@unique([empresaId])` + D-01) | `## Ponto de Extensão 1` | Se forem necessários dois, exige uma segunda empresa interna — funciona, mas é feio e ninguém vai adivinhar |
| A4 | O texto real dos termos será fornecido antes do merge | `## Ponto de Extensão 5` | Placeholder em produção = todos os clientes aceitaram um lorem ipsum. **Exige `checkpoint:human-verify`** |
| A5 | Gatear a superfície REST (`requireAuth`) está dentro do espírito de TERM-04 | `## Achado Crítico 2` | Se o usuário não quiser, é uma linha a menos; se quiser e for esquecido, o requisito fica furado por uma porta que o e2e existente já usa |
| A6 | Um `403` para termos pendentes na API não quebra nenhum cliente existente | `## Achado Crítico 2` | Não há cliente de API externo conhecido além dos testes; se houver integração de terceiro, ela quebra até o admin aceitar |
| A7 | O `max(200_000)` no `conteudo` é folgado o bastante para termos reais | `## Security Domain` | ~200 mil caracteres ≈ 60 páginas. Improvável ser insuficiente, mas é um número escolhido, não medido |

---

## Open Questions (RESOLVED)

1. **A tela de aceite deve mostrar o *diff* em relação à versão anterior?**
   - RESOLVED: **não** nesta fase — texto puro não tem estrutura para diff legível, e diff de texto exigiria biblioteca nova (viola "zero pacotes"). Adotado pelo planner sem um task correspondente; registrado em `06-CONTEXT.md` §Deferred Ideas.
   - O que sabemos: D-09 pede o texto completo da versão vigente.
   - O que não está claro: se um usuário que já aceitou a v3 e vê a v4 deveria ver o que mudou.

2. **O SUPERADMIN precisa ver alguma tela de admin depois de logar?**
   - RESOLVED: aceitar o painel vazio (funciona, não quebra nada), sem UI nova. Nenhum plano introduz uma home diferenciada por role — consistente com D-04.
   - O que sabemos: D-04 descartou UI de superadmin; D-01 diz que ele loga pelo fluxo normal.
   - O que não está claro: ele cairá no painel de admin da empresa interna, que estará vazio (zero produtos, zero combos).

3. **Quem informa os clientes existentes de que verão uma tela de aceite nova?**
   - RESOLVED: `06-08-PLAN.md` emite um `<human-check>` cobrindo exatamente este ponto antes do go-live em produção (formato `human_verify_mode: end-of-phase` deste projeto, em vez de `checkpoint:human-verify` inline).
   - O que sabemos: 100% dos usuários existentes entram no gate no próximo request (Runtime State Inventory).
   - O que não está claro: se há comunicação prévia planejada — permanece uma decisão do operador, não do código.

4. **A divergência `zod@4.4.3` vs `^4.5.4` deve ser resolvida nesta fase?**
   - RESOLVED: **não** — nenhum plano depende de resolver a divergência (zod já é dependência instalada e funcional para os usos desta fase). Fica como item separado, fora do escopo da Fase 6, a ser investigado quando causar um problema real.
   - O que sabemos: pré-existe; `npm ls` sai com erro; o lockfile discorda da árvore instalada.

---

## Sources

### Primary (HIGH confidence)
- **Código do próprio repositório** (lido integralmente nesta sessão): `prisma/schema.prisma`, `prisma/migrations/20260901195303_add_worker_diario_causa/migration.sql`, `lib/session.ts`, `lib/auth-guard.ts`, `lib/api-auth.ts`, `lib/jwt.ts`, `lib/http-error.ts`, `lib/prisma.ts`, `lib/empresa-publicavel.ts`, `lib/avaliar-acesso.ts` (parcial), `lib/slug.ts`, `proxy.ts`, `app/services/empresa.service.ts`, `app/services/usuario.service.ts`, `app/services/acesso.service.ts`, `app/registro/actions.ts`, `app/registro/page.tsx`, `app/registro/_components/register-form.tsx`, `app/[slug]/admin/(protected)/layout.tsx`, `app/[slug]/admin/bloqueado/page.tsx`, `app/[slug]/admin/bloqueado/page.test.ts`, `app/[slug]/admin/bloqueado/_components/bloqueado-card.tsx`, `app/[slug]/admin/_lib/auth-actions.ts`, `app/[slug]/admin/_lib/guards.ts`, `app/api/usuarios/route.ts`, `app/api/usuarios/[id]/route.ts`, `app/api/empresas/route.ts`, `app/api/cron/reconciliacao-diaria/route.ts`, `app/services/acesso.service.test.ts`, `tests/setup/prisma-mock.ts`, `tests/setup/vitest.setup.ts`, `tests/helpers/auth.ts`, `tests/helpers/request.ts`, `e2e/helpers.ts`, `e2e/bloqueio-por-inadimplencia.spec.ts`, `scripts/seed-fatos-billing.ts`, `scripts/resolvedor-ts.mjs`, `package.json`, `package-lock.json`, `vitest.config.mts`, `playwright.config.ts`, `.github/workflows/tests.yml`
- **Docs empacotados do Next 16.3.0** — `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (§ Authorization, § Server Actions, linhas 1011-1028, 1456-1461), `redirecting.md` (linhas 19-89), `forms.md` (§ Form validation), `data-security.md` (índice de seções)
- **PostgreSQL official docs** — `postgresql.org/docs/current/sql-altertype.html` § Notes (citação literal obtida por fetch nesta sessão)
- **Comandos executados:** `npm ls zod`, `grep -c relationLoadStrategy node_modules/.prisma/client/index.d.ts` (= 0), enumeração de `app/api/**`, `e2e/*.spec.ts`, `app/services/*.service.ts`

### Secondary (MEDIUM confidence)
- **Skills do projeto** (`.agents/skills/prisma-client-api/references/`) — `model-queries.md`, `relations.md`, `transactions.md`, `query-options.md`: confirmam a forma de `orderBy`/`take`/`select` aninhado usada nos exemplos
- **WebSearch** — práticas de consent record versionado (estrutura imutável: identidade + versão exata + timestamp; reconstrutibilidade do texto apresentado). Convergente entre múltiplas fontes, mas nenhuma é norma jurídica brasileira

### Tertiary (LOW confidence)
- Interpretação de requisitos de retenção/LGPD para prova de consentimento — **não verificada com fonte jurídica**; ver Assumptions Log A1 e A2

**Não disponível nesta sessão:** Context7 e todos os provedores de busca configuráveis (`exa_search`, `brave_search`, `firecrawl`, `tavily_search`, `ref_search`, `perplexity`, `jina` estão `false` em `.planning/config.json`). O impacto é baixo: o domínio desta fase é ~90% interno ao repositório, e as duas perguntas externas relevantes foram resolvidas contra documentação oficial de primeira mão (PostgreSQL e docs empacotados do Next).

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — zero pacotes novos; tudo verificado em `package.json` e na árvore instalada
- Arquitetura / pontos de extensão: **HIGH** — todo arquivo citado foi lido nesta sessão; todos os padrões têm precedente executando em produção neste projeto
- Schema recomendado: **HIGH** para forma e constraints; **MEDIUM** para as escolhas de retenção (ver A1/A2)
- Pitfalls: **HIGH** — 7 dos 9 são reproduções documentadas de incidentes deste próprio repositório; o Pitfall 1 é confirmado pela doc oficial do PostgreSQL
- Máquina de estados do gate: **HIGH** — verificação exaustiva de 5 estados × 3 rotas
- Requisitos legais de consentimento: **LOW** — assumido, não verificado

**Research date:** 2026-09-02
**Valid until:** 2026-10-02 (30 dias — stack estável, sem dependências de ecossistema em movimento). Reavaliar antes se `next`, `prisma` ou `zod` tiverem major/minor bump.
