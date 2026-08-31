# Feature Research

**Domain:** Controle de assinatura/pagamento em SaaS B2B multi-tenant (Brasil, plano único, solo-founder)
**Researched:** 2026-08-31
**Confidence:** MEDIUM-HIGH (lifecycle de gateway = docs oficiais Stripe/Asaas; benchmarks de trial/dunning = MEDIUM; análise de concorrentes BR = LOW, não verificada nesta sessão)

---

## Resumo Executivo (leia isto primeiro)

A pesquisa **valida a maior parte** dos requisitos já levantados em `PROJECT.md`, mas identificou **cinco correções materiais** que precisam entrar na definição de requisitos:

1. **A janela de carência de 10 dias colide com a janela de retry do gateway.** O padrão recomendado do Stripe são 8 tentativas ao longo de 2 semanas — mais longo que a carência de 10 dias. Se a carência começar na primeira falha, o sistema bloqueia a empresa **enquanto o gateway ainda está tentando cobrar**. Os dois relógios precisam ser conciliados explicitamente.
2. **`termos.atualizadoEm` (um timestamp) é insuficiente juridicamente.** O padrão defensável é versão imutável + registro de aceite por usuário contendo versão, timestamp e IP.
3. **Exigir o pagamento de todos os meses em atraso para reativar é um anti-padrão em SaaS de acesso** e nenhum gateway suporta isso nativamente. É lógica de faturamento customizada em cima do gateway, e converte churn recuperável em churn permanente.
4. **O enum de status mistura duas dimensões ortogonais** (estado da assinatura no gateway vs. direito de acesso). A modelagem robusta é uma data `acessoAte` (paid-through) da qual tudo é derivado — o `cancelado` do projeto explicitamente **não** é um estado de bloqueio.
5. **Não existe infraestrutura de e-mail no codebase** (`INTEGRATIONS.md`: nenhuma integração). Dunning por e-mail é table stakes — mas a recomendação é **delegar 100% ao gateway** em v1 e não construir nada, removendo uma dependência inteira do milestone.

Um sexto ponto é um **gap em `PROJECT.md`**: emissão de nota fiscal de serviço (NFS-e). Cobrar recorrentemente de CNPJs no Brasil gera obrigação fiscal e o cliente vai pedir a nota. Ver "Table Stakes".

---

## Feature Landscape

### Table Stakes (Users Expect These)

