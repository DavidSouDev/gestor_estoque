---
phase: 04-aplica-o-do-bloqueio
plan: 09
subsystem: testing
tags: [grep-gate, ci, prisma, billing, read-only-script, node-type-stripping]

# Dependency graph
requires:
  - phase: 04-aplica-o-do-bloqueio (planos 01 a 08)
    provides: todo o enforcement que estes gates protegem — requireAdminSession, requireAuth, findPublicavel*, banner de carência e a rota de checkout com o opt-out
  - phase: 02-fatos-de-billing-e-status-derivado
    provides: avaliarAcesso e os 4 fatos de billing sobre os quais a contagem opera
  - phase: 03-gateway-asaas-e-ingest-o-de-webhooks
    provides: scripts/resolvedor-ts.mjs — o padrão de script .ts com o leitor de env da aplicação
provides:
  - "npm run gates:fase-04 — os 6 gates estáticos da fase como código executável, provadamente não-vácuos"
  - "npm run acesso:contagem — distribuição read-only de status de acesso sobre todas as empresas de qualquer banco configurado no .env"
  - "Convenção de higiene de grep: gates descartam linhas de comentário antes de contar"
affects: [05-worker-de-avaliacao-diaria, ci, deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate estático como script Node executável, não como linha de grep em tabela markdown"
    - "Agulha proibida montada por concatenação para o gate não se auto-reportar"
    - "Medição prévia contra o banco alvo como checkpoint humano bloqueante antes de ligar um enforcement retroativo"

key-files:
  created:
    - scripts/gates-fase-04.mjs
    - scripts/contagem-status-acesso.ts
  modified:
    - package.json

key-decisions:
  - "Os gates rodam todos, sempre, e o exit code vira 1 a partir da primeira violação — quem quebrou o build vê a lista inteira de uma vez em vez de descobrir a segunda falha só depois de corrigir a primeira"
  - "Comentários são descartados antes de qualquer contagem: os JSDoc normativos da fase citam literalmente unstable_cache, 'use cache' e AvisoCarencia para explicar por que são proibidos, e um grep cru ficaria vermelho justamente porque o código documenta a proibição corretamente"
  - "Identificadores proibidos montados por concatenação de string no script de gates: hoje nenhum gate varre scripts/, mas ampliar o escopo no futuro não deve transformar o próprio gate na primeira violação que ele reporta"
  - "A contagem deriva status por avaliarAcesso sobre cada empresa, nunca por um WHERE de SQL: D-03, D-05, Pitfall 5 e as meias-noites de America/Sao_Paulo são quatro chances de a cópia divergir da aplicação, e uma medição feita para evitar incidente é o último lugar do projeto onde vale reimplementar a regra"
  - "DATABASE_URL impressa com a senha mascarada pelo próprio script (T-04-22), em vez de depender de a pessoa lembrar de mascarar antes de colar o resultado"
  - "E2E rodou com PLAYWRIGHT_PORT=3000 reutilizando o next dev já ativo do operador, em vez de matar o processo dele para satisfazer o lock de dev do Next 16"

patterns-established:
  - "Gate executável: prosa em documento de planejamento não roda no CI; um gate que ninguém executa é uma intenção documentada"
  - "Prova de não-vacuidade obrigatória: todo gate novo tem que ser visto ficando vermelho antes de ser aceito como verde"

requirements-completed: [ACC-02, ACC-03, ACC-04]

# Metrics
duration: 22min
completed: 2026-09-01
---

# Phase 04 Plan 09: Gates executáveis e contagem prévia de impacto Summary

**Os 6 gates estáticos da fase viraram `npm run gates:fase-04` (com prova de não-vacuidade em Gate 1 e Gate 3) e `npm run acesso:contagem` responde, read-only e contra qualquer banco do `.env`, quantas empresas o merge desta fase bloquearia no primeiro request.**

> **STATUS: COMPLETO — checkpoint humano fechado em 2026-09-01.**
> As Tasks 1 e 2 foram commitadas; a Task 3 (`checkpoint:human-verify` bloqueante, não
> auto-aprovável) foi executada e **aprovada pelo operador**, sem condições. Com ela, a Fase 4
> fecha 9/9 planos e o merge está liberado. Ver §Evidência numérica.

## Performance

- **Duration:** 22 min (parte automatizada) + checkpoint humano
- **Started:** 2026-09-01T15:05:00Z
- **Completed:** 2026-09-01 (Tasks 1–2 às 15:17Z; Task 3 no fechamento do checkpoint)
- **Tasks:** 3 de 3
- **Files modified:** 3 de código/config + 3 de planejamento

## Accomplishments

- **Os gates da fase deixaram de ser prosa.** `04-RESEARCH.md` §Validation Architecture listava
  quatro gates como linhas de `grep` dentro de uma tabela markdown. Agora são seis gates que rodam
  por um comando, imprimem evidência linha a linha e derrubam o exit code.
- **Os gates são imunes aos próprios comentários normativos do código.** Esta é a parte não óbvia:
  três arquivos desta fase (`lib/api-auth.ts`, `lib/empresa-publicavel.ts`,
  `app/[slug]/_lib/empresa.ts`) citam `unstable_cache` e `'use cache'` **em JSDoc**, para explicar
  por que são proibidos. Um `grep -rn` cru falharia contra código correto.
- **Dois dos seis gates foram provados não-vácuos**, vistos ficando vermelhos contra uma violação
  fabricada e removida em seguida.
- **O impacto do merge é mensurável por um comando.** `npm run acesso:contagem` roda `avaliarAcesso`
  sobre todas as empresas e diz quantas perdem admin e catálogo no primeiro request após o deploy.

## Task Commits

1. **Task 1: Os gates da fase como script executável** — `dd7c3d6` (feat)
2. **Task 2: Script read-only de contagem prévia de status de acesso** — `1802c5f` (feat)
3. **Task 3: Contagem prévia contra o banco alvo antes do merge** — checkpoint humano **aprovado**
   pelo operador em 2026-09-01 (sem commit de código; a evidência é este documento e
   `04-VALIDATION.md`)

**Plan metadata:** `c271f80` (interim, com o checkpoint em aberto) + o commit de fechamento abaixo.

## Files Created/Modified

- `scripts/gates-fase-04.mjs` (novo) — os 6 gates estáticos da fase. Node puro, sem dependência
  nova, `node:fs` + `node:path` apenas.
- `scripts/contagem-status-acesso.ts` (novo) — contagem read-only da distribuição de status de
  acesso, derivada por `avaliarAcesso`, com destaque para `BLOQUEADO + CANCELADO` e `CARENCIA`.
- `package.json` (modificado) — entradas `gates:fase-04` e `acesso:contagem`. **Nenhuma dependência
  adicionada** (11 deps / 20 devDeps, iguais ao início da fase).

## Os 6 gates

| Gate | O que impede | Ameaça |
|------|--------------|--------|
| 1 | Um segundo uso de `permitirEmpresaBloqueada` fora do checkout | T-04-13 (escalada de privilégio) |
| 2 | Cache cross-request em qualquer um dos 8 arquivos do caminho da guarda | T-04-08 (ACC-04 quebrado: paga e continua bloqueado) |
| 3 | `loading.tsx` / `template.tsx` sob `app/[slug]/(catalogo)` | T-04-01 (404 do catálogo bloqueado virando 200 streaming) |
| 4 | O banner de cobrança vazando para o catálogo público | T-04-19 (cliente final descobre que a loja está devendo) |
| 5 | Um sétimo entrypoint público nascer sem gate; `resolveIdBySlug` ressuscitar | T-04-03 (superfície pública) |
| 6 | Qualquer pacote instalado nesta fase | T-04-SC (slopsquatting) |

Gate 5 também falha se um dos 7 entrypoints enumerados **deixar de existir** — um caminho removido
sem atualizar a lista transformaria o gate em decoração silenciosa.

## Provas de não-vacuidade (executadas e desfeitas)

| Prova | Ação | Resultado observado |
|-------|------|---------------------|
| Gate 1 | Criado `app/api/__gate-temp/route.ts` contendo `permitirEmpresaBloqueada` | exit 1, `encontrados 2`, ambos os arquivos nomeados. Arquivo removido. |
| Gate 3 | Criado `app/[slug]/(catalogo)/loading.tsx` | exit 1, arquivo nomeado, com a justificativa do 404→200 impressa. Arquivo removido. |
| Higiene de comentários | `grep -c "unstable_cache" lib/api-auth.ts` → **1** | `npm run gates:fase-04` continua em exit **0** — o gate ignora o JSDoc e não se auto-invalida. |
| Gate 6 | `node -p "Object.keys(require('./package.json').dependencies).length"` → **11** | bate com o congelado. |

`git status --short` confirmou a árvore limpa dos dois arquivos temporários antes do commit da
Task 1.

## Decisions Made

Ver `key-decisions` no frontmatter. As duas que mais mudam o comportamento do sistema:

1. **Higiene de comentários antes de contar.** Sem isso, o gate mais importante da fase (Gate 2)
   ficaria vermelho contra código correto, e o reflexo natural de quem visse isso seria enfraquecer
   o gate — não corrigi-lo. A defesa foi replicada numa segunda camada: as agulhas proibidas são
   montadas por concatenação (`"unstable" + "_cache"`), de modo que ampliar o escopo de um gate no
   futuro para incluir `scripts/` não faça o próprio gate ser a primeira violação que ele reporta.
2. **`avaliarAcesso` como única autoridade na contagem.** Um `WHERE` de SQL seria mais curto e
   produziria um número falso em quatro pontos independentes: precedência de `acessoVitalicio`
   (D-03), trial sobrevivendo a `acessoAte` futuro (D-05), carência contada a partir do fato que
   venceu por último (Pitfall 5) e as meias-noites de `America/Sao_Paulo`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm run test:e2e` não subia: lock de dev do Next 16 tomado por um servidor do operador**

- **Found during:** Task 3, etapa 1 (rodar os três comandos antes de apresentar o checkpoint)
- **Issue:** `playwright.config.ts` sobe `npm run dev -- --port 3100`. O Next 16.3.0 recusa um
  segundo `next dev` no mesmo diretório de projeto — o lock é por diretório, não por porta — e havia
  um `next dev` do operador rodando há 3h na porta 3000 (PID 37640). Saída: `Another next dev server
  is already running`, `Process from config.webServer was not able to start. Exit code: 1`.
- **Fix:** Rodado `PLAYWRIGHT_PORT=3000 npm run test:e2e`. Como `reuseExistingServer` é `true` fora
  do CI, o Playwright reaproveitou o servidor já ativo em vez de subir um segundo. **Nenhum processo
  do operador foi terminado** e nenhum arquivo de configuração foi alterado — a variável foi passada
  só na invocação.
- **Files modified:** nenhum
- **Verification:** 22/22 specs verdes em 1.7 min, incluindo `sessao-revogada.spec.ts` e os specs de
  bloqueio que o `seed:billing` alimenta.
- **Committed in:** nenhum commit (mudança de invocação, não de arquivo)

**2. [Rule 2 - Missing Critical] Máscara da senha da `DATABASE_URL` movida para dentro do script**

- **Found during:** Task 2
- **Issue:** O `<threat_model>` (T-04-22) exige mascarar a senha ao imprimir a `DATABASE_URL`, mas o
  plano colocava isso como uma instrução manual no `<how-to-verify>` — um comando que a pessoa roda
  *antes* da contagem. Uma medição que existe para ser colada num checkpoint (e portanto num
  histórico de conversa) não pode depender de o operador lembrar de mascarar.
- **Fix:** O próprio `contagem-status-acesso.ts` imprime o alvo já mascarado (`:***@`) como primeira
  linha da saída, e aborta com exit 1 se `DATABASE_URL` estiver ausente — para que a contagem nunca
  seja lida como "zero empresas bloqueadas" quando na verdade não havia banco configurado.
- **Files modified:** `scripts/contagem-status-acesso.ts`
- **Verification:** saída mostra `postgresql://gestor:***@localhost:5432/gestor_estoque`
- **Committed in:** `1802c5f`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Nenhum scope creep. A primeira desbloqueou a verificação sem tocar no ambiente
do operador; a segunda transformou uma instrução manual do threat model em garantia do código.

## Issues Encountered

- **Aviso de lint pré-existente, fora de escopo:** `app/registro/page.tsx:1:8 — 'Link' is defined but
  never used`. Não foi introduzido por este plano e não foi corrigido (limite de escopo). `npm run
  lint` sai com código 0 — são warnings, não erros. Registrado em `deferred-items.md`.
- **Cópia de worktree de agente residual no repositório:** `.claude/worktrees/agent-acb1d767a64dea42f/`
  duplica o mesmo aviso de lint. Não é varrida por nenhum gate (os gates partem de `app/` e `lib/` na
  raiz), e `vitest.config.mts` já a exclui. Registrado em `deferred-items.md`.

## Evidência numérica

**FECHADA — 2026-09-01.** A Task 3 exigia uma medição que só o operador podia produzir; ela foi
produzida e aprovada.

### Ambiente medido: desenvolvimento local (`localhost:5432/gestor_estoque`)

Este **não** é o número que decide o merge — é o banco de desenvolvimento, poluído por 3 fases de
specs e2e. Está aqui como prova de que o comando funciona, não como base de decisão.

| Status | Empresas |
|--------|----------|
| TRIAL | 376 |
| EM_DIA | 4 |
| VITALICIO | 0 |
| CARENCIA | 0 |
| BLOQUEADO | 2 |
| CANCELADO | 0 |
| **TOTAL** | **382** |

- `BLOQUEADO + CANCELADO` = **2** — ambas fixtures de e2e (`loja-e2e-1788274717919-8488`,
  `loja-e2e-1788274724845-4771`), criadas de propósito por `npm run seed:billing` para provar o
  bloqueio. Nenhum cliente real.
- `CARENCIA` = **0**.

### Ambiente que decide o merge: medido e aprovado pelo operador

O operador apontou o `.env` para o banco alvo, rodou `npm run acesso:contagem`, executou as duas
verificações manuais de runtime (A3 e A4) e aprovou o conjunto: *"testei e está bom, segue pra
proxima"*.

**Os números não foram transcritos para o agente**, e este documento deliberadamente não os inventa.
O que está registrado é o que de fato aconteceu: a medição foi feita contra o banco correto, por
quem tem acesso a ele, e o resultado foi classificado como aceitável. A aprovação veio **sem
reserva e sem condição** — nenhum `acessoAte` a estender antes do deploy, nenhum adiamento até a
Fase 5 existir.

Consequência para quem ler isto depois: se for preciso auditar o impacto real do merge, o comando
continua disponível e é read-only — basta rodar `npm run acesso:contagem` de novo contra o mesmo
banco. O que não dá para recuperar retroativamente é a foto do instante do merge.

### Verificações A3 e A4: executadas e aprovadas

- **A3 / Pitfall 4** (partial rendering: o admin continua acessível em carência ao navegar por
  `<Link>`) — **passou**. Confirma a suposição A3 do RESEARCH e valida a decisão de arquitetura do
  §Achado crítico 4: o boundary de autorização é o `requireAdminSession` de cada page, nunca o
  layout. O banner pode ficar stale sem consequência de segurança.
- **A4** (`redirect()` para URL externa a partir de Server Action leva ao checkout hospedado do
  Asaas) — **passou**. A suposição A4 estava correta e **o fallback não foi necessário**: não foi
  preciso devolver a URL da action e navegar no cliente. O Pattern 5 do RESEARCH fica confirmado
  contra runtime real, não só contra a doc empacotada.

### Estado do repositório no momento em que o checkpoint foi apresentado

| Comando | Resultado |
|---------|-----------|
| `npm run gates:fase-04` | exit 0 — 6/6 OK |
| `npm test` | exit 0 — 86 arquivos, **876 testes** passando |
| `PLAYWRIGHT_PORT=3000 npm run test:e2e` | exit 0 — **22/22** specs passando |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (2 warnings pré-existentes) |
| `npm run acesso:contagem` | exit 0 contra o banco local |

## Known Stubs

Nenhum. Os dois scripts são funcionais e verificados contra o repositório e o banco locais.

## Threat Flags

Nenhuma superfície de segurança nova. Os dois arquivos criados vivem em `scripts/` e não participam
do build do Next, dos testes nem do runtime da aplicação. `contagem-status-acesso.ts` abre conexão
com o banco — mitigado por construção (um único `findMany`, nenhum método de escrita, provado pelo
gate de grep do `<acceptance_criteria>`) e pela máscara da senha na saída.

## User Setup Required

Nenhuma configuração de serviço externo. O checkpoint exigiu uma ação **do operador**, não uma
configuração — apontar o `.env` para o banco alvo, rodar `npm run acesso:contagem` e fazer as duas
verificações de navegador — e ela foi cumprida.

## Next Phase Readiness

**Liberado.** O checkpoint fechou, a Fase 4 está completa (9/9 planos) e o merge do enforcement está
aprovado. `04-VALIDATION.md` está com `status: approved`, `wave_0_complete: true` e nenhuma linha
pendente.

Duas suposições do RESEARCH foram **confirmadas contra runtime real** e deixam de ser risco para as
próximas fases: A3 (layouts não são boundary de autorização — a segurança está no
`requireAdminSession` de cada page, e o banner stale é falha benigna) e A4 (`redirect()` externo
funciona a partir de Server Action, sem precisar do fallback de navegação no cliente).

**Aviso que a Fase 5 precisa herdar:** o roadmap diz "enforcement (Fase 4) validado em produção
antes de o worker (Fase 5) poder bloquear alguém", o que se lê como bloqueio gradual. Não é — e
agora está no ar. A Fase 4 sozinha já bloqueia, a cada request autenticado. O worker da Fase 5 é
rede de segurança para empresas que **não** fazem request (auditoria e e-mail), não o gatilho.

Para a Fase 5: `npm run gates:fase-04` deve entrar no CI junto de `npm test`, e o Gate 6 vai falhar
de propósito no primeiro pacote que o worker precisar — momento correto para um ciclo de verificação
de legitimidade, não para ajustar o número.

## Self-Check: PASSED

- `scripts/gates-fase-04.mjs` — FOUND
- `scripts/contagem-status-acesso.ts` — FOUND
- `package.json` contém `gates:fase-04` e `acesso:contagem` — FOUND
- commit `dd7c3d6` — FOUND
- commit `1802c5f` — FOUND
- `app/api/__gate-temp/route.ts` — ausente (temporário, removido como exigido)
- `app/[slug]/(catalogo)/loading.tsx` — ausente (temporário, removido como exigido)

---
*Phase: 04-aplica-o-do-bloqueio — COMPLETA (9/9 planos)*
*Plan: 09 — 3/3 tasks, checkpoint humano fechado*
*Completed: 2026-09-01*
