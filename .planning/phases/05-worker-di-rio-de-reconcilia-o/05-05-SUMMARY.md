---
phase: 05-worker-di-rio-de-reconcilia-o
plan: 05
subsystem: testing
tags: [gates, static-analysis, node, eslint, vitest, playwright, prisma, ci]

# Dependency graph
requires:
  - phase: 04-aplica-o-do-bloqueio
    provides: "`scripts/gates-fase-04.mjs` — a forma reusada por esta fase (helpers, higiene de comentários, agulhas por concatenação, placar final) e os números medidos de 11 deps / 20 devDeps"
  - phase: 05-worker-di-rio-de-reconcilia-o
    provides: "`app/api/cron/reconciliacao-diaria/route.ts` (05-03) e `app/services/reconciliacao.service.ts` (05-02) — os alvos dos Gates 1 a 5"
provides:
  - "`scripts/gates-fase-05.mjs`: as seis invariantes estáticas da fase como código executável, com não-vacuidade demonstrada uma a uma"
  - "`npm run gates:fase-05`: um comando único que falha o build se alguém acoplar o worker a uma plataforma de hosting, agendar as escritas para depois da resposta, fizer o worker falar com o gateway, trocar `allSettled` por `all`, vazar `ultimoStatusAuditado` ou instalar um pacote sem verificação de legitimidade"
  - "O gate de `ultimoStatusAuditado` da Fase 2 deixa de ser prosa dentro de um `<automated>` de plano e passa a rodar sempre"
  - "`05-VALIDATION.md` fechado com `status: approved` e os números MEDIDOS da suíte inteira"
affects: [CI futuro, /gsd-verify-work, fase de deploy/hosting, qualquer refactor do worker]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate estático por fase como script `node` sem dependência (só `node:fs` e `node:path`), registrado no `package.json` como `gates:fase-NN`"
    - "Escopo de gate restrito a arquivos-fonte (`ehFonte`) quando o teste correspondente cita a agulha proibida de propósito para afirmar a negativa"
    - "Não-vacuidade de gate provada por injeção temporária + reversão, com a mensagem de falha observada transcrita no SUMMARY"

key-files:
  created:
    - scripts/gates-fase-05.mjs
  modified:
    - package.json
    - .planning/phases/05-worker-di-rio-de-reconcilia-o/05-VALIDATION.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Gates 2, 3 e 5 varrem apenas arquivos-fonte (`ehFonte`): `route.test.ts` mocka `agendarPosResposta` DE PROPÓSITO para afirmar que ele não é chamado, e cita o webhook do Asaas em comentário — um gate que varresse os testes acusaria como violação exatamente a prova de que a invariante é respeitada"
  - "Gate 4 tem CINCO condições, não quatro: `export async function GET` entrou junto das quatro do plano porque T-05-24 (handler POST-only = 405 no painel do agendador, job falhando em silêncio) é indistinguível das outras em code review"
  - "A coluna `File Exists` do Per-Task Verification Map foi atualizada junto da coluna `Status`: manter `❌ Wave 0` num documento fechado como `approved` afirmaria que os seis artefatos nunca foram criados"
  - "Números do fechamento transcritos da saída real dos comandos (916 testes, 24 specs, 64 caracteres de `CRON_SECRET`), nunca estimados — e o VALOR do segredo não foi impresso, só o comprimento (T-05-20)"

patterns-established:
  - "Gate de plataforma tem duas metades independentes: agulhas em linhas de código de `app/`+`lib/` E ausência do arquivo de configuração da plataforma na raiz — a segunda é a que impede tomar por acidente a decisão de hosting que D-07 adia"
  - "Allowlist de gate como constante nomeada e comentada, com registro de QUEM acrescentou cada entrada e por quê (os dois últimos arquivos do Gate 5 vieram da Fase 5, e o uso é exclusivamente como `anterior` do CAS)"

requirements-completed: [WRK-01, WRK-02]

# Metrics
duration: 13 min
completed: 2026-09-01
---

