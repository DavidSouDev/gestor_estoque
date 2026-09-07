---
phase: quick-260907-dow
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/prisma-error.ts
  - lib/prisma-error.test.ts
  - app/services/empresa.service.ts
  - app/services/empresa.service.test.ts
  - app/services/usuario.service.ts
  - app/services/usuario.service.test.ts
  - scripts/seed-superadmin.ts
  - .planning/quick/260907-dow-corrigir-extracao-do-campo-colidido-em-e/260907-dow-SUMMARY.md
autonomous: true
requirements: [DEFEITO-P2002]
user_setup: []

must_haves:
  truths:
    - "Cadastrar em /registro com um e-mail já existente devolve `Este email já está em uso.` com status 409, e não mais a mensagem genérica de falha"
    - "A prova disso é um teste que simula a forma REAL do erro que o Postgres + @prisma/adapter-pg produzem (`meta.driverAdapterError.cause.constraint.fields`), não a forma antiga `meta.target`"
    - "A não-vacuidade está demonstrada: com os helpers de teste já no formato real e o código de produção ainda lendo o formato antigo, os 6 casos de P2002 de empresa/usuario FALHAM — e passam a verde só depois da troca pelo helper"
    - "`lib/prisma-error.ts` devolve os campos colididos a partir do formato do driver adapter E do formato `target` antigo, e devolve lista vazia (nunca lança, nunca `undefined`) quando nenhum dos dois está presente ou está malformado"
    - "`lib/prisma-error.ts` é o ÚNICO arquivo de produção que menciona `driverAdapterError` — nenhum service, action ou script conhece esse caminho interno"
    - "Nenhum arquivo de produção fora de `lib/prisma-error.ts` lê `meta.target` diretamente"
    - "`usuarioService.create` continua distinguindo colisão de `empresaId` (409 de administrador já existente) de colisão de `email` (409 de e-mail em uso)"
    - "`npm run seed:superadmin`, ao colidir, imprime os nomes reais dos campos em vez de uma lista vazia"
    - "`npm test`, `npx tsc --noEmit`, `npm run lint` e os quatro gates de fase (04, 05, 06, 07) seguem verdes, com zero dependências novas"
  artifacts:
    - path: "lib/prisma-error.ts"
      provides: "Extração única e tipada dos campos colididos de um P2002, cobrindo os dois formatos de `meta`"
      exports: ["camposDaColisaoUnica"]
      min_lines: 40
    - path: "lib/prisma-error.test.ts"
      provides: "Cobertura do formato do driver adapter, do formato antigo, da precedência e das formas malformadas"
      contains: "driverAdapterError"
    - path: "app/services/empresa.service.ts"
      provides: "Registro traduzindo colisão de email/slug em HttpError 409 pelo helper"
      contains: "camposDaColisaoUnica"
    - path: "app/services/usuario.service.ts"
      provides: "Criação de usuário traduzindo colisão de empresaId/email pelo helper"
      contains: "camposDaColisaoUnica"
    - path: "app/services/empresa.service.test.ts"
      provides: "`makeP2002` produzindo a forma real do driver adapter"
      contains: "constraint"
    - path: "scripts/seed-superadmin.ts"
      provides: "Mensagem de colisão do operador com os nomes reais dos campos"
      contains: "camposDaColisaoUnica"
  key_links:
    - from: "app/services/empresa.service.ts"
      to: "lib/prisma-error.ts"
      via: "import de camposDaColisaoUnica dentro do catch de P2002"
      pattern: "camposDaColisaoUnica"
    - from: "lib/prisma-error.ts"
      to: "erro do @prisma/adapter-pg"
      via: "meta.driverAdapterError.cause.constraint.fields"
      pattern: "driverAdapterError"
    - from: "app/services/empresa.service.test.ts"
      to: "app/services/empresa.service.ts"
      via: "makeP2002 rejeitando usuario.create com a forma real do erro"
      pattern: "makeP2002"
---