Sem isso o sistema de cobrança quebra, gera cobrança indevida ou confunde o usuário.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Data `acessoAte` (paid-through) por Empresa como fonte única de verdade** | Todo o gating (carência, bloqueio, cancelamento com acesso até fim do período, vitalício) é derivável de uma única data. Sem isso, cada regra vira um `if` separado e divergem. | LOW | Substitui a lógica espalhada por enum. `acessoLiberado = vitalicio OR hoje <= acessoAte`. O enum vira **rótulo de UI derivado**, não fonte de verdade. |
| **Ingestão de webhook idempotente** | Stripe e Asaas entregam *at-least-once*: o mesmo evento pode chegar 2x. Sem idempotência, um `PAYMENT_RECEIVED` duplicado estende `acessoAte` duas vezes (empresa ganha mês grátis) ou dispara e-mail duplicado. | MEDIUM | Tabela `WebhookEvento` com `gatewayEventId` UNIQUE. Insert-or-skip antes de processar. **Depende da escolha do gateway** (formato do id do evento). |
| **Responder 2xx ao webhook rapidamente, sempre** | Asaas **pausa a fila inteira após 15 falhas consecutivas** de entrega. Fila pausada = o sistema para de saber de pagamentos silenciosamente enquanto o gateway continua cobrando. Stripe desativa endpoints com falha persistente. | MEDIUM | Padrão: validar assinatura → persistir evento cru → retornar 200 → processar. Nunca deixar erro de negócio virar 500. |
| **Verificação de assinatura/autenticidade do webhook** | Endpoint de webhook é público. Sem verificação, qualquer um faz POST e libera acesso vitalício de graça. | LOW | Stripe: `stripe-signature` HMAC. Asaas: token no header. Requisito de segurança inegociável — `CONCERNS.md` já registra um endpoint sem auth no projeto. |
| **Worker diário de reconciliação (não de decisão)** | Webhooks se perdem, filas pausam, e **expiração de trial não gera webhook nenhum** (não existe assinatura no gateway ainda). O worker é a rede de segurança. | MEDIUM | Idempotente e re-executável. **Depende da decisão de hosting** (Vercel Cron vs. cron em VPS) — bloqueador já identificado em `PROJECT.md`. |
| **Trial de 14 dias sem cartão, com estado de "trial expirado" explícito** | 14 dias é o comprimento modal em SaaS B2B. Mas trial sem cartão **não auto-converte** — exige ação explícita de upgrade, então o produto precisa de uma tela/estado "trial acabou, assine". | MEDIUM | Validado. Trial sem cartão converte menos (mediana ~14% vs ~44%) porém traz muito mais signups e melhor retenção em 90 dias — correto para produto de ticket baixo. |
| **Avisos de fim de trial (D-7, D-3, D-1)** | Trial que expira sem aviso é percebido como perda de acesso arbitrária. É a causa nº1 de trial que não converte por inércia. | LOW | Banner in-app resolve v1 (não exige e-mail). |
| **Banner de carência persistente com dias restantes e CTA de pagamento** | O usuário precisa saber que vai perder acesso e ter o link de resolver a um clique. | LOW | Já em `PROJECT.md`. Correto não exibir no catálogo público. |
| **Tela de gerenciamento de assinatura (status, próxima cobrança, valor, cancelar)** | Padrão universal: link sob Billing/Assinatura/Conta, acessível em ≤2 cliques. | MEDIUM | Simplificação forte: usar o **portal hospedado do gateway** (Stripe Customer Portal / área do cliente Asaas) em vez de construir UI de billing. |
| **Cancelamento self-service com acesso até o fim do período pago** | Modelo default do mercado. E no Brasil o CDC exige informação clara e prévia sobre como cancelar; dificultar cancelamento é prática abusiva. | MEDIUM | Ao confirmar, **mostrar a data exata**: "ativo até 14/09/2026, não será renovado". Sem essa frase o usuário abre chamado ou chargeback. |
| **Bloqueio reversível sem destruir dados do tenant** | Suspensão precisa ser um flag. Se o bloqueio apagar/mutilar dados, reativação é impossível e o churn vira permanente. | LOW | Padrão da indústria: carência (dias) → suspensão com dados intactos (15–30d) → exclusão só após 60–90d. **v1 não deve excluir nada.** |
| **Despublicação do catálogo sem expor inadimplência** | Já decidido em `PROJECT.md` e está correto: o cliente final da empresa não deve saber que ela não pagou. | LOW | Decisão pendente: **HTTP 503 + `Retry-After`** (temporário, preserva indexação) em vez de 404, já que o bloqueio é reversível. |
| **Aceite de termos versionado com trilha de auditoria** | Clickwrap só é executável judicialmente se o aceite for inequívoco e vinculado ao **texto exato vigente**. "Uso continuado = aceite" é juridicamente fraco. | MEDIUM | Modelo: `TermosVersao` (imutável, com conteúdo/hash) + `TermoAceite` (usuarioId, versaoId, aceitoEm, ip). Ver anti-feature sobre o timestamp único. |
| **Modal bloqueante de re-aceite ao logar** | Já em `PROJECT.md`. Correto — é o padrão para usuários existentes. | MEDIUM | Deve bloquear **navegação**, não só renderizar por cima. Verificação no server (layout/middleware), não só no cliente. |
| **Emissão de nota fiscal de serviço (NFS-e)** | **GAP em `PROJECT.md`.** Cobrança recorrente de CNPJ no Brasil gera obrigação fiscal e o cliente vai pedir a nota. | LOW (v1) / HIGH (automatizado) | v1: emitir manualmente fora do sistema, ou usar emissão automática do gateway (Asaas tem NFS-e nativa — fator relevante na escolha do gateway). Não construir emissor próprio. |
| **E-mails de cobrança falhada (dunning)** | Churn involuntário (cartão falha, cliente não quis sair) é 20–40% do churn total de SaaS e é majoritariamente recuperável. Silêncio = perda garantida. | LOW (delegado) / HIGH (próprio) | **Delegar ao gateway.** Stripe e Asaas enviam e-mails de dunning nativamente. O projeto não tem provedor de e-mail — não adicionar um só para isso em v1. |

