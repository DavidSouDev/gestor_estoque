# Phase 2: Modelo de Dados e Motor de Acesso - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

O sistema precisa saber dizer, para qualquer Empresa e qualquer data/hora, exatamente qual é o status de acesso dela — derivado de **fatos armazenados** (`acessoAte`, `trialFim`, `canceladoEm`, `acessoVitalicio`), nunca de um campo de status pré-calculado. Cobre BILL-01 a BILL-05:

1. Empresa armazena os 4 fatos de billing como fonte da verdade
2. Função pura `avaliarAcesso` decide o status (trial / em dia / carência / bloqueado / cancelado / vitalício) a partir dos fatos + data/hora atual
3. Empresa nova recebe 14 dias de trial automaticamente no registro, sem exigir pagamento
4. `acessoVitalicio` só é ativável direto no banco (sem UI em v1)
5. Toda mudança de status vai para uma tabela de auditoria (status anterior, novo, causa, horário)

Fora do escopo desta fase: gateway de pagamento (Fase 3), aplicação real do bloqueio no admin/catálogo (Fase 4), worker diário (Fase 5), UI de cancelamento (Fase 7). Esta fase constrói o **motor de decisão e os fatos** — ninguém ainda é bloqueado de verdade por causa dela.

</domain>

<decisions>
## Implementation Decisions

### Semântica das datas de virada
- **D-01:** Todas as comparações de `acessoAte`/`trialFim` contra "agora" usam o **fim do dia no fuso `America/Sao_Paulo`** (meia-noite local), não timestamp UTC puro. Mais intuitivo para o usuário final ("seu trial acaba dia 15") — exige normalização de fuso em todo lugar que grava ou compara essas datas.
- **D-02:** O limite é **inclusivo** — no instante exato em que `now` atinge `trialFim`/`acessoAte`, a empresa já é tratada como expirada (`>=`, não `>`). Isso dispara imediatamente a carência (ver D-04).
- **D-03:** `acessoVitalicio` tem **precedência absoluta** sobre todos os outros fatos — se `acessoVitalicio === true`, o status é sempre `vitalicio`, independente de `canceladoEm`, `acessoAte` ou `trialFim`. É checado primeiro, antes de qualquer outra regra.
- **D-04:** Trial expirando sem pagamento entra na **mesma carência de 10 dias** do atraso de pagamento — não vai direto para bloqueado. Esse é o mesmo mecanismo de carência que atraso de pagamento usa (Fase 4 aplica o banner/bloqueio real; esta fase só precisa que `avaliarAcesso` retorne `carencia` corretamente nesse caso).
- **D-05:** Se uma empresa em trial já tem `acessoAte` no futuro (pagou antes do trial acabar), o status continua `trial` até `trialFim` — não vira `em dia` cedo. A empresa não "perde" dias de trial não usados.

### Onde mora o "cancelado"
- **D-06:** Enquanto `canceladoEm` está preenchido mas `acessoAte` ainda está no futuro, o status retornado é `em_dia` — o status reflete acesso real, não intenção futura de sair.
- **D-07:** Quando `acessoAte` de uma empresa cancelada vence, ela entra na mesma carência de 10 dias de todo mundo (reaproveita a máquina de estados de D-04).
- **D-08:** Se a carência também vencer sem reativação, o status final é **`cancelado`** — não `bloqueado`. Mesmo comportamento de bloqueio (Fase 4 aplica igual), mas rótulo distinto no enum retornado por `avaliarAcesso`, para diferenciar de quem simplesmente parou de pagar sem cancelar formalmente. Isso é o que faz `cancelado` ser um valor que a função de fato retorna, satisfazendo o critério do roadmap de 6 status possíveis.
- **D-09:** Um novo pagamento confirmado (novo `acessoAte` no futuro) **limpa `canceladoEm` automaticamente**, voltando a empresa para `em_dia`. `canceladoEm` não é um registro histórico permanente — é um fato ativo que reflete a intenção *atual*.
- **D-10:** `canceladoEm` só é setado por ação explícita do usuário (botão "cancelar assinatura", Fase 7) — nunca automaticamente por falta de pagamento. Não pagar gera carência/bloqueio via datas, nunca seta esse campo.

### Backfill de empresas existentes
- **D-11:** Toda empresa já cadastrada antes desta fase recebe um **trial novo de 14 dias** no backfill (mesmo tratamento para todas, sem diferenciar por data de criação ou atividade recente) — trata como se tivesse acabado de se cadastrar.
- **D-12:** O backfill grava uma entrada na tabela de auditoria por empresa, com causa `BACKFILL` (ver D-14), para manter rastreabilidade completa desde o dia 1.
- **D-13:** Sem checkpoint de revisão manual antes de rodar o backfill em produção — a regra (D-11) é simples e uniforme o suficiente para rodar direto.

### Granularidade do audit trail
- **D-14:** A causa da mudança de status é um **enum fixo** (não texto livre) — valores conhecidos nesta fase: `REGISTRO` (trial inicial no cadastro) e `BACKFILL`. Fases futuras adicionam `WEBHOOK_PAGAMENTO`, `WORKER_DIARIO`, `CANCELAMENTO` etc. via migration quando chegarem — não pré-criar esses valores agora (YAGNI).
- **D-15:** Ativação de `acessoVitalicio` direto no banco (BILL-04, sem UI) **não gera auditoria automática** — limitação conhecida e aceita, consistente com "sem UI em v1". Quem ativa é responsável por registrar por fora (ex: comentário em PR/ticket).
- **D-16:** A auditoria só grava uma linha quando o status **realmente muda** (compara com o último status conhecido da Empresa) — nunca a cada execução de `avaliarAcesso`. Isso é obrigatório, não opcional: a função vai plugar em `revalidarConta` (D-04 da Fase 1) e rodar a cada request autenticado; gravar sempre geraria uma linha por request.
- **D-17:** A entrada de auditoria guarda apenas `status anterior`, `status novo`, `causa` e `horário` — sem snapshot dos 4 fatos de billing no momento da transição. Mais enxuto; investigação de "por que mudou" depende de outras fontes se necessário.

