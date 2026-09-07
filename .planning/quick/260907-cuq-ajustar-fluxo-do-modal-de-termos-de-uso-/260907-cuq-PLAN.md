---
phase: quick-260907-cuq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/registro/actions.ts
  - app/registro/actions.test.ts
  - app/registro/_components/register-form.tsx
  - app/registro/_components/register-form.test.tsx
  - e2e/cadastro-e-login.spec.ts
  - e2e/aceite-de-termos.spec.ts
  - e2e/bloqueio-por-inadimplencia.spec.ts
  - e2e/cancelamento-de-assinatura.spec.ts
  - e2e/combo-crud.spec.ts
  - e2e/modo-simples.spec.ts
  - e2e/movimentacao-estoque.spec.ts
  - e2e/produto-crud-e-catalogo.spec.ts
  - e2e/promocao-crud.spec.ts
  - e2e/sessao-revogada.spec.ts
  - e2e/worker-reconciliacao.spec.ts
  - .planning/quick/260907-cuq-ajustar-fluxo-do-modal-de-termos-de-uso-/260907-cuq-SUMMARY.md
autonomous: true
requirements: [TERM-01]
user_setup: []

must_haves:
  truths:
    - "O formulário de /registro NÃO tem mais o botão 'Ler os Termos de Uso (versão N)' nem o checkbox 'Li e aceito os Termos de Uso' (nem seu label)"
    - "O botão de submit continua se chamando exatamente 'Criar minha loja'; o PRIMEIRO submit válido desta carga de página abre o modal de Termos de Uso em vez de disparar a Server Action"
    - "Dentro do modal, 'Li e aceito, criar minha loja' fecha o dialog e dispara a submissão real por requestSubmit() — o mesmo caminho de Server Action do form, sem lógica de submissão duplicada"
    - "Depois de aceitar uma vez nesta carga de página, um novo clique em 'Criar minha loja' vai direto ao submit real e NÃO reabre o modal"
    - "A Server Action recusa o cadastro com a copy E3 quando o campo de prova de aceite não chega com o valor exato gravado pelo clique no modal — mesma mensagem e mesma posição na cadeia de validações de hoje"
    - "O input escondido termoId continua enviando o id do termo vigente e continua sendo comparado por igualdade no servidor"
    - "O modal preserva o template slate, aria-labelledby, o botão 'Fechar' e o fechamento por Escape e por clique no backdrop"
    - "Nenhum arquivo em app/, lib/ ou e2e/ menciona o identificador do antigo checkbox nem o rótulo do antigo botão-gatilho"
    - "npm test, npx tsc --noEmit, npm run lint, npm run gates:fase-06 e npm run test:e2e seguem verdes, com os 11 specs e2e que cadastram empresa pela UI migrados para o fluxo de dois cliques"
  artifacts:
    - path: "app/registro/actions.ts"
      provides: "Metade SERVER de D-11 revalidada sobre o campo novo de prova de aceite"
      contains: "termosAceitos"
    - path: "app/registro/_components/register-form.tsx"
      provides: "Formulário com interceptação do primeiro submit, modal de aceite e hidden input de prova"
      contains: "requestSubmit"
    - path: "app/registro/_components/register-form.test.tsx"
      provides: "Cobertura unitária do fluxo de dois cliques, do não-reabrir e do payload enviado"
      contains: "Li e aceito, criar minha loja"
    - path: "e2e/cadastro-e-login.spec.ts"
      provides: "Prova em Chromium real do fluxo de dois cliques, do Escape e do não-reabrir"
      contains: "Li e aceito, criar minha loja"
  key_links:
    - from: "app/registro/_components/register-form.tsx"
      to: "app/registro/actions.ts"
      via: "input hidden termosAceitos, escrito no submit apenas quando o aceite já ocorreu"
      pattern: "name=\"termosAceitos\""
    - from: "botão 'Li e aceito, criar minha loja'"
      to: "Server Action register"
      via: "dialogo.close() seguido de formulario.requestSubmit()"
      pattern: "requestSubmit"
---

