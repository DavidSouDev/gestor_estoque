# Phase 7: Gestão de Assinatura - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-02
**Phase:** 7-Gestão de Assinatura
**Areas discussed:** Sync pós-checkout, Fonte do status, Confirmar cancelamento, Local da tela

---

## Sincronização pós-checkout

| Option | Description | Selected |
|--------|-------------|----------|
| Polling no cliente com backoff | A tela de retorno do checkout consulta o status a cada poucos segundos (backoff) até refletir o pagamento ou expirar — recomendação já em FEATURES.md. Não bloqueia o render inicial da página. | ✓ |
| Consulta síncrona ao Asaas antes de renderizar | O Server Component da página de retorno consulta a API do Asaas ao vivo antes de montar a tela — mais simples, mas adiciona chamada de rede externa síncrona ao carregamento. | |

**User's choice:** Polling no cliente com backoff (recomendado)
**Notes:** Nenhuma nota adicional — escolha padrão aceita.

---

## Fonte do status ("próxima cobrança")

| Option | Description | Selected |
|--------|-------------|----------|
| Consulta viva ao Asaas a cada carregamento | `asaasClient.buscarAssinatura(id)` a cada abertura da tela — sempre atual, depende de rede externa por carregamento. | ✓ |
| Campo espelhado localmente, atualizado só por webhook | Guarda `nextDueDate`/status na Empresa, atualizado só quando um evento chega — mais rápido, pode ficar desatualizado entre webhooks. | |

**User's choice:** Consulta viva ao Asaas (recomendado)
**Notes:** Nenhuma nota adicional — escolha padrão aceita.

---

## Confirmação de cancelamento

| Option | Description | Selected |
|--------|-------------|----------|
| Modal de confirmação com a data exata | Botão "Cancelar assinatura" abre modal com a data exata de fim de acesso, exige segundo clique explícito. | ✓ |
| Botão direto, sem modal | Um clique cancela imediatamente; data exata só aparece depois, como confirmação pós-ação. | |

**User's choice:** Modal de confirmação com a data exata (recomendado)
**Notes:** Nenhuma nota adicional — escolha padrão aceita.

---

## Local da tela

| Option | Description | Selected |
|--------|-------------|----------|
| Nova rota dedicada dentro de (protected), com link no admin-nav | Ex.: `/{slug}/admin/assinatura`, mesmo padrão de marca/estoque/combos/produtos/promoções. | ✓ |
| Embutida em uma tela existente | Ex.: dentro da tela de marca/configurações, sem rota própria. | |

**User's choice:** Nova rota dedicada (recomendado)
**Notes:** Nenhuma nota adicional — escolha padrão aceita.

---

## Claude's Discretion

- Número exato de tentativas de polling e intervalo entre elas na tela de retorno do checkout.
- Endpoint exato do Asaas para cancelar assinatura e shape do novo método em `asaasClient`/`assinaturaService` — não existe research prévia documentando o endpoint; fica para o researcher/planner investigar.
- Texto exato (copy) da tela e do modal de confirmação.
- Onde exatamente inserir o novo item no `admin-nav.tsx`.
- Tratamento de erro ao chamar o Asaas para cancelar — `canceladoEm` local só é gravado depois de confirmar o cancelamento no Asaas, nunca antes/em paralelo.

## Deferred Ideas

- Pausar assinatura em vez de cancelar (`FEATURES.md`, ideia v1.x) — fora do escopo desta fase.
- Múltiplos planos/preços — já em `PROJECT.md` §Out of Scope do milestone.
- Notificações proativas de trial acabando/carência — já coberto pelo banner da Fase 4 (ACC-01).
- Portal hospedado do gateway (equivalente ao Stripe Customer Portal) — não se aplica, gateway escolhido foi Asaas, sem portal de autoatendimento pronto.
