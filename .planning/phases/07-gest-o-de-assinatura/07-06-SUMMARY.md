---
phase: 07-gest-o-de-assinatura
plan: 06
subsystem: billing-ui
tags: [rsc, next16, tailwind, degradacao-parcial, tdd, vitest, a11y, billing]

# Dependency graph
requires:
  - phase: 07-gest-o-de-assinatura
    plan: 01
    provides: "ultimoDiaDeAcessoEmSaoPaulo — produtor único da string dd/mm/aaaa exibida"
  - phase: 07-gest-o-de-assinatura
    plan: 02
    provides: "PollerDeStatus e consultarStatusAcesso — a convergência montada no Estado A"
  - phase: 07-gest-o-de-assinatura
    plan: 03
    provides: "PagarButtonProps.label / pendingLabel — os rótulos Assinar agora e Reativar assinatura"
  - phase: 07-gest-o-de-assinatura
    plan: 04
    provides: "assinaturaService.fatosDeAssinatura (sem I/O de gateway) e consultarAssinatura (degradação explícita)"
  - phase: 07-gest-o-de-assinatura
    plan: 05
    provides: "CancelarAssinatura + cancelarAssinatura(slug) — o caminho de cancelamento montado aqui"
  - phase: 04-aplicacao-do-bloqueio
    provides: "InlineError de bloqueado-card.tsx; o triângulo de aviso de aviso-carencia.tsx; PagarButton"
  - phase: 01-pre-requisitos-de-producao
    provides: "requireAdminSession e revalidarConta (memoizado por React.cache)"
provides:
  - "rota /{slug}/admin/assinatura — a tela inteira de SUB-01 e o único ponto de entrada de SUB-02"
  - "AssinaturaCard — apresentação dos cinco estados com as duas zonas de dado"
  - "AssinaturaCardProps — contrato de 14 props, todas decisões já tomadas pelo servidor"