<objective>
Trocar o gate de aceite dos Termos de Uso em `/registro`: sai o par
"botão-gatilho separado + checkbox required", entra a interceptação do próprio
submit — o primeiro clique em **Criar minha loja** abre o modal, e o botão
**Li e aceito, criar minha loja** dentro do modal fecha o dialog e dispara a
submissão real.

Purpose: hoje o usuário pode marcar o aceite sem nunca abrir o modal, e o botão
de leitura é um passo lateral que a maioria ignora. Amarrando a leitura ao
caminho obrigatório do cadastro, o aceite deixa de ser um checkbox decorativo e
passa a ser um pedágio real — sem custar um clique a mais para quem já aceitou.

Output: `register-form.tsx` com submit interceptado e modal de aceite,
`actions.ts` validando o campo novo de prova, testes unitários reescritos e os
**11 specs e2e** que cadastram empresa pela UI migrados para o fluxo de dois
cliques.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@app/registro/actions.ts
@app/registro/actions.test.ts
@app/registro/_components/register-form.tsx
@app/registro/_components/register-form.test.tsx
@e2e/cadastro-e-login.spec.ts
@.planning/quick/260907-bxr-trocar-accordion-dos-termos-de-uso-no-re/260907-bxr-SUMMARY.md
</context>

<investigacao_ja_feita>
O planejador leu o código real. Estes achados são **fatos verificados**, não
suposições — o executor não precisa redescobri-los, e contradizê-los exige
evidência nova.

**1. O que `actions.ts` valida hoje (linhas 27 e 62).** O campo lido é
`formData.get("aceiteTermos")` (sem `String(...)`, deliberadamente: um checkbox
desmarcado não é enviado, e a diferença entre `null` e `"on"` é o que a
validação lê). A recusa é `!== "on"` e a copy é exatamente
`"É preciso aceitar os Termos de Uso para criar a conta."` (chamada de COPY_E3
nos testes). A validação de `termoId` vem LOGO DEPOIS e usa a MESMA copy, de
propósito. A posição da dupla na cadeia é: depois de `modoInterface`, antes da
chamada ao service.

**2. React 19 — `onSubmit` com `preventDefault()` CANCELA a Server Action.**
Verificado no bundle: `react-dom-client.development.js:19062` testa
`nativeEvent.defaultPrevented` e, sendo verdadeiro, NÃO invoca a action. E a
ordem de despacho está garantida: o plugin de form action é empilhado por último
(`:19759`), depois do plugin que despacha `onSubmit`. Ou seja, um handler
`onSubmit` no `<form>` roda ANTES e pode abortar a action. `preventDefault()` do
evento sintético repassa para o nativo (`:3384-3392`).

**3. Consequência prática:** escrever no DOM de dentro do `onSubmit` é seguro —
o `FormData` só é construído dentro do listener da action (`:19069`), que roda
depois. É isso que torna possível gravar a prova de aceite no hidden input no
próprio submit, sem depender de `flushSync` nem de re-render.

**4. jsdom 29.1.1 implementa `requestSubmit()` de forma útil.**
`HTMLFormElement-impl.js:107-131`: valida o submitter, chama `reportValidity()`,
dispara o evento `submit` (bubbles, cancelable) e só chama `notImplementedMethod`
se ninguém cancelar. Como o React cancela (`:19086`), o caminho não-implementado
**nunca é alcançado**. `requestSubmit()` funciona nos testes unitários.

**5. Armadilha de jsdom que muda o desenho dos testes:** tanto o clique num
`type="submit"` quanto `requestSubmit()` passam por `reportValidity()` ANTES de
disparar o evento `submit`. Um formulário com campo `required` vazio **não
dispara submit nenhum** — e portanto o modal não abre. Todo teste que espera o
modal abrir precisa preencher os cinco campos obrigatórios antes.

**6. Armadilha de locator — colisão de nome acessível.** O rótulo novo
`Li e aceito, criar minha loja` **contém** `criar minha loja` como substring.
- No Playwright, `getByRole("button", { name })` com string casa por SUBSTRING e
  ignora maiúsculas: com o modal ABERTO, `{ name: "Criar minha loja" }` casaria
  com os DOIS botões e estouraria strict mode.
