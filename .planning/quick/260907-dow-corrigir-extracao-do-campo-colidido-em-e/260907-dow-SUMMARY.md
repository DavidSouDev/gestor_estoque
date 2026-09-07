---
phase: quick-260907-dow
plan: 01
subsystem: tratamento-de-erro
tags: [prisma, driver-adapter, p2002, registro, defeito]
requires:
  - "@prisma/adapter-pg (já instalado)"
provides:
  - "lib/prisma-error.ts — camposDaColisaoUnica"
affects:
  - app/services/empresa.service.ts
  - app/services/usuario.service.ts
  - scripts/seed-superadmin.ts
tech-stack:
  added: []
  patterns:
    - "Módulo neutro em lib/ como único conhecedor de um formato interno de dependência, travado por gate de grep"
key-files:
  created:
    - lib/prisma-error.ts
    - lib/prisma-error.test.ts
  modified:
    - app/services/empresa.service.ts
    - app/services/usuario.service.ts
    - scripts/seed-superadmin.ts
    - app/services/empresa.service.test.ts
    - app/services/usuario.service.test.ts
decisions:
  - "D-C aplicada: meta.target tem precedência sobre o driver adapter mesmo sendo o ramo morto hoje"
  - "D-D aplicada: retorno sempre string[], nunca throw — um helper que lançasse dentro do catch viraria 500"
  - "D-E aplicada: lib/prisma-error.ts é o único arquivo de produção que menciona driverAdapterError"
metrics:
  duration: ~25min
  completed: 2026-09-07
requirements: [DEFEITO-P2002]
---

# Quick 260907-dow: Corrigir extração do campo colidido em erros P2002 — Summary

Todo `P2002` que passa pelo driver adapter voltou a virar a mensagem certa
(`Este email já está em uso.`, 409) porque a extração dos campos colididos
passou a ler `meta.driverAdapterError.cause.constraint.fields` — o caminho que o
`@prisma/adapter-pg` realmente produz — em vez do `meta.target`, que não existe
nesse caminho.

## O defeito

O usuário cadastrou uma empresa em `/registro` com um e-mail já existente e
recebeu *"Não foi possível concluir o cadastro. Tente novamente."* em vez de
*"Este email já está em uso."*. A causa não era a copy: o `if` que escolheria a
copy certa nunca era alcançado, porque os três leitores faziam
`Array.isArray(error.meta?.target) ? ... : []` e `meta.target` chega sempre
`undefined` no Prisma 7 com driver adapter. O array vazio derrubava os dois
`.includes(...)` e o `PrismaClientKnownRequestError` cru escapava do `catch`.

Pior: a suíte estava verde. Os helpers de teste construíam `meta: { target }` —
uma forma de erro que o Postgres de produção não gera mais —, então a suíte
cobria uma superfície morta.

## Não-vacuidade: o passo RED observado

Este é o ponto da task, e foi executado na ordem exigida: **os helpers de teste
foram reescritos para a forma real ANTES de qualquer mudança em arquivo de
produção**, e a falha foi observada de fato.

Comando, rodado com a produção ainda lendo `meta.target`:

```
npx vitest run app/services/empresa.service.test.ts app/services/usuario.service.test.ts
```

Resultado — **6 falhas**, exatamente as previstas:

```
 ❯ app/services/usuario.service.test.ts (14 tests | 2 failed) 22ms
 ❯ app/services/empresa.service.test.ts (52 tests | 4 failed) 58ms
 FAIL  app/services/empresa.service.test.ts > empresaService.registerComUsuario > converte violação de unicidade de email em HttpError 409
 FAIL  app/services/empresa.service.test.ts > empresaService.registerComUsuario > não deixa linha de auditoria órfã quando a transação de registro aborta
 FAIL  app/services/empresa.service.test.ts > empresaService.registerComUsuario > converte violação de unicidade de slug em HttpError 409
 FAIL  app/services/empresa.service.test.ts > empresaService.registerComUsuario — aceite dos termos (TERM-01) > não deixa aceite órfão quando a transação de registro aborta por email duplicado
 FAIL  app/services/usuario.service.test.ts > usuarioService.create > lança erro 409 quando a criação falha por violação de unicidade em empresaId
 FAIL  app/services/usuario.service.test.ts > usuarioService.create > lança erro 409 quando a criação falha por violação de unicidade em email
      Tests  6 failed | 60 passed (66)
```

