---
phase: 04-aplica-o-do-bloqueio
plan: 06
subsystem: acesso-e-bloqueio
tags: [acc-02, acc-04, dal, gate-de-navegacao, gate-de-api, 402, opt-out]

requires:
  - "acessoBloqueado(status) — lib/avaliar-acesso.ts (plano 04-01)"
  - "revalidarConta / ContaAtiva.statusAcesso — lib/auth-guard.ts (Fase 02)"
  - "rota /[slug]/admin/bloqueado — app/[slug]/admin/bloqueado/page.tsx (plano 04-05)"
  - "AuthError com .status — lib/api-auth.ts (Fase 01)"
  - "stub default de conta ativa — tests/setup/prisma-mock.ts (Fase 02)"
provides:
  - "requireAdminSession com segundo redirect para a tela de bloqueio (ACC-02)"
  - "requireAuth(request, opcoes?) com gate de assinatura fail-closed (ACC-02, ACC-04)"
  - "OpcoesDeAuth { permitirEmpresaBloqueada?: boolean } — interface exportada (NOVA)"
  - "STATUS_ASSINATURA_SUSPENSA = 402 — const de modulo exportada (NOVA)"
  - "app/api/assinaturas/checkout/route.ts como unico call site do opt-out"
affects:
  - "04-08 (e2e): o redirect de bloqueio e o alvo do assert de ausencia de loop"
  - "04-09 (gates): o grep de ocorrencia unica de permitirEmpresaBloqueada ja esta verde"
  - "Fase 5 (worker): o bloqueio ja vale para toda empresa com request; o worker e rede de seguranca, nao gatilho"
  - "Fase 7: novas rotas /api/* nascem gateadas por default, sem acao do autor"

tech-stack:
  added: []
  patterns:
    - "Gate no DAL (choke point), nunca em layout.tsx nem em proxy.ts — layout nao e boundary de autorizacao"
    - "Opt-out fail-closed: segundo parametro com default {} em vez de funcao-irma adotada rota a rota"
    - "Status derivado por request, memoizado so por React.cache — e o que faz a reativacao automatica funcionar"
    - "ultimoStatusAuditado alinhado ao status do fixture: isola a guarda do efeito de auditoria no teste"
    - "Fatos de carencia derivados do relogio, nunca literais que envelhecem"

key-files:
  created: []
  modified:
    - "lib/session.ts"
    - "lib/session.test.ts"
    - "lib/api-auth.ts"
    - "lib/api-auth.test.ts"
    - "app/api/assinaturas/checkout/route.ts"
    - "app/api/assinaturas/checkout/route.test.ts"
    - "app/api/produtos/route.test.ts"

decisions:
  - "402 Payment Required e nao 403: o chamador ja esta autenticado como a propria empresa inadimplente, entao nao ha vazamento cross-tenant e D-05 pede erro claro. Registrado no JSDoc como decisao do planner, com a ressalva de que a MDN classifica 402 como nao-padrao e que trocar custa uma linha"
  - "O opt-out fica DEPOIS da revalidacao de conta: dispensa a checagem de assinatura e so ela — conta inativa, empresa removida e erro de banco continuam 401 no checkout. Ha dois testes travando isso"
  - "O teste do 402 ponta a ponta foi para app/api/produtos/route.test.ts (fora da lista <files> do plano): a truth 'sem editar nenhum dos 29 handlers' precisa de uma rota qualquer, nao editada, provando o repasse generico de error.status"
  - "STATUS_ASSINATURA_SUSPENSA e afirmado contra o literal 402 nos testes de comportamento; so um caso separado compara a constante com 402, para o resto nao virar tautologia"
  - "Fixtures de teste usam ultimoStatusAuditado igual ao status esperado: com os dois iguais revalidarConta nao agenda auditoria, e o caso mede a guarda sem efeito colateral de escrita atravessando"