- No testing-library, `{ name: /criar minha loja/i }` (regex) casa parcialmente e
  produz o mesmo problema; `{ name: "Criar minha loja" }` (string) casa o nome
  inteiro e é seguro.
- Com o modal FECHADO não há colisão: o `<dialog>` sem `open` fica sob
  `display: none` e sai da árvore de acessibilidade nos dois runners.

**7. Superfície a migrar — 14 chamadas em 11 arquivos e2e:**
`cadastro-e-login` (3 `.check()` + 1 locator na linha 63), `modo-simples` (2),
e 1 cada em `aceite-de-termos`, `bloqueio-por-inadimplencia`,
`cancelamento-de-assinatura`, `combo-crud`, `movimentacao-estoque`,
`produto-crud-e-catalogo`, `promocao-crud`, `sessao-revogada`,
`worker-reconciliacao`.

**8. Gates que este trabalho não pode derrubar** (`scripts/gates-fase-06.mjs`):
Gate 4 varre `app/registro/_components/register-form.tsx` proibindo a paleta
âmbar (use slate); Gate 5 fixa **11 dependências / 20 devDependencies** — zero
pacotes novos. `app/registro/page.tsx` está fora do Gate 4 e não deve ser tocado.
</investigacao_ja_feita>

<decisoes_travadas>
Estas decisões saíram das perguntas de esclarecimento com o usuário e do achado
(2) acima. **Não reabrir.**

**D-A — A interceptação mora no `onSubmit` do `<form>`, não no `onClick` do
botão.** As duas funcionam, mas o `onClick` com `preventDefault` preempta a
validação nativa do browser: o usuário clicaria com o formulário vazio, o modal
abriria, ele aceitaria, e só então descobriria que faltava preencher o e-mail. Com
`onSubmit`, o browser valida primeiro e o modal só aparece quando o resto do
formulário já está válido — que é exatamente o comportamento de hoje. Bônus: o
`onSubmit` também cobre o submit implícito por Enter num campo de texto, que o
`onClick` deixaria passar direto.

**D-B — A prova de aceite é um hidden input `termosAceitos` cujo valor só é
escrito no submit, e a memória do aceite é um `useRef` booleano.** O ref é a
única fonte de verdade do "já aceitou"; o hidden input é a projeção dele no
payload. Não usar `useState` para o valor do hidden: `setState` é assíncrono e
`requestSubmit()` chamado logo em seguida enviaria o valor velho.

**D-C — O ref sobrevive ao reset de formulário do React 19.** Depois que uma
action termina, o React 19 reseta os campos não controlados do form — inclusive o
hidden input. Por isso o valor é reescrito a cada submit autorizado, dentro do
próprio `onSubmit`. Sem isso, um segundo submit depois de um erro
("E-mail já cadastrado") enviaria a prova vazia e seria recusado pelo servidor
por um motivo que o usuário não teria como entender.

**D-D — O botão 'Fechar' PERMANECE no modal, ao lado do de aceite.** Remover o
"não" deixaria Escape e backdrop como únicas saídas: descobríveis por quem já
sabe, invisíveis para todo mundo. 'Fechar' vira secundário (slate claro),
'Li e aceito, criar minha loja' vira primário (slate-800). Ambos seguem
`type="button"` — eles vivem DENTRO do `<form>`, e um `<button>` sem `type` ali é
`submit` por padrão (T-Q07-02, ameaça já fechada uma vez nesta tela).

