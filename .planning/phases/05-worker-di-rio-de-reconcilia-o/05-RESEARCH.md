# Phase 5: Worker Diário de Reconciliação - Research

**Researched:** 2026-09-01
**Domain:** Batch job HTTP-triggered em Next.js 16 App Router — autenticação por segredo estático, isolamento de falha por linha, freio de segurança contra ação em massa
**Confidence:** HIGH para o que é interno ao repositório (lido diretamente), MEDIUM para os limites de plataforma (docs oficiais da Vercel, plataforma ainda não escolhida)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Freio de segurança contra bloqueio em massa (WRK-02)**
- **D-01:** O worker tem um limiar de segurança: se mais de **20%** das empresas avaliadas nesta execução resultariam em transição para `BLOQUEADO` ou `CANCELADO`, o worker **não aplica nenhuma** dessas transições — aborta as escritas dessa leva, loga a anomalia e devolve isso de forma clara na resposta HTTP. Protege contra um bug (ex: erro de fuso, corrupção de dados) que marcaria a base inteira como vencida de uma vez, repetindo o incidente que a Fase 4 já provou ser possível (bloqueio é imediato e retroativo).
- **D-02:** O limiar de 20% é sobre transições *para* `BLOQUEADO`/`CANCELADO` nesta execução específica, não sobre o total de empresas já bloqueadas na base. Empresas que já estavam bloqueadas antes desta execução não contam para o cálculo (não é uma transição nova).
- **D-03:** Quando o freio dispara, as demais transições que **não** são para bloqueio (ex: empresas saindo de `TRIAL` para `CARENCIA`, ou sendo reativadas) continuam sendo aplicadas normalmente — o freio é específico para a classe de transição perigosa (perda de acesso em massa), não uma parada total do worker.

