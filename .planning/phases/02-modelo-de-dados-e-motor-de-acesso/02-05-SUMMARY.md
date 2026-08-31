---
phase: 02-modelo-de-dados-e-motor-de-acesso
plan: 05
subsystem: backend
tags: [billing, trial, registro, auditoria, transacao, fuso-horario, e2e]

requires:
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    plan: 01
    provides: "colunas Empresa.trialFim e Empresa.ultimoStatusAuditado, model AuditoriaAcesso, enums StatusAcesso e CausaTransicaoAcesso"
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    plan: 02
    provides: "allowlist positivo de empresaService.update (o mesmo arquivo tocado aqui)"
  - phase: 02-modelo-de-dados-e-motor-de-acesso
    plan: 03
    provides: "meiaNoiteEmSaoPaulo (lib/fuso-sao-paulo.ts) e DIAS_DE_TRIAL (lib/avaliar-acesso.ts)"
provides:
  - "Toda Empresa nova nasce com trialFim = meia-noite de America/Sao_Paulo do 15o dia apos o cadastro e ultimoStatusAuditado = TRIAL"
  - "Primeira linha de AuditoriaAcesso (statusAnterior null, statusNovo TRIAL, causa REGISTRO) gravada na MESMA transacao do registro"
  - "Prova e2e contra Postgres real de que a empresa recem-criada navega no admin sem nenhuma mensagem de bloqueio ou cobranca"
affects: [02-06-gate-de-conformidade, 03-webhook-asaas, 04-enforcement, 05-worker-diario]

tech-stack:
  added: []
  patterns:
    - "Regra de billing mora no service, nunca na Server Action — so dentro do service o valor entra na mesma transacao atomica"
    - "Escrita da primeira linha de auditoria com `tx.` direto (sem compare-and-swap) porque a entidade acabou de nascer e nao ha concorrencia possivel sobre ela"
    - "Caso de teste de borda temporal (23:59 em Sao Paulo) como unica prova possivel da aritmetica de D-18 — um teste no meio do dia passa com `+14` e com `+15`"

key-files:
  created: []
  modified:
    - app/services/empresa.service.ts
    - app/services/empresa.service.test.ts
    - e2e/cadastro-e-login.spec.ts

key-decisions:
  - "trialFim e calculado em empresaService.registerComUsuario, nao em app/registro/actions.ts (CONTEXT §Claude's Discretion): a Server Action nao deve conhecer regra de billing, e so dentro do service o valor entra na transacao que ja cria Empresa+Usuario"
  - "A auditoria de REGISTRO usa tx.auditoriaAcesso.create direto, NAO acessoService.registrarTransicao do plano 02-04: aquele metodo opera sobre o prisma global (fora desta transacao) e o compare-and-swap dele e desnecessario para a primeirissima linha"
  - "Os outros tres fatos de billing ficam nos defaults do schema — nenhum caminho de aplicacao os escreve (BILL-04 acesso vitalicio, D-09 escrita da Fase 3, D-10 escrita da Fase 7); deixa-los nulos no registro e o que mantem esses contratos verdadeiros desde o dia 1"
  - "O e2e NAO conecta ao banco: o processo do Playwright nao carrega .env e nao deve conhecer credenciais; a prova de que trialFim foi gravado e indireta (navegar por uma segunda tela protegida, que uma empresa sem trialFim nao conseguiria) e o valor exato fica com o teste unitario e o gate SQL do 02-01"
  - "Valores esperados de trialFim escritos como literais UTC com a derivacao em comentario — calcula-los com meiaNoiteEmSaoPaulo no proprio teste seria circular"

patterns-established:
  - "Asseracao exata (toHaveBeenCalledWith, nunca objectContaining) no create da Empresa como rede permanente contra campo inesperado entrando no registro"
  - "Nao-vacuidade provada por reversao temporaria: trocar DIAS_DE_TRIAL + 1 por DIAS_DE_TRIAL faz falhar exatamente os 3 casos que dependem da aritmetica"

requirements-completed: [BILL-03, BILL-05]

duration: 8min
completed: 2026-08-31
---

# Phase 02 Plan 05: Trial de 14 Dias no Registro Summary

