# Phase 5: Worker Diário de Reconciliação - Context

**Gathered:** 2026-09-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Um endpoint protegido, chamado uma vez por dia por um agendador externo (Vercel Cron, crontab de VPS, ou qualquer outro), que reavalia o status de acesso de toda empresa e aplica as transições de estado que dependem só da passagem do tempo (trial vence, carência começa, carência vence e vira bloqueio) — sem depender de nenhum login ou request autenticado daquela empresa. Cobre WRK-01 e WRK-02.

O motor de decisão (`avaliarAcesso`), o compare-and-swap de auditoria (`acessoService.registrarTransicao`) e o enforcement de bloqueio (Fase 4) já existem e são reaproveitados sem modificação. Este trabalho é: o loop diário sobre todas as empresas, o gate de autenticação por segredo estático, o freio de segurança contra bloqueio em massa, e a superfície de observabilidade (resposta HTTP detalhada).

Fora do escopo: qualquer chamada à API do Asaas (o worker não reconcilia com o gateway — só reavalia fatos já salvos no banco), escolha definitiva de onde hospedar/agendar em produção (fica para quando o deploy real acontecer), e qualquer UI (esta fase não tem superfície visual).

</domain>

<decisions>
## Implementation Decisions

### Freio de segurança contra bloqueio em massa (WRK-02)
- **D-01 (revisado após pesquisa):** O worker tem um limiar de segurança **composto**: o freio só dispara se, na mesma execução, **mais de 20%** das empresas avaliadas resultariam em transição para `BLOQUEADO`/`CANCELADO` **E** esse número absoluto for **pelo menos 5 empresas**. As duas condições precisam ser verdadeiras juntas. Motivo: a pesquisa mostrou que com a base atual (poucas dezenas de empresas), 20% sozinho dispara o freio quase sempre e deixa o worker incapaz de bloquear qualquer coisa de verdade — o piso absoluto evita isso sem abrir mão da proteção quando a base crescer. Quando o freio dispara, o worker **não aplica nenhuma** transição para bloqueio dessa leva, loga a anomalia e devolve isso de forma clara na resposta HTTP.
- **D-02:** O limiar (20% + piso de 5, D-01) é sobre transições *para* `BLOQUEADO`/`CANCELADO` nesta execução específica, não sobre o total de empresas já bloqueadas na base. Empresas que já estavam bloqueadas antes desta execução não contam para o cálculo (não é uma transição nova).
- **D-03:** Quando o freio dispara, as demais transições que **não** são para bloqueio (ex: empresas saindo de `TRIAL` para `CARENCIA`, ou sendo reativadas) continuam sendo aplicadas normalmente — o freio é específico para a classe de transição perigosa (perda de acesso em massa), não uma parada total do worker.

### Sinalização de anomalias (critério de sucesso #4)
- **D-04:** O endpoint devolve um corpo de resposta JSON detalhado: contagem de empresas processadas, contagem de sucesso, lista de erros por empresa (id + mensagem, sem dado sensível), e se o freio de segurança disparou. Nenhum canal de notificação novo (e-mail, Slack, etc.) é construído nesta fase — quem agendar a execução (painel do Vercel Cron, log de Actions, etc.) já mostra essa resposta no histórico de execuções.
- **D-05:** Uma falha ao processar uma empresa específica (ex: erro de banco pontual) não aborta o processamento das demais — cada empresa é isolada (padrão `Promise.allSettled` ou equivalente, que não existe ainda no projeto e é introduzido por esta fase). O erro daquela empresa entra na lista de erros da resposta.

### Escopo: só fatos locais, sem chamar o Asaas (WRK-01)
- **D-06:** O worker **não** chama a API do Asaas. Ele reavalia exclusivamente os 4 fatos de billing já salvos na `Empresa` (`acessoAte`, `trialFim`, `canceladoEm`, `acessoVitalicio`) via `avaliarAcesso`, exatamente como `revalidarConta` já faz por request — a diferença é que o worker cobre empresas que não fazem nenhum request autenticado. Reconciliação ativa com o gateway (puxar assinaturas do Asaas para pegar webhooks perdidos) fica fora de escopo — pode virar uma fase futura se a experiência em produção mostrar que falta.

