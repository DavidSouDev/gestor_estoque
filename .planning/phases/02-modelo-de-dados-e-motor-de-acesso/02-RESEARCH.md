# Phase 2: Modelo de Dados e Motor de Acesso - Research

**Researched:** 2026-08-31
**Domain:** Modelagem de dados de billing em Prisma/PostgreSQL + máquina de estados pura com semântica de fuso horário + trilha de auditoria
**Confidence:** HIGH (stack e padrões verificados no próprio repositório e nas docs empacotadas do Next 16.3 / skills do Prisma 7)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Semântica das datas de virada**
- **D-01:** Todas as comparações de `acessoAte`/`trialFim` contra "agora" usam o **fim do dia no fuso `America/Sao_Paulo`** (meia-noite local), não timestamp UTC puro. Mais intuitivo para o usuário final ("seu trial acaba dia 15") — exige normalização de fuso em todo lugar que grava ou compara essas datas.
- **D-02:** O limite é **inclusivo** — no instante exato em que `now` atinge `trialFim`/`acessoAte`, a empresa já é tratada como expirada (`>=`, não `>`). Isso dispara imediatamente a carência (ver D-04).
- **D-03:** `acessoVitalicio` tem **precedência absoluta** sobre todos os outros fatos — se `acessoVitalicio === true`, o status é sempre `vitalicio`, independente de `canceladoEm`, `acessoAte` ou `trialFim`. É checado primeiro, antes de qualquer outra regra.
- **D-04:** Trial expirando sem pagamento entra na **mesma carência de 10 dias** do atraso de pagamento — não vai direto para bloqueado. Esse é o mesmo mecanismo de carência que atraso de pagamento usa (Fase 4 aplica o banner/bloqueio real; esta fase só precisa que `avaliarAcesso` retorne `carencia` corretamente nesse caso).
- **D-05:** Se uma empresa em trial já tem `acessoAte` no futuro (pagou antes do trial acabar), o status continua `trial` até `trialFim` — não vira `em dia` cedo. A empresa não "perde" dias de trial não usados.

**Onde mora o "cancelado"**
- **D-06:** Enquanto `canceladoEm` está preenchido mas `acessoAte` ainda está no futuro, o status retornado é `em_dia` — o status reflete acesso real, não intenção futura de sair.
- **D-07:** Quando `acessoAte` de uma empresa cancelada vence, ela entra na mesma carência de 10 dias de todo mundo (reaproveita a máquina de estados de D-04).
- **D-08:** Se a carência também vencer sem reativação, o status final é **`cancelado`** — não `bloqueado`. Mesmo comportamento de bloqueio (Fase 4 aplica igual), mas rótulo distinto no enum retornado por `avaliarAcesso`, para diferenciar de quem simplesmente parou de pagar sem cancelar formalmente. Isso é o que faz `cancelado` ser um valor que a função de fato retorna, satisfazendo o critério do roadmap de 6 status possíveis.
- **D-09:** Um novo pagamento confirmado (novo `acessoAte` no futuro) **limpa `canceladoEm` automaticamente**, voltando a empresa para `em_dia`. `canceladoEm` não é um registro histórico permanente — é um fato ativo que reflete a intenção *atual*.
- **D-10:** `canceladoEm` só é setado por ação explícita do usuário (botão "cancelar assinatura", Fase 7) — nunca automaticamente por falta de pagamento. Não pagar gera carência/bloqueio via datas, nunca seta esse campo.

**Backfill de empresas existentes**
- **D-11:** Toda empresa já cadastrada antes desta fase recebe um **trial novo de 14 dias** no backfill (mesmo tratamento para todas, sem diferenciar por data de criação ou atividade recente) — trata como se tivesse acabado de se cadastrar.
- **D-12:** O backfill grava uma entrada na tabela de auditoria por empresa, com causa `BACKFILL` (ver D-14), para manter rastreabilidade completa desde o dia 1.
- **D-13:** Sem checkpoint de revisão manual antes de rodar o backfill em produção — a regra (D-11) é simples e uniforme o suficiente para rodar direto.

**Granularidade do audit trail**
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

### Deferred Ideas (OUT OF SCOPE)
- Detecção retroativa de ativação de `acessoVitalicio` fora da aplicação (trigger de banco ou diff periódico) — considerado e descartado para esta fase (D-15); pode voltar como ideia se a falta de rastreabilidade incomodar na prática.
- Snapshot dos 4 fatos de billing em cada entrada de auditoria — descartado por ora (D-17); revisitar se investigação de incidentes precisar de mais contexto histórico do que status+causa+horário oferece.
- Enum de causas com `WEBHOOK_PAGAMENTO`, `WORKER_DIARIO`, `CANCELAMENTO` — pertence às Fases 3, 5 e 7 respectivamente, quando esses fluxos existirem de verdade (D-14).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BILL-01 | Empresa armazena fatos de billing (`acessoAte`, `trialFim`, `canceladoEm`, `acessoVitalicio`) como fonte da verdade — não um "status" pré-calculado | `## Architecture Patterns` Pattern 1 (normalização na escrita) e Pattern 4 (migration aditiva); Code Examples 2 e 6 (schema + SQL). `## Open Questions` OQ-2 trata do único campo derivado (`ultimoStatusAuditado`) e de como provar que ele não é fonte da verdade |
| BILL-02 | Uma função pura de decisão (`avaliarAcesso`) determina o status de acesso a partir dos fatos armazenados e da data/hora atual | Pattern 2 (`agora` por parâmetro) + Code Example 3 (máquina de estados completa mapeada a D-01…D-08); Code Example 1 (helper de fuso verificado); Pitfalls 2, 5 e 6; `## Validation Architecture` mapeia 5 casos de teste |
| BILL-03 | Empresa nova recebe automaticamente 14 dias de trial no registro, sem exigir pagamento | Code Example 5 (trial dentro do `$transaction` existente de `registerComUsuario`); `## Open Questions` OQ-1 fixa a aritmética `+14` vs `+15` |
| BILL-04 | Acesso vitalício só pode ser concedido diretamente no banco de dados (sem UI) | **Pitfall 1** — o mass assignment em `PATCH /api/empresas/[id]` torna BILL-04 contornável hoje; `## Security Domain` (V4) exige o allowlist nesta fase; Code Example 3 implementa a precedência D-03 |
| BILL-05 | Toda mudança de status de acesso é registrada em uma tabela de auditoria | Pattern 3 (`after()` + compare-and-swap) e Code Example 4 (`acessoService.registrarTransicao`); Code Example 2 (model `AuditoriaAcesso` conforme D-17); Pitfall 3 (`after` fora de escopo de request); `## Open Questions` OQ-3 e OQ-4 delimitam o que fica descoberto até a Fase 5 |
</phase_requirements>

## Summary

Esta fase não introduz tecnologia nova. Tudo o que ela precisa já existe no repositório: enums do Prisma (`UserRole`, `ModoInterface`, `TipoMovimentacao`), migrations aditivas com `DEFAULT` (`20260828120439_add_categoria_e_branding`, `20260829135513_add_modo_interface_to_empresa`), transação interativa do Prisma (`empresaService.registerComUsuario`), `React.cache()` no DAL de auth (`lib/auth-guard.ts`) e testes unitários com `vi.useFakeTimers()` (`app/services/promocao.service.test.ts`). O trabalho real é de **corretude semântica**, não de integração.

Três achados dominam o planejamento. **Primeiro (bloqueador de segurança):** `PATCH /api/empresas/[id]` faz `const body = await request.json()` e repassa o objeto cru para `empresaService.update(id, body)`, que por sua vez repassa cru para `prisma.empresa.update({ data })`. `UpdateEmpresaDTO` é só um tipo de compilação — não filtra nada em runtime. No instante em que `acessoVitalicio`/`acessoAte` existirem na tabela `Empresa`, **qualquer ADMIN autenticado consegue se conceder acesso vitalício** com um único PATCH. Isso viola BILL-04 frontalmente e é ASVS V4 (Broken Access Control). O allowlist de campos tem que entrar nesta fase, junto com as colunas.

**Segundo:** a semântica de "fim do dia em `America/Sao_Paulo`" (D-01) deve ser resolvida **na escrita**, não na leitura. `trialFim`/`acessoAte` são gravados já como o instante UTC exato da meia-noite local; `avaliarAcesso` então compara instantes UTC puros com `>=` e continua trivialmente pura e determinística. Não existe biblioteca de datas no `package.json` e nenhuma é necessária — `Intl.DateTimeFormat` com `timeZone` funciona (ICU completo confirmado no Node deste ambiente), e o helper cabe em ~25 linhas. **Ressalva honesta:** a primeira versão que escrevi desse helper tinha um bug de ponto-fixo que só apareceu nas transições de DST históricas de 2017/2018. A implementação verificada está reproduzida abaixo em `## Code Examples` — copie-a, não a re-derive.

**Terceiro:** `avaliarAcesso` vai rodar dentro de `revalidarConta` (`React.cache()`), ou seja, **a cada request autenticado**, e D-16 exige gravar auditoria só na transição real. A combinação certa é: função pura para decidir + `after()` do `next/server` (estável desde 15.1, exportado e funcional nesta versão) para escrever fora do ciclo do response + `updateMany` condicional como compare-and-swap para tornar a gravação idempotente sob concorrência. `after()` **lança `E468` fora de escopo de request** — isso quebraria os testes unitários existentes e o worker da Fase 5 se chamado sem guarda.

