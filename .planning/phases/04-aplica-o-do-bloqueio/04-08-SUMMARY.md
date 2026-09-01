---
phase: 04-aplica-o-do-bloqueio
plan: 08
subsystem: acesso-e-bloqueio
tags: [acc-01, acc-02, acc-03, acc-04, e2e, seed, bill-04, paridade-de-resposta, t-04-21]

requires:
  - "empresaService.findPublicavelBySlug / findBySlug gateados — plano 04-01 e 04-03"
  - "getEmpresaBranding + BRANDING_GENERICO na tela de login — plano 04-04"
  - "rota /[slug]/admin/bloqueado fora de (protected) + BloqueadoCard — plano 04-05"
  - "requireAdminSession com redirect de bloqueio e requireAuth com 402 — plano 04-06"
  - "AvisoCarencia (banner 'Pagamento pendente') — plano 04-07"
  - "avaliarAcesso / DIAS_DE_TRIAL / FatosDeAcesso — lib/avaliar-acesso.ts (Fase 02)"
  - "meiaNoiteEmSaoPaulo — lib/fuso-sao-paulo.ts (Fase 02)"
  - "scripts/resolvedor-ts.mjs (leitor de env @next/env + alias @/) — Fase 03 / plano 03-07"
provides:
  - "scripts/seed-fatos-billing.ts — escrita direta dos 4 fatos de billing por slug, nos 6 status"
  - "script npm seed:billing (mesma forma de linha de comando de asaas:webhook)"
  - "e2e/bloqueio-por-inadimplencia.spec.ts — prova viva dos criterios de sucesso #2, #3, #4 e #5"
affects:
  - "04-09 (gates): o opt-out do checkout e o 402 ja tem prova de execucao real, nao so de grep"
  - "Fase 5 (worker): a fixture de qualquer status de acesso passa a ser um comando, nao um INSERT manual"
  - "Fase 7 (gestao de assinatura): cancelamento e reativacao ja tem como ser montados em e2e"

tech-stack:
  added: []
  patterns:
    - "Habilitador de teste como script versionado em scripts/, nunca como endpoint de teste em producao"
    - "Guarda de NODE_ENV=production como PRIMEIRA instrucao, antes de qualquer I/O"
    - "Fatos de fixture sempre derivados de new Date(), nunca literais que envelhecem"
    - "ultimoStatusAuditado alinhado ao status derivado na MESMA escrita (nao gera trilha espuria)"
    - "execFileSync sincrono como sincronizacao de estado no e2e — nenhum waitForTimeout"
    - "Contexto de browser anonimo para medir o que um visitante externo ve, preservando a sessao do teste"

key-files:
  created:
    - "scripts/seed-fatos-billing.ts"
    - "e2e/bloqueio-por-inadimplencia.spec.ts"
  modified:
    - "package.json"

decisions:
  - "O empresaId do e2e vem de `usuario.empresaId` do POST /api/auth/login, e nao de `produtos[].empresaId` do corpo publico como o plano descrevia: uma loja recem-registrada nao tem produtos, entao o caminho do fallback seria SEMPRE o usado — e, depois do bloqueio, o corpo publico deixa de existir, enquanto o valor do login continua valido"
  - "A lista de palavras proibidas no corpo publico enumera as formas flexionadas (suspenso/suspensa/suspensao) em vez do radical `suspens`: o payload RSC do next dev carrega o marcador interno `$sreact.suspense`, e casar por radical acusava a plumbing do React como se fosse copy do produto. Nenhuma palavra do Copywriting Contract saiu da lista — `cobranca` inclusive ENTROU"
  - "O passo 8 (login de empresa bloqueada) usa um contexto de browser anonimo em vez de limpar os cookies do `page`: a guarda 'ja estou logado' da propria pagina de login devolveria o `page` ao painel antes de renderizar qualquer coisa, e limpar cookies destruiria a sessao que o passo 9 precisa para provar reativacao SEM novo login"
  - "O script grava `ultimoStatusAuditado` alinhado ao status derivado, seguindo o mesmo padrao que os fixtures de 04-06 ja adotaram: com os dois iguais o compare-and-swap da auditoria nao dispara, e o e2e mede o gate em vez de um efeito colateral de escrita"
  - "`vitalicio` grava os outros tres fatos vazios de proposito: o caso passa a ser a prova de que a coluna sozinha basta (BILL-04), e nao um estado misto que esconderia uma dependencia acidental"

