# Stack Research

**Domain:** Cobrança recorrente por assinatura (SaaS B2B multi-tenant brasileiro) sobre Next.js 16 + PostgreSQL/Prisma 7
**Researched:** 2026-08-31
**Confidence:** MEDIUM-HIGH (alta para arquitetura e worker; média para taxas de gateway, que mudam sem aviso)

---

## TL;DR — as 5 decisões

| # | Decisão | Escolha | Confiança |
|---|---------|---------|-----------|
| 1 | Gateway de pagamento | **Asaas** (API v3, Checkout hospedado + Assinaturas) | MEDIUM-HIGH |
| 2 | Como não tocar em dado de cartão | **Checkout hospedado do gateway** (`POST /v3/checkouts`), nunca tokenização client-side em v1 | HIGH |
| 3 | Worker diário | **Endpoint HTTP idempotente** (`GET /api/cron/assinaturas`) protegido por `CRON_SECRET`, disparado por scheduler externo | HIGH |
| 4 | Hosting + scheduler | **Vercel + Vercel Cron** (Hobby já basta) **ou** VPS + `crontab` chamando o mesmo endpoint — a escolha do host não muda uma linha do código do worker | HIGH |
| 5 | Bloqueio de acesso | **Não** no `proxy.ts`; gate no layout `(protected)` + em `getEmpresaCatalogo()`, com `revalidateTag` para despublicar o catálogo | HIGH |

**A regra de ouro deste milestone:** o worker e o webhook são *reconciliadores*, não *contadores*. Todo estado deriva de datas absolutas guardadas no banco (`proximoVencimentoEm`, `trialFimEm`, `canceladoEm`), nunca de contadores decrementados. Rodar duas vezes = mesmo resultado. Não rodar um dia = corrigido sozinho no dia seguinte. Isso é o que torna a decisão de hosting irrelevante.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Asaas API** | `v3` (REST, sem SDK oficial Node) | Gateway: assinaturas recorrentes, Pix/boleto/cartão, webhooks | Único dos cinco candidatos com **Pix disponível sem convite** para o merchant, taxa mais baixa no ticket alvo (~4% em R$49), sem mensalidade, e modelo de dados que casa 1:1 com o requisito de "quitar os períodos em atraso" (cada mês vira uma `payment` independente, com Pix próprio) |
| **Asaas Checkout (hospedado)** | `POST /v3/checkouts` | Captura do meio de pagamento e criação da assinatura | Cliente digita cartão em página do Asaas → **zero dado de pagamento no nosso banco**, sem precisar habilitar tokenização com gerente de contas, sem escopo PCI SAQ-A-EP |
| **zod** | `4.5.4` | Validação de payload de webhook, body de API e env vars | O `ARCHITECTURE.md` já aponta "Lack of Input Validation Middleware" como anti-pattern. Webhook é entrada não confiável vinda da internet — é o pior lugar possível para validação manual `if (!x)`. Introduzir aqui e reusar depois |
| **PostgreSQL advisory locks** | nativo (via `prisma.$queryRaw`) | Impedir duas execuções simultâneas do worker | Zero dependência nova (já existe `pg` 8.22 + Prisma 7). A Vercel documenta explicitamente que pode invocar o mesmo cron duas vezes; advisory lock é a resposta sem precisar de Redis |
| **Vercel Cron Jobs** | plataforma (`vercel.json`) | Agendador do worker diário | Grátis em todos os planos, 1 linha de config, e a imprecisão do Hobby (±59 min) é irrelevante para uma varredura diária de carência. Se o host for VPS, `crontab` + `curl` substitui sem mudar código |
| **@sentry/nextjs** | `10.72.0` | Observabilidade de webhook e worker | Hoje há **zero** error tracking (`INTEGRATIONS.md`). Nesta feature, uma falha silenciosa = cliente pagante bloqueado ou inadimplente com acesso. Não é opcional aqui como era no CRUD |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **stripe** | `22.6.0` | SDK oficial Stripe (Node ≥18, API pinada em `2026-08-26.dahlia`) | **Só** se a decisão pivotar para Stripe (ver "Stack Patterns by Variant"). Tem `constructEventAsync` para runtimes Web Crypto |
| **@upstash/qstash** | `2.11.3` | Scheduler HTTP com retry automático | Se você quiser retry nativo no disparo do cron. Vercel Cron **não faz retry**; crontab também não. Opcional — o design reconciliador já tolera runs perdidos |
| **pino** + **pino-pretty** | `10.3.1` / `13.1.3` | Log estruturado | Alternativa barata ao Sentry se não quiser SaaS externo. Substitui os `console.error` do handler de webhook por logs com `eventId`/`empresaId` correlacionáveis |
| **date-fns** + **@date-fns/tz** | `4.4.0` / `1.5.0` | Fronteira de dia em `America/Sao_Paulo` | **Só se** o produto exigir semântica de "dia do calendário brasileiro" (ex.: "vence no dia 5"). Se as datas forem instantes UTC comparados por diferença de tempo (recomendado), **você não precisa disto** |
| **svix** | `2.1.0` | Verificação de assinatura de webhook padrão Svix | Não usar: nenhum dos gateways brasileiros usa Svix. Listado só para descartar |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **Sandbox Asaas** | Ambiente de teste completo, chave separada | Base `https://api-sandbox.asaas.com/v3` (verificar em `docs.asaas.com/reference`); tokenização de cartão já vem habilitada no sandbox, mas em **produção exige liberação com o gerente de contas** — mais um motivo para usar Checkout hospedado |
| **cloudflared tunnel** / **ngrok** | Expor `localhost:3000/api/webhooks/asaas` para receber eventos reais em dev | Asaas não tem CLI de forwarding (Stripe tem: `stripe listen --forward-to`). Este é o maior gap de DX do Asaas |
| **Vitest 4.1.10** (já instalado) | Testar `avaliarAssinaturas(agora)` como função pura | A lógica de carência/bloqueio/reativação deve ser 100% testável sem HTTP e sem gateway. Injetar `now: Date` como parâmetro, nunca chamar `new Date()` dentro da regra |
| **Playwright 1.62.1** (já instalado) | E2E do banner de carência, modal de termos e catálogo bloqueado (404) | Seed do banco com empresa em cada status; não depende do gateway |
| **Prisma Migrate** (já instalado) | Migrations dos novos modelos | Ver "Integration Surface" abaixo |

