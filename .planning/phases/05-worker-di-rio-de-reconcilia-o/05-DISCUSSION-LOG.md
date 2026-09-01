# Phase 5: Worker Diário de Reconciliação - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-01
**Phase:** 05-Worker Diário de Reconciliação
**Areas discussed:** Freio de massa, Sinalização, Escopo worker, Limiar, Hosting

---

## Freio de massa

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, com limiar de segurança | Se mais que um percentual das empresas fosse bloqueada na mesma execução, o worker aborta as escritas dessa leva e não aplica nada até revisão manual. | ✓ |
| Não, aplicar sempre | O worker confia cegamente no resultado por empresa, sem freio agregado. | |

**User's choice:** Sim, com limiar de segurança (recomendado)
**Notes:** Ligado diretamente ao Achado crítico 5 da Fase 4 (bloqueio já provado imediato e retroativo).

---

## Sinalização

| Option | Description | Selected |
|--------|-------------|----------|
| Resposta HTTP detalhada + log | Corpo JSON com contagem de sucesso/erro e lista de anomalias; sem serviço novo de notificação. | ✓ |
| Notificação ativa (e-mail/webhook) | Alerta ativo além da resposta, exige canal novo. | |

**User's choice:** Resposta HTTP detalhada + log (recomendado)

---

## Escopo worker

| Option | Description | Selected |
|--------|-------------|----------|
| Só reavalia fatos locais | avaliarAcesso sobre dados já no banco, sem chamar o Asaas. | ✓ |
| Também reconcilia com o Asaas | Consulta a API do Asaas por assinatura, como rede de segurança de webhooks perdidos. | |

**User's choice:** Só reavalia fatos locais (recomendado)

---

## Limiar

| Option | Description | Selected |
|--------|-------------|----------|
| 20% | Equilíbrio entre picos normais e detecção de anomalia real. | ✓ |
| 10% | Mais conservador, mais chance de falso alarme. | |
| Deixar a pesquisa recomendar | Pesquisa técnica investiga práticas de mercado. | |

**User's choice:** 20% (recomendado)

---

## Hosting

| Option | Description | Selected |
|--------|-------------|----------|
| Ainda não decidi — fase agnóstica | Endpoint funciona atrás de qualquer agendador, sem mudança de código. | ✓ |
| Já sei: Vercel | Fixa a decisão, inclui vercel.json. | |
| Já sei: VPS | Fixa a decisão, inclui exemplo de crontab. | |

**User's choice:** Ainda não decidi — fase agnóstica (recomendado)
**Notes:** Resolve o bloqueador de pesquisa do roadmap sem travar a fase — a escolha real fica para o deploy.

---

## Claude's Discretion

- Nome exato do endpoint e método HTTP.
- Estratégia de paginação/lote do findMany sobre Empresa.
- Nome exato do valor novo no enum CausaTransicaoAcesso (WORKER_DIARIO) e a migration.
- Formato exato do header/mecanismo de autenticação do CRON_SECRET.
- Onde reside a lógica de calcular a % de transições perigosas antes de decidir aplicar.

## Deferred Ideas

- Reconciliação ativa com a API do Asaas.
- Canal de notificação ativa (e-mail/Slack/webhook).
- Decisão definitiva de hosting/scheduler e dimensionamento do pool do Prisma.