**Sinalização de anomalias (critério de sucesso #4)**
- **D-04:** O endpoint devolve um corpo de resposta JSON detalhado: contagem de empresas processadas, contagem de sucesso, lista de erros por empresa (id + mensagem, sem dado sensível), e se o freio de segurança disparou. Nenhum canal de notificação novo (e-mail, Slack, etc.) é construído nesta fase — quem agendar a execução (painel do Vercel Cron, log de Actions, etc.) já mostra essa resposta no histórico de execuções.
- **D-05:** Uma falha ao processar uma empresa específica (ex: erro de banco pontual) não aborta o processamento das demais — cada empresa é isolada (padrão `Promise.allSettled` ou equivalente, que não existe ainda no projeto e é introduzido por esta fase). O erro daquela empresa entra na lista de erros da resposta.

**Escopo: só fatos locais, sem chamar o Asaas (WRK-01)**
- **D-06:** O worker **não** chama a API do Asaas. Ele reavalia exclusivamente os 4 fatos de billing já salvos na `Empresa` (`acessoAte`, `trialFim`, `canceladoEm`, `acessoVitalicio`) via `avaliarAcesso`, exatamente como `revalidarConta` já faz por request — a diferença é que o worker cobre empresas que não fazem nenhum request autenticado. Reconciliação ativa com o gateway (puxar assinaturas do Asaas para pegar webhooks perdidos) fica fora de escopo — pode virar uma fase futura se a experiência em produção mostrar que falta.

**Hosting/scheduler**
- **D-07:** Nenhuma decisão de hosting é tomada nesta fase. O endpoint é agnóstico de plataforma por construção (critério de sucesso #3 já exige isso) — funciona atrás de qualquer chamador HTTP que envie o segredo correto, seja Vercel Cron, GitHub Actions, ou crontab de VPS com `curl`. A escolha de onde hospedar de fato fica para quando o deploy em produção acontecer. Isso também significa que o dimensionamento do pool do Prisma (mencionado como bloqueador nas Fases 1/3) continua adiado — não é resolvido aqui.

### Claude's Discretion
- Nome exato do endpoint e método HTTP (ex: `POST /api/cron/worker-diario` vs. `GET`) — seguir a convenção de rotas já usada no projeto.
- Estratégia de paginação/lote do `findMany` sobre `Empresa` — não existe precedente de paginação no projeto hoje (confirmado no scout); dado que não há evidência de escala de produção que exija isso, um único `findMany` sem paginação (mesmo padrão de `scripts/contagem-status-acesso.ts`) é aceitável para v1, mas o planner pode decidir por paginação por cursor se preferir robustez.
- Nome exato do valor novo no enum `CausaTransicaoAcesso` (`WORKER_DIARIO`, já sugerido no roadmap e reservado desde a Fase 2 D-14) e a migration que o introduz.
- Formato exato do header/mecanismo de autenticação do `CRON_SECRET` (header customizado vs. `Authorization: Bearer`) — seguir o padrão de comparação time-safe já usado no webhook do Asaas (`app/api/webhooks/asaas/route.ts`), adaptado para o novo segredo.
- Onde exatamente reside a lógica de "calcular a % de transições perigosas antes de decidir aplicar" (dry-run em duas passadas vs. acumular e decidir no fim) — desde que a garantia final (D-01) seja mantida.

### Deferred Ideas (OUT OF SCOPE)
- Reconciliação ativa com a API do Asaas (puxar assinaturas para pegar webhooks perdidos) — descartada para esta fase (D-06); poderia voltar se a experiência em produção mostrar webhooks perdidos com frequência.
- Canal de notificação ativa (e-mail/Slack/webhook) para anomalias — descartado para esta fase (D-04); a resposta HTTP + log do agendador é suficiente por ora.
- Decisão definitiva de hosting/scheduler e dimensionamento do pool do Prisma — adiada para a fase de deploy real (D-07), não esta fase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WRK-01 | Worker diário reconcilia todas as empresas (expira trials, inicia carências, aplica bloqueios); é idempotente e seguro mesmo se rodar mais de uma vez ou pular uma execução | §"Achado crítico 1" (idempotência já é propriedade de `avaliarAcesso` + CAS, provada por leitura do código, não precisa ser construída); §Pattern 1 (shape de duas passadas); §Pattern 3 (concorrência limitada); §"Prova de convergência" |
| WRK-02 | Worker é exposto como endpoint HTTP protegido por segredo (`CRON_SECRET`), funcionando independente da decisão final de hosting (Vercel Cron, VPS cron, etc.) | §"Achado crítico 2" (Vercel Cron usa **GET** e o header `Authorization: Bearer` — as duas coisas restringem o design); §Pattern 2 (gate time-safe); §Security Domain |
</phase_requirements>

## Summary

Esta fase é quase inteiramente **fiação**, como a Fase 4 foi. As três peças difíceis — a regra de negócio (`avaliarAcesso`), a atomicidade da auditoria (`acessoService.registrarTransicao`) e o enforcement (Fase 4) — já existem, já têm teste e não são tocadas. O que sobra é: um `findMany`, um laço em memória, um gate de segredo, um freio percentual e um corpo de resposta JSON.

Duas descobertas mudam o desenho e devem ser lidas antes de planejar qualquer coisa. **Primeira:** a idempotência exigida por WRK-01 e pelo critério de sucesso #2 **não precisa ser implementada** — ela já é uma consequência matemática de `avaliarAcesso` ser uma função pura do par (fatos, `agora`) somada ao compare-and-swap de `registrarTransicao`. O worker não precisa de ledger, de marca d'água ("última execução em"), nem de chaining de transições. Tentar construir qualquer uma dessas coisas seria trabalho a mais que *quebraria* a garantia em vez de reforçá-la (§Achado crítico 1). **Segunda:** o Vercel Cron dispara exclusivamente `HTTP GET` e envia `Authorization: Bearer $CRON_SECRET`. Se o endpoint for `POST`, ou se ler o segredo de um header customizado, o critério de sucesso #3 ("funciona igual atrás de Vercel Cron ou de um crontab em VPS, sem mudança de código") fica falso de imediato. A discrição do planner sobre método e header é, na prática, dirigida por isso (§Achado crítico 2).

O terceiro achado é operacional e precisa de decisão humana: com a base pequena que este produto tem hoje, o limiar de 20% de D-01 **dispara em praticamente qualquer bloqueio legítimo**. Quatro empresas com uma vencendo dá 25% — freio armado, ninguém bloqueado, e o único sinal disso é um campo no JSON que ninguém está lendo diariamente. O freio protege contra o incidente certo mas, sem um piso absoluto, ele transforma o worker em no-op silencioso durante toda a fase inicial do produto (§Achado crítico 3 / Open Question 1).

**Primary recommendation:** endpoint `GET /api/cron/reconciliacao-diaria` com `runtime = "nodejs"`, gate lendo `Authorization: Bearer <segredo>` com o mesmo hash-antes-de-`timingSafeEqual` do webhook do Asaas; duas passadas — uma pura em memória (um `findMany`, um `avaliarAcesso` por empresa, materializando a lista de transições) e uma de escrita (só o subconjunto que muda, com concorrência limitada a ≤5, `Promise.allSettled` por lote); freio calculado entre as duas passadas sobre a lista já materializada, com predicado `perdeAcesso = !acessoBloqueado(anterior) && acessoBloqueado(novo)` e um piso absoluto além do percentual.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Agendamento diário (quando rodar) | Infra externa (Vercel Cron / crontab / GH Actions) | — | D-07: nenhuma linha de código de agendamento é commitada; o repositório expõe só o gatilho HTTP |
| Autenticação do gatilho | API / Route Handler | — | Segredo estático conferido no handler, exatamente como o webhook do Asaas — nunca em middleware (o projeto não tem middleware de auth por decisão da Fase 1) |
| Leitura dos fatos de billing | Database / Prisma | — | Um `findMany` com `select` explícito dos 4 fatos + `ultimoStatusAuditado` |
| Decisão de status por empresa | Pure domain (`lib/avaliar-acesso.ts`) | — | Já existe. Nunca reimplementar em `WHERE` de SQL (decisão travada na Fase 2 e reafirmada em `[04-09]`) |
| Freio de 20% (decisão de lote) | Orquestrador do worker | — | É uma propriedade da execução inteira, não de uma empresa; não cabe nem na função pura nem no service |
| Escrita da transição + auditoria | Service (`acessoService.registrarTransicao`) | Database (CAS) | Já existe, já é atômico, não é modificado |
| Observabilidade | API / corpo da resposta | — | D-04: o corpo do 200 é a única superfície; sem canal novo |

## Achados Críticos (leia antes de planejar)

### Achado crítico 1 — A idempotência de WRK-01 já está pronta; construí-la de novo a quebraria

O critério de sucesso #2 ("rodar duas vezes no mesmo dia, ou pular um dia inteiro, leva ao mesmo estado final correto") parece pedir infraestrutura. Não pede. A prova é curta e vale escrevê-la no plano:

1. `avaliarAcesso(fatos, agora)` é uma **função total e pura** do par (fatos, instante) para um dos 6 status. Não há estado acumulado, nem dependência de execução anterior. [VERIFIED: `lib/avaliar-acesso.ts:52-110`, função com zero I/O e relógio injetado]
2. Logo, **não existe "pular um dia"**. Uma empresa que não é avaliada há 30 dias produz, na primeira avaliação, o status final correto de hoje — direto. Não é preciso simular `TRIAL → CARENCIA → BLOQUEADO`; `avaliarAcesso` já colapsa a cadeia inteira num único resultado, porque a carência é calculada de `expiraEm` (o fato que venceu por último) e comparada com `agora`, não com o dia anterior. **O worker NÃO deve encadear chamadas de `registrarTransicao`.**
3. Rodar duas vezes no mesmo dia: a segunda passada lê o mesmo `ultimoStatusAuditado` que a primeira acabou de gravar, então `anterior === novo` e `registrarTransicao` retorna antes de tocar o banco. [VERIFIED: `app/services/acesso.service.ts:42`]
4. Duas execuções **concorrentes** (o Vercel Cron documenta que isso pode acontecer, ver Achado 2): ambas leem o mesmo `anterior` e disparam `updateMany({ where: { id, ultimoStatusAuditado: anterior } })`. O Postgres serializa; a primeira devolve `count === 1` e cria a linha de auditoria, a segunda devolve `count === 0` e retorna `null` sem criar nada. [VERIFIED: `app/services/acesso.service.ts:44-60`]

**Consequência de design a registrar no plano:** quando o worker pula dias, a trilha de auditoria registra `TRIAL → BLOQUEADO` e **nunca** grava a linha `CARENCIA` intermediária. Isso é correto e desejado — `AuditoriaAcesso` registra transições *observadas*, não transições *simuladas*. Tentar preencher o buraco exigiria que o worker inventasse `agora` no passado, o que quebraria a pureza que torna tudo isso demonstrável.

**Armadilha de contagem:** `registrarTransicao` devolve `null` em **dois** casos diferentes — "não houve transição" (guarda D-16) e "outro processo ganhou a corrida" (CAS `count === 0`). O worker não consegue distinguir os dois pelo retorno. Portanto **as contagens de D-04 devem sair da decisão do worker (a lista materializada na passada 1), não do retorno de `registrarTransicao`** — senão uma execução concorrente reporta "0 transições aplicadas" e parece um bug.

### Achado crítico 2 — Vercel Cron dispara **GET**, e envia `Authorization: Bearer`; isso decide duas das "discrições" do planner

Dois fatos da documentação oficial, ambos com efeito direto no critério de sucesso #3:

- *"To trigger a cron job, Vercel makes an HTTP **GET** request to your project's production deployment URL"* [CITED: vercel.com/docs/cron-jobs]. Não há como configurar `POST`. Um endpoint `POST`-only **não funciona** atrás de Vercel Cron — e o critério #3 nomeia o Vercel Cron explicitamente.
- *"It is possible to secure your cron job invocations by adding an environment variable called `CRON_SECRET`... The value of the variable will be automatically sent as an `Authorization` header... The `authorization` header will have the `Bearer` prefix for the value."* [CITED: vercel.com/docs/cron-jobs/manage-cron-jobs]

Ou seja: **o nome da variável `CRON_SECRET` e o formato `Authorization: Bearer <segredo>` já são o padrão da plataforma**, e coincidentemente são também a coisa mais trivial de reproduzir com `curl -H "Authorization: Bearer $CRON_SECRET"` num crontab de VPS. Escolher `Bearer` NÃO é vazamento de comportamento Vercel-específico para dentro do código — é o contrário: é a única escolha que satisfaz "funciona igual nos dois sem mudança de código". Um header customizado (`x-cron-secret`) obrigaria a configurar o segredo de outro jeito no Vercel e violaria o critério #3.

**Onde o Vercel-específico realmente vazaria, e como o planner deve se proteger:**

| Tentação | Por que vaza | Guarda recomendada |
|----------|--------------|--------------------|
| Commitar `vercel.json` com `"crons": [...]` | É a decisão de hosting que D-07 adia | Não criar `vercel.json`. Documentar o agendamento (o cron expression sugerido + o comando `curl` equivalente) num comentário do handler ou no README, não em config de plataforma |
| Ler `x-vercel-cron-schedule` ou checar `user-agent: vercel-cron/1.0` | Só existe na Vercel; um crontab não manda | Proibido. Gate de grep: `x-vercel-cron` e `vercel-cron` não podem aparecer em `app/` |
| `import { waitUntil } from "@vercel/functions"` | Dependência de plataforma | Já resolvido: o projeto usa `lib/agendar-pos-resposta.ts` (mas veja o Pitfall 4 — o worker **não deve** usá-lo) |
| `export const maxDuration = N` | Neutro, mas só a Vercel lê | Aceitável: o Next documenta `maxDuration` como *"Set by deployment platform"* [VERIFIED: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`], então é um **hint no build output**, não um limite que o Next imponha. Num VPS a linha é inerte. Ver §Duração e limites |

**Terceira consequência, menos óbvia:** *"Cron jobs do not follow redirects. When a cron-triggered endpoint returns a 3xx redirect status code, the job completes without further requests."* [CITED: vercel.com/docs/cron-jobs/manage-cron-jobs]. E *"If you create a cron job for a path that doesn't exist, it generates a 404 error. However, Vercel still executes your cron job"* — ou seja, **um path errado falha silenciosamente e ainda é cobrado**. O plano deve fixar o path exato, sem barra final (o `trailingSlash` default do Next é `false`, então `/api/cron/x/` responderia 308 e o job terminaria sem executar nada).

### Achado crítico 3 — Com a base atual, o freio de 20% torna o worker um no-op silencioso

D-01 define o gatilho como "mais de 20% das empresas avaliadas". Faça a aritmética com uma base pequena:

| Empresas avaliadas | Bloqueios novos | % | Freio (>20%)? | Efeito |
|---|---|---|---|---|
| 4 | 1 | 25% | **DISPARA** | ninguém é bloqueado |
| 5 | 1 | 20% | não | 1 bloqueado |
| 10 | 3 | 30% | **DISPARA** | ninguém é bloqueado |
| 50 | 11 | 22% | **DISPARA** | ninguém é bloqueado |
| 500 | 100 | 20% | não | 100 bloqueados |

Um SaaS no início — que é exatamente onde este produto está, com o trial de 14 dias de BILL-03 fazendo várias empresas vencerem na mesma janela — passa meses na faixa onde o freio arma em quase toda execução. O resultado prático: **o worker nunca bloqueia ninguém, e o único sinal disso é um booleano num JSON que só é lido se alguém abrir o histórico do agendador**. Isso derrota o critério de sucesso #1 ("uma empresa cujo trial termina sem pagamento aparece bloqueada no dia seguinte") de forma indistinguível de um bug.

Note também que a coorte de trial agrava isso estruturalmente: empresas cadastradas no mesmo dia vencem o trial no mesmo dia e a carência no mesmo dia. Um lançamento com 20 cadastros numa semana produz, 24 dias depois, um pico legítimo de bloqueios que o freio interpretará como anomalia.

**Recomendação (precisa de confirmação do usuário — ver Open Question 1):** manter o percentual de D-01 e somar um **piso absoluto**: o freio só arma quando `perigosas > 20% do total` **E** `perigosas >= PISO_ABSOLUTO`. Um `PISO_ABSOLUTO` na casa de 5–10 preserva a intenção de D-01 (impedir um bug de fuso/corrupção de dados de apagar a base) sem transformar 1-de-4 em incidente. O piso é uma constante nomeada e exportada, testável, no mesmo arquivo do limiar.

### Achado crítico 4 — `seed-fatos-billing.ts` não consegue montar a fixture que este worker precisa

O script da Fase 4 grava os 4 fatos **e alinha `ultimoStatusAuditado` ao status derivado**, deliberadamente:

> *"`ultimoStatusAuditado` entra na MESMA escrita, alinhado ao status que `avaliarAcesso` acabou de derivar... se ele ficasse com o valor antigo, o primeiro request depois do seed veria uma transição que nunca aconteceu de verdade e gravaria uma linha de trilha espúria."* [VERIFIED: `scripts/seed-fatos-billing.ts`, bloco do `prisma.empresa.update`]

Para a Fase 4 isso era certo — ela media um **gate**, e queria estado assentado. Para a Fase 5 é fatal: o worker existe justamente para aplicar **transições pendentes**, e uma empresa semeada com o script está, por construção, sem nenhuma transição pendente. `anterior === novo`, `registrarTransicao` retorna na primeira linha, e um e2e escrito assim passaria verde contra um worker completamente quebrado.

**O planner precisa de uma tarefa explícita para isso.** A opção de menor atrito é uma flag nova no script existente (ex.: `--auditado <status>` ou `--nao-alinhar-auditoria`) que deixa `ultimoStatusAuditado` num valor diferente do derivado, preservando o comportamento default atual para não quebrar `e2e/bloqueio-por-inadimplencia.spec.ts`. Sem isso, não existe teste de integração/e2e não-vácuo para WRK-01.

### Achado crítico 5 — STATE.md registra uma expectativa que CONTEXT.md D-06 revoga; o plano precisa dizer isso em voz alta

Duas fontes do próprio projeto atribuem à Fase 5 a drenagem da fila de webhooks travados:

- `prisma/schema.prisma`, model `EventoWebhookAsaas`: *"Interface de recuperacao consumida pela FASE 5 (WRK-01): a fila de retrabalho e `WHERE "processadoEm" IS NULL`. Esta fase entrega apenas as colunas e o indice — DRENAR a fila nao e escopo daqui"* [VERIFIED: `prisma/schema.prisma:352-356`, e há `@@index([processadoEm])` criado para isso]
- `.planning/STATE.md`: *"`[03-07]` Reenvio pelo painel do Asaas NAO reprocessa evento ja registrado (colide no @unique do ledger) — recuperacao e trabalho do worker da Fase 5 sobre `processadoEm IS NULL`, nao do botao"*
- `app/services/webhook-asaas.service.test.ts:240`: *"a ausencia de `processadoEm` aqui e o que mantem o evento na fila de retrabalho `WHERE processadoEm IS NULL` (Fase 5 / WRK-01)"*

CONTEXT.md D-06 escopa isso **fora** desta fase (o worker não chama o Asaas, e o reprocessamento de um evento passa por `webhookAsaasService.processar`, que re-busca `GET /v3/payments/{id}` no gateway). A decisão de D-06 prevalece — ela é mais recente e é do usuário. Mas o efeito colateral precisa ser registrado: **depois desta fase, a fila `processadoEm IS NULL` continua sem dreno, e um cliente que pagou e cujo webhook falhou continua bloqueado indefinidamente**, apesar de três lugares no código prometerem que a Fase 5 resolveria isso. O plano deve (a) não implementar o dreno, e (b) atualizar/anotar essas três referências para que a promessa não fique órfã, ou registrar o débito explicitamente em STATE.md § Blockers.

## Standard Stack

### Core (já presentes — nenhuma instalação nesta fase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.3.0 | Route Handler `app/api/**/route.ts` como gatilho HTTP | Único servidor do projeto [VERIFIED: `package.json`] |
| `node:crypto` (`createHash`, `timingSafeEqual`) | runtime Node 22 | Comparação do `CRON_SECRET` resistente a tempo | Já é o idioma do projeto em `app/api/webhooks/asaas/route.ts:1` [VERIFIED] |
| `@prisma/client` + `@prisma/adapter-pg` | 7.9.1 | `findMany` dos fatos + `$transaction` do CAS | [VERIFIED: `package.json`] |
| `lib/avaliar-acesso.ts` | interno | `avaliarAcesso`, `acessoBloqueado` | Motor de decisão; reusado sem modificação (D-06) |
| `app/services/acesso.service.ts` | interno | `registrarTransicao` | CAS atômico; reusado sem modificação |
| `vitest` + `vitest-mock-extended` | 4.1.10 / 5.1.1 | Testes de unidade do handler com `prismaMock` | [VERIFIED: `package.json`, `tests/setup/prisma-mock.ts`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^4.5.4 | — | **Não usar nesta fase.** Não há corpo de request para validar: o gatilho é um GET sem body |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Endpoint HTTP + agendador externo | `node-cron` in-process | Morre em serverless (a invocação é congelada), exige processo sempre vivo e amarra a fase à decisão de hosting que D-07 adia. O Next inclusive lista `node-cron` em `serverExternalPackages` justamente porque ele não sobrevive ao bundling [VERIFIED: `node_modules/next/dist/docs/.../serverExternalPackages.md:70`] |
| `Promise.allSettled` em lotes | `Promise.all` puro sobre todas as empresas | `Promise.all` aborta na primeira rejeição — viola D-05 diretamente. E sem lotes satura o pool (§Pitfall 2) |
| `Promise.allSettled` em lotes | laço `for...of` sequencial com `try/catch` | Também correto e mais simples de ler; é a alternativa aceitável se o planner preferir. Como só as empresas **com transição** são escritas (tipicamente unidades por dia), a diferença de tempo é irrelevante. Escolher por legibilidade, não por performance |
| Um `findMany` sem paginação | paginação por cursor | Sem paginação é o precedente do projeto (`scripts/contagem-status-acesso.ts`) e cabe folgadamente na base atual. Ver §Duração e limites para o ponto em que isso deixa de ser verdade |

**Installation:** nenhuma. Esta fase não adiciona dependências.

## Package Legitimacy Audit

Nenhum pacote externo é instalado nesta fase. Todas as capacidades necessárias (`node:crypto`, Prisma, Next Route Handlers, Vitest) já estão no `package.json` e foram introduzidas por fases anteriores.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(nenhum)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
  Agendador externo (fora do repositório — D-07)
  ┌──────────────────────────────────────────────────────┐
  │  Vercel Cron (GET, Authorization: Bearer)            │
  │  crontab VPS:  curl -H "Authorization: Bearer …"     │
  │  GitHub Actions: mesma chamada curl                  │
  └────────────────────────┬─────────────────────────────┘
                           │  HTTP GET  (1x/dia)
                           ▼
  ┌──────────────────────────────────────────────────────┐
  │  app/api/cron/reconciliacao-diaria/route.ts          │
  │  runtime = "nodejs"                                  │
  ├──────────────────────────────────────────────────────┤
  │ (1) GATE: Authorization → "Bearer " → sha256 →       │
  │     timingSafeEqual(cronSecret())                    │
  │     falha ──────────────────────────► 401, corpo vazio│
  └────────────────────────┬─────────────────────────────┘
                           │ autorizado
                           ▼
  ┌──────────────────────────────────────────────────────┐
  │ (2) agora = new Date()   ← UM instante para TUDO     │
  │ (3) prisma.empresa.findMany({ deletedAt: null },     │
  │     select: 4 fatos + id + ultimoStatusAuditado)     │
  └────────────────────────┬─────────────────────────────┘
                           │ Empresa[]  (em memória)
                           ▼
  ┌──────────────────────────────────────────────────────┐
  │  PASSADA 1 — PURA, ZERO I/O                          │
  │  para cada empresa:                                  │
  │     novo = avaliarAcesso(fatos, agora).status        │
  │     se novo !== ultimoStatusAuditado → transição     │
  │  materializa: Transicao[] { empresaId, anterior,novo}│
  └────────────────────────┬─────────────────────────────┘
                           │ Transicao[]
                           ▼
  ┌──────────────────────────────────────────────────────┐
  │  DECISÃO DE LOTE (D-01/D-02/D-03)                    │
  │  perigosas = T.filter(perdeAcesso)                   │
  │    perdeAcesso = !bloqueado(ant) && bloqueado(novo)  │
  │  freio = perigosas/total > 20% && perigosas >= PISO  │
  │  aplicaveis = freio ? T.filter(!perdeAcesso) : T     │
  └────────────────────────┬─────────────────────────────┘
                           │ Transicao[] (subconjunto)
                           ▼
  ┌──────────────────────────────────────────────────────┐
  │  PASSADA 2 — ESCRITA, lotes de ≤5                    │
  │  Promise.allSettled(lote.map(t =>                    │
  │    acessoService.registrarTransicao({...t,           │
  │      causa: WORKER_DIARIO })))                       │
  │  rejeitada → coleta {empresaId, mensagem}, segue     │
  └───────┬──────────────────────────────┬───────────────┘
          │ por transição                │ agregado
          ▼                              ▼
  ┌────────────────────┐        ┌────────────────────────┐
  │ $transaction (CAS) │        │ 200 + JSON detalhado   │
  │ updateMany cond.   │        │ {avaliadas, transicoes,│
  │ + auditoriaAcesso  │        │  aplicadas, freio:{…}, │
  │   .create          │        │  erros:[…]}            │
  └────────────────────┘        └────────────────────────┘
```

### Recommended Project Structure

```
app/api/cron/reconciliacao-diaria/
├── route.ts              # gate + orquestração + resposta JSON
└── route.test.ts         # testes de unidade (prismaMock + acessoService mockado)

lib/billing/
└── cron-config.ts        # cronSecret() no idioma de obrigatorio() (ou estender lib/billing/asaas/config.ts)

app/services/
└── reconciliacao.service.ts   # OPCIONAL — ver nota abaixo

prisma/migrations/
└── <ts>_add_worker_diario_causa/migration.sql   # ALTER TYPE … ADD VALUE 'WORKER_DIARIO'
```

**Nota sobre `reconciliacao.service.ts`:** a decisão de extrair ou não é discrição do planner, mas há um argumento forte a favor de extrair **a parte pura**. O cálculo "dada a lista de empresas e um instante, quais transições e o freio dispara?" é uma função pura e é onde mora toda a lógica interessante (D-01, D-02, D-03). Extraí-la para uma função pura exportada — por exemplo `planejarReconciliacao(empresas, agora): PlanoDeReconciliacao` — permite testar o freio com 200 empresas sintéticas sem nenhum mock de Prisma, exatamente como `avaliarAcesso` é testado hoje. O handler fica com I/O + gate + resposta. Essa é a mesma separação puro/impuro que a Fase 2 estabeleceu (`[02-03]`: "Motor de acesso mora em `lib/`, o wrapper com efeito colateral mora em `app/services/`").

### Pattern 1: Duas passadas com **uma** avaliação por empresa (resposta direta à pergunta de pesquisa #2)

**What:** calcular *todas* as transições em memória antes de escrever qualquer uma; decidir o freio sobre a lista já materializada; escrever apenas o subconjunto aprovado.

**When to use:** sempre que a decisão de aplicar uma escrita depende de uma propriedade agregada de todo o lote.

**Por que isto resolve o dilema (a)/(b) da pergunta:** o "dry-run" não custa uma segunda chamada a `avaliarAcesso` porque o resultado da primeira é **materializado numa lista**, não descartado. E não precisa de uma transação gigante porque **nada foi escrito** durante a fase de decisão — não há o que fazer rollback. A transação por empresa de `registrarTransicao` continua sendo a unidade de atomicidade, exatamente como é hoje.

```typescript
// Fonte: composição de lib/avaliar-acesso.ts + app/services/acesso.service.ts (código do projeto)
import { StatusAcesso } from "@prisma/client";
import { avaliarAcesso, acessoBloqueado, type FatosDeAcesso } from "@/lib/avaliar-acesso";

export const LIMIAR_DE_BLOQUEIO_EM_MASSA = 0.2;   // D-01
export const PISO_DE_BLOQUEIO_EM_MASSA = 5;       // ver Open Question 1

interface EmpresaAvaliavel extends FatosDeAcesso {
  id: string;
  ultimoStatusAuditado: StatusAcesso | null;
}

export interface Transicao {
  empresaId: string;
  anterior: StatusAcesso | null;
  novo: StatusAcesso;
}

/**
 * D-02: só conta como perigosa a transição que faz a empresa PERDER acesso
 * agora. Uma empresa que já estava bloqueada e vira CANCELADO não é uma perda
 * nova — comparar apenas `novo` com BLOQUEADO/CANCELADO contaria essa e inflaria
 * o percentual com empresas que D-02 manda excluir.
 *
 * `anterior === null` (nunca auditada) é tratado como "tinha acesso": é a
 * leitura conservadora, e é a que faz o freio proteger em vez de deixar passar.
 */
export function perdeAcesso(t: Transicao): boolean {
  const tinhaAcesso = t.anterior === null || !acessoBloqueado(t.anterior);
  return tinhaAcesso && acessoBloqueado(t.novo);
}

export function planejarReconciliacao(empresas: EmpresaAvaliavel[], agora: Date) {
  // PASSADA 1 — pura. Uma única chamada de avaliarAcesso por empresa.
  const transicoes: Transicao[] = [];

  for (const empresa of empresas) {
    const { status } = avaliarAcesso(empresa, agora);

    // Mesma guarda de D-16 que registrarTransicao aplica: sem mudança, sem I/O.
    if (status !== empresa.ultimoStatusAuditado) {
      transicoes.push({
        empresaId: empresa.id,
        anterior: empresa.ultimoStatusAuditado,
        novo: status,
      });
    }
  }

  // DECISÃO DE LOTE — D-01/D-02/D-03.
  const perigosas = transicoes.filter(perdeAcesso);
  const proporcao = empresas.length === 0 ? 0 : perigosas.length / empresas.length;

  const freioDisparou =
    proporcao > LIMIAR_DE_BLOQUEIO_EM_MASSA &&
    perigosas.length >= PISO_DE_BLOQUEIO_EM_MASSA;

  // D-03: o freio suprime SÓ a classe perigosa; TRIAL→CARENCIA e reativações passam.
  const aplicaveis = freioDisparou
    ? transicoes.filter((t) => !perdeAcesso(t))
    : transicoes;

  return {
    avaliadas: empresas.length,
    transicoes,
    perigosas,
    aplicaveis,
    freio: { disparou: freioDisparou, proporcao, suprimidas: freioDisparou ? perigosas.length : 0 },
  };
}
```

Esta função é 100% testável sem banco: monta-se um array de objetos literais e verifica-se a saída.

### Pattern 2: Gate de `CRON_SECRET` — o idioma do webhook, adaptado ao `Bearer`

**What:** hash SHA-256 dos dois lados antes de `timingSafeEqual`, com o valor lido por accessor (nunca `const` de módulo).

**When to use:** este é o **terceiro** segredo estático do projeto; a forma já está decidida por precedente.

```typescript
// Fonte: app/api/webhooks/asaas/route.ts:89-96 (tokenValido) + lib/billing/asaas/config.ts:20-30 (obrigatorio)
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Accessor, não `const` de módulo. Um throw no import tornaria impossível testar
 * o caminho de 401 sem configurar o ambiente inteiro — a mesma razão registrada
 * em lib/billing/asaas/config.ts. String vazia é tratada como ausente.
 */
function cronSecret(): string {
  const valor = process.env.CRON_SECRET;
  if (valor === undefined || valor === "") {
    throw new Error("[cron] variável de ambiente ausente: CRON_SECRET");
  }
  return valor;
}

/**
 * `Authorization: Bearer <segredo>` NÃO é uma concessão à Vercel: é o formato que
 * o Vercel Cron envia automaticamente quando a env var CRON_SECRET existe, E é
 * trivialmente reproduzível por `curl -H "Authorization: Bearer $CRON_SECRET"`
 * num crontab. Um header customizado quebraria o primeiro caso e violaria o
 * critério de sucesso #3.
 *
 * Comparar as strings com `===` é proibido: curto-circuita no primeiro byte
 * divergente e vaza o segredo por timing (ASVS V6). O SHA-256 dos dois lados
 * resolve duas coisas: timingSafeEqual exige buffers de mesmo tamanho, e o
 * comprimento do segredo deixa de ser observável.
 */
function segredoValido(authorization: string | null): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;

  const recebido = createHash("sha256").update(authorization.slice(7)).digest();
  const esperado = createHash("sha256").update(cronSecret()).digest();

  return timingSafeEqual(recebido, esperado);
}
```

**Não** rotear isto por `requireAuth`: aquele guard verifica JWT de sessão e, desde a Fase 4, também status de assinatura — um worker que reconcilia assinaturas gateado por status de assinatura seria um impasse, exatamente o mesmo argumento que já está escrito em `lib/api-auth.ts` sobre o webhook do Asaas.

### Pattern 3: Isolamento por linha **com concorrência limitada** (resposta à pergunta de pesquisa #3)

**What:** `Promise.allSettled` sobre **lotes pequenos**, nunca sobre a lista inteira.

**Why:** cada `registrarTransicao` abre uma `$transaction` interativa, que **segura uma conexão do pool do início ao fim**. O pool aqui é o `pg.Pool` do driver adapter, cujo `max` default é **10** [VERIFIED: `node_modules/pg-pool/index.js:89` — `this.options.max = this.options.max || this.options.poolSize || 10`], e `lib/prisma.ts` não passa `max` [VERIFIED: `lib/prisma.ts`]. Simultaneamente, o `maxWait` default de uma transação interativa do Prisma é **2000 ms** e o `timeout` é **5000 ms** [CITED: prisma.io/docs — transações interativas]. Disparar 200 transações de uma vez faz as ~190 excedentes esperarem por conexão; as que passarem de 2 s falham com erro de aquisição de transação. O resultado seria uma resposta cheia de erros artificiais que **não** são falhas de negócio — e, pior, com o freio de segurança tendo já aprovado as escritas.

```typescript
// Fonte: composição — nenhum equivalente existe no projeto hoje (esta fase o introduz)
const CONCORRENCIA = 5; // < pg.Pool max (10), com folga para o resto da aplicação

interface ErroPorEmpresa { empresaId: string; mensagem: string }

async function aplicar(transicoes: Transicao[]) {
  const erros: ErroPorEmpresa[] = [];
  let aplicadas = 0;

  for (let i = 0; i < transicoes.length; i += CONCORRENCIA) {
    const lote = transicoes.slice(i, i + CONCORRENCIA);

    // allSettled e NÃO all: `all` aborta na primeira rejeição e mataria o
    // processamento das demais empresas, violando D-05. allSettled também
    // garante que nenhuma rejeição vire unhandledRejection — toda promise do
    // array é observada.
    const resultados = await Promise.allSettled(
      lote.map((t) =>
        acessoService.registrarTransicao({ ...t, causa: CausaTransicaoAcesso.WORKER_DIARIO })
      )
    );

    resultados.forEach((r, indice) => {
      if (r.status === "rejected") {
        erros.push({
          empresaId: lote[indice].empresaId,
          // Só a mensagem: o objeto de erro do Prisma pode carregar a query e
          // fragmentos de conexão. D-04 pede "sem dado sensível".
          mensagem: r.reason instanceof Error ? r.reason.message : "falha desconhecida",
        });
      } else {
        aplicadas += 1; // ver Achado 1: `null` aqui é no-op legítimo, não erro
      }
    });
  }

  return { aplicadas, erros };
}
```

**Nota de escala:** na prática este laço processa apenas as empresas **com transição pendente** — tipicamente unidades por dia numa base estável. O custo dominante é o `findMany` único, não as escritas. Por isso a alternativa sequencial (`for...of` + `try/catch`) é igualmente defensável; o que **não** é defensável é `Promise.all`/`allSettled` sobre a lista inteira sem limite.

### Pattern 4: Um único `agora` para toda a execução

Já é o precedente do projeto, e o comentário que o justifica está escrito em `scripts/contagem-status-acesso.ts`:

> *"Um único instante para TODAS as avaliações. Se cada empresa lesse o relógio de novo, uma virada de meia-noite no meio do laço colocaria duas empresas com fatos idênticos em status diferentes."* [VERIFIED]

Isso importa mais no worker do que no script: as viradas de status acontecem exatamente na meia-noite de `America/Sao_Paulo` (`meiaNoiteEmSaoPaulo`), e uma execução agendada perto dessa fronteira com relógio relido por empresa produziria um resultado dependente da ordem do `findMany`. Ler `new Date()` **uma vez**, logo após o gate, e passar adiante.

### Anti-Patterns to Avoid

- **Reimplementar a regra em `WHERE` de SQL** (`where: { acessoAte: { lt: agora } }`): a precedência de `acessoVitalicio` (D-03), o trial que sobrevive a um `acessoAte` futuro (D-05), a carência contada do fato que venceu por último e as meias-noites de `America/Sao_Paulo` são quatro chances de a cópia divergir. Decisão travada na Fase 2 e reafirmada em `[04-09]`. Não existe índice nesses campos justamente porque ninguém deve filtrar por eles.
- **Encadear `registrarTransicao` para "passar por" estados intermediários** (`TRIAL → CARENCIA → BLOQUEADO` numa execução): desnecessário (Achado 1) e produz linhas de auditoria de transições que nunca foram observadas.
- **Usar `agendarPosResposta` no worker:** ver Pitfall 4.
- **Ler `ultimoStatusAuditado` como se fosse o status atual:** é bookkeeping do CAS. `avaliarAcesso` decide, `ultimoStatusAuditado` só diz "qual foi a última transição gravada". O gate de grep da Fase 2 já cobre isso e o worker precisa entrar na lista de arquivos autorizados a lê-lo.
- **Colocar o freio dentro de `registrarTransicao` ou de `avaliarAcesso`:** o freio é uma propriedade da execução inteira; empurrá-lo para baixo contamina duas peças que hoje são reusadas por três chamadores.
- **Gravar o resultado do worker numa tabela nova:** D-04 é explícita — o corpo da resposta é a única superfície de observabilidade desta fase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotência entre execuções | Tabela `ExecucaoWorker` / marca d'água "última execução em" | Nada — já é grátis | `avaliarAcesso` é pura em (fatos, agora) e o CAS já torna a reaplicação um no-op (Achado 1). Uma marca d'água **introduz** o bug que pretende evitar: pular um dia passaria a importar |
| Corrida entre duas invocações | Lock distribuído (Redis), advisory lock do Postgres | O CAS de `registrarTransicao` | `updateMany({ where: { ultimoStatusAuditado: anterior } })` já resolve. A Vercel recomenda locks genericamente [CITED: vercel.com/docs/cron-jobs/manage-cron-jobs], mas a recomendação é para jobs não-idempotentes; este é idempotente por construção |
| Comparação de segredo | `segredo === recebido` | `createHash('sha256')` + `timingSafeEqual` | Comparação de string curto-circuita e vaza por timing; o hash também neutraliza o vazamento de comprimento (ASVS V6). Idioma já estabelecido em `app/api/webhooks/asaas/route.ts` |
| Aritmética de datas / carência | Subtração de `Date` no fuso do servidor | `avaliarAcesso` + `meiaNoiteEmSaoPaulo` | O cabeçalho de `lib/fuso-sao-paulo.ts` registra que a versão ingênua erra por 1–2 h nas viradas de DST e passa em 100% dos casos de 2026 — falha invisível até não ser |
| Leitura de env var obrigatória | `process.env.CRON_SECRET ?? ""` | O idioma `obrigatorio()` de `lib/billing/asaas/config.ts` | O projeto já tem dois segredos com coalescência silenciosa para vazio (`JWT_SECRET`, R2) e a Fase 3 registrou isso como defeito a não repetir (T-03-06) |
| Isolamento de falha por linha | `try/catch` gigante em volta do laço | `Promise.allSettled` por lote (ou `try/catch` por item) | Um catch externo aborta o resto — viola D-05 |

**Key insight:** o volume de código realmente novo desta fase é pequeno e quase todo ele é *decisão de lote* (o freio) e *forma da resposta*. Toda tentação de construir infraestrutura de job (ledger de execução, lock, retry, backoff) está resolvendo um problema que a pureza de `avaliarAcesso` já eliminou.

## Duração e limites de execução (resposta à pergunta de pesquisa #1)

| Plataforma | Default | Máximo | Fonte |
|---|---|---|---|
| Vercel Hobby | 300 s | 300 s | [CITED: vercel.com/docs/functions/configuring-functions/duration] |
| Vercel Pro | 300 s | 800 s (1800 s em beta) | idem |
| Vercel Enterprise | 300 s | 800 s (1800 s em beta) | idem |
| VPS / `next start` | sem limite de plataforma | sem limite | por construção |

- `export const maxDuration = N` é lido do **build output** pela plataforma de deploy; o Next documenta o default como *"Set by deployment platform"* [VERIFIED: docs empacotados do Next 16.3.0]. Num VPS a linha simplesmente não faz nada — logo, incluí-la **não** viola a agnosticidade de D-07. Introduzida em `v13.4.10`.
- *"The duration limits for Cron jobs are identical to those of Vercel Functions"* [CITED: vercel.com/docs/cron-jobs/manage-cron-jobs].
- **Dimensionamento realista:** o custo é `1 findMany` + `k` transações, onde `k` é o número de empresas com transição pendente (unidades/dia). Mesmo 10.000 empresas cabem num `findMany` com 6 colunas projetadas em bem menos de um segundo. O ponto de ruptura prático não é o tempo do handler, é **memória do processo** e **tamanho do corpo da resposta** — em 300 s há folga de ordens de grandeza. Conclusão: **um `findMany` sem paginação é adequado para v1**, alinhado com a discrição já concedida em CONTEXT.md e com o precedente de `scripts/contagem-status-acesso.ts`.
- **Se o planner quiser um guard-rail barato:** registrar `maxDuration = 300` no route file e adicionar ao corpo da resposta o campo `duracaoMs`. Com isso a decisão de paginar no futuro passa a ter um número medido em vez de uma estimativa — e é observabilidade que cabe em D-04 sem construir canal novo.
- **Restrição adicional do plano Hobby, relevante se essa for a escolha eventual:** cron só pode rodar **uma vez por dia**, e a invocação acontece em qualquer minuto **dentro da hora** especificada [CITED: vercel.com/docs/cron-jobs/manage-cron-jobs]. Para um worker diário isso é aceitável, mas significa que a hora exata da virada é imprecisa em até 59 min — mais um motivo para o worker jamais assumir "rodei ontem no mesmo horário".

## Common Pitfalls

### Pitfall 1: O freio dispara sempre e o worker vira no-op silencioso
**What goes wrong:** com base pequena, 1 bloqueio legítimo em 4 empresas = 25% > 20%. Nada é aplicado; o critério de sucesso #1 fica falso.
**Why it happens:** o percentual sozinho não tem piso absoluto, e o trial de 14 dias produz coortes que vencem no mesmo dia.
**How to avoid:** exigir `perigosas >= PISO_ABSOLUTO` **além** do percentual (Achado 3). Precisa de confirmação do usuário — Open Question 1.
**Warning signs:** `freio.disparou === true` em execuções consecutivas com `perigosas` de um dígito.

### Pitfall 2: Saturação do pool ao disparar todas as transações de uma vez
**What goes wrong:** `Promise.allSettled(todas.map(...))` com centenas de itens gera erros de aquisição de transação — que aparecem na lista de erros de D-04 como se fossem falhas de negócio.
**Why it happens:** `registrarTransicao` abre uma `$transaction` interativa por empresa, que segura uma conexão; o `pg.Pool` tem `max = 10` por default e o `maxWait` do Prisma é 2000 ms.
**How to avoid:** lotes de ≤5 (Pattern 3), ou laço sequencial.
**Warning signs:** mensagens contendo "connection pool", "Timed out fetching a new connection", ou P2024/P2028 na lista de erros.

### Pitfall 3: Endpoint `POST` (ou header customizado) quebra o critério de sucesso #3
**What goes wrong:** Vercel Cron só faz `GET` e só envia `Authorization: Bearer`. Um `POST`-only ou um `x-cron-secret` obrigaria mudança de código para trocar de plataforma.
**Why it happens:** o instinto de "mutação ⇒ POST" é correto em REST e errado aqui.
**How to avoid:** exportar `GET`. Se o planner quiser também `POST` por higiene semântica, exportar os dois delegando à mesma função — mas `GET` é obrigatório.
**Warning signs:** o job aparece no painel do Vercel com 405.

### Pitfall 4: Usar `agendarPosResposta` e responder antes de as escritas terminarem
**What goes wrong:** o corpo JSON — a **única** superfície de observabilidade autorizada por D-04 — seria serializado antes de as transições terem sido aplicadas, reportando contagens e erros incompletos ou vazios.
**Why it happens:** `agendarPosResposta` é o padrão do projeto para efeitos de auditoria em `revalidarConta`, e a tentação de reusá-lo é alta. O próprio JSDoc dele já menciona o "worker HTTP da Fase 5" [VERIFIED: `lib/agendar-pos-resposta.ts`] — mas menciona no contexto do fallback fora de escopo de request, não como recomendação de uso.
**How to avoid:** o worker **aguarda** todas as escritas antes de montar a resposta. `agendarPosResposta` existe para tirar trabalho do caminho do TTFB de páginas do admin; aqui o trabalho **é** a resposta.
**Warning signs:** resposta 200 instantânea com `aplicadas: 0` mas transições aparecendo no banco depois.

### Pitfall 5: Contar aplicações pelo retorno de `registrarTransicao`
**What goes wrong:** o retorno `null` significa duas coisas distintas (sem transição / perdeu a corrida). Contar `!== null` reporta 0 numa execução concorrente e parece bug.
**How to avoid:** as contagens vêm da lista materializada na passada 1; o retorno só distingue sucesso de exceção. Ver Achado 1.

### Pitfall 6: `BLOQUEADO → CANCELADO` contado como bloqueio novo
**What goes wrong:** um predicado ingênuo (`novo === BLOQUEADO || novo === CANCELADO`) conta empresas que já estavam sem acesso, inflando o percentual e disparando o freio contra o texto explícito de D-02.
**How to avoid:** `perdeAcesso = !acessoBloqueado(anterior) && acessoBloqueado(novo)`, com `anterior === null` tratado como "tinha acesso" (Pattern 1).
**Warning signs:** o freio dispara em execuções onde nenhuma empresa realmente perdeu acesso.

### Pitfall 7: Path com barra final / redirect engolindo a execução
**What goes wrong:** *"Cron jobs do not follow redirects"* — um 308 de normalização de barra final termina o job sem executar nada, e sem erro visível.
**How to avoid:** fixar o path exato no plano e no comando `curl` documentado; testar com `curl -i` observando 200, não 3xx.

### Pitfall 8: `deletedAt` esquecido no `where`
**What goes wrong:** empresas soft-deleted entram no denominador do freio (diluindo-o) e recebem transições de auditoria inúteis. Pior: elas ficaram com `ultimoStatusAuditado = NULL` no backfill da Fase 2 [VERIFIED: `prisma/migrations/20260831193038_add_billing_a_empresa/migration.sql:45-47` — o `UPDATE` tem `WHERE "deletedAt" IS NULL`], então cairiam como transição `null → BLOQUEADO` e seriam contadas como perigosas.
**How to avoid:** `where: { deletedAt: null }`, exatamente como `scripts/contagem-status-acesso.ts`.

### Pitfall 9: Vazar detalhe de infraestrutura na lista de erros
**What goes wrong:** `String(erro)` de um `PrismaClientKnownRequestError` pode conter a query e metadados de conexão. O endpoint é gateado por segredo, mas a resposta acaba em log de terceiro (painel do Vercel, log do GitHub Actions).
**How to avoid:** `erro instanceof Error ? erro.message : "falha desconhecida"`, e nunca o objeto inteiro. D-04 já pede "sem dado sensível".

### Pitfall 10: `avaliarAcesso` é fail-closed para empresa sem nenhum fato
**What goes wrong:** uma empresa com `trialFim` e `acessoAte` ambos nulos retorna `BLOQUEADO` [VERIFIED: `lib/avaliar-acesso.ts:89-91`]. Se algum caminho novo criar empresa sem `trialFim`, o worker a bloqueia no dia seguinte.
**Why it matters here:** hoje isso está protegido — `registerComUsuario` e `empresaService.create` gravam `trialFim` [VERIFIED: `app/services/empresa.service.ts:87,102 e 397,415`], e a invariante INV-1 do gate SQL da Fase 2 afirma que nenhuma empresa ativa fica sem `trialFim`. O worker é o primeiro processo que **aplicaria** essa consequência em massa e sem request. Vale um teste que fixe o comportamento e uma linha no plano reconhecendo que o gate SQL de `prisma/checks/backfill-billing.sql` é a defesa real.

## Code Examples

### Shape completo do handler

```typescript
// app/api/cron/reconciliacao-diaria/route.ts
// Fonte: composição dos padrões de app/api/webhooks/asaas/route.ts (gate + config de rota)
// e de scripts/contagem-status-acesso.ts (findMany + agora único + avaliarAcesso em memória).
import { CausaTransicaoAcesso } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { acessoService } from "@/app/services/acesso.service";
import { planejarReconciliacao } from "@/app/services/reconciliacao.service";

// node:crypto e Prisma exigem runtime Node; Edge não serve. Mesma razão do webhook.
export const runtime = "nodejs";
// Nenhuma resposta deste endpoint pode ser reaproveitada de cache. Em Next 16 o
// default de GET já é dinâmico (mudou em v15.0.0-RC), mas a declaração explícita
// é o idioma do projeto e imuniza contra uma regressão de configuração.
export const dynamic = "force-dynamic";
// Hint lido pela plataforma de deploy a partir do build output. Inerte num VPS.
export const maxDuration = 300;

const PREFIXO = "[cron-reconciliacao]";

export async function GET(request: Request) {
  if (!segredoValido(request.headers.get("authorization"))) {
    // Falha genérica, sem corpo: não revela se o header estava ausente, errado
    // ou com tamanho inesperado (espelha lib/api-auth.ts e o webhook).
    return new Response(null, { status: 401 });
  }

  const inicio = Date.now();
  // UM instante para toda a execução (Pattern 4).
  const agora = new Date();

  const empresas = await prisma.empresa.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      acessoAte: true,
      trialFim: true,
      canceladoEm: true,
      acessoVitalicio: true,
      ultimoStatusAuditado: true,
    },
  });

  const plano = planejarReconciliacao(empresas, agora);

  if (plano.freio.disparou) {
    console.error(
      `${PREFIXO} FREIO DE SEGURANÇA ARMADO — ${plano.perigosas.length} de ` +
        `${plano.avaliadas} empresas perderiam acesso nesta execução. ` +
        `Nenhuma perda de acesso foi aplicada.`
    );
  }

  const { aplicadas, erros } = await aplicar(plano.aplicaveis);

  return Response.json({
    instante: agora.toISOString(),
    duracaoMs: Date.now() - inicio,
    avaliadas: plano.avaliadas,
    transicoesDetectadas: plano.transicoes.length,
    aplicadas,
    freio: {
      disparou: plano.freio.disparou,
      limiar: LIMIAR_DE_BLOQUEIO_EM_MASSA,
      piso: PISO_DE_BLOQUEIO_EM_MASSA,
      perdasDeAcessoDetectadas: plano.perigosas.length,
      perdasDeAcessoSuprimidas: plano.freio.suprimidas,
    },
    erros,
  });
}
```

### Migration do novo valor de enum

```sql
-- prisma/migrations/<timestamp>_add_worker_diario_causa/migration.sql
-- Mesmo padrão que a Fase 3 usou para WEBHOOK_PAGAMENTO.
ALTER TYPE "CausaTransicaoAcesso" ADD VALUE 'WORKER_DIARIO';
```

> **Cuidado operacional:** no Postgres, `ALTER TYPE ... ADD VALUE` historicamente não podia rodar dentro de um bloco de transação (restrição relaxada no PG 12+ desde que o valor novo não seja usado na mesma transação). O Prisma Migrate executa cada migration numa transação. O sintoma, se ocorrer, é um erro `ALTER TYPE ... ADD cannot run inside a transaction block` no `prisma migrate deploy`. A migration da Fase 3 que adicionou `WEBHOOK_PAGAMENTO` é o precedente direto a copiar — **o plano deve mandar o executor abrir aquela migration e replicar sua forma exata**, não escrever uma nova do zero. [ASSUMED — a versão exata do Postgres alvo não foi verificada nesta pesquisa]

### Comando equivalente para crontab de VPS (documentar, não commitar como config)

```bash
# 03:10 UTC todo dia — mesma janela do cron expression sugerido "10 3 * * *"
10 3 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  https://APP_BASE_URL/api/cron/reconciliacao-diaria >> /var/log/reconciliacao.log 2>&1
```

## Runtime State Inventory

Não é uma fase de rename/refactor, mas há estado externo relevante para o deploy:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Nenhuma migração de dados. A única escrita nova é `Empresa.ultimoStatusAuditado` + linhas em `AuditoriaAcesso`, ambas já existentes | nenhuma |
| Live service config | Agendamento no Vercel Cron / crontab / GH Actions — vive **fora** do git por decisão (D-07) | documentar no plano; nada a commitar |
| OS-registered state | Nenhum — verificado: o projeto não registra tarefa de SO hoje | nenhuma |
| Secrets/env vars | `CRON_SECRET` é **nova** e não existe em lugar nenhum do repositório hoje. Não há `.env.example` versionado [VERIFIED: `ls -a` não encontra o arquivo], e STATE.md já registra que o executor não conseguiu editá-lo por permissão de diretório. Também precisa entrar no env do job e2e de `.github/workflows/tests.yml` se houver e2e do worker | gerar segredo ≥ 16 chars (recomendação da Vercel), adicionar ao `.env` local, ao CI e ao painel do host |
| Build artifacts | Prisma Client precisa de `npx prisma generate` após a migration do enum, senão `CausaTransicaoAcesso.WORKER_DIARIO` não existe no tipo gerado e o `tsc` falha | `npx prisma migrate dev` (já roda o generate) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit/component) + Playwright 1.62.1 (e2e) |
| Config file | `vitest.config.mts` / `playwright.config.ts` |
| Quick run command | `npx vitest run app/api/cron app/services/reconciliacao.service.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRK-02 | Sem header `Authorization` → 401, zero queries | unit | `npx vitest run app/api/cron` | ❌ Wave 0 |
| WRK-02 | Segredo errado de **mesmo comprimento** → 401 (prova a não-vacuidade do timing-safe) | unit | idem | ❌ Wave 0 |
| WRK-02 | Segredo errado de comprimento diferente → 401 sem exceção (prova o hash antes do `timingSafeEqual`) | unit | idem | ❌ Wave 0 |
| WRK-02 | Segredo correto via `Bearer` → 200 (prova compatibilidade com Vercel Cron **e** curl) | unit | idem | ❌ Wave 0 |
| WRK-02 | Handler exporta `GET` (não só `POST`) | unit/estático | idem + gate de grep | ❌ Wave 0 |
| WRK-01 | Empresa com trial vencido há 30 dias e `ultimoStatusAuditado = TRIAL` → **uma** chamada `registrarTransicao(TRIAL→BLOQUEADO)`, sem passo intermediário | unit | idem | ❌ Wave 0 |
| WRK-01 | Empresa cujo status derivado == `ultimoStatusAuditado` → **zero** chamadas | unit | idem | ❌ Wave 0 |
| WRK-01 | Rodar o handler duas vezes com o mesmo estado mockado → segunda execução não gera escrita nova | unit | idem | ❌ Wave 0 |
| WRK-01 | Empresa `deletedAt != null` não entra no `where` | unit | idem | ❌ Wave 0 |
| WRK-02/D-01 | 100 empresas, 30 perdendo acesso (30%) → nenhuma transição perigosa aplicada, `freio.disparou = true` | unit (função pura) | `npx vitest run app/services/reconciliacao.service.test.ts` | ❌ Wave 0 |
| D-03 | Mesmo cenário: as transições `TRIAL→CARENCIA` **continuam** sendo aplicadas | unit (função pura) | idem | ❌ Wave 0 |
| D-02 | Empresa `BLOQUEADO→CANCELADO` **não** conta no numerador | unit (função pura) | idem | ❌ Wave 0 |
| D-02 | Empresas já bloqueadas antes da execução não contam | unit (função pura) | idem | ❌ Wave 0 |
| D-05 | 3 empresas, a do meio rejeita → as outras 2 são aplicadas e o erro entra em `erros[]` | unit | `npx vitest run app/api/cron` | ❌ Wave 0 |
| D-04 | Corpo da resposta contém `avaliadas`, `aplicadas`, `freio.disparou`, `erros[]` com `empresaId` + `mensagem` | unit | idem | ❌ Wave 0 |
| D-04 | Mensagem de erro é `error.message`, nunca o objeto serializado | unit | idem | ❌ Wave 0 |
| WRK-01 | End-to-end: empresa semeada com transição **pendente** vira bloqueada após uma chamada ao endpoint | e2e (Postgres real) | `npm run test:e2e -- worker` | ❌ Wave 0 — **bloqueado pelo Achado 4** |

### Como testar sem Postgres real (resposta à pergunta de pesquisa #6)

O shape existe e é barato. `tests/setup/prisma-mock.ts` já publica um `prismaMock` deep-mockado globalmente e o reseta a cada teste [VERIFIED]. Para o handler:

```typescript
// app/api/cron/reconciliacao-diaria/route.test.ts
// @vitest-environment node          ← obrigatório: o default do projeto é jsdom,
//                                      e node:crypto/Request se comportam melhor
//                                      em ambiente node (precedente: webhook do Asaas)
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest } from "@/tests/helpers/request";

// Mockar o SERVICE, não o Prisma, para as asserções de "quem foi transicionado":
// deixa a asserção legível ("registrarTransicao foi chamado com estes N argumentos")
// e evita depender do shape interno do $transaction.
vi.mock("@/app/services/acesso.service", () => ({
  acessoService: { registrarTransicao: vi.fn() },
}));

const { GET } = await import("./route");
const { acessoService } = await import("@/app/services/acesso.service");
const { prismaMock } = await import("@/tests/setup/prisma-mock");

const SEGREDO = "a".repeat(32);

function empresa(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    acessoAte: null,
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
    ultimoStatusAuditado: "TRIAL",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SEGREDO);
  vi.mocked(acessoService.registrarTransicao).mockResolvedValue(null as never);
});

