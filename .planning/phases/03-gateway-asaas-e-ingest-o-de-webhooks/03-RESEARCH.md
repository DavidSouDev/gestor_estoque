# Phase 3: Gateway Asaas e Ingestão de Webhooks - Research

**Researched:** 2026-08-31
**Domain:** Integração com gateway de pagamento brasileiro (Asaas API v3) — checkout hospedado, assinatura recorrente e ingestão idempotente de webhooks
**Confidence:** MEDIUM-HIGH (endpoints, payloads, eventos e mecanismo de autenticação confirmados na documentação oficial `docs.asaas.com`; nenhuma chamada real foi feita — não existe conta Asaas ainda, per D-05)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Gateway e comparação**
- **D-01:** Mantido Asaas (decisão já travada no PROJECT.md) mesmo após comparação direta com Mercado Pago, apresentada nesta discussão porque o usuário já tem conta no Mercado Pago. Motivo de manter: a API `preapproval` do Mercado Pago é mais fraca para o requisito de reativação por período ("N meses atrasados, quitar todos para reativar") — o modelo do Asaas, onde cada mês vira um `payment` independente com seu próprio Pix/status `OVERDUE`, resolve isso quase de graça. O Mercado Pago venceria em Pix mais barato (0,99% vs Asaas) e por já ter conta pronta (elimina a fricção de onboarding), mas isso não superou a fraqueza de modelagem para reativação.
- **D-02:** Preço mensal do plano único: **R$29,90/mês** (substitui a suposição de ~R$49,90 usada na pesquisa de comparação de taxas — recalcular a taxa efetiva do Asaas neste ticket ao planejar, não copiar o número da pesquisa).

**Momento e escopo do checkout**
- **D-03:** O checkout do Asaas é iniciado **perto do fim do trial** (quando o trial está acabando/venceu), não no momento do registro. A empresa usa os 14 dias livremente sem precisar informar método de pagamento no cadastro.
- **D-04:** Esta fase constrói **só o backend** do checkout — o endpoint que cria a sessão no Asaas e devolve o link/URL hospedada. O ponto de entrada de UI (botão/banner que a empresa vê para iniciar o checkout) fica para a Fase 4 (banner de carência, ACC-01) ou Fase 7 (gestão de assinatura) — não construir nenhuma tela nesta fase.

**Conta e ambiente Asaas**
- **D-05:** Não existe conta Asaas (sandbox ou produção) no momento desta discussão. O usuário vai criar a conta sandbox por fora e adicionar as credenciais (API key) no `.env` quando o plano pedir — isso vira um checkpoint de `human-action` no plano (pedido de credenciais), não um bloqueador de pesquisa/discussão.
- **D-06 (carregado de `02-RESEARCH.md`/`STACK.md`, não re-discutido):** Sandbox em `https://api-sandbox.asaas.com/v3`; tokenização de cartão já habilitada em sandbox, mas em produção exige liberação com gerente de contas — mais um motivo para usar exclusivamente o Checkout hospedado, nunca tokenização client-side.

**Falha ao criar assinatura**
- **D-07:** Se a chamada ao Asaas falhar ao criar a assinatura/checkout (erro de rede, chave inválida, 500 do gateway), a resposta é um erro claro na tela com opção de tentar de novo — **nenhuma assinatura parcial ou registro inconsistente fica salvo no banco**. Não construir mecanismo de retry automático nem estado de "tentativa pendente" nesta fase (isso ficaria a cargo do worker da Fase 5, que está fora de escopo aqui).

### Claude's Discretion
- Estrutura exata do cliente HTTP tipado para a API do Asaas (não usar os pacotes `asaas`/`asaas-sdk` do npm — comunitários e desatualizados, per `02-RESEARCH.md`/`STACK.md` § "What NOT to Use" e Package Legitimacy Audit).
- Estratégia de validação de payload do webhook (ex.: `zod`, já recomendado em `STACK.md`).
- Mecanismo exato de idempotência do webhook (ex.: tabela de eventos processados vs. campo único) — desde que satisfaça GTW-04 (mesmo evento 2x não processa 2x; evento antigo fora de ordem não sobrescreve estado mais recente).
- Nome do novo valor de `CausaTransicaoAcesso` para transições originadas por webhook (D-14 da Fase 2 reservou esse ponto de extensão; ex.: `WEBHOOK_PAGAMENTO`).
- Estratégia de log/observabilidade do webhook (Sentry vs. `pino` vs. `console.error` com prefixo, seguindo o padrão `[acesso]`/`[auth-guard]` já estabelecido) — `STACK.md` recomenda Sentry dado que hoje há zero error tracking e uma falha silenciosa aqui pode significar cliente pagante bloqueado incorretamente.

### Deferred Ideas (OUT OF SCOPE)
- Botão/tela para iniciar o checkout — pertence à Fase 4 (banner de carência) ou Fase 7 (gestão de assinatura), não a esta fase (D-04).
- Retry automático de assinatura que falhou ao criar — descartado para esta fase (D-07); poderia voltar como ideia se o worker da Fase 5 quiser assumir isso.
- Reavaliação de Mercado Pago como gateway — descartada nesta discussão (D-01) por causa da fraqueza da API `preapproval` para o requisito de reativação por período; poderia ser revisitada no futuro se o Asaas se provar operacionalmente ruim (ex.: a fila de webhook pausando após 15 falhas se tornar um problema recorrente na prática).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **GTW-01** | Integração com Asaas para assinatura recorrente via checkout hospedado — nenhum dado de cartão/pagamento é armazenado no banco próprio | § Standard Stack (endpoint `POST /v3/checkouts` com `chargeTypes: ["RECURRENT"]`), § Code Examples #1 e #2, § Pattern 1 (cliente HTTP tipado), § Pitfall 9 (nunca persistir `creditCard`) |
| **GTW-02** | Endpoint de webhook do Asaas verifica autenticidade, é idempotente e responde 200 imediatamente, processando o restante de forma assíncrona | § Architecture Patterns → Pattern 2 (persist-then-ack), § Code Examples #3 e #4, § Pitfall 1 (auth é token estático, não HMAC), § Pitfall 2 (timeout 10s / só HTTP 200), § Don't Hand-Roll (`agendarPosResposta` já existe) |
| **GTW-03** | Webhook de pagamento confirmado atualiza `acessoAte` da empresa e encerra qualquer carência em curso | § Pattern 3 (escrita monotônica de `acessoAte`), § Code Examples #5, § Pitfall 5 (derivar `acessoAte` de `payment.dueDate`, não de `now`), § Pitfall 6 (parsing de data do Asaas) |
| **GTW-04** | Webhook de pagamento atrasado/falho inicia a contagem da carência de 10 dias | § Pattern 4 — **descoberta central: `PAYMENT_OVERDUE` não deve escrever nada**; `avaliarAcesso()` (Fase 2) já deriva `CARENCIA` de `acessoAte + DIAS_DE_CARENCIA`. Ver § Pattern 4 e § Pitfall 4 |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

Diretivas acionáveis extraídas de `CLAUDE.md` e `AGENTS.md` que o planner **deve** respeitar:

| # | Diretiva | Origem | Impacto nesta fase |
|---|----------|--------|--------------------|
| C-01 | **Next.js 16.3.0 tem breaking changes vs. training data.** Ler `node_modules/next/dist/docs/` antes de escrever código. | `AGENTS.md` | O route handler de webhook e `after()` de `next/server` precisam ser conferidos contra a doc empacotada, não contra memória |
| C-02 | Serviços em `app/services/[entity].service.ts`, classe + singleton exportado como `const` | `CLAUDE.md` § Conventions | `asaas.service.ts` / `assinatura.service.ts` / `webhook-asaas.service.ts` seguem esse formato |
| C-03 | Testes co-localizados: `[entity].service.test.ts`, `[Component].test.tsx` | `CLAUDE.md` | Cada serviço novo nasce com teste ao lado |
| C-04 | Imports internos sempre com alias `@/`, nunca `../` cross-directory | `CLAUDE.md` | Vale para todo arquivo novo (note que `app/api/produtos/route.ts` viola isso hoje — não copiar o desvio) |
| C-05 | Erros: `HttpError` / `AuthError` com `status`; `console.error()` para exceções; mensagem genérica ao cliente, detalhe no log | `CLAUDE.md` § Error Handling | O endpoint de checkout usa `HttpError`; o de webhook responde 200/401 sem vazar detalhe |
| C-06 | Sem logging estruturado no projeto (`console.error` apenas). Sem `console.log` em produção | `CLAUDE.md` § Logging | Adotar prefixo `[asaas]` / `[webhook-asaas]`, coerente com `[acesso]` / `[auth-guard]` |
| C-07 | `select` explícito no Prisma; nunca `include` em `Usuario` (arrasta `senhaHash`) | `CLAUDE.md` § Module Design | Queries do webhook usam `select` nomeado |
| C-08 | Multi-tenancy: todo serviço filtra por `empresaId`; rotas verificam ownership antes de mutar | `CLAUDE.md` § Architectural Constraints | O webhook resolve `empresaId` a partir de dados **próprios** (mapa local), nunca de id vindo do cliente |
| C-09 | ESLint 9 flat config, 2 espaços, ponto e vírgula, `npm run lint` | `CLAUDE.md` § Code Style | — |
| C-10 | `async/await`, nunca cadeias `.then()` | `CLAUDE.md` § Function Design | — |
| C-11 | **GSD Workflow Enforcement**: nenhuma edição direta fora de um comando GSD | `CLAUDE.md` | O planner produz PLANs; a execução acontece via `/gsd-execute-phase` |
| C-12 | Skills Prisma disponíveis em `.agents/skills/prisma-*` | `CLAUDE.md` § Project Skills | `prisma-cli` e `prisma-client-api` devem ser consultadas para a migration do enum e para o `updateMany` condicional |

---

## Summary

O Asaas resolve esta fase melhor do que a pesquisa de projeto previa, mas **por caminhos diferentes dos que `PITFALLS.md` assumiu**. Três correções materiais saíram desta pesquisa e devem ser tratadas como fatos, não opiniões:

1. **A autenticação do webhook do Asaas não é HMAC.** Não existe assinatura do corpo, nem timestamp, nem `constructEvent`. O Asaas envia um **token estático de 32–255 caracteres**, definido por você em `authToken` na criação do webhook, no header `asaas-access-token` de toda entrega [CITED: docs.asaas.com/docs/eventos-para-checkout]. Consequência prática: toda a orientação de `PITFALLS.md` sobre "ler `request.text()` antes de verificar a assinatura" e "checar frescor do timestamp para bloquear replay" **não se aplica** — `await request.json()` é seguro, e a defesa contra replay tem de vir inteiramente da tabela de idempotência + escrita monotônica. Em compensação, um token estático é *replayável por quem o capturar*, o que torna o **re-fetch da cobrança na API do Asaas antes de conceder acesso** uma exigência de segurança, não um luxo.

2. **O Asaas documenta oficialmente o padrão exato que GTW-02 e GTW-04 pedem.** A página "Como implementar idempotência em Webhooks" prescreve, com SQL PostgreSQL de exemplo: persistir o `id` do evento sob restrição de unicidade → responder `HTTP 200` → processar em segundo plano → marcar como `DONE`. O `id` do evento (`evt_<hash>&<seq>`) é estável entre reenvios [CITED: docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks]. E há um interruptor de ordenação: `sendType: "SEQUENTIALLY"` na criação do webhook faz o Asaas preservar a ordem cronológica dos eventos [CITED: docs.asaas.com/docs/tipos-de-envio]. Isso reduz — mas não elimina — o risco de fora-de-ordem; a defesa estrutural ainda é necessária.