**Toda empresa criada em `/registro` passou a nascer com 14 dias completos de trial (meia-noite de `America/Sao_Paulo` do 15o dia, garantindo o prazo inteiro ate para quem se cadastra as 23:59) e com a primeira linha da trilha de auditoria escrita na MESMA transacao que cria Empresa e Usuario — sem nenhum dado de pagamento e sem nenhum bloqueio aplicado nesta fase.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-31T16:58:00Z
- **Completed:** 2026-08-31T17:06:00Z
- **Tasks:** 2
- **Files modified:** 3 (nenhum arquivo criado)

## What Was Built

### Task 1 — `app/services/empresa.service.ts` (commit `6ce3c16`)

`registerComUsuario` ganhou tres coisas, todas dentro do `$transaction` interativo que ja existia
(nenhuma transacao nova foi aberta, nenhuma foi trocada por escrita sequencial):

1. **Calculo do trial, antes do `try`:**
   `const agora = new Date();` e `const trialFim = meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1);`
   O `+ 1` esta escrito como `DIAS_DE_TRIAL + 1`, nunca como `15` literal, para a intencao continuar
   legivel. O comentario registra D-18: o dia do cadastro e o dia 0 e `meiaNoiteEmSaoPaulo` devolve
   o limite superior **exclusivo** do dia local, entao sem o dia extra quem se cadastrasse as 23:59
   receberia 13 dias e um minuto em vez dos 14 dias prometidos por BILL-03.

2. **`tx.empresa.create` com exatamente 5 chaves em `data`:** `nome`, `slug`, `modoInterface`,
   `trialFim`, `ultimoStatusAuditado: StatusAcesso.TRIAL`. Os outros tres fatos de billing ficam nos
   defaults do schema (nulo, nulo e `false`) — que e exatamente o estado correto de uma empresa em
   trial — e o comentario registra por que nenhum deles pode ser escrito por caminho de aplicacao
   (BILL-04, D-09 e D-10).

3. **`tx.auditoriaAcesso.create` antes do `return`,** com exatamente as 4 chaves de D-17
   (`empresaId`, `statusAnterior: null`, `statusNovo: TRIAL`, `causa: REGISTRO`). Estar na mesma
   transacao e o requisito de BILL-05: um `P2002` de email duplicado faz rollback do registro e leva
   a linha de auditoria junto, entao a trilha nunca fica com fantasmas.

O bloco `catch` de `P2002` ficou textualmente inalterado (confirmado no diff) e
`app/registro/actions.ts` nao foi tocado — o chamador continua sem conhecer regra de billing.

Import estendido na linha ja existente de `@prisma/client` (`CausaTransicaoAcesso, ModoInterface,
Prisma, StatusAcesso`), mais `meiaNoiteEmSaoPaulo` de `@/lib/fuso-sao-paulo` e `DIAS_DE_TRIAL` de
`@/lib/avaliar-acesso`, sempre com alias `@/`.

### Task 2 — testes unitario e e2e (commit `8d5049e`)

**`app/services/empresa.service.test.ts`** (14 → 18 testes no arquivo, 21 casos no total do arquivo):

- Fixture `empresaBase` estendida com os 5 campos de billing, para continuar representando uma linha
  real da tabela.
- A asseracao existente de `prismaMock.empresa.create` (que **quebrou** com a mudanca, como previsto)
  foi **estendida**, nao relaxada: continua `toHaveBeenCalledWith` exato e agora inclui `trialFim` e
  `ultimoStatusAuditado`. Essa exatidao e a rede que detecta campo inesperado entrando no registro.
- Caso novo `"grava o trial de 14 dias e a auditoria de REGISTRO na mesma transação"` (o titulo
  contem "trial", casando com o `-t "trial"` de `02-VALIDATION.md`), com asseracao **exata** de
  `auditoriaAcesso.create` sobre as 4 chaves — e a exatidao que prova D-17 — e
  `expect($transaction).toHaveBeenCalledTimes(1)`.
- Caso de borda de D-18: `vi.setSystemTime(new Date("2026-09-01T02:59:00.000Z"))`, que e 31/08 as
  23:59 em Sao Paulo, exige `trialFim` = `2026-09-15T03:00:00.000Z`.
- Caso de rollback: `usuario.create` rejeitando com `makeP2002(["email"])` continua produzindo o
  `HttpError` "Este email já está em uso." (status 409) e `auditoriaAcesso.create` nao chega a ser
  chamado.

