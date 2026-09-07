---
phase: quick-260907-bxr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/setup/vitest.setup.ts
  - app/registro/_components/register-form.tsx
  - app/registro/_components/register-form.test.tsx
  - e2e/cadastro-e-login.spec.ts
  - .planning/quick/260907-bxr-trocar-accordion-dos-termos-de-uso-no-re/260907-bxr-SUMMARY.md
autonomous: true
requirements: [TERM-01]
user_setup: []

must_haves:
  truths:
    - "Na tela /registro, o texto dos Termos de Uso NÃO aparece mais expandindo inline: clicar em 'Ler os Termos de Uso (versão N)' abre um modal sobreposto"
    - "O modal exibe o texto integral do termo numa área rolável, com título e botão 'Fechar'"
    - "Fechar o modal (botão, tecla Escape ou clique no backdrop) devolve o usuário ao formulário com todos os campos preenchidos preservados — o modal nunca submete o formulário"
    - "O checkbox 'Li e aceito os Termos de Uso' continua com name=aceiteTermos, required, desmarcado por padrão e marcável SEM abrir o modal — as 13 chamadas e2e de getByLabel continuam válidas"
    - "O input escondido termoId continua enviando o id do termo vigente"
    - "O texto do termo continua sendo nó de texto React (sem dangerouslySetInnerHTML) — D-05 preservado dentro do modal"
    - "Nenhum pacote novo é instalado: o modal é o elemento <dialog> nativo, sem biblioteca e sem focus trap escrito à mão"
    - "npm test, npm run lint, tsc e npm run gates:fase-06 seguem verdes"
  artifacts:
    - path: "tests/setup/vitest.setup.ts"
      provides: "Polyfill de HTMLDialogElement (showModal/show/close) para jsdom 29, que envia a implementação vazia"
      contains: "showModal"
    - path: "app/registro/_components/register-form.tsx"
      provides: "Formulário de registro com modal nativo de leitura dos Termos de Uso no lugar do disclosure"
      contains: "showModal"
    - path: "app/registro/_components/register-form.test.tsx"
      provides: "Cobertura unitária do modal: fechado por padrão, abre pelo gatilho, fecha sem submeter, sem HTML bruto"
      contains: "dialog"
    - path: "e2e/cadastro-e-login.spec.ts"
      provides: "Prova em Chromium real de que showModal/close funcionam (o polyfill de jsdom não prova nada sobre o browser)"
      contains: "Ler os Termos de Uso"
  key_links:
    - from: "app/registro/_components/register-form.tsx"
      to: "HTMLDialogElement.showModal / close"
      via: "useRef<HTMLDialogElement> acionado pelos botões abrir/fechar"
      pattern: "useRef<HTMLDialogElement"
    - from: "app/registro/_components/register-form.tsx"
      to: "campo aceiteTermos"
      via: "checkbox required independente do estado do modal"
      pattern: "name=\"aceiteTermos\""
---

<objective>
Trocar o accordion (`<details>/<summary>`) dos Termos de Uso da tela `/registro` por um
**modal de leitura** sobreposto, sem instalar nenhuma biblioteca e sem alterar o
comportamento do checkbox de aceite.

Purpose: o texto dos termos empurrando o formulário para baixo dentro do card é ruim em
mobile — o usuário perde o contexto do cadastro. Um overlay separa "ler" de "preencher".

Output: `register-form.tsx` renderizando um `<dialog>` nativo, testes unitários atualizados,
polyfill de `<dialog>` no setup do vitest e uma prova e2e em Chromium real.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@app/registro/_components/register-form.tsx
@app/registro/_components/register-form.test.tsx
@app/registro/page.tsx
@tests/setup/vitest.setup.ts
@e2e/cadastro-e-login.spec.ts

## Fatos já verificados (não redescobrir)

Estes cinco pontos foram **medidos** durante o planejamento. Confie neles; se algum se
mostrar falso na execução, isso é um achado a registrar no SUMMARY, não algo a contornar
em silêncio.

1. **jsdom 29.1.1 NÃO implementa `<dialog>` modal.**
   `node_modules/jsdom/lib/jsdom/living/nodes/HTMLDialogElement-impl.js` é literalmente
   `class HTMLDialogElementImpl extends HTMLElementImpl { }`. O construtor global
   `HTMLDialogElement` existe, mas `showModal`, `show` e `close` são `undefined` — chamar
   qualquer um deles lança `TypeError`. É por isso que a Task 1 existe e precisa vir antes
   da Task 2.
