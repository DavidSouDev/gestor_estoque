# Phase 4: Aplicação do Bloqueio - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-01
**Phase:** 04-Aplicação do Bloqueio
**Areas discussed:** Banner CTA, Tela de bloqueio, Catálogo bloqueado, Catálogo x carência, Tratamento de CANCELADO

---

## Banner CTA (ACC-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, com botão "Pagar agora" | O banner de carência já inclui o link para o checkout hospedado do Asaas. Resolve ACC-01 e dá ao usuário bloqueado uma saída imediata, sem esperar a Fase 7. | ✓ |
| Não, só aviso informativo | O banner mostra dias restantes e pede pagamento, mas sem botão funcional. | |

**User's choice:** Sim, com botão "Pagar agora" (recomendado)
**Notes:** Reaproveita `POST /api/assinaturas/checkout` da Fase 3, que ainda não tinha UI consumidora.

---

## Tela de bloqueio (ACC-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Mensagem + botão de pagamento + logout | Tela dedicada explicando a suspensão, com o mesmo link de checkout do banner e opção de sair da conta. | ✓ |
| Mensagem simples, sem ação | Só informa o bloqueio, sem botão de pagamento. | |

**User's choice:** Mensagem + botão de pagamento + logout (recomendado)
**Notes:** Mesmo CTA de pagamento do banner, para não duplicar lógica.

---

## Catálogo bloqueado (ACC-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Igual a "loja não encontrada" | Mesmo comportamento/código de uma slug inexistente (404 genérico). Não revela para visitantes que a empresa existe mas está com pagamento atrasado. | ✓ |
| Mensagem genérica de "indisponível temporariamente" | Deixa claro que a loja existe mas está fora do ar, sem mencionar pagamento. | |

**User's choice:** Igual a "loja não encontrada" (recomendado)
**Notes:** Decisão de segurança/privacidade — evita vazar situação de billing do cliente para visitantes externos.

---

## Catálogo x carência

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, catálogo só cai após bloqueio total | Durante a carência, os clientes da empresa continuam comprando normalmente pelo catálogo — só o admin vê o aviso. | ✓ |
| Não, quero o catálogo já avisando algo durante a carência também | Mudança de escopo em relação ao roadmap (ACC-01 já define que o aviso de carência não aparece no catálogo). | |

**User's choice:** Sim, catálogo só cai após bloqueio total (recomendado)
**Notes:** Confirma a leitura literal do ACC-01/ACC-03 do roadmap — nenhuma mudança de escopo.

---

## Tratamento de CANCELADO

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, tratamento idêntico | Mantém consistência com D-08 da Fase 2: CANCELADO e BLOQUEADO usam a mesma lógica de acesso, só o rótulo interno difere. | ✓ |
| Não, quero uma tela diferente para quem cancelou | Cria uma segunda tela de bloqueio só para cancelamento voluntário. | |

**User's choice:** Sim, tratamento idêntico (recomendado)
**Notes:** Nenhuma tela nova — reaproveita a mesma tela de bloqueio da D-04.

---

## Claude's Discretion

- Código de resposta HTTP exato dos 5 caminhos do catálogo para simular "não encontrado".
- Estrutura exata do componente de banner e da tela de bloqueio (arquivo, client vs server component) — não existe padrão de `Banner`/`Alert` reutilizável hoje.
- Onde exatamente a checagem de `statusAcesso` entra em `requireAdminSession`/`requireAuth`.
- Texto exato (copy) do banner e da tela de bloqueio.

## Deferred Ideas

- Tela completa de gestão de assinatura (histórico, cancelamento pelo usuário, data exata de fim de acesso) — Fase 7.
- Qualquer UI de superadmin ou ativação de `acessoVitalicio` pela UI — fora de escopo do milestone.