---

## Gateway Comparison — Stripe vs Mercado Pago vs Asaas vs Pagar.me vs Iugu

### Matriz

| Critério | **Asaas** | **Stripe** | **Mercado Pago** | **Pagar.me** | **Iugu** |
|---|---|---|---|---|---|
| Assinatura recorrente automática | Sim (`/v3/subscriptions`, ciclos semanal→anual) | Sim (Billing — o mais completo do mercado) | Sim (`preapproval` / `preapproval_plan`) | Sim (API v5; v4 fechada para novas integrações de recorrência) | Sim (com pró-rata nativo) |
| **Pix recorrente (Pix Automático)** | Sim, GA | Sim (lançado 2026-04-22), **mas Pix no Brasil é "apenas para convidados"** | Sim | Sim | Sim |
| Boleto recorrente | Sim | Limitado / caro | Sim | Sim (v5) | Sim |
| Cartão recorrente | Sim (token ou Checkout hospedado) | Sim (o melhor: Smart Retries, dunning, Customer Portal) | Sim | Sim | Sim |
| Checkout hospedado (sem tocar cartão) | Sim (`POST /v3/checkouts`) | Sim (Checkout Session `mode=subscription`) | Sim (Link/Checkout Pro) | Sim (Checkout) | Sim |
| **Portal de autoatendimento pronto** (ver status, cancelar, trocar cartão) | **Não** — você constrói | **Sim, grátis** (Customer Portal) | Parcial | Não | Parcial |
| SDK Node oficial | **Não** (`asaas@1.1.0` é comunitário, últ. publicação 2025-03; `asaas-sdk@1.2.7` morto desde 2022) | **Sim**, `stripe@22.6.0`, tipado, atualizado semanalmente | `mercadopago@3.6.0` (oficial, qualidade irregular) | `@pagarme/pagarme-nodejs-sdk@7.0.1` | Comunitário (`iugu@0.0.6` — abandonado) |
| **Confiabilidade de webhook** | ⚠️ **Fila pausa após 15 falhas consecutivas**; só HTTP **200** conta como sucesso; eventos retidos **14 dias**; reativação manual (painel ou `interrupted:false`) | ✅ Retry com backoff exponencial por **3 dias**, sem pausar fila; replay manual até 30 dias via CLI | Retry, mas documentação e ordering historicamente fracos | Retry padrão | Retry padrão |
| CLI para testar webhook local | Não | **Sim** (`stripe listen` / `stripe trigger`) | Não | Não | Não |
| Qualidade da doc | Boa, em PT-BR, com `llms.txt` e versão `.md` das páginas | Excelente (referência do setor) | Média — lacunas, exemplos desatualizados | Boa | Média |
| Taxa em R$ 49,90/mês (cartão) | ~R$ 1,98 (**~4,0%**) — 2,99% + R$0,49 | ~R$ 2,73 (**~5,5%**) — 3,99% + R$0,39 + 0,7% Billing | ~R$ 2,49 (**4,98%** imediato) ou 3,03% em D+30 | Negociado (sem tabela pública) | Negociado + mensalidade de plano |
| Taxa em Pix | R$ 1,99 (promo R$0,99 por 3 meses) | 1,19% (mas invite-only) | 0,99% | Negociado | Negociado |
| Mensalidade fixa | **R$ 0** | R$ 0 | R$ 0 | Costuma ter | **Costuma ter** |
| Liquidação (cartão) | D+30 padrão; antecipação a 1,25%/mês | ~D+ curto após período de espera inicial | D+30 (ou taxa maior p/ imediato) | Negociado | Negociado |
| Onboarding para PJ pequeno / MEI | Rápido, conta digital PJ inclusa | Exige CNPJ + conta BRL em instituição domiciliada; análise mais longa | Muito rápido | Comercial (fala com vendas) | Comercial (fala com vendas) |