**D-E — A garantia de segurança do campo novo é PARIDADE com o checkbox, não
mais que isso.** Um atacante determinado sempre pode forjar um POST direto; era
verdade com o checkbox e continua verdade. O que se preserva é que, no DOM real,
o único caminho para `termosAceitos` valer `"true"` é o clique explícito no botão
do modal — a mesma força que `required` + `"on"` davam.
</decisoes_travadas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Trocar a prova de aceite na Server Action</name>
  <files>app/registro/actions.ts, app/registro/actions.test.ts</files>
  <behavior>
    - Payload com o campo de prova valendo exatamente "true" e `termoId` presente: passa e chama `empresaService.registerComUsuario` com `termoAceitoId`
    - Campo de prova AUSENTE do payload: recusa com a copy E3, sem chamar o service nem criar sessão
    - Campo de prova presente porém VAZIO (o hidden input existe mas nunca foi escrito — estado real de quem não clicou no modal): recusa com a copy E3
    - Campo de prova com qualquer outro valor, inclusive o antigo "on": recusa com a copy E3
    - `termoId` ausente ou só com espaços: continua recusando com a MESMA copy E3
    - As seis validações anteriores (nome, responsável, e-mail, senha, confirmação, modo) mantêm texto e ordem
  </behavior>
  <action>
Em `app/registro/actions.ts`, substituir a leitura e a validação do antigo campo
de checkbox pela do campo novo `termosAceitos`, mantendo TUDO o mais idêntico.

Diferença de forma em relação ao campo antigo: o hidden input é sempre enviado
pelo browser (diferente de um checkbox desmarcado, que simplesmente não vai), e o
valor esperado passa a ser a string `"true"`. Ler com `String(formData.get(...) ?? "")`
e recusar quando o resultado for diferente de `"true"` cobre de uma vez os três
estados de fracasso — ausente, vazio e forjado — sem ramificação extra.

Preservar sem alteração: a copy exata `"É preciso aceitar os Termos de Uso para
criar a conta."`, a posição da validação na cadeia (depois de `modoInterface`,
antes da de `termoId`), a validação de `termoId` com a mesma copy, e o
`termoAceitoId` passado ao service.

Reescrever o comentário normativo de D-11 que hoje descreve a metade CLIENT como
"o `required` do checkbox": a metade client passou a ser o gate do modal — o
campo só recebe valor no submit que ocorre DEPOIS do clique em
"Li e aceito, criar minha loja". A metade server continua existindo pelo motivo
de sempre: submit por cliente próprio ou com JS desabilitado não passa pela
primeira. Escrever essa prosa SEM citar o identificador antigo (o gate de grep da
Task 4 proíbe a string em `app/`, `lib/` e `e2e/`, comentários incluídos).

Em `app/registro/actions.test.ts`: trocar a chave do campo em `formValido` (base e
overrides), atualizar os nomes dos casos, e cobrir os três fracassos do
`<behavior>` — ausente (`null`), vazio (`""`) e valor forjado (usar o valor
antigo `"on"` como forjado, o que documenta a migração dentro do próprio teste).
Atualizar também o JSDoc do bloco de D-11, pelo mesmo motivo e com a mesma
restrição de vocabulário.
  </action>
  <verify>
    <automated>npx vitest run app/registro/actions.test.ts</automated>
  </verify>
  <done>A suíte de `actions.test.ts` passa com os casos ausente/vazio/forjado cobertos; `grep -c termosAceitos app/registro/actions.ts` maior que 0; nenhuma menção ao identificador antigo em `app/registro/actions.ts` nem em `app/registro/actions.test.ts`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Interceptar o submit e mover o aceite para dentro do modal</name>
  <files>app/registro/_components/register-form.tsx, app/registro/_components/register-form.test.tsx</files>
  <behavior>
    - O formulário não renderiza mais nenhum botão cujo nome acessível contenha "Ler os Termos de Uso", nem input com o nome do antigo checkbox, nem label "Li e aceito os Termos de Uso"
    - Com o formulário preenchido, o primeiro clique em "Criar minha loja" abre o `<dialog>` e NÃO chama a action
    - O `<h2>` do modal exibe "Termos de Uso (versão N)" com a versão recebida por prop
    - Clicar em "Li e aceito, criar minha loja" fecha o `<dialog>` e chama a action UMA vez
    - O `FormData` recebido pela action traz `termosAceitos` valendo "true" e `termoId` valendo o id do termo recebido por prop
    - Antes de qualquer aceite, o hidden input de prova existe no DOM com valor vazio
    - Um segundo clique em "Criar minha loja" depois do aceite chama a action de novo SEM reabrir o `<dialog>`
    - Clicar em "Fechar" fecha o `<dialog>` sem chamar a action, e um novo clique em "Criar minha loja" reabre o modal (fechar não é aceitar)
    - O texto do termo continua sendo nó de texto React: conteúdo com marcação de imagem não produz elemento no DOM (D-05)
    - O rótulo do botão de submit segue exatamente "Criar minha loja"
  </behavior>
  <action>