<objective>
Corrigir a extração do campo colidido em erros `P2002` do Prisma 7. Hoje todo
`P2002` que passa pelo driver adapter cai na mensagem genérica de erro, porque o
código lê `meta.target` — um campo que **não existe** nesse caminho.

Purpose: o usuário tentou cadastrar uma empresa em `/registro` com um e-mail já
existente e recebeu *"Não foi possível concluir o cadastro. Tente novamente."* em
vez de *"Este email já está em uso."*. A causa não é a copy: é que o `if` que
escolheria a copy certa nunca é alcançado. Pior, os testes ficam verdes porque
simulam uma forma de erro que o banco de produção não gera mais — a suíte cobre
uma superfície morta.

Output: `lib/prisma-error.ts` como único conhecedor do formato interno do driver
adapter, os 3 leitores de campo migrados para ele, e os helpers de teste
reescritos para a forma REAL — com a não-vacuidade provada por falha observada
antes da correção.

Nota sobre `requirements`: este é um **defeito**, não trabalho de roadmap.
Nenhum requisito de `.planning/REQUIREMENTS.md` cobre correção de tratamento de
erro, então o id `DEFEITO-P2002` é local a esta quick task e não deve ser
propagado para o roadmap.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@app/services/empresa.service.ts
@app/services/empresa.service.test.ts
@app/services/usuario.service.ts
@app/services/usuario.service.test.ts
@scripts/seed-superadmin.ts
@lib/empresa-publicavel.ts
</context>

<investigacao_ja_feita>
O planejador leu o código-fonte instalado do Prisma 7 e o código do projeto.
Estes são **fatos verificados por leitura**, não suposições — o executor não
precisa redescobri-los, e contradizê-los exige evidência nova.

**1. Como o `meta` do P2002 é construído (Prisma 7 + driver adapter).**
`node_modules/@prisma/query-plan-executor/dist/index.js:106172-106182`, função
`rethrowAsUserFacing`: ela deriva `code` e `message` do erro do adaptador e faz
`throw new UserFacingError(message, code, { driverAdapterError: error44 })`. O
`meta` final tem **apenas** `driverAdapterError` (mais `modelName`, acrescentado
por uma camada acima — ele aparece no stack trace que o usuário capturou).
**`meta.target` não existe nesse caminho.**

**2. Onde os nomes dos campos realmente ficam.**
`node_modules/@prisma/adapter-pg/dist/index.js:455-478`, função `mapDriverError`,
caso `"23505"` (unique violation do Postgres):
extrai `fields` de `error.detail` com a regex `/Key \(([^)]+)\)/`, faz `.split(", ")`,
e devolve `{ kind: "UniqueConstraintViolation", constraint: fields !== void 0 ? { fields } : void 0 }`.
Esse objeto vira o `.cause` do `DriverAdapterError`.

Somando (1) e (2), o caminho completo em runtime é
`erro.meta.driverAdapterError.cause.constraint.fields`.

**3. `constraint` pode ser `undefined` de verdade.** A linha 476 é explícita:
quando a regex não casa em `error.detail`, `constraint` sai `undefined`. Ou seja,
"P2002 sem lista de campos" é um estado real de runtime, não uma hipótese
defensiva — é por isso que o helper precisa de um retorno vazio bem definido.

**4. `meta` é fracamente tipado.**
`node_modules/@prisma/client-runtime-utils/dist/index.d.ts:386` declara
`meta?: Record<string, unknown>`. Cada salto (`driverAdapterError` → `cause` →
`constraint` → `fields`) chega como `unknown` e precisa ser estreitado em runtime.

**5. Os nomes vêm da COLUNA do Postgres, não do campo do Prisma.** Neste schema
os dois coincidem: `grep '@map' prisma/schema.prisma` não retorna nada — não há
uma única coluna renomeada. As constraints relevantes são `Usuario.email @unique`
(linha 112), `@@unique([empresaId])` em `Usuario` (linha 155) e
`Empresa.slug @unique` (linha 59).