### Veredito por gateway

**🏆 Asaas — RECOMENDADO.**
Ganha por três motivos que são específicos deste projeto, não genéricos:
1. **Pix sem convite.** Seus clientes são lojistas brasileiros pagando ~R$50/mês. Pix é o meio dominante no Brasil e cartão recorrente no país tem falha involuntária alta (limite estourado, cartão vencido). A Stripe lista Pix no Brasil como *"apenas para convidados no momento"* — um SaaS novo provavelmente **não** terá Pix na Stripe no dia 1, o que na prática o obriga a cartão-only. Isso é um risco de conversão maior que qualquer ganho de DX.
2. **O modelo de dados casa com o requisito de reativação.** Uma assinatura Asaas gera `payment`s independentes, cada uma com vencimento, status (`OVERDUE`) e **seu próprio Pix/boleto**. O requisito "2 meses atrasados exigem pagamento dos 2 meses para reativar" vira literalmente "liste as `payment` com status `OVERDUE` desta `subscription` e mostre os links". Não precisa inventar lógica de proração.
3. **Custo.** ~4,0% vs ~5,5% da Stripe no ticket alvo, sem mensalidade. Em uma primeira monetização, 1,5 p.p. de margem importa.

**Custo de adotar Asaas (assuma como trabalho de roadmap, não como surpresa):**
- Escrever um cliente HTTP tipado próprio (~200 linhas). **Não instale `asaas` nem `asaas-sdk` do npm** — ver "What NOT to Use".
- A tela de gerenciamento de assinatura é 100% sua (a Stripe daria pronta).
- **Blindar a fila de webhook**: responder `200` sempre que a assinatura do request for válida (mesmo em evento desconhecido ou duplicado), enfileirar/persistir antes de processar, e monitorar `interrupted`. 15 respostas não-200 seguidas param a fila silenciosamente e você tem 14 dias antes de perder eventos. **Este é o maior risco operacional do milestone.**

**Stripe — segunda opção forte, ganha se você reponderar os pesos.**
Melhor SDK, melhor doc, melhor confiabilidade de webhook (3 dias de retry, sem pausa de fila), Stripe CLI para testar webhook local, e o **Customer Portal entrega de graça o requisito "tela de gerenciamento de assinatura: ver status e cancelar"**. Se o Pix invite-only for liberado para você, ou se você aceitar cartão-only em v1, Stripe é defensável — e é a escolha certa se você planeja vender fora do Brasil. Custa ~1,5 p.p. a mais.

**Mercado Pago — descartado.**
Reconhecimento de marca ótimo e Pix a 0,99%, mas: liquidação imediata custa 4,98% no cartão, a API `preapproval` é menos expressiva que assinaturas Asaas/Stripe para o caso "pagar N períodos atrasados", e a qualidade de documentação/DX é o ponto fraco recorrente. Use se seu público já tem conta MP e você quer maximizar conversão acima de tudo.

**Pagar.me — descartado para v1.**
API v5 é competente e o SDK Node oficial existe (`7.0.1`), mas não há tabela pública de preços: é venda consultiva, com taxa negociada e frequentemente mensalidade. Fricção comercial errada para um produto que ainda não sabe se é rentável. Reavalie quando tiver volume para negociar.

**Iugu — descartado.**
Boa engenharia de recorrência (pró-rata nativo), mas contratação consultiva com mensalidade de plano e ecossistema Node abandonado (`iugu@0.0.6`). Pior relação custo/benefício para v1.

---

## Daily Worker / Cron — a decisão que não depende do hosting

### O padrão recomendado (independente de host)

```
app/services/assinatura.service.ts   ← REGRA PURA: avaliarAssinaturas(now: Date)
        ▲                                (sem HTTP, sem gateway, testável no Vitest)
        │
app/api/cron/assinaturas/route.ts    ← CASCA HTTP: auth por CRON_SECRET,
        ▲                                advisory lock, ledger de execução
        │
   [ scheduler externo ]             ← Vercel Cron | crontab+curl | QStash | GH Actions
```

**Regras não-negociáveis do worker:**