metrics:
  duration: "~7min"
  tasks: 2
  files: 7
  commits: 4
  tests_added: 17
  completed: 2026-09-01
---

# Phase 04 Plan 06: Gates de Bloqueio no DAL — Summary

Os dois choke points de autorizacao que ja existiam passaram a agir sobre o status de assinatura
que ja calculavam: `requireAdminSession` ganhou um segundo `redirect` e `requireAuth` um segundo
motivo de recusa — cobrindo 59 call sites de navegacao e 29 handlers de API sem editar um unico
deles.

## What Was Built

**Task 1 — gate de navegacao** (`lib/session.ts`)

Tres linhas dentro de `requireAdminSession`, imediatamente abaixo do redirect de login existente e
antes do `return session`: `if (acessoBloqueado(conta.statusAcesso)) redirect(/${slug}/admin/bloqueado)`.
A decisao e delegada inteira ao predicado unico do plano 04-01 — este arquivo nao compara status a
mao. O redirect continua fora de qualquer `try/catch`, e a ordem "banco so depois de token valido e
slug conferido" ficou intocada.

O JSDoc da funcao ganhou quatro paragrafos normativos: D-04/D-06 (os dois rotulos de suspensao sao
tratados igual; a distincao e trilha de auditoria), por que o destino mora fora do grupo
`(protected)` (T-04-14), por que a guarda nao pode morar num `layout.tsx` (T-04-06, com a citacao
do caminho dos docs empacotados do Next 16.3.0) e por que nao em `proxy.ts` (T-04-18).

**Task 2 — gate de API e opt-out unico** (`lib/api-auth.ts`, `app/api/assinaturas/checkout/route.ts`)

- `STATUS_ASSINATURA_SUSPENSA = 402`, const de modulo exportada, com o JSDoc da escolha e a
  ressalva de que e decisao do planner.
- `OpcoesDeAuth { permitirEmpresaBloqueada?: boolean }`, interface exportada, com o JSDoc que
  declara a flag como caso unico e qualquer segunda ocorrencia como bug.
- `requireAuth(request, opcoes: OpcoesDeAuth = {})`. O gate roda depois do `if (!conta)`, entao o
  opt-out nunca dispensa o 401.
- O checkout passou a ser o unico chamador de `requireAuth(request, { permitirEmpresaBloqueada: true })`,
  e o comentario de cabecalho — que afirmava nao existir consumidor deste endpoint — foi corrigido:
  a Server Action `iniciarPagamento` do plano 04-05 existe, chama `criarCheckout` direto, e a razao
  de ela nao consumir esta rota (cookie `httpOnly`, browser sem Bearer token) ficou registrada.

## Key Implementation Detail: o default vazio e a mitigacao

O ponto nao obvio deste plano nao e o `throw` — e a assinatura. A alternativa natural seria criar
um `requireAuthComAssinatura` e trocar caso a caso nas rotas que "precisam". Isso e fail-**open**
por default: a proxima rota que alguem escrever nasce sem gate, e ninguem descobre ate um cliente
inadimplente encontra-la. O segundo parametro com default `{}` inverte isso — o comportamento
protegido e o que voce recebe sem fazer nada, e sair da guarda exige escrever a flag, que por sua
vez e um grep de uma linha no plano 04-09 (T-04-13).

Pelo mesmo raciocinio, o opt-out fica **depois** da revalidacao de conta e nao no lugar dela: o
checkout precisa sobreviver ao bloqueio de assinatura, nao virar uma porta lateral para conta
desativada ou empresa removida. Dois testes travam essa fronteira (um em `lib/api-auth.test.ts`,
outro no proprio `route.test.ts` do checkout).

E ACC-04 nao precisou de codigo: o status ja e derivado a cada request e memoizado so por
`React.cache`, que e por request. O teste que prova isso troca o mock de `acessoAte` entre duas
chamadas com o **mesmo** token e afirma 402 depois payload. Se alguem envolver essa leitura em
`unstable_cache` ou `'use cache'` no futuro, e esse teste que cai.