3. **GTW-04 ("webhook de atraso inicia a carência de 10 dias") não deve escrever nada no banco.** O motor da Fase 2 (`lib/avaliar-acesso.ts`) já deriva `CARENCIA` puramente de `acessoAte`/`trialFim` + `DIAS_DE_CARENCIA`, sem status persistido (BILL-01, D-16). Assim que `acessoAte` vence, a empresa entra em carência automaticamente — o `PAYMENT_OVERDUE` é uma *notificação de que isso já aconteceu*, não um comando. Tratá-lo como no-op de estado (só registra o evento e, se houver, a linha de auditoria) faz o cenário "evento antigo fora de ordem" do GTW-04 ficar **estruturalmente impossível de corromper o estado**, em vez de depender de guardas de versão. Esta é a decisão arquitetural mais importante desta fase.

O restante da fase é convencional: um cliente `fetch` tipado (~150–200 linhas) sobre `https://api-sandbox.asaas.com/v3` com header `access_token`; `POST /v3/checkouts` com `chargeTypes: ["RECURRENT"]` + objeto `subscription` (cartão de crédito obrigatório para recorrência); o link entregue ao pagador é montado à mão como `https://asaas.com/checkoutSession/show?id=<id>`; e um route handler `app/api/webhooks/asaas/route.ts` que valida o header, persiste, responde 200 e delega o processamento para `agendarPosResposta()` — helper que **já existe** no projeto (`lib/agendar-pos-resposta.ts`, wrapper de `after()` do Next) e cuja documentação inline descreve exatamente esse caso de uso.

**Primary recommendation:** Modelar o webhook como um *ledger* (`EventoWebhookAsaas` com `eventoId @unique`), processar fora do ciclo do response via `agendarPosResposta`, tratar `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` como a **única** origem de escrita em `acessoAte` (e escrita **monotônica**, derivada de `payment.dueDate + 1 ciclo`, nunca de `Date.now()`), e tratar `PAYMENT_OVERDUE` como no-op de estado.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Captura de cartão / dados de pagamento | **CDN/Externo (páginas do Asaas)** | — | GTW-01 exige zero dado de pagamento no nosso banco. Página hospedada pelo Asaas mantém o projeto fora de escopo PCI SAQ-A-EP |
| Criação da sessão de checkout | **API/Backend** (`app/api/.../route.ts` + service) | — | Requer `ASAAS_API_KEY`; jamais pode ser chamado do browser. D-04: só backend nesta fase |
| Montagem da URL de checkout entregue ao pagador | **API/Backend** | Frontend (Fase 4/7 consome) | O `link` retornado pode vir `null`; a URL é montada a partir do `id` — regra de negócio, não de apresentação |
| Recepção e autenticação do webhook | **API/Backend** (route handler `runtime = "nodejs"`) | — | Precisa de `crypto.timingSafeEqual` e Prisma; Edge runtime não serve |
| Persistência do evento (idempotência) | **Database/Storage** (constraint `@unique`) | API/Backend | A unicidade tem de ser garantida pelo Postgres, não por um `if` na aplicação — é a única defesa correta contra entrega concorrente |
| Processamento do evento / mutação de `acessoAte` | **API/Backend** (fora do ciclo do response, via `after()`) | — | Timeout de 10s do Asaas; ver Pitfall 2 |
| Derivação do status de acesso (`EM_DIA`/`CARENCIA`) | **API/Backend** — função pura existente `lib/avaliar-acesso.ts` | — | Fase 2 já é dona disso. O webhook escreve **fatos**, nunca status |
| Auditoria da transição | **API/Backend** — `acessoService.registrarTransicao` (existente) | Database (CAS via `updateMany`) | Reusar o compare-and-swap da Fase 2; não reimplementar |
| Reconciliação de eventos perdidos / fila pausada | **Fora de escopo — Fase 5 (worker)** | — | O ledger `EventoWebhookAsaas` com `processadoEm = null` é a interface que a Fase 5 vai consumir |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fetch` (Node 22+ global) | nativo | Cliente HTTP para a API do Asaas | Não existe SDK oficial Node do Asaas [CITED: STACK.md § Gateway Comparison]. `fetch` nativo + tipos próprios é a opção **melhor**, não a de compromisso — zero dependência nova no caminho do dinheiro |
| `node:crypto` (`timingSafeEqual`, `randomBytes`) | nativo | Comparação do token do webhook e geração do `authToken` | Comparação de segredo com `===` vaza tempo. Nunca hand-roll (§ Don't Hand-Roll) |
| `next/server` → `after()` via `lib/agendar-pos-resposta.ts` | Next 16.3.0 (já instalado) | Processar o evento **depois** do 200 | Helper já existe no projeto, já testado (`lib/agendar-pos-resposta.test.ts`), já drena no `SIGTERM` e já tem fallback fora de request scope [VERIFIED: leitura direta de `lib/agendar-pos-resposta.ts`] |
| `@prisma/client` | 7.9.1 (já instalado) | Ledger de eventos + escrita monotônica de `acessoAte` | Já é o ORM do projeto |
| `zod` | `^4.5.4` [WARNING: flagged as suspicious — verify before using.] | Validação/narrowing do payload do webhook | Recomendado em `STACK.md` § Recommended Stack. **Obrigatoriamente não-estrito** — ver Pitfall 3 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cloudflared` ou `ngrok` (CLI, não npm) | — | Expor `localhost:3000/api/webhooks/asaas` para receber eventos reais do sandbox | Só em desenvolvimento. O Asaas **não tem CLI de forwarding** (Stripe tem `stripe listen`) — este é o maior gap de DX [CITED: STACK.md] |
| `@sentry/nextjs` | 10.72.0 | Error tracking do processamento assíncrono | **Recomendado adiar.** Ver § Alternatives Considered |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `zod` | Type guards manuais escritos à mão | Evita a única dependência nova. Mas o payload do Asaas é grande e aninhado, e a validação errada aqui vira bloqueio de cliente pagante. `zod` vale a dependência — desde que **não-estrita** (Pitfall 3) |
| Sentry nesta fase | `console.error` com prefixo `[webhook-asaas]` + coluna `erro` no ledger | **Recomendação: adiar Sentry.** O ledger `EventoWebhookAsaas` já dá observabilidade estruturada e consultável (`WHERE processadoEm IS NULL`), que é o que a Fase 5 precisa. Sentry adiciona SDK, instrumentação, DSN e config de sourcemaps a uma fase que já introduz gateway + webhook + migration. Introduzir Sentry como fase/ticket próprio |
| `POST /v3/checkouts` (checkout hospedado) | `POST /v3/subscriptions` + `creditCardToken` (tokenização) | Tokenização exige liberação com gerente de contas em produção (D-06) e coloca o PAN no browser (escopo PCI SAQ-A-EP). **Proibido nesta fase por GTW-01** |
| `sendType: "SEQUENTIALLY"` | `NON_SEQUENTIALLY` | `NON_SEQUENTIALLY` dá mais vazão mas nenhuma garantia de ordem. Com volume de dezenas de assinaturas, vazão é irrelevante — **use `SEQUENTIALLY`** [CITED: docs.asaas.com/docs/tipos-de-envio] |
| Ledger `EventoWebhookAsaas` + `after()` | Fila externa (QStash, BullMQ, SQS) | Fila externa é a resposta certa em escala; aqui adiciona um serviço e um segredo a mais para resolver um problema que a tabela + o worker da Fase 5 já resolvem. **Não adotar em v1** |

**Installation:**
```bash
npm install zod@^4.5.4
```

**Version verification** [VERIFIED: npm registry, 2026-08-31]:
```
npm view zod version      → 4.5.4  (publicado 2026-08-29)
npm view zod scripts.postinstall → (nenhum)
node --version            → v25.9.0
psql --version            → PostgreSQL 16.15
next                      → 16.3.0
@prisma/client            → 7.9.1
```

## Package Legitimacy Audit

Verificação executada via `gsd-tools query package-legitimacy check --ecosystem npm zod` e `npm view` em 2026-08-31.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `zod` | npm | última publicação 2026-08-29 (2 dias) | 274.747.331/semana | github.com/colinhacks/zod | **SUS** (motivo: `too-new`) | **Flagged — planner deve inserir `checkpoint:human-verify` antes do install** |

**Packages removed due to [SLOP] verdict:** nenhum
**Packages flagged as suspicious [SUS]:** `zod`

**Leitura do veredito SUS:** o sinal `too-new` do seam mede a data da **última publicação** (4.5.4, dois dias atrás), não a idade do pacote. `zod` tem 274 milhões de downloads semanais e repositório oficial `colinhacks/zod`, sem `postinstall`. É quase certamente um falso positivo do heurístico. Ainda assim, seguindo o protocolo, o planner **deve** adicionar um `checkpoint:human-verify` antes do `npm install zod`, e a task deve **pinar a versão** (`zod@^4.5.4`), nunca instalar `latest` sem pin.

**Pacotes explicitamente proibidos nesta fase** (herdado de `STACK.md` § "What NOT to Use", re-confirmado):
- `asaas@1.1.0` — wrapper comunitário, última publicação 2025-03, sem garantia de cobertura de `/v3/checkouts` nem dos eventos atuais
- `asaas-sdk@1.2.7` — abandonado desde 2022

Nenhum dos dois deve aparecer em nenhum PLAN.md desta fase.

## Architecture Patterns

### System Architecture Diagram