**Primary recommendation:** Normalize os fatos de billing como instantes UTC de meia-noite em São Paulo no momento da escrita, mantenha `avaliarAcesso(fatos, agora)` como função pura em `lib/` recebendo `agora` por parâmetro, e faça a auditoria por um wrapper de serviço que usa compare-and-swap (`updateMany` + `count === 1`) agendado via `after()`. Corrija o mass-assignment de `empresaService.update` **na mesma fase** em que as colunas de billing nascem.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Persistir os 4 fatos de billing (BILL-01) | Database / Storage (`prisma/schema.prisma` + migration) | — | São colunas da `Empresa`; nenhuma lógica |
| Decidir o status a partir dos fatos (BILL-02) | Lib pura (`lib/`) | — | Sem I/O, sem Prisma, sem `new Date()` interno — paralelo a `lib/jwt.ts`, `lib/slug.ts` |
| Normalização de fuso (fim do dia SP) | Lib pura (`lib/`) | Database (só no backfill SQL) | Determinística; usada tanto no registro quanto nos testes |
| Setar trial de 14 dias no registro (BILL-03) | API/Backend — Service (`empresa.service.ts`) | Server Action (`app/registro/actions.ts`) | O trial tem que estar na **mesma transação** que cria Empresa+Usuario |
| Impedir concessão de vitalício via HTTP (BILL-04) | API/Backend — Service + Route Handler | — | Allowlist no service; validação no route handler |
| Gravar a trilha de auditoria (BILL-05) | API/Backend — Service (`acesso.service.ts` novo) | Database (índice + CAS) | Efeito colateral; nunca dentro da função pura |
| Agendar a escrita de auditoria fora do response | Frontend Server (SSR) — `after()` do Next | — | `after()` só existe no runtime de request do Next |
| Backfill das empresas existentes (D-11/D-12) | Database / Storage (SQL dentro da migration) | — | Uma passada; não pode depender do runtime da aplicação |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` + `prisma` | 7.9.1 (já instalado) | Schema, enums, migrations, transações | Já é o ORM do projeto; enums e migrations aditivas já são o padrão do repo |
| `@prisma/adapter-pg` + `pg` | 7.9.1 / 8.22.0 (já instalado) | Driver adapter PostgreSQL | Configuração vigente em `lib/prisma.ts` |
| `next` (`after` de `next/server`) | 16.3.0 (já instalado) | Agendar efeito colateral pós-response | `after` estável desde v15.1; suportado em Server Components, Server Functions, Route Handlers e Proxy |
| `Intl.DateTimeFormat` (stdlib Node) | Node 22 (CI) / 25 (dev) | Converter parede local `America/Sao_Paulo` ↔ instante UTC | Zero dependência nova; tzdata vem do ICU do Node |
| `vitest` + `vitest-mock-extended` | 4.1.10 / 5.1.1 (já instalado) | Testes da máquina de estados e do wrapper de auditoria | `vi.useFakeTimers()`/`vi.setSystemTime()` já usados em `promocao.service.test.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@playwright/test` | 1.62.1 (já instalado) | E2E do critério #1 (empresa nova recebe trial e usa o sistema) | Estender `e2e/cadastro-e-login.spec.ts` |
| PostgreSQL `AT TIME ZONE` | PG 16 (CI: `postgres:16`) | Fazer a mesma matemática de fuso dentro do SQL do backfill | Só na migration de backfill; não em queries de runtime |
| PostgreSQL `gen_random_uuid()` | PG 13+ (core, sem extensão) | Gerar `id` das linhas de auditoria inseridas via SQL cru no backfill | `@default(uuid())` do Prisma é gerado no cliente — SQL cru precisa da função do banco |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Helper `Intl` hand-rolled (~25 linhas) | `date-fns@4.4.0` + `@date-fns/tz@1.5.0` | Elimina o risco de erro na matemática de ponto-fixo, mas adiciona 2 dependências ao projeto que hoje tem **zero** libs de data. Só compensa se a Fase 4/7 precisar de formatação/aritmética de datas bem mais rica. |
| Helper `Intl` | `luxon@3.7.2` | API muito mais confortável para fuso (`DateTime.fromJSDate(d, { zone })`), porém pesada (~70kB) para um único helper e sem tree-shaking bom. |
| Helper `Intl` | Hardcode de `UTC−03:00` | Brasil aboliu o horário de verão pelo Decreto 9.772/2019 e `America/Sao_Paulo` é fixo em −03:00 desde então — hardcodar *funcionaria hoje*. Mas há discussão pública ativa sobre reintroduzir o DST; um `tzdata` atualizado quebraria silenciosamente o hardcode. Não vale o risco pelo que economiza. |
| Coluna `ultimoStatusAuditado` na `Empresa` | Consultar a última linha de `AuditoriaAcesso` por empresa | Ver `## Open Questions` OQ-2 — a coluna custa 0 queries extras por request; a consulta custa 1 query extra em **todo** request autenticado. |

**Installation:**
```bash
# Nenhuma dependência nova é necessária para esta fase.
# Apenas regenerar o cliente após alterar o schema:
npx prisma migrate dev --create-only --name add_billing_a_empresa
# (editar o SQL gerado para incluir o backfill — ver Pattern 4)
npx prisma migrate dev
npx prisma generate
```

**Version verification:** `npm view` executado nesta sessão. Nenhum pacote novo entra no `package.json` sob a recomendação principal.

## Package Legitimacy Audit

> Sob a recomendação principal **nenhum pacote novo é instalado**. A tabela cobre as alternativas avaliadas, para o caso de o planner optar por adicionar uma lib de data.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `date-fns@4.4.0` | npm | criado 2014-10-06 (~12 anos) | dezenas de milhões/semana | github.com/date-fns/date-fns | [OK] | Aprovado como alternativa; não recomendado |
| `@date-fns/tz@1.5.0` | npm | criado 2024-08-14 (~2 anos) | alto (pacote oficial do org date-fns) | github.com/date-fns/date-fns (mesmo monorepo) | [OK] | Aprovado como alternativa; não recomendado |
| `luxon@3.7.2` | npm | criado 2017-05-24 (~9 anos) | dezenas de milhões/semana | github.com/moment/luxon | [OK] | Aprovado como alternativa; não recomendado |

Nenhum dos três declara `scripts.postinstall` (`npm view <pkg> scripts.postinstall` retornou vazio para os três).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

> Nota de processo: `gsd-tools` não está instalado neste repositório (`.claude/gsd-core/bin/` não existe; binário ausente do PATH). Os seams `research-plan`, `research-store`, `classify-confidence` e `package-legitimacy check` não puderam ser executados. A verificação de legitimidade acima foi feita manualmente via `npm view` (idade, repositório de origem, `dist-tags`, `postinstall`), e os níveis de confiança foram atribuídos segundo a hierarquia documentada (docs empacotadas no `node_modules` e skills do projeto = HIGH; docs oficiais na web = MEDIUM/CITED; conhecimento de treino = ASSUMED).

## Architecture Patterns

### System Architecture Diagram

```
                      ESCRITA DOS FATOS (poucos pontos, todos server-side)
                      ────────────────────────────────────────────────────

  POST /registro (Server Action)
        │
        ▼
  empresaService.registerComUsuario()
        │  prisma.$transaction (JÁ EXISTE)
        ├──► empresa.create({ ..., trialFim: meiaNoiteEmSaoPaulo(agora, 15) })   ← BILL-03
        ├──► usuario.create({ ... })
        └──► auditoriaAcesso.create({ statusAnterior: null,
                                      statusNovo: TRIAL, causa: REGISTRO })       ← BILL-05
                                                     │
  migration SQL (uma vez)                            │
        └──► UPDATE Empresa SET trialFim = <SQL AT TIME ZONE>                     ← D-11
             INSERT INTO AuditoriaAcesso (... causa='BACKFILL')                   ← D-12

  webhook Asaas (FASE 3) ──► acessoAte / canceladoEm      [fora do escopo desta fase]
  DBA / psql            ──► acessoVitalicio = true         ← BILL-04 (sem auditoria, D-15)


                      LEITURA / DECISÃO (a cada request autenticado)
                      ──────────────────────────────────────────────

  page.tsx / layout.tsx / Server Action        route.ts (Bearer)
        │                                            │
        ▼                                            ▼
  requireAdminSession(slug)                     requireAuth(request)
        │                                            │
        └──────────────┬─────────────────────────────┘
                       ▼
              revalidarConta(usuarioId, empresaId)      [React.cache — 1x por request]
                       │
                       │  prisma.usuario.findFirst — select estendido para trazer
                       │  empresa: { acessoAte, trialFim, canceladoEm,
                       │             acessoVitalicio, ultimoStatusAuditado }
                       ▼
              ┌─────────────────────────────────────────────┐
              │  avaliarAcesso(fatos, agora)   ← FUNÇÃO PURA │
              │  1. acessoVitalicio?      → VITALICIO   D-03 │
              │  2. agora < trialFim?     → TRIAL       D-05 │
              │  3. agora < acessoAte?    → EM_DIA      D-06 │
              │  4. expiry = max(trialFim, acessoAte)        │
              │     agora < expiry+10d?   → CARENCIA  D-04/07│
              │  5. canceladoEm ? CANCELADO : BLOQUEADO  D-08│
              └─────────────────────────────────────────────┘
                       │
                       ├──► ContaAtiva { ..., statusAcesso }  ──► resposta ao usuário
                       │                                          (Fase 4 aplica bloqueio;
                       │                                           Fase 2 só expõe)
                       │
                       └──► status !== ultimoStatusAuditado ?
                                     │ sim
                                     ▼
                            after(() => registrarTransicao(...))    [pós-response]
                                     │
                                     ▼
                            prisma.$transaction:
                              updateMany({ where: { id, ultimoStatusAuditado: anterior },
                                           data: { ultimoStatusAuditado: novo } })
                              count === 1 ? auditoriaAcesso.create(...) : no-op   ← D-16
```

### Recommended Project Structure

```
lib/
├── fuso-sao-paulo.ts        # meiaNoiteEmSaoPaulo() — puro, sem I/O
├── fuso-sao-paulo.test.ts
├── avaliar-acesso.ts        # avaliarAcesso() + tipos — puro, sem Prisma, sem new Date()
├── avaliar-acesso.test.ts
└── auth-guard.ts            # MODIFICADO: select estendido + status no ContaAtiva

app/services/
├── acesso.service.ts        # registrarTransicao() — o ÚNICO lugar que escreve AuditoriaAcesso
├── acesso.service.test.ts
├── empresa.service.ts       # MODIFICADO: trial no registro + allowlist no update()
└── empresa.service.test.ts

prisma/
├── schema.prisma            # MODIFICADO: enums + 5 colunas + model AuditoriaAcesso
└── migrations/2026XXXX_add_billing_a_empresa/migration.sql   # DDL + backfill (D-11/D-12)
```