**6. Só TRÊS lugares de produção realmente leem a lista de campos.** Confirmado
por `grep -rn 'meta?\.target\|meta\.target' app lib scripts`:
- `app/services/empresa.service.ts:230` — ramifica em `email` e `slug`
- `app/services/usuario.service.ts:86` — ramifica em `empresaId` e `email`
- `scripts/seed-superadmin.ts:277` — interpola os nomes na mensagem do operador

**7. O briefing desta task apontou dois arquivos a mais que NÃO estão quebrados.**
`app/[slug]/admin/(protected)/produtos/actions.ts:107,150` e
`app/[slug]/admin/(protected)/_lib/simples-actions.ts:72` só testam
`error.code === "P2002"` e devolvem uma mensagem fixa — **não leem campo nenhum**.
`produto` tem uma única constraint composta relevante (`@@unique([empresaId, codigo])`,
schema linha 194), então "qual campo colidiu" ali não tem uso. **Não tocar nesses
arquivos.** O mesmo vale para `app/services/termo.service.ts:75,105` e
`app/services/webhook-asaas.service.ts:567`, que também só olham o código.

**8. Por que a suíte está verde hoje.** `app/services/empresa.service.test.ts:164-170`
define `makeP2002(target: string[])` construindo `meta: { target }` — a forma
ANTIGA. `app/services/usuario.service.test.ts:120-151` faz o mesmo, duas vezes,
inline. Os testes provam um comportamento contra uma forma de erro que o Postgres
de produção não produz. É esse descolamento que esta task fecha.

**9. Consumidores de `makeP2002` a manter compilando.** Em
`empresa.service.test.ts`: linhas 342, 367, 398 e 597. Em `usuario.service.test.ts`
as duas construções são inline (não há helper ainda).

**10. `scripts/seed-superadmin.ts` resolve `@/`.** Ele já importa
`{ prisma } from "@/lib/prisma"` (linha 127) e roda pelo hook
`scripts/resolvedor-ts.mjs` — importar `@/lib/prisma-error` funciona sem ajuste
de tooling.

**11. `tsconfig.json` tem `lib: ["dom", "dom.iterable", "esnext"]`.** A assinatura
`new Error(msg, { cause })` do ES2022 type-checka, apesar de `target: "ES2017"`.
Os helpers de teste podem construir o `DriverAdapterError` falso com ela.
</investigacao_ja_feita>

<decisoes_travadas>
Estas decisões saíram da leitura do código real. **Não reabrir.**

**D-A — O helper mora em `lib/prisma-error.ts`, módulo neutro.** Ele é consumido
por dois services, um script e (potencialmente) qualquer chamador futuro. Colocá-lo
dentro de `empresa.service.ts` faria `usuario.service.ts` e o script importarem um
service para obter uma função pura. É o mesmo argumento já registrado no JSDoc de
`lib/empresa-publicavel.ts` ("módulo NEUTRO de propósito"), aplicado aqui.

**D-B — Assinatura: `camposDaColisaoUnica(erro: Prisma.PrismaClientKnownRequestError): string[]`.**
O helper recebe o erro **já estreitado** e faz UMA coisa: extrair a lista. A
guarda `error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"`
**permanece em cada call site**, intocada. Empurrá-la para dentro do helper
(recebendo `unknown`) mudaria 3 blocos de controle de fluxo que hoje estão
corretos, ampliando o diff sem fechar nenhum defeito.

**D-C — Precedência: `meta.target` primeiro, driver adapter como fallback.**
Quando `target` existe e não está vazio, ele vence. Não porque seja o que o
runtime atual produz (não é), mas porque é o contrato **público e documentado** do
Prisma: no dia em que uma versão futura o restaurar, ou num contexto sem driver
adapter, o projeto volta sozinho ao caminho suportado, sem edição. Um `target`
presente-porém-vazio cai para o fallback — vazio não é resposta, é ausência.