```
  ┌──────────────────────── FLUXO A: criação do checkout (GTW-01) ────────────────────────┐

  Admin autenticado                app/api/assinaturas/checkout (route.ts)
  (Fase 4/7 aciona;                ┌─────────────────────────────────────┐
   backend pronto aqui) ─POST─────▶│ requireAuth() → auth.empresaId      │
                                   │ (lib/api-auth.ts, C-08)             │
                                   └──────────────┬──────────────────────┘
                                                  │
                                                  ▼
                                   ┌─────────────────────────────────────┐
                                   │ assinaturaService.criarCheckout()   │
                                   │  1. lê Empresa (trialFim, nome,     │
                                   │     email do admin) — select        │
                                   └──────────────┬──────────────────────┘
                                                  │
                            ┌─────── D-07: nada é gravado antes do 2xx ──────┐
                                                  ▼
                                   ┌─────────────────────────────────────┐        ┌────────────────┐
                                   │ asaasClient.criarCheckout()         │──HTTPS▶│ Asaas API v3   │
                                   │  header access_token                │        │ POST /checkouts│
                                   │  chargeTypes:["RECURRENT"]          │◀──2xx──│                │
                                   │  billingTypes:["CREDIT_CARD"]       │        └────────────────┘
                                   │  externalReference = empresaId      │
                                   └──────────────┬──────────────────────┘
                                     erro de rede/4xx/5xx │      │ sucesso: { id, link, status }
                                                  ▼      │      ▼
                                   ┌──────────────────┐  │  ┌─────────────────────────────────┐
                                   │ HttpError 502    │  │  │ persiste CheckoutAsaas          │
                                   │ "tente de novo"  │  │  │ (asaasCheckoutId → empresaId)   │
                                   │ ZERO escrita     │  │  └────────────┬────────────────────┘
                                   └──────────────────┘  │               ▼
                                                         │  ┌─────────────────────────────────┐
                                                         └─▶│ 201 { url: .../checkoutSession/ │
                                                            │        show?id=<id> }           │
                                                            └─────────────────────────────────┘
                                                                          │
                                                            pagador digita cartão NA PÁGINA DO ASAAS
                                                            (zero dado de pagamento no nosso banco)


  ┌────────────── FLUXO B: ingestão de webhook (GTW-02/03/04) ──────────────┐

  ┌────────────────┐   POST + header asaas-access-token
  │ Asaas          │──────────────────────┐
  │ fila de envio  │  timeout 10s         │
  │ SEQUENTIALLY   │  só HTTP 200 = ok    │
  │ 15 falhas =    │  14 dias retenção    │
  │ fila PAUSADA   │                      ▼
  └────────────────┘        app/api/webhooks/asaas/route.ts (runtime = "nodejs")
         ▲                  ┌────────────────────────────────────────────────┐
         │                  │ (1) timingSafeEqual(header, ASAAS_WEBHOOK_TOKEN)│──inválido──▶ 401
         │                  └───────────────────┬────────────────────────────┘              (não é
         │                                      ▼ válido                                     entrega
         │                  ┌────────────────────────────────────────────────┐               do Asaas)
         │                  │ (2) await request.json()  ── seguro: não há    │
         │                  │     assinatura de corpo (Pitfall 1)            │
         │                  │     zod NÃO-ESTRITO (Pitfall 3)                │──inválido──▶ 200 + log
         │                  └───────────────────┬────────────────────────────┘
         │                                      ▼
         │                  ┌────────────────────────────────────────────────┐   P2002   ┌───────────┐
         │                  │ (3) INSERT EventoWebhookAsaas                  │──────────▶│ duplicado │
         │                  │     eventoId @unique  ← evt_<hash>&<seq>       │           │  no-op    │
         │                  └───────────────────┬────────────────────────────┘           └─────┬─────┘
         │                                      ▼ inserido                                     │
         │                  ┌────────────────────────────────────────────────┐                 │
         └──── 200 ─────────│ (4) return 200  ◀── SEMPRE, antes de processar │◀────────────────┘
                            └───────────────────┬────────────────────────────┘
                                                ▼  agendarPosResposta()  (after() do Next)
                            ┌────────────────────────────────────────────────────────────┐
                            │ (5) processarEvento(eventoId)                              │
                            │                                                            │
                            │  resolve empresaId:  payment.subscription (sub_…)          │
                            │                   → Empresa.asaasSubscriptionId            │
                            │                   → fallback CheckoutAsaas / external...   │
                            │                   (NUNCA id vindo do payload sem mapa, C-08)│
                            └───────────────┬─────────────────────┬──────────────────────┘
                                            │                     │
              PAYMENT_CONFIRMED /            │                     │  PAYMENT_OVERDUE
              PAYMENT_RECEIVED               ▼                     ▼  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED
                            ┌───────────────────────────┐   ┌─────────────────────────────┐
                            │ GET /v3/payments/{id}     │   │ NO-OP DE ESTADO (GTW-04)    │
                            │ re-fetch autoritativo     │   │ avaliarAcesso() já deriva   │
                            │ (Pitfall 1: token estático│   │ CARENCIA de acessoAte +     │
                            │  é replayável)            │   │ DIAS_DE_CARENCIA. Só marca  │
                            └───────────┬───────────────┘   │ o evento como processado.   │
                                        ▼                   └─────────────┬───────────────┘
                            ┌───────────────────────────┐                 │
                            │ novoAcessoAte =           │                 │
                            │  proximoVencimento(       │                 │
                            │    payment.dueDate,       │                 │
                            │    MONTHLY)  ← NÃO now()  │                 │
                            └───────────┬───────────────┘                 │
                                        ▼                                 │
                            ┌───────────────────────────────────────┐     │
                            │ updateMany WHERE acessoAte IS NULL    │     │
                            │   OR acessoAte < novoAcessoAte        │     │
                            │ ── escrita MONOTÔNICA: evento antigo  │     │
                            │    fora de ordem vira count = 0       │     │
                            └───────────┬───────────────────────────┘     │
                                        ▼ count === 1                     │
                            ┌───────────────────────────────────────┐     │
                            │ acessoService.registrarTransicao(     │     │
                            │   causa: WEBHOOK_PAGAMENTO)  ← CAS    │     │
                            │ da Fase 2, reusado                    │     │
                            └───────────┬───────────────────────────┘     │
                                        └──────────────┬──────────────────┘
                                                       ▼
                            ┌──────────────────────────────────────────────┐
                            │ UPDATE EventoWebhookAsaas SET processadoEm   │
                            │  (ou erro = '…' se falhou)                   │
                            │  ← interface para o worker da Fase 5         │
                            └──────────────────────────────────────────────┘
```

### Recommended Project Structure

```
lib/billing/asaas/
├── client.ts              # cliente fetch tipado: baseUrl, header access_token, timeout, erros
├── tipos.ts               # tipos TS dos objetos Asaas (Checkout, Subscription, Payment)
├── eventos.ts             # union de nomes de evento + schemas zod NÃO-ESTRITOS do envelope
├── config.ts              # leitura + validação fail-fast das env vars (ASAAS_*)
└── datas.ts               # parse de "YYYY-MM-DD"/"YYYY-MM-DD HH:mm:ss" do Asaas (Pitfall 6)
                           #   + proximoVencimento(dueDate, cycle) com clamp de fim de mês

lib/                       # (existente — reusar, não duplicar)
├── avaliar-acesso.ts      # função pura; NÃO tocar
├── agendar-pos-resposta.ts# after() já embrulhado; usar como está
├── fuso-sao-paulo.ts      # meiaNoiteEmSaoPaulo(); usar como está
└── http-error.ts          # HttpError

app/services/
├── assinatura.service.ts       # criarCheckout(empresaId) → { url }   (GTW-01)
├── assinatura.service.test.ts
├── webhook-asaas.service.ts    # registrarEvento() + processarEvento() (GTW-02/03/04)
├── webhook-asaas.service.test.ts
└── acesso.service.ts           # (existente) registrarTransicao — reusar

app/api/
├── assinaturas/checkout/route.ts   # POST, requireAuth  (GTW-01, backend-only per D-04)
└── webhooks/asaas/route.ts         # POST, sem requireAuth, token header (GTW-02)

prisma/
├── schema.prisma                   # + EventoWebhookAsaas, CheckoutAsaas,
│                                   #   Empresa.asaasCustomerId/asaasSubscriptionId,
│                                   #   CausaTransicaoAcesso += WEBHOOK_PAGAMENTO
└── migrations/<ts>_add_asaas_webhook/migration.sql
```

### Pattern 1: Cliente HTTP tipado com fail-fast de configuração

**What:** Um módulo único que encapsula base URL, header `access_token`, timeout, parsing de erro e tipos de resposta. Nenhum outro arquivo do projeto conhece a URL do Asaas.

**When to use:** Toda chamada saindo para o Asaas (`POST /v3/checkouts`, `GET /v3/payments/{id}`, `POST /v3/webhooks`).

**Pontos não-negociáveis:**
- Header de autenticação da API é **`access_token`** (não `Authorization: Bearer`) [CITED: docs.asaas.com/docs/eventos-para-checkout — "Autentique a requisição utilizando a API Key no header: `access_token`"]
- Validação das env vars **no carregamento do módulo**, com `throw` — `PITFALLS.md` documenta que `JWT_SECRET` e credenciais R2 já são lidos como `?? ""` silenciosamente; não adicionar um terceiro segredo silenciosamente vazio
- `AbortSignal.timeout(...)` explícito em toda chamada — uma chamada pendurada dentro de um `after()` prende a invocação
- **Nunca** logar o corpo de resposta inteiro (pode conter dados do pagador); logar `status`, `errors[].code`, `errors[].description`

### Pattern 2: Persist-then-ack (ledger de webhook)

**What:** O route handler faz o mínimo possível antes de responder: verifica o token, valida a forma do envelope, insere uma linha e retorna 200. Todo o resto roda depois.

**When to use:** Sempre. É o padrão que o próprio Asaas documenta [CITED: docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks] e o único compatível com o timeout de 10 s.

**Ordem obrigatória** (a doc do Asaas é explícita: *"Responda `HTTP 200` somente após confirmar a persistência do evento"*):
1. `asaas-access-token` válido? Não → `401`, fim.
2. Envelope parseia e tem `id` + `event`? Não → `200` + `console.error` (payload malformado não deve pausar a fila).
3. `INSERT` no ledger. `P2002` → já visto → `200`, fim (nenhum processamento).
4. `200`.
5. `agendarPosResposta(() => processarEvento(id))`.

### Pattern 3: Escrita monotônica de `acessoAte`

**What:** `acessoAte` só pode andar para frente. A guarda vive no `WHERE` do `updateMany`, não em `if` na aplicação.

```ts
const { count } = await prisma.empresa.updateMany({
  where: {
    id: empresaId,
    OR: [{ acessoAte: null }, { acessoAte: { lt: novoAcessoAte } }],
  },
  data: { acessoAte: novoAcessoAte },
});
```

**When to use:** Toda mutação de `acessoAte` originada de webhook.

**Por que resolve GTW-04 (parte "evento antigo não sobrescreve estado mais recente"):** um `PAYMENT_CONFIRMED` de janeiro reentregue em março produz `novoAcessoAte` de fevereiro, que é `<` o valor corrente → `count === 0` → nenhuma escrita, nenhuma auditoria. Sem `if`, sem coluna de versão, sem lock.

### Pattern 4: `PAYMENT_OVERDUE` como no-op de estado

**What:** O handler de atraso **não escreve fatos de billing**. Ele marca o evento como processado e nada mais.

