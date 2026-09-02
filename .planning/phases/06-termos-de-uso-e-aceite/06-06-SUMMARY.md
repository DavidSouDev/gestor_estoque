---
phase: 06-termos-de-uso-e-aceite
plan: 06
subsystem: domain
tags: [termos-de-uso, registro, transacao, toctou, fail-closed, server-action, vitest, tdd]

# Dependency graph
requires:
  - phase: 06-termos-de-uso-e-aceite
    plan: 01
    provides: "models TermoDeUso e AceiteTermo, Usuario.termoAceitoId e o stub global neutro de termos em tests/setup/prisma-mock.ts"
  - phase: 06-termos-de-uso-e-aceite
    plan: 02
    provides: "termoVigente() — leitura da versao vigente, null num banco sem termos"
provides:
  - "RegisterComUsuarioDTO.termoAceitoId — campo obrigatorio, o id que o usuario VIU no formulario"
  - "registerComUsuario grava AceiteTermo como quarta escrita da mesma $transaction e Usuario.termoAceitoId ja preenchido"
  - "Guarda fail-closed (HttpError 503, copy E4) quando nao ha termo publicado, antes de qualquer escrita"
  - "Guarda de TOCTOU (HttpError 409, copy E2) por igualdade contra o vigente do servidor"
  - "Contrato de nomes de campo do FormData: aceiteTermos e termoId, lidos pela Server Action"
  - "app/registro/actions.test.ts — primeiro teste de Server Action de registro do projeto"
