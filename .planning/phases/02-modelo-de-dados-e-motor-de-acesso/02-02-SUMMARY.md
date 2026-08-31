---
phase: 02-modelo-de-dados-e-motor-de-acesso
plan: 02
subsystem: backend
tags: [security, mass-assignment, allowlist, empresa, billing, asvs-v4]

requires:
  - phase: 01-pr-requisitos-de-produ-o
    provides: requireAuth + revalidarConta protegendo PATCH /api/empresas/[id] (INFRA-02)
provides:
  - "empresaService.update com allowlist positivo de 10 campos em runtime — unico choke point de escrita da Empresa"
  - "teste de regressao 'nao aceita campos de billing no payload' (prova de runtime sobre o mock do Prisma)"
  - "teste 'ignora campos de billing enviados no corpo do PATCH' (documentacao do cenario de ataque HTTP)"
affects: [02-04-acesso-service, 02-05-trial-no-registro, 02-06-gate-de-conformidade, 03-gateway-de-pagamento, 04-enforcement]

tech-stack:
  added: []
  patterns:
    - "Allowlist positivo campo-a-campo em runtime no service (nao denylist, nao interface TypeScript) como unica defesa contra mass assignment"
    - "Asserção toHaveBeenCalledWith EXATA (nunca objectContaining) para provar que nada vazou, complementada por not.toHaveProperty nomeando cada campo proibido"

key-files:
  created: []
  modified:
    - app/services/empresa.service.ts
    - app/services/empresa.service.test.ts
    - app/api/empresas/[id]/route.test.ts

key-decisions:
  - "Choke point no service, nao no route handler: os dois chamadores (route handler HTTP e Server Action marca/actions.ts) passam por empresaService.update"
  - "Guarda !== undefined (nao truthiness) preserva a semantica Prisma de 'nao atualizar este campo' usada por marca/actions.ts, que envia string | undefined"
  - "Assinatura publica update(id, data: UpdateEmpresaDTO) inalterada — zero mudanca nos dois chamadores e no teste de rota existente"
  - "Comentario normativo acima do metodo nomeia os 4 fatos de billing para que um refactor futuro que 'simplifique' o metodo encontre o aviso (T-02-08)"
  - "Teste de rota NAO afirma que o service recebeu body filtrado — o service esta mockado inteiro nesse arquivo; afirmar isso seria falso"

patterns-established:
  - "Antes de uma coluna sensivel existir, fechar o caminho de escrita: o allowlist e positivo, entao funciona independentemente da ordem em que as colunas de billing chegam"

requirements-completed: [BILL-04, BILL-01]

duration: 5min
completed: 2026-08-31
---

# Phase 02 Plan 02: Allowlist de `empresaService.update` Summary

**`empresaService.update` deixou de repassar o body cru do request para `prisma.empresa.update` e passou a montar `data` campo a campo a partir de uma lista positiva de 10 campos — fechando a auto-concessao de `acessoVitalicio: true` por um ADMIN autenticado no mesmo instante em que as colunas de billing passaram a existir.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-08-31T19:37:00Z
- **Completed:** 2026-08-31T19:42:00Z
- **Tasks:** 2
- **Files modified:** 3 (todos modificados, nenhum criado)

## Accomplishments