Em `app/registro/_components/register-form.tsx`:

**Remover:** o `<button type="button">` gatilho "Ler os Termos de Uso (versão N)"
e o `<label>` inteiro do checkbox de aceite, com o input dentro dele.

**Acrescentar três refs** além do `dialogoRef` já existente: um para o `<form>`,
um para o hidden input de prova, e um `useRef(false)` que memoriza se o usuário já
aceitou nesta carga de página. Importar o tipo do evento explicitamente
(`import { useRef, useState, type FormEvent } from "react"`) — o namespace `React`
não está em escopo neste arquivo e usá-lo quebraria o `tsc`.

**Handler `onSubmit` no `<form>`** (D-A): se o ref de "já aceitou" for falso,
chamar `preventDefault()` no evento e abrir o modal com `showModal()`, encerrando
ali. Se for verdadeiro, escrever `"true"` no `value` do hidden input pelo ref e
retornar sem cancelar — o React segue e dispara a Server Action. A escrita mora
aqui, e não no clique do modal, por D-C: o React 19 reseta o form depois de cada
action, e reescrever a cada submit autorizado é o que mantém o segundo submit
válido. O achado (3) garante que essa escrita acontece antes de o `FormData` ser
montado.

**Handler do botão de aceite:** marcar o ref de "já aceitou" como verdadeiro,
fechar o `<dialog>` com `close()` e chamar `requestSubmit()` no ref do form. Nesta
ordem. Não duplicar lógica de submissão: `requestSubmit()` reentra no mesmo
`onSubmit` acima, que desta vez deixa passar.

**Hidden input de prova:** `type="hidden"`, `name="termosAceitos"`,
`defaultValue=""` e o ref. Não controlado de propósito (D-B) — controlar o valor
por estado tornaria o `requestSubmit()` imediato uma corrida.

**Rodapé do modal:** trocar o `Fechar` full-width por uma linha flex com dois
botões, ambos `type="button"` (D-D): `Fechar` secundário
(`border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`) e
`Li e aceito, criar minha loja` primário, reusando as classes do botão slate-800
que já existe ali. Nada de `amber-` em lugar nenhum — Gate 4 varre este arquivo.

**Preservar intocados:** `aria-labelledby="titulo-termos-de-uso"`, o `onClick` de
backdrop no próprio `<dialog>`, o wrapper `max-h-[85vh]` com a região rolável
`role="region"` + `aria-label` + `tabIndex`, o texto como nó React (nunca
`dangerouslySetInnerHTML`), o hidden `termoId`, o bloco de erro e o botão de
submit com rótulo e `disabled={pending}` idênticos.

**Comentários normativos:** reescrever os dois blocos que ficaram falsos. O que
descreve o checkbox como primeira das duas validações passa a descrever o gate do
modal. O bloco "CUSTO ACEITO: com JS desabilitado o modal não abre" muda de
argumento: o antigo era "o aceite não depende do modal", que agora é mentira. O
argumento correto é que sem JS a Server Action de `useActionState` não roda de
qualquer forma, e um POST montado à mão chega ao servidor sem a prova e é
recusado pela copy E3 — o desfecho sem JS é falha FECHADA, nunca conta sem
aceite. Manter o registro de que o `<dialog>` é nativo por causa do Gate 5.

Em `app/registro/_components/register-form.test.tsx`, reescrever o bloco de
Termos de Uso para o `<behavior>` acima:

- Extrair um helper que preenche os cinco campos obrigatórios. Ele é
  **obrigatório em todo teste que espera o modal abrir**: pelo achado (5), com um
  `required` vazio o jsdom nem dispara o evento `submit`.
