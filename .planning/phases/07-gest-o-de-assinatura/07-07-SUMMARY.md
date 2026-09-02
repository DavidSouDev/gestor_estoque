---
phase: 07-gest-o-de-assinatura
plan: 07
subsystem: testing
tags: [playwright, e2e, static-analysis, gates, billing, multi-tenancy, postgres]

# Dependency graph
requires:
  - phase: 07-gest-o-de-assinatura (planos 07-01 a 07-06)
    provides: "lib/avaliar-acesso (acessoEfetivoAte, ultimoDiaDeAcessoEmSaoPaulo), AsaasClient.removerAssinatura, assinaturaService.fatosDeAssinatura/consultarAssinatura/cancelar, cancelarAssinatura, PollerDeStatus, AssinaturaCard, a rota /{slug}/admin/assinatura e as duas entradas de navegação"
  - phase: 04-bloqueio-por-inadimplencia
    provides: "requireAdminSession com o gate de acesso, /admin/bloqueado, scripts/seed-fatos-billing.ts e scripts/gates-fase-04.mjs (a forma dos gates)"
  - phase: 06-termos-de-uso
    provides: "scripts/gates-fase-06.mjs (as três camadas de higiene) e o checkbox de termos no registro"
provides:
  - "e2e/cancelamento-de-assinatura.spec.ts — 4 casos contra Postgres real: SUB-01 offline, navegação, SUB-03 pós-cancelamento e isolamento cross-tenant"
  - "status de seed `cancelado-vigente` — a única fixture do projeto para 'cancelou e ainda tem período pago'"
  - "scripts/gates-fase-07.mjs — 6 gates estáticos, todos com não-vacuidade provada"
  - "npm run gates:fase-07"
  - "varredor de estado de comentário que entende comentário JSX de várias linhas (evolução da camada 1 de higiene)"
affects: [07-08, verificação de fim de fase, qualquer fase futura que mexa em billing ou na tela de assinatura]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate estático de ORDEM (compara índices de linha dentro de um método), e não só de presença"
    - "Gate escopado à camada de FRONTEIRA (actions/_lib/_components), com as `page.tsx` fora por decisão registrada"
    - "Higiene de comentário por varredor de estado: cobre `//`, JSDoc e comentário JSX de várias linhas"
    - "Spec e2e que declara no cabeçalho o que NÃO cobre e por quê"

key-files:
  created:
    - e2e/cancelamento-de-assinatura.spec.ts
    - scripts/gates-fase-07.mjs
  modified:
    - e2e/helpers.ts
    - scripts/seed-fatos-billing.ts
    - package.json

key-decisions:
  - "O escopo do Gate 1 é a camada de fronteira (actions, _lib/, _components/), não a árvore inteira do admin: `assinatura/page.tsx` lê `fatos.asaasSubscriptionId` no servidor a partir de fato LOCAL, que é o oposto do que o gate proíbe — incluí-la seria falso positivo permanente sobre a linha que implementa a decisão corretamente"
  - "O Gate 2 varre o CORPO do método `update` e os campos de `UpdateEmpresaDTO`, não o arquivo inteiro: `empresa.service.ts` cita os 4 fatos em 9 linhas de projeção `select` legítimas"
  - "A camada 1 de higiene foi evoluída de teste-de-prefixo para varredor de estado, em vez de reescrever a prosa dos componentes — o SUMMARY de 06-07 já registrou que reescrever comentário para não mover contador de grep não escala"
  - "`cancelado-vigente` grava `trialFim: null` de propósito: com o trial preenchido, `ultimoDiaDeAcessoEmSaoPaulo` poderia exibir a data do trial e a fixture ficaria dependente do instante do registro"
  - "Gate 1 compara ignorando caixa (o alvo é um NOME DE IDENTIFICADOR); os demais comparam com caixa (o alvo é trecho literal de chamada ou classe de CSS)"