1. **`export const runtime = 'nodejs'`** e `export const dynamic = 'force-dynamic'` no route handler (Prisma não roda em Edge).
2. **Auth:** compara `Authorization: Bearer ${CRON_SECRET}` em tempo constante. A Vercel envia esse header automaticamente se `CRON_SECRET` estiver nas env vars; em VPS você monta o header no `curl`. Mesmo código nos dois casos.
3. **Método `GET`.** A Vercel dispara cron via `GET`, não `POST`.
4. **Advisory lock:** `SELECT pg_try_advisory_lock(<key>)` no início; se `false`, retorna `409` e sai. A Vercel documenta explicitamente que pode disparar uma segunda instância enquanto a primeira roda.
5. **Idempotente e reconciliador.** A Vercel é literal sobre isso: *"Cron job delivery is best effort... cron jobs should be resilient to both missed runs and duplicate runs"* e *"Vercel will not retry an invocation if a cron job fails"*. Portanto: derive o status de `proximoVencimentoEm`/`trialFimEm`/`canceladoEm`. Faça `UPDATE ... SET status = <calculado>`, nunca `SET diasRestantes = diasRestantes - 1`.
6. **Ledger de execução:** tabela `JobExecucao(job, iniciadoEm, terminadoEm, status, empresasAvaliadas, erro)`. Sem isso você não tem como saber que o cron parou de rodar.
7. **Dead-man's-switch:** ping no [Healthchecks.io](https://healthchecks.io) (free tier) ao final de cada run bem-sucedido. Se o worker não rodar por 26h, você recebe e-mail. Custa 10 linhas e cobre o único modo de falha que nenhum host resolve.
8. **Webhook é o caminho rápido; o worker é a rede de segurança.** `PAYMENT_OVERDUE` do Asaas já marca o atraso em tempo quase real; o worker existe para (a) avançar `carência → bloqueado` no dia certo, (b) encerrar trials, (c) executar cancelamentos no fim do período pago, e (d) corrigir divergências caso um webhook tenha se perdido.

### Comparação de plataformas de agendamento

| Opção | Precisão | Retry em falha | Custo | Trava você no host? | Veredito |
|---|---|---|---|---|---|
| **Vercel Cron (Hobby)** | ±59 min, 1×/dia máx. | **Não** | Grátis | Sim (`vercel.json`) | ✅ **Suficiente.** ±59 min não importa numa varredura diária de carência |
| **Vercel Cron (Pro)** | Ao minuto, até 1×/min | **Não** | Incluso ($20/mês do plano) | Sim | ✅ Se já estiver no Pro |
| **crontab em VPS** | Ao minuto, exata | Não (mas `curl --retry 3` resolve) | Grátis | Não | ✅ **Igualmente bom.** Máximo controle, mínimo lock-in |
| **Upstash QStash** | Ao minuto (até 60s de warm-up) | **Sim, nativo** | Free tier cobre 1 job/dia com folga | Não | ✅ Melhor opção se você quer retry sem escrever nenhum |
| **GitHub Actions `schedule`** | Ruim | Não | Grátis | Não | ⚠️ **Evitar.** GitHub documenta que o evento *"can be delayed during periods of high load"* e que *"some queued jobs may be dropped"*; em repo público é desativado após 60 dias sem atividade |
| **`node-cron` / `croner` in-process** | Exata | Não | Grátis | Não | ❌ **Não usar** — ver "What NOT to Use" |
| **Inngest / Trigger.dev** | Exata + retry por step + observabilidade | Sim | Free tier existe | Parcial | ⚠️ Overkill para 1 job diário. Considere só se surgirem workflows multi-step (dunning por e-mail em 3 etapas, etc.) |

### Recomendação de hosting

**Escolha padrão: Vercel + Postgres com pooler (Neon ou Supabase).**
Menor atrito para Next.js 16, cron incluso, webhook HTTPS sem configurar TLS. **Pré-requisito:** o `CONCERNS.md` já apontou um bug no singleton do Prisma — em serverless isso vira exaustão de pool de conexões. Se for Vercel, use a URL *pooled* do provedor no `DATABASE_URL` e a *direct* no `DIRECT_URL` para migrations. Corrija o singleton **antes** de subir para Vercel.

**Alternativa igualmente válida: VPS/container (Railway, Render, Fly.io, Hetzner + Coolify).**
Processo Node longevo → pool do Prisma funciona sem pooler externo, sem cold start no endpoint de webhook (relevante: o Asaas conta *timeout* como falha e 15 falhas pausam a fila). Custo do agendamento: uma linha de `crontab`.

```cron
7 6 * * * curl -fsS --retry 3 --retry-delay 30 -m 300 \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://app.seudominio.com.br/api/cron/assinaturas \
  && curl -fsS https://hc-ping.com/<uuid>
```

**Como o código fica idêntico nos dois casos:** o worker é um endpoint HTTP autenticado por bearer token. Vercel Cron manda o header sozinho; o `curl` manda manualmente. **Nenhuma linha de `app/` muda.** Por isso a indefinição de hosting **não bloqueia** este milestone — apenas anote a decisão para a fase de deploy.

---

## Installation