Fake timers (`vi.useFakeTimers` / `vi.setSystemTime` / `vi.useRealTimers` em `finally`) sao legitimos
aqui, ao contrario de `avaliarAcesso`: `registerComUsuario` le `new Date()` internamente. Os valores
esperados sao literais UTC com a derivacao em comentario (30/08 e o dia 0 → +15 = 14/09 → meia-noite
SP, UTC-3, = 14/09 03:00Z), porque calcula-los com `meiaNoiteEmSaoPaulo` seria circular.

**`e2e/cadastro-e-login.spec.ts`** — o teste existente `"cria uma nova empresa e entra direto no
painel administrativo"` foi estendido (os outros dois testes do arquivo nao foram tocados):

- Clica no link `"Meus Produtos"` e afirma `/admin/produtos`, o heading `"Produtos"` e o link
  `"Novo produto"`. Uma empresa sem `trialFim` cairia em `BLOQUEADO` no motor do plano 02-03, entao
  navegar por uma segunda tela protegida e a prova pratica, contra Postgres real, de que o trial foi
  gravado.
- Asseracao **negativa** `expect(page.getByText(/bloquead|pagamento|assinatura vencida/i)).toHaveCount(0)`
  — nesta fase nada e bloqueado (enforcement e a Fase 4) e o teste trava esse contrato.
- Locators por role/label, `uniqueEmpresa()` para isolamento entre runs, e **zero** acesso ao banco.

## Escopo Negativo Respeitado

- `grep -cE "acessoVitalicio|acessoAte|canceladoEm" app/services/empresa.service.ts` = 2, ambas as
  ocorrencias dentro do comentario da allowlist do plano 02-02. **Nenhum caminho de escrita** desses
  tres campos existe na aplicacao (BILL-04, D-09, D-10).
- `grep -cE "DATABASE_URL|new Client|PrismaClient" e2e/cadastro-e-login.spec.ts` = 0.
- `app/registro/actions.ts` inalterado.
- Nenhum pacote novo instalado (T-02-SC).
- Nenhum bloqueio aplicado — a aplicacao do status e a Fase 4.

## Verification Results

| Gate | Resultado |
|------|-----------|
| `npx vitest run app/services/empresa.service.test.ts` | 21/21 verdes |
| `npx vitest run app/services/empresa.service.test.ts -t "trial"` | casos executados, verdes |
| `npx playwright test e2e/cadastro-e-login.spec.ts` | 3/3 verdes contra Postgres real |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (1 warning pre-existente de `Link` nao usado em `app/registro/page.tsx`, mantido de proposito desde 01-04) |
| `npm run test` | 518 testes / 71 arquivos, todos verdes (eram 515 antes) |

Gates de grep do Task 1: `DIAS_DE_TRIAL + 1` = 1, `meiaNoiteEmSaoPaulo(` = 1,
`auditoriaAcesso.create` = 1 (com `tx.`, nao `prisma.`), `$transaction` = 1.

**Nao-vacuidade comprovada por reversao temporaria:** trocando `DIAS_DE_TRIAL + 1` por
`DIAS_DE_TRIAL`, falham exatamente os 3 casos que dependem da aritmetica (incluindo o de 23:59),
com 18 passando. O `+ 1` foi restaurado imediatamente e a suite voltou a 21/21 antes do commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Gate de grep `DIAS_DE_TRIAL + 1` = 1 contra a instrucao de comentar o `+ 1`**

- **Found during:** Task 1
- **Issue:** A `<action>` manda comentar por que o deslocamento e `DIAS_DE_TRIAL + 1` e nao
  `DIAS_DE_TRIAL`, mas o acceptance criteria exige
  `grep -c "DIAS_DE_TRIAL + 1" app/services/empresa.service.ts` = 1 — e `grep -c` conta linha de
  comentario igual a linha de codigo. Escrever a explicacao com a expressao literal fazia o gate
  devolver 2.
- **Fix:** o comentario cobre integralmente o conteudo pedido (o dia do cadastro e o dia 0, o retorno
  de `meiaNoiteEmSaoPaulo` e limite superior exclusivo, e a consequencia concreta de 13 dias e um
  minuto para quem se cadastra as 23:59) descrevendo o deslocamento como "um dia extra alem de
  `DIAS_DE_TRIAL`". O gate literal passa com 1 e a intencao continua legivel no codigo.
- **Files modified:** `app/services/empresa.service.ts`
- **Commit:** `6ce3c16`

**2. [Rule 3 - Blocking] Servidor de dev ja em execucao impedia o `webServer` do Playwright**