O modo de falha é literalmente o bug de produção — o erro cru escapando no lugar
do `HttpError`:

```
AssertionError: expected PrismaClientKnownRequestError{ …(7) } to match object { …(2) }
- Expected
+ Received
- {
-   "message": "Este email já está em uso.",
-   "status": 409,
+ PrismaClientKnownRequestError {
+   "message": "Unique constraint failed on the fields: (`email`)",
+   "code": "P2002",
+   "meta": {
+     "driverAdapterError": DriverAdapterError {
+       "cause": { "constraint": { "fields": ["email"] }, "kind": "UniqueConstraintViolation" },
+       "name": "DriverAdapterError",
+     },
+     "modelName": "Usuario",
+   },
```

Depois da migração dos três leitores, o MESMO comando: `Tests 66 passed (66)`.

## O que foi construído

**`lib/prisma-error.ts`** — `camposDaColisaoUnica(erro): string[]`, com os dois
formatos e a precedência de D-C: `meta.target` (não vazio, todo string) primeiro,
`meta.driverAdapterError.cause.constraint.fields` como fallback, `[]` para o
resto. Cada salto é estreitado em runtime por um predicado local `ehObjeto`, sem
um único `as` e sem `any` (`grep -c 'as any' lib/prisma-error.ts` → `0`).

O JSDoc normativo registra, com arquivo e linha do bundle instalado: por que o
fallback existe (`@prisma/query-plan-executor/dist/index.js:106172-106181`), onde
os nomes ficam (`@prisma/adapter-pg/dist/index.js:472-478`), que `constraint`
pode ser `undefined` de verdade (linha 476 — retorno vazio não é defensive
coding), que os nomes são **colunas do Postgres** e quebram em silêncio se alguém
acrescentar um `@map`, e que este é o único arquivo autorizado a conhecer o
caminho interno.

**Os três leitores migrados**, com as guardas `instanceof`/`code` e todas as
mensagens **idênticas** (D-B): `empresa.service.ts` (email/slug),
`usuario.service.ts` (empresaId/email) e `scripts/seed-superadmin.ts`, que antes
imprimia `colisão de unicidade em []` em toda colisão real.

**Verificação de fatos do plano.** Os achados 1-3 foram reconferidos por leitura
do bundle antes de escrever código: `rethrowAsUserFacing` faz
`throw new UserFacingError(message, code, { driverAdapterError: error })`;
`mapDriverError` caso `"23505"` devolve
`constraint: fields !== void 0 ? { fields } : void 0`; e `DriverAdapterError` tem
`name = "DriverAdapterError"` com `cause` = payload
(`@prisma/driver-adapter-utils/dist/index.js:43-50`). Todos confirmados.

## Verificação — saídas reais

| # | Comando | Resultado |
|---|---------|-----------|
| 1 | `npx vitest run lib/prisma-error.test.ts` | `Test Files 1 passed (1)` / `Tests 12 passed (12)` |
| 2 | `npx tsc --noEmit` | 0 erros (saída vazia, exit 0) |
| 3 | `npm run lint` | `✖ 2 problems (0 errors, 2 warnings)` — exit 0 |
| 4 | `npm test` | `Test Files 100 passed (100)` / `Tests 1171 passed (1171)` |
| 5 | `npm run gates:fase-04` | `Resultado: 6/6 gates OK.` |
| 6 | `npm run gates:fase-05` | `Resultado: 6/6 gates OK.` |
| 7 | `npm run gates:fase-06` | `Resultado: 5/5 gates OK.` |
| 8 | `npm run gates:fase-07` | `Resultado: 6/6 gates OK.` |

**Contagem de testes (item 4).** 1159 → **1171**, delta de **+12**, exatamente os
12 casos novos de `lib/prisma-error.test.ts`. Nenhum teste foi removido; os 6 que
falharam na Etapa 1 são os mesmos que voltaram ao verde, não substituídos.

