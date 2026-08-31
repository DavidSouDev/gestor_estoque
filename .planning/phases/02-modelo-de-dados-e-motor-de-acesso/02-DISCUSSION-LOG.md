# Phase 2: Modelo de Dados e Motor de Acesso - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 2-Modelo de Dados e Motor de Acesso
**Areas discussed:** Semântica das datas de virada, Backfill de empresas existentes, Onde mora o "cancelado", Granularidade do audit trail

---

## Semântica das datas de virada

| Pergunta | Opções | Escolha |
|---|---|---|
| Fuso/comparação de data | UTC puro / Fim do dia (America/Sao_Paulo) | **Fim do dia (America/Sao_Paulo)** |
| Limite exato (inclusivo/exclusivo) | Já expirada (>=) / Ainda válida (>) | **Resposta livre:** "é tratada como expirada, mas o usuário ainda pode usar o sistema por mais 10 dias com uma mensagem de alerta em evidência em todas as páginas (menos catálogo) mostrando quanto tempo ele ainda tem de uso e solicitando o pagamento, se os 10 dias de margem expiram ele é bloqueado" — confirma limite inclusivo (`>=`) E o fluxo trial/pagamento → carência de 10 dias → bloqueio |
| Precedência entre fatos | Vitalício sempre vence / Fato mais recente vence | **Vitalício sempre vence** |
| Trial + pagamento antecipado | 'Em dia' assim que paga / 'Trial' continua até acabar | **'Trial' continua até acabar** |

**Notas:** A resposta em texto livre da segunda pergunta foi o achado mais importante da área — confirmou que o limite é inclusivo e revelou o mecanismo completo de carência de 10 dias com banner, que também se aplica ao fim do trial (não só a atraso de pagamento).

---

## Backfill de empresas existentes

| Pergunta | Opções | Escolha |
|---|---|---|
| O que empresas existentes recebem | acessoVitalicio=true / acessoAte no futuro distante / Trial novo de 14 dias | **Trial novo de 14 dias** |
| Critério de diferenciação | Mesmo tratamento pra todas / Diferenciar por critério | **Mesmo tratamento pra todas** |
| Auditoria do backfill | Sim, registrar como 'backfill' / Não, só o dado final | **Sim, registrar como 'backfill'** |
| Revisão antes de rodar em produção | Quero revisar antes / Pode rodar direto | **Pode rodar direto** |

**Notas:** Nenhuma.

---

## Onde mora o "cancelado"

| Pergunta | Opções | Escolha |
|---|---|---|
| Status enquanto ainda paga | 'Cancelado' desde o cancelamento / 'Em dia' até o período acabar | **'Em dia' até o período pago acabar** |
| Pós-cancelado, após acessoAte vencer | Direto pra bloqueado / Mesma carência de 10 dias | **Mesma carência de 10 dias** |
| Reativação limpa canceladoEm? | Sim, limpa ao re-pagar / Não, mantém como histórico | **Sim, limpa canceladoEm ao re-pagar** |
| Origem do canceladoEm | Só ação explícita do usuário / Tem outro gatilho automático | **Confirmado — só ação explícita** |
| (Follow-up) Status final pós-carência de cancelado | 'Cancelado' — rótulo distinto / 'Bloqueado' — mesmo status | **'Cancelado' — rótulo distinto** |

**Notas:** Detectei uma tensão entre as respostas — se cancelado-ainda-pago mostra "em dia" e cancelado-expirado vai para "carência"→"bloqueado", o valor "cancelado" nunca seria de fato retornado pela função, conflitando com o critério do roadmap de 6 status possíveis. Fiz uma pergunta de follow-up fora do lote original de 4 para resolver isso — o usuário confirmou que o status final pós-carência de uma empresa cancelada é "cancelado", não "bloqueado" (mesmo comportamento, rótulo distinto).

---

## Granularidade do audit trail

| Pergunta | Opções | Escolha |
|---|---|---|
| Tipo da causa | Enum fixo / Texto livre | **Enum fixo** |
| Vitalício sem auditoria automática | Aceitável não auditar / Quero detectar e registrar | **Aceitável não auditar** |
| Quando grava (a cada request?) | Só quando muda / Toda vez que roda | **Só quando muda** |
| Conteúdo da entrada | Status+causa+horário, só / Incluir snapshot dos fatos | **Status + causa + horário, só** |

**Notas:** Nenhuma.

---

## Claude's Discretion

- Onde mora o efeito colateral de escrever a auditoria (wrapper vs. método de serviço)
- Nome exato dos campos/enums no schema Prisma
- Estrutura exata do retorno de `avaliarAcesso` (string enum vs. objeto)
- Onde exatamente no fluxo de registro o `trialFim` inicial é setado
- Estratégia de migration para o backfill (script separado vs. dentro da migration)

## Deferred Ideas

- Detecção retroativa de ativação de `acessoVitalicio` fora da aplicação — descartado para esta fase
- Snapshot dos fatos de billing em cada entrada de auditoria — descartado para esta fase
- Valores de enum de causa para webhook/worker/cancelamento — pertencem às Fases 3, 5 e 7