patterns-established:
  - "Não-vacuidade por reversão temporária, gate a gate, registrada no SUMMARY com a mensagem de falha observada"
  - "Todo gate que nomeia um arquivo/método/interface falha quando ele some, em vez de passar em silêncio"

requirements-completed: [SUB-01, SUB-02, SUB-03]

# Metrics
duration: 38min
completed: 2026-09-02
---

# Phase 7 Plano 07: Fechamento executável da fase Summary

**Um spec e2e de 4 casos que prova os estados offline da tela de assinatura, o bloqueio pós-cancelamento e o isolamento entre tenants contra Postgres real, mais 6 gates estáticos que travam as invariantes que nenhum teste pega — com a não-vacuidade de cada um provada por reversão.**

## Performance

- **Duration:** ~38 min
- **Tasks:** 2
- **Files modified:** 5 (2 criados, 3 modificados)

## Accomplishments

- **`e2e/cancelamento-de-assinatura.spec.ts`** (200 linhas, 4 casos) — SUB-01 nos dois estados que não dependem do gateway, a navegação do painel até `/assinatura`, SUB-03 fim a fim (admin bloqueado + tela de assinatura inalcançável + catálogo despublicado) e o caso de isolamento de § Pitfall 11. O cabeçalho declara, em comentário, quais estados **não** são cobertos e por quê.
- **Status de seed `cancelado-vigente`** — a única fixture do projeto para o outro lado de D-06 (cancelou e o período pago segue vigente). Puramente aditivo: os 6 status existentes não tiveram uma linha alterada.
- **`scripts/gates-fase-07.mjs`** (~690 linhas com a documentação normativa) — 6 gates, 6/6 verdes, e cada um provado não-vácuo.
- **Higiene de comentário evoluída** — o teste de prefixo herdado das Fases 4-6 não cobre comentário JSX de várias linhas, e o primeiro rascunho do Gate 1 acusou prosa de `{/* … */}` em `assinatura-card.tsx:229`. Trocado por um varredor de estado que remove o conteúdo de comentário de cada linha antes de contar.

## Task Commits

1. **Task 1: e2e de cancelamento contra Postgres real** — `7356d6b` (test)
2. **Task 2: gates estáticos da Fase 7** — `5970017` (chore)

## Files Created/Modified

- `e2e/cancelamento-de-assinatura.spec.ts` — **criado.** 4 casos: (1) estado "aguardando" + navegação pela barra lateral; (2) estado "cancelada" com acesso residual; (3) SUB-03 — cancelada e expirada perde admin, `/assinatura` e catálogo; (4) isolamento cross-tenant + ausência de input carregando id no DOM.
- `scripts/gates-fase-07.mjs` — **criado.** 6 gates + a infraestrutura de higiene.
- `e2e/helpers.ts` — `cancelado-vigente` no tipo `StatusSeed`. `seedFatosBilling`, `expectGoneFromCatalogo`, `seedSuperadmin`, `publicarNovaVersaoDeTermos` e `uniqueEmpresa` **intocados**.
- `scripts/seed-fatos-billing.ts` — `cancelado-vigente` em `STATUS_ACEITOS`, em `STATUS_ENUM` e um ramo novo em `fatosPara`, mais uma rede de segurança própria. **Nenhum dos 6 ramos existentes foi alterado.**
- `package.json` — uma linha: `"gates:fase-07": "node scripts/gates-fase-07.mjs"`. `dependencies` e `devDependencies` inalterados (11 / 20).

## Os 6 gates e a prova de não-vacuidade

Cada gate foi revertido temporariamente (violação introduzida, gate observado ficando vermelho, reversão desfeita). `git status --short` ficou vazio depois de todas as reversões, e o commit de Task 2 contém apenas os dois arquivos pretendidos.