- Usar `screen.getByRole("button", { name: "Criar minha loja" })` com **string
  exata**, nunca a regex de hoje — achado (6): com o modal aberto a regex casaria
  também com o botão de aceite.
- Ler o payload por `action.mock.calls[0][1]`, que é o `FormData` que a Server
  Action recebeu, e afirmar `get("termosAceitos")` e `get("termoId")`.
- Trocar os testes que hoje afirmam a EXISTÊNCIA do gatilho e do checkbox por
  testes que afirmam a AUSÊNCIA de ambos (`queryByRole` / `queryByLabelText`
  nulos e `document.querySelector` do input antigo nulo). Apagar
  "permite marcar o aceite SEM abrir o modal" — a superfície que ele congelava
  deixou de existir.
- Os testes que hoje abrem o modal clicando no gatilho passam a abri-lo pelo
  fluxo novo (preencher + clicar em "Criar minha loja"), inclusive o de D-05.
- Manter os testes que seguem válidos: modal fechado por padrão, ausência de
  `<details>`, hidden `termoId`, rótulo do submit intacto.
- Nenhum comentário pode citar o identificador do antigo checkbox nem o rótulo
  antigo do gatilho (gate da Task 4).
  </action>
  <verify>
    <automated>npx vitest run app/registro && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>Todos os testes de `app/registro` passam; `tsc` com 0 erros; `lint` sem erros novos (os 2 warnings pré-existentes podem permanecer); `npm run gates:fase-06` continua 5/5.</done>
</task>

<task type="auto">
  <name>Task 3: Migrar e2e/cadastro-e-login.spec.ts para o fluxo de dois cliques</name>
  <files>e2e/cadastro-e-login.spec.ts</files>
  <action>
Este é o único spec que testa o fluxo dos termos em si; os outros dez apenas o
atravessam para criar uma empresa. Por isso ele é o único que ganha asserções
novas.

**Nos três testes de cadastro** (criação bem-sucedida, senhas diferentes,
logout): apagar a linha do `.check()` no antigo checkbox e inserir, IMEDIATAMENTE
depois do clique em "Criar minha loja", um clique em
`getByRole("button", { name: "Li e aceito, criar minha loja" })`. O restante de
cada teste fica intacto — inclusive as asserções de trial da Fase 2 e a de
ausência de mensagem de bloqueio.

Observação sobre o teste de senhas diferentes: o modal abre normalmente, porque
`senha` e `confirmarSenha` diferentes passam pela validação nativa (ambos
preenchidos). O erro continua vindo do servidor, depois do aceite.