---

### Differentiators (Competitive Advantage)

Valiosos, mas **nenhum é necessário para o v1**.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Pix Automático como método de cobrança** | Cartão recorrente no Brasil tem taxa estrutural de falha de ~8–14% das tentativas; Pix Automático fica em ~2–5% (debita conta corrente, sem limite de crédito). Menos falha = menos dunning = menos bloqueio. | MEDIUM | Em produção desde jun/2025 (Res. BCB 384/2024). Adoção bancária ainda desigual → guidance 2026 é **cartão primeiro, Pix Automático como segunda opção**. Forte critério de desempate na escolha do gateway. |
| **Notificação de dunning por WhatsApp** | No Brasil WhatsApp tem taxa de abertura muito superior a e-mail para PMEs. Recuperação de cobrança falhada é onde isso mais paga. | MEDIUM | v1.x. Vários gateways BR já oferecem régua de cobrança por WhatsApp embutida. |
| **Autoatendimento de troca de cartão durante a carência** | Transforma o banner de carência de aviso passivo em um clique que resolve. Encurta o tempo de recuperação drasticamente. | LOW | Basicamente grátis se usar o portal hospedado do gateway — só linkar do banner. |
| **Pausar assinatura (em vez de cancelar)** | Retém sazonalidade — comum em pequeno varejo. Cancelamento é terminal; pausa preserva a relação. | MEDIUM | v1.x. Stripe suporta `paused` nativamente. |
| **Modo somente-leitura no bloqueio (em vez de porta fechada)** | Empresa bloqueada consegue ver/exportar seu estoque mas não editar, e o catálogo fica fora do ar. Reduz a sensação de "sequestro de dados" e a fricção de reativar. | MEDIUM | Conflita parcialmente com o requisito atual de bloqueio total. Ver "Feature Conflicts". |
| **Captura de motivo no cancelamento** | Fluxos estruturados de cancelamento retêm 15–25% de quem inicia o cancelamento, vs ~0% no cancelamento instantâneo sem etapa. Para solo-founder, o dado do *motivo* vale mais que a retenção. | LOW | Uma pergunta opcional, **sem** obstruir o cancelamento. Ver anti-feature sobre dark patterns. |
| **Exportação de dados antes do bloqueio** | Reduz risco jurídico (CDC/LGPD) e ansiedade de lock-in. Argumento de venda honesto. | MEDIUM | v1.x. CSV de produtos/estoque já é suficiente. |
| **Cobrança anual com desconto** | Elimina 11 oportunidades de falha de cartão por ano e melhora caixa. Maior alavanca isolada contra churn involuntário. | LOW | Tecnicamente é só outro `price` no gateway — mas ver anti-feature "múltiplos planos". Ciclo anual ≠ múltiplos planos. |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Exigir quitação de todos os meses em atraso para reativar** | Parece justo — "você usou, você paga". Está em `PROJECT.md` como requisito ativo. | Nenhum gateway suporta nativamente. Stripe `canceled` é **terminal** (exige assinatura nova); `unpaid` gera faturas em rascunho que **nunca são cobradas**. Implementar significa lógica de faturamento customizada. Pior: erguer um muro de preço de 2–3x na reativação é o que converte churn recuperável em permanente — e a empresa bloqueada **não usou** o serviço no período (catálogo estava fora do ar), então cobrar por ele é contestável sob o CDC. | **Reativação in-term:** ao atualizar o meio de pagamento, cobrar **uma** mensalidade, restaurar acesso imediatamente e retomar o ciclo. Se quiser recuperar valor, use uma *taxa de reativação* fixa e pequena, precificada nos termos — não N mensalidades retroativas. |
| **`termos.atualizadoEm` como timestamp único no registro de termos** | Simples, uma coluna, comparação trivial contra o aceite do usuário. Está em `PROJECT.md`. | Não guarda **o que** foi aceito. Se os termos mudarem 3x, não há como provar qual texto o usuário aceitou — que é justamente o que a trilha de auditoria precisa provar. Também força re-aceite em correção de typo, treinando o usuário a clicar "aceito" sem ler (o que enfraquece o próprio clickwrap). | `TermosVersao` imutável (conteúdo + `publicadoEm` + `exigeReaceite: boolean`) + `TermoAceite` (usuarioId, versaoId, aceitoEm, ip). Só versões com `exigeReaceite` disparam o modal. |
| **Múltiplos planos / tiers de preço** | "E se alguém quiser um plano maior?" | Multiplica proration, upgrade/downgrade, migração de plano, feature flags por plano e casos de teste — antes de existir evidência de que **um** plano vende. Já está em Out of Scope: **confirmado pela pesquisa, manter fora**. | Plano único. Se precisar de variação de preço, use preço legado por empresa (campo `precoMensal` no gateway) sem construir UI de planos. |
| **Construir formulário de cartão / armazenar dados de pagamento** | "Melhor UX, sem redirecionar." | Traz escopo PCI-DSS inteiro para dentro do sistema. Já é constraint explícita do usuário em `PROJECT.md`. | Checkout hospedado + portal do cliente do gateway. Guardar apenas `gatewayCustomerId` e `gatewaySubscriptionId`. |
| **Motor próprio de dunning (régua de e-mails, retries próprios)** | "Quero controlar as mensagens." | O projeto **não tem provedor de e-mail nenhum hoje**. Construir régua de e-mail + agendamento + deliverability + descadastro é um milestone inteiro. E retry próprio é pior que o do gateway: Smart Retries usa sinais de rede que você não tem, e códigos de *hard decline* (`lost_card`, `stolen_card`, `authentication_required`) **nunca** devem ser retentados. | Usar o dunning nativo do gateway + banner in-app. Adicionar e-mail transacional próprio só depois de v1, se a taxa de recuperação for ruim. |
| **Fluxo de retenção com ofertas/descontos e etapas de atrito no cancelamento** | Retém receita no curto prazo. | No Brasil, dificultar cancelamento é prática abusiva sob o CDC, e cobrança após pedido de cancelamento gera direito a ressarcimento integral corrigido. Para solo-founder, um único caso vira Procon/reclamação pública. | Cancelamento em ≤2 cliques + **uma** pergunta opcional de motivo + confirmação por e-mail com link de reativação. |
| **UI de superadmin para conceder acesso vitalício** | Parece necessário para ter controle. | Já em Out of Scope, e a pesquisa concorda: é uma tela de admin com autenticação privilegiada própria (superfície de ataque nova) para uma operação que acontece talvez 5 vezes. | `UPDATE` manual no banco, como já decidido. Reavaliar quando passar de ~10 usos. |
| **Excluir dados da empresa ao bloquear** | Economiza storage/R2. | Torna a reativação impossível e transforma churn recuperável em perda definitiva + risco jurídico. Padrão da indústria é exclusão só após 60–90 dias, e nunca no bloqueio. | Bloqueio = flag. Política de retenção documentada nos termos. Exclusão, se houver, em milestone separado com aviso prévio. |
| **Medição de uso / limites por plano (nº de produtos, imagens)** | Monetização "natural". | Exige metering, agregação e enforcement — e não há plano múltiplo para diferenciar. Sem valor em plano único. | Nenhum limite em v1. |