`avaliar-acesso.ts` mora em `lib/`, não em `app/services/`, porque a convenção do repositório é clara: `app/services/*.service.ts` concentra lógica que toca Prisma (todos os 6 services importam `@/lib/prisma`); `lib/*.ts` guarda utilitários puros (`jwt.ts`, `slug.ts`, `format.ts`, `serialize.ts`). `avaliarAcesso` não faz I/O. [VERIFIED: grep no repositório]

---

### Pattern 1: Fatos normalizados na escrita, comparação UTC pura na leitura

**What:** `trialFim` e `acessoAte` nunca guardam "uma data qualquer". Guardam sempre o **instante UTC da meia-noite em `America/Sao_Paulo`** que fecha o período. Toda a matemática de fuso acontece uma vez, no ponto de escrita.

**When to use:** Sempre que um dos 4 fatos for gravado — registro (Fase 2), backfill (Fase 2), webhook (Fase 3), worker (Fase 5).

**Why:** `avaliarAcesso` fica com comparações `agora >= trialFim` de instantes UTC — determinística, sem `Intl` no caminho quente, trivial de testar com `vi.setSystemTime`. Se a normalização ficasse na leitura, toda comparação teria que reconstruir o fuso e a pureza da função dependeria do tzdata do processo.

**Aritmética (o ponto exato que a fase precisa fixar):** `meiaNoiteEmSaoPaulo(instante, dias)` devolve `00:00` local do dia `(dia local de instante) + dias`. Ela é o **limite superior exclusivo** de um dia local. Combinada com D-02 (`>=` é expirado):

| Uso | Chamada | Significado |
|-----|---------|-------------|
| Trial no registro | `meiaNoiteEmSaoPaulo(agora, 15)` | acesso até o fim do 14º dia após o dia do cadastro (o dia do cadastro é dia 0) |
| Fim da carência | `meiaNoiteEmSaoPaulo(expiry, 10)` | `expiry` já é `00:00` de um dia local; +10 dias = 10 dias locais completos de carência |
| Período pago (Fase 3) | `meiaNoiteEmSaoPaulo(dataPagamento, 31)` | 30 dias completos + o resto do dia do pagamento |

Ver OQ-1: `15` vs `14` é a única escolha que D-01/D-02 não fecham sozinhas.

---

### Pattern 2: Função pura recebendo `agora` por parâmetro

**What:** `avaliarAcesso(fatos: FatosDeAcesso, agora: Date): ResultadoAcesso`. A função **nunca** chama `new Date()` internamente.

**When to use:** Sempre. Todo chamador passa `new Date()` explicitamente.

**Why:** Critério de sucesso #2 exige provar o comportamento "inclusive nas datas exatas de virada". Com `agora` injetado, o teste é uma tabela de casos sem `vi.useFakeTimers()`; sem injeção, cada caso vira setup de fake timer. `promocao.service.test.ts` já usa fake timers porque `listVigentesByEmpresa` chama `new Date()` por dentro — não repita esse acoplamento aqui.

**Retorno recomendado (área de discrição do CONTEXT):** objeto, não string.

```typescript
export interface ResultadoAcesso {
  status: StatusAcesso;      // enum do Prisma — 1 dos 6 valores
  expiraEm: Date | null;     // instante que fechou (ou vai fechar) o acesso
  carenciaAte: Date | null;  // preenchido em CARENCIA; null nos demais
}
```

`carenciaAte` existe porque ACC-01 (Fase 4) precisa exibir "dias restantes" no banner. Devolvê-lo agora evita que a Fase 4 re-derive a mesma aritmética num segundo lugar — que é exatamente como duas fontes da verdade nascem.

---

### Pattern 3: Auditoria por compare-and-swap, agendada com `after()`

**What:** A escrita da auditoria é (a) condicional a uma mudança real de status, (b) idempotente sob concorrência, e (c) fora do ciclo do response.

**When to use:** No wrapper que chama `avaliarAcesso` a partir de `revalidarConta`.

**Why cada parte:**

- **`after()`:** `revalidarConta` roda dentro do render de layouts e pages. Uma escrita no banco dentro do render bloqueia o TTFB de toda tela do admin e roda mesmo quando o render é abortado. `after` "allows you to schedule work to be executed after a response (or prerender) is finished... for tasks and other side effects that should not block the response, such as logging and analytics" e "will be executed even if the response didn't complete successfully" [CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md]. É o caso de uso literal descrito na doc.
- **Compare-and-swap:** dois requests concorrentes do mesmo admin (ex.: page + Server Action) observam a mesma transição e agendariam dois `after`. `updateMany` retorna `{ count: number }` [VERIFIED: `.agents/skills/prisma-client-api/references/model-queries.md:276`]; condicionar o `create` a `count === 1` faz o segundo virar no-op sem exceção nem constraint única artificial.
- **`React.cache()` já cobre o caso intra-request:** `revalidarConta` é `cache()`ada e é chamada com os mesmos argumentos por `getSession`/`requireAdminSession`/`getVerifiedSession` — layout + page + componentes do mesmo render compartilham uma execução, então `after` é agendado uma vez. A doc do Next confirma o inverso também: "You can use React `cache` to deduplicate functions called inside `after`." [CITED: after.md]

---

### Pattern 4: Migration aditiva com backfill no mesmo arquivo SQL

**What:** `prisma migrate dev --create-only`, editar o `migration.sql` para acrescentar os `UPDATE`/`INSERT` do backfill depois do DDL, e então aplicar.

**When to use:** Aqui, porque D-13 proíbe checkpoint manual e D-12 exige que a linha de auditoria de backfill exista desde o dia 1 — um script separado poderia não rodar.

**Why não precisa do dance "nullable → backfill → NOT NULL":** os 4 fatos de billing são **todos opcionais no schema**. `acessoAte`, `trialFim` e `canceladoEm` são `DateTime?` por natureza do domínio (uma empresa vitalícia não tem `acessoAte`); `acessoVitalicio` é `Boolean @default(false)`, que o PostgreSQL preenche para as linhas existentes no próprio `ADD COLUMN`. O padrão do repositório já é esse: `20260829135513` fez `ADD COLUMN "modoInterface" "ModoInterface" NOT NULL DEFAULT 'COMPLETO'` numa tabela com linhas, em um único statement. [VERIFIED: prisma/migrations]

**Compatibilidade com `prisma migrate deploy` no CI:** o workflow `.github/workflows/tests.yml` roda `npx prisma migrate deploy` contra um `postgres:16` **vazio** antes dos E2E. O backfill vai rodar contra zero linhas — inofensivo, mas o `UPDATE` precisa ser escrito para não falhar em tabela vazia (é, naturalmente).

---

### Anti-Patterns to Avoid