**D-D — O retorno é sempre `string[]`; o helper NUNCA lança e nunca devolve
`null`.** Os três call sites hoje fazem `.includes(...)` sobre um array e têm um
caminho de escape (repropagar o erro / mensagem genérica). Devolver `[]` para
formas desconhecidas preserva **exatamente** o comportamento atual nesses casos e
dispensa ramificação nova em qualquer chamador. Um helper que lançasse converteria
um 409 em 500 não tratado — ver `T-Q09-03`.

**D-E — `lib/prisma-error.ts` é o único arquivo de produção que pode escrever
`driverAdapterError`.** Esse identificador não é API pública do Prisma; é detalhe
de implementação lido do bundle instalado. Confinar o conhecimento a um arquivo é
o que torna uma futura mudança de formato um patch de uma linha em vez de uma
caçada. Provado por gate de grep, não por convenção.

**D-F — Os testes de service passam a simular SÓ a forma real; a cobertura do
formato antigo mora no teste do helper.** Duplicá-la na camada de service
testaria o helper duas vezes e não provaria nada novo sobre os services. Quem
quiser saber se o fallback funciona lê `lib/prisma-error.test.ts`. **Não
acrescentar casos de `meta.target` a `empresa.service.test.ts` nem a
`usuario.service.test.ts`.**

**D-G — `termo.service.test.ts` e `app/api/termos/route.test.ts` ficam
INTOCADOS.** Eles também têm um `makeP2002(target)` no formato antigo, mas o
código de produção que eles exercitam só olha `error.code` (achado 7) — o branch
testado é atingido de qualquer jeito. Reescrevê-los seria churn sem defeito
provado. Se algum dia alguém acrescentar ramificação por campo naquele service, a
correção é usar `camposDaColisaoUnica` e aí sim atualizar o helper de teste.
</decisoes_travadas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Criar lib/prisma-error.ts e provar os dois formatos</name>
  <files>lib/prisma-error.ts, lib/prisma-error.test.ts</files>
  <behavior>
    - Erro no formato REAL do driver adapter, com `constraint.fields` valendo `["email"]` → devolve `["email"]`
    - Constraint composta, `fields` valendo `["empresaId", "codigo"]` → devolve os dois nomes, na mesma ordem
    - Erro no formato antigo, `meta.target` valendo `["email"]` → devolve `["email"]`
    - Os DOIS formatos presentes com valores diferentes → vence `meta.target` (D-C)
    - `meta.target` presente porém `[]`, com driver adapter carregando `["slug"]` → devolve `["slug"]` (vazio cai para o fallback)
    - `meta` ausente por completo → devolve `[]`
    - Driver adapter presente mas com `cause.constraint` `undefined` (o caso real do achado 3: `detail` do Postgres sem `Key (...)`) → devolve `[]`
    - `meta.target` valendo uma string em vez de array → devolve `[]` (ou o fallback, se houver), sem lançar
    - `meta.driverAdapterError` valendo `null`, uma string, ou um objeto sem `cause` → devolve `[]`, sem lançar
    - `fields` contendo elementos não-string → devolve `[]`, sem lançar
    - Nenhuma entrada, por mais malformada, faz a função lançar (D-D)
  </behavior>
  <action>
Criar `lib/prisma-error.ts` exportando uma única função,
`camposDaColisaoUnica`, que recebe um `Prisma.PrismaClientKnownRequestError` (tipo
importado de `@prisma/client`) e devolve `string[]`.

**Algoritmo, nesta ordem (D-C):**

1. Se `erro.meta?.target` for um array **não vazio** cujos elementos são todos
   `string`, devolvê-lo.
2. Senão, percorrer `erro.meta?.driverAdapterError` → `.cause` → `.constraint` →
   `.fields`. Se o resultado for um array não vazio de `string`, devolvê-lo.
3. Senão, devolver `[]`.