---

## Feature Dependencies

```
[Escolha do gateway]  ◄── BLOQUEADOR de tudo abaixo
    ├──requires──> [Suporte a Pix Automático?]  (desempate)
    ├──requires──> [Emissão de NFS-e nativa?]   (desempate)
    └──requires──> [Portal do cliente hospedado?] (evita construir UI de billing)
            │
            ▼
[Ingestão de webhook idempotente]
    ├──requires──> [Verificação de assinatura do webhook]
    ├──requires──> [Tabela WebhookEvento com gatewayEventId UNIQUE]
    └──requires──> [Resposta 2xx rápida / processamento desacoplado]
            │
            ▼
[acessoAte : DateTime  +  acessoVitalicio : Boolean]   ◄── FONTE ÚNICA DE VERDADE
    │
    ├──enables──> [Gate de acesso ao admin]
    │                 └──enables──> [Banner de carência]
    ├──enables──> [Despublicação do catálogo público]
    ├──enables──> [Cancelamento com acesso até fim do período]
    └──enables──> [Expiração de trial]
            ▲
            │
[Worker diário de reconciliação]
    ├──requires──> [DECISÃO DE HOSTING]  ◄── BLOQUEADOR paralelo
    └──is required by──> [Expiração de trial]   (trial NÃO emite webhook)

[Termos versionados] ──independente──> (não toca em billing; paralelizável)
    └──requires──> [TermosVersao imutável] ──> [TermoAceite por usuário]
                                                    └──enables──> [Modal bloqueante no login]

[Dunning por e-mail] ──delegado ao gateway──> (sem dependência de código em v1)

[Bloqueio total do admin] ──conflicts──> [Modo somente-leitura no bloqueio]
[Carência de 10 dias]    ──conflicts──> [Janela de retry padrão do gateway (~14 dias)]
```