# Phase 5 Plan 05: Gates estáticos da fase e fechamento da validação Summary

**Seis invariantes que nenhum teste pegava viraram `npm run gates:fase-05` — cada uma com a violação injetada, a mensagem de falha observada e a reversão registrada — e a fase fechou com 916 testes, 24 specs e2e, dois conjuntos de 6/6 gates e o gate SQL do enum verdes no mesmo estado do repositório**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-01T20:58:15Z
- **Completed:** 2026-09-01T21:11:55Z
- **Tasks:** 2
- **Files modified:** 4 (1 criado, 3 modificados)

## Accomplishments

- `scripts/gates-fase-05.mjs` (439 linhas) transforma em código executável as quatro decisões desta fase que eram violáveis por uma linha curta e plausível que nenhum teste quebra, mais o gate de pacotes e o gate que a Fase 2 deixou em prosa.
- **Não-vacuidade demonstrada gate a gate**: sete injeções temporárias, cada uma revertida, cada mensagem de falha transcrita abaixo. Um gate que nunca falhou não é um gate.
- **O gate não se auto-invalida**: um comentário citando LITERALMENTE as sete agulhas proibidas foi injetado no worker e `npm run gates:fase-05` continuou 6/6 — a prova direta de que o descarte de linhas de comentário funciona, e não uma afirmação de projeto.
- `05-VALIDATION.md` fechado com evidência medida: 15 linhas do Per-Task Verification Map em `✅ passed`, os seis artefatos de Wave 0 confirmados em disco, e uma tabela §Estado final da fase transcrevendo a saída dos oito comandos.
- A verificação que **continua sem cobertura** ficou registrada explicitamente em vez de silenciada: comportamento atrás de um agendador REAL, com o protocolo 200 vs. 3xx vs. 404 para o dia do deploy.

## Task Commits

1. **Task 1: os seis gates estáticos da fase** — `42dd91b` (feat)
2. **Task 2: gate completo da fase e fechamento de 05-VALIDATION.md** — `1cb1498` (docs)

## Files Created/Modified

- `scripts/gates-fase-05.mjs` — os seis gates, as helpers reusadas da Fase 4 e o registro de POR QUE cada gate existe
- `package.json` — script `gates:fase-05`, imediatamente abaixo de `gates:fase-04`. Nenhuma dependência nova
- `.planning/phases/05-worker-di-rio-de-reconcilia-o/05-VALIDATION.md` — `status: approved`, `wave_0_complete: true`, os números medidos e a linha nova de verificação diferida
- `.planning/REQUIREMENTS.md` — WRK-01 e WRK-02 marcados como completos

## Os seis gates

| Gate | Invariante | Escopo | Ameaça |
|------|-----------|--------|--------|
| 1 | Neutralidade de plataforma: `x-vercel-cron`, `vercel-cron`, `@vercel/functions` ausentes de linhas de código de `app/`+`lib/`, e `vercel.json` ausente da raiz | `app/`, `lib/`, raiz | T-05-22 / D-07 / critério #3 |
| 2 | `agendarPosResposta` ausente do worker — o corpo JSON é a única observabilidade autorizada por D-04 | `app/api/cron` (fonte) | T-05-17 / Pitfall 4 |
| 3 | Nenhuma referência ao gateway sob o worker — D-06 escopa o worker aos 4 fatos locais | `app/api/cron` (fonte) | T-05-23 / D-06 |
| 4 | Forma do handler: `export async function GET` 1x, `Promise.all(` 0x, `Promise.allSettled` 1x, `new Date()` 1x, `deletedAt: null` 1x | `route.ts` do worker | T-05-05, T-05-24 |
| 5 | `ultimoStatusAuditado` só nos 6 arquivos da allowlist | `app/`, `lib/` (fonte) | T-05-09 / BILL-01 |
| 6 | 11 `dependencies` e 20 `devDependencies` congelados | `package.json` | T-05-SC |

## Prova de não-vacuidade (Task 1)