### Claude's Discretion
- Onde exatamente mora o efeito colateral de escrever a auditoria (wrapper que chama `avaliarAcesso` e compara com o último status persistido, vs. método de serviço) — desde que `avaliarAcesso` em si continue pura (D-16 exige comparação com estado anterior, que é responsabilidade de quem chama, não da função pura).
- Nome exato dos campos/enum no schema Prisma (`StatusAcesso`, `CausaTransicao` ou equivalente) e da tabela de auditoria.
- Estrutura exata do retorno de `avaliarAcesso` (string enum simples vs. objeto com metadados) — desde que os 6 valores e a precedência (D-03) sejam respeitados.
- Onde exatamente no fluxo de registro (`app/registro/actions.ts` vs. `empresaService.create`) o `trialFim` inicial é setado.
- Estratégia de migration para o backfill (script separado vs. dentro da própria migration do Prisma) — desde que D-11/D-12/D-13 sejam respeitados.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/ROADMAP.md` §"Phase 2: Modelo de Dados e Motor de Acesso" — goal e 5 success criteria desta fase, incluindo os exemplos de virada de data exata.
- `.planning/REQUIREMENTS.md` §"Modelo de Dados e Motor de Acesso" — BILL-01 a BILL-05 (texto completo).
- `.planning/PROJECT.md` §"Key Decisions" — decisões de projeto já travadas (status por Empresa não Usuario, trial de 14 dias, status derivado de datas, plano único) que esta fase implementa, não re-decide.

### Ponto de extensão da Fase 1 (D-04 do Phase 1)
- `.planning/phases/01-pr-requisitos-de-produ-o/01-CONTEXT.md` §D-04 — `revalidarConta` é o ponto de extensão natural para plugar `avaliarAcesso`; não construir infraestrutura de auth nova.
- `.planning/phases/01-pr-requisitos-de-produ-o/01-05-SUMMARY.md` — nota explícita de que INFRA-02 cobriu apenas a infraestrutura de revalidação; a regra de status de pagamento (esta fase) ainda precisa ser plugada.
- `lib/auth-guard.ts` — `revalidarConta(usuarioId, empresaId)`, interface `ContaAtiva` — assinatura atual e onde a checagem de acesso por billing deve entrar.

### Código existente relevante
- `prisma/schema.prisma` — modelo `Empresa` atual (sem nenhum campo de billing ainda) e `Usuario` — base para adicionar `acessoAte`, `trialFim`, `canceladoEm`, `acessoVitalicio` e a tabela de auditoria.
- `app/registro/actions.ts` — Server Action de registro, onde o trial de 14 dias (BILL-03) precisa ser setado na criação da Empresa.
- `app/services/empresa.service.ts` (`create`, linha ~222; uso transacional em `app/registro/actions.ts` linha ~57) — camada de serviço da Empresa, candidata a receber a lógica de trial inicial.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Padrão de enum Prisma já estabelecido (`UserRole`, `ModoInterface`) — reutilizar o mesmo estilo para o enum de status de acesso e o enum de causa de auditoria (D-14).
- `React.cache()` já usado em `revalidarConta` e `getEmpresaCatalogo()` — se `avaliarAcesso` for plugado em `revalidarConta`, herda o dedupe por-request automaticamente sem trabalho extra.

### Established Patterns
- Services (`app/services/*.service.ts`) concentram toda lógica de negócio e chamadas Prisma — a função pura `avaliarAcesso` provavelmente mora em `lib/` (paralelo a `auth-guard.ts`), não em `app/services/`, já que não faz I/O.
- Transação Prisma já usada em `app/registro/actions.ts` (linhas 57-65) para criar Empresa + Usuario atomicamente — o trial inicial deve entrar nessa mesma transação.

### Integration Points
- `lib/auth-guard.ts` → `revalidarConta` é onde `avaliarAcesso` se conecta ao fluxo de auth existente (por decisão D-04 da Fase 1).
- `app/registro/actions.ts` → ponto único onde toda Empresa nova é criada — é onde o trial de 14 dias entra em vigor (BILL-03).

</code_context>

<specifics>
## Specific Ideas

Nenhuma referência visual/UX específica — esta fase é modelo de dados + função pura, sem superfície de UI própria (o banner de carência é Fase 4, a tela de cancelamento é Fase 7).

</specifics>

<deferred>
## Deferred Ideas

- Detecção retroativa de ativação de `acessoVitalicio` fora da aplicação (trigger de banco ou diff periódico) — considerado e descartado para esta fase (D-15); pode voltar como ideia se a falta de rastreabilidade incomodar na prática.
- Snapshot dos 4 fatos de billing em cada entrada de auditoria — descartado por ora (D-17); revisitar se investigação de incidentes precisar de mais contexto histórico do que status+causa+horário oferece.
- Enum de causas com `WEBHOOK_PAGAMENTO`, `WORKER_DIARIO`, `CANCELAMENTO` — pertence às Fases 3, 5 e 7 respectivamente, quando esses fluxos existirem de verdade (D-14).

</deferred>

---

*Phase: 2-Modelo de Dados e Motor de Acesso*
*Context gathered: 2026-08-31*
