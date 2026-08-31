---
phase: 01-pr-requisitos-de-produ-o
plan: 05
subsystem: testing
tags: [verification, gate, playwright, vitest, eslint, typescript, postgres, pg_stat_activity, prisma, connection-pool, checkpoint]

# Dependency graph
requires:
  - phase: 01-pr-requisitos-de-produ-o (plano 01-01)
    provides: singleton do Prisma publicado em globalThis em todos os ambientes + lib/prisma.test.ts
  - phase: 01-pr-requisitos-de-produ-o (plano 01-02)
    provides: DAL lib/auth-guard.ts (revalidarConta, ContaAtiva) fail-closed e memoizado por request
  - phase: 01-pr-requisitos-de-produ-o (plano 01-03)
    provides: revalidação ligada em lib/session.ts e lib/api-auth.ts + stub default no setup de testes
  - phase: 01-pr-requisitos-de-produ-o (plano 01-04)
    provides: guardas públicas alinhadas ao DAL + e2e/sessao-revogada.spec.ts
provides:
  - "Gate automatizado da Fase 1 executado e registrado no mesmo estado do repositório (lint 0, tsc 0, 463 testes unitários, 20 e2e locais)"
  - "Evidência numérica real do critério de sucesso #1 do roadmap: pg_stat_activity 1 → 5 conexões sob carga mista, contra build de produção"
  - "Confirmação humana do critério de sucesso #4: admin, registro e catálogo público sem regressão para empresa ativa"
  - "01-VALIDATION.md fechado com nyquist_compliant: true — todas as 13 linhas do Per-Task Verification Map verdes"
  - "Dívidas explicitamente repassadas: sizing do pool para a fase de deploy/hosting, e o texto de status de pagamento do INFRA-02 para a Fase 2"
affects:
  - "fase 02 (INFRA-02 reaberto por D-04 para plugar avaliarAcesso dentro de revalidarConta)"
  - "fase 03 (webhooks — volume de conexões concorrentes ainda não medido)"
  - "fase 05 (worker diário — junto com a Fase 3 define o sizing definitivo do pool)"
  - "fase de deploy/hosting (max do pool e DATABASE_URL pooled vs. direta)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Medição de conexões reais feita contra `npm run build` + `npm start` — nunca contra `npm run dev`, porque o fix do singleton só passa a valer a partir de um build novo"
    - "Checkpoint bloqueante como antídoto a Repudiation (T-01-16): a fase não pode ser declarada concluída por inferência a partir de um teste de unidade que só prova o singleton por processo"
    - "Carga de verificação deliberadamente mista (páginas do admin + rota de API autenticada) para exercitar as duas camadas de bundle no mesmo processo — que é onde o bug do multi-client se manifestava"

key-files:
  created:
    - .planning/phases/01-pr-requisitos-de-produ-o/01-05-SUMMARY.md
  modified:
    - .planning/phases/01-pr-requisitos-de-produ-o/01-VALIDATION.md

key-decisions:
  - "nyquist_compliant só virou true depois da medição humana real — nunca por inferência a partir de lib/prisma.test.ts"
  - "INFRA-02 é declarado atendido nesta fase pela INFRAESTRUTURA de revalidação; a metade 'status de pagamento' do texto do requisito fica para a Fase 2 (D-04)"
  - "Sizing do max do pool e a escolha entre DATABASE_URL pooled vs. direta ficam para a fase de deploy/hosting, quando worker (Fase 5) e webhooks (Fase 3) existirem"
  - "Nenhum arquivo de produção foi tocado neste plano — é um plano de verificação, e um vermelho aqui reabriria o plano responsável em vez de ser remendado localmente"

patterns-established:
  - "Pattern: gate de fase executado na ordem lint → tsc → unit → e2e no MESMO estado do repositório, com exit code de cada um registrado individualmente"
  - "Pattern: asserção de fronteira da fase por diff contra `main` (proxy.ts, prisma/schema.prisma, migrations, package.json/lock) — os limites travados pelas decisões viram verificação executável, não promessa"