```bash
# Core — validação + observabilidade (o cliente do gateway é código próprio, sem SDK)
npm install zod@^4.5.4 @sentry/nextjs@^10.72.0

# Opcional — scheduler com retry nativo, se não quiser depender de Vercel Cron/crontab
npm install @upstash/qstash@^2.11.3

# Opcional — log estruturado, se preferir não usar Sentry
npm install pino@^10.3.1
npm install -D pino-pretty@^13.1.3

# Opcional — SÓ se houver semântica de "dia do calendário em America/Sao_Paulo"
npm install date-fns@^4.4.0 @date-fns/tz@^1.5.0

# --- SE (e só se) a decisão pivotar para Stripe ---
npm install stripe@^22.6.0
npm install -g @stripe/cli   # stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

**Nada mais.** Note o que *não* está aqui: nenhum SDK de gateway brasileiro, nenhuma lib de cron, nenhum Redis, nenhuma fila. A superfície de dependências deste milestone é deliberadamente pequena.

---

## Integration Surface (o que o roadmap vai precisar criar)

**Env vars novas:**

| Var | Uso |
|-----|-----|
| `ASAAS_API_KEY` | Header `access_token` nas chamadas à API v3 |
| `ASAAS_API_URL` | `https://api-sandbox.asaas.com/v3` (dev) / `https://api.asaas.com/v3` (prod) — confirmar em `docs.asaas.com/reference` |
| `ASAAS_WEBHOOK_TOKEN` | Token configurado no painel, recebido de volta no header do webhook; comparar em tempo constante |
| `CRON_SECRET` | ≥ 32 chars aleatórios; `Authorization: Bearer <valor>` |
| `SENTRY_DSN` | Observabilidade |
| `HEALTHCHECK_PING_URL` | Dead-man's-switch do worker |
| `APP_URL` | Montar `successUrl`/`cancelUrl`/`expiredUrl` do Checkout |

**Modelos Prisma novos (esboço para o roadmap):**
- `Assinatura` — `empresaId` (1:1), `gatewaySubscriptionId`, `gatewayCustomerId`, `status`, `proximoVencimentoEm`, `trialFimEm`, `canceladoEm`, `acessoAteEm`
- `CobrancaPeriodo` — `assinaturaId`, `gatewayPaymentId` (**unique**), `competencia`, `vencimentoEm`, `status`, `valor`, `linkPagamento` → é isto que alimenta a tela "quite os 2 meses em atraso"
- `WebhookEvento` — `provider`, `eventId` (**`@@unique([provider, eventId])`**), `tipo`, `payload Json`, `recebidoEm`, `processadoEm`, `erro` → idempotência com `ON CONFLICT DO NOTHING`, sem lib
- `JobExecucao` — ledger do worker
- `TermoDeUso` — `versao`, `conteudo`, `publicadoEm`
- `UsuarioTermoAceite` — `usuarioId`, `termoDeUsoId`, `aceitoEm`, `ip` (aceite é **por Usuario**; status de pagamento é **por Empresa** — não misturar)