2. **A folha de estilo padrão do jsdom já esconde `<dialog>` fechado.** Medido:
   `<dialog>` sem o atributo `open` tem `display: none` computado; com `open`, `display:
   block`. Consequência: um polyfill que apenas adiciona/remove o atributo `open` é
   suficiente para que `toBeVisible()` e as queries `getByRole` do testing-library (que
   excluem elementos inacessíveis) se comportem corretamente.
3. **A propriedade IDL `.open` reflete o atributo corretamente no jsdom.** Medido:
   `el.setAttribute("open", "")` faz `el.open === true`. O polyfill não precisa mexer na
   propriedade.
4. **`npm run gates:fase-06` Gate 4 proíbe a paleta âmbar (`amber-`) exatamente neste
   arquivo** (`scripts/gates-fase-06.mjs`, `ESCOPO_SEM_AMBAR.arquivos`). Âmbar é o
   vocabulário de PAGAMENTO da aplicação. O modal usa **slate**, como o resto da superfície.
5. **`npm run gates:fase-06` Gate 5 fixa a contagem de dependências em 11 deps / 20
   devDeps.** Instalar qualquer pacote (headlessui, radix, react-modal, focus-trap…)
   derruba o gate. O `<dialog>` nativo é obrigatório, não preferência estética.

## Superfície que NÃO pode mudar

`getByLabel(/Li e aceito os Termos de Uso/).check()` aparece em **11 arquivos e2e**
(`cadastro-e-login`, `movimentacao-estoque`, `combo-crud`, `aceite-de-termos`,
`cancelamento-de-assinatura`, `produto-crud-e-catalogo`, `sessao-revogada`,
`promocao-crud`, `worker-reconciliacao`, `modo-simples`, `bloqueio-por-inadimplencia`) —
13 chamadas no total. Nenhum desses testes abre o disclosure. O checkbox precisa continuar
marcável **sem** o modal ser aberto.