Cada violação foi injetada isoladamente, o gate rodado, a mensagem observada e a injeção revertida
por `git checkout -- <arquivo>`. Estado final do repositório idêntico ao inicial nos arquivos tocados.

| # | Injeção | Gate | Mensagem de falha observada |
|---|---------|------|------------------------------|
| 1 | `const schedule = request.headers.get("x-vercel-cron-schedule")` no worker | 1 | `FALHA Gate 1 … acoplamento a uma plataforma de hosting específica` + `route.ts:230: const schedule = request.headers.get("x-vercel-cron-schedule");` |
| 1b | `vercel.json` com bloco `crons` na raiz | 1 | `FALHA Gate 1 … vercel.json commitado na raiz` |
| 2 | `agendarPosResposta(() => aplicar(plano.aplicaveis));` no worker | 2 | `FALHA Gate 2 … trabalho agendado para depois da resposta` + `route.ts:272` |
| 3 | `import { asaasConfig } from "@/lib/billing/asaas/config";` no worker | 3 | `FALHA Gate 3 … referência ao gateway de pagamento dentro do worker` + `route.ts:5` |
| 4 | `Promise.allSettled` → `Promise.all` | 4 | DUAS falhas: ``\`Promise.all(\` esperado 0x … encontrado 1x`` e ``\`Promise.allSettled\` esperado 1x … encontrado 0x`` |
| 4b | `export async function GET` → `POST` | 4 | ``\`export async function GET\` esperado 1x em linhas de código, encontrado 0x`` (T-05-24, além do exigido pelo acceptance criteria) |
| 5 | `ultimoStatusAuditado: true` em `PRODUTO_CATALOGO_SELECT` de `app/services/produto.service.ts` | 5 | `FALHA Gate 5 … ultimoStatusAuditado fora da lista de arquivos autorizados` + `produto.service.ts:52` |
| 6 | `DEPENDENCIAS_ESPERADAS` 11 → 12 | 6 | `FALHA Gate 6 … esperado 12 deps e 20 devDeps, encontrados 11 e 20` |

**Prova de que o gate não se auto-invalida.** Um comentário contendo literalmente
`x-vercel-cron, vercel-cron, @vercel/functions, agendarPosResposta, asaas, Asaas, Promise.all(`
foi injetado em `app/api/cron/reconciliacao-diaria/route.ts` e `npm run gates:fase-05` saiu **0 com
6/6**. É o que o descarte de linhas de comentário garante — e é por isso que o JSDoc normativo do
worker pode continuar nomeando as coisas que proíbe. A concatenação das agulhas (`"x-vercel" +
"-cron"`) é a segunda camada: nenhum gate varre `scripts/` hoje, mas ampliar o escopo no futuro não
transformará o próprio arquivo na primeira violação que ele reporta.

## Estado final da fase (Task 2)

Oito comandos, nesta ordem, no mesmo estado do repositório:

| # | Comando | Resultado |
|---|---------|-----------|
| 1 | `npm run lint` | exit 0 — 0 erros, 2 warnings pré-existentes |
| 2 | `npx tsc --noEmit` | exit 0 — nenhuma saída |
| 3 | `npm test` | exit 0 — **916 testes / 89 arquivos** (base da Fase 4: 876 / 86) |
| 4 | `npm run test:e2e` | exit 0 — **24 specs**, 23 de primeira + 1 flaky verde no retry (base da Fase 4: 22) |
| 5 | `npm run gates:fase-04` | exit 0 — 6/6 |
| 6 | `npm run gates:fase-05` | exit 0 — 6/6 |
| 7 | `npx prisma db execute --file prisma/checks/worker-diario-enum.sql` | exit 0 — `Script executed successfully.` |
| 8 | `npx prisma migrate status` | exit 0 — 10 migrations, `Database schema is up to date!` |

Verificações pontuais das linhas do map não cobertas por comando agregado: `05-01-01` (migration
`20260901195303_add_worker_diario_causa` existe), `05-01-02` (`CausaTransicaoAcesso.WORKER_DIARIO`
exposto pelo Client), `05-01-03` (`prisma validate` verde), `05-04-01` (`CRON_SECRET` presente com
**64 caracteres** — só o comprimento foi impresso, nunca o valor, por T-05-20).

## Decisions Made

- **Gates 2, 3 e 5 restritos a arquivos-fonte.** O plano descrevia os Gates 2 e 3 como "qualquer arquivo sob `app/api/cron`". Aplicado literalmente, o Gate 2 ficaria vermelho em `route.test.ts:36` — o mock de `agendarPosResposta` que existe justamente para afirmar que a função NÃO é chamada — e o Gate 3 em `route.test.ts:17`, um comentário citando o precedente do webhook do Asaas. O gate acusaria como violação a própria prova da invariante. `ehFonte` (já usado assim pelos gates da Fase 4 e exigido pelo plano no Gate 5) foi aplicado aos três, com o motivo registrado na terceira camada do cabeçalho do arquivo.
- **Gate 4 com cinco condições.** As quatro do plano mais `export async function GET` exatamente 1x. T-05-24 está no `<threat_model>` deste plano com disposição `mitigate` e aponta para o Gate 4; um handler `POST`-only não quebra nenhum teste unitário (os testes importam `GET` diretamente) e só apareceria como 405 no painel do agendador, que é o cenário de falha silenciosa que a fase inteira tenta evitar.
- **`File Exists` atualizado junto de `Status`.** O plano pedia para não tocar no Per-Task Verification Map além da coluna `Status`. Mantida a instrução para IDs, requisitos, ameaças e comandos; a coluna `File Exists` foi atualizada de `❌ Wave 0` para `✅ existe` porque os seis artefatos foram confirmados em disco por `ls` e porque o formato de um VALIDATION fechado neste projeto (`04-VALIDATION.md`) usa `✅ existe`. Deixar `❌` num documento `approved` afirmaria o contrário do que foi medido.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Escopo dos Gates 2 e 3 restrito a arquivos-fonte**

- **Found during:** Task 1
- **Issue:** A redação do plano para os Gates 2 e 3 ("qualquer linha de código de um arquivo sob `DIRETORIO_DO_WORKER`") não excluía os testes. `app/api/cron/reconciliacao-diaria/route.test.ts` contém `agendarPosResposta` em 4 linhas de código (o `vi.mock`, o import, o `vi.mocked` e a asserção negativa) e `asaas` em 2 comentários. Os dois gates nasceriam vermelhos, e a "correção" óbvia — apagar a asserção negativa — destruiria a única defesa de runtime contra o Pitfall 4.
- **Fix:** `ehFonte` aplicado aos Gates 2, 3 e 5 (o plano já o exigia no 5). Motivo registrado como "TERCEIRA CAMADA DA MESMA DEFESA" no cabeçalho de `scripts/gates-fase-05.mjs`, para que ninguém "corrija" o escopo depois.
- **Files modified:** `scripts/gates-fase-05.mjs`
- **Verification:** `npm run gates:fase-05` 6/6; injeção #2 e #3 da tabela acima provam que o gate continua pegando a violação real em código-fonte
- **Committed in:** `42dd91b`

**2. [Rule 1 - Bug] Coluna `File Exists` do Per-Task Verification Map ficaria factualmente errada**

- **Found during:** Task 2
- **Issue:** 11 das 15 linhas do map traziam `❌ Wave 0` (marcador de planejamento: "este arquivo ainda não existe"). Fechar o documento como `status: approved` mantendo esses marcadores afirmaria que os artefatos nunca foram criados — o oposto do que `ls` mostra.
- **Fix:** Coluna `File Exists` atualizada para `✅ existe` nas 15 linhas, alinhada ao formato de `04-VALIDATION.md`. IDs, planos, waves, requisitos, ameaças, comportamentos e comandos preservados literalmente, como o plano exigia.
- **Files modified:** `.planning/phases/05-worker-di-rio-de-reconcilia-o/05-VALIDATION.md`
- **Verification:** `ls` dos seis artefatos de Wave 0 (todos presentes); `grep -c "⬜"` = 0; `grep -c "pending"` = 0
- **Committed in:** `1cb1498`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Ambas preservam a intenção do plano e a tornam verdadeira. A primeira impede que o gate acuse a própria prova da invariante; a segunda impede que um documento de evidência medida registre o contrário do medido. Nenhum scope creep — nenhum arquivo fora dos três previstos foi alterado.

## Issues Encountered

- **Worktree sem `node_modules` nem `.env`** (ambos gitignored). Resolvido com árvore de hardlinks (`cp -al`) e symlink do `.env`, como as waves anteriores desta fase registraram. Symlink de `node_modules` NÃO foi usado: o Turbopack rejeita um `node_modules` que aponte para fora da raiz do projeto, e a Task 2 depende de `npm run test:e2e`, que sobe `next dev`.
- **`npx next typegen` e `npx prisma generate` necessários** no worktree fresco — sem o primeiro, `tsc --noEmit` falha em `app/layout.tsx` com `Cannot find name 'LayoutProps'`; sem o segundo, o Client não expõe `CausaTransicaoAcesso.WORKER_DIARIO`. Ambas as saídas são gitignored; nada foi commitado.
- **1 spec e2e flaky:** `e2e/combo-crud.spec.ts` › "cria um combo com produto selecionado e ele aparece no admin e no catálogo público" falhou na primeira tentativa e passou no retry. Spec **pré-existente** (Fase 2), sem relação com o worker — fora do escopo desta fase por regra de escopo, registrada aqui e na tabela §Estado final da fase de `05-VALIDATION.md` para não virar surpresa.
- **2 warnings de lint pré-existentes** (`Link` não usado em `app/registro/page.tsx`, decisão registrada em 01-04; `fatosDeTrial` não usado em `app/services/reconciliacao.service.test.ts`, vindo do plano 05-02). `npm run lint` sai 0 — são warnings, não erros. Nenhum foi tocado: o segundo pertence ao plano 05-02, não a este.

## Known Stubs

Nenhum. Este plano não adiciona código de runtime — `scripts/gates-fase-05.mjs` é análise estática que não abre banco, não sobe servidor e não é importado por nada da aplicação.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Fase 5 fechada.** Os cinco planos têm SUMMARY; WRK-01 e WRK-02 marcados como completos em `.planning/REQUIREMENTS.md`; `05-VALIDATION.md` com `status: approved` e nenhuma linha pendente.
- **Bloqueador herdado, agora com protocolo escrito:** a decisão de hosting (D-07) continua aberta e é o que impede verificar o worker atrás de um agendador real. O procedimento exato do dia do deploy está na última linha de §Manual-Only Verifications de `05-VALIDATION.md` — configurar o agendador, disparar POR ELE, e exigir 200 no histórico (3xx = job termina sem executar, 404 = cobrado e falha em silêncio).
- **Também para o dia do deploy:** criar `CRON_SECRET` no painel do host com esse nome exato, e dimensionar o `max` do pool do Prisma agora que worker e webhooks existem (pendência aberta desde 01-01/01-05; o worker usa lotes de 5 justamente por assumir o default de 10).
- **Continua sem dono:** a fila `EventoWebhookAsaas WHERE processadoEm IS NULL` (D-06/D-10). O Gate 3 desta fase torna explícito que o worker não pode drená-la — o dreno exige `webhookAsaasService.processar`, que re-busca no Asaas, e isso é fase futura.

## Self-Check: PASSED

- `scripts/gates-fase-05.mjs` — FOUND (439 linhas, acima do `min_lines: 180` do plano)
- `42dd91b` — FOUND em `git log`
- `1cb1498` — FOUND em `git log`
- `grep -c "gates:fase-05" package.json` = 1
- `grep -cE '"dependencies"|"devDependencies"' package.json` = 2 (inalterado)
- `grep -c "pending"` e `grep -c "⬜"` em `05-VALIDATION.md` = 0 e 0

---
*Phase: 05-worker-di-rio-de-reconcilia-o*
*Completed: 2026-09-01*