function requisicao(segredo: string | null = SEGREDO) {
  return buildRequest({
    method: "GET",
    url: "http://localhost/api/cron/reconciliacao-diaria",
    headers: segredo ? { authorization: `Bearer ${segredo}` } : {},
  });
}

describe("freio de bloqueio em massa (D-01)", () => {
  it("30% perdendo acesso: nenhuma perda aplicada, mas CARENCIA passa (D-03)", async () => {
    // 30 empresas com trial vencido há muito (→ BLOQUEADO), 10 recém-vencidas
    // (→ CARENCIA), 60 em dia. Fatos derivados de `agora`, nunca literais fixos —
    // o mesmo motivo documentado em scripts/seed-fatos-billing.ts.
    prismaMock.empresa.findMany.mockResolvedValue(/* 100 empresas */ [] as never);

    const resposta = await GET(requisicao());
    const corpo = await resposta.json();

    expect(corpo.freio.disparou).toBe(true);
    expect(corpo.freio.perdasDeAcessoSuprimidas).toBe(30);
    // Não-vacuidade: a asserção que importa é que as 10 de CARENCIA passaram.
    expect(acessoService.registrarTransicao).toHaveBeenCalledTimes(10);
  });
});
```

**Pontos que o planner deve fixar no plano:**
- **`// @vitest-environment node` no topo** do `route.test.ts` — precedente direto em `app/api/webhooks/asaas/route.test.ts:1`.
- **Fixtures relativas a `agora`, nunca datas literais** — o motivo está escrito em `scripts/seed-fatos-billing.ts` ("uma fixture com data escrita à mão passa hoje e vira 'bloqueado' sozinha daqui a um mês"). Onde a virada exata importar, usar `vi.setSystemTime()`; note que `tests/setup/prisma-mock.ts` avisa que vários testes já usam fake timers, então o stub default é um literal fixo de propósito.
- **Não-vacuidade dos testes do freio:** cada teste do freio precisa de um par — o cenário logo ABAIXO do limiar (que aplica) e o logo ACIMA (que suprime). Um teste só acima passa com um freio que sempre dispara.
- **Teste de bordas do denominador:** 0 empresas (divisão por zero), e o cenário do Achado 3 (base pequena) — este último documenta o comportamento escolhido em Open Question 1.