| Gate | Invariante | Violação introduzida | Resultado observado |
|------|-----------|----------------------|---------------------|
| 1 (a) | Nenhum id de assinatura na camada de fronteira (D-05 / § Pitfall 11, T-07-40) | `const assinaturaId = slug;` em `assinatura/actions.ts` | **FALHA** — "identificador de billing nomeado na camada de fronteira", com a linha citada |
| 1 (b) | Action da fase não lê o corpo do request | `const alvo = formData.get("alvo");` na mesma action | **FALHA** — "action da fase lendo o corpo do request", `actions.ts:58` |
| 2 | 4 fatos de billing fora do allowlist de `empresaService.update` (BILL-04, T-07-41) | `permitido.canceladoEm = null;` no corpo do `update` | **FALHA** — "fato de billing gravável por HTTP", `empresa.service.ts:551` |
| 3 | Em `cancelar`, gateway ANTES do banco (D-04 / § Pitfall 1, T-07-42) | `prisma.empresa.update` inserido no topo do método | **FALHA** — "a escrita local acontece ANTES da chamada ao gateway", com as duas linhas e seus números |
| 4 | Action de polling não fala com o gateway (§ Pitfall 3, T-07-43) | `await asaasClient.buscarAssinatura(...)` em `consultarStatusAcesso` | **FALHA** — "o arquivo da action de polling toca o gateway", `assinatura-actions.ts:88` |
| 5 (a) | Nenhum marcador de overlay nos arquivos novos (UI-SPEC, T-07-46) | `role="dialog"` no `<div>` da view de confirmação | **FALHA** — "marcador de overlay numa superfície da fase", `cancelar-assinatura.tsx:119` |
| 5 (b) | Nenhuma construção de data em componente | `const agora = new Date();` em `poller-de-status.tsx` | **FALHA** — "componente derivando ou formatando data por conta própria", linha 63 |
| 6 | Cadeia de suprimentos congelada (T-07-SC) | dependência falsa acrescentada ao `package.json` | **FALHA** — "esperado 11 deps e 20 devDeps, encontrados 12 e 20" |

Estado final: `npm run gates:fase-07` → **6/6 gates OK**, exit 0. `gates:fase-04`, `gates:fase-05` e `gates:fase-06` continuam **verdes** (6/6, 6/6 e 5/5).

## Decisions Made

- **Escopo do Gate 1 = camada de fronteira, não a árvore do admin.** O plano diz "actions, `_lib/` e componentes", e a razão é substantiva: `assinatura/page.tsx` lê `fatos.asaasSubscriptionId` para escolher o ramo da ordem normativa — leitura de fato **local, no servidor**, exatamente o oposto do que o gate proíbe. Varrer a page produziria um falso positivo permanente sobre a linha que implementa D-05 corretamente. Registrado em comentário no próprio gate. 47 fontes ficam no escopo.
- **Gate 1 compara ignorando caixa; os outros não.** A agulha do Gate 1 é um *nome de identificador*, e quem reintroduzir a violação pode escrevê-la em qualquer convenção (`…Id`, `…ID`, `…id`). Nos demais a agulha é trecho literal de chamada ou classe de CSS, onde a caixa é parte do contrato. Sem essa distinção, o Gate 1 passaria por acidente de caixa em vez de por decisão.
- **Gate 2 varre o corpo do método e o DTO, não o arquivo.** `empresa.service.ts` cita os 4 fatos em 9 linhas de projeção `select` legítimas (branding público, header, registro com trial). O gate extrai o corpo de `async update(id: string` até a chave de fechamento na indentação de 2 espaços, mais os campos de `UpdateEmpresaDTO` — e **falha** se qualquer um dos dois não for encontrado, em vez de passar em silêncio quando alguém renomear.
- **`cancelado-vigente` grava `trialFim: null`.** Com o trial preenchido, uma empresa recém-registrada poderia ter `trialFim` **depois** de `acessoAte`, e `ultimoDiaDeAcessoEmSaoPaulo` (que devolve o MAIOR dos dois, por D-05) passaria a exibir a data do trial — tornando a asserção da fixture dependente do instante do registro.
- **`STATUS_ENUM["cancelado-vigente"] = EM_DIA`.** O valor do mapa é o status que `avaliarAcesso` *deriva* daqueles fatos, não o nome da linha de comando. Um `--auditado cancelado-vigente` está pedindo "alinhe a auditoria em EM_DIA".
- **Caso 5 registra B num contexto separado do browser.** Registrar as duas empresas no mesmo `page` sobrescreveria o cookie de A, e o teste passaria a navegar como B — provando exatamente nada sobre isolamento.
- **A cobertura de navegação do modo SIMPLES fica no teste de componente do plano 07-03.** O tenant do e2e nasce em COMPLETO (default do formulário de registro), então a barra lateral é exercitada de verdade; alternar `modoInterface` custaria uma segunda jornada de formulário inteira para reprovar a mesma linha de `href`. Registrado em comentário no spec, como o plano pede.
- **`credenciaisDeApi` não foi copiada.** Nenhum dos 4 casos exercita a superfície REST — a camada de API do bloqueio já é provada por `bloqueio-por-inadimplencia.spec.ts`, e uma função não usada é erro de lint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A higiene de comentário do gate não cobria comentário JSX de várias linhas**

