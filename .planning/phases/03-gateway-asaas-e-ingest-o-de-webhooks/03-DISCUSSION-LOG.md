# Phase 3: Gateway Asaas e Ingestão de Webhooks - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 3-Gateway Asaas e Ingestão de Webhooks
**Areas discussed:** Preço mensal do plano, Quando o checkout é iniciado, Ambiente Asaas agora, Falha ao criar assinatura no Asaas

---

## Gateway: Asaas vs Mercado Pago (fora do lote original de 4 áreas)

O usuário pediu, no meio da discussão de preço, uma comparação completa entre Asaas e Mercado Pago, por já ter conta no Mercado Pago.

| Critério | Asaas | Mercado Pago |
|---|---|---|
| API de recorrência | `/v3/subscriptions` | `preapproval`/`preapproval_plan` — mais fraca pra "N períodos em atraso" |
| SDK Node oficial | Não (comunitário) | Sim (`mercadopago@3.6.0`, qualidade irregular) |
| Confiabilidade webhook | Fila pausa após 15 falhas, retém 14 dias | Retry, mas doc/ordering "historicamente fracos" |
| Taxa cartão (~R$30-50) | ~4,0% | ~4,98% imediato / 3,03% D+30 |
| Taxa Pix | R$1,99 (promo R$0,99/3m) | 0,99% |
| Onboarding | Rápido | Já tem conta (zero fricção) |

**Decisão do usuário:** manter Asaas — o motivo decisivo foi o modelo de dados do Asaas (payment por período) casar melhor com o requisito de reativação por meses atrasados, mesmo com o Mercado Pago já tendo conta pronta e Pix mais barato.

---

## Preço mensal do plano

| Pergunta | Opções | Escolha |
|---|---|---|
| Valor do plano único | R$49,90/mês (suposição da pesquisa) / Outro valor | **Outro valor: R$29,90/mês** |

**Notas:** Substitui a suposição de ~R$49,90 usada na pesquisa de comparação de taxas do gateway.

---

## Quando o checkout é iniciado

| Pergunta | Opções | Escolha |
|---|---|---|
| Momento do checkout | Perto do fim do trial / No registro imediatamente / Só sob demanda | **Perto do fim do trial** |
| Escopo desta fase (UI ou só backend) | Só backend / Backend + ponto de entrada mínimo de UI | **Só o backend nesta fase** |

**Notas:** Nenhuma.

---

## Ambiente Asaas agora

| Pergunta | Opções | Escolha |
|---|---|---|
| Conta/API key já existe? | Ainda não tenho / Já tenho sandbox / Já tenho produção | **Ainda não tenho conta** |

**Notas:** O usuário pediu clarificação em vez de responder a pergunta de follow-up sobre "como prefere proceder" — a clarificação virou a discussão de Asaas vs Mercado Pago (acima). Resolvido depois: usuário vai criar a conta sandbox por fora e adicionar as credenciais no `.env` quando o plano pedir.

---

## Falha ao criar assinatura no Asaas

| Pergunta | Opções | Escolha |
|---|---|---|
| Comportamento em falha | Erro claro, usuário tenta de novo / Registra tentativa + retry automático | **Erro claro, usuário tenta de novo** |

**Notas:** Nenhuma assinatura parcial fica salva no banco; sem mecanismo de retry automático nesta fase.

---

## Claude's Discretion

- Estrutura do cliente HTTP tipado para a API do Asaas
- Estratégia de validação de payload do webhook (zod)
- Mecanismo exato de idempotência do webhook
- Nome do novo valor de `CausaTransicaoAcesso` para webhook
- Estratégia de log/observabilidade (Sentry vs. pino vs. console.error com prefixo)

## Deferred Ideas

- Botão/tela de "assinar" — Fase 4 ou Fase 7
- Retry automático de assinatura que falhou — descartado, poderia voltar via worker da Fase 5
- Reavaliação de Mercado Pago — descartada, poderia voltar se a fila de webhook do Asaas se provar problemática na prática