**Sobre tipagem.** Pelo achado 4, `meta` é `Record<string, unknown>` e cada salto
chega como `unknown`. Escrever um predicado local minúsculo — algo como
`ehObjeto(valor): valor is Record<string, unknown>`, testando
`typeof valor === "object" && valor !== null` — e usá-lo antes de cada acesso a
propriedade. Validar o array final com `Array.isArray(...)` **mais** verificação
de que todo elemento é `string`. Feito assim, **nenhum `as` é necessário**; se
ainda assim um cast for o caminho mais legível em algum ponto, ele é aceitável
desde que fique dentro deste arquivo (D-E). Não usar `any` em lugar nenhum — o
`strict` do projeto está ligado e o lint do Next reclama.

**JSDoc normativo obrigatório**, no espírito dos comentários que já existem em
`lib/empresa-publicavel.ts` e `app/services/empresa.service.ts`. Precisa registrar,
com os caminhos de arquivo e números de linha dos achados 1-3 acima:

- Por que o fallback existe: o `meta` do P2002 produzido por
  `rethrowAsUserFacing` (`@prisma/query-plan-executor`) carrega **apenas**
  `driverAdapterError`, e este projeto usa `@prisma/adapter-pg` — então
  `meta.target` nunca chega em produção. Não "simplificar" removendo um dos dois
  ramos.
- Por que `meta.target` tem precedência mesmo sendo o ramo morto hoje (D-C).
- Que `constraint` pode ser `undefined` legitimamente (achado 3), e que é para
  isso que serve o retorno vazio — não é defensive coding.
- Que os nomes devolvidos são **colunas do Postgres**, não campos do Prisma
  (achado 5). Hoje coincidem porque o schema não tem um único `@map`; se alguém
  acrescentar um, as comparações `.includes("empresaId")` dos chamadores
  quebram em silêncio. Este é o aviso que evita a próxima ocorrência do mesmo
  bug.
- Que este arquivo é o ÚNICO lugar autorizado a conhecer o caminho interno
  (D-E), e que existe um gate de grep provando isso.

Criar `lib/prisma-error.test.ts` cobrindo os 11 pontos de `<behavior>`. Seguir o
padrão dos testes de `lib/` (ex.: `lib/empresa-publicavel.test.ts`): `describe` +
`it`, sem `prismaMock` — a função é pura e não toca banco.

Extrair no topo do arquivo de teste **dois construtores nomeados**, para que a
intenção de cada caso fique legível e para que os testes das Tasks seguintes
possam copiar a forma correta:

- um que monta o erro no formato do driver adapter a partir de uma lista de
  campos: cria um `Error` com `name` `"DriverAdapterError"` e `cause` valendo
  `{ kind: "UniqueConstraintViolation", constraint: { fields } }`, e o embrulha
  num `Prisma.PrismaClientKnownRequestError` com `code: "P2002"`,
  `clientVersion: "7.9.1"` e `meta: { modelName: "Usuario", driverAdapterError }`.
  A `message` deve imitar a real (`Unique constraint failed on the fields: ...`)
  para que uma falha de teste se pareça com a falha de produção.
- um que monta o erro no formato antigo, com `meta: { target }`.

Os casos malformados podem construir o `PrismaClientKnownRequestError` inline.
  </action>
  <verify>
    <automated>npx vitest run lib/prisma-error.test.ts</automated>
  </verify>
  <done>`lib/prisma-error.test.ts` passa com os 11 comportamentos cobertos; `npx tsc --noEmit` sem erros novos; `grep -c 'as any' lib/prisma-error.ts` devolve 0.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Provar a falha, migrar os 3 leitores e travar a superfície</name>
  <files>app/services/empresa.service.test.ts, app/services/usuario.service.test.ts, app/services/empresa.service.ts, app/services/usuario.service.ts, scripts/seed-superadmin.ts</files>
  <behavior>
    - Com os helpers de teste já no formato real e a produção ainda no formato antigo, os 4 casos de P2002 de `empresa.service.test.ts` e os 2 de `usuario.service.test.ts` FALHAM (passo RED — é a prova de que a correção não é decorativa)
    - Depois da migração, `registerComUsuario` com `usuario.create` rejeitando por colisão de `email` no formato real lança `HttpError` com `Este email já está em uso.` e status 409
    - `registerComUsuario` com `empresa.create` rejeitando por colisão de `slug` no formato real lança o `HttpError` 409 de identificador único
    - `registerComUsuario` continua repropagando erros que não são P2002, sem virar 409
    - Os dois testes de transação (auditoria órfã e aceite órfão) continuam afirmando que a escrita seguinte não ocorreu, agora com o erro no formato real
    - `usuarioService.create` distingue colisão de `empresaId` (409 de administrador já cadastrado) de colisão de `email` (409 de e-mail em uso), no formato real
    - Um P2002 cuja lista de campos venha vazia continua sendo repropagado / caindo na mensagem genérica, exatamente como hoje
  </behavior>
  <action>