requirements-completed: [INFRA-01, INFRA-02]

# Metrics
duration: 58min
completed: 2026-08-31
---

# Phase 01 Plan 05: Gate automatizado da fase + checkpoint humano de conexões Summary

**A Fase 1 fecha com evidência real e não com inferência: o gate automatizado saiu verde no mesmo estado do repositório (lint 0, `tsc` 0, 463/463 unitários, 20/20 e2e locais) e o operador humano mediu `pg_stat_activity` contra um build de produção — 1 conexão antes, 5 depois de ~2 min de carga mista admin+API, bem abaixo do teto de 10 de um único pool, provando o critério de sucesso #1 que nenhum teste unitário conseguia provar.**

## Performance

- **Duration:** ~58 min de relógio (a maior parte é espera pelo `checkpoint:human-verify` bloqueante; o tempo de agente foi de ~10 min em duas sessões)
- **Started:** 2026-08-31T16:20:00Z (aprox., início da Task 1)
- **Completed:** 2026-08-31T17:22:41Z
- **Tasks:** 2 (1 automatizada + 1 checkpoint humano bloqueante)
- **Files created:** 1 — **Files modified:** 1 (ambos em `.planning/` — **zero arquivos de produção tocados**)

## Accomplishments

- **Critério de sucesso #1 do roadmap comprovado com números reais.** `lib/prisma.test.ts` prova o singleton *por processo*; ele não diz nada sobre conexões reais de banco. A medição humana fecha essa lacuna: **1 → 5** conexões atribuíveis à aplicação, contra `npm run build` + `npm start`, depois de ~2 minutos de carga mista. INFRA-01 está fechado com evidência, não com argumento.
- **Critério de sucesso #4 confirmado por um humano**, que é a única forma de verificar "nada mudou para quem está em dia" depois de uma mudança que altera o comportamento de auth em runtime para todas as sessões vivas. Os 5 fluxos (registro→admin, telas do admin, logout+login, catálogo anônimo, ausência de lentidão) passaram.
- **O gate automatizado da fase inteira rodou no mesmo estado do repositório**, na ordem `lint` → `tsc --noEmit` → `vitest run` → `playwright test`, todos com exit 0. A suíte e2e rodou **localmente** contra Postgres real, não delegada ao CI.
- **Os limites travados da fase foram verificados por diff contra `main`, não assumidos:** `proxy.ts` intocado (D-06), `prisma/schema.prisma` intocado, zero migrations, zero dependências novas (T-01-SC), zero lógica de pagamento antecipada (D-04).
- **`01-VALIDATION.md` fechado:** 13/13 linhas do Per-Task Verification Map verdes, `nyquist_compliant: true`, `status: complete`. O T-01-16 (fase declarada concluída sem evidência do critério #1) está mitigado pelo próprio registro.
- **Um erro de transcrição foi corrigido em vez de ignorado:** o SUMMARY do 01-03 reportava 9 testes em `lib/api-auth.test.ts`; a contagem real é 8. O gate daquele plano exigia `≥4` casos novos e continua atendido — mas o registro agora bate com a realidade.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | Executar o gate automatizado completo da fase | `f926667` | docs |
| — | Registrar a pausa no checkpoint bloqueante em `STATE.md` | `cb007b2` | docs |
| 2 | Registrar a aprovação humana em `01-VALIDATION.md` | ver "Plan metadata" | docs |

Nenhum commit de `feat`/`fix`/`test`/`refactor`: por desenho, este plano não escreve código.

## Resultado do checkpoint humano (Task 2)

**Veredito do operador: "aprovado".**

### Parte A — estabilidade de conexões (critério de sucesso #1)

Condições da medição, exatamente como o plano exigia:

- Aplicação subida em **modo de produção**: `npm run build` seguido de `npm start` (não `npm run dev` — o fix do singleton só vale a partir de um build novo)
- Query executada em um cliente SQL contra o **mesmo banco**:
  `SELECT count(*) AS conexoes, application_name, state FROM pg_stat_activity WHERE datname = current_database() GROUP BY application_name, state ORDER BY conexoes DESC;`
- Carga: **~2 minutos** misturando **páginas do admin logado** (`/{slug}/admin`, navegação e recargas repetidas) **e rota de API autenticada** em laço — a mistura é o ponto, porque o bug original vivia justamente na fronteira entre camadas de bundle diferentes do mesmo processo

**Os dois números:**

| Momento | Conexões da aplicação | Composição observada |
|---------|----------------------|----------------------|
| **Antes** da carga | **1 total, sendo 0 da aplicação** | uma única linha `application_name=psql`, `state=active` — o próprio cliente SQL do operador |
| **Depois** da carga | **5** | 5 conexões `idle` sem `application_name` (da aplicação) + a mesma 1 do `psql` |

**Leitura:** 5 ≤ 10 (o `max` default do pool do `pg`), **não é múltiplo de 10** e **não cresceu proporcionalmente ao volume de requests** — os três sinais que o plano definiu como aprovação. Isso é consistente com **um único `PrismaClient` e um único pool reaproveitado**. Se ainda houvesse mais de um client vivo, o esperado seria um teto múltiplo de 10 ou crescimento contínuo.

**Ressalva honesta:** não houve uma terceira medição para provar platô por repetição. A evidência disponível é a comparação antes/depois e o fato de o número final ficar bem abaixo do teto de um pool único — o suficiente para o critério, mas vale dizer o que foi e o que não foi medido.

### Parte B — ausência de regressão (critério de sucesso #4)

Todos os 5 fluxos foram exercitados pelo operador com uma empresa ativa. Resultado literal reportado: *"testei tudo, funcionou normal"*.

| # | Fluxo | Resultado |
|---|-------|-----------|
| 6 | `/registro` — cadastrar empresa nova e cair direto no painel | **ok** |
| 7 | `/{slug}/admin` — navegar por produtos, estoque, combos e promoções sem redirect inesperado | **ok** |
| 8 | Logout e login de novo pelo formulário | **ok** |
| 9 | `/{slug}` — catálogo público em janela anônima, sem sessão | **ok** |
| 10 | Ausência de lentidão perceptível no admin logado | **ok** |

Nenhum problema encontrado, nenhum plano reaberto. O catálogo público segue sem gate por pagamento — isso é a Fase 4, e o operador confirmou que ele aparece normalmente.

### Parte C — anotação operacional

O operador **confirmou explicitamente ciência do item 11**: a partir desta fase, por decisão travada D-01 (fail-closed), uma indisponibilidade do Postgres expulsa todos os admins logados e devolve 401 em todas as rotas de API.

## Registros obrigatórios do plano

### INFRA-02 e a Fase 2

O texto do requisito INFRA-02 fala em **"status de pagamento"** — algo que **não existe nesta fase**. Para não deixar dívida implícita, o escopo fica explícito:

- **Atendido aqui:** a **infraestrutura** de revalidação (D-02). Toda decisão de autorização — admin, API e as duas guardas públicas — passa a consultar o banco a cada request através do mesmo DAL (`revalidarConta`), fail-closed.
- **Reaberto na Fase 2 (D-04):** plugar `avaliarAcesso` **dentro** de `revalidarConta`. Quando isso acontecer, o bloqueio por pagamento propaga sozinho para o admin, para a API e para as guardas públicas — **nenhuma delas precisará de nova edição**, porque todas já consomem a mesma verdade. É exatamente por isso que a ordem das fases é esta.
- Marcar INFRA-02 como concluído nesta fase significa "a via está construída", não "a regra de pagamento existe". A Fase 2 deve tratar o requisito como reaberto.

### Dívida repassada à fase de deploy/hosting

Duas decisões de infraestrutura foram deliberadamente **adiadas**, porque hoje faltariam os dados para decidir bem (RESEARCH § Open Questions #5):

1. **Dimensionar o `max` do pool.** O default do `pg` é 10 por processo. O número certo depende de quantos processos a plataforma de hosting vai rodar e de quanta concorrência o worker e os webhooks vão trazer.
2. **`DATABASE_URL` pooled vs. direta.** Depende do provedor escolhido e de se haverá um pooler externo (PgBouncer/Supavisor) na frente.

Ambas só podem ser decididas depois que o **worker (Fase 5)** e os **webhooks (Fase 3)** existirem, porque são eles que definem o perfil de concorrência real. A medição desta fase (5 conexões para tráfego interativo de um processo) é a linha de base para essa conversa, não a resposta dela. Isso continua registrado nos blockers do `STATE.md` como "Decisão de hosting/scheduler e estratégia de pooling do Prisma".

### Nota operacional (D-01 / T-01-10)

**Um pico de 401s e redirects em produção pode significar Postgres indisponível, não sessões revogadas.**

Esta é a consequência **aceita** de D-01 (fail-closed): `revalidarConta` devolve `null` também em erro de banco, então uma queda do Postgres expulsa todos os admins logados e devolve 401 em todas as rotas de API — sintoma idêntico ao de contas revogadas em massa.

**O sinal que distingue os dois casos é o prefixo `[auth-guard]` nos logs do servidor** (`console.error("[auth-guard] ...")`). Conta revogada é um caminho silencioso e esperado; falha de infraestrutura é logada com esse prefixo. Quem estiver de plantão precisa saber disso — é o primeiro lugar para olhar antes de suspeitar de invalidação de sessões.

### Sessões vivas no momento do deploy

**Todo JWT de 7 dias já emitido passa a ser revalidado no primeiro request após o deploy.** Não há migração de sessão, não há invalidação em massa, ninguém precisa fazer login de novo:

- **Contas ativas não notam diferença.** É uma consulta a mais por request, memoizada por request via `React.cache` — confirmado pela Parte B (nenhuma lentidão perceptível).
- **Contas revogadas caem na hora**, sem esperar os 7 dias do JWT. **Esse é o objetivo da fase**, não um efeito colateral: é o critério de sucesso #3 do roadmap.

## Notas carregadas adiante (não são bloqueios)

- **Flake de `e2e/combo-crud.spec.ts:88`** — registrado no SUMMARY do plano 01-04, onde falhou na primeira tentativa dentro da suíte completa e passou no retry. **Não reapareceu nesta execução:** os 20 testes passaram de primeira, sem retry. Não é regressão desta fase — o arquivo não foi tocado e não usa nenhuma das superfícies alteradas; isolado com `--retries=0` ele passa limpo. Fica como ruído conhecido da suíte e2e local (lentidão de compilação sob demanda do `next dev` sob carga sequencial).
- **Warning de lint pré-existente** — `'Link' is defined but never used` em `app/registro/page.tsx`. `npm run lint` continua saindo com **exit 0** (0 errors, 1 warning). Foi deliberadamente **deixado quieto**: o acceptance criteria do plano 01-04 travava o diff daquele arquivo em 4 linhas, e remover o import gastaria a quinta. Item cosmético, fora do escopo desta fase — candidato natural a um `/gsd-quick`.

## Files Created/Modified

- `.planning/phases/01-pr-requisitos-de-produ-o/01-VALIDATION.md` — linha manual `01-01-03` marcada como verde com os dois números (1 → 5) e a nota da Parte B; `nyquist_compliant` virado para `true`; `status` para `complete`; `human_checkpoint_approved: 2026-08-31` adicionado; seções "Status da verificação manual" e "Validation Sign-Off" reescritas com o resultado real das Partes A, B e C.
- `.planning/phases/01-pr-requisitos-de-produ-o/01-05-SUMMARY.md` — este arquivo.

**Nenhum arquivo de produção foi tocado por este plano.** Confirmado: as únicas modificações estão sob `.planning/`.

## Decisions Made

- **`nyquist_compliant` só virou `true` depois da medição humana.** A Task 1 deixou o flag em `false` de propósito mesmo com tudo automatizado verde, porque uma linha manual continuava aberta. Virar o flag por inferência a partir de `lib/prisma.test.ts` seria exatamente o T-01-16 (Repudiation) se concretizando.
- **O `status` do frontmatter do VALIDATION foi para `complete`.** O template do GSD só documenta o valor inicial `draft` e nenhum consumidor lê esse campo (só `nyquist_compliant` e `wave_0_complete` são lidos, por `audit-milestone`), então `complete` foi escolhido por consistência com o vocabulário de status do resto do fluxo.
- **A Fase 1 não é marcada como concluída no `ROADMAP.md` por este plano.** Apenas a linha do plano `01-05` foi fechada. Marcar a fase é do orquestrador, depois da verificação de fase — este SUMMARY é insumo dela, não substituto.
- **A ressalva sobre a ausência de uma terceira medição ficou registrada.** Seria fácil escrever "conexões estáveis" e seguir em frente; o que foi medido é uma comparação antes/depois com o número final abaixo do teto de um pool. O critério está atendido, e o que não foi medido está dito.

## Deviations from Plan

**None** — o plano foi executado exatamente como escrito. Zero desvios das Rules 1-4, zero decisões arquiteturais, zero auto-fixes. O único checkpoint do plano era previsto e foi respeitado como bloqueante: a execução parou de verdade e só retomou com a resposta do humano.

## Issues Encountered

Nenhum problema de execução. Dois pontos de registro, ambos já detalhados acima e nenhum deles bloqueante: o flake conhecido de `combo-crud.spec.ts` (que não reproduziu) e o warning de lint do `Link` não usado (deliberadamente fora de escopo).

Um ponto de processo digno de nota: o `checkpoint:human-verify` com `gate="blocking"` funcionou como desenhado — não foi auto-aprovável, e a fase ficou parada até existir um número real. Foi essa fricção que produziu a única evidência que a fase não conseguia gerar sozinha.

## Verification

| Verificação | Resultado |
|-------------|-----------|
| `npm run lint` | exit **0** — 0 errors, 1 warning pré-existente |
| `npx tsc --noEmit` | exit **0** — nenhum erro de tipo |
| `npm test` (`vitest run`) | exit **0** — **67 arquivos, 463 testes, 463 passed, 0 failed** (9.28s) |
| `npm run test:e2e` (`playwright test`) | exit **0** — **20 testes, 20 passed** (37.1s), local, sem retry e sem flake |
| `git diff --name-only main -- proxy.ts` | vazio ✅ (D-06 respeitado na fase inteira) |
| `git diff --name-only main -- prisma/schema.prisma` | vazio ✅ |
| `git diff --name-only main -- prisma/migrations` | vazio ✅ |
| `git diff --stat main -- package.json package-lock.json` | vazio ✅ (T-01-SC — zero instalações) |
| `grep -rcE "acessoAte\|trialFim\|canceladoEm\|acessoVitalicio" lib/ app/` | vazio ✅ (D-04 — nenhuma lógica de pagamento antecipada) |
| `pg_stat_activity` antes / depois da carga | **1 / 5** ✅ — abaixo do `max` default de 10, não múltiplo de 10, sem crescimento contínuo |
| Fluxos manuais 6-10 (Parte B) | **5/5 ok** ✅ — "testei tudo, funcionou normal" |
| Ciência do item 11 (Parte C / T-01-10) | ✅ confirmada explicitamente pelo operador |
| Linhas do Per-Task Verification Map | **13/13 verdes** ✅ — nenhuma `⬜ pending` |
| `nyquist_compliant` no frontmatter do VALIDATION | **`true`** ✅ |

A suíte e2e rodou **localmente**, não delegada ao CI: `pg_isready` retornou `/var/run/postgresql:5432 - accepting connections`, então não foi necessário apontar para um run do GitHub Actions.

## Threat Model Coverage

| Threat ID | Estado |
|-----------|--------|
| T-01-07 (DoS — esgotamento do pool de conexões) | **mitigado** — medição direta de `pg_stat_activity` antes/depois de carga mista sob `npm run build` + `npm start`: 1 → 5 conexões, abaixo do teto de um único pool. O caminho que exercita camadas de bundle distintas no mesmo processo foi de fato exercitado |
| T-01-10 (fail-closed derrubando sessões quando o banco cai) | **aceito** — consequência travada por D-01. Mitigação operacional entregue: reconhecimento explícito do operador na Parte C e a nota do prefixo `[auth-guard]` registrada neste SUMMARY para quem estiver de plantão |
| T-01-16 (Repudiation — fase declarada concluída sem evidência do critério #1) | **mitigado** — os dois números estão registrados aqui e no `01-VALIDATION.md`; o checkpoint era `gate="blocking"` e não auto-aprovável, e a execução de fato parou até a resposta humana chegar |
| T-01-03 (EoP — regressão silenciosa reintroduzindo confiança só na borda) | **mitigado** — `git diff --name-only main -- proxy.ts` vazio na fase inteira (D-06) |
| T-01-SC (Tampering — instalações npm) | **aceito** — diff de `package.json`/`package-lock.json` contra `main` vazio: a fase terminou com **zero dependências adicionadas** |

## Threat Flags

Nenhuma superfície de segurança nova. Este plano não introduziu endpoint, caminho de auth, acesso a arquivo nem alteração de schema — ele apenas executou verificações e escreveu documentação sob `.planning/`.

## Known Stubs

Nenhum. Nenhum valor hardcoded, placeholder ou componente sem fonte de dados foi introduzido — nenhum arquivo de produção foi tocado.

## User Setup Required

None — nenhuma configuração de serviço externo, variável de ambiente ou migration nesta fase.

Para reproduzir a verificação: Postgres ativo com `DATABASE_URL` no `.env`, `npm run build` seguido de `npm start`, e um cliente SQL apontado para o mesmo banco. O servidor de produção subido para o checkpoint foi encerrado ao fim deste plano.

## Next Phase Readiness

- **Fase 1 funcionalmente completa**, com os 4 critérios de sucesso do roadmap cobertos: #1 por medição real de `pg_stat_activity`, #2 e #3 por unidade + e2e contra Postgres real (planos 01-03 e 01-04), #4 pela suíte automatizada **e** pela confirmação humana dos 5 fluxos.
- **Fase 2 desbloqueada.** A entrada é conhecida e estreita: `avaliarAcesso` entra **dentro** de `revalidarConta` em `lib/auth-guard.ts` (D-04), e o bloqueio por pagamento propaga sozinho para admin, API e guardas públicas — sem novas edições nesses call sites. A Fase 2 deve **reabrir INFRA-02** para a metade de "status de pagamento" do texto do requisito.
- **A conclusão formal da fase no `ROADMAP.md` é do orquestrador**, após `/gsd-verify-work`. Este plano fechou apenas a linha de `01-05`.
- **Blockers inalterados**, nenhum novo: preço mensal ainda indefinido (necessário antes da Fase 3), confirmação do Asaas — sandbox, header do webhook, aprovação do checkout — (antes da Fase 3), decisão de hosting/scheduler e estratégia de pooling do Prisma (antes da Fase 5), revisão jurídica CDC (fora do escopo técnico).
- **Itens cosméticos em aberto**, nenhum bloqueante: o warning de lint do `Link` em `app/registro/page.tsx` e o flake ocasional de `combo-crud.spec.ts` na suíte e2e local.

## Self-Check: PASSED

Arquivos:
- `.planning/phases/01-pr-requisitos-de-produ-o/01-VALIDATION.md` — FOUND
- `.planning/phases/01-pr-requisitos-de-produ-o/01-05-SUMMARY.md` — FOUND

Commits:
- `f926667` — FOUND
- `cb007b2` — FOUND

---
*Phase: 01-pr-requisitos-de-produ-o*
*Completed: 2026-08-31*