- **Found during:** Task 2 (primeira execução de `npm run gates:fase-07`)
- **Issue:** As Fases 4-6 descartam uma linha quando ela **começa** com `//`, `*` ou `/*`. Isso cobre comentário de linha e bloco JSDoc, mas **não** o comentário JSX (`{/* … */}`), cuja primeira linha começa com `{` e cujas continuações começam com prosa. O Gate 1 acusou como violação a linha 229 de `assinatura-card.tsx` — que é prosa dentro de um comentário JSX explicando por que aquele identificador **não pode** aparecer no código. Exatamente a falha que a camada 1 de higiene existe para evitar, só que numa forma de comentário que a heurística herdada não conhecia.
- **Fix:** `linhasDeCodigo` passou a usar um varredor de estado (`semComentarios`) que remove o conteúdo de comentário de cada linha, carregando o estado "dentro de bloco" de uma linha para a seguinte. Cobre as três formas que o projeto usa. As duas limitações conhecidas estão documentadas no JSDoc da função: `/*` dentro de string literal abriria um bloco falso (nenhum arquivo varrido faz isso), e `//` precedido de `:` é tratado como parte de URL, não como comentário. Todas as comparações passaram a usar o resíduo de código; a evidência de falha continua imprimindo a linha original.
- **Alternativa descartada:** reescrever a prosa do comentário em `assinatura-card.tsx`. O SUMMARY do plano 06-07 já registrou que reescrever comentário para não mover contador de grep não escala — e aqui o comentário está *certo*, é o gate que estava incompleto.
- **Files modified:** `scripts/gates-fase-07.mjs`
- **Verification:** 6/6 gates verdes; reversão temporária confirma que os 6 continuam detectando violação real.
- **Committed in:** `5970017`

**2. [Rule 2 - Missing critical functionality] Rede de segurança para o status de seed novo**

- **Found during:** Task 1
- **Issue:** `scripts/seed-fatos-billing.ts` já tinha uma verificação final para `cancelado` (os fatos precisam derivar CANCELADO, não BLOQUEADO). O status novo tem o modo de falha **inverso** e nenhuma proteção: se os fatos de `cancelado-vigente` derivassem qualquer coisa diferente de `EM_DIA`, a empresa ficaria bloqueada, a tela de assinatura sequer seria alcançável (`requireAdminSession` manda para `/bloqueado`), e o Caso 3 do e2e passaria a testar outra coisa em silêncio.
- **Fix:** um `if` adicional, no mesmo formato do que já existia, falhando com a explicação do sintoma. Nenhum ramo existente foi tocado.
- **Files modified:** `scripts/seed-fatos-billing.ts`
- **Verification:** `npx tsc --noEmit` exit 0; `npm test` 1153/1153.
- **Committed in:** `7356d6b`