Executar em **três etapas, nesta ordem**. A ordem é o ponto da task: sem o passo
RED, nada distingue esta correção de uma reescrita cosmética.

---

**Etapa 1 — Reescrever os helpers de teste e OBSERVAR A FALHA.**

Em `app/services/empresa.service.test.ts`, substituir o corpo de `makeP2002`
(linhas 164-170) pela construção da forma real do driver adapter — a mesma forma
que o construtor nomeado da Task 1 monta. **Manter o nome `makeP2002` e a
assinatura de um único parâmetro `string[]`**, para que as 4 chamadas existentes
(linhas 342, 367, 398, 597) não mudem. Renomear o parâmetro de `target` para
`fields` ou `campos`, já que não é mais um `target`.

Em `app/services/usuario.service.test.ts`, extrair um `makeP2002(campos: string[])`
no nível do módulo, com a mesma forma real, e trocar as duas construções inline
(linhas 122-128 e 145-151) por chamadas a ele.

Não copiar o helper de dentro de `lib/prisma-error.test.ts` por import: um teste
importando helper de outro teste acopla dois arquivos sem ganho. Duplicar as ~8
linhas nos dois arquivos de service é o custo aceito, e cada cópia leva um
comentário curto dizendo que a forma foi verificada em
`@prisma/adapter-pg/dist/index.js:472-478` e por que ela é a forma real.

Agora rodar, **antes de tocar em qualquer arquivo de produção**:

`npx vitest run app/services/empresa.service.test.ts app/services/usuario.service.test.ts`

**Esperado: 6 falhas.** Em `empresa`: "converte violação de unicidade de email em
HttpError 409", "não deixa linha de auditoria órfã…", "converte violação de
unicidade de slug em HttpError 409" e "não deixa aceite órfão…". Em `usuario`: os
dois casos de 409. Em todas elas, o `PrismaClientKnownRequestError` cru escapa em
vez de virar `HttpError` — que é exatamente o bug que o usuário viu em produção.

**Se os testes NÃO falharem, PARAR.** Significa que a forma falsa não reproduz o
erro real, e todo o resto do trabalho seria decorativo. Investigar a forma
construída antes de prosseguir; não seguir para a Etapa 2.

Anotar a contagem e os nomes dos casos que falharam — eles vão para o SUMMARY.

---

**Etapa 2 — Migrar os três leitores.**

Em `app/services/empresa.service.ts`, dentro do `catch` de `registerComUsuario`
(linha 230): trocar a linha que monta `target` a partir de `error.meta` por uma
chamada a `camposDaColisaoUnica(error)`, importada de `@/lib/prisma-error`.
Renomear a variável para `campos`. Os dois `if` de `email` e `slug` e as duas
mensagens ficam **idênticos**.

Em `app/services/usuario.service.ts` (linha 86): mesma troca. Os dois `if` de
`empresaId` e `email` e as duas mensagens ficam idênticos.

Em `scripts/seed-superadmin.ts` (linha 277): mesma troca, mantendo o nome `alvo`
que a mensagem interpola. Hoje esse script imprime `colisão de unicidade em []`
em toda colisão real — o mesmo defeito, degradando a mensagem do operador. O
comentário sobre colisão de slug logo abaixo permanece.

