---
phase: 06-termos-de-uso-e-aceite
plan: 03
subsystem: api
tags: [term-02, superadmin, autorizacao, zod, seed, script, vitest, nao-vacuidade]

# Dependency graph
requires:
  - phase: 06-termos-de-uso-e-aceite
    plan: 01
    provides: "UserRole.SUPERADMIN no Prisma Client, models TermoDeUso/AceiteTermo, stub global neutro de termos"
  - phase: 06-termos-de-uso-e-aceite
    plan: 02
    provides: "termoService.publicar (INSERT sempre, P2002 -> HttpError 409)"
provides:
  - "POST /api/termos — unica superficie de publicacao de termos (D-04), autorizada pela role LIDA DO BANCO no request atual"
  - "Schema zod CorpoPublicacao com teto de 200_000 caracteres no conteudo (ASVS V5)"
  - "Primeiro teste de rota role-gated do projeto, incluindo o caso de nao-vacuidade do Pitfall 2"
  - "scripts/seed-superadmin.ts — criacao idempotente da empresa interna vitalicia + usuario SUPERADMIN"
  - "Script npm seed:superadmin, com flags --email e --senha"
affects: [06-04, 06-05, 06-06, 06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Autorizacao de papel SEMPRE por revalidarConta().role, nunca pelo payload do JWT — a segunda leitura e gratuita por React.cache e fecha a janela de 7 dias do token"
    - "Teste de rota role-gated com par obrigatorio: caso de nao-vacuidade (token privilegiado + banco comum -> 403) e caso positivo (token + banco privilegiados -> 201)"
    - "Nao-vacuidade provada por asserções sobre as DUAS fontes de verdade antes de chamar o handler, em vez de por reversao temporaria do codigo de producao"
    - "Comentario normativo que evita escrever o identificador/literal que o gate de grep procura, para o gate continuar sendo sinal sobre o codigo e nao ruido da prosa"
    - "Seed de principal privilegiado como script versionado sem guarda de ambiente, com a divergencia em relacao ao script irmao escrita no cabecalho"

key-files:
  created:
    - app/api/termos/route.ts
    - app/api/termos/route.test.ts
    - scripts/seed-superadmin.ts
  modified:
    - package.json

key-decisions:
  - "A nao-vacuidade foi provada por asserções DENTRO do teste (o token decodifica para SUPERADMIN E o banco devolve ADMIN), nao por reversao temporaria do handler para auth.role — a reversao foi tentada e bloqueada pelo classificador de seguranca do ambiente, e a alternativa e estritamente melhor porque fica versionada e roda em toda execucao da suite"
  - "npm ci NAO foi executado: node_modules e um symlink para o checkout principal e ha dois outros agentes rodando em paralelo contra a mesma arvore. A divergencia de zod foi diagnosticada de forma READ-ONLY (lockfile vs. arvore instalada) e o codigo foi escrito para funcionar nas duas versoes"
  - "lib/unique-suffix.ts NAO foi reusado no seed: ele resolve colisao com contador deterministico (-2, -3), que e o oposto do requisito de slug nao-adivinhavel. randomBytes(4) do node:crypto no lugar, com a divergencia justificada no proprio arquivo"
  - "A validacao do corpo roda DEPOIS da checagem de papel: um ADMIN com corpo invalido recebe 403, nunca 400 — o corpo da resposta nao informa a quem nao esta autorizado que a validacao existe"
  - "publicadoPorId sai de conta.usuarioId (sessao revalidada), e o teste envia um publicadoPorId hostil no corpo para provar que ele nao vence"

patterns-established:
  - "Caso de teto INCLUSIVO ao lado do caso de estouro (200000 exatos -> 201, 200001 -> 400): sem ele, trocar max por lt reduziria o limite em 1 sem nenhum teste vermelho"
  - "Asserção de vazamento feita sobre o corpo INTEIRO serializado, nao so sobre .message — um campo de debug acrescentado no futuro cai no teste"

requirements-completed: [TERM-02]

# Metrics
duration: 25min
completed: 2026-09-02
---

# Phase 6 Plan 03: Endpoint de Publicacao e Seed do SUPERADMIN Summary

**`POST /api/termos` autorizado pela role lida do banco no request atual (nunca pelo `role` do JWT, que tem ate 7 dias de idade), provado pelo caso de nao-vacuidade que da 403 a um token que DIZ SUPERADMIN sobre um usuario que e ADMIN no banco, mais o script versionado e idempotente que cria o SUPERADMIN e sua empresa interna vitalicia com slug nao-adivinhavel.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-02T13:14:00Z
- **Completed:** 2026-09-02T13:39:00Z
- **Tasks:** 3
- **Files:** 4 (3 criados, 1 modificado)

## Accomplishments

- `app/api/termos/route.ts` fecha a janela de escalacao de privilegio de 7 dias que o projeto carregava por construcao: a autorizacao sai de `revalidarConta(auth.sub, auth.empresaId).role`, lida do banco no request atual, e a segunda leitura e gratuita porque `requireAuth` acabou de executar a mesma query e o `React.cache` a deduplica. O arquivo exporta `POST` e nada mais — nem `GET`, nem `PATCH`, nem `PUT`, nem `DELETE` — e essa ausencia e a metade HTTP da imutabilidade de TERM-03.
- `app/api/termos/route.test.ts` e o primeiro teste de rota role-gated do projeto: 10 casos, com o de **nao-vacuidade** carregando duas asserções previas que provam que as duas fontes de role realmente DISCORDAM no cenario — sem elas, um `buildAuthToken` que ignorasse o override deixaria o teste verde pelo motivo errado e a protecao contra o Pitfall 2 nao estaria sendo medida por ninguem.
- `scripts/seed-superadmin.ts` cria empresa interna + usuario SUPERADMIN + primeira linha de auditoria numa transacao, de forma idempotente, com slug sorteado por CSPRNG e a credencial vindo exclusivamente da linha de comando. **Verificado contra o Postgres real, nao so por leitura de codigo**: duas execucoes consecutivas do mesmo comando deixaram o banco com exatamente **1** empresa vitalicia e **1** usuario SUPERADMIN.
- Suite completa subiu de 934 para **944 testes** (92 arquivos), com `tsc --noEmit` e `lint` limpos e `package.json` ganhando apenas a entrada `seed:superadmin` (deps 11 / devDeps 20 intactos — T-06-SC).

## Task Commits

1. **Task 1: `POST /api/termos` com role fresca do banco** - `6989aaa` (feat)
2. **Task 2: `route.test.ts` com o caso de nao-vacuidade** - `0defd68` (test)
3. **Task 3: `scripts/seed-superadmin.ts` + entrada em `package.json`** - `937176d` (feat)

## Files Created/Modified

- `app/api/termos/route.ts` (152 linhas) — JSDoc de cabecalho cobrindo as cinco decisoes exigidas (role do banco; 403 e nao o codigo de pagamento; teto de 200000 como ASVS V5 e como numero ESCOLHIDO, nao medido; D-04 sem tela de superadmin; ausencia consciente de rate limiting). Sequencia obrigatoria dentro do `try`, catch em quatro ramos.
- `app/api/termos/route.test.ts` (10 casos) — `describe`s de autorizacao, validacao de corpo e erros do service; helper local `mockContaComRole` que preserva os fatos de billing do stub global.
- `scripts/seed-superadmin.ts` (297 linhas com o cabecalho normativo) — os seis blocos exigidos pelo plano: por que existe, por que script e nao migration, por que roda pelo resolvedor do projeto, divergencia deliberada da guarda de ambiente, D-02 como mitigacao de impasse, slug nao-adivinhavel com as alternativas descartadas nomeadas, e a limitacao conhecida de um usuario por empresa.
- `package.json` — uma entrada nova em `scripts`, replicando caractere-a-caractere o formato de `seed:billing`.

## Decisions Made

- **A nao-vacuidade e provada por asserções versionadas, nao por reversao temporaria.** O plano da Task 2 estabelece que o caso so vale se falhar quando o handler autoriza pelo token. A verificacao natural seria reverter o handler para `auth.role` e ver o teste ficar vermelho — foi tentada, e o classificador de seguranca do ambiente bloqueou a execucao da suite sobre codigo de autenticacao deliberadamente enfraquecido (bloqueio correto: mutar auth de producao para uma forma insegura e exatamente o que ele existe para impedir). O handler foi restaurado imediatamente e `git diff` confirmou restauracao byte a byte antes de qualquer commit. A alternativa adotada e mais forte que o experimento descartado: o teste agora decodifica o token e afirma `role === "SUPERADMIN"`, e consulta o stub e afirma `role === "ADMIN"`, ANTES de chamar o handler. As duas asserções rodam em toda execucao da suite, para sempre, em vez de uma unica vez na maquina de quem executou o plano.
- **A validacao do corpo vem DEPOIS do portao de papel.** Consequencia deliberada: um ADMIN que mande corpo invalido recebe 403, nunca 400. Informar "seu corpo esta malformado" a quem nao pode publicar ja seria contar que existe uma validacao a contornar (ASVS V7). Os testes de 400 sobrescrevem o banco para SUPERADMIN justamente porque, sem isso, a validacao jamais seria exercitada.
- **`lib/unique-suffix.ts` foi lido e descartado.** O plano manda reusa-lo "se a forma servir". Nao serve: ele resolve colisao de slug com um contador deterministico (`-2`, `-3`, …), que e o comportamento certo para o slug PUBLICO de um cliente e o exatamente errado para um slug cuja unica defesa e nao ser adivinhavel. `randomBytes(4)` do `node:crypto` no lugar, com o motivo da divergencia escrito no proprio arquivo para quem comparar os dois.
- **O caso de teto inclusivo foi acrescentado ao conjunto pedido.** O plano lista o caso de 200001 caracteres; sem o par de 200000 exatos, trocar `max` por um limite estrito reduziria o teto em 1 caractere sem nenhum teste vermelho.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree sem `node_modules`, sem `.env` e sem os tipos gerados do Next**
- **Found during:** setup, antes da Task 1
- **Issue:** O worktree e criado so com arquivos versionados. Sem `node_modules` nenhum comando roda; sem `.env` nao ha `DATABASE_URL`; sem `.next/types` o `tsc` falha em `app/layout.tsx` com `TS2304: Cannot find name 'LayoutProps'`, porque `tsconfig.json` inclui `.next/types/**/*.ts`. Identico ao desvio 1 dos planos 06-01 e 06-02.
- **Fix:** Symlinks de `node_modules` e `.env` apontando para o checkout principal (ambos cobertos pelo `.gitignore`), mais `npx next typegen`. **Nenhum pacote instalado.**
- **Files modified:** nenhum arquivo versionado
- **Verification:** `git status --short` vazio apos os symlinks; `npx tsc --noEmit` saiu 0 no baseline, antes de qualquer codigo novo.
- **Committed in:** n/a (artefatos gitignored)

**2. [Rule 3 - Blocking] `npm ci` da Task 1 seria destrutivo neste contexto de execucao**
- **Found during:** Task 1, antes de escrever codigo
- **Issue:** O `<action>` da Task 1 manda rodar `npm ci` uma vez para diagnosticar a divergencia de `zod`. Neste worktree `node_modules` e um **symlink** para a arvore do checkout principal, e **dois outros agentes (06-04 e 06-06) estao executando em paralelo contra essa mesma arvore**. `npm ci` apaga `node_modules` e reinstala do zero — no meio de uma execucao paralela, isso derrubaria os dois vizinhos com falhas de modulo ausente, sem relacao alguma com o codigo deles. O plano nao podia prever isso porque a decisao de paralelizar a wave e do orquestrador, nao do planejador.
- **Fix:** O diagnostico foi feito de forma **read-only**, que responde exatamente a pergunta que o plano queria responder ("qual versao a CI realmente instala"): `package-lock.json` tem uma unica entrada para `node_modules/zod`, resolvida em **4.5.4** — e e essa que `npm ci` instala na CI; a arvore local tem **4.4.3**, deduplicada via `eslint-config-next` em algum `npm install` anterior. A divergencia e **real e pre-existente**, e o plano ja autoriza explicitamente nao resolve-la aqui.
- **Mitigacao adicional:** como as duas versoes divergem, a API usada foi restrita ao que e estavel em todo o zod 4 (`z.object`, `z.string().trim().min().max()`, `z.ZodError`), e a semantica foi **verificada em execucao** contra a versao instalada antes de o codigo ser escrito: `.trim()` roda ANTES de `.min(1)` (string so de espacos e recusada) e o valor devolvido pelo parse ja vem aparado. Nenhum pacote foi adicionado, removido ou alterado.
- **Files modified:** nenhum
- **Verification:** `git diff package.json` limitado a UMA entrada de script; contagem de deps 11 / devDeps 20 conferida pelo verificador automatizado da Task 3.
- **Committed in:** n/a (diagnostico, nao mudanca)

**3. [Rule 3 - Blocking] Reversao temporaria do handler para provar a nao-vacuidade foi bloqueada pelo ambiente**
- **Found during:** Task 2, apos os 10 casos passarem
- **Issue:** Para provar que o caso de nao-vacuidade nao e vacuoso, o handler foi temporariamente alterado de `conta?.role` para `auth.role` (a forma proibida), com a intencao de ver o teste ficar vermelho e reverter — a mesma tecnica usada no plano 02-02. O classificador de seguranca do ambiente recusou rodar a suite sobre codigo de autorizacao deliberadamente enfraquecido. **A recusa esta correta** e nao foi contornada.
- **Fix:** O handler foi restaurado na mesma sequencia de acoes e `git diff app/api/termos/route.ts` confirmou restauracao byte a byte (saida vazia) antes de qualquer commit — o commit `6989aaa` ja continha a forma correta e nunca foi tocado. A prova de nao-vacuidade foi entao movida para DENTRO do teste, de forma permanente: o caso decodifica o token e afirma `role === "SUPERADMIN"`, e consulta o stub do banco e afirma `role === "ADMIN"`, antes de chamar o handler. Isso cobre inclusive um modo de falha que a reversao temporaria NAO cobria (um `buildAuthToken` que silenciosamente ignorasse o override deixaria o teste verde com token e banco ambos dizendo ADMIN).
- **Files modified:** `app/api/termos/route.test.ts`
- **Verification:** `git diff app/api/termos/route.ts` vazio; 10 casos verdes; suite completa 944/944.
- **Committed in:** `0defd68`

---

**Total deviations:** 3 auto-fixadas (todas Rule 3 - blocking)
**Impact on plan:** Nenhum desvio de escopo. Zero pacotes instalados; `git diff package.json` restrito a uma entrada de script — T-06-SC satisfeito.

## Issues Encountered

**1. O criterio "`git diff package.json` mostra exatamente UMA linha adicionada" bate como `-1 +2`.**
Acrescentar uma entrada a um objeto JSON exige tambem uma virgula na linha anterior, entao o diff aparece como uma linha removida e duas adicionadas. Semanticamente o criterio esta satisfeito: existe exatamente **uma** entrada nova (`seed:superadmin`), e a linha de `seed:billing` mudou apenas pela virgula. Mesma classe de descompasso entre criterio de grep e realidade ja registrada nos planos 06-01 e 06-02, e coberta pela decisao `[04-09]`.

**2. O JSDoc obrigatorio da decisao (b) colidia com o criterio "o arquivo nao contem `STATUS_ASSINATURA_SUSPENSA` nem o literal `402`".**
O `<action>` da Task 1 manda explicar por que a rota devolve 403 e nao o codigo de pagamento — e o criterio de aceite, ao contrario do criterio de `auth.role ===`, e file-wide e nao descarta comentario. A saida foi escrever a explicacao INTEIRA sem citar nem o nome da constante nem a sequencia numerica ("o codigo ja usado para assinatura suspensa por falta de pagamento, a constante exportada por `lib/api-auth.ts`"). O raciocinio fica preservado e o gate de grep continua sendo sinal real sobre o codigo — a mesma convencao ja registrada em `app/api/cron/reconciliacao-diaria/route.test.ts`, e o proprio JSDoc diz que faz isso e por que.

**3. As duas mencoes a `auth.role ===` e `session.role ===` no JSDoc sao intencionais e permitidas.**
O criterio correspondente diz "em linhas de codigo, descartando as que apos trim comecam com `//`, `*` ou `/*`", e as duas ocorrencias (linhas 14 e 25) sao linhas de JSDoc iniciadas por `*`. **O gate `gates:fase-06` do plano 06-08 precisa descartar linhas de comentario antes de contar neste arquivo**, exatamente como os planos 06-01 e 06-02 ja pediram para os arquivos deles.

## Verification Results

| Verificacao | Esperado | Resultado |
|-------------|----------|-----------|
| `npx vitest run app/api/termos/route.test.ts` | >= 8 casos, exit 0 | **10 casos**, exit 0 |
| `npm run test` (suite completa) | verde | 92 arquivos / **944 testes** (eram 934) |
| `npx tsc --noEmit` | exit 0 | exit 0 |
| `npm run lint` | exit 0 | exit 0, 0 erros (2 warnings pre-existentes, arquivos nao tocados) |
| `grep -c "revalidarConta" app/api/termos/route.ts` | >= 1 | 3 |
| `auth.role ===` / `session.role ===` em linhas de CODIGO | 0 | 0 (2 ocorrencias, ambas em JSDoc — linhas 14 e 25) |
| `grep -c "403" app/api/termos/route.ts` | >= 1 | 3 |
| `STATUS_ASSINATURA_SUSPENSA` no arquivo | 0 | 0 |
| literal `402` no arquivo | 0 | 0 |
| `grep -cE "200_000\|200000" app/api/termos/route.ts` | >= 1 | 3 |
| `grep -c "export async function POST"` | 1 | 1 |
| `grep -cE "export async function (GET\|PUT\|PATCH\|DELETE)"` | 0 | 0 |
| `grep -c 'from "\.\.' app/api/termos/route.ts` | 0 | 0 |
| `grep -cE 'slug: "[a-z-]+"' scripts/seed-superadmin.ts` | 0 | 0 |
| `grep -ci 'senha.*=.*"' scripts/seed-superadmin.ts` | 0 | 0 |
| `grep -c "NODE_ENV" scripts/seed-superadmin.ts` | so em comentario | 1, na linha 58 de JSDoc; nenhuma guarda que aborte |
| `node -e "...scripts['seed:superadmin']?0:1"` | exit 0 | exit 0 |
| deps / devDeps | 11 / 20 | 11 / 20 |

### Verificacao do seed contra o Postgres real

Nao foi inspecao de codigo — o script rodou duas vezes contra o banco de dev e o estado resultante foi consultado.

| Medida | Resultado |
|--------|-----------|
| 1a execucao | `criado.` — usuario `c15f3c91-…`, slug `plataforma-interna-c5ac3318`, exit 0 |
| 2a execucao (mesmo comando) | `ja existe — nada foi criado.`, **mesmo id**, exit 0 |
| `Usuario.role` | `SUPERADMIN` |
| `Empresa.acessoVitalicio` | `true` |
| `Empresa.trialFim` / `acessoAte` / `canceladoEm` | `null` / `null` / `null` (D-03: `acessoVitalicio` tem precedencia, nao ha data enganosa no banco) |
| `Empresa.ultimoStatusAuditado` | `VITALICIO` |
| `count(Empresa WHERE acessoVitalicio)` apos as duas execucoes | **1** |
| `count(Usuario WHERE role = SUPERADMIN)` apos as duas execucoes | **1** |
| `AuditoriaAcesso` da empresa interna | exatamente 1 linha: `{statusAnterior: null, statusNovo: "VITALICIO", causa: "REGISTRO"}` |
| Slug gerado | sufixo hexadecimal sorteado, nao literal do arquivo |
| Sem `--email`/`--senha` | imprime o uso e sai com **codigo 1** |

## Threat Model Coverage

| Threat ID | Disposition | Como ficou |
|-----------|-------------|------------|
| T-06-01 | mitigate | Autorizacao por `revalidarConta().role`; zero `auth.role ===` em linha de codigo; provado pelo caso de nao-vacuidade, que agora tambem afirma que as duas fontes discordam |
| T-06-09 | mitigate | `z.string().trim().min(1).max(200_000)`; casos de 200001 (400) e 200000 (201) fixam o teto nos dois lados |
| T-06-24 | mitigate | Tres mensagens genericas ("Ação não permitida.", "Corpo inválido.", "Erro ao publicar termos."); o teste de 500 afirma sobre o corpo INTEIRO serializado que a mensagem original nao vaza |
| T-06-11 | mitigate | Slug com 4 bytes de CSPRNG, sorteado em runtime; `deletedAt` e allowlist descartados com o motivo de cada um escrito no arquivo |
| T-06-12 | mitigate | `acessoVitalicio: true` na empresa interna, comentado COMO mitigacao do impasse do Pitfall 9; confirmado no banco |
| T-06-25 | mitigate | Credencial so por argumento de linha de comando; `grep -ci 'senha.*=.*"'` devolve 0; nenhuma variavel de ambiente de aplicacao criada |
| T-06-02 / T-06-03 | accept | Sem mudanca nesta fase, conforme o plano |
| T-06-15 | accept | Ausencia de rate limiting registrada como decisao (e) no JSDoc do handler |
| T-06-SC | mitigate | Zero pacotes; `npm ci` deliberadamente NAO executado (desvio 2); deps 11 / devDeps 20 conferidos |

## TDD Gate Compliance

O plano e `type: execute`, entao o gate RED/GREEN de plano inteiro nao se aplica.

A **Task 1** e marcada `tdd="true"`, mas foi executada como implementacao-antes-do-teste **porque o proprio plano assim a estrutura** — exatamente a mesma situacao ja registrada para a Task 2 do plano 06-02. O bloco `<files>` da Task 1 lista somente `app/api/termos/route.ts`; seu `<verify>` e `npx tsc --noEmit && npm run lint`, e nao um run de teste; e o arquivo de teste correspondente e o entregavel da **Task 3 do enunciado (Task 2 aqui)**, cujo `<read_first>` manda explicitamente ler "a implementacao da Task 1". Inverter a ordem produziria um commit RED sobre um arquivo que o plano atribui a outra task. A cobertura exigida existe e esta verde (`0defd68`). A inconsistencia esta no plano, nao na execucao, e fica registrada aqui para o planejador da proxima fase — e essa e a **segunda vez consecutiva** que ela aparece nesta fase.

## Known Stubs

Nenhum introduzido por este plano. Os tres arquivos estao completos para o escopo; nenhum valor vazio, placeholder ou `TODO`.

Permanece o stub **herdado do plano 06-01**, fora do escopo deste: o texto da v1 dos termos e um placeholder que comeca com `[TEXTO PROVISORIO - …]`. Este plano e justamente o que torna possivel resolve-lo — o texto real nasce como v2 via `POST /api/termos`, nunca por `UPDATE` da v1 (D-07). O `checkpoint:human-verify` para o usuario fornecer/aprovar o texto juridico continua pertencendo a um plano posterior da fase.

## Threat Flags

Nenhuma superficie de seguranca fora do `<threat_model>` do plano foi introduzida. A unica rota nova e a que o plano descreve, e o script nao expoe nada em rede.

## User Setup Required

**Operacional, antes do go-live e uma vez por ambiente:**

```
npm run seed:superadmin -- --email <email-do-operador> --senha <credencial-forte>
```

Notas para quem for rodar:

- **A credencial usada na verificacao deste plano (`trocar123`, contra o banco de DEV) e descartavel e deve ser trocada** — foi escolhida para ser obviamente provisoria. Em producao, use uma credencial forte.
- O comando e idempetente: rodar de novo com o mesmo email nao recria nada e nao sobrescreve a credencial de quem ja esta la.
- **Anote o slug impresso.** Ele e a URL de login do SUPERADMIN (`/{slug}/admin/login`) e e sorteado a cada criacao — nao ha como recupera-lo depois a nao ser consultando o banco.
- Um segundo SUPERADMIN exige uma segunda empresa interna (`Usuario.@@unique([empresaId])`); basta rodar o script com outro email.

## Next Phase Readiness

- **06-08 (gates estaticos):** o gate `gates:fase-06` precisa descartar linhas de comentario antes de contar em `app/api/termos/route.ts` — as duas ocorrencias de `auth.role ===` / `session.role ===` sao JSDoc normativo (linhas 14 e 25), e o criterio de aceite deste plano ja as permite explicitamente. E o terceiro arquivo da fase com essa necessidade, depois dos de 06-01 e 06-02.
- **06-08 / e2e:** se um spec precisar de um SUPERADMIN autenticado, o padrao e `execFileSync` do `npm run seed:superadmin` a partir de `e2e/helpers.ts`, exatamente como `seedFatosBilling` ja faz — sincrono de proposito, para que ao retornar a linha ja esteja no banco. O slug e sorteado, entao o spec tem que **ler o slug da saida do script**, nunca hardcodar.
- **06-04 (gate de TERM-04):** atencao a interacao com esta rota. Se o gate de termos passar a lançar dentro de `requireAuth`, o SUPERADMIN que ainda nao aceitou os termos ficaria impedido de publicar a versao nova — o impasse gemeo de D-03. A empresa interna ja nasce com `acessoVitalicio` (o que resolve o lado do PAGAMENTO), mas isso **nao** resolve sozinho o lado dos TERMOS; D-03 tem que ser implementado explicitamente no gate.
- **Divergencia de `zod` (item separado, conforme o plano manda registrar):** o lockfile resolve `zod@4.5.4` e a arvore local tem `4.4.3`. A CI, que roda `npm ci`, instala **4.5.4**. Nao foi resolvido aqui (o plano proibe mexer em dependencias nesta fase) e nao bloqueia nada: o codigo so usa API estavel em todo o zod 4, com a semantica de `.trim()` antes de `.min()` verificada em execucao. Um `npm install` no checkout principal, fora de qualquer wave paralela, alinha a arvore ao lockfile.

## Self-Check: PASSED

Arquivos declarados, todos presentes em disco: `app/api/termos/route.ts`, `app/api/termos/route.test.ts`, `scripts/seed-superadmin.ts`, `package.json`.

Commits declarados, todos presentes no historico da branch: `6989aaa`, `0defd68`, `937176d`.

Nenhuma delecao de arquivo rastreado em nenhum dos tres commits (`git diff --diff-filter=D` vazio nos tres).

---
*Phase: 06-termos-de-uso-e-aceite*
*Completed: 2026-09-02*