`register-form.test.tsx:144` afirma o nome acessível exato do botão de submit
(`"Criar minha loja"`). Botões novos com outros nomes não colidem.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Polyfill de HTMLDialogElement para jsdom no setup do vitest</name>
  <files>tests/setup/vitest.setup.ts</files>
  <action>
    Adicionar ao setup global do vitest um polyfill de `HTMLDialogElement.prototype`
    aplicado condicionalmente — só quando `showModal` não existir no prototype, para que a
    linha morra sozinha no dia em que o jsdom implementar o elemento de verdade.

    Implementar três métodos:
    - `show` e `showModal`: adicionam o atributo `open` (string vazia) ao elemento. Não
      tentar emular top layer, inert nem `::backdrop` — o jsdom não tem camadas e fingir
      que tem produziria testes que passam por motivo errado.
    - `close`: recebe um `returnValue` opcional, remove o atributo `open`, grava
      `this.returnValue` quando o argumento foi passado, e dispara um `Event("close")`
      (sem bubbling, como na especificação).

    Documentar em comentário, no estilo normativo do projeto, POR QUE o polyfill existe:
    `node_modules/jsdom/lib/jsdom/living/nodes/HTMLDialogElement-impl.js` é uma classe
    vazia em jsdom 29.1.1 — o construtor global existe, os métodos não. Registrar também
    que o polyfill é um DUBLÊ, não uma implementação: Escape, foco preso, retorno de foco e
    o backdrop nativo **não** são exercidos por teste unitário nenhum, e é por isso que a
    Task 3 existe.

    Posicionar o bloco depois do import de `@testing-library/jest-dom/vitest` e antes do
    `beforeAll`, mantendo o `import "./prisma-mock"` na última linha como está hoje.
  </action>
  <verify>
    <automated>cd /home/david/projetos_pessoais/gestor_estoque/gestor_estoque && npx vitest run app/_components/modo-interface-picker.test.tsx && npx tsc --noEmit</automated>
  </verify>
  <done>
    O setup compila, `tsc --noEmit` sai 0 e uma suíte de componente qualquer segue passando
    (prova de que o polyfill não quebrou o ambiente global). Nenhum arquivo de produção
    tocado nesta task.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Converter o disclosure em modal nativo e atualizar os testes unitários</name>
  <files>app/registro/_components/register-form.tsx, app/registro/_components/register-form.test.tsx</files>
  <behavior>
    Testes que devem existir em `register-form.test.tsx` ao final (o bloco
    `describe("bloco de Termos de Uso (D-11, metade client)")` é reescrito, não apagado):

    - O gatilho tem nome acessível `Ler os Termos de Uso (versão 3)` e é um `BUTTON`
      (substitui a asserção atual de `SUMMARY` em register-form.test.tsx:76-83).
    - Existe exatamente um `<dialog>` na árvore e ele começa com `open === false`
      (substitui a asserção de `<details>` fechado em register-form.test.tsx:85-94).
    - Não existe mais nenhum `<details>` na árvore — `container.querySelector("details")` é
      `null`.
    - Com o modal fechado, a região `Texto dos Termos de Uso` NÃO é encontrada por
      `getByRole` (está sob `display: none`); depois de clicar no gatilho ela é encontrada,
      contém as duas cláusulas do fixture e tem `tabindex="0"` (adapta
      register-form.test.tsx:96-104).
    - Clicar em `Fechar` devolve o `<dialog>` para `open === false` e **não** chama a
      `action` do formulário — a prova de que o botão do modal não submete o registro.
    - O conteúdo do termo continua sem HTML bruto: com `conteudo` contendo
      `<img src=x onerror="alert(1)">`, `container.querySelector("img")` é `null` e o texto
      cru aparece na região depois de abrir o modal (adapta register-form.test.tsx:128-142).
    - O checkbox de aceite é marcável SEM abrir o modal, continua `required`, `name` segue
      `aceiteTermos` e o input escondido `termoId` segue com o id do fixture (asserções
      atuais preservadas, register-form.test.tsx:106-126).
    - O nome do botão de submit segue exatamente `Criar minha loja`
      (register-form.test.tsx:144-148, preservado sem alteração).
  </behavior>
  <action>
    Em `register-form.tsx`, remover o bloco `<details>/<summary>` (linhas ~127-148) e pôr no
    lugar um gatilho + um `<dialog>` nativo. O bloco do checkbox, o `<label>` com o input
    dentro e o `<input type="hidden" name="termoId">` ficam INTOCADOS.

    Estrutura:
    - `const dialogoRef = useRef<HTMLDialogElement>(null)` — importar `useRef` do react
      (o arquivo já importa `useState`).
    - **Nenhum estado React para aberto/fechado.** O próprio elemento `<dialog>` é a única
      fonte de verdade. Isso não é economia de linhas: Escape fecha o dialog nativamente
      sem passar por React, e um `useState` paralelo dessincronizaria no primeiro Escape.
    - Gatilho: `<button type="button">` com o texto `Ler os Termos de Uso (versão
      {termo.versao})` — mesmo texto do `<summary>` de hoje, de propósito. `onClick` chama
      `dialogoRef.current?.showModal()`.
    - `<dialog ref={dialogoRef} aria-labelledby="titulo-termos-de-uso">` contendo, nesta
      ordem: um `<h2 id="titulo-termos-de-uso">` com `Termos de Uso (versão {termo.versao})`;
      a região rolável; e um `<button type="button">Fechar</button>` que chama
      `dialogoRef.current?.close()`.
    - A região rolável é copiada do código atual **sem alteração semântica**: `role="region"`,
      `aria-label="Texto dos Termos de Uso"`, `tabIndex={0}`, `whitespace-pre-wrap`,
      `overflow-y-auto`, e `{termo.conteudo}` como nó de texto React. Preservar o comentário
      normativo de D-05 que proíbe HTML bruto — ele continua valendo, só mudou de vizinhança.
    - Fechar por clique no backdrop: `onClick` no próprio `<dialog>` que chama `close()`
      apenas quando `event.target === dialogoRef.current` (o backdrop é o próprio elemento;
      cliques no conteúdo têm `target` interno).

    `type="button"` nos DOIS botões é requisito, não estilo: o `<dialog>` fica dentro do
    `<form>`, e um `<button>` sem `type` dentro de form tem `type="submit"` por padrão —
    abrir ou fechar o modal dispararia o cadastro.

    Estilo (Tailwind 4, paleta **slate** apenas — Gate 4 proíbe `amber-` neste arquivo):
    - Gatilho: mesma linguagem do disclosure atual — `w-full rounded-xl border
      border-slate-200 bg-slate-50/60 px-3 py-3 text-left text-sm/[1.5] font-semibold
      text-slate-600`, com `hover:bg-slate-100` e `focus:outline-none focus:ring-2
      focus:ring-slate-200`.
    - `<dialog>`: `m-auto w-[calc(100vw-2rem)] max-w-lg rounded-2xl border border-slate-200
      bg-white p-0 shadow-xl backdrop:bg-slate-900/50`. O `m-auto` explícito centraliza em
      todos os browsers; `p-0` neutraliza o padding do user-agent e deixa o espaçamento por
      conta dos filhos.
    - Conteúdo interno: um wrapper `flex max-h-[85vh] flex-col gap-4 p-6`. O `max-h-[85vh]`
      no wrapper é o que garante mobile: o texto rola dentro da caixa em vez de a caixa
      crescer para fora da tela.
    - Região do texto: `min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200
      bg-slate-50/60 p-4 text-sm/[1.5] text-slate-700 whitespace-pre-wrap`. O `min-h-0` é
      o que faz o `overflow-y-auto` funcionar dentro de um flex column.
    - Botão Fechar: `w-full rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white`
      — visualmente subordinado ao submit (que tem `py-3` e `shadow-md`), não competindo com ele.

    **NÃO implementar scroll-to-bottom obrigatório.** Foi levantado como opcional pelo
    usuário, mas colide com a instrução explícita de preservar o comportamento do checkbox:
    desabilitar o aceite até o fim da rolagem quebraria as 13 chamadas e2e de
    `getByLabel(...).check()`, que nunca abrem o modal. Registrar essa decisão no SUMMARY.

    Substituir o comentário normativo que hoje justifica "disclosure nativo, não modal"
    (linhas ~111-126) por um que registre a decisão atual e sua razão: modal pedido pelo
    usuário; `<dialog>` nativo escolhido porque entrega focus trap, Escape, retorno de foco,
    top layer e backdrop **do browser**, sem pacote novo (Gate 5 fixa as dependências) e sem
    a11y escrita à mão. Registrar também o custo honesto: com JS desabilitado o modal não
    abre — regressão real em relação ao `<details>`, aceita porque o `required` do checkbox
    e a validação server-side (E3, `app/registro/actions.ts`) continuam sendo as duas
    guardas do aceite, e nenhuma delas depende do modal abrir.

    Nos testes, atualizar apenas o bloco de Termos de Uso conforme `<behavior>`. Os cinco
    primeiros testes do arquivo (campos, seletor de modo, input escondido de modo, ausência
    de erro, mensagem de erro) não são tocados — inclusive a linha 67, que marca o checkbox
    antes do submit e continua válida.
  </action>
  <verify>
    <automated>cd /home/david/projetos_pessoais/gestor_estoque/gestor_estoque && npx vitest run app/registro && npx tsc --noEmit && npm run lint && npm run gates:fase-06</automated>
  </verify>
  <done>
    A suíte de `app/registro` passa inteira, `tsc` sai 0, `lint` sai 0 e os 5 gates da fase 6
    seguem verdes (incluindo Gate 4 sem âmbar e Gate 5 com 11/20 dependências). Nenhum
    `<details>` restante no arquivo. `grep -c dangerouslySetInnerHTML` em
    `app/registro/_components/register-form.tsx` continua 0.
  </done>