Em nenhum dos três a guarda `instanceof ... && code === "P2002"` muda (D-B).

Rodar de novo o comando da Etapa 1: **as 6 falhas viram verde**.

---

**Etapa 3 — Travar a superfície com dois gates de grep.**

Rodar os dois e anexar a saída literal ao SUMMARY.

Gate 1 — o conhecimento do formato interno está confinado (D-E). Deve imprimir
**exatamente uma linha**, `lib/prisma-error.ts`:

`grep -rl --include='*.ts' 'driverAdapterError' app lib scripts | grep -v '\.test\.ts'`

Gate 2 — nenhum código de produção lê `meta.target` direto. Deve imprimir `0`:

`grep -rn --include='*.ts' -e 'meta?\.target' -e 'meta\.target' app lib scripts | grep -v '\.test\.ts:' | grep -v '^lib/prisma-error\.ts:' | grep -vE ':[0-9]+: *(//|\*)' | wc -l`

O terceiro filtro descarta linhas de comentário (`//` ou continuação de JSDoc
`*`): a prosa normativa da Task 1 e dos call sites **precisa** poder nomear o
formato antigo para explicar por que o fallback existe, e um gate que contasse
comentários se auto-invalidaria. O gate mede código, não documentação.

Se o Gate 1 imprimir mais de uma linha, a correção é mover a leitura para o
helper — nunca relaxar o gate.

**Não tocar**, por D-G e pelo achado 7: `app/services/termo.service.test.ts`,
`app/api/termos/route.test.ts`, `app/[slug]/admin/(protected)/produtos/actions.ts`,
`app/[slug]/admin/(protected)/_lib/simples-actions.ts`,
`app/services/termo.service.ts`, `app/services/webhook-asaas.service.ts`.
  </action>
  <verify>
    <automated>npm test && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>A suíte completa passa; `tsc` com 0 erros; `lint` sem erros novos; Gate 1 imprime só `lib/prisma-error.ts`; Gate 2 imprime `0`; o SUMMARY registra os 6 casos que falharam na Etapa 1 com seus nomes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Descrição |
|----------|-----------|
| Postgres → aplicação | O `detail` do erro do Postgres é dado de banco que atravessa o adaptador e chega à camada que escolhe a mensagem do usuário |
| aplicação → cliente anônimo em `/registro` | A mensagem de erro do cadastro é a única coisa que sai daqui; qualquer detalhe a mais é divulgação |

## STRIDE Threat Register

| Threat ID | Categoria | Componente | Disposição | Plano de mitigação |
|-----------|-----------|------------|------------|--------------------|
| T-Q09-01 | Information Disclosure | `camposDaColisaoUnica` e os 3 call sites | mitigate | O `detail` do Postgres carrega o VALOR colidido (`Key (email)=(vitima@exemplo.com) already exists`), não só o nome do campo. O helper devolve **apenas** `constraint.fields` — nunca `detail`, nunca `cause`, nunca `message`. As mensagens dos call sites continuam sendo strings fixas, sem interpolação do valor. Proibido "melhorar" a copy ecoando o e-mail |
| T-Q09-02 | Information Disclosure | Copy `Este email já está em uso.` em `/registro` | accept | Restaurar essa copy reexpõe um oráculo de enumeração de contas que o bug vinha escondendo por acidente. É aceito por ser o comportamento **projetado** (código, copy e testes sempre o pretenderam) e explicitamente pedido pelo usuário. Se o desenvolvedor quiser fechar o oráculo, o caminho correto é rate limiting + copy neutra em `/registro` — decisão de produto SEPARADA, e nunca uma razão para deixar a extração quebrada |
| T-Q09-03 | Denial of Service | `camposDaColisaoUnica` recebendo `meta` malformado | mitigate | D-D: retorno `[]` para toda forma desconhecida, nunca `throw`. Um helper que lançasse dentro do `catch` transformaria um 409 tratado em 500 não tratado no cadastro. Os 4 casos malformados do `<behavior>` da Task 1 cobrem isso |
| T-Q09-04 | Tampering | Regressão silenciosa se o formato do Prisma mudar de novo | mitigate | D-E + Gate 1: um só arquivo de produção conhece o caminho interno, provado por grep. Os testes de service passam a simular a forma real (Task 2, Etapa 1), então uma mudança futura de formato quebra a suíte em vez de degradar em silêncio — que é precisamente a falha que esta task corrige |
| T-Q09-05 | Information Disclosure | `npm run seed:superadmin` imprimindo nomes de campos | accept | Saída de CLI para o operador que já detém a credencial de banco; nomes de coluna não são segredo para ele. Continua sem interpolar valores |
| T-Q09-SC | Tampering | Instalação de pacotes | mitigate | Zero pacotes novos. `npm run gates:fase-06` fixa a contagem de dependências e falha se mudar |
</threat_model>