affects: [06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guarda de TOCTOU por IGUALDADE contra o vigente do servidor, com o valor gravado vindo sempre do servidor e nunca do payload"
    - "Fail-closed no funil de aquisicao vs. fail-open no gate de autorizacao, com a assimetria comentada nos dois lados para impedir harmonizacao futura"
    - "Recusa provada por ausencia de $transaction, nao apenas por rejects: prova que a guarda mora ANTES de qualquer escrita"
    - "Teste de Server Action com redirect mockado para LANCAR, helper de FormData valido e override por campo (null = campo ausente do payload)"

key-files:
  created:
    - app/registro/actions.test.ts
  modified:
    - app/services/empresa.service.ts
    - app/services/empresa.service.test.ts
    - app/registro/actions.ts

key-decisions:
  - "Os casos existentes de registerComUsuario PRECISARAM ser editados: com termoAceitoId obrigatorio no DTO, os 8 call sites de teste nao compilam sem o campo. O criterio 'sem edicao' do plano era inalcancavel por construcao; nenhuma assercao existente foi enfraquecida"
  - "console.error acompanha a guarda de !termo: a copy E4 e generica de proposito, entao a causa real precisa existir em algum lugar — o log do servidor, conforme CLAUDE.md"
  - "As duas validacoes novas da Server Action devolvem a MESMA copy E3: a ausencia do hidden input nao e acionavel pelo usuario e uma mensagem tecnica nao o ajudaria"
  - "Um caso extra alem dos seis comportamentos exigidos ('grava sempre o id do vigente do servidor') existe para travar a metade positiva do T-06-07: os outros casos provam a recusa, este prova o que e escrito quando a comparacao passa"

patterns-established:
  - "Helper de FormData valido com overrides onde null significa 'campo ausente do payload', distinto de string vazia — modela o browser, que nao envia checkbox desmarcado"
  - "Ordem de I/O afirmada por invocationCallOrder entre uma leitura e a abertura da transacao"

requirements-completed: [TERM-01]

# Metrics
duration: 10min
completed: 2026-09-02
---

# Phase 6 Plan 06: Registro Atomico com Aceite dos Termos Summary

**`registerComUsuario` recusa o cadastro antes de abrir a transacao quando nao ha termo publicado (503) ou quando o `termoAceitoId` recebido diverge do vigente (409), e no caminho feliz grava `AceiteTermo` como quarta escrita da MESMA transacao com `Usuario.termoAceitoId` ja preenchido — com a metade servidor de D-11 na Server Action provada por 15 casos no primeiro teste de Server Action de registro do projeto.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-02T10:15:00Z
- **Completed:** 2026-09-02T10:25:00Z
- **Tasks:** 2 (ambas com ciclo RED/GREEN)
- **Files created:** 1
- **Files modified:** 3

## Accomplishments

- Nao existe mais caminho de servidor que crie uma conta sem gravar o aceite: `termoAceitoId` e obrigatorio no DTO, as duas guardas rodam antes da `$transaction` e a quarta escrita mora dentro dela.
- A assimetria deliberada ficou escrita nos dois lados. O registro falha **FECHADO** (comentario de 20 linhas em `empresa.service.ts`, citando explicitamente que o gate de TERM-04 falha ABERTO e que os dois lados estao comentados para que ninguem "corrija" um deles) e o outro lado ja estava no ponto 2 do JSDoc de `lib/termo-vigente.ts` desde o plano 06-02.
- A guarda de TOCTOU compara por **igualdade** contra o vigente do servidor e grava sempre `termo.id`. Um caso de teste dedicado prova a metade positiva: com a v2 vigente e o DTO carregando `termo-2`, o que vai para `aceiteTermo.create` e `usuario.create` e o id do servidor.
- Os dois casos de recusa afirmam `prismaMock.$transaction` **nao chamado** — a asserção que separa "recusou" de "recusou antes de escrever".
- `app/registro/actions.test.ts` nasce cobrindo os sete comportamentos pedidos em 15 casos, incluindo as seis validacoes pre-existentes parametrizadas (rede contra reordenacao da cadeia) e a asserção que amarra `termoId` -> `termoAceitoId`, que e o contrato de nome de campo com o markup do plano 06-07.
- Suite completa subiu de 934 para **955 testes** (92 arquivos), `tsc --noEmit` exit 0, `lint` com 0 erros e `git diff package.json` vazio (T-06-SC).

## Task Commits

1. **Task 1 RED: 6 casos falhando de aceite no registro** - `0990037` (test)
2. **Task 1 GREEN: guardas + quarta escrita em `empresa.service.ts`** - `32c1639` (feat)
3. **Task 2 RED: `app/registro/actions.test.ts`** - `6228293` (test)
4. **Task 2 GREEN: duas validacoes na Server Action** - `4f2ecc8` (feat)

Sem fase REFACTOR em nenhuma das duas tasks: nao houve o que limpar.

## Files Created/Modified

- `app/services/empresa.service.ts` (+90 linhas) — `termoAceitoId: string` obrigatorio no DTO com JSDoc do porque nao e opcional; `const termo = await termoVigente()` na linha 96, junto de `generateUniqueSlug` e `bcrypt.hash` e **antes** da `$transaction` da linha 158; guarda `!termo` -> `console.error` + `HttpError` 503 (copy E4); guarda de TOCTOU -> `HttpError` 409 (copy E2); `termoAceitoId: termo.id` no `usuario.create`; `tx.aceiteTermo.create` como quarta escrita.
- `app/services/empresa.service.test.ts` (+208 linhas, 6 casos novos) — novo `describe` de TERM-01; constante `TERMO_VIGENTE_ID` amarrada ao stub default de `tests/setup/prisma-mock.ts`; `termoAceitoId` acrescentado aos 8 call sites existentes e a asserção exata de `usuario.create` estendida.
- `app/registro/actions.ts` (+27 linhas) — leitura de `aceiteTermos` (sem `String(...)`, para distinguir ausente de vazio) e de `termoId` (com `.trim()`); duas validacoes no fim da cadeia existente com a copy E3 literal; `termoAceitoId: termoId` no DTO. O `catch` de `HttpError` e o `redirect` fora do `try` ficaram intactos.
- `app/registro/actions.test.ts` (novo, 199 linhas, 15 casos) — `// @vitest-environment node`, `vi.hoisted` com `redirect` que lanca `REDIRECT:<url>`, mocks de `createAdminSession` e `empresaService.registerComUsuario`, helper `formValido(overrides)`.

## Decisions Made

- **Os casos existentes de `registerComUsuario` foram editados, contrariando a letra do plano.** O plano pedia "sem alterar os casos existentes" e "os casos de P2002 continuam passando sem edicao", mas `termoAceitoId: string` **obrigatorio** (exigido pelo mesmo plano, e corretamente: opcional devolveria ao chamador a opcao de omitir o aceite) torna os 8 call sites de teste inválidos para o `tsc`. A edicao foi mecanica — acrescentar o campo ao DTO e o par `termoAceitoId` a asserção exata de `usuario.create`. Nenhuma asserção existente foi removida ou enfraquecida, e o espirito do criterio (nao regredir a cobertura de P2002) esta preservado.
- **`console.error` acompanha a guarda de `!termo`.** A copy E4 e generica por decisao de UI-SPEC/CLAUDE.md, o que significa que a causa real some da resposta. Um estado "banco sem termos publicados" que produzisse recusa **silenciosa** seria indepurável em producao; o log e a contrapartida obrigatoria da mensagem generica (Rule 2 — observabilidade de um caminho fail-closed).
- **As duas validacoes novas da Server Action devolvem a MESMA mensagem.** Nao e descuido: `termoId` viaja no hidden input junto do checkbox, e a ausencia dele so acontece com payload adulterado. Uma segunda copy tecnica ("identificador de termos ausente") daria ao atacante um sinal a mais e ao usuario legitimo nada acionavel.
- **Um setimo caso alem dos seis comportamentos.** Os comportamentos do plano provam todas as **recusas**; nenhum provava o que e **gravado** quando a comparacao passa com um termo diferente do default. O caso "grava sempre o id do termo vigente do servidor" fecha a metade positiva de T-06-07 — sem ele, uma implementacao que gravasse `data.termoAceitoId` (em vez de `termo.id`) passaria em todos os outros casos, porque na comparacao de igualdade os dois valores coincidem.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree sem `node_modules`, sem `.env` e sem os tipos gerados do Next**
- **Found during:** setup, antes da Task 1
- **Issue:** O worktree e criado so com arquivos versionados. Sem `node_modules` nenhum comando roda; sem `.env` nao ha `DATABASE_URL`; sem `.next/types` o `tsc` falha em `app/layout.tsx` (`tsconfig.json` inclui `.next/types/**/*.ts`). Identico ao desvio 1 dos planos 06-01 e 06-02.
- **Fix:** Symlinks de `node_modules` e `.env` apontando para o checkout principal (ambos cobertos pelo `.gitignore`), mais `npx next typegen`. **Nenhum pacote instalado.**
- **Files modified:** nenhum arquivo versionado
- **Verification:** `git status --short` vazio apos os symlinks; `npx tsc --noEmit` exit 0 no baseline, antes de qualquer codigo novo.
- **Committed in:** n/a (artefatos gitignored)

**2. [Rule 3 - Blocking] Os 8 call sites de teste de `registerComUsuario` precisaram do campo novo**
- **Found during:** Task 1, gate RED
- **Issue:** `termoAceitoId: string` obrigatorio quebra o `tsc` em todo chamador existente — inclusive os casos que o plano manda nao tocar.
- **Fix:** Campo acrescentado mecanicamente aos 8 DTOs de teste, com a constante `TERMO_VIGENTE_ID = "termo-1"` amarrada e documentada contra o stub default de `prisma-mock.ts`. A asserção exata de `usuario.create` ganhou o par correspondente (parte do RED, nao concessao).
- **Files modified:** `app/services/empresa.service.test.ts`
- **Verification:** os 3 casos de P2002 (`email`, `slug`, erro desconhecido) e o caso de trial de borda continuam verdes com as mesmas asserções.
- **Committed in:** `0990037`

**3. [Rule 2 - Observabilidade] `console.error` acrescentado a guarda fail-closed**
- **Found during:** Task 1, GREEN
- **Issue:** O plano especifica so o `throw new HttpError(..., 503)`. Com a copy E4 generica por contrato, um banco sem termos produziria recusas de cadastro sem nenhum rastro no servidor.
- **Fix:** `console.error("[registro] nenhuma versão de Termos de Uso publicada — cadastro recusado (fail-closed, TERM-01)")` antes do `throw`, no padrao de `CLAUDE.md § Logging` e no molde do prefixo `[auth-guard]` ja usado no projeto.
- **Files modified:** `app/services/empresa.service.ts`
- **Verification:** o caso de teste da guarda continua afirmando apenas `message`/`status`; o log nao muda o contrato.
- **Committed in:** `32c1639`

### Criterio de verificacao que nao fecha por contagem literal

`grep -c "registrarAceite" app/services/empresa.service.ts` retorna **2**, e o criterio pede **0**. As duas ocorrencias sao **linhas de comentario** (182 e 213) — e sao os comentarios que o proprio bloco `<action>` da Task 1 **manda escrever** ("NAO chamar `termoService.registrarAceite` daqui... reproduzir o comentario nessa forma"). Zero ocorrencias em codigo:

```
182:            // `usuario.update` de `termoService.registrarAceite` desnecessário
213:        // Escrita direta com `tx.` em vez de `termoService.registrarAceite`:
```

E exatamente a colisao ja registrada pelos planos 06-01 e 06-02 e coberta pela decisao `[04-09]`: **o gate `gates:fase-06` (plano 06-08) precisa descartar linhas de comentario antes de contar neste arquivo**, alem dos dois ja apontados pelo 06-02.

---

**Total deviations:** 3 auto-fixadas (2 Rule 3, 1 Rule 2) + 1 criterio de grep que so fecha descartando comentario
**Impact on plan:** Nenhum desvio de escopo. Zero pacotes instalados, `git diff package.json` vazio — T-06-SC satisfeito.

## TDD Gate Compliance

O plano e `type: execute`, entao o gate RED/GREEN de plano inteiro nao se aplica. As duas tasks sao `tdd="true"` e ambas cumpriram o ciclo:

- **Task 1:** commit `test(...)` `0990037` com **6 casos falhando** (RED verificado: `Tests 6 failed | 46 passed`), depois commit `feat(...)` `32c1639` (GREEN: `52 passed`).
- **Task 2:** commit `test(...)` `6228293` com **5 casos falhando** (RED verificado: `Tests 5 failed | 10 passed` — os 10 verdes sao as validacoes pre-existentes, que devem mesmo passar antes da mudanca), depois commit `feat(...)` `4f2ecc8` (GREEN: `15 passed`).

Nenhum teste passou inesperadamente na fase RED.

## Verification Results

| Verificacao | Esperado | Resultado |
|-------------|----------|-----------|
| `npx vitest run app/services/empresa.service.test.ts` | >= 6 casos novos, exit 0 | **52 casos** (eram 46), exit 0 |
| `npx vitest run app/registro/actions.test.ts` | >= 7 casos, exit 0 | **15 casos**, exit 0 |
| `npm run test` (suite completa) | verde | 92 arquivos / **955 testes** (eram 934) |
| `npx tsc --noEmit` | exit 0 | exit 0 |
| `npm run lint` | exit 0 | exit 0, 0 erros (2 warnings pre-existentes, em arquivos nao tocados) |
| `grep -c "aceiteTermo.create" app/services/empresa.service.ts` | 1 | 1 |
| `grep -c "termoAceitoId" app/services/empresa.service.ts` | >= 3 | 5 |
| `grep -c "termoVigente" app/services/empresa.service.ts` | >= 1 | 2 (import + chamada) |
| Chamada de `termoVigente()` ANTES do `prisma.$transaction` | sim | linha **96** vs. linha **158** |
| `grep -c "registrarAceite" app/services/empresa.service.ts` | 0 | **2, ambas em comentario** — ver secao de desvios |
| `grep -c "aceiteTermos" app/registro/actions.ts` | >= 2 | 2 |
| `grep -c "termoId" app/registro/actions.ts` | >= 3 | 3 |
| `grep -c "termoAceitoId" app/registro/actions.ts` | 1 | 1 |
| Caso afirmando `$transaction` nao chamado com `termoVigente() === null` | existe | existe |
| Caso afirmando `$transaction` nao chamado com `termoAceitoId` divergente | existe | existe |
| Caso afirmando `registerComUsuario` nao chamado sem checkbox | existe | existe (3 variacoes) |
| Caso afirmando `termoAceitoId === termoId` do `FormData` | existe | existe |
| Caso afirmando mensagem de `HttpError` intacta em `{ error }` | existe | existe (3 variacoes) |
| `git diff package.json` | vazio | vazio |

## Threat Model Coverage

| Threat ID | Disposition | Como ficou |
|-----------|-------------|------------|
| T-06-07 | mitigate | Comparacao por igualdade antes da transacao; o valor gravado e sempre `termo.id`. Provado nas duas direcoes: recusa quando diverge, e grava o id do servidor quando o vigente e outro |
| T-06-32 | mitigate | Metade server de D-11 em `actions.ts`, com 4 casos de recusa afirmando `registerComUsuario` nao chamado. A metade client (`required`) e do plano 06-07 |
| T-06-33 | mitigate | `aceiteTermo.create` e a quarta escrita da mesma `$transaction`; caso de teste prova que um abort por P2002 de email nao chega a escreve-la |
| T-06-13 | accept (fail-closed deliberado) | `HttpError` 503 com copy E4 generica + `console.error`. Comentario de 20 linhas registra por que este lado e o oposto do gate de TERM-04 |
| T-06-24 | mitigate | E4 generica na resposta, causa real so no `console.error`. E3 e especifica porque o usuario pode agir |
| T-06-34 | mitigate | O DTO continua sem `role` e sem os 4 fatos de billing; o `usuario.create` monta `data` campo a campo. O unico campo novo aponta para um documento publico. A asserção exata de `empresa.create` (inalterada) continua sendo a rede contra campo inesperado |
| T-06-SC | mitigate | `git diff package.json` vazio; zero pacotes |

## Known Stubs

Nenhum. Os quatro arquivos estao completos para o escopo deste plano; nenhum valor vazio, placeholder ou `TODO` foi introduzido.

## Threat Flags

Nenhuma superficie de seguranca nova alem das ja registradas no `<threat_model>` do plano. Os dois arquivos tocados sao pre-existentes; nenhum endpoint, caminho de auth ou mudanca de schema novo.

## User Setup Required

Nenhuma. Nada de servico externo, nada de variavel de ambiente nova.

## Next Phase Readiness

- **06-07 (UI do registro)** tem o contrato de servidor pronto e congelado: o markup precisa produzir `aceiteTermos` (checkbox nativo, valor `"on"`) e `termoId` (hidden input com o `id` do `termoVigente()` lido em `app/registro/page.tsx`). Renomear qualquer um dos dois quebra `app/registro/actions.test.ts` de imediato, que e o ponto.
- **NOTA DE COORDENACAO (prevista pelo plano):** a suite **e2e** fica temporariamente vermelha a partir deste commit — o servidor passa a exigir `aceiteTermos` e os 9 specs ainda registram pela UI sem marcar o checkbox. O plano 06-07 fecha essa janela no mesmo wave. Nao foi feita nenhuma tentativa de "consertar" a e2e aqui. A suite **unitaria** (`npm run test`) esta verde.
- **06-08 (gates)** precisa descartar linhas de comentario antes de contar `registrarAceite` em `app/services/empresa.service.ts` — some-se aos dois arquivos ja apontados pelo 06-02.

## Self-Check: PASSED

Arquivos declarados, todos presentes em disco: `app/services/empresa.service.ts`, `app/services/empresa.service.test.ts`, `app/registro/actions.ts`, `app/registro/actions.test.ts`.

Commits declarados, todos presentes no historico da branch: `0990037`, `32c1639`, `6228293`, `4f2ecc8`.

---
*Phase: 06-termos-de-uso-e-aceite*
*Completed: 2026-09-02*