### Hosting/scheduler (bloqueador de pesquisa do roadmap, resolvido)
- **D-07:** Nenhuma decisão de hosting é tomada nesta fase. O endpoint é agnóstico de plataforma por construção (critério de sucesso #3 já exige isso) — funciona atrás de qualquer chamador HTTP que envie o segredo correto, seja Vercel Cron, GitHub Actions, ou crontab de VPS com `curl`. A escolha de onde hospedar de fato fica para quando o deploy em produção acontecer. Isso também significa que o dimensionamento do pool do Prisma (mencionado como bloqueador nas Fases 1/3) continua adiado — não é resolvido aqui.

### Resolvidas pela pesquisa (não são mais discrição livre)
- **D-08:** O endpoint é **`GET`** (não `POST`), autenticado via **`Authorization: Bearer $CRON_SECRET`**. Vercel Cron dispara exclusivamente `GET` e já envia `Authorization: Bearer` automaticamente com o valor configurado — qualquer outro método/header quebraria o critério de sucesso #3 (funcionar atrás de Vercel Cron sem mudança de código) na primeira das duas plataformas candidatas, e `Bearer` continua trivial de reproduzir por `curl` num crontab de VPS. Comparação continua time-safe (padrão do webhook do Asaas).
- **D-09:** O worker **não** encadeia múltiplas chamadas a `registrarTransicao` por empresa nem mantém nenhum "checkpoint"/ledger de execução própria. `avaliarAcesso(fatos, agora)` já é puro e determinístico — uma empresa não avaliada há 30 dias produz o status final correto numa única chamada, e o compare-and-swap de `registrarTransicao` (que só grava a partir do `ultimoStatusAuditado` atual) já garante que "rodar duas vezes/pular um dia" convirja (critério de sucesso #2) sem nenhuma lógica nova de idempotência.
- **D-10 (débito documentado, não resolvido nesta fase):** `STATE.md`, `prisma/schema.prisma` e `webhook-asaas.service.test.ts` contêm comentários/expectativas de que a Fase 5 drenaria a fila de eventos `EventoWebhookAsaas` com `processadoEm IS NULL` (mencionado no 03-07-SUMMARY). D-06 desta fase (worker só reavalia fatos locais, não toca em eventos de webhook) revoga essa expectativa. O plano deve **atualizar esses comentários/expectativas órfãs** para não deixar uma promessa não cumprida documentada em três lugares — não implica drenar a fila de fato.

### Claude's Discretion
- Nome exato do endpoint (ex: `GET /api/cron/worker-diario`) — seguir a convenção de rotas já usada no projeto.
- Estratégia de paginação/lote do `findMany` sobre `Empresa` — não existe precedente de paginação no projeto hoje (confirmado no scout); dado que não há evidência de escala de produção que exija isso, um único `findMany` sem paginação (mesmo padrão de `scripts/contagem-status-acesso.ts`) é aceitável para v1, mas o planner pode decidir por paginação por cursor se preferir robustez.
- Nome exato do valor novo no enum `CausaTransicaoAcesso` (`WORKER_DIARIO`, já sugerido no roadmap e reservado desde a Fase 2 D-14) e a migration que o introduz.
- Tamanho do lote de concorrência ao aplicar as transições não-perigosas (a pesquisa recomenda lotes pequenos, ex. ≤5 por vez, ou laço sequencial — o pool do Postgres tem `max: 10` por padrão e não é dimensionado nesta fase) — desde que `Promise.allSettled` (ou equivalente) isole falha por empresa sem esgotar o pool de conexões.
- Exato shape da lógica de duas passadas (calcular todas as transições em memória primeiro, decidir se o freio dispara, só então persistir) — desde que nenhuma chamada dupla e redundante a `avaliarAcesso` por empresa nem transação gigante aberta por todo o scan aconteçam.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/ROADMAP.md` §"Phase 5: Worker Diário de Reconciliação" — goal e 4 success criteria.
- `.planning/REQUIREMENTS.md` §WRK-01, WRK-02 — texto completo.
- `.planning/PROJECT.md` §"Active" — worker diário como rede de segurança, não autoridade.

### Pontos de extensão já preparados
- `lib/avaliar-acesso.ts` — `avaliarAcesso(fatos, agora)`, função pura, relógio injetado; o worker chama isso por empresa com um único `agora` compartilhado para toda a execução.
- `app/services/acesso.service.ts` (`registrarTransicao`) — compare-and-swap já genérico o suficiente para ser reusado como está, só passando `causa: CausaTransicaoAcesso.WORKER_DIARIO` (novo valor). Confirma por si só as garantias de "rodar duas vezes/pular um dia" (critério de sucesso #2): a CAS torna uma segunda aplicação da mesma transição um no-op.
- `prisma/schema.prisma` — enum `CausaTransicaoAcesso` (hoje: `REGISTRO`, `BACKFILL`, `AVALIACAO_SESSAO`, `WEBHOOK_PAGAMENTO`); `WORKER_DIARIO` não existe, precisa de migration própria (mesmo padrão que a Fase 3 usou para `WEBHOOK_PAGAMENTO`).
- `app/api/webhooks/asaas/route.ts` — padrão de comparação time-safe de segredo (hash SHA-256 dos dois lados antes de `timingSafeEqual`, para não vazar tamanho do segredo nem quebrar em tamanhos diferentes) — é o análogo direto para o gate de `CRON_SECRET`.
- `lib/billing/asaas/config.ts` (`obrigatorio`) — padrão de leitura de env var obrigatória, sem fallback silencioso para vazio, lido por accessor (não `const` de módulo) para não travar testes. `CRON_SECRET` deve seguir o mesmo idioma.
- `.planning/phases/02-modelo-de-dados-e-motor-de-acesso/02-CONTEXT.md` §D-14 — decisão original de não pré-criar `WORKER_DIARIO` até esta fase existir de verdade.
- `.planning/phases/04-aplica-o-do-bloqueio/04-RESEARCH.md` §Achado crítico 5 — a Fase 4 já provou que o bloqueio é imediato e retroativo; o freio de 20% (D-01) desta fase é a rede de segurança estrutural para o mesmo risco, agora sem checkpoint humano manual porque roda todo dia sem supervisão.

### Ausências confirmadas (para o planner não perder tempo procurando)
- Não existe `Promise.allSettled` nem qualquer padrão de "iterar todas as linhas isolando falha por linha" no projeto hoje — esta fase introduz o primeiro.
- Não existe índice em `acessoAte`/`trialFim`/`canceladoEm`/`acessoVitalicio`/`ultimoStatusAuditado` — o scan é necessariamente em memória via `avaliarAcesso`, nunca em `WHERE` (decisão já travada na Fase 2: reescrever a aritmética em SQL diverge da fonte da verdade).
- Não existe `CRON_SECRET` em nenhum lugar do código ou de `.env` hoje — variável nova.
- Não existe `.env.example` no repositório (nota para a Fase 3 pendente: adicionar as variáveis do Asaas lá também, se for tocar nesse arquivo por outro motivo).
- Não existe paginação (`take`/`skip`/`cursor`) em nenhum service do projeto hoje.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `avaliarAcesso` e `registrarTransicao` são reaproveitados sem nenhuma modificação — o worker é inteiramente "fiação", igual a Fase 4 foi para o enforcement.
- Padrão de comparação time-safe do webhook (`app/api/webhooks/asaas/route.ts`) é o modelo para o gate de `CRON_SECRET`.

### Established Patterns
- Rotas de API seguem `app/api/**/route.ts`; nenhuma rota de cron existe ainda — path sugerido pelo roadmap/requisitos é algo como `app/api/cron/**` ou `app/api/worker/**` (Claude's Discretion no nome exato).
- Erros seguem `HttpError`/`AuthError` com `.status`; a resposta detalhada de anomalias (D-04) é um formato novo de corpo de sucesso-com-detalhes, não um erro — não forçar no formato de erro existente.

### Integration Points
- `prisma/schema.prisma` — nova migration adicionando `WORKER_DIARIO` ao enum `CausaTransicaoAcesso`.
- Novo endpoint `app/api/**/route.ts` — ponto único que orquestra o loop diário, chama `avaliarAcesso` + `registrarTransicao` por empresa, e aplica o freio de 20% (D-01) antes de comitar as transições de bloqueio.

</code_context>

<specifics>
## Specific Ideas

- Limiar do freio de segurança: 20% de transições novas para BLOQUEADO/CANCELADO na mesma execução (D-01/D-02).
- Resposta HTTP como único canal de observabilidade nesta fase — sem e-mail/Slack (D-04).

</specifics>

<deferred>
## Deferred Ideas

- Reconciliação ativa com a API do Asaas (puxar assinaturas para pegar webhooks perdidos) — descartada para esta fase (D-06); poderia voltar se a experiência em produção mostrar webhooks perdidos com frequência.
- Canal de notificação ativa (e-mail/Slack/webhook) para anomalias — descartado para esta fase (D-04); a resposta HTTP + log do agendador é suficiente por ora.
- Decisão definitiva de hosting/scheduler e dimensionamento do pool do Prisma — adiada para a fase de deploy real (D-07), não esta fase.

</deferred>

---

*Phase: 5-Worker Diário de Reconciliação*
*Context gathered: 2026-09-01*