<verification>
Rodar na ordem, a partir da raiz do repositório, e transcrever os resultados
reais no SUMMARY — nada presumido:

1. `npx vitest run lib/prisma-error.test.ts` — verde
2. `npx tsc --noEmit` — 0 erros
3. `npm run lint` — 0 erros (warnings pré-existentes fora do escopo podem permanecer)
4. `npm test` — suíte inteira verde. A contagem sobe em relação aos 1159 de hoje, pelos casos novos de `lib/prisma-error.test.ts`; a diferença deve ser explicada no SUMMARY
5. `npm run gates:fase-04` — verde
6. `npm run gates:fase-05` — verde
7. `npm run gates:fase-06` — verde (inclui a trava de dependências)
8. `npm run gates:fase-07` — verde
9. Gate 1 (confinamento do formato interno) — imprime exatamente `lib/prisma-error.ts`:
   `grep -rl --include='*.ts' 'driverAdapterError' app lib scripts | grep -v '\.test\.ts'`
10. Gate 2 (nenhum leitor direto de `meta.target` em produção) — imprime `0`:
   `grep -rn --include='*.ts' -e 'meta?\.target' -e 'meta\.target' app lib scripts | grep -v '\.test\.ts:' | grep -v '^lib/prisma-error\.ts:' | grep -vE ':[0-9]+: *(//|\*)' | wc -l`

Não é necessário e2e: o defeito e a correção são inteiramente server-side dentro
do `catch` de dois services, e o teste unitário de `empresa.service` já prova o
cenário que originou a task (cadastro com e-mail duplicado → `Este email já está
em uso.`) contra a forma real do erro.
</verification>

<success_criteria>
- Cadastro em `/registro` com e-mail duplicado devolve `Este email já está em uso.` (409), provado por teste que simula o erro REAL do `@prisma/adapter-pg`
- A não-vacuidade está registrada no SUMMARY: os 6 casos que falharam na Etapa 1 estão nomeados, e a falha foi observada antes de qualquer mudança em código de produção
- `lib/prisma-error.ts` cobre o formato do driver adapter e o formato `target`, com precedência de `target` (D-C), retorno `[]` para o desconhecido e nenhum caminho que lance (D-D)
- O JSDoc do helper registra os achados 1-3 e 5 com arquivo e linha, incluindo o aviso sobre `@map`
- Os 3 leitores (`empresa.service.ts`, `usuario.service.ts`, `seed-superadmin.ts`) usam o helper; as guardas de `instanceof`/`code` e todas as mensagens ficam idênticas
- Nenhum dos 6 arquivos listados como intocáveis em D-G / achado 7 foi modificado
- Gates 1 e 2 verdes; zero dependências novas; os quatro gates de fase seguem verdes
- Os 10 itens de `<verification>` executados de verdade, com saídas transcritas
</success_criteria>

<output>
Criar `.planning/quick/260907-dow-corrigir-extracao-do-campo-colidido-em-e/260907-dow-SUMMARY.md` ao concluir.
</output>