**When to use:** `PAYMENT_OVERDUE`, `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `PAYMENT_REPROVED_BY_RISK_ANALYSIS`, `PAYMENT_DELETED`.

**Por quê:** `avaliarAcesso()` (Fase 2) já retorna `CARENCIA` quando `agora >= acessoAte` e `agora < meiaNoiteEmSaoPaulo(acessoAte, 10)`. A carência de 10 dias **começa sozinha** no instante em que `acessoAte` vence — que é, por construção, a data de vencimento da cobrança não paga. Escrever algo em resposta ao `PAYMENT_OVERDUE` seria:
- **redundante** (o estado já é o correto),
- **perigoso** (uma entrega atrasada poderia encurtar ou reiniciar a carência de uma empresa que já pagou),
- **contrário a BILL-01/D-16** da Fase 2 (status é derivado, nunca armazenado).

**Verificação para o planner:** a task que implementa `PAYMENT_OVERDUE` deve ter um teste que prova que **nenhuma coluna de `Empresa` é escrita** e que `avaliarAcesso` sobre os fatos inalterados já devolve `CARENCIA` com `carenciaAte = acessoAte + 10 dias`.

**Nuance sobre auditoria:** mesmo sem escrever fatos, a *transição observada* pode merecer uma linha de auditoria com causa `WEBHOOK_PAGAMENTO`. Mas atenção: `registrarTransicao` compara contra `ultimoStatusAuditado`, e a mesma transição já vai ser registrada no próximo request autenticado por `revalidarConta` (causa `AVALIACAO_SESSAO`). O CAS garante que só uma das duas grava. Decisão recomendada: **no `PAYMENT_OVERDUE`, chamar `registrarTransicao`** — assim uma empresa cujo admin não faz login tem o momento da carência registrado mesmo assim.

### Pattern 5: Resolução de `empresaId` a partir do evento (defesa contra IDOR)

**What:** Nunca aceitar um identificador do payload como autorização. O payload dá um `sub_…`/`pay_…`/checkout id; a autoridade é sempre o **mapa local**.

Ordem de resolução recomendada:
1. `payment.subscription` (`sub_…`) → `Empresa.asaasSubscriptionId` (`@unique`)
2. `checkout.id` → `CheckoutAsaas.asaasCheckoutId` (`@unique`) → `empresaId`
3. `externalReference` (setado por nós = `empresaId`) — apenas como *cross-check*, nunca como fonte única
4. Nenhum resolveu → marcar `erro` no ledger, responder 200, alertar. **Nunca** criar empresa nem adivinhar.

### Anti-Patterns to Avoid

- **Chamar `constructEvent` / verificar HMAC:** não existe no Asaas. Quem escrever isso vai inventar um segredo que o Asaas nunca envia.
- **Ler `request.text()` para preservar o corpo cru:** desnecessário aqui (não há hash do corpo). `request.json()` direto.
- **Retornar `201`, `204`, `202` ou `302` do webhook:** o Asaas documenta explicitamente que só considera sucesso `HTTP 200` [CITED: docs.asaas.com/docs/erro-read-timed-out]. Ver Pitfall 2.
- **Retornar 500 para evento desconhecido:** eventos novos aparecem sem aviso. Desconhecido → `200` + log.
- **`zod` com `.strict()` ou schema fechado no envelope:** o Asaas avisa formalmente que novos atributos entram no payload e que exceções por causa disso **causam interrupção da fila** [CITED: docs.asaas.com/docs/webhook-para-cobrancas].
- **Derivar `acessoAte` de `new Date()`:** torna o resultado dependente do momento da entrega. Ver Pitfall 5.
- **Confiar na `successUrl` para confirmar pagamento:** o Asaas é explícito — *"Não marque um pedido como pago apenas porque o pagador chegou à `successUrl`"* [CITED: docs.asaas.com/docs/faq-do-asaas-checkout].
- **Gravar qualquer campo de `payment.creditCard`** (mesmo `creditCardNumber` mascarado) no nosso banco: viola GTW-01.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Executar trabalho depois do response | `setTimeout` / promise solta / fila em memória | `agendarPosResposta()` (`lib/agendar-pos-resposta.ts`) | Já existe, já testado; em serverless a invocação congela após o response e um `setTimeout` morre sem log. O helper ainda trata o `E468` fora de request scope |
| Comparar o token do webhook | `header === process.env.ASAAS_WEBHOOK_TOKEN` | `crypto.timingSafeEqual` sobre buffers de mesmo tamanho (comparar hash SHA-256 dos dois lados para igualar o comprimento) | Comparação de string curto-circuita e vaza o segredo por timing (ASVS V6) |
| Deduplicar eventos | `Set` em memória, cache, `findFirst` antes do insert | Constraint `@unique` em `eventoId` + tratar `P2002` | Duas entregas concorrentes passam pelo `findFirst` juntas. Só o Postgres resolve a corrida |
| Registrar transição de status | Ler última linha de auditoria, comparar e criar | `acessoService.registrarTransicao` (Fase 2) | CAS já implementado e comentado; duplicar produz linhas duplicadas sob concorrência (T-02-15) |
| Derivar status de acesso | `if (pagamentoConfirmado) status = "EM_DIA"` | `avaliarAcesso()` (Fase 2) | Status nunca é armazenado (BILL-01). Escrever status no webhook quebra a invariante inteira da Fase 2 |
| Meia-noite de São Paulo | Somar/subtrair 3 h, `toISOString().slice(0,10)` | `meiaNoiteEmSaoPaulo()` (`lib/fuso-sao-paulo.ts`) | O arquivo tem um aviso explícito: "Não re-derive este algoritmo" — o erro comum produz resultados 1–2 h errados em datas de mudança de offset |
| Gerar o `authToken` do webhook | Digitar uma string à mão | `crypto.randomBytes(32).toString("hex")` (64 chars, dentro do limite 32–255) | Token curto/previsível = webhook público |
| Somar 1 mês a uma data | `data.setMonth(data.getMonth() + 1)` | Helper `proximoVencimento()` com clamp de fim de mês | `setMonth` em 31/01 devolve 02/03 ou 03/03, não 28/02. Ver Pitfall 5 |
| Cliente HTTP do Asaas | `npm i asaas` / `asaas-sdk` | `fetch` + tipos próprios | Ambos comunitários/abandonados; § Package Legitimacy Audit |

**Key insight:** três das cinco peças mais difíceis desta fase (executar após o response, compare-and-swap de auditoria, aritmética de fuso) **já foram construídas e testadas nas Fases 1–2**. O maior risco desta fase não é escrever código novo difícil — é reescrever, pior, código que já existe.

## Common Pitfalls

### Pitfall 1: Implementar verificação HMAC que o Asaas nunca envia

**What goes wrong:** O plano/implementação copia o padrão Stripe (`stripe-signature`, HMAC sobre o corpo cru, checagem de frescor de timestamp). O Asaas não envia nada disso. O código ou nunca valida nada (endpoint efetivamente público), ou rejeita 100% das entregas (15 falhas → fila pausada).

**Why it happens:** `PITFALLS.md` do projeto foi escrito antes desta pesquisa e prescreve HMAC genericamente ("Mandatory HMAC signature verification; timing-safe compare", "reject > ~5 min old"). É a orientação certa para Stripe, errada para Asaas.

**How to avoid:**
- O mecanismo real: você define `authToken` (32–255 chars) ao criar o webhook via `POST /v3/webhooks`; o Asaas envia essa string **literal** no header `asaas-access-token` de toda entrega [CITED: docs.asaas.com/docs/eventos-para-checkout].
- Compare com `timingSafeEqual` sobre hashes de tamanho fixo.
- Como um bearer estático é replayável por quem o capturar, **compense**: (a) HTTPS obrigatório, (b) ledger de idempotência, (c) escrita monotônica, (d) **re-fetch de `GET /v3/payments/{id}` antes de estender acesso** — um payload forjado não sobrevive ao re-fetch.

**Warning signs:** aparece `createHmac` no diff do webhook; aparece um `ASAAS_WEBHOOK_SECRET` que nunca é enviado ao Asaas; o handler lê `request.text()`.

---

### Pitfall 2: Responder algo diferente de exatamente `200` — e pausar a fila

**What goes wrong:** O handler responde `201`, `204`, `202`, um redirect, ou demora mais de 10 s. Cada uma dessas conta como **falha**. Quinze falhas consecutivas **pausam a fila de sincronização**, e eventos parados por mais de 14 dias são **apagados permanentemente**. Resultado: clientes que pagaram nunca têm `acessoAte` estendido e são bloqueados.

**Why it happens:** `NextResponse.json(x, { status: 201 })` é o hábito do resto do projeto (ver `app/api/produtos/route.ts`). E o "processar tudo antes de responder" é o default mental.

**How to avoid:**
- `return new Response(null, { status: 200 })` (ou `NextResponse.json({ received: true })`, que já é 200) em **todos** os caminhos autenticados — inclusive duplicado, evento desconhecido, payload malformado e erro de processamento.
- Timeout do Asaas: **10 segundos**, e a doc é categórica: *"O Asaas considera o webhook processado com sucesso somente quando recebe HTTP 200"* [CITED: docs.asaas.com/docs/erro-read-timed-out]. (A página "Sobre os Webhooks" menciona a faixa 200–299; onde as duas divergem, siga a mais restritiva: exatamente 200.)
- `export const runtime = "nodejs"` e `export const dynamic = "force-dynamic"` no route handler.
- Reativação manual da fila: painel do Asaas ou `PUT /v3/webhooks/{id}` com `interrupted: false`.

**Warning signs:** `status: 201` no route handler do webhook; qualquer `await` de chamada externa antes do `return`; `penalizedRequestsCount > 0` na resposta de `GET /v3/webhooks`.

---

### Pitfall 3: `zod` estrito derruba o handler quando o Asaas adiciona um campo

**What goes wrong:** O schema valida o objeto `payment` inteiro com `.strict()` (ou um `z.object` sem passthrough usado para *validar* em vez de *narrow*). O Asaas adiciona um atributo novo, o parse lança, o handler responde 500, e a fila pausa em 15 entregas.

**Why it happens:** É o uso idiomático de `zod` em APIs próprias, onde campos extras são suspeitos. Em webhook de terceiro, campos extras são **esperados**.

**How to avoid:**
- O Asaas avisa formalmente: *"é possível que novos atributos sejam incluídos no Webhook. É muito importante que seu código esteja preparado para não gerar exceções... pois isso poderá causar interrupção na fila de sincronização"* [CITED: docs.asaas.com/docs/webhook-para-cobrancas].
- Valide **só o envelope mínimo** que o handler precisa para persistir: `{ id: string, event: string }`. Guarde o payload bruto em `Json`.
- No processamento (já fora do response), valide por evento apenas os campos consumidos (`payment.id`, `payment.status`, `payment.dueDate`, `payment.subscription`) — e mesmo assim com `.passthrough()` / `safeParse`, nunca `.strict()`.
- Um `safeParse` que falha vira `erro` no ledger + `200`, nunca exceção não tratada.

**Warning signs:** `.strict()` em qualquer schema de webhook; um schema `zod` com 40 campos espelhando o `PaymentGetResponseDTO` inteiro.

---

### Pitfall 4: Tratar `PAYMENT_OVERDUE` como comando de escrita

**What goes wrong:** O handler escreve algo (`carenciaInicioEm`, `statusPagamento`, ou reduz `acessoAte`) ao receber atraso. Uma reentrega tardia desse evento, ou um `PAYMENT_OVERDUE` que chega depois do `PAYMENT_RECEIVED` do mesmo mês, reinicia ou encurta a carência de quem já pagou.

**Why it happens:** GTW-04 diz "webhook de atraso **inicia** a contagem da carência", o que soa como um comando.

**How to avoid:** Ver § Pattern 4. A carência já começou sozinha; o evento é notificação. Nenhum fato de billing é escrito.

**Warning signs:** qualquer `prisma.empresa.update` no branch de `PAYMENT_OVERDUE`; uma coluna nova tipo `carenciaInicioEm` aparecendo no schema (a Fase 2 deliberadamente não tem uma).

---

### Pitfall 5: Derivar `acessoAte` de `Date.now()` em vez do vencimento da cobrança

**What goes wrong:** `acessoAte = hoje + 30 dias`. Um webhook entregue com 6 h de atraso, ou reprocessado dias depois, dá 6 h / vários dias de acesso extra e **desalinha permanentemente** o nosso calendário do calendário de cobrança do Asaas. Pior: o resultado deixa de ser determinístico, então o reprocessamento do mesmo evento não é mais idempotente e a escrita monotônica passa a "avançar" o acesso a cada reentrega.

**Why it happens:** `now + 30d` é o reflexo natural.

**How to avoid:**
- Derive de `payment.dueDate` (data-calendário de São Paulo, formato `"YYYY-MM-DD"`): `novoAcessoAte = meiaNoiteEmSaoPaulo(<dueDate + 1 ciclo>)`. O resultado é **função pura do evento** → reentrega produz exatamente o mesmo valor → escrita monotônica vira no-op.
- Use `+ 1 mês de calendário`, não `+ 30 dias` — o ciclo do Asaas é `MONTHLY`, e 30 dias derivam do alinhamento em ~5 meses.
- **Clamp de fim de mês obrigatório:** `31/01 + 1 mês` deve dar `28/02` (ou `29/02`), não `02/03`. `Date.prototype.setMonth` faz overflow silencioso. Escrever `proximoVencimento(dueDate, "MONTHLY")` como função pura, com teste para 31/01, 31/03, 29/02 de ano bissexto.
- Semântica de limite: `avaliarAcesso` usa `agora < acessoAte` (limite superior exclusivo, D-02). `meiaNoiteEmSaoPaulo` já devolve exatamente esse limite.

**Warning signs:** `new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)`; `setMonth(...)`; ausência de teste para 31 de janeiro.

---

### Pitfall 6: Parsear as datas do Asaas com `new Date(...)` direto

**What goes wrong:** O Asaas envia dois formatos, ambos armadilhas em JS:
- `dateCreated: "2024-06-12 16:45:03"` — sem timezone. `new Date("2024-06-12 16:45:03")` interpreta como **hora local do servidor**, que em produção é UTC → 3 h de erro.
- `dueDate: "2021-01-01"` — só data. `new Date("2021-01-01")` é interpretado como **UTC midnight** pela spec → `2020-12-31T21:00` em São Paulo. Passar isso para `meiaNoiteEmSaoPaulo()` devolve a meia-noite de **31/12**, um dia inteiro a menos de acesso.

**Why it happens:** As duas conversões "funcionam" e não lançam erro. O bug só aparece na virada de dia — exatamente onde o requisito importa.

**How to avoid:**
- Isole em `lib/billing/asaas/datas.ts`. Para data-calendário: interprete o `"YYYY-MM-DD"` como dia local de São Paulo ancorando ao meio-dia UTC antes de normalizar — `meiaNoiteEmSaoPaulo(new Date(\`${dueDate}T12:00:00Z\`))`. Meio-dia UTC = 09:00 em SP, mesmo dia-calendário, imune a qualquer transição de offset.
- Para `dateCreated`, prefira **armazenar como string** no ledger (é metadado do Asaas, não fato de billing) em vez de convertê-lo.
- Teste com `dueDate = "2021-01-01"` e asserção sobre o instante UTC exato.

**Warning signs:** `new Date(payment.dueDate)` sem envelope; nenhum teste de data cobrindo a virada de dia.

---

### Pitfall 7: `ALTER TYPE ... ADD VALUE` e o uso do valor na mesma migration

**What goes wrong:** A migration adiciona `WEBHOOK_PAGAMENTO` ao enum `CausaTransicaoAcesso` **e** faz um `INSERT`/`UPDATE` usando esse valor no mesmo arquivo. O Postgres recusa: um valor de enum adicionado dentro de uma transação não pode ser usado na mesma transação. O `prisma migrate` roda cada migration em transação, então isso falha em runtime, não em `prisma validate`.

**Why it happens:** Parece um único trabalho lógico.

**How to avoid:**
- Esta fase **só adiciona** o valor, sem DML que o use → uma migration só é suficiente (PostgreSQL 16.15 confirmado no ambiente [VERIFIED: `psql --version`]).
- Se algum plano precisar de backfill usando a nova causa, isso vai em uma **segunda** migration.
- Consultar a skill `.agents/skills/prisma-cli/SKILL.md` para o fluxo `prisma migrate dev` correto do Prisma 7.
- A migration é `ALTER TYPE "CausaTransicaoAcesso" ADD VALUE 'WEBHOOK_PAGAMENTO';` — e D-14 da Fase 2 exige exatamente esse padrão ("Novas causas entram por migration própria na fase em que passarem a existir", comentário literal em `prisma/schema.prisma:33-34`).

**Warning signs:** um `.sql` de migration com `ALTER TYPE ... ADD VALUE` seguido de `INSERT INTO "AuditoriaAcesso"`.

---

### Pitfall 8: Não conseguir mapear `CHECKOUT_PAID` → assinatura → empresa

**What goes wrong:** O payload de `CHECKOUT_PAID` traz `checkout.id`, `checkout.customer` (`cus_…`) e o objeto `checkout.subscription` — mas esse objeto contém apenas a **configuração** da recorrência (`cycle`, `nextDueDate`, `endDate`), **não o id `sub_…` da assinatura criada** [CITED: docs.asaas.com/docs/eventos-para-checkout, exemplo de payload]. Se o código esperar o `sub_…` ali, o mapeamento nunca acontece e nenhum pagamento futuro é reconhecido.

**Why it happens:** O objeto se chama `subscription`, o que sugere a assinatura criada.

**How to avoid:**
- Persistir `CheckoutAsaas { asaasCheckoutId @unique, empresaId, status, criadoEm }` **no momento da criação** (Fluxo A), que é quando a associação é certa.
- Capturar `asaasSubscriptionId` pelo evento **`SUBSCRIPTION_CREATED`** (payload traz `subscription.id = "sub_…"` [CITED: docs.asaas.com/docs/eventos-para-assinaturas]), correlacionando por `subscription.customer` (`cus_…`) — que veio no `CHECKOUT_PAID` — ou por `externalReference`.
- Registrar o webhook para os três grupos: `CHECKOUT_*`, `SUBSCRIPTION_CREATED`, `PAYMENT_*`.
- Alternativa de segurança: se o mapeamento por evento falhar, `GET /v3/payments/{id}` devolve `subscription` e `customer`, e `GET /v3/subscriptions/{id}` devolve `externalReference`.

**Warning signs:** código lendo `checkout.subscription.id`; nenhuma tabela mapeando checkout → empresa.

---

### Pitfall 9: Persistir dados de pagamento sem perceber (viola GTW-01)

**What goes wrong:** O ledger guarda o payload bruto em `Json` "para auditoria". O objeto `payment` do Asaas inclui `creditCard` (bandeira, últimos 4 dígitos, `creditCardToken`) e `customerData` com CPF/CNPJ, endereço e telefone. Isso passa a viver no nosso banco e nos backups — e um `console.error(payload)` o leva para os logs.

**Why it happens:** "salvar o payload inteiro" é o conselho padrão de reconciliação e está em `PITFALLS.md`.

**How to avoid:**
- **Redigir antes de persistir.** Guardar apenas os campos que o processamento e a reconciliação da Fase 5 usam: `event`, `payment.id`, `payment.status`, `payment.value`, `payment.dueDate`, `payment.subscription`, `payment.externalReference`, `payment.billingType`, `dateCreated`. Descartar `creditCard`, `customerData`, `pixTransaction`, `pixQrCodeId`, `bankSlipUrl`, `invoiceUrl`, `transactionReceiptUrl`.
- Nunca `console.error(body)`. Logar `eventoId`, `event`, `empresaId`, resultado (`PITFALLS.md` § "Logging full webhook payloads").
- Se retenção completa for desejada no futuro, é decisão consciente com política de expurgo — não um efeito colateral.

**Warning signs:** coluna `payload Json` recebendo `body` sem transformação; qualquer campo `creditCard*` ou `cpfCnpj` no schema.

---

### Pitfall 10: Nenhum caminho de recuperação quando o `after()` falha

**What goes wrong:** O 200 já foi enviado, então o Asaas nunca reenvia. Se o `processarEvento` falhar (banco indisponível, Asaas fora), o evento fica `PENDING` para sempre e uma empresa que pagou nunca é estendida — silenciosamente.

**Why it happens:** É o custo inerente do padrão persist-then-ack, e é justamente por isso que a doc do Asaas alerta: *"Depois que a entrega for confirmada, sua aplicação não deve depender de um novo envio para recuperar um evento que não foi armazenado."*

**How to avoid:**
- O ledger **é** o mecanismo de recuperação: `processadoEm DateTime?`, `erro String?`, `tentativas Int @default(0)`. `WHERE processadoEm IS NULL` é a fila de retrabalho.
- O `agendarPosResposta` já captura e loga rejeições com prefixo (`lib/agendar-pos-resposta.ts`) — a falha nunca derruba o request, mas **precisa** ser gravada em `erro` também, não só logada.
- Documentar explicitamente no PLAN que o *drenar* dessa fila é da Fase 5 (WRK-01), e que esta fase entrega apenas as colunas e um índice `@@index([processadoEm])`.

**Warning signs:** `EventoWebhookAsaas` sem `processadoEm`/`erro`; nenhuma menção à Fase 5 no plano.

## Code Examples

### 1. Cliente HTTP tipado — config fail-fast e chamada base

```ts
// lib/billing/asaas/config.ts
// Fonte: header e URLs em https://docs.asaas.com/docs/sandbox e
//        https://docs.asaas.com/docs/eventos-para-checkout
function obrigatorio(nome: string): string {
  const valor = process.env[nome];
  // Fail-fast no carregamento do módulo: CONCERNS.md já documenta JWT_SECRET e
  // credenciais R2 lidos como `?? ""`. Não adicionar um terceiro segredo
  // silenciosamente vazio — a falha tem que ser no boot, não no primeiro webhook.
  if (!valor) throw new Error(`[asaas] variável de ambiente ausente: ${nome}`);
  return valor;
}

export const ASAAS_API_URL = obrigatorio("ASAAS_API_URL");       // https://api-sandbox.asaas.com/v3
export const ASAAS_API_KEY = obrigatorio("ASAAS_API_KEY");       // $aact_hmlg_... (sandbox)
export const ASAAS_WEBHOOK_TOKEN = obrigatorio("ASAAS_WEBHOOK_TOKEN"); // 32-255 chars
```

```ts
// lib/billing/asaas/client.ts
import { ASAAS_API_URL, ASAAS_API_KEY } from "./config";
import { HttpError } from "@/lib/http-error";

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`${ASAAS_API_URL}${caminho}`, {
    ...init,
    headers: {
      // Header de auth da API é `access_token` — NÃO `Authorization: Bearer`.
      access_token: ASAAS_API_KEY,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!resposta.ok) {
    // Erros do Asaas vêm como { errors: [{ code, description }] }.
    // Logar código/descrição, nunca o corpo inteiro (pode conter dados do pagador).
    const detalhe = await resposta.text().catch(() => "");
    console.error(`[asaas] ${init?.method ?? "GET"} ${caminho} → ${resposta.status}`, detalhe.slice(0, 500));
    throw new HttpError("Não foi possível falar com o gateway de pagamento.", 502);
  }

  return (await resposta.json()) as T;
}
```

### 2. Criar o checkout hospedado com assinatura recorrente (GTW-01)

```ts
// Fonte: https://docs.asaas.com/docs/checkout-com-assinatura-recorrente
//        https://docs.asaas.com/reference/criar-novo-checkout
//        https://docs.asaas.com/docs/link-do-checkout-e-redirecionamento-do-cliente
export const VALOR_PLANO_MENSAL = 29.9; // D-02

const corpo = {
  billingTypes: ["CREDIT_CARD"],   // RECURRENT exige cartão (FAQ do Checkout)
  chargeTypes: ["RECURRENT"],      // exige o objeto `subscription`
  minutesToExpire: 60,             // permitido: 10..1440
  externalReference: empresaId,    // cross-check; NÃO é a fonte de autorização
  callback: {
    successUrl: `${APP_BASE_URL}/${slug}/admin`,
    cancelUrl: `${APP_BASE_URL}/${slug}/admin`,
    expiredUrl: `${APP_BASE_URL}/${slug}/admin`,
  },
  items: [
    { name: "Plano mensal", description: "Assinatura mensal do painel", quantity: 1, value: VALOR_PLANO_MENSAL },
  ],
  subscription: {
    cycle: "MONTHLY",
    // D-03: primeira cobrança no fim do trial. Formato do exemplo oficial.
    nextDueDate: primeiraCobrancaEmSaoPaulo(empresa.trialFim), // "YYYY-MM-DD HH:mm:ss"
    // `endDate` OMITIDO de propósito: assinatura aberta até cancelamento (SUB-02, Fase 7).
  },
};

const checkout = await chamar<{ id: string; link: string | null; status: string }>(
  "/checkouts",
  { method: "POST", body: JSON.stringify(corpo) }
);

// D-07: só agora, DEPOIS do 2xx, algo é gravado. Antes disso o banco não é tocado.
await prisma.checkoutAsaas.create({
  data: { asaasCheckoutId: checkout.id, empresaId, status: "ACTIVE" },
});

// `link` pode vir null no payload; a URL é montada a partir do id.
const url = `${ASAAS_CHECKOUT_BASE_URL}?id=${checkout.id}`;
// prod: https://asaas.com/checkoutSession/show
```

### 3. Route handler do webhook — verificar, persistir, responder 200 (GTW-02)

```ts
// app/api/webhooks/asaas/route.ts
// Fonte: https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks
//        https://docs.asaas.com/docs/erro-read-timed-out
import { createHash, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { agendarPosResposta } from "@/lib/agendar-pos-resposta";
import { ASAAS_WEBHOOK_TOKEN } from "@/lib/billing/asaas/config";
import { webhookAsaasService } from "@/app/services/webhook-asaas.service";

export const runtime = "nodejs";       // precisa de node:crypto + Prisma
export const dynamic = "force-dynamic";

const OK = () => new Response(null, { status: 200 });

function tokenValido(recebido: string | null): boolean {
  if (!recebido) return false;
  // Hash dos dois lados para igualar o comprimento: timingSafeEqual lança se os
  // buffers tiverem tamanhos diferentes — e o tamanho em si já vazaria informação.
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(ASAAS_WEBHOOK_TOKEN).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  // (1) Autenticidade. NÃO é HMAC: o Asaas ecoa o `authToken` configurado.
  if (!tokenValido(request.headers.get("asaas-access-token"))) {
    return new Response(null, { status: 401 });
  }

  // (2) Corpo. Seguro ler como JSON: não existe assinatura sobre o corpo cru.
  let envelope: { id?: unknown; event?: unknown };
  try {
    envelope = await request.json();
  } catch {
    console.error("[webhook-asaas] corpo não é JSON");
    return OK(); // malformado nunca vira falha: 15 falhas pausam a fila
  }

  if (typeof envelope.id !== "string" || typeof envelope.event !== "string") {
    console.error("[webhook-asaas] envelope sem id/event");
    return OK();
  }

  // (3) Idempotência no Postgres, não na aplicação. P2002 = já visto.
  try {
    await prisma.eventoWebhookAsaas.create({
      data: {
        eventoId: envelope.id,
        evento: envelope.event,
        payload: webhookAsaasService.redigir(envelope), // Pitfall 9
      },
    });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      return OK(); // duplicado: 200 e nenhum processamento
    }
    console.error("[webhook-asaas] falha ao persistir evento", envelope.id, erro);
    // Persistência falhou → NÃO confirmar. 500 faz o Asaas reenviar.
    return new Response(null, { status: 500 });
  }

  // (4) e (5): responde primeiro, processa depois (timeout de 10s do Asaas).
  agendarPosResposta(() => webhookAsaasService.processar(envelope.id as string));

  return OK();
}
```

### 4. Escrita monotônica + reuso do CAS de auditoria (GTW-03)

```ts
// app/services/webhook-asaas.service.ts (trecho)
// Fonte de padrão: app/services/acesso.service.ts (Fase 2) e lib/avaliar-acesso.ts
import { CausaTransicaoAcesso } from "@prisma/client";
import { avaliarAcesso } from "@/lib/avaliar-acesso";
import { acessoService } from "@/app/services/acesso.service";

async function aplicarPagamentoConfirmado(empresaId: string, novoAcessoAte: Date) {
  const antes = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: {
      acessoAte: true, trialFim: true, canceladoEm: true,
      acessoVitalicio: true, ultimoStatusAuditado: true,
    },
  });
  if (!antes) return;

  // Monotônico: um evento antigo reentregue produz `count === 0` e vira no-op.
  // A guarda vive no WHERE — um `if` em memória perderia a corrida com o worker.
  const { count } = await prisma.empresa.updateMany({
    where: {
      id: empresaId,
      OR: [{ acessoAte: null }, { acessoAte: { lt: novoAcessoAte } }],
    },
    data: { acessoAte: novoAcessoAte },
  });

  if (count === 0) return; // estado já é mais recente (GTW-04)

  // Status NUNCA é escrito: é derivado dos fatos (BILL-01 / D-16 da Fase 2).
  const agora = new Date();
  const novo = avaliarAcesso(
    { ...antes, acessoAte: novoAcessoAte },
    agora
  ).status;

  // CAS da Fase 2 reusado — não reimplementar.
  await acessoService.registrarTransicao({
    empresaId,
    anterior: antes.ultimoStatusAuditado,
    novo,
    causa: CausaTransicaoAcesso.WEBHOOK_PAGAMENTO,
  });
}
```

### 5. Derivação determinística de `acessoAte` a partir do vencimento (Pitfall 5 + 6)

```ts
// lib/billing/asaas/datas.ts
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";

/**
 * Interpreta "YYYY-MM-DD" do Asaas como dia-calendário de São Paulo.
 *
 * `new Date("2021-01-01")` é UTC midnight = 31/12 21:00 em SP — passar isso
 * direto para `meiaNoiteEmSaoPaulo` devolve a meia-noite do dia ANTERIOR.
 * Ancorar ao meio-dia UTC (09:00 SP) mantém o dia-calendário correto e é imune
 * a qualquer transição de offset.
 */
function comoDiaEmSaoPaulo(dataAsaas: string): Date {
  return new Date(`${dataAsaas}T12:00:00Z`);
}

/**
 * `acessoAte` = meia-noite de SP do dia seguinte a (vencimento + 1 ciclo).
 *
 * Função PURA do evento: reentregar o mesmo webhook produz exatamente o mesmo
 * instante, o que é o que torna a escrita monotônica idempotente. Derivar de
 * `Date.now()` quebraria isso (Pitfall 5).
 *
 * Clamp de fim de mês: 31/01 + 1 mês = 28/02 (não 03/03, como `setMonth` faria).
 */
export function acessoAteAposPagamento(dueDate: string): Date {
  const base = comoDiaEmSaoPaulo(dueDate);
  const [ano, mes, dia] = dueDate.split("-").map(Number);

  const ultimoDiaDoMesSeguinte = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDiaDoMesSeguinte);

  const alvo = `${String(mes === 12 ? ano + 1 : ano)}-${String(mes === 12 ? 1 : mes + 1).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;

  void base;
  return meiaNoiteEmSaoPaulo(comoDiaEmSaoPaulo(alvo));
}
```

### 6. Registro do webhook no Asaas (etapa de setup, uma vez por ambiente)

```ts
// Fonte: https://docs.asaas.com/docs/eventos-para-checkout (exemplo literal)
//        https://docs.asaas.com/reference/criar-novo-webhook
// Gerar o token: crypto.randomBytes(32).toString("hex") → 64 chars (limite 32..255)
await chamar("/webhooks", {
  method: "POST",
  body: JSON.stringify({
    name: "gestor-estoque-billing",
    url: `${APP_BASE_URL}/api/webhooks/asaas`,
    email: EMAIL_NOTIFICACAO,     // recebe aviso quando a fila pausa
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: ASAAS_WEBHOOK_TOKEN,
    sendType: "SEQUENTIALLY",     // preserva ordem cronológica dos eventos
    events: [
      "CHECKOUT_PAID", "CHECKOUT_EXPIRED", "CHECKOUT_CANCELED",
      "SUBSCRIPTION_CREATED", "SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED",
      "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE",
      "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED",
    ],
  }),
});
```

## Referência: eventos e estados do Asaas

**Eventos de cobrança relevantes** [CITED: docs.asaas.com/docs/webhook-para-cobrancas]:

| Evento | Quando ocorre | Ação nesta fase |
|--------|---------------|-----------------|
| `PAYMENT_CREATED` | Geração de nova cobrança do ciclo | Registrar no ledger; nenhuma mutação |
| `PAYMENT_CONFIRMED` | **Pagamento efetuado, saldo ainda não disponibilizado** | **Estende `acessoAte`** — é o evento de "cliente pagou" |
| `PAYMENT_RECEIVED` | Cobrança recebida, valor disponível na conta Asaas | Idempotente com o anterior: a escrita monotônica torna a segunda um no-op |
| `PAYMENT_OVERDUE` | Cobrança vencida | **No-op de estado** (Pattern 4) + auditoria |
| `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` | Falha na captura do cartão | No-op de estado + log/alerta |
| `PAYMENT_REFUNDED` / `PAYMENT_CHARGEBACK_REQUESTED` | Estorno / chargeback | **Fora de escopo desta fase** — registrar no ledger e alertar; decisão de revogar acesso é de produto |

**Ponto crítico:** no cartão de crédito o fluxo é `PAYMENT_CREATED → PAYMENT_CONFIRMED → (aguarda ~30 dias) → PAYMENT_RECEIVED`. Esperar `PAYMENT_RECEIVED` para liberar acesso deixaria o cliente bloqueado por um mês. **`PAYMENT_CONFIRMED` é o gatilho.**

**Status possíveis de `payment.status`:** `PENDING`, `RECEIVED`, `CONFIRMED`, `OVERDUE`, `REFUNDED`, `RECEIVED_IN_CASH`, `REFUND_REQUESTED`, `REFUND_IN_PROGRESS`, `CHARGEBACK_REQUESTED`, `CHARGEBACK_DISPUTE`, `AWAITING_CHARGEBACK_REVERSAL`, `DUNNING_REQUESTED`, `DUNNING_RECEIVED`, `AWAITING_RISK_ANALYSIS` [CITED: docs.asaas.com/reference/recuperar-uma-unica-cobranca].

**Status de checkout:** `ACTIVE`, `PAID`, `CANCELED`, `EXPIRED`. **Status de assinatura:** `ACTIVE`, `EXPIRED`, `INACTIVE`.

**Envelope de todo evento:**
```json
{
  "id": "evt_05b708f961d739ea7eba7e4db318f621&368604920",
  "event": "PAYMENT_RECEIVED",
  "dateCreated": "2024-06-12 16:45:03",
  "account": { "id": "47ed0d25-…", "ownerId": null },
  "payment": { "object": "payment", "id": "pay_080225913252", "subscription": "sub_VXJBYgP2u0eO", "status": "RECEIVED", "dueDate": "2021-01-01", "externalReference": "056984", "…": "…" }
}
```
`payment.subscription` é retornado **apenas** quando a cobrança pertence a uma assinatura [CITED: docs.asaas.com/docs/webhook-para-cobrancas].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PITFALLS.md`: "HMAC obrigatório + checagem de frescor do timestamp" | Token estático em `asaas-access-token`, sem assinatura de corpo | Sempre foi assim no Asaas; a orientação genérica não era específica de gateway | Toda a task de verificação muda; re-fetch da cobrança passa a ser controle compensatório obrigatório |
| `STACK.md`: "o Asaas considera sucesso apenas HTTP 200" | Confirmado e mais preciso: timeout **10 s**, e a página de erro 408 reafirma "somente HTTP 200" (a página geral de webhooks cita 200–299) | — | Padronizar exatamente `200`; nunca 201/204/202 |
| "Não existe webhook de assinatura no Asaas" (nota de pesquisa do ROADMAP) | **Existem** eventos `SUBSCRIPTION_CREATED/UPDATED/INACTIVATED/DELETED` — mas eles cobrem só o ciclo de vida do contrato, não o financeiro | Doc atual (atualizada 2026-08-27) | Assinar `SUBSCRIPTION_CREATED` para capturar o `sub_…`; o estado financeiro continua vindo dos `PAYMENT_*` — a premissa do ROADMAP está correta na essência |
| Idempotência "a inventar" | O Asaas **documenta oficialmente** o padrão, com DDL PostgreSQL de exemplo | Página atualizada 2026-08-27 | GTW-02/GTW-04 seguem a recomendação do próprio fornecedor |
| Ordem de eventos não garantida | `sendType: "SEQUENTIALLY"` preserva ordem cronológica | — | Reduz o risco de fora-de-ordem; a defesa estrutural (Pattern 3 + 4) continua obrigatória |
| Taxa efetiva calculada sobre R$49,90 em `STACK.md` | **Recalculado para R$29,90** (D-02) | Esta pesquisa | Ver quadro abaixo |

**Taxa efetiva recalculada para R$29,90** [ASSUMED — tabela comercial de `asaas.com/precos-e-taxas`, MEDIUM em `STACK.md`, **não reconfirmada nesta sessão**]:

| Meio | Tarifa | Custo em R$29,90 | % efetivo |
|------|--------|------------------|-----------|
| Cartão à vista (padrão) | 2,99% + R$0,49 | R$1,38 | **≈4,63%** |
| Cartão à vista (promo) | 1,99% + R$0,49 | R$1,09 | ≈3,63% |
| Pix (padrão) | R$1,99 fixo | R$1,99 | ≈6,66% |

Como o checkout recorrente **exige cartão de crédito**, a taxa relevante é a de cartão: **≈4,63%** (≈R$1,38/assinatura/mês). O ticket menor piorou o percentual efetivo em ~0,6 p.p. vs. a projeção de R$49,90 — não muda a decisão D-01, mas o número correto é este. **Reconfirmar a tabela antes de qualquer decisão comercial.**

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | URL do checkout em **sandbox** é `https://sandbox.asaas.com/checkoutSession/show?id=<id>` (a doc só mostra a de produção, `https://asaas.com/...`) | Code Examples #2 | Link de checkout quebrado em todo teste de sandbox. **Mitigação: tornar a base URL uma env var `ASAAS_CHECKOUT_BASE_URL` e validá-la no primeiro teste manual** |
| A2 | Prefixos de chave `$aact_hmlg_` (sandbox) e `$aact_prod_` (produção) | Environment Availability | Só afeta uma validação de sanidade opcional; sem impacto funcional |
| A3 | `externalReference` enviado no checkout **propaga** para a assinatura e para as cobranças geradas | Pattern 5 | Se não propagar, o fallback #3 de resolução de `empresaId` não funciona. **Mitigação: o mapa local (`CheckoutAsaas` + `Empresa.asaasSubscriptionId`) é a fonte primária; `externalReference` é só cross-check** |
| A4 | `nextDueDate` do checkout aceita `"YYYY-MM-DD"` além do `"YYYY-MM-DD HH:mm:ss"` do exemplo | Code Examples #2 | Erro 400 na criação do checkout. **Mitigação: usar o formato do exemplo oficial (`"YYYY-MM-DD HH:mm:ss"`)** |
| A5 | Omitir `endDate` no objeto `subscription` do checkout cria assinatura sem prazo final | Code Examples #2 | Se `endDate` for obrigatório na prática, a criação falha em sandbox no primeiro teste (falha ruidosa, baixo risco) |
| A6 | Tarifas do Asaas (2,99% + R$0,49 cartão; R$1,99 Pix) | State of the Art | Precificação errada do plano. Tabela comercial muda sem aviso — **reconfirmar antes de decisão de preço** |
| A7 | `zod@4.5.4` é seguro apesar do veredito `SUS` (falso positivo do heurístico `too-new`) | Package Legitimacy Audit | Baixo (274M downloads/semana, repo oficial), mas o protocolo exige `checkpoint:human-verify` antes do install |
| A8 | O Asaas não impõe rate limit que atrapalhe este volume (dezenas de assinaturas) | Environment Availability | Baixo. Headers `RateLimit-Limit`/`RateLimit-Remaining`/`RateLimit-Reset` existem [ASSUMED, via busca]; o cliente deve logar 429 se ocorrer |
| A9 | O `PAYMENT_CONFIRMED` de um checkout recorrente traz `payment.subscription` já preenchido na primeira cobrança | Pattern 5 | Se a primeira cobrança não tiver `subscription`, o fallback por `CheckoutAsaas` cobre. **Mitigação já no design** |

## Open Questions

1. **A URL do checkout hospedado em sandbox é diferente da de produção?**
   - O que sabemos: produção é `https://asaas.com/checkoutSession/show?id=<id>` [CITED: docs.asaas.com/docs/link-do-checkout-e-redirecionamento-do-cliente]. A resposta de criação também traz um campo `link`, mas o exemplo de payload de `CHECKOUT_CREATED` mostra `"link": null`.
   - O que não está claro: se em sandbox o host é `sandbox.asaas.com`, e em que condições `link` vem preenchido.
   - Recomendação: `ASAAS_CHECKOUT_BASE_URL` como env var; no código, **preferir `checkout.link` quando não for `null`** e cair para a montagem manual. Resolver no primeiro teste de sandbox (checkpoint humano de D-05).

2. **`PAYMENT_CONFIRMED` da primeira cobrança chega antes ou depois de `SUBSCRIPTION_CREATED`?**
   - O que sabemos: com `sendType: "SEQUENTIALLY"` a ordem cronológica é preservada, e a assinatura logicamente precede a cobrança.
   - O que não está claro: se ambos entram na mesma fila sequencial (a doc não distingue filas por recurso).
   - Recomendação: não depender da ordem. Se `PAYMENT_CONFIRMED` chegar antes do mapa `sub_… → empresa` existir, resolver por `CheckoutAsaas` via `GET /v3/payments/{id}` → `subscription` → `GET /v3/subscriptions/{id}` → `externalReference`. Se ainda assim não resolver, deixar `processadoEm = null` para a Fase 5.

3. **Qual o comportamento do Asaas quando o cartão da recorrência falha em meses subsequentes?**
   - O que sabemos: `PAYMENT_OVERDUE` é emitido para cobrança vencida; `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` para falha de captura.
   - O que não está claro: se o Asaas retenta a cobrança no cartão automaticamente e por quantos dias.
   - Recomendação: irrelevante para o design (ambos são no-op de estado, Pattern 4). Documentar como pergunta ao suporte Asaas durante a homologação.

4. **Estorno e chargeback devem revogar acesso?**
   - O que sabemos: `PAYMENT_REFUNDED` e `PAYMENT_CHARGEBACK_REQUESTED` existem e serão recebidos.
   - O que não está claro: decisão de **produto**, não técnica. Reduzir `acessoAte` violaria a escrita monotônica.
   - Recomendação: **fora de escopo desta fase.** Registrar no ledger com `processadoEm` preenchido e um log de nível alto. Levantar como decisão para a Fase 7.

5. **Rate limits reais da API do Asaas.**
   - O que sabemos: headers `RateLimit-*` são retornados; alguns endpoints específicos (consulta de chave Pix) têm 5 req/min [ASSUMED, via busca].
   - O que não está claro: o limite global.
   - Recomendação: logar `429` explicitamente no cliente; volume desta fase torna isso improvável.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Toda a fase | ✓ | v25.9.0 (projeto declara v22 no CI) | — |
| npm | Instalar `zod` | ✓ | 11.12.1 | — |
| PostgreSQL | Migration do enum + tabelas novas | ✓ | 16.15, aceitando conexões em `:5432` | — |
| `DATABASE_URL` no `.env` | Prisma | ✓ | presente | — |
| Prisma CLI | `prisma migrate dev` | ✓ | 7.9.1 (dependência do projeto) | — |
| Vitest | Testes | ✓ | 4.1.10, setup em `tests/setup/vitest.setup.ts` | — |
| **Conta Asaas Sandbox** | Homologar checkout e webhook | **✗** | — | **Nenhum.** D-05 já prevê: checkpoint `human-action` |
| **`ASAAS_API_KEY` (sandbox)** | Toda chamada à API | **✗** | — | **Nenhum.** Vem com a conta |
| **`ASAAS_WEBHOOK_TOKEN`** | Autenticidade do webhook | **✗** | — | Gerado por nós (`crypto.randomBytes(32).toString("hex")`) e registrado no Asaas |
| Túnel HTTP (`cloudflared`/`ngrok`) | Receber webhook real do sandbox em `localhost` | **✗** | — | **Sim:** testes automatizados chamam o route handler direto (Vitest); o túnel só é necessário para o teste manual end-to-end |
| Docker | — | ✗ | — | Não necessário (Postgres roda nativo) |

**Missing dependencies with no fallback:**
- Conta Asaas Sandbox + `ASAAS_API_KEY`. **Bloqueia apenas a verificação end-to-end**, não a implementação nem os testes unitários. O planner deve posicionar um `checkpoint:human-action` **antes** da task de verificação em sandbox, permitindo que todo o código e os testes unitários sejam construídos antes.

**Missing dependencies with fallback:**
- `cloudflared`/`ngrok`: instalar apenas na task de verificação manual. Alternativa sem instalação: usar o botão de reenvio de evento no painel do Asaas contra uma URL de preview já deployada.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (`environment: "jsdom"`, com `// @vitest-environment node` por arquivo de serviço) |
| Config file | `vitest.config.mts` |
| Setup | `tests/setup/vitest.setup.ts`; mock profundo do Prisma em `tests/setup/prisma-mock.ts` (`vitest-mock-extended`) |
| Quick run command | `npx vitest run app/services/webhook-asaas.service.test.ts lib/billing` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GTW-01 | `criarCheckout` monta o corpo com `chargeTypes:["RECURRENT"]`, `billingTypes:["CREDIT_CARD"]`, `value: 29.90` | unit | `npx vitest run app/services/assinatura.service.test.ts` | ❌ Wave 0 |
| GTW-01 | D-07: erro do Asaas (rede/4xx/5xx) → `HttpError` e **zero** escrita no Prisma | unit | idem | ❌ Wave 0 |
| GTW-01 | Nenhum campo `creditCard*`/`cpfCnpj` aparece em qualquer `prisma.*.create` | unit | `npx vitest run app/services/webhook-asaas.service.test.ts` | ❌ Wave 0 |
| GTW-02 | Header `asaas-access-token` ausente/errado → 401 e nenhum insert | unit | `npx vitest run app/api/webhooks/asaas/route.test.ts` | ❌ Wave 0 |
| GTW-02 | Header correto → **exatamente** 200 (não 201/204) | unit | idem | ❌ Wave 0 |
| GTW-02 | O `create` do ledger acontece **antes** do 200; `processar` é agendado via `agendarPosResposta`, não `await`ado | unit | idem | ❌ Wave 0 |
| GTW-02 | Evento desconhecido / payload malformado → 200 (jamais 500) | unit | idem | ❌ Wave 0 |
| GTW-04 | Mesmo `eventoId` 2x → P2002 → 200 nas duas e **uma só** execução de `processar` | unit | idem | ❌ Wave 0 |
| GTW-03 | `PAYMENT_CONFIRMED` → `updateMany` com `OR:[{acessoAte:null},{acessoAte:{lt:novo}}]` e `acessoAte` derivado de `dueDate` | unit | `npx vitest run app/services/webhook-asaas.service.test.ts` | ❌ Wave 0 |
| GTW-03 | Após estender, `avaliarAcesso` devolve `EM_DIA` e `carenciaAte: null` | unit | `npx vitest run lib/avaliar-acesso.test.ts` (existente) + novo caso | ⚠️ parcial |
| GTW-03 | `registrarTransicao` é chamado com `causa: WEBHOOK_PAGAMENTO` e `anterior: ultimoStatusAuditado` | unit | idem | ❌ Wave 0 |
| GTW-04 | Evento antigo fora de ordem → `count === 0` → nenhuma auditoria, nenhuma escrita | unit | idem | ❌ Wave 0 |
| GTW-04 | `PAYMENT_OVERDUE` → **nenhuma** escrita em fatos de billing; `avaliarAcesso` já devolve `CARENCIA` com `carenciaAte = acessoAte + 10d` | unit | idem | ❌ Wave 0 |
| GTW-03 | `acessoAteAposPagamento("2021-01-31")` → 28/02 (clamp); `("2021-01-01")` → instante UTC correto de SP | unit | `npx vitest run lib/billing/asaas/datas.test.ts` | ❌ Wave 0 |
| GTW-01/02 | Config lança no import quando `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` faltam | unit | `npx vitest run lib/billing/asaas/config.test.ts` | ❌ Wave 0 |
| GTW-01..04 | Fluxo real em sandbox: criar checkout → pagar com cartão de teste → receber `CHECKOUT_PAID` + `PAYMENT_CONFIRMED` → `acessoAte` estendido | **manual** (`checkpoint:human-verify`) | — | ❌ requer conta Asaas (D-05) |

### Sampling Rate

- **Per task commit:** `npx vitest run <arquivo(s) tocados>`
- **Per wave merge:** `npm run test`
- **Phase gate:** `npm run test` + `npm run lint` verdes antes de `/gsd-verify-work`; verificação manual em sandbox como `checkpoint:human-verify` de fim de fase (`human_verify_mode: "end-of-phase"`)

### Wave 0 Gaps

- [ ] `lib/billing/asaas/config.test.ts` — cobre GTW-01/GTW-02 (fail-fast de env)
- [ ] `lib/billing/asaas/datas.test.ts` — cobre GTW-03 (clamp de mês, parsing de data SP)
- [ ] `app/services/assinatura.service.test.ts` — cobre GTW-01
- [ ] `app/services/webhook-asaas.service.test.ts` — cobre GTW-02/03/04
- [ ] `app/api/webhooks/asaas/route.test.ts` — **primeiro teste de route handler do projeto**; conferir se `tests/helpers/` já tem `buildRequest()` reusável (`CLAUDE.md` menciona `buildRequest()` nas convenções); se não, criá-lo em Wave 0
- [ ] Helper de fixtures de payload Asaas (`tests/helpers/asaas.ts`) — envelopes de `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `CHECKOUT_PAID`, `SUBSCRIPTION_CREATED`
- [ ] Framework install: nenhum — Vitest já configurado

## Security Domain

**Config:** `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: "high"`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | **sim** | Webhook: token estático em `asaas-access-token` comparado com `crypto.timingSafeEqual` sobre hashes SHA-256. Checkout: `requireAuth()` existente (`lib/api-auth.ts`) |
| V3 Session Management | não | O endpoint de webhook é stateless e não cria sessão |
| V4 Access Control | **sim** | `empresaId` **nunca** vem do payload como autorização — só do mapa local (`CheckoutAsaas`, `Empresa.asaasSubscriptionId`). Endpoint de checkout usa `auth.empresaId`, nunca body (C-08) |
| V5 Input Validation | **sim** | `zod` **não-estrito** no envelope; `safeParse` por evento; nunca `.strict()` (Pitfall 3) |
| V6 Cryptography | **sim** | `node:crypto` — `timingSafeEqual` para o token, `randomBytes(32)` para gerá-lo. **Nada hand-rolled** |
| V7 Error Handling & Logging | **sim** | `console.error` com prefixo `[asaas]`/`[webhook-asaas]`; **nunca** logar payload bruto (contém PII/dados financeiros); coluna `erro` no ledger; `agendarPosResposta` já garante que a falha assíncrona não derruba o request |
| V8 Data Protection | **sim** | GTW-01: redigir o payload antes de persistir (Pitfall 9); nenhum dado de cartão no banco; segredos em env com fail-fast |
| V9 Communications | **sim** | HTTPS obrigatório no endpoint de webhook — o token viaja em claro no header; sem TLS o segredo é capturável |
| V13 API & Web Service | **sim** | `runtime = "nodejs"`, `dynamic = "force-dynamic"`; resposta 200 sem corpo informativo (sem oráculo para o atacante) |

### Known Threat Patterns for Next.js 16 + Prisma + webhook de gateway

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Webhook forjado concede acesso gratuito | Spoofing / Elevation | Token no header + **re-fetch de `GET /v3/payments/{id}`** antes de estender acesso (compensa a ausência de HMAC) |
| Webhook forjado bloqueia concorrente (`PAYMENT_OVERDUE` de outra empresa) | Denial of Service | Pattern 4 torna isso inócuo: `PAYMENT_OVERDUE` não escreve nada |
| Replay de entrega legítima capturada | Spoofing | Ledger `eventoId @unique` → replay é no-op; escrita monotônica → nunca avança acesso |
| IDOR via `subscription`/`externalReference` do payload | Elevation | Resolução **só** por mapa local (Pattern 5); nunca `findFirst({ where: { asaasSubscriptionId: payload.subscription } })` sem que a coluna tenha sido gravada por nós |
| Comparação de token com `===` | Information Disclosure | `timingSafeEqual` |
| Segredo lido como `process.env.X ?? ""` | Elevation | Fail-fast no import (Code Examples #1) — `PITFALLS.md` já documenta este exato defeito para `JWT_SECRET` e R2 |
| PII/dados de cartão no banco e nos logs | Information Disclosure | Redação antes do persist; logs só com `eventoId`/`event`/`empresaId`/resultado |
| Timing attack no endpoint público revelando existência de empresa | Information Disclosure | Resposta 200 vazia e idêntica em todos os caminhos autenticados |
| Exaustão do pool do Prisma sob retry storm | Denial of Service | `lib/prisma.ts` **já** usa `globalThis` incondicionalmente [VERIFIED: leitura do arquivo] — o defeito descrito em `PITFALLS.md` § Pitfall 7 aparenta estar resolvido. O planner deve confirmar, não re-corrigir |
| SQL injection | Tampering | Prisma parametriza; nenhum `$queryRawUnsafe` nesta fase |

**Nota sobre `security_block_on: "high"`:** a ausência de HMAC no Asaas é uma limitação **do fornecedor**, não um defeito nosso. O conjunto (token estático + HTTPS + idempotência + escrita monotônica + re-fetch autoritativo) é o controle compensatório correto e deve ser documentado como tal no PLAN, para que a revisão de segurança não trate a ausência de HMAC como bloqueio.

## Sources

### Primary (HIGH confidence — documentação oficial, lida diretamente nesta sessão)
- `docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks` — modelo at-least-once, `id` estável entre reenvios, DDL PostgreSQL de exemplo, ordem persist→200→processar
- `docs.asaas.com/docs/webhook-para-cobrancas` — lista completa de eventos `PAYMENT_*`, semântica de `PAYMENT_CONFIRMED` vs `PAYMENT_RECEIVED`, payload com `payment.subscription`/`dueDate`/`externalReference`, aviso de novos atributos, fluxos por meio de pagamento
- `docs.asaas.com/docs/eventos-para-checkout` — `CHECKOUT_CREATED/PAID/CANCELED/EXPIRED`, payload de checkout, **`authToken` → header `asaas-access-token`**, exemplo literal de `POST /v3/webhooks`
- `docs.asaas.com/docs/eventos-para-assinaturas` — `SUBSCRIPTION_CREATED/UPDATED/INACTIVATED/DELETED`, payload com `subscription.id = "sub_…"`
- `docs.asaas.com/docs/erro-read-timed-out` — **timeout de 10 s**, "somente HTTP 200"
- `docs.asaas.com/docs/tipos-de-envio` — `SEQUENTIALLY` vs `NON_SEQUENTIALLY`
- `docs.asaas.com/docs/checkout-com-assinatura-recorrente` — `POST /v3/checkouts` com `chargeTypes:["RECURRENT"]`, exemplo completo
- `docs.asaas.com/docs/link-do-checkout-e-redirecionamento-do-cliente` — `https://asaas.com/checkoutSession/show?id=<id>`
- `docs.asaas.com/docs/sandbox` — `https://api-sandbox.asaas.com/v3`, conta sandbox independente
- `docs.asaas.com/docs/faq-do-asaas-checkout` — `billingTypes` (PIX/CREDIT_CARD), `chargeTypes`, status, `minutesToExpire` 10–1440, `successUrl` não confirma pagamento
- `docs.asaas.com/docs/como-informar-os-dados-do-cliente` — `customer` vs `customerData`
- `docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook` — estrutura do envelope
- `docs.asaas.com/llms.txt` — índice oficial usado para localizar as páginas

### Primary (HIGH confidence — código do projeto, lido diretamente)
- `lib/avaliar-acesso.ts`, `lib/agendar-pos-resposta.ts`, `lib/fuso-sao-paulo.ts`, `lib/api-auth.ts`, `lib/auth-guard.ts`, `lib/http-error.ts`, `lib/prisma.ts`
- `app/services/acesso.service.ts`, `app/services/acesso.service.test.ts`, `app/api/produtos/route.ts`
- `prisma/schema.prisma`, `prisma/migrations/`, `vitest.config.mts`, `tests/setup/prisma-mock.ts`, `package.json`

### Secondary (MEDIUM confidence — reference API via WebFetch, sumarizada)
- `docs.asaas.com/reference/criar-novo-checkout` — schema de request/response, enums
- `docs.asaas.com/reference/criar-nova-assinatura` — schema de `POST /v3/subscriptions`, header `access_token`
- `docs.asaas.com/reference/recuperar-uma-unica-cobranca` — schema completo do objeto `payment`, enum de `status`
- `docs.asaas.com/reference/criar-novo-webhook` — `authToken` 32–255 chars, `sendType`, `penalizedRequestsCount`
- `docs.asaas.com/docs/about-webhooks` — 15 falhas pausam a fila, retenção de 14 dias, reativação via `interrupted:false`
- `npm view zod version` / `gsd-tools query package-legitimacy check` — 4.5.4, 274M downloads/semana, veredito SUS (`too-new`)

### Tertiary (LOW confidence — WebSearch, marcado para validação)
- Base URL de produção `https://api.asaas.com/v3`, prefixos `$aact_prod_`/`$aact_hmlg_`, headers `RateLimit-*` — via busca, não confirmados em página oficial nesta sessão
- Tabela de tarifas do Asaas — herdada de `STACK.md` (MEDIUM lá), **não reconfirmada aqui**

### Documentos internos consumidos
- `.planning/phases/03-.../03-CONTEXT.md` (D-01..D-07), `.planning/REQUIREMENTS.md` (GTW-01..04)
- `.planning/research/STACK.md` (comparação de gateways, "What NOT to Use", stack recomendada)
- `.planning/research/PITFALLS.md` (Pitfalls 4, 5, 6, 7 — **Pitfall 4 corrigido aqui**: não há HMAC no Asaas)
- `.planning/phases/02-.../02-CONTEXT.md` (D-14: ponto de extensão do enum), `CLAUDE.md`, `AGENTS.md`

## Metadata

**Confidence breakdown:**
- **Standard stack** — HIGH: endpoints, headers, enums e formatos vieram de `docs.asaas.com` lido diretamente nesta sessão; `zod` verificado no registro npm; nenhuma dependência nova além de `zod`
- **Arquitetura (persist-then-ack, idempotência, monotonicidade)** — HIGH: o padrão é prescrito pelo próprio Asaas, e as três peças reusadas (`agendarPosResposta`, `registrarTransicao`, `meiaNoiteEmSaoPaulo`) foram lidas no código, não presumidas
- **Autenticação do webhook** — HIGH: `asaas-access-token` confirmado em duas páginas oficiais independentes; **corrige** a orientação de HMAC de `PITFALLS.md`
- **Mapeamento evento → `acessoAte` / carência** — HIGH quanto à semântica dos eventos; MEDIUM-HIGH quanto ao encaixe com `avaliarAcesso`, que dependeu de leitura do código da Fase 2 (feita) e não de execução
- **Pitfalls** — MEDIUM-HIGH: 6 dos 10 derivam de avisos explícitos na doc do Asaas; os demais (datas, `ALTER TYPE`, redação de PII) de comportamento conhecido de JS/PostgreSQL e do código existente
- **Formatos exatos de request (`nextDueDate`, `endDate`) e URL de sandbox do checkout** — MEDIUM: baseados em exemplos oficiais, não em chamadas reais (não há conta — D-05). Todos rastreados no Assumptions Log com mitigação
- **Tarifas** — LOW-MEDIUM: tabela comercial não reconfirmada; explicitamente marcada como `[ASSUMED]`

**Research date:** 2026-08-31
**Valid until:** 2026-09-30 (a documentação do Asaas foi atualizada em 2026-08-26/28 — está em revisão ativa; reconfirmar eventos e formatos se o planejamento escorregar para além de 30 dias)