## Tasks Completed

| Task | Nome | Gate | Commit |
|------|------|------|--------|
| 1 | Gate de navegacao em `requireAdminSession` | RED | `c353385` |
| 1 | Gate de navegacao em `requireAdminSession` | GREEN | `d7c7c16` |
| 2 | Gate de API + opt-out unico do checkout | RED | `5222b41` |
| 2 | Gate de API + opt-out unico do checkout | GREEN | `1fe9181` |

Nenhum commit de REFACTOR: as duas implementacoes sairam na forma final no GREEN.

## Verification Evidence

| Gate | Resultado |
|------|-----------|
| `npx vitest run lib/session.test.ts` | 26 testes, exit 0 |
| `npx vitest run lib/api-auth.test.ts app/api/assinaturas/checkout/route.test.ts app/api/produtos/route.test.ts` | 3 arquivos, 36 testes, exit 0 |
| `npm test` (suite inteira) | 85 arquivos, **868 testes**, exit 0 (era 851 apos a Task 1, 851 apos o merge da wave) |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 erros (1 warning pre-existente: `Link` nao usado em `app/registro/page.tsx`) |
| `git diff --stat package.json` | vazio (T-04-SC: nenhum pacote novo) |
| `grep -c "acessoBloqueado" lib/session.ts` | **2** (import + uso) |
| `grep -n "admin/bloqueado" lib/session.ts` | exatamente **1** linha (`:140`, o proprio redirect) |
| `grep -vE "^\s*(//\|\*\|/\*)" lib/session.ts \| grep -c "unstable_cache\|use cache"` | **0** |
| `grep -rn "requireAdminSession" app --include=*.tsx --include=*.ts \| grep -v "\.test\." \| wc -l` | **59** (inalterado — nenhum call site editado) |
| `grep -rl "permitirEmpresaBloqueada" app --include=*.ts --include=*.tsx \| grep -v "\.test\."` | **1** arquivo: `app/api/assinaturas/checkout/route.ts` |
| `grep -c "acessoBloqueado" lib/api-auth.ts` | **2** (import + uso) |
| `grep -vE "^\s*(//\|\*\|/\*)" lib/api-auth.ts \| grep -c "unstable_cache\|use cache"` | **0** |
| `grep -rn "instanceof AuthError" -A 2 app/api --include=route.ts \| grep -c "error.status"` | **29** (inalterado — nenhum handler editado) |
| `grep -n "requireAuth(" app/api/webhooks/asaas/route.ts` | nenhuma linha — o webhook nao chama a guarda (ver Deviation 2) |

Prova de nao-vacuidade (RED antes de GREEN):

- Task 1: 2 testes vermelhos, os dois casos de bloqueio, com `promise resolved "{ sub: 'user-1', …(4) }" instead of rejecting`.
- Task 2: 4 testes vermelhos — os dois casos de bloqueio, o caso ACC-04 e o da constante exportada
  (`STATUS_ASSINATURA_SUSPENSA` ainda inexistente).

Os casos de status liberado (TRIAL/EM_DIA/CARENCIA/VITALICIO) passaram ja no RED **de proposito**:
eles sao travas de regressao contra um gate largo demais, nao comportamento novo. Se a
implementacao tivesse comparado o status por desigualdade em vez de usar o predicado exaustivo,
seriam eles a cair.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `npx tsc --noEmit` falhava por tipos gerados ausentes no worktree

- **Encontrado em:** inicio da Task 1.
- **Problema:** `app/layout.tsx: error TS2304: Cannot find name 'LayoutProps'` — tipo GLOBAL gerado
  pelo Next em `.next/types/**`, que um worktree recem-criado nunca teve.
- **Correcao:** `npx next typegen` (exit 0), o mesmo procedimento ja documentado pelos planos 04-01
  e 04-05.