### Dependency Notes

- **Tudo depende da escolha do gateway.** Idempotência, formato de evento, o que significa "atrasado" e se o portal do cliente existe são todos determinados por ela. A escolha do gateway **precisa ser a primeira fase**, e os critérios de desempate são: portal hospedado, NFS-e nativa, Pix Automático e qualidade do webhook.
- **`acessoAte` habilita quatro features de uma vez.** Gate do admin, despublicação do catálogo, cancelamento com acesso residual e expiração de trial são todos a mesma comparação de data. Modelar isso primeiro colapsa quatro features em uma.
- **Expiração de trial exige o worker, não o webhook.** Durante o trial de 14 dias sem cartão **não existe assinatura no gateway**, logo nenhum evento é emitido quando o trial acaba. Sem o worker, empresas em trial nunca expiram. Isso torna a decisão de hosting um bloqueador real, não cosmético.
- **Webhook é o sinal primário; o worker é a rede de segurança.** Se o worker for a fonte de decisão, o bloqueio atrasa até 24h após o pagamento cair — usuário paga e continua bloqueado. Webhook decide na hora, worker reconcilia.
- **⚠️ CONFLITO — carência de 10 dias vs. retry do gateway.** O default recomendado do Stripe são **8 tentativas ao longo de 2 semanas**; boas práticas de mercado apontam 3–4 tentativas em 10–14 dias. Se a carência de 10 dias começar na **primeira** falha, o sistema bloqueia a empresa enquanto o gateway ainda está tentando cobrar — e o pagamento pode ser aprovado no dia 12, com a empresa já bloqueada. **Resolução recomendada:** configurar a janela de retry do gateway para **≤ 7 dias**, e manter os 10 dias de carência contados a partir da primeira falha. Isso deixa ~3 dias de folga entre o fim dos retries e o bloqueio.
- **⚠️ CONFLITO — bloqueio total vs. somente-leitura.** São decisões de produto mutuamente exclusivas. `PROJECT.md` optou por bloqueio total; a pesquisa não contradiz, mas registra que somente-leitura reduz atrito de reativação. Não implementar os dois; decidir uma vez.
- **Termos são totalmente independentes de billing.** Nenhuma dependência nos dois sentidos. Podem ser uma fase paralela ou até anterior, e não devem ser acoplados ao milestone de pagamento no planejamento.

---

## MVP Definition

### Launch With (v1)

- [ ] **Escolha do gateway + conta configurada** — bloqueia todo o resto; critérios: portal hospedado, webhook confiável, NFS-e, Pix Automático
- [ ] **`acessoAte` + `acessoVitalicio` no modelo `Empresa`** — fonte única de verdade do direito de acesso
- [ ] **Endpoint de webhook: verificação de assinatura + idempotência por event id + 2xx sempre** — sem isso, cobrança duplicada ou acesso liberado por POST forjado
- [ ] **Trial de 14 dias sem cartão + estado explícito de trial expirado** — não auto-converte, precisa de tela de upgrade
- [ ] **Gate de acesso ao admin derivado de `acessoAte`** — respeitando o isolamento `empresaId` existente
- [ ] **Despublicação do catálogo público quando bloqueado** — 503, sem mensagem de inadimplência
- [ ] **Banner de carência com dias restantes + link direto para o portal de pagamento** — o único canal de aviso que não depende de e-mail
- [ ] **Worker diário de reconciliação** — expira trials, concilia webhooks perdidos, aplica bloqueio; idempotente
- [ ] **Tela de assinatura: status, próxima cobrança, cancelar** — preferencialmente delegando ao portal do gateway
- [ ] **Cancelamento com acesso até `acessoAte`, exibindo a data exata** — exigência prática e de conformidade CDC
- [ ] **`TermosVersao` + `TermoAceite` (usuário, versão, timestamp, IP)** — aceite no registro
- [ ] **Modal bloqueante de re-aceite, validado no servidor** — quando existe versão com `exigeReaceite` não aceita
- [ ] **Endpoint de publicação de nova versão de termos** — uso do dono do sistema