**Campo em `Empresa`:** `statusPagamento` enum (`trial | em_dia | atrasado | vitalicio | cancelado | bloqueado`) — desnormalizado a partir de `Assinatura` para que o gate de leitura do catálogo seja uma query só.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Asaas | **Stripe Billing** | Se você já tiver Pix liberado na Stripe; se pretende vender fora do Brasil; se quer o Customer Portal pronto em vez de construir a tela de assinatura; se a confiabilidade de webhook (3 dias de retry, sem pausa de fila) valer os ~1,5 p.p. a mais |
| Asaas | **Mercado Pago** | Se a marca MP for decisiva para conversão do seu público e você aceitar 4,98% no cartão com liquidação imediata |
| Asaas | **Pagar.me v5** | Quando tiver volume suficiente para negociar taxa (a partir de algumas centenas de assinaturas) |
| Cliente HTTP próprio (`fetch` + zod) | SDK oficial do gateway | Se pivotar para Stripe, use o SDK oficial — `stripe@22.6.0` é excelente e tipado. Para Asaas não existe SDK oficial, então cliente próprio é a opção **melhor**, não a de compromisso |
| Checkout hospedado | Tokenização de cartão (`creditCardToken`) | Só se quiser checkout embutido no seu domínio. Custo: aprovação do gerente de contas Asaas para produção + você passa a lidar com PAN no browser (escopo PCI SAQ-A-EP). **Não faça em v1** |
| Vercel Cron / crontab | **QStash** | Se quiser retry automático no disparo sem escrever nenhum |
| Vercel Cron / crontab | **Inngest / Trigger.dev** | Quando o billing crescer para workflows multi-step (dunning em 3 e-mails, escalada, reconciliação em lote) |
| Instantes UTC (sem lib de data) | `date-fns` + `@date-fns/tz` | Se o produto prometer "vence todo dia 5" em horário de Brasília. Se prometer "30 dias após o pagamento", não precisa |
| Sentry | `pino` + logs do host | Se quiser evitar SaaS externo. Aceite que a detecção de falha vira manual |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`asaas@1.1.0`** (npm) | Wrapper comunitário, última publicação em 2025-03, sem garantia de cobertura de `/v3/checkouts` nem dos eventos de webhook atuais. Uma lib desatualizada no caminho do dinheiro é pior que nenhuma | Cliente `fetch` tipado próprio em `lib/billing/asaas/`, com `zod` validando as respostas |
| **`asaas-sdk@1.2.7`** | Abandonado desde 2022 | idem |
| **`iugu@0.0.6`** | Versão 0.0.x, abandonado | idem (e prefira não usar Iugu) |
| **`node-cron` / `croner` rodando dentro do processo Next.js** | (a) duplica execução se você escalar para 2 instâncias; (b) morre com o processo, sem ledger nem alerta; (c) side-effect em import pode ser avaliado durante `next build`; (d) impossível disparar manualmente para testar/reprocessar | Endpoint HTTP autenticado + scheduler externo. Funciona igual em Vercel, VPS, Docker e localmente (`curl`) |
| **GitHub Actions `schedule` como agendador de produção** | O próprio GitHub documenta atraso sob carga e que *"some queued jobs may be dropped"*; em repo público desativa após 60 dias sem atividade | Vercel Cron, crontab ou QStash |
| **`middleware.ts` para bloquear tenant inadimplente** | No Next.js 16 o arquivo virou `proxy.ts` e está **deprecado** sob o nome antigo. Pior: a doc diz que o Proxy *"is meant to be invoked separately of your render code and in optimized cases deployed to your CDN"* e que você *"should not attempt relying on shared modules or globals"* — ou seja, **não** faça query Prisma ali | Gate no layout `app/[slug]/admin/(protected)/layout.tsx` (server component) + em `lib/api-auth.ts` para rotas de API + dentro de `getEmpresaCatalogo(slug)` (retorna `notFound()`) para o catálogo público |
| **Confiar apenas na claim `statusPagamento` dentro do JWT** | O JWT atual expira em **7 dias** (`lib/jwt.ts`). Uma empresa bloqueada continuaria entrando por até 7 dias com um token antigo | Ou revalidar no banco a cada request protegido (barato: 1 query indexada por `empresaId`), ou emitir um token curto (≤15 min) com refresh. Decidir isso é item de roadmap |
| **Guardar `diasRestantesDeCarencia` como contador decrementado pelo worker** | Quebra silenciosamente se o cron rodar 2× (Vercel avisa que isso acontece) ou perder um dia | Guardar `proximoVencimentoEm: DateTime` e derivar `diasRestantes = ceil((proximoVencimentoEm + 10d - agora) / 1d)` na leitura |
| **Retornar `201`/`204`/`302` do endpoint de webhook Asaas** | O Asaas considera sucesso **apenas HTTP 200** — qualquer outro código, inclusive 2xx e redirects, conta como falha; 15 falhas seguidas **pausam a fila** e os eventos expiram em 14 dias | `return new Response(null, { status: 200 })` sempre que a assinatura for válida — inclusive para evento duplicado, desconhecido ou já processado. Erros de processamento vão para o ledger + Sentry, não para o status HTTP |
| **Processar o webhook de forma síncrona antes de responder** | Timeout de cold start ou de rede vira "falha" e conta para as 15 | Persistir o evento em `WebhookEvento` → responder 200 → processar (via `after()` do Next 16, ou deixar o worker diário reconciliar) |
| **`export const runtime = 'edge'` no webhook ou no cron** | Prisma + `pg` não rodam em Edge | `export const runtime = 'nodejs'` |
| **Armazenar qualquer PAN / CVV / validade no Postgres** | Constraint explícita do projeto + escopo PCI | Guardar apenas `gatewayCustomerId`, `gatewaySubscriptionId` e, no máximo, `bandeira` + `ultimos4` devolvidos pelo gateway |

---

## Stack Patterns by Variant

**Se o hosting for Vercel:**
- `vercel.json` com `{ "crons": [{ "path": "/api/cron/assinaturas", "schedule": "7 6 * * *" }] }` (UTC — 6:07 UTC ≈ 03:07 em Brasília)
- `CRON_SECRET` nas env vars → a Vercel injeta o `Authorization` sozinha
- `DATABASE_URL` **pooled** (Neon/Supabase pooler) + `DIRECT_URL` para migrations
- Corrigir o singleton do Prisma do `CONCERNS.md` **antes** — em serverless ele vira exaustão de pool
- Definir `maxDuration` no route handler do cron

**Se o hosting for VPS/container:**
- `crontab` chamando o mesmo endpoint com `curl --retry 3` (snippet acima)
- `DATABASE_URL` direta, sem pooler
- Ganho relevante: sem cold start no endpoint de webhook → menos risco de a fila do Asaas pausar por timeout
- Nunca subir 2 réplicas com scheduler in-process; com o padrão HTTP + advisory lock, escalar é seguro