affects: [07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ordem normativa de ramificação: os três ramos locais saem ANTES de qualquer I/O de gateway"
    - "Degradação particionada por zona de dado — só a zona alimentada pelo gateway pode faltar"
    - "Componente de apresentação sem relógio, sem formatador e sem comparação de enum de status"
    - "Prova de não-degradação por comparação de className entre dois renders (ativa vs degradado)"

key-files:
  created:
    - app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx
    - app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx
    - app/[slug]/admin/(protected)/assinatura/page.tsx
  modified: []

key-decisions:
  - "O status de carência é comparado com o literal \"CARENCIA\", e não com o membro do enum importado de @prisma/client: o critério de aceitação exige `grep -c 'prisma'` = 0 na page, e o próprio caminho de import contém a substring. A comparação com literal é aceita pelo compilador (tsc sai 0) e mantém o gate estático verificável sem pré-processamento."
  - "A guarda `ultimoDiaDeAcesso !== null` é DUPLICADA no componente, além de já estar em `podeCancelar` na page: `CancelarAssinatura` exige a data não-nula por tipo, e o compilador não aceitaria `string | null` ali. A dupla checagem é o que permite que a prop `podeCancelar` continue sendo um booleano simples em vez de um union discriminado."
  - "O heading do Estado A é um `<h2>` em tamanho Heading, não um segundo `<h1>`: o título da tela continua sendo `Assinatura`, e a regra vinculante da UI-SPEC é um único valor em tamanho Display (24px), não um único heading."
  - "A Zona 2 é condicionada por `estado`, não por `gateway.disponivel` sozinho: nos três primeiros estados a page nem falou com o gateway, então `disponivel: false` ali significa 'não há assinatura para descrever' e não 'a leitura falhou' — renderizar E1 nesses casos afirmaria uma falha que não aconteceu."

patterns-established:
  - "Asserção de não-esmaecimento por igualdade de `className` entre dois renders do mesmo tile em estados diferentes, mais um `not.toMatch(/opacity|animate-pulse/)`"
  - "Tabela `Record<Estado, Props>` percorrida por `it.each` para afirmar invariantes estruturais (um `<h1>`, Zona 1 completa) nos cinco estados de uma vez"

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-09-02
---

# Phase 7 Plan 06: A Tela de Assinatura Summary

**A rota `/{slug}/admin/assinatura` decide cinco estados numa ordem em que os três primeiros ramos jamais tocam o Asaas, e desenha duas zonas de dado das quais apenas uma pode faltar. 34 testes novos, zero regressão nos 1119 existentes, zero dependência nova.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-02T18:56:30Z
- **Completed:** 2026-09-02T19:03:28Z
- **Tasks:** 2 (Task 1 em TDD RED→GREEN)
- **Files created:** 3

## Accomplishments

- **A ordem de avaliação virou uma propriedade verificável por número de linha, não uma convenção.** `fatos.acessoVitalicio` está na linha 91, `fatos.canceladoEm` na 93 e `assinaturaService.consultarAssinatura` na 100. O que essa ordem compra não é elegância: se o ramo de `canceladoEm` viesse depois da consulta, o produto chamaria `GET /subscriptions/{id}` com o id de uma assinatura que ele mesmo acabou de remover em `assinaturaService.cancelar` — e a doc do fornecedor é ambígua sobre o que aquele `GET` devolve depois do `DELETE` (suposição A2, ainda não confirmada contra o sandbox e agendada para o plano 07-08). Ramificar antes torna a tela **independente daquela resposta**: qualquer que seja o comportamento real do sandbox, ele não alcança esta rota.

- **A degradação é particionada, e a partição tem prova executável.** O caso `"mantém a Zona 1 idêntica à do estado ativa e sem esmaecimento"` renderiza o estado `ativa`, captura três strings (o valor da data, o `className` do pill e o `className` do tile), desmonta, renderiza o estado `degradado` e afirma **igualdade** nas três — mais um `not.toMatch(/opacity|animate-pulse/)`. Uma implementação que esmaecesse a Zona 1 "para sinalizar que algo falhou" passaria em todos os outros 33 casos e falharia só nesse. O ponto não é estético: a conta do usuário não está quebrada quando o Asaas não responde, e uma tela que sugere o contrário produz o chamado de suporte que a fase existe para evitar.

- **O botão de cancelar continua habilitado no estado degradado, também por teste.** Uma leitura que falhou não implica uma escrita que vai falhar, e pré-desabilitar negaria a ação exatamente na tela que existe para oferecê-la. `expect(botao).toBeEnabled()` trava isso.

- **O Estado A não foi tratado como caso de borda.** `Empresa.asaasSubscriptionId` só é escrito no ramo `SUBSCRIPTION_CREATED` do webhook, e a homologação `[03-07]` provou que a confirmação do pagamento chega **antes** dele — logo, no instante em que o usuário volta do checkout, a "consulta viva ao gateway" de D-02 literalmente não tem id para consultar. É o primeiro minuto de todo assinante novo. `PollerDeStatus` monta aqui, e **só** aqui: um caso afirma a tira `role="status"` presente em `aguardando`, e três casos irmãos afirmam `queryByRole("status")` nulo nos estados `cancelada` e `ativa`.

- **O enum do fornecedor não tem caminho até a tela, e agora isso é afirmado sobre o DOM.** O plano 07-04 já o havia removido do tipo `StatusAssinatura`; este plano acrescenta a asserção de saída: um caso percorre os cinco estados e afirma `container.textContent` sem `ACTIVE|EXPIRED|INACTIVE`. Somando os dois, a proibição está travada no nível do tipo (não compila) **e** no nível do render (não aparece).

- **`E1` foi mantida com as duas frases.** A primeira, sozinha, é lida como "minha conta quebrou" — e não quebrou: a Zona 1 continua na tela e continua correta. A segunda frase é factual, não decorativa. `E3` é byte-idêntica à de `bloqueado-card.tsx`, verificada por `grep -cF` nos dois arquivos (1 e 1).

## Task Commits

| # | Task | Gate | Commit |
|---|------|------|--------|
| 1 | `AssinaturaCard` — os cinco estados e as duas zonas | RED (`test`) | `58d3cfb` |
| 1 | idem | GREEN (`feat`) | `305b78a` |
| 2 | `page.tsx` — as cinco decisões na ordem normativa | `feat` | `32c8871` |

Task 1 não precisou de REFACTOR: o código que passou no GREEN já era o código final.

### TDD Gate Compliance

| Task | RED (`test`) | GREEN (`feat`) | RED falhou antes do GREEN? |
|------|--------------|----------------|----------------------------|
| 1 | `58d3cfb` | `305b78a` | Sim — falha de resolução de `./assinatura-card`, 0 casos executados |

Nenhum caso passou inesperadamente na fase RED: o módulo sob teste ainda não existia, então a suite inteira falhou na importação. Não há, portanto, nenhuma asserção negativa que pudesse ter passado vacuamente.

## Files Created/Modified

- `app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx` (276 linhas, novo) — server component sem `"use client"`. Exporta `AssinaturaCard` e `AssinaturaCardProps` (14 props). Contém `COPY` (E1 e E3), `PILL_CLASSES`, `PILL_PATHS` (o triângulo de aviso copiado de `aviso-carencia.tsx:77`) e um `InlineError` local reproduzido de `bloqueado-card.tsx:97-114`.
- `app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx` (355 linhas, novo) — 34 casos em 7 `describe`. Mock estável de `useRouter` via `vi.hoisted`.
- `app/[slug]/admin/(protected)/assinatura/page.tsx` (162 linhas, novo) — RSC assíncrono com `params` e `searchParams` como `Promise` (Next 16). `requireAdminSession(slug)` chamado na própria page; `revalidarConta` para o status local; `fatosDeAssinatura` para os fatos de billing; `findHeaderData` para `primaryColor` com o mesmo fallback `?? "#18181b"` da tela de bloqueio.

Nenhum arquivo existente foi modificado. `(protected)/layout.tsx`, `bloqueado-card.tsx`, `cancelar-assinatura.tsx`, `poller-de-status.tsx` e `pagar-button.tsx` foram lidos como referência e permanecem intocados.

## Decisions Made

- **Comparação com o literal `"CARENCIA"` em vez do membro do enum.** O critério de aceitação da Task 2 exige `grep -c 'prisma'` = 0 em `page.tsx`, e o caminho de import `@prisma/client` contém a substring — importar o enum satisfaria o estilo e quebraria o gate. A comparação com literal é aceita pelo compilador (o enum gerado é um union de literais de string; `npx tsc --noEmit` sai 0) e preserva a intenção do critério, que é "esta page não fala com o banco por conta própria". A leitura continua vindo inteiramente do service e de `revalidarConta`.
- **A Zona 2 é condicionada por `estado`, não por `gateway.disponivel` sozinho.** Nos estados `vitalicio`, `aguardando` e `cancelada` a page nunca chamou o gateway, então `disponivel: false` ali significa "não há assinatura para descrever" — e não "a leitura falhou". Renderizar `E1` nesses casos afirmaria uma falha que não aconteceu. O componente calcula `mostraZona2 = estado === "ativa" || estado === "degradado"` e só dentro dela ramifica por `disponivel`.
- **Guarda `ultimoDiaDeAcesso !== null` duplicada no componente.** `CancelarAssinatura` recebe a data como `string` obrigatória (contrato do plano 07-05, que declinou o fallback de propósito), e o compilador não aceitaria `string | null` ali. A page já garante isso em `podeCancelar`, mas manter a checagem no ponto de renderização é o que permite que a prop continue sendo um booleano simples em vez de um union discriminado — e custa uma linha.
- **Heading do Estado A é `<h2>` em tamanho Heading.** A regra vinculante da UI-SPEC § Typography é **um único valor em tamanho Display (24px)**, que é a data de "Acesso até" — não um único heading. `Sem assinatura ativa` fica em `text-xl/[1.2] font-semibold`, dentro da escala declarada, e os cinco casos de `it.each` confirmam que o `<h1>` continua sendo um só.
- **O bloco do Estado A vem DEPOIS da Zona 1.** Uma empresa em trial que ainda não assinou tem uma data de acesso real para mostrar, e ela é a resposta à pergunta que trouxe o usuário à tela. A explicação da ausência de assinatura e a tira do poller vêm em seguida.

## Deviations from Plan

Nenhuma regra de desvio (1-4) foi acionada. Nenhum bug, nenhuma funcionalidade crítica ausente e nenhum bloqueio.

Uma tensão **interna ao próprio plano** precisou de arbitragem, registrada acima em Decisions Made: o item 8 do `<action>` da Task 2 manda derivar o tom a partir de `conta.statusAcesso` comparando com `CARENCIA`, e um `<acceptance_criteria>` da mesma task exige `grep -c 'prisma'` = 0 no arquivo. Importar o enum de `@prisma/client` satisfaria a primeira exigência e quebraria a segunda. Resolvido comparando com o literal de string, que o compilador aceita. Detectado e resolvido **antes** do commit, então nenhum commit deste plano contém uma violação de gate.

Duas observações de ambiente, ambas **fora** do escopo deste plano e deliberadamente não corrigidas:

1. **`npx tsc --noEmit` falha num worktree novo** com `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`. Não é regressão: `LayoutProps` é tipo global gerado pelo Next.js 16 em `.next/types`, gitignored. Resolvido com `npx next typegen` (gera apenas artefatos em `.next/`; nenhum arquivo versionado tocado). Depois disso `tsc --noEmit` sai 0. Idêntica à já registrada em `07-01`, `07-02`, `07-04` e `07-05-SUMMARY.md`.
2. **`npm run lint` reporta 2 warnings pré-existentes** (`Link` não usado em `app/registro/page.tsx`; `fatosDeTrial` não usado em `app/services/reconciliacao.service.test.ts`), ambos em arquivos que este plano não toca. 0 errors. Não corrigidos por SCOPE BOUNDARY.

## Issues Encountered

**`npx next build` não é executável neste worktree, e isso não é um defeito do código.** O worktree não tem `node_modules` próprio (as dependências resolvem via `../../../node_modules`, visível nos stack traces do Vitest), e o Turbopack recusa resolver `next/package.json` de um diretório acima da raiz do workspace:

```
Error: Could not find the Next.js package (next/package.json)
Resolved from: .../.claude/worktrees/agent-a3220b39fb7705488/app
```

`npx next typegen` funciona normalmente (resolve por outro caminho), e foi usado. A tentativa de build foi feita **uma vez**, como reforço opcional da verificação; o próprio plano já designa a renderização em runtime como verificação manual, com a prova automatizada delegada ao e2e do plano 07-07 — ver § Verification abaixo. Nenhum ajuste de código foi feito por causa disso e nenhum arquivo versionado foi alterado (`git status --short` limpo).

## Verification

| Gate | Resultado |
|------|-----------|
| `npx vitest run ".../assinatura-card.test.tsx"` | **34 passed** |
| `npm test` (suite completa) | **1153 passed** (99 files) — baseline do worktree era 1119, +34 novos, zero regressão |
| `npx tsc --noEmit` | exit 0 (após `npx next typegen`) |
| `npm run lint` | 0 errors (2 warnings pré-existentes) |
| `git diff package.json` | vazio — T-07-SC honrado, nenhuma dependência nova |
| `git status --porcelain "app/[slug]/admin/(protected)/layout.tsx"` | vazio — o layout não foi tocado |

### Acceptance criteria por task

**Task 1 — `assinatura-card.tsx`:**

| Critério | Resultado |
|----------|-----------|
| `npx vitest run assinatura-card.test.tsx` sai 0 | 34/34 passed |
| NÃO começa com `"use client"` | ✅ (`grep -c 'use client'` = **0**) |
| `grep -cE 'new Date\(\|Intl\.\|StatusAcesso'` | **0** |
| `grep -cE 'ACTIVE\|EXPIRED\|INACTIVE'` | **0** |
| `grep -c 'font-bold'` | **0** |
| `grep -c 'AvisoCarencia'` | **0** |
| Contém E3, e a mesma string existe em `bloqueado-card.tsx` | **1** aqui / **1** lá |
| Contém E1 | **1** |
| Caso afirmando exatamente um `<h1>` em cada um dos 5 estados | presente (`it.each` sobre os cinco) |
| Caso afirmando Zona 1 idêntica e botão de cancelar habilitado no degradado | presente (dois casos) |
| `npx tsc --noEmit` sai 0 e `npm run lint` sai 0 | ✅ |
| `min_lines: 90` do must-have | **276** linhas, contendo `AssinaturaCard` |

**Task 2 — `page.tsx`:**

| Critério | Resultado |
|----------|-----------|
| `npx tsc --noEmit` sai 0 e `npm run lint` sai 0 | ✅ |
| `npm test` sai 0 | 1153 passed |
| Contém `requireAdminSession(slug)` e `assinaturaService.fatosDeAssinatura` | 1 e 1 |
| `acessoVitalicio` e `canceladoEm` ANTES de `consultarAssinatura` | linhas **91** e **93** < **100** |
| `grep -c 'prisma'` | **0** |
| `grep -c 'ultimoStatusAuditado'` | **0** |
| `grep -c '29'` | **0** (o preço vem de `VALOR_PLANO_MENSAL`) |
| `git status --porcelain ".../layout.tsx"` vazio | ✅ |
| `npm run dev` servindo a rota para empresa em trial | **NÃO verificado neste worktree** — ver § Deferred Items |

### Must-haves do plano

| Verdade | Como está provada |
|---------|-------------------|
| O usuário vê status e a data até quando o acesso está pago | Casos de Zona 1 nos cinco estados + `valorDoTile("Acesso até")` |
| A próxima cobrança vem de consulta viva a cada carregamento | `consultarAssinatura` chamada no 4º ramo, sem cache; `unstable_cache` ausente |
| Gateway indisponível mantém os fatos locais e sinaliza só o que faltou | Caso de igualdade de `className` entre `ativa` e `degradado` + caso de E1 |
| A tela nunca chama o gateway com id de assinatura removida | Ordem de linhas 91/93 < 100, verificada por grep |
| Vitalício não vê cobrança nem botão de cancelar | Caso `"não oferece pagamento nem cancelamento e não mostra a Zona 2"` |

| Artefato | Estado |
|----------|--------|
| `page.tsx` provendo o RSC dos 5 estados (contém `requireAdminSession`) | ✅ 162 linhas |
| `assinatura-card.tsx` (min_lines 90, contém `AssinaturaCard`) | ✅ **276** linhas |

| Key link | Padrão | Ocorrências |
|----------|--------|-------------|
| `page.tsx` → `assinaturaService.fatosDeAssinatura` | `fatosDeAssinatura` | 1 |
| `page.tsx` → `ultimoDiaDeAcessoEmSaoPaulo` | `ultimoDiaDeAcessoEmSaoPaulo` | 2 |
| `assinatura-card.tsx` → `CancelarAssinatura` | `CancelarAssinatura` | 4 |

### Success criteria do plano

1. ✅ Empresa em trial ou em dia vê status, "acesso até" e próxima cobrança — Zona 1 nos cinco estados, Zona 2 no estado `ativa`
2. ✅ Com o gateway indisponível, a Zona 1 continua correta e completa e só a Zona 2 sinaliza a falta — provado por igualdade de `className` e por `E1` presente com `"Próxima cobrança"` ausente
3. ✅ Empresa cancelada vê "Cancelada", a data residual e "Reativar assinatura" — e o Asaas não é chamado (ramo 2, antes de qualquer I/O)
4. ✅ Empresa vitalícia vê "Acesso permanente", "Sem data de término" e nenhum botão de cancelar
5. ✅ A tela nunca exibe o enum do Asaas (asserção sobre `container.textContent` nos cinco estados) e nunca calcula data por conta própria (`grep -cE 'new Date\(|Intl\.'` = 0)

### Threat register

| Threat ID | Estado |
|-----------|--------|
| T-07-33 (EoP) | Aplicado — `requireAdminSession(slug)` chamado na page; rota permanece em `(protected)`; nenhuma guarda própria reimplementada |
| T-07-34 (Info disclosure) | Aplicado — toda leitura por `fatosDeAssinatura(session.empresaId)` e `findHeaderData(session.empresaId)`; nenhum id vem de `params` ou `searchParams` |
| T-07-35 (Info disclosure) | Aplicado — `select` explícito mora no service; `grep -c 'prisma'` = 0 na page |
| T-07-36 (DoS) | Aplicado — `consultarAssinatura` nunca relança (plano 07-04); Estado D renderiza Zona 1 completa e `InlineError` só na Zona 2 |
| T-07-37 (Tampering) | Aplicado — ordem normativa verificada por número de linha (91/93 < 100) |
| T-07-38 (Spoofing) | Aplicado — `tomStatus`/`rotuloStatus` derivam de `conta.statusAcesso`; enum do fornecedor ausente do tipo e do DOM (grep = 0 + asserção de render) |
| T-07-39 (DoS, loop de redirect) | Aplicado — rota dentro de `(protected)`, nenhuma guarda simétrica duplicada, `layout.tsx` intocado (`git status --porcelain` vazio) |
| T-07-SC | Honrado — Tailwind puro e SVG inline; `git diff package.json` vazio |

## Deferred Items

- **Verificação manual em runtime (`npm run dev` servindo `/{slug}/admin/assinatura` para uma empresa em trial) NÃO foi executada.** Duas razões independentes, ambas do ambiente: o worktree não tem `.env` (gitignored, mora no repositório principal) e não tem `node_modules` próprio, o que também impede `next build` (ver § Issues Encountered). O próprio plano já classifica esta verificação como manual e delega a prova automatizada ao e2e do plano **07-07** — a checagem estática equivalente (`tsc --noEmit` sobre os tipos de rota gerados por `next typegen`, mais `npm test` e `lint`) passou integralmente. **Recomendação para o orquestrador:** rodar `npm run dev` no repositório principal após o merge da wave, antes de fechar a fase.
- **`REQUIREMENTS.md` não foi alterado.** SUB-01 e SUB-02 aparecem no frontmatter deste plano, mas o bookkeeping de requisitos é do orquestrador em modo worktree, e marcá-los aqui produziria conflito de merge com os planos irmãos que carregam os mesmos IDs. Mesma decisão registrada em `07-01`, `07-02`, `07-04` e `07-05-SUMMARY.md`. **Nota para o verificador de fim de fase:** com esta tela no ar, SUB-01 e SUB-02 passam a ser verdadeiros de ponta a ponta para tenants COMPLETO **e** SIMPLES desde que as duas entradas de navegação (Surfaces 3a e 3b da UI-SPEC) existam — elas pertencem a outro plano desta fase.

## Known Stubs

Nenhum. Os três artefatos estão ligados a dados reais de ponta a ponta: a page lê do Postgres via `assinaturaService` e `revalidarConta`, consulta o Asaas via `consultarAssinatura` e passa as três Server Actions já vinculadas ao tenant. `gateway.disponivel: false` **não é stub**: é o estado explícito de degradação exigido por D-02b, com casos de teste próprios.

## Threat Flags

Nenhuma superfície de segurança nova além da já registrada no `<threat_model>` do plano. Este plano acrescenta exatamente uma rota autenticada dentro de `(protected)` (objeto de T-07-33/34/39) e nenhuma saída de rede nova — a chamada ao Asaas é a de `consultarAssinatura`, entregue e testada no plano 07-04. Nenhum endpoint HTTP novo, nenhuma alteração de schema, nenhuma Server Action nova (as três montadas aqui vêm dos planos 07-02 e 07-05).

## User Setup Required

Nenhum. Nenhuma variável de ambiente nova, nenhum serviço externo a configurar, nenhuma dependência instalada.

## Next Phase Readiness

- **07-07 (gates estáticos)** tem alvos concretos já verificados aqui, todos com grep cru, sem precisar descartar comentários: em `assinatura-card.tsx`, `new Date\(|Intl\.|StatusAcesso` = 0, `ACTIVE|EXPIRED|INACTIVE` = 0, `font-bold` = 0, `AvisoCarencia` = 0; em `page.tsx`, `prisma` = 0, `ultimoStatusAuditado` = 0, `29` = 0. O gate de **ordem normativa** é novo e vale a pena automatizar: o número da linha de `acessoVitalicio` e o de `canceladoEm` devem ser menores que o de `consultarAssinatura` — é a única invariante desta fase que um refactor inocente reverteria sem quebrar nenhum teste.
- **07-08 (e2e)** pode roteirizar a tela pelos rótulos travados: `Assinatura` (`<h1>`), `Acesso até`, `Plano`, `Próxima cobrança`, `Assinar agora`, `Reativar assinatura`, `Cancelar assinatura`, `Sem assinatura ativa`, `Sem data de término`. A rota é `/{slug}/admin/assinatura` e **não é alcançável por empresa bloqueada** — um spec que espere alcançá-la nesse estado está afirmando um bug (UI-SPEC § Reachability is bounded).
- **Sem bloqueadores.** Nenhum checkpoint aberto, nenhuma decisão pendente. A única pendência é a verificação manual em runtime, registrada em § Deferred Items com recomendação de execução pós-merge.

## Self-Check: PASSED

- Arquivos afirmados existem: `app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx`, `_components/assinatura-card.test.tsx`, `page.tsx` — 3/3 FOUND
- Commits afirmados existem em `git log`: `58d3cfb`, `305b78a`, `32c8871` — 3/3 FOUND, encadeados a partir do commit-base `f33634a`
- Nenhuma deleção de arquivo rastreado nos três commits: `git diff --diff-filter=D --name-only HEAD~3 HEAD` vazio
- `git status --short` vazio antes de escrever este arquivo: nenhum arquivo não rastreado, nenhuma alteração pendente
- `STATE.md` e `ROADMAP.md` **não** foram modificados (modo worktree; o orquestrador é o dono dessas escritas)

---
*Phase: 07-gest-o-de-assinatura*
*Completed: 2026-09-02*