### Desvio menor de critério de aceitação (registrado, não auto-corrigido)

O critério dizia "`git diff e2e/helpers.ts` contém apenas adições". O diff contém **uma linha modificada**: o JSDoc `/** Os seis status … */` virou `/** Os sete status … */`. Manter a palavra "seis" acima de uma lista de sete valores deixaria um comentário factualmente falso no arquivo que o resto da suíte lê primeiro. A intenção do critério — declarada na mesma linha — é que `seedFatosBilling`, `expectGoneFromCatalogo` e `uniqueEmpresa` não sejam alterados, e isso foi respeitado integralmente. A mesma correção de contagem foi feita em `scripts/seed-fatos-billing.ts` (dois comentários).

---

**Total deviations:** 2 auto-corrigidos (1 × Rule 1, 1 × Rule 2) + 1 desvio menor de critério, registrado.
**Impact on plan:** Nenhum scope creep. A correção 1 é o que torna o Gate 1 utilizável; a 2 é simetria com a proteção que já existia.

## Issues Encountered

### O e2e NÃO foi executado contra Postgres real — e isso é do ambiente, não do código

**Este é o item mais importante deste SUMMARY. Não presuma que os 4 casos passaram.**

Três bloqueios independentes, todos do worktree isolado:

1. **Não há `.env` no worktree.** O arquivo é gitignored e mora no repositório principal (`/home/david/projetos_pessoais/gestor_estoque/gestor_estoque/.env`, com `DATABASE_URL`, `JWT_SECRET`, `ASAAS_*`, `APP_BASE_URL` e `CRON_SECRET`). Copiá-lo para o worktree foi **negado pelo sandbox**.
2. **Sem `CRON_SECRET`, a suíte inteira nem lista:** `e2e/worker-reconciliacao.spec.ts:35` lança em tempo de import.
3. **Subir o servidor de desenvolvimento foi negado pelo classificador do sandbox**, e o `webServer` do `playwright.config.ts` é obrigatório. (O SUMMARY de 07-06 registra, além disso, que o Turbopack recusa resolver `next/package.json` de um diretório acima da raiz do workspace, porque o worktree não tem `node_modules` próprio.)

**O que FOI verificado sobre o spec, sem servidor:**

| Verificação | Resultado |
|---|---|
| `npx playwright test e2e/cancelamento-de-assinatura.spec.ts --list` | **4 testes reconhecidos**, sem erro de compilação |
| `npx playwright test --list` (suíte inteira, com `CRON_SECRET` fictício só para a listagem estática) | **32 testes em 11 arquivos** — 28 anteriores + 4 novos, acima do piso de 27 do critério |
| `npx tsc --noEmit` (após `npx next typegen`) | **exit 0** |
| `npx eslint` | **exit 0** (2 warnings pré-existentes, em `app/registro/page.tsx` e `app/services/reconciliacao.service.test.ts` — fora do escopo) |
| `npx vitest run` | **1153 passed / 99 files** — idêntico ao baseline de 07-06, zero regressão |
| `npm run gates:fase-07` | **6/6 OK**, exit 0 |
| `npm run gates:fase-06` / `-05` / `-04` | **5/5, 6/6 e 6/6 OK** |

**Ação necessária do orquestrador, após o merge da wave:** rodar `npm run test:e2e` (ou pelo menos `npx playwright test e2e/cancelamento-de-assinatura.spec.ts`) no repositório principal, onde o `.env` e o `node_modules` existem. Os 4 casos foram escritos a partir dos rótulos travados pelo plano 07-06 e das guardas lidas em `lib/session.ts`, mas **nenhum deles foi observado passando**. Se algum locator precisar de ajuste, é ajuste de locator — a lógica que eles medem está provada por `npm test` e pelos gates.