</task>

<task type="auto">
  <name>Task 3: Provar showModal/close em Chromium real e rodar a suíte completa</name>
  <files>e2e/cadastro-e-login.spec.ts</files>
  <action>
    O polyfill da Task 1 é um dublê: ele prova que o componente CHAMA `showModal`, nunca que
    o browser abre um modal. Fechar essa lacuna com um teste e2e.

    Adicionar em `e2e/cadastro-e-login.spec.ts` um teste que NÃO cria conta (só visita
    `/registro`, sem depender de estado de banco além do termo vigente já semeado pela
    migration da fase 6):
    - `page.goto("/registro")`.
    - Afirmar que o texto do termo NÃO está visível de início — usar o locator da região
      (`page.getByRole("region", { name: "Texto dos Termos de Uso" })`) com
      `toBeHidden()`.
    - Clicar no botão `Ler os Termos de Uso` (usar `getByRole("button", { name: /Ler os
      Termos de Uso/ })`).
    - Afirmar `toBeVisible()` na mesma região — só passa se o browser abriu o dialog de verdade.
    - Pressionar `Escape` e afirmar `toBeHidden()` novamente — prova do fechamento nativo,
      que nenhum teste unitário cobre.
    - Depois de fechar, marcar o checkbox com o locator canônico
      `page.getByLabel(/Li e aceito os Termos de Uso/).check()` e afirmar `toBeChecked()` —
      prova de que a superfície usada pelos outros 10 arquivos e2e sobreviveu à mudança.

    Seguir o estilo dos testes vizinhos do arquivo (nomes de teste em português, locators por
    papel/rótulo, sem `waitForTimeout`).
  </action>
  <verify>
    <automated>cd /home/david/projetos_pessoais/gestor_estoque/gestor_estoque && npx playwright test e2e/cadastro-e-login.spec.ts && npm test</automated>
  </verify>
  <done>
    `e2e/cadastro-e-login.spec.ts` passa inteiro contra Chromium real (incluindo o teste novo)
    e `npm test` fecha com a suíte unitária completa verde, sem regressão em contagem.

    Se o Postgres do projeto não estiver de pé (o e2e exige banco real — ver STATE.md, o
    conflito de porta 5432 já ocorreu antes), **relatar o bloqueio no SUMMARY em vez de
    marcar a task como concluída**. Um e2e que não rodou não é um e2e que passou.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| banco → navegador do visitante | `termo.conteudo` é conteúdo controlado pelo SUPERADMIN, renderizado numa tela pública e sem sessão |