- **Coluna `statusAcesso` denormalizada como fonte da verdade.** BILL-01 e o goal da fase proíbem explicitamente ("derivado de fatos armazenados, nunca de um status pré-calculado"). Se a fase adotar `ultimoStatusAuditado` (OQ-2), o nome e o comentário do schema têm que deixar inequívoco que é bookkeeping de auditoria e que **nenhuma decisão de acesso pode lê-lo**.
- **`new Date()` dentro de `avaliarAcesso`.** Mata a testabilidade das viradas exatas (critério #2).
- **`Intl` dentro de `avaliarAcesso`.** Se os fatos foram normalizados na escrita (Pattern 1), a função pura não precisa saber que São Paulo existe. Fuso vazando para o motor de decisão é como a mesma regra acaba implementada duas vezes.
- **Passar o body cru para `prisma.empresa.update`.** É o estado atual do código e vira privilege escalation nesta fase. Ver Pitfall 1.
- **`after()` sem guarda dentro de `revalidarConta`.** Lança `E468` fora de escopo de request e derruba `lib/auth-guard.test.ts` inteiro + os 12 arquivos de teste de rota autenticada. Ver Pitfall 3.
- **Auditar a ativação de `acessoVitalicio`.** D-15 aceita explicitamente a falta de rastreabilidade. Não construa trigger de banco nem diff periódico — está em `## Deferred Ideas` do CONTEXT.
- **Pré-criar `WEBHOOK_PAGAMENTO` / `WORKER_DIARIO` / `CANCELAMENTO` no enum de causa.** D-14 proíbe (YAGNI). Cada um entra na sua fase, por migration.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Converter parede local ↔ instante UTC | Tabela de offsets, `-3` hardcoded, ou `new Date(\`${d}T00:00:00\`)` | `Intl.DateTimeFormat` com `timeZone` (helper de Pattern 1 / Code Example 1) | `new Date("2026-09-15T00:00:00")` (sem `Z`) resolve pelo fuso **do processo Node** — que é UTC no CI, provavelmente outro em produção. `app/[slug]/admin/(protected)/_lib/simples-actions.ts:137-138` já tem exatamente esse bug latente hoje. |
| Escrever auditoria só na mudança, com concorrência | `findFirst` da última linha + `if` + `create` | `updateMany` condicional + `count === 1` dentro de `$transaction` | Read-then-write não é atômico; dois requests simultâneos gravam duas linhas idênticas. |
| Adiar trabalho para depois do response | `setTimeout` / `void promise` solta / fila caseira | `after()` de `next/server` | `setTimeout` em serverless morre com a invocação; promise solta some do log e não é drenada no shutdown. O Next drena `after()` pendentes no `SIGTERM` [CITED: node_modules/next/dist/docs/01-app/02-guides/self-hosting.md:293-297]. |
| Deduplicar a avaliação dentro de um request | Cache manual em `globalThis`/`AsyncLocalStorage` | `React.cache()` — já aplicado em `revalidarConta` | Cache manual é cross-request e reintroduziria staleness; foi a decisão [01-02] registrada em STATE.md. |
| Gerar UUID em SQL de migration | Concatenar `md5(random())` | `gen_random_uuid()` | Está no core do PostgreSQL desde a 13; CI e dev local rodam PG 16. `@default(uuid())` do Prisma é gerado **no cliente** e não vale para `INSERT` cru. |
| Filtrar campos gravável de uma entidade | Confiar no tipo TypeScript do DTO | Destructuring/allowlist explícito em runtime | Tipos somem na compilação. `empresaService.create` já faz o mapeamento campo a campo — `update` é a exceção incoerente. |

**Key insight:** neste domínio, todo erro custa caro de forma assimétrica. Um bug de fuso de 1 hora bloqueia uma empresa pagante 1 dia antes; um bug de mass assignment dá acesso vitalício grátis a quem descobrir. As duas classes de erro são invisíveis em teste feliz e só aparecem em produção — por isso ambas precisam de teste de borda explícito nesta fase, não na Fase 4.

## Runtime State Inventory

> Fase de migração de dados (backfill sobre `Empresa` existente) — inventário obrigatório.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | Tabela `Empresa` no PostgreSQL — todas as linhas com `deletedAt IS NULL` precisam de `trialFim` (D-11) e uma linha em `AuditoriaAcesso` (D-12). Nenhum outro datastore existe no projeto (sem Redis, sem Mongo, sem cache externo — `package.json` confirma). Volume real desconhecido: o `.env` não é legível e não há credencial de banco disponível nesta sessão. | **Data migration** (SQL no `migration.sql`) + **code edit** (registro passa a setar `trialFim`). São tarefas distintas — ambas têm que aparecer no plano. |
| **Live service config** | Nenhum. Não há n8n, Datadog, Cloudflare Tunnel, Tailscale nem qualquer serviço externo com configuração fora do git. O único serviço externo do projeto é o Cloudflare R2 (`@aws-sdk/client-s3`), que não guarda estado de billing. Asaas ainda não existe (Fase 3). | Nenhuma |
| **OS-registered state** | Nenhum. Não há cron, systemd unit, pm2 nem Task Scheduler no repositório — a decisão de hosting/scheduler está listada como bloqueador em aberto no STATE.md e o worker é Fase 5. | Nenhuma |
| **Secrets/env vars** | Nenhum secret novo. Esta fase não introduz variável de ambiente. `DATABASE_URL` e `JWT_SECRET` seguem inalterados. (`CRON_SECRET` é da Fase 5.) | Nenhuma |
| **Build artifacts** | Cliente Prisma gerado em `node_modules/.prisma`. Após alterar o schema, os novos enums e campos só existem depois de `npx prisma generate`. O CI já roda `npx prisma generate` antes do lint e dos testes em **ambos** os jobs. | Rodar `npx prisma generate` localmente após a migration; nenhuma mudança de CI necessária. |

**Verificação de que o backfill não bloqueia ninguém (critério de sucesso #5):** com `trialFim = meiaNoiteEmSaoPaulo(agora, 15)` e `acessoAte`/`canceladoEm` nulos, `avaliarAcesso` cai na regra 2 (`agora < trialFim`) e devolve `TRIAL` para **toda** empresa existente. Nenhuma cai em `CARENCIA` ou `BLOQUEADO`. Isso é testável sem produção: um teste unitário sobre os fatos que o backfill produz.

## Common Pitfalls

### Pitfall 1: Mass assignment em `PATCH /api/empresas/[id]` vira concessão de acesso vitalício

**What goes wrong:** `app/api/empresas/[id]/route.ts:83-85` faz:

```typescript
const body = await request.json();
const empresa = await empresaService.update(id, body);
```

e `empresaService.update` (linha ~240) faz `prisma.empresa.update({ where: { id }, data })` com o objeto cru. Assim que `acessoVitalicio` existir na tabela, qualquer ADMIN autenticado (o token já passa no check `id !== auth.empresaId`, porque ele está editando a **própria** empresa) executa:

```
PATCH /api/empresas/<seu-proprio-id>
Authorization: Bearer <token legítimo>
{"acessoVitalicio": true}
```

e nunca mais paga. O mesmo vale para `acessoAte` e `canceladoEm`.

**Why it happens:** `UpdateEmpresaDTO` é uma `interface` TypeScript — apagada na compilação. Não há validação de schema em runtime em lugar nenhum do projeto (o próprio CLAUDE.md lista "Lack of Input Validation Middleware" como anti-pattern conhecido). O `create` do mesmo service já mapeia campo a campo; o `update` é a exceção.

**How to avoid:** allowlist explícito **no service** (não só no route handler — a Server Action `marca/actions.ts:73` também chama `update`):

```typescript
async update(id: string, data: UpdateEmpresaDTO) {
  const permitido: Prisma.EmpresaUpdateInput = {};
  if (data.nome !== undefined) permitido.nome = data.nome;
  if (data.slug !== undefined) permitido.slug = data.slug;
  // ... só os campos de UpdateEmpresaDTO. NUNCA acessoAte / trialFim /
  // canceladoEm / acessoVitalicio / ultimoStatusAuditado.
  return prisma.empresa.update({ where: { id }, data: permitido });
}
```

**Warning signs:** o teste existente `app/api/empresas/[id]/route.test.ts:95` afirma `toHaveBeenCalledWith(empresaId, { nome: "Novo nome" })` — ele passa hoje justamente porque o body cru é repassado. Um teste novo que envie `{ nome: "x", acessoVitalicio: true }` e verifique que o Prisma **não** recebeu `acessoVitalicio` é a prova de regressão. Sem esse teste, um refactor futuro reabre o buraco.

---

### Pitfall 2: Matemática de fuso hand-rolled erra nas transições de offset

**What goes wrong:** o algoritmo ingênuo "formatar a parede local, calcular o delta, subtrair" precisa iterar, e a iteração precisa medir o erro **sempre contra o alvo original** — não contra o valor corrente. Medir contra o corrente reaplica o offset e produz uma data errada por 1–2 horas.

**Why it happens:** é um ponto-fixo, não uma correção incremental. Escrevi a versão errada na primeira tentativa desta pesquisa; ela passou em todos os casos de 2026 (Brasil sem DST) e só falhou em `2018-02-17` e `2018-02-16` — datas que nenhum teste "óbvio" cobriria.

**How to avoid:** use a implementação verificada de Code Example 1 literalmente. E teste as datas de 2017/2018, mesmo sabendo que o produto só lida com datas futuras — é o único jeito de provar que o algoritmo é o correto e não o que "acerta por sorte porque o Brasil não tem mais DST".

**Warning signs:** o teste passa para todas as datas de 2026 mas falha para `2018-02-17T12:00:00Z` (resposta correta: `2018-02-18T03:00:00.000Z`) ou `2017-10-14T12:00:00Z` (resposta correta: `2017-10-15T02:00:00.000Z`).

---

### Pitfall 3: `after()` lança `E468` fora de escopo de request

**What goes wrong:** o código-fonte do Next 16.3 é explícito:

```javascript
// node_modules/next/dist/server/after/after.js:16-23
if (!workStore || !workUnitStore) {
    throw ... new Error('`after` was called outside a request scope. ...') // __NEXT_ERROR_CODE: "E468"
}
```

`revalidarConta` é executada em três contextos que **não** são escopo de request do Next: (a) `vitest` — `lib/auth-guard.test.ts` e os 12 arquivos de teste de rota autenticada, que hoje passam graças ao stub default em `tests/setup/prisma-mock.ts`; (b) o worker HTTP da Fase 5, se ele reusar o wrapper fora de um Route Handler; (c) qualquer script de manutenção.

**Why it happens:** `after` depende do `AsyncLocalStorage` que o Next só popula durante o processamento de um request.

**How to avoid:** isole o agendamento num helper que degrada para execução inline:

```typescript
// lib/agendar-pos-resposta.ts
import { after } from "next/server";

export function agendarPosResposta(tarefa: () => Promise<unknown>) {
  const seguro = () =>
    tarefa().catch((erro) => console.error("[acesso] efeito pós-resposta falhou:", erro));

  try {
    after(seguro);
  } catch {
    // Fora de escopo de request (teste unitário, worker, script):
    // executa inline em vez de perder o efeito.
    void seguro();
  }
}
```

**Warning signs:** a suíte inteira quebrando com `E468` / "was called outside a request scope" logo depois de plugar `avaliarAcesso` em `revalidarConta`.

---

### Pitfall 4: `AT TIME ZONE` na migration escrevendo o offset errado numa coluna `timestamp`

**What goes wrong:** o Prisma mapeia `DateTime` para `TIMESTAMP(3)` **sem** time zone [VERIFIED: `prisma/migrations/20260806115042_init/migration.sql:9`], e o driver trata o valor guardado como UTC. Já `<timestamp local> AT TIME ZONE 'America/Sao_Paulo'` devolve um `timestamp with time zone` [CITED: postgresql.org/docs/16/functions-datetime.html]. Atribuir um `timestamptz` a uma coluna `timestamp` faz o PostgreSQL converter usando o **parâmetro `TimeZone` da sessão** — que não é garantido em produção. Resultado: `trialFim` gravado com 3 horas de erro para todas as empresas existentes.

**Why it happens:** é a assimetria mais famosa do PostgreSQL, e o Prisma esconde o tipo real da coluna.

**How to avoid:** aplique `AT TIME ZONE` **duas vezes** — uma para transformar parede local em instante, outra para trazer o instante de volta a parede UTC:

```sql
UPDATE "Empresa"
SET "trialFim" = (
      (
        date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo') + interval '15 days')
        AT TIME ZONE 'America/Sao_Paulo'   -- timestamp -> timestamptz (instante real)
      ) AT TIME ZONE 'UTC'                 -- timestamptz -> timestamp (parede UTC)
    )
WHERE "deletedAt" IS NULL
  AND "trialFim" IS NULL;
```

**Warning signs:** rodar `SET timezone = 'America/Sao_Paulo'; <a migration>;` e `SET timezone = 'UTC'; <a migration>;` produzir valores diferentes. Com o duplo `AT TIME ZONE` são idênticos.

---

### Pitfall 5: `expiry` calculado só a partir de `acessoAte` (ou só de `trialFim`)

**What goes wrong:** uma empresa que pagou uma vez e parou tem `trialFim` no passado remoto **e** `acessoAte` no passado recente. Se a carência contar a partir de `trialFim`, ela nasce já vencida e a empresa é bloqueada no instante em que o pagamento vence — sem os 10 dias. O espelho também existe: uma empresa que nunca pagou tem `acessoAte` nulo.

**Why it happens:** D-04 e D-07 dizem "a mesma carência" mas não escrevem de onde ela conta quando os dois fatos existem.

**How to avoid:** `expiry = max(trialFim ?? -Infinity, acessoAte ?? -Infinity)` — sempre o fato que expirou **por último**. Cubra em teste as 4 combinações (ambos nulos / só trial / só acessoAte / ambos).

**Warning signs:** um teste com `trialFim` antigo + `acessoAte` recente devolvendo `BLOQUEADO` onde deveria devolver `CARENCIA`.

---

### Pitfall 6: `Empresa` sem nenhum fato de billing

**What goes wrong:** `trialFim = null`, `acessoAte = null`, `acessoVitalicio = false`. Não deveria acontecer depois do backfill, mas a coluna é nullable e nada no banco impede — um `INSERT` manual, um seed, ou uma condição de corrida na Fase 3.

**Why it happens:** o schema não consegue expressar "pelo menos um dos dois".

**How to avoid:** decida e teste explicitamente. Recomendação: **`BLOQUEADO`** (fail-closed), coerente com a decisão [01-02] registrada no STATE.md ("`revalidarConta` devolve null também em erro de banco"). Em Fase 2 isso é inofensivo (ninguém é bloqueado ainda); em Fase 4 evita que um registro corrompido conceda acesso ilimitado.

**Warning signs:** ausência de um caso de teste "todos os fatos nulos" na tabela de casos de `avaliarAcesso`.

---

### Pitfall 7: Ampliar o `select` de `revalidarConta` e vazar `senhaHash`

**What goes wrong:** para avaliar acesso, `revalidarConta` precisa dos campos de billing da `Empresa`. A tentação é trocar o `select` por `include: { empresa: true }`.

**Why it happens:** `include` é mais curto.

**How to avoid:** o comentário no próprio `lib/auth-guard.ts` já proíbe: "select explícito: nunca traz senhaHash (C-06). `include` é proibido no modelo Usuario justamente porque arrastaria o hash da senha." Estenda o `select` aninhado de `empresa` com os campos novos, mantendo a projeção explícita. O teste existente `lib/auth-guard.test.ts:27-42` afirma o formato do `where` — ele continua válido; o do `select` precisa ser estendido junto.

**Warning signs:** `grep -c "include" lib/auth-guard.ts` diferente de 0.

---

### Pitfall 8: `ContaAtiva` ganhar um campo e quebrar chamadores

**What goes wrong:** a decisão [01-03] registrada em STATE.md diz que `requireAdminSession`/`requireAuth` continuam devolvendo `AuthTokenPayload` porque mudar para `ContaAtiva` quebraria ~40 call sites.

**Why it happens:** o status de acesso naturalmente "quer" chegar às pages.

**How to avoid:** **acrescentar** `statusAcesso` a `ContaAtiva` é seguro (campo novo em interface de retorno não quebra nada). **Mudar o retorno** de `requireAdminSession` não é. A Fase 2 só precisa que o status seja calculado e auditado — nenhum consumidor de UI existe até a Fase 4. Não mexa nas assinaturas.

**Warning signs:** diff tocando `app/[slug]/admin/**/page.tsx` nesta fase.

## Code Examples

### 1. Helper de fuso — implementação verificada nesta sessão

```typescript
// lib/fuso-sao-paulo.ts
// VERIFICADO: executado no Node deste ambiente contra 8 casos, incluindo as
// transições históricas de horário de verão do Brasil (2017-10-15 inexistente,
// 2018-02-18 ambígua). Não re-derive este algoritmo — o erro de medir o desvio
// contra o valor corrente em vez de contra o alvo produz resultados 1-2h errados
// que só falham em datas com mudança de offset.

const FUSO = "America/Sao_Paulo";

const formatador = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function partes(instante: Date) {
  const p = Object.fromEntries(
    formatador.formatToParts(instante).map((x) => [x.type, x.value])
  ) as Record<string, string>;

  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    // ICU pode emitir "24" para meia-noite dependendo do locale/versão.
    hora: p.hour === "24" ? 0 : Number(p.hour),
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

/** A parede local do instante, reinterpretada como se fosse UTC. */
function paredeLocalComoUTC(instanteMs: number) {
  const p = partes(new Date(instanteMs));
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
}

/**
 * Instante UTC da meia-noite local de (dia local de `instante` + `deslocamentoDias`).
 *
 * Este é o LIMITE SUPERIOR EXCLUSIVO de um dia em São Paulo: combinado com a
 * comparação inclusiva de D-02 (`agora >= limite` já é expirado), representa
 * exatamente "o fim do dia local".
 */
export function meiaNoiteEmSaoPaulo(instante: Date, deslocamentoDias = 0): Date {
  const local = partes(instante);
  const alvo = Date.UTC(local.ano, local.mes - 1, local.dia + deslocamentoDias, 0, 0, 0, 0);

  let resultado = alvo;
  // Ponto-fixo: o desvio é SEMPRE medido contra `alvo`, nunca contra `resultado`.
  // Duas iterações bastam mesmo quando o próprio ajuste cruza uma mudança de offset.
  for (let i = 0; i < 2; i += 1) {
    const desvio = paredeLocalComoUTC(resultado) - alvo;
    if (desvio === 0) break;
    resultado -= desvio;
  }

  return new Date(resultado);
}
```

**Casos verificados (saída real desta sessão):**

| Entrada (UTC) | `meiaNoiteEmSaoPaulo(d, 1)` | `meiaNoiteEmSaoPaulo(d, 15)` | Nota |
|---|---|---|---|
| `2026-08-31T12:00:00Z` | `2026-09-01T03:00:00.000Z` | `2026-09-15T03:00:00.000Z` | dia normal |
| `2026-08-31T02:30:00Z` | `2026-08-31T03:00:00.000Z` | `2026-09-14T03:00:00.000Z` | 23:30 do dia 30 em SP — o dia local é o 30, não o 31 |
| `2026-12-31T20:00:00Z` | `2027-01-01T03:00:00.000Z` | `2027-01-15T03:00:00.000Z` | virada de ano |
| `2028-02-28T20:00:00Z` | `2028-02-29T03:00:00.000Z` | `2028-03-14T03:00:00.000Z` | ano bissexto |
| `2018-02-16T12:00:00Z` | `2018-02-17T02:00:00.000Z` | `2018-03-03T03:00:00.000Z` | dentro do DST antigo (−02), e o alvo +15d já fora dele |
| `2018-02-17T12:00:00Z` | `2018-02-18T03:00:00.000Z` | `2018-03-04T03:00:00.000Z` | meia-noite ambígua (fim do DST de 2018) |
| `2017-10-14T12:00:00Z` | `2017-10-15T02:00:00.000Z` | `2017-10-29T02:00:00.000Z` | meia-noite inexistente (início do DST de 2017) |

---

### 2. Enums e modelos no `prisma/schema.prisma`

```prisma
// Estilo copiado de UserRole / ModoInterface / TipoMovimentacao:
// tipo em PascalCase, valores em SCREAMING_SNAKE_CASE, sem @map.
enum StatusAcesso {
  TRIAL
  EM_DIA
  CARENCIA
  BLOQUEADO
  CANCELADO
  VITALICIO
}

// D-14: apenas os valores que existem HOJE. WEBHOOK_PAGAMENTO (Fase 3),
// WORKER_DIARIO (Fase 5) e CANCELAMENTO (Fase 7) entram por migration própria.
enum CausaTransicaoAcesso {
  REGISTRO
  BACKFILL
  AVALIACAO_SESSAO   // ver OQ-3
}

model Empresa {
  // ... campos existentes ...

  // Fatos de billing (BILL-01). Fonte da verdade. Instantes UTC já
  // normalizados para a meia-noite de America/Sao_Paulo (D-01).
  acessoAte       DateTime?
  trialFim        DateTime?
  canceladoEm     DateTime?
  acessoVitalicio Boolean   @default(false)

  // Bookkeeping de auditoria (D-16). NÃO é fonte da verdade e NENHUMA decisão
  // de acesso pode lê-lo: quem decide é sempre avaliarAcesso() sobre os 4 fatos
  // acima. Existe só para detectar transição sem uma segunda query por request.
  ultimoStatusAuditado StatusAcesso?

  auditoriasAcesso AuditoriaAcesso[]
}

model AuditoriaAcesso {
  id             String   @id @default(uuid())

  empresaId      String
  empresa        Empresa  @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  // Nulo apenas na primeiríssima entrada de cada empresa (REGISTRO / BACKFILL).
  statusAnterior StatusAcesso?
  statusNovo     StatusAcesso
  causa          CausaTransicaoAcesso

  createdAt      DateTime @default(now())

  // D-17: sem snapshot dos fatos de billing.

  @@index([empresaId, createdAt])
}
```

---

### 3. `avaliarAcesso` — a máquina de estados

```typescript
// lib/avaliar-acesso.ts
import { StatusAcesso } from "@prisma/client";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";

export const DIAS_DE_CARENCIA = 10;

export interface FatosDeAcesso {
  acessoAte: Date | null;
  trialFim: Date | null;
  canceladoEm: Date | null;
  acessoVitalicio: boolean;
}

export interface ResultadoAcesso {
  status: StatusAcesso;
  expiraEm: Date | null;
  carenciaAte: Date | null;
}

/**
 * Função PURA. Não faz I/O, não chama `new Date()`, não lê env.
 * `agora` é sempre injetado pelo chamador — é o que torna as viradas de data
 * exatas (critério de sucesso #2) testáveis sem fake timers.
 */
export function avaliarAcesso(fatos: FatosDeAcesso, agora: Date): ResultadoAcesso {
  // D-03: precedência absoluta, antes de qualquer outra regra.
  if (fatos.acessoVitalicio) {
    return { status: StatusAcesso.VITALICIO, expiraEm: null, carenciaAte: null };
  }

  // D-05: trial vale até o fim, mesmo com acessoAte já no futuro.
  // D-02: limite inclusivo — `agora >= trialFim` já é expirado.
  if (fatos.trialFim && agora < fatos.trialFim) {
    return { status: StatusAcesso.TRIAL, expiraEm: fatos.trialFim, carenciaAte: null };
  }

  // D-06: cancelamento pendente com acesso pago vigente ainda é "em dia".
  if (fatos.acessoAte && agora < fatos.acessoAte) {
    return { status: StatusAcesso.EM_DIA, expiraEm: fatos.acessoAte, carenciaAte: null };
  }

  // Expirado. A carência conta do fato que venceu POR ÚLTIMO (Pitfall 5).
  const candidatos = [fatos.trialFim, fatos.acessoAte].filter(
    (d): d is Date => d !== null
  );

  // Pitfall 6: sem nenhum fato, fail-closed.
  if (candidatos.length === 0) {
    return { status: StatusAcesso.BLOQUEADO, expiraEm: null, carenciaAte: null };
  }

  const expiraEm = new Date(Math.max(...candidatos.map((d) => d.getTime())));
  const carenciaAte = meiaNoiteEmSaoPaulo(expiraEm, DIAS_DE_CARENCIA);

  // D-04 e D-07: trial vencido e pagamento vencido usam a MESMA carência.
  if (agora < carenciaAte) {
    return { status: StatusAcesso.CARENCIA, expiraEm, carenciaAte };
  }

  // D-08: rótulo distinto para quem cancelou formalmente.
  return {
    status: fatos.canceladoEm ? StatusAcesso.CANCELADO : StatusAcesso.BLOQUEADO,
    expiraEm,
    carenciaAte,
  };
}
```

---

### 4. Wrapper de auditoria com compare-and-swap

```typescript
// app/services/acesso.service.ts
import { prisma } from "@/lib/prisma";
import { StatusAcesso, CausaTransicaoAcesso } from "@prisma/client";

class AcessoService {
  /**
   * Grava UMA linha de auditoria se, e somente se, o status persistido ainda
   * for `anterior` (D-16). O `updateMany` condicional é o compare-and-swap:
   * dois requests concorrentes que observam a mesma transição resultam em
   * exatamente uma linha — o segundo recebe count === 0 e vira no-op.
   */
  async registrarTransicao(params: {
    empresaId: string;
    anterior: StatusAcesso | null;
    novo: StatusAcesso;
    causa: CausaTransicaoAcesso;
  }) {
    if (params.anterior === params.novo) return null;

    return prisma.$transaction(async (tx) => {
      const { count } = await tx.empresa.updateMany({
        where: { id: params.empresaId, ultimoStatusAuditado: params.anterior },
        data: { ultimoStatusAuditado: params.novo },
      });

      if (count === 0) return null; // outro request já registrou esta transição

      return tx.auditoriaAcesso.create({
        data: {
          empresaId: params.empresaId,
          statusAnterior: params.anterior,
          statusNovo: params.novo,
          causa: params.causa,
        },
      });
    });
  }
}

export const acessoService = new AcessoService();
```

`prisma.empresa.updateMany` devolve `{ count: number }` [VERIFIED: `.agents/skills/prisma-client-api/references/model-queries.md:276`]. `where: { ultimoStatusAuditado: null }` é igualdade a NULL válida no Prisma — o primeiro registro pós-`REGISTRO`/`BACKFILL` funciona.

---

### 5. Trial de 14 dias dentro da transação de registro

```typescript
// app/services/empresa.service.ts — dentro de registerComUsuario
const agora = new Date();
const trialFim = meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1); // ver OQ-1

return await prisma.$transaction(async (tx) => {
  const empresa = await tx.empresa.create({
    data: {
      nome: data.nomeEmpresa,
      slug,
      modoInterface: data.modoInterface,
      trialFim,
      ultimoStatusAuditado: StatusAcesso.TRIAL,
    },
  });

  const usuario = await tx.usuario.create({ /* ... inalterado ... */ });

  // BILL-05: primeira entrada da trilha, na MESMA transação — se o registro
  // rollback, a auditoria some junto.
  await tx.auditoriaAcesso.create({
    data: {
      empresaId: empresa.id,
      statusAnterior: null,
      statusNovo: StatusAcesso.TRIAL,
      causa: CausaTransicaoAcesso.REGISTRO,
    },
  });

  return { empresa, usuario };
});
```

O `$transaction` interativo já existe neste método (`empresa.service.ts:56-78`) e os testes já o mockam com `prismaMock.$transaction.mockImplementation(cb => Promise.resolve(cb(prismaMock)))` (`empresa.service.test.ts:44-48`) — o mock continua valendo sem alteração.

---

### 6. SQL da migration (DDL + backfill)

```sql
-- CreateEnum
CREATE TYPE "StatusAcesso" AS ENUM ('TRIAL', 'EM_DIA', 'CARENCIA', 'BLOQUEADO', 'CANCELADO', 'VITALICIO');
CREATE TYPE "CausaTransicaoAcesso" AS ENUM ('REGISTRO', 'BACKFILL', 'AVALIACAO_SESSAO');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "acessoAte" TIMESTAMP(3),
ADD COLUMN     "trialFim" TIMESTAMP(3),
ADD COLUMN     "canceladoEm" TIMESTAMP(3),
ADD COLUMN     "acessoVitalicio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ultimoStatusAuditado" "StatusAcesso";

-- CreateTable
CREATE TABLE "AuditoriaAcesso" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "statusAnterior" "StatusAcesso",
    "statusNovo" "StatusAcesso" NOT NULL,
    "causa" "CausaTransicaoAcesso" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditoriaAcesso_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditoriaAcesso_empresaId_createdAt_idx" ON "AuditoriaAcesso"("empresaId", "createdAt");
ALTER TABLE "AuditoriaAcesso" ADD CONSTRAINT "AuditoriaAcesso_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Backfill (D-11, D-12, D-13) — ADICIONADO À MÃO após --create-only =====
-- Duplo AT TIME ZONE (Pitfall 4): parede local -> instante -> parede UTC,
-- para não depender do parâmetro TimeZone da sessão.
UPDATE "Empresa"
SET "trialFim" = (
      (
        date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo') + interval '15 days')
        AT TIME ZONE 'America/Sao_Paulo'
      ) AT TIME ZONE 'UTC'
    ),
    "ultimoStatusAuditado" = 'TRIAL'
WHERE "deletedAt" IS NULL
  AND "trialFim" IS NULL;

-- gen_random_uuid(): core do PostgreSQL desde a 13; @default(uuid()) do Prisma
-- é gerado no CLIENTE e não vale para INSERT cru.
INSERT INTO "AuditoriaAcesso" ("id", "empresaId", "statusAnterior", "statusNovo", "causa", "createdAt")
SELECT gen_random_uuid(), e."id", NULL, 'TRIAL', 'BACKFILL', now()
FROM "Empresa" e
WHERE e."deletedAt" IS NULL
  AND e."trialFim" IS NOT NULL;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `unstable_after` | `after` estável, importado de `next/server` | Next.js 15.1 | Sem prefixo `unstable_`, sem flag experimental [CITED: after.md, tabela Version History] |
| Bibliotecas de fuso obrigatórias (`moment-timezone`) | `Intl.DateTimeFormat` com `timeZone` + tzdata do ICU do Node | Node 13+ com full-icu; padrão desde Node 14 | Não é preciso dependência para converter parede local ↔ instante |
| `Temporal` como sucessor natural | **Ainda não disponível** — `globalThis.Temporal === undefined` no Node 25.9 deste ambiente | — | Não planeje usar `Temporal`; ele não existe no runtime do projeto [VERIFIED: executado nesta sessão] |
| `America/Sao_Paulo` com horário de verão | Offset fixo UTC−03:00 | Decreto 9.772, abril/2019 | As datas futuras deste produto nunca caem em transição de offset — mas há discussão pública sobre reintroduzir DST, então **não** hardcode `-3` |

**Deprecated/outdated:**
- `moment` / `moment-timezone`: em modo de manutenção declarado pelos autores; não usar em código novo.
- Confiar em `new Date("YYYY-MM-DDTHH:mm:ss")` sem `Z` para representar um horário de um fuso específico: o resultado depende do fuso do processo. Já presente em `app/[slug]/admin/(protected)/_lib/simples-actions.ts:137-138` e `:351-352` — **fora do escopo desta fase**, mas vale um todo.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O volume de `Empresa` em produção é pequeno o bastante para que `UPDATE` + `INSERT ... SELECT` sem batching rodem em segundos dentro da migration | Runtime State Inventory, Code Example 6 | Migration longa com lock na tabela `Empresa`; se houver >100k empresas, o backfill precisa ser em lotes. **Verificável antes de planejar:** `SELECT count(*) FROM "Empresa" WHERE "deletedAt" IS NULL` — não pude executar (sem credencial de banco nesta sessão) |
| A2 | O PostgreSQL de produção é 13+ (necessário para `gen_random_uuid()` no core) | Code Example 6 | `INSERT` do backfill falha com "function gen_random_uuid() does not exist". CI usa `postgres:16` e o cliente local é 16, mas produção não foi verificada. Mitigação barata: `CREATE EXTENSION IF NOT EXISTS pgcrypto;` no topo da migration |
| A3 | Nenhuma `Empresa` de produção já tem valor nos campos novos | Code Example 6 | Nenhum — as colunas estão sendo criadas nesta migration. Baixo risco; o `AND "trialFim" IS NULL` já é defensivo |
| A4 | O `revalidarConta` é o único ponto que precisa avaliar acesso nesta fase | Architecture Diagram | Se o catálogo público (`app/[slug]/_lib/empresa.ts`) também precisar do status já na Fase 2, falta um segundo ponto de integração. O CONTEXT coloca a despublicação do catálogo na Fase 4 (ACC-03), então o risco é baixo |
| A5 | Duas iterações do ponto-fixo bastam para qualquer fuso IANA | Code Example 1 | Um fuso com duas transições em menos de 24h quebraria — não existe caso real conhecido, e `America/Sao_Paulo` nunca teve |
| A6 | `after()` funciona chamado de dentro de uma função `React.cache()`ada | Pattern 3 | Se não funcionar, a alternativa é agendar no chamador (`session.ts` / `api-auth.ts`). A doc do Next afirma o inverso (usar `cache` dentro de `after`), não este sentido — **verificar com um teste de integração real** antes de fechar o plano |

## Open Questions

1. **OQ-1 — `trialFim` é `meiaNoiteEmSaoPaulo(agora, 14)` ou `(agora, 15)`?**
   - **O que se sabe:** BILL-03 diz "14 dias de trial". D-01 fixa que o limite é a meia-noite local; D-02 fixa que é inclusivo.
   - **O que não está claro:** se o dia do cadastro conta como o 1º dia do trial (`+14` → o usuário que se cadastra às 23h ganha 13 dias e 1 hora) ou como dia 0 (`+15` → sempre ≥14 dias completos).
   - **Recomendação:** `+15`. É a única opção em que a promessa "14 dias" nunca é menor que 14 dias reais, e a diferença de custo é uma noite. Defina uma constante `DIAS_DE_TRIAL = 14` e escreva `meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1)` com comentário, para que a intenção fique legível.

2. **OQ-2 — Coluna `ultimoStatusAuditado` na `Empresa`, ou consultar a última linha de `AuditoriaAcesso`?**
   - **O que se sabe:** D-16 exige comparar com "o último status conhecido da Empresa". BILL-01 proíbe um status pré-calculado como fonte da verdade.
   - **O que não está claro:** se uma coluna de bookkeeping fere ou não o espírito de BILL-01.
   - **Recomendação:** **coluna**. `revalidarConta` roda em todo request autenticado; ler a última linha de auditoria adiciona uma query por request (ou uma relação `take: 1` que o Prisma resolve como query separada), e o custo composto sobre o app inteiro é grande. A coluna custa zero. O que sustenta a conformidade com BILL-01 não é a ausência da coluna, mas a garantia de que **nenhum caminho de decisão a lê** — o que é verificável por `grep -rn "ultimoStatusAuditado"` e deve retornar exclusivamente `acesso.service.ts`, `auth-guard.ts` (escrita/comparação) e o schema. Torne isso um passo de verificação do plano.

3. **OQ-3 — A causa `AVALIACAO_SESSAO` deve existir nesta fase?**
   - **O que se sabe:** D-14 lista só `REGISTRO` e `BACKFILL` como "valores conhecidos nesta fase", e manda adicionar os demais quando os fluxos existirem. Mas D-16 diz literalmente que a função "vai plugar em `revalidarConta` e rodar a cada request autenticado" e justifica a comparação com o status anterior justamente para não gerar uma linha por request.
   - **O que não está claro:** se uma transição *observada durante um request* (ex.: o trial vence enquanto o admin está usando o sistema) deve gerar auditoria na Fase 2. Se sim, ela precisa de uma causa — e nenhum dos dois valores de D-14 serve.
   - **Recomendação:** **sim, criar `AVALIACAO_SESSAO`.** A leitura literal de D-14 (só 2 valores) e a de D-16 (a função roda a cada request e audita transições) são incompatíveis; D-16 é a mais específica e sua justificativa inteira só faz sentido se houver gravação a partir do request. Sem essa causa, o critério de sucesso #4 ("toda mudança de status fica registrada") fica descoberto para transições por passagem do tempo até a Fase 5 existir. **Se o operador preferir a leitura literal de D-14**, a alternativa é: Fase 2 pluga `avaliarAcesso` em `revalidarConta` apenas para **leitura** (expor `statusAcesso` em `ContaAtiva`), sem escrita de auditoria no caminho de request — e então `after()`, o helper `agendarPosResposta` e o compare-and-swap saem do escopo desta fase e voltam na Fase 5. Isso reduz bastante o tamanho da fase; vale levar à discussão.

4. **OQ-4 — Onde fica a auditoria de transições que ninguém observa?**
   - **O que se sabe:** uma empresa cujo admin nunca faz login não gera request, logo nenhuma transição dela é auditada na Fase 2.
   - **O que não está claro:** se isso conflita com o critério #4.
   - **Recomendação:** aceitar como limitação conhecida desta fase e documentar em `02-SUMMARY.md`. É exatamente o buraco que WRK-01 (Fase 5) fecha — o worker reconcilia **todas** as empresas, inclusive as inativas. Não construa um substituto agora.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Todo o projeto | ✓ | 25.9.0 (dev) / 22 (CI) | — |
| npm | Instalação/scripts | ✓ | (com Node 25) | — |
| PostgreSQL (servidor) | Migration, E2E | ✓ (servidor local ativo em `/var/run/postgresql:5432`) | 16 (cliente `psql` 16.15; CI usa `postgres:16`) | — |
| Credencial do banco de dev | Rodar a migration e validar o SQL de backfill | ✗ | — | `.env` não é legível nesta sessão e o papel `david` não existe no PG local. O SQL do backfill **não pôde ser executado** — foi validado contra a documentação oficial do PostgreSQL 16, não contra o banco. **Executar antes de aprovar o plano.** |
| ICU completo (`Intl` com tzdata) | Helper de fuso | ✓ | `Intl.supportedValuesOf('timeZone')` inclui `America/Sao_Paulo`; `timeZoneName: 'longOffset'` funciona | — |
| `Temporal` | (não usado) | ✗ | `undefined` no Node 25.9 | Usar `Intl` (é a recomendação principal, não um fallback) |
| `gsd-tools` | Seams de pesquisa e legitimidade de pacotes | ✗ | — | Verificações feitas manualmente (`npm view`, leitura das docs empacotadas, skills do projeto) — ver nota em `## Package Legitimacy Audit` |
| Prisma CLI (`npx prisma`) | `migrate dev --create-only`, `generate` | ✓ | 7.9.1 (dependência local) | — |
| Playwright + Chromium | E2E do critério #1 | ✓ (dependência declarada) | 1.62.1 | Rodar `npx playwright install --with-deps chromium` se ausente localmente |

**Missing dependencies with no fallback:**
- Credencial do banco de desenvolvimento. Nenhuma tarefa que **execute** a migration ou valide o backfill pode ser marcada como verificada sem ela.

**Missing dependencies with fallback:**
- `gsd-tools`: verificação manual documentada.
- `Temporal`: `Intl` cobre 100% da necessidade.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit/component) + Playwright 1.62.1 (E2E) |
| Config file | `vitest.config.mts` (jsdom default, `tests/setup/vitest.setup.ts`) / `playwright.config.ts` |
| Quick run command | `npx vitest run lib/fuso-sao-paulo.test.ts lib/avaliar-acesso.test.ts` |
| Full suite command | `npm run lint && npx tsc --noEmit && npm run test && npm run test:e2e` |