**Se a decisão pivotar para Stripe:**
- `stripe@22.6.0` (API pinada em `2026-08-26.dahlia`), `webhooks.constructEvent` (Node) ou `constructEventAsync` (Web Crypto)
- Body **cru** obrigatório: `await req.text()`, nunca `await req.json()`
- Idempotência por `event.id` (a Stripe avisa: não use `created` para ordenar nem para deduplicar)
- Assinar apenas: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- **O requisito "tela de gerenciamento de assinatura" some** — vira uma Customer Portal Session
- Pix: verificar antes se sua conta tem acesso (é invite-only no Brasil); se não tiver, o milestone nasce cartão-only

**Se o volume passar de ~500 assinaturas:**
- Trocar o loop do worker por processamento em lotes (`take`/`cursor`) e mover para fila (QStash/Inngest) para não estourar `maxDuration`
- Aí sim reavaliar Pagar.me/Stripe com taxa negociada

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `zod@4.5.4` | TypeScript 5, Node 22 | Zod 4 tem API diferente de Zod 3 (`z.output`, mensagens de erro). Copiar exemplos de blog de Zod 3 vai quebrar |
| `stripe@22.6.0` | Node ≥18 (`engines`), API `2026-08-26.dahlia` | Fixe `apiVersion` explicitamente ao instanciar; upgrade de major do SDK muda a shape dos objetos de evento |
| `@sentry/nextjs@10.72.0` | Next.js 16 App Router | Requer `instrumentation.ts` + `onRequestError`; o wrapper `withSentryConfig` em `next.config.ts` |
| `@prisma/adapter-pg@7.9.1` + `pg@8.22.0` | Node 22 | Em serverless exige URL pooled; advisory lock via `$queryRaw` funciona com o adapter |
| `date-fns@4.4.0` + `@date-fns/tz@1.5.0` | — | date-fns v4 tem suporte a timezone de primeira classe; **não** use `date-fns-tz` (a lib da v3), é incompatível |
| Next.js 16.3.0 | `proxy.ts` | `middleware.ts` está deprecado/renomeado — qualquer receita pré-Next-16 de "middleware para auth" precisa ser adaptada |
| Next.js 16 `after()` | Route Handlers, Server Actions, Proxy | Útil para "responder 200 ao webhook e processar depois"; roda dentro do `maxDuration` da rota, não além dele |

---

## Sources

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` — confirmação de que `middleware` está deprecado e renomeado para `proxy` no Next.js 16, e de que Proxy não deve depender de módulos/globais compartilhados — **HIGH**
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` — `after()` disponível em Route Handlers; roda dentro do `maxDuration` da rota — **HIGH**
- https://vercel.com/docs/cron-jobs/manage-cron-jobs — *"Vercel will not retry an invocation if a cron job fails"*, *"Cron job delivery is best effort"*, concorrência/locks, `CRON_SECRET` — **HIGH**
- https://vercel.com/docs/cron-jobs/usage-and-pricing — Hobby: 1×/dia, precisão ±59 min; Pro: por minuto; 100 crons/projeto em todos os planos — **HIGH**
- https://vercel.com/docs/cron-jobs — disparo via HTTP `GET`, user-agent `vercel-cron/1.0`, timezone sempre UTC — **HIGH**
- https://docs.asaas.com/docs/assinaturas — assinaturas geram `payment`s independentes; boleto/Pix/cartão; monitoramento por webhook — **HIGH**
- https://docs.asaas.com/docs/checkout-com-assinatura-recorrente — `POST /v3/checkouts`, páginas hospedadas pelo Asaas, `successUrl`/`cancelUrl`/`expiredUrl`, eventos `CHECKOUT_PAID` / `SUBSCRIPTION_CREATED` — **HIGH**
- https://docs.asaas.com/docs/webhook-para-cobrancas — lista de eventos `PAYMENT_*` incluindo `PAYMENT_OVERDUE`, campo `subscription` no payload — **HIGH**
- https://docs.asaas.com/docs/fila-pausada e https://docs.asaas.com/docs/como-reativar-fila-interrompida — pausa após 15 falhas consecutivas, só HTTP 200 conta, retenção de 14 dias, reativação via painel ou `interrupted:false` — **MEDIUM-HIGH** (via busca; confirmar as páginas diretamente antes de implementar o monitoramento)
- https://docs.asaas.com/reference/tokenizacao-de-cartao-de-credito — tokenização habilitada no sandbox, exige liberação do gerente de contas em produção — **MEDIUM-HIGH**
- https://www.asaas.com/precos-e-taxas — cartão à vista 2,99% + R$0,49 (promo 1,99%), Pix/boleto R$1,99 (promo R$0,99), sem mensalidade, antecipação 1,25%/mês — **MEDIUM** (tabela comercial, muda sem aviso; confirmar antes de precificar o plano)
- https://stripe.com/br/pricing — 3,99% + R$0,39 cartão nacional; Pix 1,19% *"apenas para convidados"*; boleto R$3,45; Billing 0,7% do volume — **MEDIUM-HIGH**
- https://docs.stripe.com/billing/subscriptions/pix e https://docs.stripe.com/changelog/dahlia/2026-04-22/pix-recurring-payments-support — Pix Automático em subscriptions Stripe (mandate, retry diário por 3 dias, `mandate.updated`) — **HIGH**
- https://docs.stripe.com/webhooks — retry por 3 dias com backoff, body cru obrigatório, deduplicar por `event.id` e **não** por `created`, sem garantia de ordem, responder 2xx antes de lógica pesada — **HIGH**
- `npm view` / `npm pack stripe@22.6.0` — versões verificadas em 2026-08-31: `stripe@22.6.0` (`engines.node >=18`, `ApiVersion = "2026-08-26.dahlia"`, expõe `constructEvent` e `constructEventAsync`), `zod@4.5.4`, `mercadopago@3.6.0`, `@pagarme/pagarme-nodejs-sdk@7.0.1`, `asaas@1.1.0` (últ. mod. 2025-03-29), `asaas-sdk@1.2.7` (2022), `iugu@0.0.6`, `@sentry/nextjs@10.72.0`, `pino@10.3.1`, `date-fns@4.4.0`, `@date-fns/tz@1.5.0`, `@upstash/qstash@2.11.3` — **HIGH**
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/landing — `preapproval`/`preapproval_plan`, Pix/cartão/boleto, retry automático — **MEDIUM-HIGH**
- Taxas Mercado Pago (crédito 4,98% imediato / 3,03% em D+30; Pix 0,99%) — **LOW-MEDIUM** (fontes secundárias; confirmar no site oficial)
- https://docs.pagar.me/ — API v5 obrigatória para novas integrações de recorrência; v4 fechada — **MEDIUM-HIGH**
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows — *"can be delayed during periods of high loads"*, *"some queued jobs may be dropped"*, desativação após 60 dias em repo público — **HIGH**
- https://upstash.com/docs/qstash/features/schedules — schedules por cron, `CRON_TZ`, até 60s de warm-up inicial — **MEDIUM-HIGH**