- **Arquivos versionados alterados:** nenhum (`.next/` e gitignored).
- **Commit:** nenhum.

### 2. [Rule 1 - Bug no criterio de aceite] O gate do webhook casava com um comentario pre-existente

- **Encontrado em:** Task 2, ao validar os criterios de aceite.
- **Problema:** o criterio exige que `grep -n "requireAuth" app/api/webhooks/asaas/route.ts` nao
  retorne nenhuma linha, mas o arquivo — que o plano manda explicitamente **nao** modificar — ja
  contem, desde a Fase 3, uma tabela em JSDoc com a linha
  `| requireAuth (Bearer JWT) | comparacao resistente a tempo do token |`. Ela existe justamente
  para documentar que o webhook diverge da guarda. O gate literal era insatisfazivel sem violar a
  instrucao "NAO modificar" do proprio plano.
- **Correcao:** validei a **intencao** do gate com `grep -n "requireAuth(" app/api/webhooks/asaas/route.ts`,
  que nao retorna nenhuma linha — nao existe chamada, so a mencao documental. O arquivo nao foi
  tocado. Comando corrigido, para o plano 04-09 reaproveitar:
  `grep -n "requireAuth(" app/api/webhooks/asaas/route.ts`
- **Arquivos modificados:** nenhum.
- **Commit:** nenhum.

Esta e a quarta ocorrencia da mesma classe de defeito nesta fase (04-01 teve duas, 04-05 teve duas):
um gate de grep cujo padrao proibido tambem e o identificador que a documentacao normativa precisa
nomear. Aqui a variante e pior — o texto que dispara o gate nao foi escrito por este plano, e sim
herdado de uma fase anterior.

### 3. [Rule 2 - Cobertura ausente de uma truth] Teste do 402 ponta a ponta numa rota qualquer

- **Encontrado em:** Task 2, ao conferir as `must_haves.truths` contra os testes escritos.
- **Problema:** a truth "qualquer chamada a `/api/*` autenticada de uma empresa bloqueada e
  rejeitada com um status proprio, sem editar nenhum dos 29 handlers" e o `<behavior>` "uma rota
  qualquer que use `requireAuth` sem opcoes devolve 402 sem edicao do handler" nao tinham teste: a
  lista `<files>` da Task 2 nao inclui `app/api/produtos/route.test.ts`, embora o comando de
  `<verify>` do plano o execute. O gate de grep dos 29 handlers prova que o repasse generico existe,
  mas nao que ele produz 402 de ponta a ponta.
- **Correcao:** `describe` novo em `app/api/produtos/route.test.ts` (GET e POST de empresa
  bloqueada -> 402 com a mensagem exata, e o service nunca chamado). `app/api/produtos/route.ts`
  **nao** foi tocado — e essa a evidencia. Escolhi produtos por ser a rota mais banal do projeto.
- **Arquivos modificados:** `app/api/produtos/route.test.ts` (somente teste).
- **Commit:** `1fe9181`.

### 4. [Rule 2 - Cobertura de fronteira] Dois testes provando que o opt-out nao dispensa o 401

- **Encontrado em:** Task 2, escrevendo o RED.
- **Problema:** a especificacao do opt-out descreve o que ele libera, nao o que ele continua
  recusando. Uma implementacao que colocasse a flag como early-return no topo de `requireAuth`
  satisfaria todos os casos do `<behavior>` e transformaria o checkout numa porta para conta
  desativada e empresa removida.
- **Correcao:** um caso em `lib/api-auth.test.ts` (opt-out + conta revogada -> 401) e outro em
  `app/api/assinaturas/checkout/route.test.ts` (conta revogada -> 401, service nao chamado).
- **Commit:** `5222b41` (RED) / `1fe9181` (GREEN).

## Notas de Implementacao