Convenção obrigatória: arquivos de teste que exercitam código server-side começam com `// @vitest-environment node` (o default do projeto é `jsdom`) — ver `lib/auth-guard.test.ts:1` e `app/services/empresa.service.test.ts:1`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILL-01 | Schema tem os 4 fatos + auditoria; migration aplica limpa | integration | `npx prisma migrate deploy && npx prisma validate` | ❌ Wave 0 (migration) |
| BILL-01 | `empresaService.update` **ignora** `acessoVitalicio`/`acessoAte`/`trialFim`/`canceladoEm` no payload | unit | `npx vitest run app/services/empresa.service.test.ts -t "não aceita campos de billing"` | ❌ Wave 0 |
| BILL-01 | `PATCH /api/empresas/[id]` com `{acessoVitalicio:true}` não chega ao Prisma | unit | `npx vitest run "app/api/empresas/[id]/route.test.ts"` | ✅ arquivo existe, caso novo |
| BILL-02 | `meiaNoiteEmSaoPaulo` acerta dia normal, virada de ano, bissexto e as 2 transições de DST históricas | unit | `npx vitest run lib/fuso-sao-paulo.test.ts` | ❌ Wave 0 |
| BILL-02 | `avaliarAcesso` devolve os 6 status, cobrindo `agora === trialFim`, `agora === acessoAte`, `agora === carenciaAte` (D-02 inclusivo) | unit | `npx vitest run lib/avaliar-acesso.test.ts` | ❌ Wave 0 |
| BILL-02 | `acessoVitalicio` vence `canceladoEm`+`acessoAte` vencido+`trialFim` vencido (D-03) | unit | `npx vitest run lib/avaliar-acesso.test.ts -t "vitalicio"` | ❌ Wave 0 |
| BILL-02 | Empresa em trial com `acessoAte` futuro continua `TRIAL` (D-05) | unit | `npx vitest run lib/avaliar-acesso.test.ts -t "trial"` | ❌ Wave 0 |
| BILL-02 | Carência conta do `max(trialFim, acessoAte)` (Pitfall 5) e fatos todos nulos → `BLOQUEADO` (Pitfall 6) | unit | `npx vitest run lib/avaliar-acesso.test.ts -t "carencia"` | ❌ Wave 0 |
| BILL-03 | `registerComUsuario` grava `trialFim` na mesma transação e cria a auditoria `REGISTRO` | unit | `npx vitest run app/services/empresa.service.test.ts -t "trial"` | ✅ arquivo existe, casos novos |
| BILL-03 | Empresa nova criada em `/registro` acessa o admin normalmente | e2e | `npx playwright test e2e/cadastro-e-login.spec.ts` | ✅ arquivo existe, asserção nova |
| BILL-04 | `acessoVitalicio=true` escrito direto no banco resulta em `VITALICIO` sem nenhuma outra mudança | unit | `npx vitest run lib/avaliar-acesso.test.ts -t "vitalicio"` | ❌ Wave 0 |
| BILL-05 | `registrarTransicao` não grava quando `anterior === novo` (D-16) | unit | `npx vitest run app/services/acesso.service.test.ts` | ❌ Wave 0 |
| BILL-05 | `registrarTransicao` vira no-op quando o CAS devolve `count === 0` (concorrência) | unit | `npx vitest run app/services/acesso.service.test.ts -t "concorr"` | ❌ Wave 0 |
| BILL-05 | Linha de auditoria carrega anterior, novo, causa e horário (D-17: e nada mais) | unit | `npx vitest run app/services/acesso.service.test.ts` | ❌ Wave 0 |
| Critério #5 | Fatos produzidos pelo backfill (`trialFim` futuro, demais nulos) → `TRIAL` para toda empresa | unit | `npx vitest run lib/avaliar-acesso.test.ts -t "backfill"` | ❌ Wave 0 |
| Regressão | Os 463 testes unitários da Fase 1 continuam verdes após estender o `select` de `revalidarConta` | unit | `npm run test` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run lib/fuso-sao-paulo.test.ts lib/avaliar-acesso.test.ts app/services/acesso.service.test.ts app/services/empresa.service.test.ts` (< 10s)
- **Per wave merge:** `npm run lint && npx tsc --noEmit && npm run test`
- **Phase gate:** `npm run test && npm run test:e2e` verdes + a migration aplicada com sucesso contra um banco real antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `lib/fuso-sao-paulo.test.ts` — cobre BILL-02 (semântica de D-01/D-02)
- [ ] `lib/avaliar-acesso.test.ts` — cobre BILL-02, BILL-04, critério #5
- [ ] `app/services/acesso.service.test.ts` — cobre BILL-05
- [ ] `prisma/migrations/<timestamp>_add_billing_a_empresa/migration.sql` — cobre BILL-01 + D-11/D-12
- [ ] Estender `tests/setup/prisma-mock.ts`: o stub default de `usuario.findFirst` (linhas 24-31) precisa ganhar `empresa: { slug, acessoAte, trialFim, canceladoEm, acessoVitalicio, ultimoStatusAuditado }`, senão `avaliarAcesso` recebe `undefined` e **todos** os testes de rota autenticada quebram de uma vez
- [ ] Mock de `after` para os testes que exercitam o caminho de auditoria (ou confiar no fallback inline de `agendarPosResposta` — decidir e documentar)
- Framework install: nenhum (Vitest e Playwright já instalados e configurados)

## Security Domain

### Applicable ASVS Categories (nível 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | não | Fase não toca login/senha/JWT |
| V3 Session Management | parcialmente | `revalidarConta` já revalida por request (INFRA-02, Fase 1); esta fase só estende o `select` — não alterar a semântica de sessão |
| V4 Access Control | **sim — crítico** | **Allowlist de campos em `empresaService.update`.** Sem ele, BILL-04 é contornável por um PATCH autenticado. Isolamento multi-tenant: toda query de `AuditoriaAcesso` filtra por `empresaId` (nenhum endpoint de leitura de auditoria é criado nesta fase — mantenha assim) |
| V5 Input Validation | sim | Os campos de billing **não têm entrada de usuário** nesta fase: são derivados do relógio do servidor (registro) ou do SQL (backfill). O controle é negativo — garantir que nenhuma rota permita escrevê-los |
| V6 Cryptography | não | Sem operação criptográfica nova |
| V7 Error Handling & Logging | sim | `AuditoriaAcesso` é a trilha de BILL-05. Falha ao gravar auditoria **não pode** derrubar o request — daí o `.catch` dentro de `agendarPosResposta`, com log prefixado `[acesso]` (mesma convenção de `[auth-guard]` adotada na Fase 1) |
| V8 Data Protection | sim | Nenhum dado de pagamento entra no banco (constraint PCI do projeto). Os 4 fatos são datas e um booleano — nada de PII nova. `AuditoriaAcesso` não guarda snapshot (D-17), o que reduz superfície |

### Known Threat Patterns for Next.js 16 + Prisma 7 + PostgreSQL

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Mass assignment: body cru → `prisma.update({ data })` | Elevation of Privilege | Allowlist explícito no service (Pitfall 1) — **presente hoje no código, tem que sair nesta fase** |
| Auto-concessão de benefício: tenant edita campo de billing da própria empresa | Elevation of Privilege | Idem; o check de `id !== auth.empresaId` **não protege**, porque o ataque é sobre a própria empresa |
| Race na escrita de auditoria gerando linhas duplicadas | Repudiation (trilha poluída) | Compare-and-swap `updateMany` + `count === 1` (Pattern 3) |
| Escrita no banco dentro do render, disparada por GET | Denial of Service | `after()` — o efeito sai do caminho do response |
| Falha silenciosa da auditoria (promise solta) | Repudiation | `.catch` com `console.error("[acesso] ...")`; a Fase 5 (worker) reconcilia o que se perder |
| Bypass do bloqueio por leitura de status stale | Elevation of Privilege | Nada nesta fase decide acesso a partir de `ultimoStatusAuditado`; apenas `avaliarAcesso` sobre os fatos decide. Verificação: `grep -rn "ultimoStatusAuditado"` só pode aparecer em `acesso.service.ts`, `auth-guard.ts` e no schema |
| SQL injection no backfill | Tampering | O SQL é estático dentro do `migration.sql`; sem interpolação, sem entrada de usuário |

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **AGENTS.md:** "This is NOT the Next.js you know" — consultar `node_modules/next/dist/docs/` antes de escrever código de Next. Feito nesta pesquisa para `after` (`01-app/03-api-reference/04-functions/after.md`) e self-hosting. O bloco no AGENTS.md é regravado por `next dev`: se ele aparecer no diff, comitar junto, não remover.
- **PCI / segurança:** nenhum dado de pagamento no banco próprio. Esta fase respeita: os 4 fatos são datas + booleano.
- **Compatibilidade:** mudanças de auth/bloqueio devem respeitar o isolamento por `empresaId` e não quebrar o catálogo público para empresas em dia. Esta fase não aplica bloqueio nenhum (isso é a Fase 4).
- **Modelo de dados:** status de pagamento é por **Empresa**; aceite de termos é por **Usuario**. Não misturar.
- **Imports:** sempre `@/` — nunca `../` entre diretórios.
- **Services:** classe + singleton `export const xService = new XService()`; um arquivo por entidade; testes co-localizados `[entity].service.test.ts`.
- **Erros:** `HttpError` / `AuthError` com `status`; `console.error` para o inesperado; mensagem genérica para o cliente.
- **Projeções Prisma:** `select` explícito nomeado no nível do módulo; `include` proibido em `Usuario` (arrasta `senhaHash`).
- **Enums Prisma:** tipo PascalCase, valores SCREAMING_SNAKE_CASE, sem `@map` (padrão de `UserRole`, `ModoInterface`, `TipoMovimentacao`).
- **Datas em colunas:** `DateTime` do Prisma → `TIMESTAMP(3)` sem fuso; o repositório nunca usou `@db.Timestamptz` — não introduzir divergência agora.
- **GSD:** edições de arquivo só por comando GSD (`/gsd-execute-phase` para esta fase).

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` — semântica de `after`, contextos suportados, comportamento em erro/redirect, dedupe com `React.cache`, tabela de versões (estável em 15.1)
- `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md:293-297` — `after` totalmente suportado com `next start`; drenagem de callbacks pendentes no `SIGTERM`
- `node_modules/next/dist/server/after/after.js` — código-fonte confirmando o throw `E468` fora de escopo de request
- `.agents/skills/prisma-client-api/references/model-queries.md:167-182,276` — `updateMany` retorna `{ count: number }`; `updateManyAndReturn`
- `.agents/skills/prisma-client-api/references/transactions.md` — `$transaction` interativo e sequencial
- `.agents/skills/prisma-cli/references/migrate-dev.md:24,55` — `--create-only` para editar o SQL antes de aplicar
- Repositório (leitura direta): `prisma/schema.prisma`, `prisma/migrations/*`, `lib/auth-guard.ts`, `lib/session.ts`, `lib/prisma.ts`, `lib/format.ts`, `app/services/empresa.service.ts`, `app/services/promocao.service.ts`, `app/registro/actions.ts`, `app/api/empresas/[id]/route.ts`, `tests/setup/prisma-mock.ts`, `vitest.config.mts`, `.github/workflows/tests.yml`, `package.json`, `prisma.config.ts`
- Execução direta nesta sessão: `node -e` confirmando `Temporal === undefined`, `Intl.supportedValuesOf('timeZone')` com `America/Sao_Paulo`, `timeZoneName: 'longOffset'` devolvendo `GMT-03:00` (2026) e `GMT-02:00` (2018); protótipo de `meiaNoiteEmSaoPaulo` validado contra 8 casos; `npm view` para `date-fns`, `@date-fns/tz`, `luxon`; `psql --version` = 16.15