- `EmpresaService.update` reescrito no mesmo estilo campo-a-campo que o `create` do mesmo arquivo ja usava: `const permitido: Prisma.EmpresaUpdateInput = {}` preenchido por 10 guardas `if (data.X !== undefined)`, agrupadas nos mesmos blocos visuais do `create` (identidade / midia / contato / cores / modo).
- O buraco fechado e concreto: `app/api/empresas/[id]/route.ts:83-85` continua fazendo `await request.json()` e repassando o objeto cru; o check `id !== auth.empresaId` do handler **nao protege**, porque o ataque e o ADMIN escrevendo na propria empresa. `UpdateEmpresaDTO` e uma `interface` — apagada na compilacao, sem efeito em runtime.
- Comentario normativo de 8 linhas acima do metodo nomeando `acessoAte`, `trialFim`, `canceladoEm` e `acessoVitalicio` e explicando por que a lista existe (T-02-08: defesa contra o refactor futuro que "simplifica" de volta para `data`).
- Tres testes novos: dois no service (payload hostil descartado + os 10 campos legitimos preservados) e um na rota (cenario de ataque HTTP com `id` = a propria empresa do token).
- **O teste e comprovadamente nao-vacuo:** com uma reversao temporaria de `data: permitido` para `data: data as Prisma.EmpresaUpdateInput`, `"nao aceita campos de billing no payload"` falhou exatamente na asserção `toHaveBeenCalledWith` (linha 364), mostrando os 5 campos vazados no diff. A reversao foi desfeita com `git checkout -- app/services/empresa.service.ts` e a suite voltou a verde.

## Task Commits

1. **Task 1: reescrever `empresaService.update` como allowlist explicito de 10 campos** — `0de5beb` (fix)
2. **Task 2: testes de regressao do mass assignment (service + superficie HTTP)** — `2deb48a` (test)

## Files Created/Modified

- `app/services/empresa.service.ts` — metodo `update` reescrito (+26/-1); `create`, `delete` e `registerComUsuario` intocados; nenhum import novo (`Prisma` ja vinha da linha 7)
- `app/services/empresa.service.test.ts` — import de `type UpdateEmpresaDTO`; 2 casos novos dentro do `describe("empresaService.update")` existente; nenhum teste antigo alterado
- `app/api/empresas/[id]/route.test.ts` — 1 caso novo no `describe("PATCH /api/empresas/[id]")`, com comentario explicando que o service esta mockado por inteiro e que a prova de runtime mora no teste de service

## Verification Evidence

| Comando | Resultado |
|---|---|
| `npx vitest run app/services/empresa.service.test.ts` | 18 testes passando (16 antes + 2 novos) |
| `npx vitest run app/services/empresa.service.test.ts -t "não aceita campos de billing"` | **1 passed \| 17 skipped** — o caso existe e roda (nao 0) |
| Reversao temporaria do allowlist (`data: data as Prisma.EmpresaUpdateInput`) | **1 failed** em `empresa.service.test.ts:364` — o teste quebra se o mass assignment voltar |
| `npx vitest run "app/api/empresas/[id]/route.test.ts"` | verde, testes antigos + o novo |
| `grep -c "Prisma.EmpresaUpdateInput" app/services/empresa.service.ts` | `1` |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 erros, 1 warning pre-existente (`Link` nao usado em `app/registro/page.tsx`, mantido desde 01-04) |
| `npm run test` | 67 arquivos / **466 testes** passando (463 da linha de base da Fase 1 + 3 novos, zero regressao) |
| `git diff --diff-filter=D HEAD~1 HEAD` | vazio nos dois commits — nenhum arquivo deletado |

## Decisions Made

- **Choke point no service, nao no route handler.** Os dois chamadores (`app/api/empresas/[id]/route.ts` e `app/[slug]/admin/(protected)/marca/actions.ts`) convergem em `empresaService.update`; filtrar no handler deixaria a Server Action fora da protecao e exigiria duplicar a lista.
- **`!== undefined`, nunca truthiness.** `marca/actions.ts` envia `descricao`, `logo`, `telefone`, `instagram`, `primaryColor` e `accentColor` como `string | undefined`. Truthiness quebraria a limpeza de um campo para string vazia, e `undefined` ja significa "nao atualizar" no Prisma.
- **Lista positiva, nao denylist.** O metodo `update` nao menciona nenhum campo de billing fora do comentario. Isso e o que torna o plano seguro rodando em paralelo com o 02-01 (que criou as colunas): a ordem de conclusao dos dois planos e irrelevante, e qualquer coluna futura nasce nao-gravavel por padrao.
- **Cast duplo no teste e proposital, nao gambiarra.** `as unknown as UpdateEmpresaDTO` e a encenacao exata do que acontece em producao: o body de `request.json()` nunca passou pelo compilador. Sem o cast, o teste nao conseguiria expressar o ataque.
- **Asserção exata, nao `objectContaining`.** `objectContaining` passaria mesmo com os 5 campos vazando. A exatidao e o ponto; as 5 `not.toHaveProperty` existem so para a mensagem de falha apontar o campo culpado.