### O que exige Postgres real (e o que não exige)

**Não exige:** o gate de segredo, o freio, o isolamento de erro, o formato da resposta e a ausência de chaining. Tudo isso é função pura ou mock.

**Exige Postgres real, mas já está coberto por outra fase:** a atomicidade do CAS (`updateMany` condicional + `create`) foi provada nos testes da Fase 2. Esta fase não a modifica e não precisa reprová-la.

**Exige Postgres real e NÃO está coberto:** o e2e de WRK-01 ponta a ponta. E ele está **bloqueado pelo Achado 4** — `scripts/seed-fatos-billing.ts` alinha `ultimoStatusAuditado` e por isso não consegue produzir uma transição pendente. Wave 0 precisa da tarefa de estender o script.

### Sampling Rate
- **Per task commit:** `npx vitest run app/api/cron app/services/reconciliacao.service.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` + `npm run test:e2e` + `npx tsc --noEmit` + `npm run lint` verdes antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `app/services/reconciliacao.service.ts` (ou equivalente) — a parte **pura** do planejamento, para o freio ser testável sem Prisma
- [ ] `app/services/reconciliacao.service.test.ts` — cobre D-01, D-02, D-03
- [ ] `app/api/cron/reconciliacao-diaria/route.ts` + `route.test.ts` — cobre WRK-02, D-04, D-05
- [ ] `lib/billing/cron-config.ts` (ou nova função em `lib/billing/asaas/config.ts`) — `cronSecret()` no idioma `obrigatorio()`
- [ ] Migration `ALTER TYPE "CausaTransicaoAcesso" ADD VALUE 'WORKER_DIARIO'` (replicar a forma da migration de `WEBHOOK_PAGAMENTO`)
- [ ] **Extensão de `scripts/seed-fatos-billing.ts`** para permitir `ultimoStatusAuditado` desalinhado — sem isso não há e2e não-vácuo (Achado 4)
- [ ] `CRON_SECRET` no env do job e2e de `.github/workflows/tests.yml`
- [ ] Adicionar o novo arquivo à lista de arquivos autorizados a ler `ultimoStatusAuditado` no gate de grep da Fase 2 (senão o gate fica vermelho)
- [ ] Gate de grep novo: `x-vercel-cron` / `vercel-cron` / `@vercel/functions` ausentes de `app/` (prova executável do critério #3), seguindo o padrão de `scripts/gates-fase-04.mjs`

## Security Domain

### Applicable ASVS Categories (nível 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sim | Segredo estático de máquina (`CRON_SECRET`), ≥16 chars aleatórios. Não é sessão de usuário — `requireAuth` é deliberadamente contornado, como no webhook do Asaas |
| V3 Session Management | não | Sem sessão, sem cookie, sem estado |
| V4 Access Control | sim | Endpoint é all-or-nothing: sem segredo, 401 sem corpo. Não há noção de tenant aqui — o worker opera sobre a base inteira por definição, e é o **único** caminho do sistema que legitimamente cruza `empresaId`. Isso merece um comentário normativo no arquivo, senão parece violação de C-07 |
| V5 Input Validation | mínimo | Não há corpo nem query param a validar. **Não introduzir parâmetros** (ex.: `?empresaId=`, `?dryRun=true`): cada um vira superfície de ataque atrás de um único segredo compartilhado |
| V6 Cryptography | sim | `createHash('sha256')` + `timingSafeEqual`. Nunca `===`. Nunca logar o segredo |
| V7 Error Handling & Logging | sim | Erro por empresa vira `error.message` na resposta, nunca o objeto. Nenhum erro de uma empresa derruba a execução (D-05) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Timing attack no segredo | Information Disclosure | Hash SHA-256 dos dois lados + `timingSafeEqual` (Pattern 2) |
| Vazamento do comprimento do segredo | Information Disclosure | O hash normaliza tudo para 32 bytes |
| Bloqueio em massa induzido (bug de fuso, corrupção de dados, relógio errado do host) | Denial of Service (auto-infligido) | O freio de D-01 é exatamente esta mitigação. Note que ele **não** protege contra um relógio adiantado que empurre a base para `CARENCIA` — só perdas de acesso são freadas |
| DoS por invocação repetida do endpoint público | Denial of Service | Gate de segredo + idempotência (execuções extras não escrevem nada após a primeira). O custo residual é o `findMany`; se virar preocupação real, é caso de rate limit na borda, não nesta fase |
| Enumeração via diferença de resposta 401 | Information Disclosure | 401 com corpo vazio e mensagem única, espelhando `lib/api-auth.ts` |
| Segredo vazado em log de terceiro | Information Disclosure | Nunca incluir o header ou o segredo em `console.error`; o prefixo `[cron-reconciliacao]` sem payload |
| Segredo ausente em produção → endpoint quebrado ou aberto | Spoofing | `cronSecret()` **lança** quando ausente (fail-closed): a exceção vira 500, nunca 200. A coalescência para `""` seria fail-open e é o defeito que a Fase 3 registrou não repetir |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cron in-process (`node-cron`) | Endpoint HTTP + agendador da plataforma | ~2023, com a generalização de serverless | O padrão in-process é incompatível com serverless e amarra a arquitetura ao hosting; o Next lista `node-cron` em `serverExternalPackages` exatamente por causa do bundling |
| GET Route Handler cacheado por default | GET dinâmico por default | Next `v15.0.0-RC` [VERIFIED: `node_modules/next/dist/docs/.../route.md` § Version History] | Em Next 16.3.0 um GET não é cacheado sem opt-in. `dynamic = "force-dynamic"` continua sendo boa higiene explícita, mas não é mais o que salva o worker |
| `export const dynamic` / `revalidate` / `fetchCache` | Removidos quando Cache Components está habilitado | Next `v16.0.0` [VERIFIED: docs empacotados] | **Não afeta este projeto**: `next.config.ts` não habilita `cacheComponents` [VERIFIED]. Se alguém habilitar no futuro, o `dynamic` do webhook do Asaas quebra junto — nota para o futuro, não para esta fase |
| Lock distribuído para todo cron | Idempotência/reconciliação como default, lock só para jobs não-idempotentes | doc atual da Vercel | *"Design your operations to be idempotent and reconciliation-based so each run can safely reprocess outstanding work"* — é literalmente a descrição deste worker |

**Deprecated/outdated:**
- `export const runtime = "edge"` está marcado deprecated nos docs do Next 16 empacotados. Irrelevante aqui: o worker precisa de `nodejs` por causa de `node:crypto` e Prisma.

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **AGENTS.md:** "This is NOT the Next.js you know" — consultar `node_modules/next/dist/docs/` antes de escrever código de Next. Feito nesta pesquisa para `maxDuration`, route segment config e caching de GET; os achados estão marcados `[VERIFIED]`.
- **CLAUDE.md § Constraints:** não armazenar dado de pagamento. Respeitado por construção — o worker não toca em nada do gateway (D-06).
- **CLAUDE.md § Constraints:** respeitar o isolamento multi-tenant `empresaId`. O worker é a exceção legítima (opera sobre todos os tenants por definição) e precisa de comentário normativo dizendo isso, para não parecer regressão de C-07.
- **CLAUDE.md § Constraints:** o escopo do worker deve rodar de forma confiável mesmo sem hosting definido — atendido por D-07 + Achado 2.
- **CLAUDE.md § Conventions:** imports por `@/`; services como singleton exportado; `select` explícito no Prisma (nunca `include`); `console.error` para exceções; nomes de arquivo `[entity].service.ts` com teste co-locado.
- **CLAUDE.md § Conventions:** erros de negócio usam `HttpError`/`AuthError` com `.status`. A resposta de sucesso-com-detalhes de D-04 **não** é um erro e não deve ser forçada nesse formato — CONTEXT.md § Established Patterns já registra isso.
- **CLAUDE.md § GSD Workflow Enforcement:** edições só via comando GSD.
- **Skills disponíveis e relevantes:** `prisma-cli` (para a migration do enum), `prisma-client-api` (referência de `$transaction` / `transactionOptions`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Um piso absoluto (≈5) somado ao percentual de 20% é o comportamento desejado do freio | Achado 3, Pattern 1, Open Question 1 | Sem confirmação, ou o worker nunca bloqueia (piso ausente) ou o freio deixa passar um incidente pequeno-mas-real (piso alto demais). **Precisa de decisão do usuário** |
| A2 | `ALTER TYPE ... ADD VALUE` pode precisar de tratamento especial fora de transação, dependendo da versão do Postgres alvo | Code Examples | `prisma migrate deploy` falha em produção. Mitigado ao mandar replicar a migration de `WEBHOOK_PAGAMENTO`, que já rodou com sucesso |
| A3 | A base atual de empresas é pequena o bastante para um `findMany` sem paginação ser adequado | Duração e limites | Se a base for muito maior que o presumido, memória e tamanho da resposta viram problema. Barato de descobrir: `npm run acesso:contagem` já imprime o TOTAL |
| A4 | O `pg.Pool` continuará com `max = 10` (default), já que `lib/prisma.ts` não o configura e D-07 adia o sizing | Pattern 3, Pitfall 2 | Se o pool for reduzido no deploy, `CONCORRENCIA = 5` pode ainda saturar. Mitigado: a alternativa sequencial é sempre segura |
| A5 | A ausência de dreno da fila `processadoEm IS NULL` é aceitável ao usuário depois desta fase | Achado 5 | Um cliente que pagou e cujo webhook falhou fica bloqueado indefinidamente, contrariando o que três lugares do código prometem |
| A6 | O e2e do worker vale o custo de estender `seed-fatos-billing.ts` | Achado 4, Wave 0 | Se o planner descartar o e2e, WRK-01 fica provado só por unidade com Prisma mockado — aceitável, mas deve ser uma escolha explícita, não um esquecimento |

## Open Questions

1. **O freio de 20% precisa de um piso absoluto?**
   - What we know: D-01 fixa 20% sobre as empresas avaliadas. A aritmética mostra que bases pequenas disparam o freio com 1 único bloqueio legítimo (Achado 3), tornando o worker um no-op silencioso — o que derrota o critério de sucesso #1.
   - What's unclear: o usuário aceita `perigosas >= PISO && proporcao > 20%`? Qual piso?
   - Recommendation: **levar ao usuário antes de planejar**. Recomendação técnica: `PISO_DE_BLOQUEIO_EM_MASSA = 5`, constante nomeada e exportada, com o valor e a justificativa no JSDoc. Preserva integralmente a intenção de D-01 (impedir a base inteira de cair de uma vez) sem paralisar o worker na fase inicial do produto. Se o usuário preferir manter D-01 literal, o plano deve pelo menos incluir o campo `freio.perdasDeAcessoSuprimidas` na resposta e uma linha em STATE.md registrando o risco conhecido.

2. **A fila `processadoEm IS NULL` fica realmente sem dreno?**
   - What we know: D-06 escopa fora; o schema, os testes da Fase 3 e o STATE.md prometem que a Fase 5 drenaria. Drenar exige `webhookAsaasService.processar`, que re-busca no Asaas — logo é incompatível com D-06 como escrito.
   - What's unclear: o usuário tinha esse acoplamento em mente ao decidir D-06?
   - Recommendation: manter D-06 (é a decisão mais recente e é do usuário), mas o plano deve incluir uma tarefa de **anotar o débito** — atualizar o comentário do schema e/ou registrar em STATE.md § Blockers que a fila de retrabalho segue sem dreno e passa a ser candidata a fase futura.

3. **`GET` sozinho, ou `GET` + `POST`?**
   - What we know: `GET` é obrigatório (Vercel Cron). `POST` é semanticamente mais correto para uma mutação e é o que um crontab usaria por instinto.
   - What's unclear: só preferência.
   - Recommendation: exportar `GET` e, opcionalmente, `POST` delegando ao mesmo corpo. O custo é uma linha; o benefício é que ninguém "consertar" o GET para POST no futuro e quebrar o Vercel Cron. Se optar por só `GET`, escrever no JSDoc **por que** um GET muta estado aqui — senão vira alvo de refactor bem-intencionado.

4. **Qual horário agendar?**
   - What we know: as viradas de status acontecem à meia-noite de `America/Sao_Paulo`; o Vercel Cron interpreta cron expressions **sempre em UTC** [CITED: vercel.com/docs/cron-jobs]; no plano Hobby a invocação pode cair em qualquer minuto da hora.
   - Recommendation: agendar com folga confortável depois da virada local (ex.: `10 3 * * *` UTC = 00:10 em São Paulo no horário padrão), **e não depender do horário**: a corretude vem de `avaliarAcesso(fatos, agora)`, não do instante do agendamento. Isso é documentação, não código.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime do handler e dos testes | ✓ | v25.9.0 local (CI usa 22) | — |
| PostgreSQL | `findMany` + CAS | ✓ (CI provisiona service container; local via `DATABASE_URL`) | 16 (imagem do CI) | — |
| `npx prisma` | migration do enum | ✓ | 7.9.1 | — |
| Vitest | testes de unidade | ✓ | 4.1.10 | — |
| Playwright | e2e | ✓ | 1.62.1 | e2e pode ser descartado se o Achado 4 não for resolvido — mas então WRK-01 fica sem prova de integração |
| `CRON_SECRET` | gate do endpoint | ✗ | — | **Sem fallback** — variável nova, precisa ser criada em `.env`, no CI e no host |
| `vercel.json` | agendamento na Vercel | ✗ (ausente por decisão) | — | Deliberado: D-07. Não criar |
| `.env.example` | documentar a variável nova | ✗ (não existe no repo) | — | STATE.md já registra pendência de permissão nesse arquivo; documentar a variável no JSDoc do `cronSecret()` e no plano |

**Missing dependencies with no fallback:**
- `CRON_SECRET` — tarefa explícita de Wave 0 (gerar, `.env` local, env do job e2e em `.github/workflows/tests.yml`, e o painel do host quando o deploy acontecer).

**Missing dependencies with fallback:**
- `vercel.json` — ausência é a escolha correta (D-07); o agendamento é documentado, não commitado.

## Sources

### Primary (HIGH confidence)
- Código do próprio repositório, lido diretamente nesta sessão: `lib/avaliar-acesso.ts`, `app/services/acesso.service.ts`, `lib/auth-guard.ts`, `lib/api-auth.ts`, `lib/prisma.ts`, `lib/agendar-pos-resposta.ts`, `lib/fuso-sao-paulo.ts`, `app/api/webhooks/asaas/route.ts` (+ `route.test.ts`), `app/services/empresa.service.ts`, `lib/billing/asaas/config.ts`, `prisma/schema.prisma`, `prisma/migrations/20260831193038_add_billing_a_empresa/migration.sql`, `scripts/contagem-status-acesso.ts`, `scripts/seed-fatos-billing.ts`, `scripts/gates-fase-04.mjs`, `tests/setup/prisma-mock.ts`, `tests/setup/vitest.setup.ts`, `tests/helpers/request.ts`, `e2e/bloqueio-por-inadimplencia.spec.ts`, `vitest.config.mts`, `playwright.config.ts`, `next.config.ts`, `package.json`, `.github/workflows/tests.yml`
- Docs empacotados do Next 16.3.0 (`node_modules/next/dist/docs/`) — `maxDuration.md`, `02-route-segment-config/index.md`, `route.md` (Version History), `serverExternalPackages.md`
- `node_modules/pg-pool/index.js:89` — default `max = 10` do pool

### Secondary (MEDIUM confidence)
- vercel.com/docs/cron-jobs — método GET, user-agent, header de schedule, UTC
- vercel.com/docs/cron-jobs/manage-cron-jobs — `CRON_SECRET` / `Authorization: Bearer`, best-effort delivery, sem retry, sem redirect, concorrência, limites do plano Hobby
- vercel.com/docs/functions/configuring-functions/duration — tabela de defaults/máximos por plano
- vercel.com/docs/functions/runtimes — características gerais do runtime Node
- prisma.io / issues do repositório prisma — defaults de `maxWait` (2000 ms) e `timeout` (5000 ms) de transação interativa; orientação de chunking em vez de `Promise.all` irrestrito

### Tertiary (LOW confidence)
- Posts de comunidade sobre securing Vercel cron routes (dev.to, chrisnowicki.dev, techulus.xyz) — usados apenas como confirmação cruzada do padrão `Bearer`, que já vem da doc oficial

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — nenhuma dependência nova; tudo lido no `package.json` e no código
- Architecture: **HIGH** — o shape de duas passadas deriva diretamente da pureza de `avaliarAcesso` e do CAS já implementado, ambos lidos linha a linha
- Pitfalls: **HIGH** para os internos (1, 4, 5, 6, 8, 10 — todos ancorados em código lido); **MEDIUM** para os de plataforma (2, 3, 7 — docs oficiais da Vercel, mas a plataforma ainda não foi escolhida)
- Limites de duração: **MEDIUM** — doc oficial, porém a plataforma final é indefinida por D-07
- Prova de idempotência (WRK-01): **HIGH** — derivada do código, não de documentação externa

**Research date:** 2026-09-01
**Valid until:** 2026-10-01 (30 dias). Os achados internos ao repositório não expiram; os limites da Vercel (duração, plano Hobby) mudam algumas vezes por ano e devem ser reconferidos no momento da decisão real de hosting.