| navegador → Server Action `register` | `aceiteTermos` e `termoId` são campos de formulário controlados pelo cliente |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-Q07-01 | Tampering (XSS) | `register-form.tsx`, região do texto dentro do `<dialog>` | mitigate | Conteúdo segue nó de texto React com escape automático; `dangerouslySetInnerHTML` proibido. Teste do `<img onerror>` (Task 2) prova a ausência do elemento no DOM |
| T-Q07-02 | Elevation of Privilege | botões do modal dentro do `<form>` | mitigate | `type="button"` explícito nos dois botões; teste da Task 2 afirma que `Fechar` não chama a `action` — sem isso, abrir o modal submeteria o cadastro sem aceite |
| T-Q07-03 | Spoofing | `termoId` (input escondido) | accept | Inalterado por esta task; o servidor já compara por igualdade contra o termo vigente e recusa na divergência (E2, `app/registro/actions.ts`) |
| T-Q07-04 | Denial of Service (aceite) | modal não abre com JS desabilitado | accept | O aceite não depende do modal: o `required` do checkbox e a validação server-side (E3) continuam sendo as duas guardas. Regressão registrada em comentário e no SUMMARY |
| T-Q07-SC | Tampering | instalação de pacotes | mitigate | Zero pacotes instalados — `<dialog>` é nativo. `npm run gates:fase-06` Gate 5 (11 deps / 20 devDeps) prova de forma executável |
</threat_model>

<verification>
Ordem de verificação (a Task 1 é pré-requisito duro da Task 2 — sem o polyfill, todo teste
que clicar no gatilho lança `TypeError: showModal is not a function`):

1. `npx tsc --noEmit` — 0 erros
2. `npm run lint` — 0 erros
3. `npm test` — suíte unitária completa verde
4. `npm run gates:fase-06` — 5/5 gates
5. `npx playwright test e2e/cadastro-e-login.spec.ts` — verde contra Postgres real

Verificação visual sugerida ao operador (não bloqueante): abrir `/registro` no navegador,
estreitar a janela até largura de celular (~375px) e confirmar que o modal cabe na tela com
o texto rolando por dentro, e não a caixa crescendo para fora.
</verification>

<success_criteria>
- Clicar em "Ler os Termos de Uso (versão N)" em `/registro` abre um overlay; o texto não
  expande mais dentro do card do formulário
- O modal fecha por botão, por Escape e por clique no backdrop, sempre sem submeter o form
- O checkbox de aceite continua marcável sem abrir o modal, com `name`, `required` e rótulo
  idênticos aos de hoje
- Nenhuma dependência nova; nenhum uso de `amber-` em `register-form.tsx`
- `npm test`, `npm run lint`, `tsc`, `npm run gates:fase-06` e o spec e2e de cadastro verdes
</success_criteria>

<output>
Criar `.planning/quick/260907-bxr-trocar-accordion-dos-termos-de-uso-no-re/260907-bxr-SUMMARY.md` ao concluir.

Registrar no SUMMARY, obrigatoriamente:
- A decisão de NÃO implementar scroll-to-bottom obrigatório e o motivo concreto (colisão com
  as 13 chamadas e2e de `getByLabel(...).check()`, que nunca abrem o modal)
- A regressão aceita de JS desabilitado (o `<details>` funcionava sem JS; o `<dialog>` não)
- A existência do polyfill de jsdom como dívida de infraestrutura de teste, com o gatilho de
  remoção: apagar quando o jsdom implementar `HTMLDialogElement` de verdade
- Se o e2e não rodou por falta de Postgres, dizer isso explicitamente em vez de omitir
</output>