### Add After Validation (v1.x)

- [ ] **Troca de meio de pagamento a partir do banner de carência** — assim que houver a primeira empresa em carência real
- [ ] **Notificação de dunning por WhatsApp** — se a recuperação via e-mail do gateway ficar abaixo de ~40%
- [ ] **Ciclo de cobrança anual com desconto** — quando o churn involuntário ficar visível nos números
- [ ] **Captura de motivo no cancelamento** — a partir do 5º cancelamento, para saber o porquê
- [ ] **Exportação de dados (CSV)** — no primeiro pedido de cliente ou antes de qualquer política de exclusão
- [ ] **Emissão automática de NFS-e via gateway** — quando a emissão manual passar de ~10/mês

### Future Consideration (v2+)

- [ ] **Múltiplos planos/tiers** — só após comprovar rentabilidade do plano único (já em Out of Scope)
- [ ] **Pausar assinatura** — exige provar demanda sazonal real
- [ ] **UI de superadmin (vitalício, cortesia, gestão de tenants)** — quando o `UPDATE` manual doer
- [ ] **Política de exclusão de dados pós-bloqueio (60–90 dias)** — exige aviso prévio e revisão jurídica; não é v1
- [ ] **Modo somente-leitura no bloqueio** — reverter a decisão de bloqueio total só com evidência de atrito na reativação

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Escolha do gateway | HIGH | LOW (decisão) | **P1** |
| `acessoAte` como fonte única de verdade | HIGH | LOW | **P1** |
| Webhook idempotente + verificação de assinatura | HIGH | MEDIUM | **P1** |
| Gate de acesso ao admin | HIGH | LOW | **P1** |
| Despublicação do catálogo público | HIGH | LOW | **P1** |
| Worker diário de reconciliação | HIGH | MEDIUM | **P1** |
| Trial 14 dias + estado de expirado | HIGH | MEDIUM | **P1** |
| Banner de carência | HIGH | LOW | **P1** |
| Cancelamento com acesso até fim do período | HIGH | MEDIUM | **P1** |
| Termos versionados + aceite auditável | MEDIUM | MEDIUM | **P1** (risco jurídico) |
| Modal de re-aceite bloqueante | MEDIUM | MEDIUM | **P1** |
| Tela de assinatura (via portal do gateway) | MEDIUM | LOW | **P1** |
| Dunning por e-mail (delegado ao gateway) | HIGH | LOW | **P1** |
| Emissão de NFS-e (manual em v1) | MEDIUM | LOW | **P1** |
| Troca de cartão a partir do banner | HIGH | LOW | **P2** |
| Avisos de fim de trial (D-7/3/1) | MEDIUM | LOW | **P2** |
| Cobrança anual | MEDIUM | LOW | **P2** |
| Pix Automático | MEDIUM | MEDIUM | **P2** |
| Dunning por WhatsApp | MEDIUM | MEDIUM | **P3** |
| Motivo de cancelamento | LOW | LOW | **P3** |
| Exportação de dados | LOW | MEDIUM | **P3** |
| Pausar assinatura | LOW | MEDIUM | **P3** |
| Múltiplos planos | LOW | HIGH | **P3** (fora de escopo) |

**Priority key:** P1 = obrigatório no lançamento · P2 = adicionar quando possível · P3 = consideração futura

---

## Competitor Feature Analysis

> ⚠️ **Confiança LOW.** Esta tabela reflete conhecimento geral do mercado de SaaS PME brasileiro (Bling, Tiny/Olist, Conta Azul, Nuvemshop), **não verificado nesta sessão de pesquisa**. Tratar como hipótese a validar, não como fato.