---

## Confidence Assessment

| Área | Nível | Motivo |
|------|-------|--------|
| Arquitetura do worker (endpoint HTTP + idempotência + advisory lock) | **HIGH** | Baseada em afirmações explícitas da doc da Vercel sobre best-effort delivery e ausência de retry; padrão independente de host |
| Vercel Cron vs crontab vs alternativas | **HIGH** | Limites e comportamento de retry lidos direto na doc oficial (atualizada 2026-08-11) |
| Next.js 16: `proxy` substitui `middleware`, `after()`, runtime nodejs | **HIGH** | Lido dos docs empacotados em `node_modules/next/dist/docs/` desta instalação exata |
| Versões de pacotes | **HIGH** | Verificadas via `npm view` / `npm pack` em 2026-08-31 |
| Capacidades funcionais dos gateways (assinatura, checkout hospedado, webhooks) | **MEDIUM-HIGH** | Doc oficial de Asaas e Stripe; MP/Pagar.me/Iugu por doc + busca |
| Comportamento da fila de webhook do Asaas (pausa em 15 falhas, só HTTP 200, 14 dias) | **MEDIUM-HIGH** | Consistente entre múltiplas páginas de doc via busca; **validar em sandbox antes de confiar** — é o risco operacional nº 1 |
| Taxas e preços | **MEDIUM** (Asaas/Stripe) / **LOW-MEDIUM** (MP) / **LOW** (Pagar.me, Iugu) | Tabelas comerciais mudam sem aviso; Pagar.me e Iugu não publicam preço. **Reconfirmar antes de definir o preço do plano** |
| Recomendação final Asaas > Stripe | **MEDIUM-HIGH** | O fator decisivo (Pix invite-only na Stripe Brasil) vem da página oficial de preços da Stripe BR. Se você conseguir Pix liberado na Stripe, a decisão fica genuinamente disputada |

## Gaps / a resolver fora desta pesquisa

1. **Confirmar com o Asaas** (sandbox + suporte): base URL exata da API v3, header de auth do webhook, rate limits, e se o Checkout com assinatura recorrente está liberado sem aprovação prévia.
2. **Preço do plano ainda não definido** no `PROJECT.md`. A comparação de taxas assume ~R$49,90/mês; abaixo de ~R$20 as taxas fixas (R$0,49 / R$1,99) dominam e a escolha do meio de pagamento muda.
3. **Decisão de hosting** continua aberta — mas o design proposto a torna reversível. Registrar como decisão de fase de deploy, não como bloqueador de roadmap.
4. **TTL do JWT vs bloqueio** precisa de decisão de produto: revalidar no banco a cada request (simples, +1 query) vs token curto com refresh (mais código). Recomendo o primeiro para v1.
5. **`CONCERNS.md`: singleton do Prisma** vira bug crítico se o host escolhido for serverless. Deve entrar como pré-requisito da fase de deploy.

---
*Stack research for: cobrança recorrente por assinatura em SaaS multi-tenant brasileiro (Next.js 16 + Prisma 7 + PostgreSQL)*
*Researched: 2026-08-31*