**Reescrever o teste do modal** (hoje "abre e fecha os Termos de Uso num modal
sem perder o aceite"), que hoje abre o modal pelo gatilho sem preencher nada.
Novo roteiro, num único teste ou em dois, à escolha do executor:

1. Preencher os cinco campos obrigatórios.
2. Afirmar que a região "Texto dos Termos de Uso" está oculta.
3. Clicar em "Criar minha loja" → região visível, e a URL continua em `/registro`
   (a action NÃO rodou).
4. `Escape` → região oculta de novo, ainda em `/registro`.
5. Clicar em "Criar minha loja" de novo → região visível outra vez (fechar não é
   aceitar; D-D).
6. Clicar em "Li e aceito, criar minha loja" → navega para `/admin`.

**Achado (6) é obrigatório aqui:** neste spec o modal fica aberto enquanto
locators são resolvidos, então toda referência ao botão de submit precisa de
`{ name: "Criar minha loja", exact: true }`. Sem `exact`, o Playwright casa por
substring e "Li e aceito, criar minha loja" entra no conjunto — strict mode
violation. Nos outros dez specs (Task 4) o modal está sempre fechado no momento
do clique, e o locator simples continua correto.

Atualizar os comentários do arquivo que descrevem a superfície antiga (o bloco
que fala das "13 chamadas em 11 specs" e o que explica o polyfill). O polyfill de
`HTMLDialogElement` continua sendo um dublê e este spec continua sendo a única
prova real de `showModal`/Escape — só o gatilho mudou.
  </action>
  <verify>
    <automated>npx playwright test e2e/cadastro-e-login.spec.ts</automated>
  </verify>
  <done>Os testes de `cadastro-e-login.spec.ts` passam contra Chromium e Postgres reais, incluindo a prova de que Escape fecha o modal sem cadastrar e de que aceitar cria a conta.</done>
</task>

<task type="auto">
  <name>Task 4: Migrar os dez specs e2e restantes e travar a superfície antiga</name>
  <files>e2e/aceite-de-termos.spec.ts, e2e/bloqueio-por-inadimplencia.spec.ts, e2e/cancelamento-de-assinatura.spec.ts, e2e/combo-crud.spec.ts, e2e/modo-simples.spec.ts, e2e/movimentacao-estoque.spec.ts, e2e/produto-crud-e-catalogo.spec.ts, e2e/promocao-crud.spec.ts, e2e/sessao-revogada.spec.ts, e2e/worker-reconciliacao.spec.ts</files>
  <action>
Edição mecânica e idêntica nos dez arquivos: apagar a linha do `.check()` no
antigo checkbox e inserir, imediatamente depois do clique em "Criar minha loja",
um clique em `getByRole("button", { name: "Li e aceito, criar minha loja" })`.
Nada mais de cada spec muda — nem os helpers `uniqueEmpresa` /
`seedFatosBilling`, nem os timeouts, nem as asserções.

Dois arquivos exigem atenção:

- `e2e/modo-simples.spec.ts` tem DUAS ocorrências e a ordem é diferente: hoje o
  `.check()` vem ANTES do clique em "Simples". Apagar a linha do checkbox onde
  ela está e inserir o clique de aceite depois do "Criar minha loja" de cada
  teste, preservando a seleção do modo entre os dois.
- `e2e/aceite-de-termos.spec.ts` tem um JSDoc de cabeçalho que descreve o
  registro "com o checkbox já marcado". A prosa ficou falsa: reescrever para o
  aceite pelo modal, sem citar o rótulo antigo.

**Gates de superfície** (rodar e anexar ao SUMMARY). Contam ocorrências em
arquivos-fonte E em comentários de propósito: uma prosa que ainda nomeie a
superfície antiga é documentação desatualizada, não exceção legítima. Por isso a
regra é vocabulário proibido em `app/`, `lib/` e `e2e/`, e a forma de falar do
antigo campo é "o antigo checkbox de aceite", sem o identificador.

1. Superfície antiga extinta — deve imprimir `0`:
   `grep -rn --include='*.ts' --include='*.tsx' -e 'aceiteTermos' -e 'Li e aceito os Termos de Uso' -e 'Ler os Termos de Uso' app lib e2e | wc -l`
2. Fluxo novo presente nos 11 specs — deve imprimir `11`:
   `grep -rl 'Li e aceito, criar minha loja' e2e | wc -l`

Se o gate 1 não der zero por causa de um comentário, a correção é reescrever o
comentário — nunca relaxar o gate.

**Nota de ambiente, do SUMMARY de 260907-bxr:** se este trabalho estiver rodando
num worktree, `npx playwright test` exige preparo — `npm ci` dentro do worktree
(symlink de `node_modules` é recusado pelo Turbopack), `npx prisma generate`,
`npx next typegen` e uma cópia do `.env`. Se a suíte e2e não puder rodar, dizer
isso explicitamente no SUMMARY. Não presumir verde.
  </action>
  <verify>
    <automated>npm run test:e2e</automated>
  </verify>
  <done>A suíte e2e completa passa (32 testes na última medição registrada), os dois gates de superfície imprimem 0 e 11 respectivamente, e nenhum spec ainda usa o antigo checkbox.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Descrição |
|----------|-----------|
| browser → Server Action `register` | O `FormData` inteiro é entrada não confiável, inclusive `termoId` e a prova de aceite |
| DOM do formulário → payload | O que o React monta em `FormData` depende do valor que o `onSubmit` escreveu; um caminho que escreva "true" sem clique é a falha desta task |

## STRIDE Threat Register

| Threat ID | Categoria | Componente | Disposição | Plano de mitigação |
|-----------|-----------|------------|------------|--------------------|
| T-Q08-01 | Spoofing | `register` recebendo prova forjada | accept | Paridade explícita com o checkbox (D-E): um POST montado à mão sempre pôde forjar `"on"` e agora pode forjar `"true"`. O que se preserva é a força do caminho DOM, não uma garantia nova |
| T-Q08-02 | Tampering | Botões dentro do `<dialog>`, que vive dentro do `<form>` | mitigate | `type="button"` explícito nos dois botões (T-Q07-02 já foi real nesta tela); teste unitário afirma que "Fechar" não chama a action |
| T-Q08-03 | Elevation of Privilege | Hidden input com valor pré-preenchido | mitigate | `defaultValue=""` e escrita do valor SOMENTE dentro do `onSubmit`, condicionada ao ref de aceite; teste unitário afirma valor vazio antes do aceite e `"true"` no payload depois |
| T-Q08-04 | Repudiation | Conta criada sem aceite com JS desabilitado | accept | Sem JS a Server Action de `useActionState` não roda; um POST à mão chega sem a prova e é recusado pela copy E3. Desfecho é falha FECHADA, nunca conta sem aceite |
| T-Q08-05 | Information Disclosure | Texto do termo renderizado no modal | mitigate | D-05 preservado: nó de texto React, `dangerouslySetInnerHTML` proibido; teste do `<img onerror>` mantido no fluxo novo |
| T-Q08-06 | Denial of Service | Segundo submit recusado por prova resetada pelo React 19 | mitigate | D-C: valor reescrito a cada submit autorizado; teste unitário do segundo clique cobre |
| T-Q08-SC | Tampering | Instalação de pacotes | mitigate | Zero pacotes novos; `npm run gates:fase-06` Gate 5 fixa 11 deps / 20 devDeps e falha se mudar |
</threat_model>

<verification>
Rodar na ordem, todos a partir da raiz do repositório:

1. `npx tsc --noEmit` — 0 erros
2. `npm run lint` — 0 erros (os 2 warnings pré-existentes fora do escopo podem permanecer)
3. `npm test` — a suíte inteira verde; a contagem muda em relação aos 1156 de hoje, e a diferença deve ser explicada no SUMMARY
4. `npm run gates:fase-06` — 5/5, com Gate 4 (sem âmbar em `register-form.tsx`) e Gate 5 (11 deps / 20 devDeps) verdes
5. `npm run test:e2e` — suíte completa contra Postgres real
6. Gate de superfície antiga: `grep -rn --include='*.ts' --include='*.tsx' -e 'aceiteTermos' -e 'Li e aceito os Termos de Uso' -e 'Ler os Termos de Uso' app lib e2e | wc -l` → `0`
7. Gate de superfície nova: `grep -rl 'Li e aceito, criar minha loja' e2e | wc -l` → `11`
</verification>

<success_criteria>
- O formulário de `/registro` não tem mais botão-gatilho de leitura nem checkbox de aceite
- O primeiro submit válido de cada carga de página abre o modal; o botão "Li e aceito, criar minha loja" fecha o dialog e dispara a submissão real por `requestSubmit()`
- Aceite subsequente não reabre o modal; fechar por "Fechar", Escape ou backdrop não conta como aceite
- A Server Action recusa com a copy E3 quando a prova não chega com o valor exato, cobrindo ausente, vazio e forjado
- `termoId` continua sendo enviado e comparado por igualdade no servidor
- Template slate, `aria-labelledby`, Escape, backdrop e a proibição de `dangerouslySetInnerHTML` preservados; nenhuma dependência nova
- Os 11 specs e2e que cadastram empresa pela UI migrados; suíte completa verde
- Os sete itens de `<verification>` executados de verdade, com resultados transcritos no SUMMARY (nada presumido)
</success_criteria>

<output>
Criar `.planning/quick/260907-cuq-ajustar-fluxo-do-modal-de-termos-de-uso-/260907-cuq-SUMMARY.md` ao concluir.
</output>