| Feature | Padrão do mercado SaaS PME BR | Padrão SaaS global (Stripe-nativo) | Nossa abordagem |
|---------|-------------------------------|-------------------------------------|-----------------|
| Trial | 7–30 dias sem cartão, muito comum | 14 dias, frequentemente com cartão | 14 dias sem cartão — validado |
| Meio de cobrança | Cartão + boleto + Pix | Cartão | Cartão via gateway; Pix Automático em P2 |
| Carência | Comum, ~5–15 dias (cultura de boleto) | 3–7 dias | 10 dias — dentro da faixa, mas conciliar com retries |
| Bloqueio | Bloqueio de acesso, dados preservados | Suspensão de acesso, dados preservados | Igual + despublicação do catálogo (específico nosso) |
| Cancelamento | Self-service, acesso até fim do ciclo | Cancel at period end | Igual |
| Nota fiscal | **Esperado**, frequentemente automático | Inexistente/irrelevante | Manual em v1 — gap a fechar |
| Planos | Quase sempre 3+ tiers | 3 tiers | **Plano único** — divergência deliberada e correta para v1 |

---

## Sources

**Documentação de primeira mão (fetch direto do fornecedor):**
- `docs.stripe.com/billing/subscriptions/overview` — ciclo de vida e semântica de todos os status de assinatura, comportamento de `unpaid` (docs mandam suspender acesso), `canceled` como estado terminal
- `docs.stripe.com/billing/revenue-recovery/smart-retries` — política de retries (default recomendado: 8 tentativas / 2 semanas), hard decline codes não-retentáveis, comportamento pós-retry configurável (cancel / unpaid / past_due)
- `docs.asaas.com` — eventos de webhook de cobrança, entrega *at-least-once*, exigência de idempotência por event id, **pausa da fila após 15 falhas consecutivas**

**Pesquisa de mercado / boas práticas (WebSearch):**
- Benchmarks de trial B2B SaaS: comprimento, exigência de cartão, conversão opt-in vs opt-out (Chargebee, Maxio, Userpilot, GrowthSpree)
- Dunning e churn involuntário: cadências de retry, janelas de carência, 20–40% do churn total (Chargebee, Maxio, Kinde, Dodo Payments)
- Cancelamento self-service: cancel-at-period-end como default, comunicação de data, retenção de fluxos estruturados (Lago, PayPro Global, Microsoft Learn)
- Aceite de termos versionado: clickwrap, trilha de auditoria (userId/timestamp/IP/versão), fraqueza do "uso continuado = aceite" (TermsBox, Velt, Saber)
- Direito brasileiro: CDC art. 49 (arrependimento em 7 dias), dever de informação prévia sobre renovação automática, abusividade de retenção (Serasa Experian, Proteste, InfoMoney, escritórios de advocacia)
- Suspensão vs exclusão: escada carência → suspensão → exclusão (60–90d), retenção de dados (TechTarget, SignEasy, PayPro Global)
- Reativação in-term vs cobrança de atrasados (reMonetary, Chargebee, Ordway)
- Pix Automático: produção desde jun/2025 (Res. BCB 384/2024), taxas de falha comparadas cartão vs Pix, suporte por gateway

**Nota sobre confiança:** o seam `classify-confidence` classifica o provider `webfetch` como LOW por padrão, independentemente do conteúdo. As afirmações sobre Stripe e Asaas foram obtidas por fetch direto de `docs.stripe.com` e `docs.asaas.com` (documentação oficial de primeira mão) e devem ser tratadas como HIGH na prática. Achados de WebSearch estão em MEDIUM. A análise de concorrentes é LOW e não foi verificada.

**Gaps não resolvidos (para pesquisa de fase posterior):**
- Escolha final do gateway — comparação detalhada de taxas, NFS-e e qualidade de webhook é responsabilidade do research de STACK, não deste documento
- Decisão de hosting do worker (Vercel Cron vs cron em VPS) — bloqueador ainda aberto
- Redação jurídica dos termos de uso e da política de reembolso sob o CDC — exige revisão humana/jurídica, fora do escopo de pesquisa técnica
- Aplicabilidade estrita do CDC a este SaaS B2B — depende do perfil do cliente (micro/pequena empresa tende a ser protegida pela teoria finalista mitigada)

---
*Feature research for: controle de assinatura/pagamento em SaaS B2B multi-tenant no Brasil*
*Researched: 2026-08-31*
