# Requirements: Gestor de Estoque — Controle de Pagamento e Assinatura

**Defined:** 2026-08-31
**Core Value:** Uma empresa que não paga (após o prazo de carência) perde acesso ao admin e tem o catálogo despublicado — sem exceções e sem que dados de pagamento fiquem armazenados no nosso sistema.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Infraestrutura

Pré-requisitos técnicos identificados pela pesquisa como bloqueadores reais para o restante do milestone.

- [x] **INFRA-01**: Bug crítico do singleton do Prisma (`lib/prisma.ts`) é corrigido antes de qualquer código de billing entrar em produção
- [x] **INFRA-02**: Sessão do admin revalida o status de pagamento no banco a cada request (não confia apenas no JWT de 7 dias) — sem isso, bloquear uma empresa não tem efeito para quem já está logado

### Modelo de Dados e Motor de Acesso

- [x] **BILL-01**: Empresa armazena fatos de billing (`acessoAte`, `trialFim`, `canceladoEm`, `acessoVitalicio`) como fonte da verdade — não um "status" pré-calculado
- [x] **BILL-02**: Uma função pura de decisão (`avaliarAcesso`) determina o status de acesso (em dia / carência / bloqueado / vitalício / trial) a partir dos fatos armazenados e da data/hora atual
- [x] **BILL-03**: Empresa nova recebe automaticamente 14 dias de trial no registro, sem exigir pagamento
- [x] **BILL-04**: Acesso vitalício só pode ser concedido diretamente no banco de dados (sem UI de admin/superadmin em v1)
- [x] **BILL-05**: Toda mudança de status de acesso é registrada em uma tabela de auditoria (rastreabilidade para investigar bloqueios incorretos)

### Gateway de Pagamento

- [x] **GTW-01**: Integração com Asaas para assinatura recorrente via checkout hospedado — nenhum dado de cartão/pagamento é armazenado no banco próprio
- [x] **GTW-02**: Endpoint de webhook do Asaas verifica autenticidade, é idempotente (não processa o mesmo evento duas vezes) e responde 200 imediatamente, processando o restante de forma assíncrona
- [x] **GTW-03**: Webhook de pagamento confirmado atualiza `acessoAte` da empresa e encerra qualquer carência em curso
- [x] **GTW-04**: Webhook de pagamento atrasado/falho inicia a contagem da carência de 10 dias

### Controle de Acesso

- [x] **ACC-01**: Banner de aviso em destaque aparece em todas as telas do admin (exceto catálogo público) durante a carência, mostrando dias restantes e pedindo o pagamento
- [x] **ACC-02**: Após os 10 dias de carência, todos os usuários daquela Empresa perdem acesso ao painel admin
- [x] **ACC-03**: Catálogo público da Empresa bloqueada fica indisponível (sem mensagem de pagamento) — o guard é aplicado nos 5 caminhos de leitura pública existentes, não só na página principal
- [x] **ACC-04**: Reativação acontece automaticamente ao pagar a cobrança do período corrente do gateway — sem cobrança retroativa dos meses em que ficou bloqueada

### Worker Diário

- [ ] **WRK-01**: Worker diário reconcilia todas as empresas (expira trials, inicia carências, aplica bloqueios); é idempotente e seguro mesmo se rodar mais de uma vez ou pular uma execução
- [ ] **WRK-02**: Worker é exposto como endpoint HTTP protegido por segredo (`CRON_SECRET`), funcionando independente da decisão final de hosting (Vercel Cron, VPS cron, etc.)

### Termos de Uso

- [ ] **TERM-01**: Tela de termos de uso é exibida no registro da conta, com aceite obrigatório para concluir o cadastro
- [ ] **TERM-02**: Novo papel `SUPERADMIN` (distinto do `ADMIN` por empresa) é o único autorizado a atualizar os termos de uso via endpoint
- [ ] **TERM-03**: Termos são versionados de forma imutável; cada aceite de um Usuario fica registrado contra uma versão específica
- [ ] **TERM-04**: Se a versão vigente dos termos for mais recente que o último aceite do usuário, um modal obrigatório bloqueia o uso do admin até o aceite