**Warnings do lint.** As 2 são **pré-existentes e fora do escopo**, em arquivos
que esta task não tocou: `'Link' is defined but never used` em
`app/registro/page.tsx` e `'fatosDeTrial' is defined but never used` em
`app/services/reconciliacao.service.test.ts`. Zero erros.

**Gate 1** (confinamento do formato interno, D-E) — saída literal:

```
$ grep -rl --include='*.ts' 'driverAdapterError' app lib scripts | grep -v '\.test\.ts'
lib/prisma-error.ts
```

Exatamente uma linha, como exigido.

**Gate 2** (nenhum leitor direto de `meta.target` em produção) — saída literal:

```
$ grep -rn --include='*.ts' -e 'meta?\.target' -e 'meta\.target' app lib scripts | grep -v '\.test\.ts:' | grep -v '^lib/prisma-error\.ts:' | grep -vE ':[0-9]+: *(//|\*)' | wc -l
0
```

**e2e:** não executado, conforme `<verification>` do plano — o defeito e a
correção são inteiramente server-side dentro do `catch` de dois services, e o
teste unitário de `empresa.service` já prova o cenário que originou a task
contra a forma real do erro.

## Arquivos intocáveis — confirmado

`git diff --name-only` contra a base do worktree devolve exatamente os 7 arquivos
de `files_modified`. Nenhum dos 6 arquivos vedados por D-G / achado 7 foi tocado:
`app/services/termo.service.test.ts`, `app/api/termos/route.test.ts`,
`app/[slug]/admin/(protected)/produtos/actions.ts`,
`app/[slug]/admin/(protected)/_lib/simples-actions.ts`,
`app/services/termo.service.ts`, `app/services/webhook-asaas.service.ts`.

## Ameaças

- **T-Q09-01 (mitigada):** o helper devolve apenas `constraint.fields` — nunca
  `detail`, `cause` ou `message`. O `detail` do Postgres carrega o valor colidido
  (`Key (email)=(...) already exists`); ele não é lido em lugar nenhum. As
  mensagens dos call sites continuam strings fixas, sem interpolação de valor.
- **T-Q09-03 (mitigada):** 5 dos 12 casos do teste do helper cobrem formas
  malformadas, incluindo um laço com 9 entradas hostis afirmando `not.toThrow()`.
- **T-Q09-04 (mitigada):** Gate 1 + testes de service na forma real — uma futura
  mudança de formato do Prisma quebra a suíte em vez de degradar em silêncio.
- **T-Q09-SC (mitigada):** zero dependências novas; os quatro gates de fase
  reportam `11 deps / 20 devDeps`, inalterado.
- **T-Q09-02 (aceita, sem ação):** restaurar a copy `Este email já está em uso.`
  reexpõe o oráculo de enumeração de contas que o bug escondia por acidente.
  Aceito como comportamento projetado e explicitamente pedido. Fechar o oráculo
  (rate limiting + copy neutra) segue sendo decisão de produto separada.

## Desvios do plano

Nenhum desvio de conteúdo — o plano foi executado exatamente como escrito, nas
três etapas e na ordem exigida.

**Nota de ambiente (não é mudança de código).** O worktree nasce sem
`node_modules`, `.next` e `next-env.d.ts` (todos gitignored). Sem `.next/types`,
o `tsc` acusa um falso `app/layout.tsx(20,50): error TS2304: Cannot find name
'LayoutProps'` — tipo gerado pelo `next dev`, não erro de código. Os três foram
ligados por symlink ao repositório principal para que a verificação rodasse de
verdade, e **removidos ao final**; `git status --short` fecha limpo. Nenhum
arquivo de scaffold entrou em commit.

## Known Stubs

Nenhum. Não há valor placeholder, dado mockado ou caminho não fiado nos arquivos
desta task.

## Commits

| Task | Commit | Descrição |
|------|--------|-----------|
| 1 | `68254f5` | `feat(quick-260907-dow): extrair campos de colisão P2002 dos dois formatos de meta` |
| 2 | `2119618` | `fix(quick-260907-dow): traduzir P2002 do driver adapter na mensagem certa` |

## Self-Check: PASSED

Os 7 arquivos de `files_modified` existem em disco; os 2 commits existem em
`git log`; nenhum commit contém deleção de arquivo
(`git diff --diff-filter=D` vazio nos dois).