### `npx tsc --noEmit` num worktree novo

`app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`. Não é regressão: `LayoutProps` é tipo global que o Next.js 16 gera em `.next/types`, gitignored. Resolvido com `npx next typegen` (que gera apenas artefatos em `.next/`; nenhum arquivo versionado tocado). Idêntica à já registrada em `07-01`, `07-02`, `07-04`, `07-05` e `07-06`.

## Known Stubs

Nenhum. Os dois artefatos deste plano são executáveis e foram executados (o script de gates integralmente; o spec, na medida que o ambiente permitiu — ver § Issues Encountered).

## Threat Flags

Nenhuma superfície nova. Este plano não cria endpoint, rota, caminho de autenticação nem coluna: ele adiciona um spec de teste, um valor de vocabulário a um script que já se recusa a rodar em produção, e um analisador estático que não abre banco, não sobe servidor e não instala nada.

O único ponto que merece registro explícito é o de sempre em `scripts/seed-fatos-billing.ts`: o status novo grava fatos de billing **direto no banco**, contornando por construção o allowlist que o Gate 2 protege. É a mesma dívida deliberada da Fase 4, contida pela mesma defesa — a guarda de `NODE_ENV=production` é a primeira coisa executada no arquivo, e este plano não a afrouxou.

## User Setup Required

Nenhuma configuração de serviço externo é necessária para este plano. Continuam pendentes, do plano 07-08, os itens de sandbox do Asaas (suposições A1/A2/A3) que fecham os estados "ativa"/"degradado" e o `DELETE` real — blocker já registrado em `STATE.md`.

## Next Phase Readiness

**Pronto:**

- `npm run gates:fase-07` é um comando único que trava as 6 invariantes desta fase, e nenhuma delas depende de rede, banco ou servidor. Serve de gate de CI imediatamente.
- O spec cobre tudo o que não depende do gateway. O plano **07-08** herda uma divisão explícita: o que falta ali é exatamente o que exige a conta de sandbox aprovada, e o cabeçalho do spec nomeia esses itens.
- SUB-01, SUB-02 e SUB-03 estão no frontmatter deste plano. **`REQUIREMENTS.md` não foi alterado** — o bookkeeping é do orquestrador em modo worktree, e marcá-los aqui produziria conflito de merge com os planos irmãos que carregam os mesmos IDs. Mesma decisão registrada em `07-01`, `07-02`, `07-04`, `07-05` e `07-06`.

**Preocupações:**

- A execução real do e2e continua pendente (ver § Issues Encountered). Até ela acontecer, SUB-03 tem prova unitária e estática, mas não a prova fim a fim que este plano existe para produzir.
- Os números congelados no Gate 6 (11 / 20) e o escopo nomeado dos Gates 1, 2, 4 e 5 são pontos de manutenção: renomear um arquivo ou método faz o gate **falhar** de propósito, com a mensagem dizendo o que atualizar. Isso é o desenho, não um defeito — mas quem mover arquivos nesta área precisa saber.

**Não modificados (modo worktree):** `STATE.md`, `ROADMAP.md` e `REQUIREMENTS.md` — o orquestrador é o dono dessas escritas.

## Self-Check: PASSED

- `e2e/cancelamento-de-assinatura.spec.ts` — existe, 207 linhas (piso do plano: 90)
- `scripts/gates-fase-07.mjs` — existe, 689 linhas (piso do plano: 150)
- `package.json` — contém `gates:fase-07`; `git diff` contra a base traz **apenas** essa linha
- `.planning/phases/07-gest-o-de-assinatura/07-07-SUMMARY.md` — existe
- Commits `7356d6b`, `5970017` e `da53f38` presentes em `git log`; nenhuma deleção de arquivo em nenhum deles
- `git status --short` vazio após todas as reversões de não-vacuidade

---
*Phase: 07-gest-o-de-assinatura*
*Completed: 2026-09-02*