### Secondary (MEDIUM confidence)
- `postgresql.org/docs/16/functions-datetime.html` — tabela oficial das duas variantes de `AT TIME ZONE` (`timestamp → timestamptz` e `timestamptz → timestamp`)
- `en.wikipedia.org/wiki/Daylight_saving_time_in_Brazil`, `timeanddate.com/news/time/brazil-scraps-dst.html` — Decreto 9.772/2019 aboliu o horário de verão; `America/Sao_Paulo` fixo em UTC−03:00
- `washingtonpost.com/world/2025/01/03/brazil-daylight-savings-climate-change-bolsonaro/` — discussão em curso sobre reintroduzir o DST (razão para não hardcodar o offset)

### Tertiary (LOW confidence)
- Nenhum claim desta pesquisa se apoia exclusivamente em busca web não confirmada.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — nenhuma dependência nova; tudo verificado no `package.json` e nas docs empacotadas
- Architecture: **HIGH** — todos os padrões têm análogo direto no repositório (transação do registro, `React.cache` do auth-guard, migration aditiva com default, enums)
- Semântica de fuso: **HIGH** — helper executado e validado contra 8 casos incluindo transições históricas de offset
- SQL do backfill: **MEDIUM** — semântica validada contra a documentação oficial do PostgreSQL 16, mas **não executada** (sem credencial de banco nesta sessão). Executar contra um banco real é pré-requisito para aprovar o plano
- Pitfalls: **HIGH** para 1, 2, 3, 4, 7, 8 (verificados no código/docs); **MEDIUM** para 5 e 6 (derivados por raciocínio sobre as decisões travadas, não observados em código)
- Segurança: **HIGH** — o mass assignment foi lido diretamente em `app/api/empresas/[id]/route.ts:83-85` e `app/services/empresa.service.ts`

**Research date:** 2026-08-31
**Valid until:** 2026-09-30 (stack estável: Prisma 7.9, Next 16.3, sem dependência nova). Reavaliar antes se o Next subir de major ou se o Brasil reintroduzir horário de verão.