- **Found during:** Task 2
- **Issue:** `npx playwright test` falhou com
  `Another next dev server is already running` / `Error: Process from config.webServer was not able
  to start. Exit code: 1`. O Next 16 recusa iniciar um segundo servidor de dev no mesmo diretorio, e
  havia um ja rodando (PID 154197, porta 3001) enquanto o `playwright.config.ts` tenta subir o seu na
  porta 3100.
- **Fix:** a suite foi executada contra o servidor existente com
  `PLAYWRIGHT_PORT=3001 npx playwright test e2e/cadastro-e-login.spec.ts` — o proprio config ja
  suporta isso (`PORT = process.env.PLAYWRIGHT_PORT ?? "3100"` e
  `reuseExistingServer: !process.env.CI`). Mesmo diretorio, mesmo codigo, mesmo banco. Nenhum arquivo
  de configuracao foi alterado e nenhum processo do usuario foi encerrado.
- **Files modified:** nenhum (condicao de ambiente)
- **Commit:** `8d5049e`

**3. [Rule 2 - Missing critical] Fixture `empresaBase` com `ultimoStatusAuditado: "TRIAL"` (divergencia entre PLAN e PATTERNS)**

- **Found during:** Task 2
- **Issue:** `02-PATTERNS.md:232` sugere `ultimoStatusAuditado: null` na fixture; a `<action>` do
  plano especifica `"TRIAL"`.
- **Fix:** seguido o plano (`"TRIAL"`), que e o valor coerente com o que este mesmo plano passou a
  gravar no `create` — a fixture representa a linha **depois** do registro, nao antes.
- **Files modified:** `app/services/empresa.service.test.ts`
- **Commit:** `8d5049e`

### Notas de implementacao (nao sao desvios)

- O caso de rollback foi escrito como **teste novo** em vez de alterar o
  `"converte violação de unicidade de email em HttpError 409"` existente: o teste antigo continua
  provando a conversao do erro sem depender de nada de billing, e o novo acrescenta a asseracao de
  que `auditoriaAcesso.create` nao foi chamado. Nenhuma cobertura foi perdida.
- `expect($transaction).toHaveBeenCalledTimes(1)` e a unica prova de atomicidade possivel no teste
  unitario: o `mockTransaction()` do arquivo repassa o proprio `prismaMock` como `tx`, entao o mock
  nao consegue distinguir `tx.` de `prisma.`. A distincao real e coberta pelo gate de grep do Task 1
  e, na pratica, pelo e2e contra Postgres.

## Authentication Gates

Nenhum.

## Known Stubs

Nenhum. O caminho esta completo de ponta a ponta: `/registro` → `register()` → `registerComUsuario`
→ `Empresa` com trial + `AuditoriaAcesso` REGISTRO, provado por teste unitario e por e2e contra
Postgres real.

## Threat Flags

Nenhuma superficie de seguranca nova. Os mitigantes de T-02-21 a T-02-24 do `<threat_model>` estao
implementados e cobertos por teste:

| Threat | Como ficou mitigado |
|--------|---------------------|
| T-02-21 (input influenciando `trialFim`) | `trialFim` derivado de `new Date()` do servidor; `RegisterComUsuarioDTO` nao tem campo de data e a Server Action le 6 campos nomeados do `FormData` |
| T-02-22 (registro concedendo acesso pago/vitalicio) | `tx.empresa.create` com exatamente 5 chaves; gate de grep confirmando ausencia dos tres campos em caminho de escrita |
| T-02-23 (empresa sem entrada de auditoria) | `tx.auditoriaAcesso.create` na mesma transacao; caso de teste com asseracao exata + caso de rollback |
| T-02-24 (trial menor que 14 dias a noite) | `DIAS_DE_TRIAL + 1` + caso de borda das 23:59, com nao-vacuidade comprovada |

T-02-25 (falha de auditoria abortando o registro) segue **aceito** de propria conta: a auditoria esta
na mesma transacao de proposito, e um erro ali deve mesmo abortar o registro em vez de criar empresa
sem trilha.

## Self-Check: PASSED

- `app/services/empresa.service.ts` — FOUND
- `app/services/empresa.service.test.ts` — FOUND
- `e2e/cadastro-e-login.spec.ts` — FOUND
- Commit `6ce3c16` — FOUND
- Commit `8d5049e` — FOUND