## Deviations from Plan

Nenhum desvio. O plano foi executado exatamente como escrito, incluindo o experimento de reversao pedido no criterio de aceitacao da Task 2.

**Total deviations:** 0.
**Impact on plan:** nenhum. Nenhum pacote instalado (consistente com T-02-SC).

## Issues Encountered

- Nenhum. O teste pre-existente `"repassa os dados informados para o prisma"` continuou verde sem alteracao, como o plano previa — ele afirma `data: { nome: "Novo Nome" }`, que e literalmente o que o allowlist produz.
- Nota de higiene de arvore: `.planning/config.json` aparece como modificado no `git status` desde antes desta execucao. Nao foi tocado nem incluido em nenhum commit deste plano.

## Threat Model Follow-up

- **T-02-06** (auto-concessao de `acessoVitalicio: true` pelo proprio ADMIN) — **mitigado e comprovado**: allowlist + teste que falha sob reversao.
- **T-02-07** (`acessoAte` / `trialFim` / `canceladoEm` gravaveis por HTTP) — **mitigado**: os 4 campos aparecem nomeadamente nas `not.toHaveProperty`.
- **T-02-08** (refactor futuro simplificando `update` de volta) — **mitigado em duas camadas**: comentario normativo no codigo + teste de regressao que quebra na hora.
- **T-02-09** (requisicao sem token) — aceito conforme planejado; `requireAuth` + `revalidarConta` da Fase 1 permanecem intocados.
- **T-02-SC** — nenhum pacote novo.

## Known Stubs

Nenhum. Nenhum valor hardcoded, placeholder ou componente sem fonte de dados foi introduzido.

## User Setup Required

None — mudanca puramente de codigo, sem configuracao, sem migration, sem servico externo.

## Next Phase Readiness

- **BILL-04 fechado no caminho HTTP:** `acessoVitalicio` so pode ser concedido diretamente no banco, como o requisito exige. Nao existe UI nem endpoint que o escreva.
- **Aviso para os planos 02-04 e 03-xx:** qualquer escrita legitima futura nos campos de billing (o compare-and-swap de `acessoService`, o handler de webhook do Asaas) **nao deve** ser feita passando por `empresaService.update` nem adicionando esses campos ao allowlist — isso reabriria a superficie HTTP. Deve usar um metodo dedicado e separado (ex.: um `prisma.empresa.update` proprio dentro de `acessoService`), invisivel para `UpdateEmpresaDTO`.
- **Aviso para o plano 02-06:** se o gate de conformidade grepar por `acessoVitalicio` / `acessoAte` / `trialFim` / `canceladoEm` fora dos arquivos autorizados, `app/services/empresa.service.ts` (comentario normativo), `app/services/empresa.service.test.ts` e `app/api/empresas/[id]/route.test.ts` (testes de regressao) precisam estar na allowlist — os tres citam os campos de proposito.
- Nenhum outro plano da Fase 2 fica bloqueado por este.

## Self-Check: PASSED

- Arquivos verificados em disco: `app/services/empresa.service.ts`, `app/services/empresa.service.test.ts`, `app/api/empresas/[id]/route.test.ts` — todos presentes e modificados.
- Commits verificados em `git log`: `0de5beb`, `2deb48a` — ambos presentes em `gateway_pagamento`.

---
*Phase: 02-modelo-de-dados-e-motor-de-acesso*
*Completed: 2026-08-31*