### Gestão de Assinatura

- [ ] **SUB-01**: Usuário pode visualizar o status atual do pagamento/assinatura da sua empresa
- [ ] **SUB-02**: Usuário pode cancelar a assinatura; mantém acesso até o fim dos 30 dias do último pagamento
- [ ] **SUB-03**: Empresa cancelada que passa do fim do período pago segue o mesmo fluxo de bloqueio das demais

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Cobrança

- **BILL2-01**: Múltiplos planos/preços (básico, completo, etc.)
- **BILL2-02**: Pix Automático como método de pagamento adicional
- **BILL2-03**: Cobrança anual com desconto
- **BILL2-04**: Troca de cartão self-service a partir do banner de carência

### Fiscal

- **FISC-01**: Emissão automática de NFS-e via gateway (manual em v1)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Múltiplos planos/preços em v1 | Adiado até validar que o modelo de plano único é rentável |
| UI de admin/superadmin para ativar acesso vitalício | Ativação manual direta no banco por enquanto — baixo volume esperado |
| Cobrança manual por boleto/link avulso | Optou-se por assinatura recorrente automática via gateway |
| Bloqueio diferenciado por papel de usuário | Hoje existe apenas um usuário admin por empresa; toda a empresa é bloqueada/desbloqueada em conjunto |
| Armazenamento de dados de cartão/pagamento no banco próprio | Gateway externo (Asaas, checkout hospedado) cuida disso — requisito de segurança do usuário |
| Cobrança retroativa dos meses em que a empresa ficou bloqueada | Gateways de assinatura não suportam nativamente; cobrar por período sem prestação de serviço é arriscado sob o CDC |
| Sistema de e-mail de dunning próprio | Delegado 100% ao Asaas — não há infraestrutura de e-mail no codebase hoje |
| Read-only mode em vez de bloqueio total | Conflita com a decisão de bloqueio total já tomada — escolher um |
| Política de exclusão de dados após bloqueio prolongado | Não é v1; revisar quando houver volume real |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| BILL-01 | Phase 2 | Complete |
| BILL-02 | Phase 2 | Complete |
| BILL-03 | Phase 2 | Complete |
| BILL-04 | Phase 2 | Complete |
| BILL-05 | Phase 2 | Complete |
| GTW-01 | Phase 3 | Complete |
| GTW-02 | Phase 3 | Complete |
| GTW-03 | Phase 3 | Complete |
| GTW-04 | Phase 3 | Complete |
| ACC-01 | Phase 4 | Complete |
| ACC-02 | Phase 4 | Complete |
| ACC-03 | Phase 4 | Complete |
| ACC-04 | Phase 4 | Complete |
| WRK-01 | Phase 5 | Pending |
| WRK-02 | Phase 5 | Pending |
| TERM-01 | Phase 6 | Pending |
| TERM-02 | Phase 6 | Pending |
| TERM-03 | Phase 6 | Pending |
| TERM-04 | Phase 6 | Pending |
| SUB-01 | Phase 7 | Pending |
| SUB-02 | Phase 7 | Pending |
| SUB-03 | Phase 7 | Pending |

**Coverage:**

- v1 requirements: 24 total
- Mapped to phases: 24 ✓
- Unmapped: 0 — every v1 requirement maps to exactly one phase (see `.planning/ROADMAP.md`)

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1 — Pré-requisitos de Produção | INFRA-01, INFRA-02 | 2 |
| 2 — Modelo de Dados e Motor de Acesso | BILL-01 … BILL-05 | 5 |
| 3 — Gateway Asaas e Ingestão de Webhooks | GTW-01 … GTW-04 | 4 |
| 4 — Aplicação do Bloqueio | ACC-01 … ACC-04 | 4 |
| 5 — Worker Diário de Reconciliação | WRK-01, WRK-02 | 2 |
| 6 — Termos de Uso e Aceite | TERM-01 … TERM-04 | 4 |
| 7 — Gestão de Assinatura | SUB-01 … SUB-03 | 3 |

---
*Requirements defined: 2026-08-31*
*Last updated: 2026-08-31 after roadmap creation (traceability mapped)*