**Alinhar `ultimoStatusAuditado` ao status do fixture nao e cosmetico.** `revalidarConta` compara o
status derivado com o persistido e agenda uma linha de auditoria quando divergem; fora de escopo de
request o `agendarPosResposta` executa inline. Um fixture BLOQUEADO com `ultimoStatusAuditado: "TRIAL"`
faria cada caso de teste disparar uma escrita contra o deep mock do Prisma, misturando um efeito
colateral ao que se quer medir. Com os dois iguais, nenhum efeito e agendado.

**A carencia nao pode ser um literal de data.** Um `acessoAte` fixo no passado que hoje cai dentro
dos 10 dias de `DIAS_DE_CARENCIA` sai deles amanha, e o caso "CARENCIA nao bloqueia" viraria
"BLOQUEADO bloqueia" sozinho — verde por acidente ate o dia em que fica vermelho por acidente. Os
dois arquivos de teste derivam `acessoAte` de `Date.now() - 2 dias`.

**A constante exportada nao pode ser o oraculo do proprio teste.** Os casos de comportamento
afirmam contra o literal `402`; um unico caso separado afirma `STATUS_ASSINATURA_SUSPENSA === 402`.
Se todos usassem a constante, uma troca de valor passaria verde.

## Known Stubs

Nenhum. Os dois gates estao ligados, cobertos por teste, e ja valem em producao a partir deste
merge.

**Nota de escopo relevante para o deploy (nao e stub):** a partir daqui o bloqueio e retroativo e
imediato. Toda empresa cujos fatos de billing ja estejam vencidos ha mais de `DIAS_DE_CARENCIA`
dias e bloqueada no proximo request autenticado — sem esperar o worker da Fase 5 e sem aviso. O
04-RESEARCH.md (§Achado critico 5) recomenda uma contagem read-only contra producao/staging antes
do merge da fase; este plano nao a executa porque nao tem acesso a banco, e ela nao consta das
tarefas. Vale levantar no checkpoint da fase.

## Threat Flags

Nenhuma superficie de seguranca nova fora do `<threat_model>` do plano. As mitigacoes atribuidas
foram implementadas: T-04-06 (gate no DAL com a citacao dos docs empacotados no JSDoc, nada em
layout nem em proxy), T-04-08 (somente `React.cache`; gate de grep verde com filtro de comentario,
e o teste ACC-04 como prova executavel), T-04-10 (opt-out do checkout, testado nos dois rotulos de
suspensao), T-04-13 (flag fail-closed por default, ocorrencia unica provada por grep), T-04-14
(destino fora de `(protected)`, URL exata afirmada em dois testes unitarios), T-04-18 (ordem de
consulta ao banco preservada, provada pelo teste que afirma `findFirst` nao chamado sem sessao),
T-04-SC (`package.json` intocado).

## Self-Check: PASSED

Arquivos verificados no disco:

- FOUND: `lib/session.ts`
- FOUND: `lib/session.test.ts`
- FOUND: `lib/api-auth.ts`
- FOUND: `lib/api-auth.test.ts`
- FOUND: `app/api/assinaturas/checkout/route.ts`
- FOUND: `app/api/assinaturas/checkout/route.test.ts`
- FOUND: `app/api/produtos/route.test.ts`
- FOUND: `.planning/phases/04-aplica-o-do-bloqueio/04-06-SUMMARY.md`

Commits verificados em `git log`:

- FOUND: `c353385` test(04-06) RED task 1
- FOUND: `d7c7c16` feat(04-06) GREEN task 1
- FOUND: `5222b41` test(04-06) RED task 2
- FOUND: `1fe9181` feat(04-06) GREEN task 2

## TDD Gate Compliance

As duas tasks seguiram RED -> GREEN, cada gate no seu proprio commit e na ordem correta
(`test(...)` antes de `feat(...)` em ambas), com falha real e nao-vacua no RED. REFACTOR nao foi
necessario e nao gerou commit vazio.