metrics:
  duration: "~25min"
  tasks: 2
  files: 3
  commits: 2
  tests_added: 2
  completed: 2026-09-01
---

# Phase 04 Plan 08: Seed de Fatos de Billing e E2E de Bloqueio — Summary

A Fase 4 deixou de depender de leitura de código para ser acreditada: um spec de Playwright percorre
o ciclo inteiro contra Postgres real — trial saudável → bloqueada → paga → liberada — carregando o
MESMO token do começo ao fim.

## What Was Built

**Task 1 — `scripts/seed-fatos-billing.ts` + `npm run seed:billing`**

- `--slug <slug> --status <trial|em-dia|carencia|bloqueado|cancelado|vitalicio>`, parseado sobre
  `process.argv` sem parser instalado.
- **Guarda de produção como primeira instrução executada** (T-04-21): `NODE_ENV === "production"`
  imprime o motivo e encerra com `process.exitCode = 1` **antes de qualquer I/O**. O script grava
  exatamente os 4 campos que o allowlist de `empresaService.update` proíbe por HTTP; ele não pode
  virar a porta dos fundos que BILL-04 fechou.
- Os fatos são sempre derivados de `new Date()` e passam por `meiaNoiteEmSaoPaulo` — nenhuma
  aritmética de fuso à mão e nenhum literal de data que envelheça e troque o status sozinho.
- A escrita inclui `ultimoStatusAuditado` alinhado ao status que `avaliarAcesso` acaba de derivar,
  para o primeiro request depois do seed não enxergar uma transição que nunca aconteceu e gravar uma
  linha de trilha espúria.
- Slug inexistente (`P2025`) vira mensagem citando o slug e código de saída 1; a saída de sucesso
  imprime uma linha por fato mais o status derivado.
- `package.json` ganha só a entrada `seed:billing`, copiando a linha de comando de `asaas:webhook`.
  `dependencies` e `devDependencies` continuam com 11 e 20 chaves.

**Task 2 — `e2e/bloqueio-por-inadimplencia.spec.ts` (2 testes)**

