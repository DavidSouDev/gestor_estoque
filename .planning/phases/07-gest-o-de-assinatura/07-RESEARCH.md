# Phase 7: Gestão de Assinatura - Research

**Researched:** 2026-09-02
**Domain:** Self-service subscription management UI (status + cancel) sobre gateway Asaas, Next.js 16 App Router, multi-tenant
**Confidence:** MEDIUM-HIGH (endpoint de cancelamento CITADO da doc oficial; comportamento de idempotência e de consulta pós-remoção ASSUMIDO — ver Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sincronização pós-checkout (critério de sucesso #2)**
- **D-01:** Ao voltar do checkout hospedado do Asaas, o status reflete o pagamento "em segundos" via **polling no cliente com backoff**, não uma consulta síncrona bloqueando o render inicial da página. A tela de retorno consulta o status a cada poucos segundos até refletir o pagamento ou atingir um limite razoável de tentativas — número exato de tentativas/intervalo é Claude's Discretion (ver abaixo), a pesquisa da Fase 3 (`FEATURES.md`) já recomenda esse padrão em vez de esperar o próximo webhook.

**Fonte do status exibido (SUB-01)**
- **D-02:** Status atual e "próxima cobrança" vêm de uma **consulta viva ao Asaas a cada carregamento da tela** (`asaasClient.buscarAssinatura(asaasSubscriptionId)`), não de um campo espelhado localmente atualizado só por webhook. Justificativa do usuário: sempre atual, sem depender de webhook ter chegado — aceita a dependência de uma chamada de rede externa por carregamento de página. Isso é consistente com `03-RESEARCH.md`: Asaas não tem webhook de assinatura financeiro robusto (só `SUBSCRIPTION_CREATED/UPDATED/INACTIVATED/DELETED`, o estado financeiro vem de eventos `PAYMENT_*`), então uma consulta viva ao endpoint de assinatura é a fonte mais confiável de "próxima cobrança".
- **D-02b (decorrência):** Se a consulta ao Asaas falhar (rede, gateway fora do ar), a tela precisa de um estado degradado claro (ex.: "não foi possível carregar o status agora, tente novamente") — não travar a página nem mostrar dado desatualizado como se fosse atual. Mecanismo exato (retry, mensagem) é Claude's Discretion.

**Fluxo e confirmação de cancelamento (SUB-02, critério de sucesso #3)**
- **D-03:** Cancelar exige uma **confirmação explícita via modal**, mostrando a **data exata** até quando o acesso continua ativo antes do segundo clique de confirmação (ex.: "ativo até 14/09/2026, não será renovado") — recomendação já capturada em `FEATURES.md`: sem essa frase o usuário abre chamado ou faz chargeback. Um clique não cancela nada.
- **D-04:** Cancelar precisa **de fato parar as cobranças futuras no Asaas** (chamar o endpoint de cancelamento da assinatura), não só gravar `canceladoEm` localmente e deixar a assinatura "aberta" no gateway. A migration de `03-04-PLAN.md` documentou explicitamente que `endDate` foi **omitido de propósito** ao criar a assinatura — "assinatura aberta até cancelamento (SUB-02, Fase 7)" — esta é a fase que fecha esse ciclo. `asaasClient` ainda não tem um método de cancelamento; é trabalho novo desta fase.
- **D-05 (segurança, não é discricionário — já mapeado em `03-PITFALLS.md` Pitfall 11):** O cancelamento **nunca** aceita um `assinaturaId`/`asaasSubscriptionId` vindo do cliente. O id é derivado exclusivamente de `session.empresaId` no servidor (mesmo padrão de `iniciarPagamento` em `assinatura-actions.ts`) — a Server Action de cancelar não recebe nenhum id como parâmetro. Isso fecha o vetor de IDOR "uma empresa cancela a assinatura de outra".

**Local da tela (SUB-01, SUB-02)**
- **D-06:** Nova rota dedicada `/{slug}/admin/assinatura` dentro de `(protected)`, seguindo o mesmo padrão de `marca`/`estoque`/`combos`/`produtos`/`promocoes` já existentes — com link novo em `admin-nav.tsx`. Não é uma seção dentro de uma tela existente.

### Claude's Discretion
- Número exato de tentativas de polling e intervalo entre elas na tela de retorno do checkout (D-01) — desde que convirja em segundos (não minutos) e tenha um limite finito com fallback claro se esgotar sem confirmar o pagamento.
- Endpoint exato do Asaas para cancelar assinatura e shape do novo método em `asaasClient`/`assinaturaService` (D-04) — pesquisar a doc do Asaas.
- Texto exato da tela (copy) — segue o tom direto já usado no projeto.
- Onde exatamente inserir o novo item no `admin-nav.tsx` (ordem/posição) — segue o padrão visual já estabelecido pelos itens existentes.
- Tratamento de erro ao chamar o Asaas para cancelar — não deixar a UI achar que cancelou se a chamada ao gateway falhou; `canceladoEm` local só é gravado depois de confirmar o cancelamento no Asaas, não antes/em paralelo.

### Deferred Ideas (OUT OF SCOPE)
- Pausar assinatura em vez de cancelar (`PUT /v3/subscriptions/{id}` com `status: INACTIVE`) — v1.x.
- Múltiplos planos/preços — fora do escopo do milestone.
- Notificações proativas de trial acabando/carência — já coberto pelo banner da Fase 4 (ACC-01).
- Portal hospedado do próprio gateway — Asaas não tem portal de autoatendimento pronto.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUB-01 | Usuário pode visualizar o status atual do pagamento/assinatura da sua empresa | § Achado 2 (o `asaasSubscriptionId` pode estar nulo — a tela precisa de 4 estados, não 1), § Achado 3 (a data correta é `max(trialFim, acessoAte)`, não `expiraEm`), § Code Examples #2 (leitura viva + degradação), § Pitfall 3 (rate limit e amplificação por polling) |
| SUB-02 | Usuário pode cancelar a assinatura; mantém acesso até o fim dos 30 dias do último pagamento | § Achado 1 (`DELETE /v3/subscriptions/{id}`, resposta, erros, não-idempotência), § Achado 5 (`canceladoEm` não é gravável pelo `empresaService.update` — allowlist BILL-04), § Code Examples #1 e #3, § Pitfall 1 (ordem Asaas→banco), § Pitfall 4 (404 do gateway é ambíguo) |
| SUB-03 | Empresa cancelada que passa do fim do período pago segue o mesmo fluxo de bloqueio das demais | § Achado 4 (nenhuma linha nova de enforcement — `avaliarAcesso` D-08/D-10 e `acessoBloqueado` já cobrem; a fase só grava `canceladoEm`), § Achado 6 (`SUBSCRIPTION_DELETED`/`PAYMENT_DELETED` já são inertes no webhook — verificado por grep), § Validation Architecture (E2E de expiração pós-cancelamento) |
</phase_requirements>

## Summary

Esta fase é 90% UI e 10% integração. O backend de decisão de acesso já está pronto e é normativamente fechado: `avaliarAcesso` (Fase 2) já trata `canceladoEm` (D-06: cancelado com acesso pago vigente continua `EM_DIA`; D-08/D-10: expirado com `canceladoEm` vira `CANCELADO`) e `acessoBloqueado` já dá a `CANCELADO` tratamento idêntico a `BLOQUEADO`. **SUB-03 já está implementado** — a única coisa que falta é alguém gravar `canceladoEm`. Nenhuma mudança em `lib/avaliar-acesso.ts`, em `lib/session.ts` ou no worker da Fase 5 é necessária ou permitida.

A integração nova é uma única chamada: `DELETE /v3/subscriptions/{id}` `[CITED: docs.asaas.com/reference/remove-subscription]`, com o mesmo header `access_token` que o `chamar()` de `lib/billing/asaas/client.ts` já injeta, devolvendo `{ "deleted": true, "id": "sub_…" }`. Ela **não é idempotente**: a doc afirma 404 para "assinatura que não existe ou não pertence à conta", o que inclui uma já removida. Isso obriga a ordem Asaas-primeiro-banco-depois (a mesma "fronteira D-07" já comentada em `assinatura.service.ts`) a ter um caminho explícito para o 404, senão um duplo-clique deixa o usuário achando que o cancelamento falhou quando na verdade já tinha dado certo.

Três descobertas do código existente mudam materialmente o desenho da tela e precisam entrar no plano. **(1)** `Empresa.asaasSubscriptionId` fica **nulo** durante os primeiros segundos depois do checkout — a homologação `[03-07]` provou que `PAYMENT_CONFIRMED` chega ANTES de `SUBSCRIPTION_CREATED`, e é este último quem escreve o id. Logo, a "consulta viva ao Asaas" de D-02 é literalmente impossível no exato momento em que o usuário volta do checkout, e o polling de D-01 tem que mirar em estado LOCAL, não no Asaas. **(2)** A data exata de "ativo até" **não** é `ResultadoAcesso.expiraEm`: durante o trial, `avaliarAcesso` devolve `trialFim` mesmo que `acessoAte` já esteja mais à frente (regra D-05), então o modal de cancelamento mostraria uma data antes da verdade. O valor correto é `max(trialFim, acessoAte)`. **(3)** A `successUrl` do checkout aponta para `/{slug}/admin`, e `requireAdminSession` devolve uma empresa bloqueada para `/{slug}/admin/bloqueado` — ou seja, para o cliente inadimplente que acabou de pagar, a tela de retorno é `/bloqueado`, não `/assinatura` (que fica dentro de `(protected)` e é inalcançável enquanto o bloqueio não cair).

**Primary recommendation:** Adicionar `asaasClient.removerAssinatura(id)` (uma linha, `DELETE /subscriptions/{id}`) e `assinaturaService.cancelar(empresaId)` (lê `asaasSubscriptionId` da própria empresa, chama o Asaas, só então grava `canceladoEm` via `prisma.empresa.update` direto — o allowlist de `empresaService.update` proíbe campos de billing por design). A tela `/{slug}/admin/assinatura` renderiza **quatro** estados (sem assinatura ainda / ativa / cancelada com acesso residual / gateway indisponível) e o polling pós-checkout é uma Server Action que devolve o `StatusAcesso` **derivado dos fatos locais**, não o objeto do Asaas.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Exibir status/próxima cobrança da assinatura (SUB-01) | Frontend Server (RSC `page.tsx`) | API/Backend (`assinaturaService`) | A chave do Asaas é segredo de servidor e a projeção de billing não pode atravessar para o cliente. Nenhum client component do projeto faz chamada de rede (T-04-09). |
| Consulta viva ao gateway | API/Backend (`asaasClient`) | — | `lib/billing/asaas/client.ts` é declarado como o único arquivo que conhece URL, header e corpo do Asaas. |
| Confirmação de cancelamento (modal, 2 cliques) | Browser/Client (client component) | — | Estado puramente de UI (`useState`), sem I/O — mesmo idioma de `confirmar-remocao.tsx`. |
| Executar o cancelamento (SUB-02) | API/Backend (Server Action → `assinaturaService`) | — | D-05: nenhum id atravessa a fronteira cliente→servidor; a Server Action recebe só `slug`. |
| Persistir `canceladoEm` | Database (`prisma.empresa.update` dedicado) | — | Allowlist de `empresaService.update` proíbe campos de billing (BILL-04). Precedente: `capturarAssinatura` escreve direto. |
| Polling pós-checkout (D-01) | Browser/Client (`setTimeout` + `startTransition`) | API/Backend (Server Action de leitura) | O loop e o backoff são estado de UI; a leitura autoritativa é servidor. Precedente exato: `combo-hub.tsx` chama Server Action por `startTransition` e depois `router.refresh()`. |
| Decidir bloqueio de empresa cancelada (SUB-03) | API/Backend (`lib/avaliar-acesso.ts` + `lib/session.ts`) | — | **Já implementado.** Esta fase NÃO toca aqui. |
| Despublicação do catálogo de empresa cancelada | Frontend Server (`app/[slug]/(catalogo)`) | — | **Já implementado** pela Fase 4 via `podePublicarCatalogo`. |

## Project Constraints (from CLAUDE.md / AGENTS.md)

Diretivas acionáveis que o plano precisa respeitar:

1. **`AGENTS.md`: "This is NOT the Next.js you know."** Ler `node_modules/next/dist/docs/` antes de escrever código de framework. Já feito nesta pesquisa para `use-router.md` (semântica de `router.refresh()`).
2. **Não armazenar dados de pagamento.** `lib/billing/asaas/tipos.ts` declara apenas os campos usados, nunca o DTO do fornecedor — o novo tipo de resposta de cancelamento segue a mesma regra (2 campos: `deleted`, `id`).
3. **Isolamento multi-tenant por `empresaId`** em toda query. Nenhum `findUnique({ where: { id } })` novo em código de billing.
4. **Naming:** `[entidade].service.ts`, teste co-locado `[entidade].service.test.ts`, componentes PascalCase `.tsx`, imports por `@/`, nunca `../` entre diretórios.
5. **Erros:** `HttpError`/`AuthError` com `.status`; `console.error` para exceções; mensagem genérica ao cliente, detalhe só no log do servidor.
6. **Services exportam classe + singleton** (`export const assinaturaService = new AssinaturaService()`); rotas do admin protegido em `app/[slug]/admin/(protected)/{secao}/page.tsx` + `actions.ts` co-locados.
7. **GSD Workflow Enforcement:** edições só via comando GSD.
8. **`select` explícito, `include` proibido** no caminho de `Empresa`/`Usuario` (arrasta `senhaHash`).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.0 | App Router, Server Components, Server Actions | Já é o framework do projeto; verificado em `node_modules/next/package.json` `[VERIFIED: node -p require(...)]` |
| react / react-dom | 19.2.8 | `useState`, `useTransition`, `useFormStatus` | Já no projeto; padrão de client component estabelecido |
| @prisma/client | 7.9.1 | Escrita de `canceladoEm`, leitura dos fatos de billing | Já é o ORM; `Empresa` já tem todos os campos |
| vitest | 4.1.10 | Testes unitários de service/client/componente | Já configurado (`vitest.config.mts`) |
| @playwright/test | 1.62.1 | E2E do fluxo de cancelamento e do bloqueio pós-período | Já configurado (`playwright.config.ts`), suíte `e2e/` com 11 specs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| — | — | — | **Nenhuma dependência nova.** Toda a integração usa `fetch` nativo pelo `chamar()` já existente. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `DELETE /v3/subscriptions/{id}` (remover) | `PUT /v3/subscriptions/{id}` com `status: "INACTIVE"` (suspender) | A própria doc do Asaas recomenda `INACTIVE` "caso haja possibilidade de retomar a recorrência" `[CITED: docs.asaas.com/reference/remove-subscription]`. Mas suspender **não** apaga as cobranças pendentes e deixa a assinatura viva no gateway — D-04 exige "parar as cobranças futuras de fato", e `Deferred Ideas` põe pausa explicitamente fora de escopo. **Usar DELETE.** |
| Polling do status derivado local | Polling de `GET /v3/subscriptions/{id}` | Impossível nos primeiros segundos: `asaasSubscriptionId` ainda é nulo (§ Achado 2). Além disso mostraria "assinatura ativa" enquanto o admin continua bloqueado — pior que não mostrar nada. |
| Polling com Server Action | Polling com Route Handler `fetch` do cliente | `requireAuth` lê só `Authorization: Bearer`, e a sessão web é cookie `httpOnly` — o JS do cliente não consegue autenticar rota REST. Racional já registrado no JSDoc de `assinatura-actions.ts` (T-04-09). |
| `router.refresh()` a cada tick | `revalidatePath()` na Server Action | `router.refresh()` limpa o Client Cache da rota mas **não** invalida cache de servidor `[CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:46]`. Como as leituras aqui são dinâmicas (cookies + Prisma, sem `unstable_cache`), `router.refresh()` basta e é o padrão já usado em `combo-hub.tsx`. |

**Installation:**
```bash
# Nada a instalar. Zero dependências novas nesta fase.
```

## Package Legitimacy Audit

**Não aplicável a esta fase — nenhum pacote externo é instalado.**

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(nenhum)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

Se o planner introduzir qualquer dependência nova (ex.: uma lib de modal), ela precisa passar pelo gate `gsd-tools query package-legitimacy check` antes de entrar num PLAN — o projeto hoje constrói modais à mão (`confirmar-remocao.tsx`) e não tem lib de UI.

## Architecture Patterns

### System Architecture Diagram

```text
                         ┌──────────────────────────────────────────┐
   navegador do admin    │  /{slug}/admin/assinatura  (RSC page)    │
   ─────────────────────►│  requireAdminSession(slug)  ← DAL        │
                         │        │                                 │
                         │        ├─ canceladoEm != null? ──────────┼──► [Estado C: cancelada]
                         │        │      (nunca chama o Asaas)      │     mostra acessoEfetivoAte
                         │        │                                 │
                         │        ├─ asaasSubscriptionId == null? ──┼──► [Estado A: aguardando]
                         │        │                                 │     "confirmando pagamento…"
                         │        │                                 │
                         │        └─ assinaturaService.consultar() ─┼──► asaasClient.buscarAssinatura
                         │                 │                        │        │
                         │                 ├─ ok ───────────────────┼──► [Estado B: ativa]
                         │                 └─ AsaasApiError ────────┼──► [Estado D: degradado] (D-02b)
                         └──────────────────────────────────────────┘
                                          │
              clique "Cancelar"           ▼
        ┌──────────────────────────────────────────────┐
        │ modal (client component, 2 cliques, D-03)    │
        │  "ativo até {max(trialFim, acessoAte)}"      │
        └───────────────┬──────────────────────────────┘
                        │ startTransition → Server Action cancelarAssinatura(slug)
                        ▼                       (NENHUM id no argumento — D-05)
        ┌──────────────────────────────────────────────┐
        │ getVerifiedSession() → session.empresaId     │
        │ assinaturaService.cancelar(empresaId)        │
        │   1. SELECT asaasSubscriptionId,canceladoEm  │  (where: { id: empresaId })
        │   2. DELETE /v3/subscriptions/{id}   ────────┼──► Asaas
        │  ─── FRONTEIRA: nada é escrito acima ────    │      │ 200 {deleted:true}
        │   3. UPDATE Empresa SET canceladoEm = now()  │◄─────┘ (404 ⇒ ver Pitfall 4)
        └───────────────┬──────────────────────────────┘
                        │ router.refresh()
                        ▼
                  tela re-renderiza no Estado C


   RETORNO DO CHECKOUT (successUrl = /{slug}/admin — ver Achado 7)
   ───────────────────────────────────────────────────────────────
   Asaas ──► navegador ──► /{slug}/admin  ─(se bloqueado)─► /{slug}/admin/bloqueado
                                │                                    │
                                └──────────┬─────────────────────────┘
                                           ▼
                             client component de polling (D-01)
                             setTimeout(backoff) → Server Action
                             consultarStatusAcesso(slug)
                                           │
                                           ▼
                             revalidarConta() → avaliarAcesso(fatos locais)
                                           │
                              status deixou de bloquear? → router.refresh()
                              esgotou tentativas?       → fallback explícito


   INDEPENDENTE (já existe, NÃO muda nesta fase)
   ─────────────────────────────────────────────
   Asaas webhook ──► /api/webhooks/asaas ──► webhookAsaasService.processar
        PAYMENT_CONFIRMED ──► acessoAte += 1 mês (escrita monotônica)
        SUBSCRIPTION_CREATED ──► grava asaasSubscriptionId / asaasCustomerId
        SUBSCRIPTION_DELETED ──► observação, ZERO mutação  ← disparado pelo nosso cancel
        PAYMENT_DELETED ──► não registrado ⇒ ramo `default` ⇒ log + processado
```

### Recommended Project Structure

```text
lib/billing/asaas/
├── client.ts                    # + removerAssinatura(id): DELETE /subscriptions/{id}
├── tipos.ts                     # + AsaasSubscriptionRemovida { deleted, id }
└── client.test.ts               # + casos do novo método (mock de fetch já montado)

lib/
└── avaliar-acesso.ts            # + acessoEfetivoAte(fatos): Date | null  (função PURA)

app/services/
├── assinatura.service.ts        # + consultar(empresaId) e cancelar(empresaId)
└── assinatura.service.test.ts   # + asserção de ausência de escrita quando o gateway falha

app/[slug]/admin/(protected)/assinatura/
├── page.tsx                     # RSC: requireAdminSession + 4 estados
├── actions.ts                   # "use server": cancelarAssinatura(slug)
└── _components/
    ├── assinatura-card.tsx      # server-safe, recebe props já serializadas
    ├── cancelar-dialog.tsx      # "use client": modal de 2 cliques (D-03)
    └── *.test.tsx

app/[slug]/admin/_lib/
└── assinatura-actions.ts        # + consultarStatusAcesso(slug) para o polling (D-01)

app/[slug]/admin/(protected)/_components/
└── admin-nav.tsx                # + item "Assinatura" + ICONS.assinatura

app/[slug]/admin/bloqueado/_components/
└── bloqueado-card.tsx           # + montagem do poller no retorno do checkout

e2e/
└── cancelamento-de-assinatura.spec.ts
```

### Pattern 1: "Gateway primeiro, banco depois" (a fronteira D-07)

**What:** Nenhuma escrita local acontece antes de o Asaas confirmar. A ordem é normativa e já está comentada como fronteira em `assinatura.service.ts:85-92`.
**When to use:** Todo método de `assinaturaService` que combina I/O de gateway e escrita local.
**Why:** Aqui a justificativa é o inverso da de `criarCheckout`. Lá, inverter criaria linha órfã sem contrapartida. Aqui, inverter cria o pior estado possível: `canceladoEm` gravado, usuário vê "cancelado", e o Asaas continua cobrando o cartão todo mês. É exatamente o cenário que D-04 e a última bala de Claude's Discretion nomeiam.

```typescript
// Source: padrão de app/services/assinatura.service.ts:58-105
async cancelar(empresaId: string): Promise<{ acessoAte: Date | null }> {
  const empresa = await prisma.empresa.findFirst({
    where: { id: empresaId, deletedAt: null },
    select: EMPRESA_CANCELAMENTO_SELECT, // select explícito (C-07), nunca include
  });

  if (!empresa) throw new HttpError("Empresa não encontrada.", 404);
  if (!empresa.asaasSubscriptionId) throw new HttpError("Nenhuma assinatura ativa para cancelar.", 409);

  try {
    await asaasClient.removerAssinatura(empresa.asaasSubscriptionId);
  } catch (erro) {
    // Ver Pitfall 4: 404 é "já não existe lá" e NÃO deve abortar a gravação local.
    if (!(erro instanceof AsaasApiError) || erro.status !== 404) {
      console.error(
        `[asaas] falha ao cancelar assinatura — empresaId=${empresaId}`,
        `status=${erro instanceof AsaasApiError ? erro.status : "desconhecido"}`
      );
      throw new HttpError("Não foi possível cancelar agora. Tente novamente.", 502);
    }
  }

  // ─── FRONTEIRA ────────────────────────────────────────────────────────────
  // Acima desta linha NÃO existe nenhuma escrita. Inverter a ordem produz o
  // estado "achamos que cancelou e o Asaas ainda cobra" (D-04).
  // ──────────────────────────────────────────────────────────────────────────

  await prisma.empresa.update({
    where: { id: empresaId },
    data: { canceladoEm: new Date() },
  });

  return { acessoAte: acessoEfetivoAte(empresa) };
}
```

### Pattern 2: Server Action como única saída de rede do cliente

**What:** Client components jamais fazem `fetch`. Chamam Server Actions por `startTransition` e depois `router.refresh()`.
**When to use:** Modal de cancelamento e loop de polling.
**Example (precedente literal no projeto):**

```typescript
// Source: app/[slug]/admin/(protected)/_components/simples/combo-hub.tsx:100-120
const [pending, startTransition] = useTransition();
// ...
startTransition(async () => {
  const resultado = await removerComboSimples(slug, selecionado.id);
  if (resultado.error) { setError(resultado.error); return; }
  router.refresh();
  onDone();
});
```

`router.refresh()` "faz uma nova requisição ao servidor, re-busca os dados e re-renderiza Server Components... limpa o Client Cache da rota atual, mas **não** invalida o cache do lado servidor" `[CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:46]`. Como a página de assinatura é dinâmica por construção (`cookies()` via `requireAdminSession` + Prisma sem `unstable_cache`), isso é suficiente — `revalidatePath` seria ruído.

### Pattern 3: Quatro estados de tela, não um

**What:** `page.tsx` decide o estado ANTES de qualquer I/O de gateway, na ordem abaixo. A ordem é normativa: inverter faz o produto chamar o Asaas com um id de assinatura já removida.

| Ordem | Condição | Estado | Chama o Asaas? |
|---|---|---|---|
| 1 | `acessoVitalicio === true` | "acesso vitalício, sem cobrança" | Não |
| 2 | `canceladoEm !== null` | C — cancelada, com acesso até `acessoEfetivoAte` | **Não** (a assinatura foi removida lá; ver Pitfall 4) |
| 3 | `asaasSubscriptionId === null` | A — "confirmando pagamento…" / "sem assinatura ativa" | **Não** (não há id) |
| 4 | consulta ok | B — ativa, com `nextDueDate` e `cycle` | Sim |
| 5 | consulta lançou `AsaasApiError` | D — degradado (D-02b) | Sim (falhou) |

### Anti-Patterns to Avoid

- **Chamar `empresaService.update({ canceladoEm })`.** O allowlist positivo em `empresa.service.ts:532-548` é uma defesa deliberada de BILL-04; adicionar `canceladoEm` a ele abriria `PATCH /api/empresas/[id]` para qualquer ADMIN escrever fatos de billing por HTTP. Precedente correto: `capturarAssinatura` escreve com `prisma.empresa.update` direto e documenta o porquê (T-03-35).
- **Recalcular "dias restantes" ou "acesso até" na UI.** `lib/avaliar-acesso.ts` declara `diasRestantesDeCarencia` como "o ÚNICO lugar autorizado a calcular dias restantes". A nova data segue a mesma regra: função pura em `lib/`, testada, injetando o relógio.
- **Escrever `StatusAcesso` em qualquer lugar.** BILL-01/D-16: status é sempre derivado por `avaliarAcesso`. `ultimoStatusAuditado` é bookkeeping de auditoria e nenhuma decisão pode lê-lo.
- **Fazer o `page.tsx` da tela de assinatura ser o boundary de autorização.** É `requireAdminSession(slug)` chamado em CADA page — layout não é boundary (T-04-06, doc empacotada `01-app/02-guides/authentication.md`).
- **Adicionar `PAYMENT_DELETED`/`SUBSCRIPTION_DELETED` como mutadores no webhook.** Já são inertes de propósito (§ Achado 6). Um handler que zerasse `acessoAte` ao receber `SUBSCRIPTION_DELETED` revogaria na hora o período já pago — o oposto exato de SUB-02.
- **Polling sem teto.** Um loop sem limite finito vira uma aba aberta batendo no servidor indefinidamente. D-01 exige limite + fallback explícito.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Decidir se cancelado bloqueia | Um `if (canceladoEm)` na tela ou no guard | `acessoBloqueado(status)` de `lib/avaliar-acesso.ts` | `BLOQUEIA: Record<StatusAcesso, boolean>` é exaustivo por tipo; comparar rótulos à mão derruba TRIAL/CARENCIA/VITALICIO junto (T-04-15) |
| Derivar o status | Ler `ultimoStatusAuditado` | `revalidarConta()` → `conta.statusAcesso` | BILL-01: `ultimoStatusAuditado` é bookkeeping, não fonte da verdade; há gate de grep provando isso |
| Aritmética de mês/fuso | `setMonth(+1)` ou `+30*86400000` | `acessoAteAposPagamento` / `meiaNoiteEmSaoPaulo` | Mutadores nativos fazem overflow (31/01+1mês = 02/03); 30 dias em ms desalinha do ciclo `MONTHLY` em ~5 meses (JSDoc de `datas.ts`) |
| Gravar linha de auditoria | `prisma.auditoriaAcesso.create` | `acessoService.registrarTransicao` | Compare-and-swap sobre `ultimoStatusAuditado`; duplicar produz linhas repetidas sob concorrência (T-02-15) |
| Chamada HTTP ao Asaas | Um `fetch` novo com header montado à mão | `chamar()` de `client.ts` | É o único arquivo que conhece URL, header `access_token` e timeout de 15 s; ele já redige o log de erro para não vazar PII do pagador (T-03-07) |
| Verificar sessão + tenant | Ler cookie/JWT na action | `getVerifiedSession()` / `requireAdminSession(slug)` | Fecha o slug obsoleto, o loop de redirect e o fail-closed de erro de banco, tudo já provado |
| Modal de confirmação | Lib de UI nova | `useState` + markup, como `confirmar-remocao.tsx` | O projeto não tem lib de modal; introduzir uma aqui é dependência nova sem necessidade |

**Key insight:** Todo cálculo de acesso, fuso e auditoria deste sistema tem exatamente um dono, e cada dono tem um JSDoc normativo explicando por que uma segunda cópia diverge. O trabalho desta fase é **ler** esses donos, nunca reescrevê-los.

## Common Pitfalls

### Pitfall 1: Gravar `canceladoEm` antes (ou em paralelo) de confirmar no Asaas
**What goes wrong:** A UI diz "cancelado", o cartão continua sendo cobrado todo mês, o cliente contesta e abre chargeback.
**Why it happens:** Escrever local é rápido e não falha; a tentação é fazer as duas coisas com `Promise.all` ou gravar primeiro "para a tela responder rápido".
**How to avoid:** Ordem estrita gateway→banco, com a fronteira comentada no código (Pattern 1). O teste de `assinatura.service.test.ts` já usa asserção de **ausência** de escrita quando o gateway falha — replicar para `cancelar`.
**Warning signs:** `Promise.all` no método de cancelar; `prisma.empresa.update` acima da chamada ao `asaasClient`; ausência de teste "gateway 502 ⇒ `canceladoEm` continua nulo".

### Pitfall 2: Mostrar a data errada no modal (off-by-um-ciclo durante o trial)
**What goes wrong:** Empresa em trial que já pagou (`trialFim = 15/09`, `acessoAte = 15/10`) vê "ativo até 15/09" e acha que perdeu um mês pago.
**Why it happens:** `ResultadoAcesso.expiraEm` parece o campo certo, mas `avaliarAcesso` devolve `trialFim` durante o trial por causa da regra D-05 ("o trial vale até o fim, mesmo com `acessoAte` já no futuro"). `revalidarConta` propaga esse valor como `acessoExpiraEm`.
**How to avoid:** Nova função pura em `lib/avaliar-acesso.ts`:

```typescript
/** Data em que o acesso REALMENTE termina se nada mais for pago. É o MAIOR
 *  dos dois fatos com prazo — nunca `ResultadoAcesso.expiraEm`, que durante o
 *  trial devolve `trialFim` por força de D-05 e esconde um mês já pago. */
export function acessoEfetivoAte(fatos: FatosDeAcesso): Date | null {
  if (fatos.acessoVitalicio) return null;
  const candidatos = [fatos.trialFim, fatos.acessoAte].filter((d): d is Date => d !== null);
  if (candidatos.length === 0) return null;
  return new Date(Math.max(...candidatos.map((d) => d.getTime())));
}
```

**Warning signs:** `conta.acessoExpiraEm` aparecendo no texto do modal de cancelamento; qualquer `Math.max` de datas fora de `lib/avaliar-acesso.ts`; um teste que só cobre o caso `EM_DIA` e não o caso `TRIAL + acessoAte futuro`.

### Pitfall 3: Consulta viva ao Asaas amplificada por polling
**What goes wrong:** Cada carregamento da tela é 1 request ao Asaas (D-02). Se o polling de D-01 também consultar o Asaas, um retorno de checkout com 20 tentativas vira 20 requests, por usuário, por pagamento.
**Why it happens:** D-01 e D-02 lidos juntos sugerem "polling da mesma fonte".
**How to avoid:** O polling lê estado **local** (`revalidarConta` → `avaliarAcesso`), não o Asaas. Além do custo, é a única coisa correta: o polling precisa responder "o admin já destravou?", e isso é decidido pelos fatos locais, não pelo objeto do gateway.
**Números de contexto:** a quota é de **25.000 requisições por conta a cada 12 h**, com máximo de **50 GET concorrentes**, e o excesso devolve 429 com headers `RateLimit-Limit`/`RateLimit-Remaining`/`RateLimit-Reset` `[CITED: docs.asaas.com/reference/rate-e-quota-limit]`. Isso é folgado para 1 request por page view; deixa de ser se o polling multiplicar.
**Warning signs:** `asaasClient` importado dentro da action de polling; ausência de teto de tentativas; intervalo fixo sem backoff.

### Pitfall 4: Tratar o 404 do cancelamento como falha
**What goes wrong:** Duplo-clique, ou reenvio depois de um timeout de rede: a primeira chamada removeu a assinatura, a segunda recebe 404, a UI mostra "não foi possível cancelar" e `canceladoEm` nunca é gravado. O usuário fica com a cobrança parada no gateway e o sistema achando que ele continua assinante.
**Why it happens:** `DELETE /v3/subscriptions/{id}` **não é idempotente**: a doc lista 404 para "assinatura que não existe ou não pertence à conta autenticada" `[CITED: docs.asaas.com/reference/remove-subscription]`.
**How to avoid:** Tratar `AsaasApiError.status === 404` no `cancelar` como "já está cancelado lá" e **seguir para a gravação local** (ver Pattern 1). Isso é seguro contra IDOR porque o id nunca veio do cliente (D-05): ele foi lido da própria `Empresa` da sessão, então "não pertence à conta" é impossível por construção — resta apenas "já foi removida".
**Warning signs:** `catch` que relança todo `AsaasApiError` sem distinguir status; ausência de teste "404 no DELETE ⇒ `canceladoEm` gravado mesmo assim".

### Pitfall 5: Assumir que a tela `/assinatura` é alcançável por quem mais precisa dela
**What goes wrong:** A empresa `BLOQUEADO`/`CANCELADO` clica em "Assinatura" e é jogada em `/bloqueado`, porque `requireAdminSession` redireciona antes de a página renderizar (`lib/session.ts`). Isso é correto por design, mas significa que **a tela de status não serve o cliente cancelado que quer voltar** — e que o link do nav some para ele.
**Why it happens:** D-06 põe a rota em `(protected)`, e `(protected)` é fechado por `acessoBloqueado`.
**How to avoid:** Aceitar e documentar: para quem está bloqueado/cancelado-e-expirado, a tela canônica continua sendo `/bloqueado` (que já tem o botão de pagar da Fase 4). A tela `/assinatura` serve TRIAL, EM_DIA, CARENCIA e cancelado-com-acesso-residual — que é exatamente o público dos critérios #1 e #3.
**Warning signs:** Um plano que mova `/assinatura` para fora de `(protected)` (reintroduz a classe `ERR_TOO_MANY_REDIRECTS` documentada em `session.ts` e no cabeçalho de `bloqueado/page.tsx`); um E2E que espere ver `/assinatura` com empresa bloqueada.

### Pitfall 6: `canceladoEm` nunca é limpo na reativação
**What goes wrong:** Cliente cancela, muda de ideia e paga de novo. `avaliarAcesso` D-09 o devolve corretamente a `EM_DIA` (porque `acessoAte` volta ao futuro), então o bug fica invisível. Meses depois, quando ele para de pagar de verdade, o rótulo de auditoria sai `CANCELADO` em vez de `BLOQUEADO` — e a tela de assinatura, se ramificar por `canceladoEm` (Pattern 3, ordem 2), mostra "cancelada" para um assinante ativo.
**Why it happens:** Nenhum caminho do webhook limpa `canceladoEm` — `aplicarPagamentoConfirmado` só mexe em `acessoAte`.
**How to avoid:** Duas opções, e o plano precisa escolher uma explicitamente:
(a) o ramo de "cancelada" da tela testa `canceladoEm !== null && !acessoBloqueado(status) === false`… — frágil; **ou**
(b) melhor: `assinaturaService` ganha o dever de limpar `canceladoEm` quando um novo checkout é criado (`criarCheckout`) ou quando `SUBSCRIPTION_CREATED` grava um `asaasSubscriptionId` novo e diferente do anterior.
Recomendação: **(b) no `criarCheckout`** — é o único momento em que a intenção do usuário de voltar é inequívoca, e é uma escrita local sem I/O de gateway envolvido. Marcar como decisão do plano; não é decisão travada em CONTEXT.md.
**Warning signs:** Nenhum teste cobrindo "cancelar → pagar de novo → cancelar de novo".

### Pitfall 7: Adicionar valor ao enum `CausaTransicaoAcesso` na mesma migration que o usa
**What goes wrong:** Postgres recusa USAR um valor de enum adicionado na mesma transação em que foi criado — está comentado no próprio `schema.prisma:13` e é o "Pitfall 7" da pesquisa da Fase 3.
**Why it happens:** Parece natural juntar `ALTER TYPE ... ADD VALUE` e o DML no mesmo arquivo.
**How to avoid:** Se (e só se) o plano decidir gravar auditoria no cancelamento, o novo valor entra em **migration própria, sem DML que o use**. Mas note: **provavelmente nem é preciso.** Gravar `canceladoEm` com `acessoAte` ainda no futuro **não muda o status derivado** (D-06 — continua `EM_DIA`), logo não há transição a registrar. A transição para `CANCELADO` acontece só quando o período expira, e quem a registra é `revalidarConta` (`AVALIACAO_SESSAO`) ou o worker (`WORKER_DIARIO`), ambos já existentes.

## Code Examples

Padrões verificados contra o código do projeto e a doc oficial.

### 1. Novo método do cliente Asaas

```typescript
// Source: lib/billing/asaas/client.ts (segue chamar() + buscarAssinatura, linhas 61-164)
// Endpoint: [CITED: docs.asaas.com/reference/remove-subscription]
//
// A resposta é declarada com DOIS campos e mais nenhum, pela regra GTW-01/T-03-08
// de tipos.ts: declarar só o que é usado impede que um campo sensível novo do
// fornecedor tenha caminho de tipo para um log ou para o banco.

// em lib/billing/asaas/tipos.ts
/** Resposta de `DELETE /subscriptions/{id}`. */
export interface AsaasAssinaturaRemovida {
  deleted: boolean;
  id: string;
}

// em lib/billing/asaas/client.ts, dentro de class AsaasClient
/**
 * Remove a assinatura recorrente, encerrando as cobranças futuras (SUB-02).
 *
 * Fecha o ciclo aberto de propósito em `criarCheckout`, onde `endDate` foi
 * OMITIDO ("assinatura aberta até cancelamento").
 *
 * NÃO É IDEMPOTENTE: remover uma assinatura já removida devolve 404, não 200.
 * O tratamento desse caso mora em `assinaturaService.cancelar`, não aqui — este
 * arquivo só traduz HTTP.
 *
 * Efeito colateral no gateway: as cobranças PENDING/OVERDUE da recorrência
 * também são apagadas; as já pagas permanecem — é isso que preserva o
 * `acessoAte` derivado do último pagamento.
 */
async removerAssinatura(id: string): Promise<AsaasAssinaturaRemovida> {
  return chamar<AsaasAssinaturaRemovida>(`/subscriptions/${id}`, { method: "DELETE" });
}
```

### 2. Leitura viva com degradação explícita (D-02 / D-02b)

```typescript
// Source: padrão de erro de app/services/assinatura.service.ts:74-83
export interface StatusAssinatura {
  origem: "asaas" | "indisponivel";
  status: string | null;      // ACTIVE | EXPIRED | INACTIVE (enum do Asaas)
  proximaCobranca: string | null; // "YYYY-MM-DD" cru do gateway
  ciclo: string | null;
}

async consultarAssinatura(asaasSubscriptionId: string): Promise<StatusAssinatura> {
  try {
    const a = await asaasClient.buscarAssinatura(asaasSubscriptionId);
    return { origem: "asaas", status: a.status, proximaCobranca: a.nextDueDate, ciclo: a.cycle };
  } catch (erro) {
    // D-02b: NUNCA propagar para derrubar a página, e NUNCA devolver um valor
    // antigo como se fosse atual. `origem: "indisponivel"` é o sinal que a UI usa.
    console.error(
      `[asaas] falha ao consultar assinatura`,
      `status=${erro instanceof AsaasApiError ? erro.status : "desconhecido"}`
    );
    return { origem: "indisponivel", status: null, proximaCobranca: null, ciclo: null };
  }
}
```

### 3. Server Action de cancelar — sem nenhum id no argumento (D-05)

```typescript
// Source: padrão literal de app/[slug]/admin/_lib/assinatura-actions.ts:24-53
"use server";

export async function cancelarAssinatura(slug: string): Promise<{ error?: string }> {
  // C-08 / D-05: o tenant sai da sessão e de mais lugar nenhum. A assinatura de
  // ESTA função não tem — e não pode ganhar — um parâmetro de id: é isso que
  // fecha o IDOR "empresa A cancela a assinatura de B" (Pitfall 11).
  const session = await getVerifiedSession();

  if (!session || session.empresaSlug !== slug) {
    return { error: "Sessão inválida." };
  }

  try {
    await assinaturaService.cancelar(session.empresaId);
    return {};
  } catch (erro) {
    // Mensagem do gateway nunca é repassada ao usuário (T-04-16).
    console.error("[assinatura] falha ao cancelar", erro);
    return { error: "Não foi possível cancelar agora. Tente novamente em instantes." };
  }
}
```

> Nota: esta action **retorna estado** em vez de terminar em `redirect()` — por isso, ao contrário de `iniciarPagamento`, o `try/catch` pode envolver tudo. Se o plano optar por `redirect()` no sucesso, ele tem que ficar FORA do `try` (`NEXT_REDIRECT` seria engolido pelo `catch`), conforme a convenção já documentada em `lib/session.ts` e `assinatura-actions.ts:49-52`.

### 4. Polling com backoff no cliente (D-01)

```typescript
// Source: padrão de startTransition + router.refresh de
// app/[slug]/admin/(protected)/_components/simples/combo-hub.tsx:107-119
"use client";

// Discricionário (D-01), mas o contrato é: convergir em SEGUNDOS e ter teto.
// 2s, 3s, 4s, 6s, 8s, 10s, 12s = 7 tentativas em ~45s.
const INTERVALOS_MS = [2000, 3000, 4000, 6000, 8000, 10000, 12000] as const;

export function PollerDeStatus({ slug, onResolvido }: { slug: string; onResolvido: () => void }) {
  const router = useRouter();
  const [tentativa, setTentativa] = useState(0);
  const esgotou = tentativa >= INTERVALOS_MS.length;

  useEffect(() => {
    if (esgotou) return;
    const t = setTimeout(async () => {
      // Server Action de LEITURA: consulta o status derivado dos fatos LOCAIS.
      // Não chama o Asaas — ver Pitfall 3.
      const { liberado } = await consultarStatusAcesso(slug);
      if (liberado) { router.refresh(); onResolvido(); return; }
      setTentativa((n) => n + 1);
    }, INTERVALOS_MS[tentativa]);
    return () => clearTimeout(t); // sem isto, uma navegação deixa o timer vivo
  }, [tentativa, esgotou, slug, router, onResolvido]);

  // Fallback explícito quando o teto é atingido (exigido por D-01).
  return esgotou
    ? <p>O pagamento pode levar alguns minutos para ser confirmado. Atualize a página em instantes.</p>
    : <p>Confirmando seu pagamento…</p>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Esperar o webhook e recarregar a página na mão | Polling curto no cliente após retorno do checkout | Padrão consolidado de checkout hospedado | Critério de sucesso #2 |
| `endDate` fixo na criação da assinatura | Assinatura aberta + `DELETE` no cancelamento | Decisão registrada em `03-04-PLAN.md:114` | Esta fase fecha o ciclo |
| Portal de billing próprio | Portal hospedado do gateway | Stripe Customer Portal | **Não se aplica:** Asaas não tem portal de autoatendimento (`STACK.md`), por isso a tela é construída do zero |
| Cancelamento imediato (acesso morre na hora) | Cancel-at-period-end (acesso até o fim do pago) | Default de mercado; no Brasil reforçado pelo dever de informação prévia do CDC | SUB-02 já adota |

**Deprecated/outdated:**
- `externalReference` como ponte de volta ao tenant: **refutado contra o gateway real** em `[03-07]` — vem `null` na cobrança e na assinatura. A ponte real é `checkoutSession` do objeto re-buscado. Nada nesta fase deve reintroduzi-lo.
- `sendType: SEQUENTIALLY` como garantia de ordem cronológica: **refutado** — são filas por recurso, e `PAYMENT_CONFIRMED` chega antes de `SUBSCRIPTION_CREATED`. É a origem direta do Achado 2.

## Key Findings (detalhe)

### Achado 1 — O endpoint de cancelamento (resposta à Open Question de D-04)

`DELETE /v3/subscriptions/{id}` `[CITED: docs.asaas.com/reference/remove-subscription]`

| Aspecto | Valor |
|---|---|
| Método / caminho | `DELETE /v3/subscriptions/{id}` (com `asaasApiUrl()` = `…/v3`, o `caminho` é `/subscriptions/${id}`) |
| Auth | header `access_token` — idêntico aos métodos existentes; `chamar()` já injeta |
| Resposta 200 | `{ "deleted": true, "id": "sub_VXJBYgP2u0eO" }` |
| 400 | id em formato inválido |
| 401 | chave inválida ou de ambiente trocado |
| 404 | assinatura não existe **ou não pertence à conta autenticada** — inclui já-removida |
| Idempotência | **Não.** Segunda chamada → 404, não 200 |
| Efeito no gateway | Remove também as cobranças `PENDING`/`OVERDUE` da recorrência; as pagas permanecem |
| Webhooks disparados | `SUBSCRIPTION_DELETED` + `PAYMENT_DELETED` das cobranças apagadas |

Alternativa documentada (fora de escopo): `PUT /v3/subscriptions/{id}` com `status: "INACTIVE"` suspende sem apagar; reativar exige novo `nextDueDate` `[CITED: docs.asaas.com/reference/atualizar-assinatura-existente]`.

### Achado 2 — `asaasSubscriptionId` é nulo justo quando a tela mais precisa dele

`Empresa.asaasSubscriptionId` só é escrito por `webhookAsaasService.capturarAssinatura`, no ramo `SUBSCRIPTION_CREATED` `[VERIFIED: grep app/services/webhook-asaas.service.ts:422-478]`. E `[03-07]` registrou em STATE.md, com evidência de sandbox real, que **`PAYMENT_CONFIRMED` é entregue ANTES de `SUBSCRIPTION_CREATED`**. Consequências duras:

- No instante em que o usuário volta do checkout, a "consulta viva ao Asaas" de D-02 **não tem id para consultar**.
- Portanto o Estado A ("confirmando…" / "sem assinatura ativa") não é caso de borda: é o estado normal do primeiro minuto de todo assinante novo.
- O polling de D-01 tem que mirar em `avaliarAcesso` sobre fatos locais, que é o que de fato destrava o admin.

### Achado 3 — A data exata do modal não é `expiraEm`

Ver Pitfall 2. A regra D-05 de `avaliarAcesso` (`trialFim` vence `acessoAte` durante o trial) faz `expiraEm` subnotificar. Usar `max(trialFim, acessoAte)` via nova função pura.

### Achado 4 — SUB-03 já está implementado; a fase não escreve enforcement

`avaliarAcesso` D-08 devolve `CANCELADO` quando expira com `canceladoEm` preenchido; `BLOQUEIA[CANCELADO] === true`; `requireAdminSession` redireciona por `acessoBloqueado`; `podePublicarCatalogo` despublica o catálogo `[VERIFIED: grep lib/avaliar-acesso.ts, lib/session.ts]`. O worker da Fase 5 reavalia os mesmos fatos diariamente. **A única linha que falta no sistema inteiro para SUB-03 é a que grava `canceladoEm`.** Um plano que toque `lib/avaliar-acesso.ts` (além de acrescentar `acessoEfetivoAte`) ou `lib/session.ts` está fora do escopo declarado em CONTEXT.md § Phase Boundary.

### Achado 5 — `canceladoEm` não é gravável pelo caminho de CRUD

`empresaService.update` monta um allowlist positivo (`empresa.service.ts:532-548`) e o JSDoc acima dele diz textualmente que sem essa lista "`acessoAte`, `trialFim`, `canceladoEm` e `acessoVitalicio` seriam graváveis por HTTP e BILL-04 seria contornável por qualquer ADMIN autenticado" `[VERIFIED: leitura direta do arquivo]`. Escrever via `prisma.empresa.update` dentro de `assinaturaService` — precedente idêntico e comentado em `capturarAssinatura` (T-03-35).

### Achado 6 — Cancelar não desestabiliza a ingestão de webhooks (verificado)

- `SUBSCRIPTION_DELETED` está entre os 12 eventos registrados e cai no **Grupo 1 — observação, sem mutação de estado**: log + `marcarProcessado` `[VERIFIED: grep app/services/webhook-asaas.service.ts:685-693]`.
- `PAYMENT_DELETED` **não** está em `EVENTOS_ASSINADOS` `[VERIFIED: grep lib/billing/asaas/eventos.ts:83-95]`, então nem chega; e se chegasse, cairia no ramo `default`, que loga e marca processado sem mutar nada `[VERIFIED: grep app/services/webhook-asaas.service.ts:730-742]`.
- Nenhum caminho reduz `acessoAte` — a escrita é monotônica por `WHERE acessoAte < novo`.

**Conclusão: nenhuma mudança em `webhook-asaas.service.ts` nem em `eventos.ts` é necessária nesta fase.**

### Achado 7 — A tela de retorno do checkout é `/bloqueado`, não `/assinatura`

`assinaturaService.criarCheckout` define as três URLs de callback como `${appBaseUrl()}/${empresa.slug}/admin` `[VERIFIED: assinatura.service.ts:54]`. Para uma empresa `BLOQUEADO`/`CANCELADO` (o caso mais comum de quem está pagando), `requireAdminSession` redireciona `/admin` → `/admin/bloqueado`. Duas opções para o plano:

- **(a) Montar o poller em `bloqueado-card.tsx`** (recomendado): zero mudança na `successUrl`, cobre exatamente o público que precisa; quando o status destrava, `router.refresh()` faz o próprio `page.tsx` de `/bloqueado` redirecionar para `/admin` (a guarda `if (!conta || !acessoBloqueado(...)) redirect('/admin')` já existe ali). Cobrir também o caso TRIAL/CARENCIA montando o poller na tela `/assinatura` quando `?retorno=1`.
- **(b) Mudar `successUrl` para `/{slug}/admin/assinatura?retorno=1`**: mais explícito, mas a rota está em `(protected)` e continua inalcançável para o bloqueado — não resolve o caso principal sozinha.

## Runtime State Inventory

*Não é fase de rename/refactor/migração de dados.* Mesmo assim, o estado externo relevante:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `Empresa.canceladoEm` (já existe, nulo para todas), `Empresa.asaasSubscriptionId` (preenchido só para quem já pagou) | Nenhuma migração de dados |
| Live service config | Assinaturas ativas na conta Asaas (sandbox e produção) — estado que vive só no gateway | Nenhuma; o cancelamento é por API sob demanda |
| OS-registered state | Nenhum — verificado: não há `pm2`/Task Scheduler/systemd referenciado no repo | Nenhuma |
| Secrets/env vars | `ASAAS_API_URL`, `ASAAS_API_KEY` já existem e bastam; nenhum segredo novo `[VERIFIED: grep de nomes em lib/, app/, scripts/]` | Nenhuma |
| Build artifacts | Nenhum — sem etapa de codegen além de `prisma generate`, e não há mudança de schema | Nenhuma |

**Schema:** nenhuma migration é esperada (§ Pitfall 7 explica por que nem `CausaTransicaoAcesso` precisa de valor novo).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/test/runtime | ✓ | v25.9.0 (projeto declara v22 no CI) | — |
| Next.js | Toda a fase | ✓ | 16.3.0 | — |
| Vitest | Testes unitários/componente | ✓ | 4.1.10 | — |
| Playwright | E2E | ✓ | 1.62.1 | — |
| PostgreSQL | Fatos de billing | ✓ (assumido — `DATABASE_URL` requerida) | — | — |
| Conta Asaas sandbox | Testar `DELETE` de verdade | ⚠️ existe (usada em `[03-07]`), mas exige cadastro completo aprovado | — | Teste unitário com `fetch` mockado cobre o contrato HTTP; a chamada real vira item de UAT |
| `ASAAS_API_URL` / `ASAAS_API_KEY` | `asaasClient` | ✓ (nomes referenciados no código; leitura de `.env` bloqueada por política) | — | `obrigatorio()` já falha ruidosamente se ausente |

**Missing dependencies with no fallback:** nenhuma.

**Missing dependencies with fallback:**
- Verificação contra o sandbox real do `DELETE /v3/subscriptions/{id}` — o `.env` não é legível nesta sessão e a conta de sandbox exige `commercialInfo`/`bankAccountInfo` aprovados (blocker já registrado em STATE.md). **Recomendação forte:** o plano inclui um `checkpoint:human-verify` que exercita um cancelamento real no sandbox e confirma (i) a resposta `{deleted:true}`, (ii) o 404 no segundo DELETE, e (iii) se `GET /v3/subscriptions/{id}` após a remoção devolve 404 ou o objeto com `deleted:true` (assunção A2 abaixo).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit/componente, jsdom) + Playwright 1.62.1 (E2E, Chromium) |
| Config file | `vitest.config.mts`, `playwright.config.ts`, setup em `tests/setup/vitest.setup.ts` |
| Quick run command | `npx vitest run app/services/assinatura.service.test.ts lib/billing/asaas/client.test.ts lib/avaliar-acesso.test.ts` |
| Full suite command | `npm test` (unit) + `npm run test:e2e` (E2E) |

Convenções obrigatórias já estabelecidas: teste de service começa com `// @vitest-environment node`; Prisma é mockado por `tests/setup/prisma-mock`; `asaasClient` é substituído com `vi.mock` **preservando `AsaasApiError` real** via `importOriginal` (o service distingue por `instanceof` — uma cópia local faria o teste passar por engano). Ver `assinatura.service.test.ts:10-19`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUB-02 | `removerAssinatura` faz `DELETE /subscriptions/{id}` com header `access_token` e sem corpo | unit | `npx vitest run lib/billing/asaas/client.test.ts` | ✅ (arquivo existe; casos novos) |
| SUB-02 | `cancelar` grava `canceladoEm` **só depois** do 200 do gateway | unit | `npx vitest run app/services/assinatura.service.test.ts` | ✅ (arquivo existe; casos novos) |
| SUB-02 | gateway 502 ⇒ **nenhuma** escrita (asserção de ausência) | unit | idem | ✅ |
| SUB-02 | gateway 404 ⇒ `canceladoEm` gravado mesmo assim (Pitfall 4) | unit | idem | ✅ |
| SUB-02 | empresa sem `asaasSubscriptionId` ⇒ `HttpError` 409, sem chamada ao gateway | unit | idem | ✅ |
| SUB-02 | Server Action `cancelarAssinatura` não tem parâmetro de id e rejeita slug ≠ sessão (D-05) | unit | `npx vitest run app/[slug]/admin/(protected)/assinatura/actions.test.ts` | ❌ Wave 0 |
| SUB-01 | `acessoEfetivoAte` devolve `acessoAte` mesmo em TRIAL quando `acessoAte > trialFim` (Pitfall 2) | unit | `npx vitest run lib/avaliar-acesso.test.ts` | ✅ (arquivo existe; casos novos) |
| SUB-01 | tela renderiza os 4 estados (sem assinatura / ativa / cancelada / degradado) | component | `npx vitest run app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx` | ❌ Wave 0 |
| SUB-01 | `consultarAssinatura` devolve `origem: "indisponivel"` em `AsaasApiError` (D-02b) | unit | `npx vitest run app/services/assinatura.service.test.ts` | ✅ |
| SUB-02 | modal exige 2 cliques e mostra a data antes de confirmar (D-03) | component | `npx vitest run app/[slug]/admin/(protected)/assinatura/_components/cancelar-dialog.test.tsx` | ❌ Wave 0 |
| SUB-01/02 | link "Assinatura" aparece no nav e marca ativo na rota | component | `npx vitest run app/[slug]/admin/(protected)/_components/admin-nav.test.tsx` | ✅ (arquivo existe; caso novo) |
| SUB-02 | fluxo completo: ver status → cancelar → ver "ativo até {data}" | e2e | `npx playwright test e2e/cancelamento-de-assinatura.spec.ts` | ❌ Wave 0 |
| SUB-03 | empresa cancelada com período expirado é bloqueada no admin e tem catálogo despublicado | e2e | idem (ou estender `e2e/bloqueio-por-inadimplencia.spec.ts`) | ✅ (spec existe; caso novo) |
| **Segurança** | empresa A não consegue ler/cancelar assinatura de B — a action não aceita id | unit + e2e | idem | ❌ Wave 0 |
| D-01 | poller para no teto e mostra o fallback; `clearTimeout` no unmount | component | `npx vitest run app/[slug]/admin/_components/poller-de-status.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <arquivos tocados>` — segundos.
- **Per wave merge:** `npm test && npm run lint`.
- **Phase gate:** `npm test`, `npm run test:e2e`, `npm run lint` verdes antes de `/gsd-verify-work`. Considerar um `scripts/gates-fase-07.mjs` no mesmo molde dos gates 04/05/06 (ver abaixo).

### Wave 0 Gaps
- [ ] `app/[slug]/admin/(protected)/assinatura/actions.test.ts` — cobre SUB-02 + D-05
- [ ] `app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx` — cobre SUB-01 (4 estados)
- [ ] `app/[slug]/admin/(protected)/assinatura/_components/cancelar-dialog.test.tsx` — cobre D-03
- [ ] `app/[slug]/admin/_components/poller-de-status.test.tsx` — cobre D-01
- [ ] `e2e/cancelamento-de-assinatura.spec.ts` — cobre SUB-02 + SUB-03 + isolamento
- [ ] *(opcional, forte precedente nas 3 fases anteriores)* `scripts/gates-fase-07.mjs` + `"gates:fase-07"` no `package.json`. Gates candidatos, todos invisíveis em code review e nenhum deles quebra um teste se violado:
  1. nenhum identificador `assinaturaId`/`subscriptionId`/`customerId` como parâmetro de função em `app/[slug]/admin/**/actions.ts` (D-05 / Pitfall 11);
  2. `canceladoEm` não aparece no allowlist de `empresaService.update` (BILL-04);
  3. `prisma.` não aparece antes de `asaasClient.removerAssinatura` dentro de `cancelar` (fronteira do Pattern 1);
  4. `asaasClient` não é importado pela action de polling (Pitfall 3).
  **Regra de higiene obrigatória (decisão `[04-09]`, repetida nos 7 planos da Fase 6):** descartar linhas de comentário antes de contar — os JSDoc normativos desta fase citam literalmente os identificadores proibidos e invalidariam um grep cru. Montar os identificadores por concatenação de strings.

## Security Domain

### Applicable ASVS Categories (nível 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sim | `getVerifiedSession()` / `requireAdminSession(slug)` — já existentes; nenhuma auth nova |
| V3 Session Management | sim | Cookie `httpOnly` + `sameSite: lax`; Server Actions trazem CSRF embutido (POST-only + `Origin` vs `Host`) — racional já em `assinatura-actions.ts` |
| V4 Access Control | **sim — foco da fase** | Cancel **sem parâmetro de id**; toda query de billing com `where: { id: empresaId }`; `acessoBloqueado` como predicado único |
| V5 Input Validation | sim (superfície mínima) | A action recebe apenas `slug`, e ele é usado só para comparar com `session.empresaSlug` — nunca vai para query |
| V6 Cryptography | não | Nenhuma primitiva nova; `access_token` vem de env por acessor que falha ruidosamente |
| V7 Error/Logging | sim | Log só com `status` + `empresaId`; corpo de resposta do Asaas nunca é logado (carrega dados do pagador, T-03-07) |
| V8 Data Protection | sim | Nenhum dado de cartão trafega ou é tipado; `tipos.ts` declara só os campos usados |
| V13 API/Web Service | sim | Nenhum endpoint REST novo — a superfície é Server Action, que herda o CSRF do framework |

### Known Threat Patterns for esta fase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cancel action aceitando `assinaturaId` do form body (IDOR cross-tenant) | Tampering / Elevation | **D-05:** a action não tem parâmetro de id; o id vem de `session.empresaId`. Cenário nominal do Pitfall 11 e da tabela "Security Mistakes" |
| Endpoint de status devolvendo dados de outra empresa por id | Information Disclosure | `findFirst({ where: { id: empresaId, deletedAt: null } })`; nunca `findUnique({ where: { id } })` em billing |
| Vazamento de fatos de billing para o catálogo público | Information Disclosure | `empresaService` já desestrutura os 4 fatos para FORA da projeção pública (linhas 329 e 427) — a nova tela não muda isso |
| Log do corpo de erro do Asaas | Information Disclosure | `chamar()` já trunca em 500 chars e o service loga só `status`; manter |
| `canceladoEm` gravável por `PATCH /api/empresas/[id]` | Tampering | Allowlist positivo intacto (Achado 5); gate estático candidato |
| Polling não autenticado / DoS por loop infinito | DoS | A action de polling chama `getVerifiedSession()`; o loop tem teto finito (D-01) |
| Enumerar empresas inadimplentes pela resposta do catálogo | Information Disclosure | Já mitigado na Fase 4 (404 idêntico ao de slug inexistente); esta fase não introduz superfície pública |

**Pendência herdada (não é desta fase, mas afeta o gate de segurança):** `/gsd-secure-phase 06` foi pulado por decisão explícita do usuário e continua pendente (STATE.md § Blockers). Vale confirmar com o usuário se a revisão da Fase 7 deve rodar.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `DELETE` numa assinatura já removida devolve 404 (não 200 idempotente). A doc lista 404 para "não existe ou não pertence à conta", o que **implica** — mas não afirma textualmente — o caso já-removido. | Achado 1, Pitfall 4 | Baixo. O tratamento recomendado (404 ⇒ seguir para a gravação local) está correto nos dois mundos. Se for 200, o ramo de 404 simplesmente nunca é exercido. |
| A2 | `GET /v3/subscriptions/{id}` **após** a remoção devolve 404 (ou o objeto com `deleted: true` — a doc é ambígua). | Achado 1, Pattern 3 | Médio. Mitigado por design: o Pattern 3 ramifica por `canceladoEm` local **antes** de chamar o Asaas, então a tela nunca depende desta resposta. Confirmar no `checkpoint:human-verify`. |
| A3 | Cancelar **não** apaga a cobrança já paga, logo `acessoAte` permanece válido. A doc diz que "cobranças pendentes ou vencidas" são removidas e que "as pagas permanecem registradas". | Achado 1, SUB-02 | **Alto se errado** — o cliente perderia o período já pago, quebrando SUB-02. Verificar no sandbox: cancelar e conferir que `Empresa.acessoAte` (e a cobrança paga no painel Asaas) continuam intactos. |
| A4 | O 404 do `DELETE` não pode ser "assinatura de outra conta", porque o id nunca vem do cliente. | Pitfall 4 | Baixo — é consequência direta de D-05, verificável por gate estático. |
| A5 | Nenhum limite por-minuto específico para `GET /subscriptions` além da quota global de 25k/12h e dos 50 GET concorrentes. A doc menciona que "certos endpoints" têm limite próprio sem numerá-los. | Pitfall 3 | Baixo com a recomendação (polling não bate no Asaas). Alto se o plano ignorar a recomendação. |
| A6 | O modal de D-03 é um overlay in-page e não uma rota dedicada. | Pattern 3 | Baixo. Note que as Fases 4 e 6 escolheram **rota dedicada** em vez de modal para gates de autorização — aqui não é gate, é confirmação de ação, então o modal está correto e `confirmar-remocao.tsx` é o precedente. |
| A7 | Limpar `canceladoEm` na reativação (`criarCheckout`) é a solução preferida ao Pitfall 6. Não é decisão travada em CONTEXT.md. | Pitfall 6 | Médio. Se o plano não decidir nada, o bug fica latente e invisível até o segundo ciclo de churn. |
| A8 | PostgreSQL está disponível no ambiente de execução (não verificável nesta sessão — `.env` não legível por política). | Environment Availability | Baixo — todas as fases anteriores rodaram contra ele. |

## Open Questions

1. **Onde exatamente o poller de retorno de checkout é montado (Achado 7)?**
   - O que sabemos: `successUrl` = `/{slug}/admin`; empresa bloqueada é redirecionada para `/bloqueado`; `/assinatura` está em `(protected)` e é inalcançável para ela.
   - O que não está claro: se o usuário quer o poller só em `/bloqueado`, só em `/assinatura`, ou nos dois.
   - Recomendação: **nos dois**, com o mesmo componente. `/bloqueado` cobre o inadimplente que acabou de pagar (o caso de dinheiro); `/assinatura?retorno=1` cobre quem paga durante o trial. Nenhuma mudança na `successUrl` é necessária.
   - **RESOLVED (07-02):** `PollerDeStatus` montado em `bloqueado-card.tsx`, conforme recomendado.

2. **`canceladoEm` deve ser limpo ao criar um novo checkout (Pitfall 6 / A7)?**
   - O que sabemos: nenhum caminho existente o limpa; `avaliarAcesso` D-09 mascara o efeito enquanto o acesso pago estiver vigente.
   - Recomendação: sim, em `criarCheckout`, antes de retornar a URL. É escrita local, sem I/O de gateway, e o único momento em que a intenção de voltar é inequívoca. Levar ao usuário se o planner preferir não decidir.
   - **RESOLVED (07-04 §6):** `criarCheckout` limpa `canceladoEm`, decisão explícita do plano, conforme recomendado.

3. **A assinatura removida continua consultável (A2)?**
   - Recomendação: não depender da resposta. Ramificar por `canceladoEm` local antes de chamar o gateway (Pattern 3, ordem 2). Confirmar no sandbox como item de UAT.
   - **RESOLVED (07-04, confirmação em 07-08):** Pattern 3 implementado como recomendado; confirmação real contra o sandbox é o `checkpoint:human-verify` de 07-08 (assunção A3).

4. **Gate estático `gates:fase-07`?**
   - Três fases seguidas o adotaram, e as quatro invariantes desta fase (D-05, allowlist BILL-04, fronteira gateway→banco, polling sem Asaas) têm exatamente o perfil "violação plausível que nenhum teste pega".
   - Recomendação: incluir. Custo baixo, precedente forte.
   - **RESOLVED (07-07):** `scripts/gates-fase-07.mjs` incluído com 6 gates.

5. **O que a tela deve mostrar para `acessoVitalicio === true`?**
   - Estado raro (BILL-04, marcado direto no banco, sem UI). Nenhuma decisão em CONTEXT.md.
   - Recomendação: uma linha ("acesso permanente, sem cobrança") e **sem** botão de cancelar — nunca deixar o botão aparecer para quem não tem `asaasSubscriptionId`.
   - **RESOLVED (07-06):** Estado vitalício implementado no `AssinaturaCard`, conforme recomendado.

## Sources

### Primary (HIGH confidence — código do próprio projeto, verificado por leitura/grep nesta sessão)
- `lib/billing/asaas/client.ts`, `tipos.ts`, `config.ts`, `datas.ts` — contrato do gateway, header `access_token`, timeout, redação de log
- `lib/avaliar-acesso.ts` — `avaliarAcesso` (D-03/D-05/D-06/D-08/D-09/D-10), `acessoBloqueado`, `podePublicarCatalogo`, `diasRestantesDeCarencia`
- `lib/session.ts`, `lib/auth-guard.ts` — `requireAdminSession`, `getVerifiedSession`, `revalidarConta`, ordem dos gates
- `app/services/assinatura.service.ts` — fronteira D-07, projeção `EMPRESA_CHECKOUT_SELECT`, `urlDeRetorno`
- `app/services/webhook-asaas.service.ts` — Grupo 1 (observação sem mutação), `capturarAssinatura`, `aplicarPagamentoConfirmado`, ramo `default`
- `app/services/empresa.service.ts` — allowlist de `update`, exclusão dos fatos de billing das projeções públicas
- `lib/billing/asaas/eventos.ts` — `EVENTOS_ASSINADOS` (12 eventos; `PAYMENT_DELETED` ausente)
- `prisma/schema.prisma` — `Empresa`, `StatusAcesso`, `CausaTransicaoAcesso`, `AuditoriaAcesso`, `CheckoutAsaas`
- `app/[slug]/admin/**` — `assinatura-actions.ts`, `bloqueado/page.tsx`, `(protected)/layout.tsx`, `admin-nav.tsx`, `combo-hub.tsx`, `confirmar-remocao.tsx`, `pagar-button.tsx`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` — semântica de `router.refresh()` (Next 16.3.0 empacotado)
- `.planning/STATE.md` — `[03-07]` (ordem real dos webhooks, A3 refutada), `[04-09]`, blockers abertos

### Secondary (MEDIUM confidence — documentação oficial do fornecedor)
- `docs.asaas.com/reference/remove-subscription` — `DELETE /v3/subscriptions/{id}`, resposta, erros, alternativa `INACTIVE`
- `docs.asaas.com/reference/recuperar-uma-unica-assinatura` — campos e enum `ACTIVE|EXPIRED|INACTIVE`, campo `deleted`
- `docs.asaas.com/reference/atualizar-assinatura-existente` — `PUT` com `status`, `updatePendingPayments`, semântica de `endDate`
- `docs.asaas.com/reference/listar-cobrancas-de-uma-assinatura` — `GET /v3/subscriptions/{id}/payments`, filtros de status
- `docs.asaas.com/reference/rate-e-quota-limit` — 25.000/12 h, 50 GET concorrentes, headers `RateLimit-*`, 429
- `docs.asaas.com/docs/eventos-para-assinaturas` — `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`, `PAYMENT_DELETED` na remoção

> O seam `classify-confidence` classifica os providers `webfetch`/`websearch` como LOW por padrão, independentemente do conteúdo. Todas as afirmações acima vieram de fetch direto de `docs.asaas.com` (documentação oficial de primeira mão) e estão tagueadas `[CITED: …]` = MEDIUM, seguindo a mesma nota metodológica de `.planning/research/FEATURES.md`.

### Tertiary (LOW confidence)
- WebSearch em português sobre o endpoint de remoção — usado apenas para localizar as páginas oficiais, nunca como fonte de afirmação.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — zero dependências novas; tudo verificado contra `package.json`/`node_modules`
- Endpoint de cancelamento (D-04): **MEDIUM-HIGH** — método, caminho, resposta e códigos de erro vêm da doc oficial; a idempotência (A1) e a consulta pós-remoção (A2) são inferências
- Architecture / patterns: **HIGH** — todo padrão recomendado tem precedente literal e comentado no repositório
- Pitfalls: **HIGH** — 6 dos 7 foram derivados por leitura direta do código e do STATE.md, não de conhecimento geral
- Validation: **HIGH** — infra existente inspecionada; gaps listados nominalmente
- Security: **HIGH** — deriva de `PITFALLS.md` Pitfall 11 + tabela "Security Mistakes", cruzados com o código atual e confirmados ainda aplicáveis

**Research date:** 2026-09-02
**Valid until:** 2026-10-02 (30 dias — stack estável; reconfirmar a doc do Asaas se passar disso)