*Teste 1 (critério #4):* empresa recém-registrada (TRIAL) mantém o painel, `GET /api/produtos` 200,
`GET /{slug}` 200 e `GET /api/empresas/slug/{slug}` 200, sem o banner `Pagamento pendente` — TRIAL
não é CARENCIA.

*Teste 2 (critérios #2, #3, #5):* linha de base verde → seed `bloqueado` → `GET /api/produtos` com o
MESMO Bearer vira **402** enquanto `POST /api/assinaturas/checkout` **não** vira 402 (o opt-out que
impede o auto-DoS) → `/{slug}/admin` termina em `/{slug}/admin/bloqueado` com `Acesso suspenso`,
`Pagar agora` e `Sair da conta` renderizados (o mesmo assert é a prova de ausência de loop de
redirect) → as 8 linhas da tabela de paridade do catálogo, com os 6 corpos varridos por uma lista de
palavras proibidas → login ainda responde a um visitante anônimo, com branding genérico e sem o nome
da loja nem o link `← Voltar ao catálogo` → seed `em-dia` devolve API, painel e catálogo **sem novo
login e sem token novo**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Falso positivo do radical `suspens` no payload RSC do `next dev`**

- **Found during:** Task 2, primeira execução do spec
- **Issue:** o passo 7 afirmava que nenhum corpo público contém `suspens`. O corpo de `GET /{slug}`
  é a página 404 do Next, cujo payload RSC de desenvolvimento carrega o marcador interno
  `$sreact.suspense` — plumbing do React, não copy do produto. O teste falhava por um motivo que
  nada tem a ver com o comportamento sob prova.
- **Fix:** a asserção passou a enumerar as formas flexionadas que o Copywriting Contract realmente
  usa (`suspenso`, `suspensa`, `suspensão`), mantendo `pagamento` e `assinatura` e **acrescentando**
  `cobrança`. O gate ficou mais largo em cobertura de vocabulário e deixou de casar com o framework.
  O motivo está comentado no próprio spec.
- **Files modified:** `e2e/bloqueio-por-inadimplencia.spec.ts`
- **Commit:** `8105004`

### Desvios deliberados de detalhe do plano

**1. Origem do `empresaId`.** O plano mandava extraí-lo de `produtos[].empresaId` no corpo público,
com `usuario.empresaId` do login como fallback. Uma loja recém-registrada nunca tem produtos, então
o fallback seria sempre o caminho tomado; e depois do bloqueio o corpo público deixa de existir. O
spec usa `usuario.empresaId` direto — mesmo valor, sempre disponível.

**2. Contexto anônimo no passo 8.** O plano dizia `page.goto('/{slug}/admin/login')`. Com o cookie
do registro ainda no `page`, a guarda "já estou logado" da própria página redireciona para o painel
(e de lá para `/bloqueado`), então o formulário nunca renderizaria. O spec abre um contexto de
browser separado — que é também a perspectiva certa para a asserção ("um visitante externo não
aprende o nome da loja") — e preserva intacta a sessão que o passo 9 precisa para provar reativação
sem novo login.

## Verification Results

| Comando | Resultado |
|---------|-----------|
| `npm run seed:billing -- --slug __inexistente__ --status bloqueado` | exit 1, mensagem citando o slug |
| `npx playwright test e2e/bloqueio-por-inadimplencia.spec.ts` | 2 passed |
| `npm run test:e2e` (suíte inteira) | **22 passed** |
| `npm test` | **876 passed, 86 arquivos** |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` nos 2 arquivos novos | exit 0 |
| `Object.keys(dependencies).length` | 11 |
| `Object.keys(devDependencies).length` | 20 |
| `grep -c "toBe(402)"` | 2 |
| `grep -c "admin/bloqueado"` | 1 |
| `grep -c "execFileSync"` | 3 |
| `grep -c "Empresa não encontrada."` | 1 |
| `grep -n "waitForTimeout"` | nenhuma linha |

Os seis status do script foram conferidos empiricamente contra `avaliarAcesso` antes do commit:
`trial→TRIAL`, `em-dia→EM_DIA`, `carencia→CARENCIA`, `bloqueado→BLOQUEADO`, `cancelado→CANCELADO`,
`vitalicio→VITALICIO`.

**Nota de ambiente:** já havia um `next dev` deste repositório rodando na porta 3000, e o Next
recusa subir um segundo servidor de desenvolvimento para o mesmo diretório. A suíte foi executada
com `PLAYWRIGHT_PORT=3000`, que faz o `reuseExistingServer` do `playwright.config.ts` reaproveitar
o servidor existente. Nenhuma configuração foi alterada; em uma máquina sem servidor rodando,
`npm run test:e2e` sobe o seu próprio na 3100 como sempre.

## Known Stubs

Nenhum. Os dois arquivos criados são executáveis e executados: o script grava no banco de verdade e
o spec o invoca por `child_process`.

## Threat Flags

Nenhuma superfície de segurança nova. O único componente com poder de escrita privilegiada
(`scripts/seed-fatos-billing.ts`) já estava no `<threat_model>` do plano como T-04-21, e a mitigação
prevista — recusa sob `NODE_ENV=production` antes de qualquer I/O — está implementada. Nenhum
endpoint HTTP foi aberto e o allowlist de BILL-04 permanece intacto.

## Self-Check: PASSED

- `scripts/seed-fatos-billing.ts` — existe
- `e2e/bloqueio-por-inadimplencia.spec.ts` — existe
- `.planning/phases/04-aplica-o-do-bloqueio/04-08-SUMMARY.md` — existe
- `package.json` → `scripts["seed:billing"]` — presente
- commit `e1f1779` (Task 1) — encontrado no histórico
- commit `8105004` (Task 2) — encontrado no histórico
