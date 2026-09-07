---
phase: quick-260907-ejn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx
  - app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx
  - .planning/phases/07-gest-o-de-assinatura/07-UI-SPEC.md
  - app/[slug]/admin/(protected)/_components/simples/simples-top-bar.tsx
  - .planning/quick/260907-ejn-melhorar-visual-comercial-da-tela-de-ass/260907-ejn-SUMMARY.md
autonomous: false
requirements: [SUB-01-VISUAL]
user_setup: []

must_haves:
  truths:
    - "A tela `/{slug}/admin/assinatura` tem hierarquia visual mais forte: o valor do plano ganha peso 600, os três tiles ganham moldura e o CTA de pagamento passa a ocupar uma zona própria, separada por uma régua, com uma linha de reforço abaixo do botão"
    - "Nenhuma das proibições do `07-UI-SPEC.md` foi violada: zero peso 700 na rota, `primaryColor` continua com exatamente 3 ocorrências de código em `assinatura-card.tsx` (fundo e anel do `PagarButton`), o valor Display de 24px continua sendo APENAS a data de `Acesso até`, e nenhuma dependência nova entrou"
    - "A Zona 1 continua idêntica nos cinco estados e a Zona 2 continua sendo a única que degrada — o teste que compara as classes do tile de `Acesso até` entre `ativa` e `degradado` segue passando SEM ser editado"
    - "O valor de `Próxima cobrança` (Zona 2) permanece em peso 400 de propósito: dar a um campo que pode faltar o mesmo peso de um que nunca falta faria o estado degradado parecer quebrado em vez de parcial"
    - "A linha de reforço do CTA só renderiza quando `podePagar` é verdadeiro — ela nunca aparece para quem já tem assinatura ativa, vitalícia ou degradada"
    - "A copy travada não foi parafraseada: `COPY.erroGateway`, `COPY.erroCheckout`, o `<h1>` `Assinatura`, o subtítulo, `Sem assinatura ativa`, `Assinar agora` e `Reativar assinatura` continuam byte-idênticos"
    - "Os locators de que os testes de componente e os specs e2e dependem continuam válidos: `getByText(\"R$ 29,90 por mês\")` acha um único elemento, `getByText(rotuloStatus).closest(\"span\")` continua devolvendo o pill, e `getByText(\"Acesso até\").nextElementSibling` continua sendo o valor"
    - "O acesso à tela no modo SIMPLES foi avaliado contra as três regras que o restringem, e a decisão do operador está registrada — se ele escolheu manter como está, o motivo ficou documentado no próprio `simples-top-bar.tsx`"
    - "`npm test`, `npx tsc --noEmit`, `npm run lint` e `npm run gates:fase-07` seguem verdes, com `git diff package.json` vazio"
  artifacts:
    - path: "app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx"
      provides: "Card de assinatura com hierarquia comercial, dentro do orçamento do UI-SPEC"
      contains: "font-semibold text-slate-800"
      min_lines: 280
    - path: "app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx"
      provides: "Prova de que os três deltas visuais existem e de que nenhuma proibição foi violada nos cinco estados"
      contains: "font-bold"
    - path: ".planning/phases/07-gest-o-de-assinatura/07-UI-SPEC.md"
      provides: "Adendo que mantém o bloco 'Zone structure (binding)' verdadeiro depois deste retoque"
      contains: "260907-ejn"
  key_links:
    - from: "app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx"
      to: "app/[slug]/admin/_components/pagar-button.tsx"
      via: "PagarButton variant='bloqueado' — único consumidor de primaryColor na tela"
      pattern: "PagarButton variant=\"bloqueado\""
    - from: ".planning/phases/07-gest-o-de-assinatura/07-UI-SPEC.md"
      to: "app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx"
      via: "Adendo §260907-ejn descrevendo os deltas do esqueleto binding"
      pattern: "Addendum — quick 260907-ejn"
---

<objective>
Tornar a tela de Assinatura visualmente mais comercial — melhor hierarquia, tiles com definição, preço com destaque e CTA com presença — **sem violar uma única regra do `07-UI-SPEC.md`**, que é um contrato travado e verificado por gates estáticos, testes de componente e specs e2e.

Purpose: a tela hoje é burocrática (tudo em slate 12–14px, tiles sem moldura, CTA empilhado como se fosse mais um item). Ela é a superfície onde o produto pede dinheiro; parecer um formulário de configuração custa conversão.

Output: `assinatura-card.tsx` com três deltas de composição, provas novas no teste de componente, o `07-UI-SPEC.md` atualizado para continuar verdadeiro, e a decisão do operador sobre o reforço de affordance no modo SIMPLES registrada.

**Esta é a restrição que define o plano.** O UI-SPEC proíbe explicitamente quase todo movimento "vendedor" convencional. Onde uma mudança desejável esbarrou numa proibição, a proibição venceu — e o item recusado está listado abaixo com a regra que o recusou, para que ninguém o redescubra como "esquecimento".
</objective>

<orcamento_do_ui_spec>
Levantado lendo `07-UI-SPEC.md` (§Typography 110-134, §Color 138-182, §Component Contracts 299-396, §Non-Goals 572-593), o JSDoc normativo de `assinatura-card.tsx`, `scripts/gates-fase-07.mjs` e os testes existentes.

**PERMITIDO (usado por este plano):**

| Movimento | Por que é legal |
|-----------|-----------------|
| Peso 600 em texto de 14px | §Typography declara "quatro tamanhos, duas pesos"; 14px/600 já é o token dos rótulos de botão (linha 121). Não é um quinto token. |
| Moldura `border-slate-100` nos tiles | §Color lista `slate-100` como token de borda de card. Nenhuma regra fala sobre borda de tile. |
| Régua `border-t border-slate-100` acima do CTA | Mesmo token, e §Non-Goals não menciona separadores. |
| Uma linha de apoio de 12px/`slate-500` abaixo do botão | Tamanho Meta e cor de texto secundário, ambos da tabela. §Copywriting Contract congela as strings existentes; não proíbe um elemento novo. |

**RECUSADO (desejável, mas proibido — não reintroduzir):**

| Movimento desejado | Regra que o proíbe |
|--------------------|--------------------|
| Preço em 24px, como número-herói | §Typography "Binding rule: exactly one Display value on the screen" — 24px/600 é EXCLUSIVO da data de `Acesso até`. |
| Qualquer `font-bold` (700) para dar peso | §Typography linha 132: "No new markup in this phase may use weight 700." |
| Tiles ou pill tingidos com a cor do tenant | §Color linha 161: accent NÃO se aplica a tiles, pill, borda do card, texto ou barra do SIMPLES. Os 3 usos permitidos já estão gastos no `PagarButton` (fundo + anel) e na linha ativa do `AdminNav`. |
| Tiles em emerald/gradiente para "vender" | §Color: a rampa emerald é semântica, restrita ao pill nos estados B e vitalício. |
| Fundir a Zona 2 no grid da Zona 1 | §Component Contracts, bloco "Zone structure (binding)" — a separação de zonas É o mecanismo de degradação de D-02b. |
| Selo/faixa de preço, badge de desconto, comparativo de planos | §Non-Goals: "Plan or price selection" está fora do milestone inteiro. R$ 29,90 é exibido, nunca escolhido. |
| Histórico de cobranças, bandeira do cartão, "pagamento seguro via ..." | §Non-Goals + a restrição central do milestone: nenhum dado de pagamento toca este sistema; e o vocabulário do gateway nunca aparece (BILL-01). |
| Trocar a shell do card por algo maior/`shadow-xl` | §Component Contracts: a shell é o card do dashboard, não o takeover de `bloqueado-card.tsx`. |
| Segundo bloco âmbar chamando atenção para a carência | §Non-Goals: o layout já renderiza `AvisoCarencia` acima de `children` em toda tela do admin. |
| Biblioteca de ícones/animação/modal para dar vida | §Non-Goals + Gate 6 de `gates:fase-07` conta 11 deps / 20 devDeps e falha em qualquer install. |
</orcamento_do_ui_spec>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/07-gest-o-de-assinatura/07-UI-SPEC.md
@app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx
@app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx
@app/[slug]/admin/(protected)/assinatura/page.tsx
@app/[slug]/admin/_components/pagar-button.tsx
@app/[slug]/admin/(protected)/_components/simples/simples-top-bar.tsx
@app/[slug]/admin/(protected)/_components/simples/simples-top-bar.test.tsx
@app/[slug]/admin/(protected)/layout.tsx
@scripts/gates-fase-07.mjs
</context>

<armadilhas_de_locator>
Três invariantes frágeis que os testes e os specs e2e dependem. Quebrar qualquer uma faz suíte vermelha por um motivo que não parece visual:

1. **`getByText("R$ 29,90 por mês")` roda nos CINCO estados** (`assinatura-card.test.tsx:130`). O matcher de texto do Testing Library concatena APENAS os nós de texto filhos DIRETOS do elemento. Se `por mês` for envolvido num `<span>`, o `<p>` passa a normalizar para `"R$ 29,90"` e a asserção falha. **O valor do plano continua sendo um único `<p>` com dois nós de texto irmãos: `{precoMensal}` e o literal ` por mês`.** Emphasis vai na classe do `<p>`, nunca em filho novo.

2. **`getByText(rotuloStatus).closest("span")`** (testes de pill) e **`page.getByText("Sem assinatura", { exact: true })`** (e2e:86). Envolver o rótulo do pill num `<span>` interno faz o `closest("span")` devolver o wrapper (sem as classes de rampa) e cria um segundo match no Playwright (strict mode violation). **Não envolver o texto do pill.**

3. **`valorDoTile(rotulo)` = `getByText(rotulo).nextElementSibling`** e **`tileDe(rotulo)` = `getByText(rotulo).parentElement`**, mais o e2e `getByText("Acesso até", { exact: true }).locator("..")`. **O rótulo e o valor continuam sendo dois `<p>` irmãos diretos dentro do `div` do tile.** Nada de ícone entre eles, nada de wrapper intermediário.

Extra: `assinatura-card.test.tsx:320` afirma que a classe do tile de `Acesso até` NÃO casa `/opacity|animate-pulse/`. Nenhuma classe nova pode conter essas palavras.
</armadilhas_de_locator>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hierarquia comercial do card, dentro do orçamento do UI-SPEC</name>
  <files>app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx, app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.test.tsx, .planning/phases/07-gest-o-de-assinatura/07-UI-SPEC.md</files>

  <behavior>
Escreva estas asserções ANTES de editar o componente, em `assinatura-card.test.tsx`, e confirme que elas falham (RED) contra o código atual. Elas entram como um novo `describe("hierarquia visual (quick 260907-ejn)")`, sem tocar em nenhum bloco existente.

- Teste 1 — "o valor do plano tem peso 600 e o da próxima cobrança não": no estado `ativa`, o elemento devolvido por `screen.getByText("Acesso até").parentElement` continua existindo; o `<p>` do valor do plano (`screen.getByText("R$ 29,90 por mês")`) tem `className` contendo `font-semibold`; o `<p>` do valor da próxima cobrança (`screen.getByText("Acesso até")` NÃO — use `screen.getByText("2026-10-15")`) tem `className` que NÃO contém `font-semibold`. Comentário obrigatório no teste: dar a um campo que pode faltar o mesmo peso de um que nunca falta faria o estado degradado parecer quebrado, e não parcial (§Typography, regra do Display único).
- Teste 2 — "os três tiles compartilham a mesma moldura": no estado `ativa`, `tileDe("Acesso até").className`, `tileDe("Plano").className` e `tileDe("Próxima cobrança").className` são iguais entre si e contêm `border-slate-100`.
- Teste 3 — "nenhum peso 700 em nenhum dos cinco estados": itere `PROPS_POR_ESTADO`; para cada estado, `container.querySelectorAll('[class*="font-bold"], [class*="font-extrabold"]')` tem length 0. Comentário: §Typography linha 132 proíbe peso 700 em markup novo desta superfície.
- Teste 4 — "a linha de reforço do CTA só existe quando há o que pagar": a string `O acesso é liberado assim que o pagamento for confirmado.` está no documento nos estados `aguardando` e `cancelada`, e AUSENTE nos estados `ativa`, `degradado` e `vitalicio`.
- Teste 5 — "o CTA fica numa zona própria": nos estados `aguardando` e `cancelada`, o `<form>` que envolve o botão de pagar tem `className` contendo `border-t`. Obtenha-o por `screen.getByRole("button", { name: rotulo }).closest("form")`.
- Regressão sem edição: os blocos `estrutura comum aos cinco estados`, `estado degradado` e `erro de checkout (E3)` seguem passando exatamente como estão. Se algum deles precisar ser editado para passar, a mudança de markup está errada — reverta a mudança, não o teste.
  </behavior>

  <action>
Aplique EXATAMENTE três deltas de markup em `assinatura-card.tsx`. Nenhum outro elemento, classe, string ou prop muda. Não toque em `page.tsx`, em `pagar-button.tsx`, nem em qualquer copy travada.

**Delta 1 — moldura nos três tiles.** Troque a string `rounded-xl bg-slate-50 p-4` por `rounded-xl border border-slate-100 bg-slate-50 p-4` nas TRÊS ocorrências: o tile de `Acesso até`, o tile de `Plano` e o tile de `Próxima cobrança` da Zona 2. A string tem de ser idêntica nos três — é ela que dá aos tiles definição sobre o branco do card sem gastar cor semântica nem accent, e a paridade é o que mantém verdadeira a asserção existente que compara a classe do tile de `Acesso até` entre `ativa` e `degradado`.

**Delta 2 — peso no valor do plano.** No `<p>` do valor do tile `Plano`, troque `mt-1 text-sm/[1.5] text-slate-800` por `mt-1 text-sm/[1.5] font-semibold text-slate-800`. O conteúdo do `<p>` NÃO muda: continua `{precoMensal}` seguido do literal ` por mês` como nós de texto irmãos, sem nenhum elemento filho (ver `<armadilhas_de_locator>` item 1). **Deixe o valor de `Próxima cobrança` e a linha `Sem data de término` exatamente como estão** — o primeiro por ser o campo que pode degradar, a segunda porque §Component Contracts a fixa em tamanho Body.

**Delta 3 — zona própria para o CTA.** No `<form action={pagarAction}>`, troque `className="mt-6"` por `className="mt-6 border-t border-slate-100 pt-6"`. Logo abaixo do `<PagarButton …/>`, ainda DENTRO do mesmo `<form>`, acrescente um único `<p className="mt-3 text-xs text-slate-500">` com o texto `O acesso é liberado assim que o pagamento for confirmado.` — sem ponto de exclamação, sem "por favor", sem citar cartão, boleto, gateway ou qualquer meio de pagamento, e sem repetir o preço. Por estar dentro do bloco `podePagar`, essa linha nunca aparece para quem já paga. Ela é a única copy nova do plano; não parafraseie nem reaproveite `COPY.erroGateway`, `COPY.erroCheckout`, o subtítulo da tela ou o corpo de `Sem assinatura ativa`.

**Delta 4 — manter a documentação verdadeira (comentários e spec, não código).**

(a) No JSDoc de cabeçalho de `AssinaturaCard`, acrescente um parágrafo curto registrando este retoque: os três deltas acima e a lista de recusados com a regra que recusou cada um (copie da tabela `<orcamento_do_ui_spec>` deste plano, resumida). Comentários são descartados pelos gates (`semComentarios` em `scripts/gates-fase-07.mjs`), então citar literalmente `font-bold`, `new Date(` ou nomes proibidos aqui é seguro — e é o padrão da fase.

(b) Em `.planning/phases/07-gest-o-de-assinatura/07-UI-SPEC.md`: logo após a lista de bullets "Binding rules" que fecha o bloco `Zone structure (binding)`, insira UMA linha apontando para o adendo. No fim do arquivo, acrescente a seção `## Addendum — quick 260907-ejn (visual comercial)` com uma tabela dos três deltas (o que mudou, a classe exata, o token do §Color/§Typography que autoriza) e a tabela dos movimentos recusados com a regra que os recusou. Deixe explícito que o esqueleto binding segue válido: nenhuma zona foi movida, fundida ou removida.
  </action>

  <verify>
    <automated>npx vitest run assinatura-card</automated>
    <automated>npm test</automated>
    <automated>npx tsc --noEmit</automated>
    <automated>npm run lint</automated>
    <automated>npm run gates:fase-07</automated>
    <automated>grep -rn --include='*.tsx' -E 'font-(bold|extrabold)' 'app/[slug]/admin/(protected)/assinatura' | grep -vE '^[^:]+:[0-9]+: *(\*|//|/\*)' | wc -l   # tem de imprimir 0 (peso 700 proibido, §Typography:132)</automated>
    <automated>grep -vE '^\s*(\*|//|/\*)' 'app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx' | grep -c 'primaryColor'   # tem de imprimir 3, o mesmo de antes: campo da interface, destructuring e a prop do PagarButton</automated>
    <automated>grep -vE '^\s*(\*|//|/\*)' 'app/[slug]/admin/(protected)/assinatura/_components/assinatura-card.tsx' | grep -cE 'text-2xl'   # tem de imprimir 1 — o valor Display continua sendo só a data de Acesso até</automated>
    <automated>git diff --exit-code package.json package-lock.json   # zero dependências novas (§Non-Goals + Gate 6)</automated>
    <human-check>Suba `npm run dev`, entre no painel de um tenant e abra `/{slug}/admin/assinatura`. Confirme, comparando com o print anterior: (1) os tiles têm moldura e leem como blocos, não como manchas cinza; (2) o preço salta como valor, e a data de `Acesso até` continua sendo o maior número da tela; (3) o botão de assinar parece o fim de uma seção, com a régua acima e a linha de apoio abaixo, e não mais um item empilhado. Se o botão aparecer preto, é porque o tenant não tem `primaryColor` configurado (fallback `#18181b` em `page.tsx:155`) — isso NÃO é defeito desta tela e não deve ser "corrigido" aqui.</human-check>
  </verify>

  <done>Os cinco testes novos passam; nenhum teste existente de `assinatura-card.test.tsx`, `simples-top-bar.test.tsx`, `pagar-button.test.tsx` ou `cancelar-assinatura.test.tsx` foi editado; `npm test` verde na suíte inteira; `tsc` e `lint` limpos; `gates:fase-07` 6/6; os três greps devolvem 0, 3 e 1; `git diff package.json` vazio; e o `07-UI-SPEC.md` descreve a tela como ela ficou.</done>
</task>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 2: Decisao sobre o reforco de affordance da Assinatura no modo SIMPLES</name>
  <decision>Reforçar visualmente o acesso à Assinatura no modo SIMPLES, ou manter o ícone como está?</decision>

  <context>
O acesso **já existe e já é provado por teste**: `simples-top-bar.tsx` tem um `<Link>` de ícone para `/{slug}/admin/assinatura`, entre a engrenagem e o botão de sair, e `simples-top-bar.test.tsx` cobre o `href`, a posição e o tratamento visual. Nenhum tenant SIMPLES está sem caminho até a tela.

O que a conversa pediu foi *destaque*, e destaque esbarra em três regras simultâneas:

1. `07-UI-SPEC.md` §Touch Targets (linha 106): os dois pontos de entrada novos "are siblings appended to those rows and must match them" — destacar só o novo produz uma barra visivelmente quebrada.
2. `07-UI-SPEC.md` §Color (linha 161): a cor do tenant é explicitamente NÃO usada no "SimplesTopBar icon button". Os 3 usos permitidos de `primaryColor` já estão gastos.
3. `simples-top-bar.test.tsx:79-87` afirma, deliberadamente, que a classe do link de Assinatura é **idêntica** à da engrenagem.

Há ainda um fato que reduz a urgência: um tenant SIMPLES em carência **já recebe** o `AvisoCarencia` âmbar com botão de pagar acima de `children` em toda tela do admin (`(protected)/layout.tsx:53-69` renderiza o banner nos dois modos). O sinal de urgência já existe; o que o ícone oferece é o acesso rotineiro.
  </context>

  <options>
    <option id="manter">
      <name>A — Manter como está e apenas documentar (recomendado)</name>
      <pros>Zero risco; nenhuma regra amendada; nenhum teste enfraquecido; o sinal de urgência continua vindo do banner de carência, que é mais visível que qualquer badge de barra. Custo: um comentário.</pros>
      <cons>O ícone segue discreto para quem quer conferir a assinatura sem estar em carência.</cons>
    </option>
    <option id="rotulo">
      <name>B — Dar rótulo de texto visível ao ícone em telas largas</name>
      <pros>Torna o destino legível sem hover; é a forma mais barata de destaque.</pros>
      <cons>Quebra a paridade exigida por §Touch Targets, exige amendar o UI-SPEC e reescrever o teste "usa o mesmo tratamento visual da engrenagem" — que existe justamente para impedir isto.</cons>
    </option>
    <option id="badge">
      <name>C — Ponto/badge de status no ícone quando o acesso está perto de vencer</name>
      <pros>Destaque só quando importa; não muda o estado de repouso.</pros>
      <cons>Exige uma prop de status nova vinda do layout (mais superfície de dados numa barra que hoje é puramente visual), `className` novo no link (mesmo teste quebrado do item B), amendar §Color, e duplica um sinal que o `AvisoCarencia` já dá com muito mais contraste.</cons>
    </option>
  </options>

  <se_escolher_A>
Acrescente ao comentário JSX que já existe acima do `<Link>` de Assinatura em `simples-top-bar.tsx` (linhas 45-52) um parágrafo curto registrando as três regras acima e o fato do banner de carência, para que o próximo leitor não trate a discrição do ícone como esquecimento. **Nenhuma mudança de código, nenhuma classe nova, nenhum teste editado.** Rode `npx vitest run simples-top-bar`, `npm run lint` e `npx tsc --noEmit` para confirmar que nada se moveu.
  </se_escolher_A>

  <se_escolher_B_ou_C>
A ordem é obrigatória e não pode ser invertida: **primeiro** amende `07-UI-SPEC.md` (§Touch Targets para B, §Touch Targets + §Color para C) registrando a exceção e o motivo; **depois** edite `simples-top-bar.tsx`; **por último** atualize o teste `usa o mesmo tratamento visual da engrenagem` para afirmar a nova regra explicitamente (nunca apague o teste — reescreva a asserção). Em C, a prop de status vem do `layout.tsx` a partir do `conta` que ele já lê; não abra query nova e não leia relógio dentro do componente. Em ambos, mantenha `title="Assinatura"` (é o nome acessível de que o teste e a navegação dependem) e mantenha o `h-10 w-10` — o carve-out de 40px é deliberado.
  </se_escolher_B_ou_C>

  <resume-signal>Responda: `manter`, `rotulo` ou `badge`</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| servidor → navegador (RSC) | Único atravessado. Este plano só altera markup já renderizado no servidor; nenhuma prop nova, nenhum dado novo, nenhuma fronteira nova. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ejn-01 | Information Disclosure | `assinatura-card.tsx` — copy nova do CTA | mitigate | A linha nova é literal estática, sem interpolação de dado do gateway, sem id e sem vocabulário do fornecedor. O teste existente `nunca exibe o vocabulário de status do gateway` roda nos cinco estados e continua valendo. |
| T-ejn-02 | Tampering | `assinatura-card.tsx` | mitigate | Nenhuma inserção de HTML cru: `dangerouslySetInnerHTML` tem 0 ocorrências hoje e o gate de `npm run lint` + a revisão do diff mantêm assim. |
| T-ejn-03 | Elevation of Privilege | rota `/assinatura` | accept | Plano puramente visual; `requireAdminSession` em `page.tsx` é o boundary e não é tocado. Nenhuma prop, action ou consulta muda. |
| T-ejn-04 | Spoofing | copy nova do CTA | mitigate | A frase afirma apenas o que o sistema faz (webhook confirma → acesso liberado). Proibido introduzir claim contratual ("sem fidelidade", "sem multa", "pagamento seguro"): os Termos de Uso ainda estão sob revisão jurídica pendente (STATE.md §Blockers). |
| T-ejn-SC | Tampering | npm | mitigate | Zero instalações. Gate 6 de `npm run gates:fase-07` conta 11 deps / 20 devDeps e falha em qualquer install; `git diff --exit-code package.json package-lock.json` está no `<verify>`. Nenhum pacote `[ASSUMED]`/`[SUS]` — nenhum checkpoint de legitimidade é disparado. |
</threat_model>

<verification>
1. `npm test` — suíte unitária inteira verde (baseline atual: 1171 testes), incluindo os 5 casos novos.
2. `npx tsc --noEmit` — 0 erros.
3. `npm run lint` — 0 erros.
4. `npm run gates:fase-07` — 6/6 OK. Gate 5 varre a rota `/assinatura` inteira atrás de marcadores de overlay (`fixed inset-0`, `role="dialog"`, `aria-modal`, `createPortal`) e de derivação de data em componente (`new Date(`, `Intl.`); os três deltas não introduzem nenhum deles.
5. Três greps de orçamento: peso 700 = 0 na rota; `primaryColor` = 3 linhas de código em `assinatura-card.tsx`; `text-2xl` = 1 linha de código (o valor Display único).
6. `git diff --exit-code package.json package-lock.json` — vazio.
7. E2E (`npm run test:e2e`) é opcional aqui e exige o Postgres do projeto no ar. Se rodar, os casos relevantes são os de `e2e/cancelamento-de-assinatura.spec.ts` que usam `getByText("Acesso até", { exact: true }).locator("..")`, `getByText("Sem assinatura", { exact: true })` e `getByRole("button", { name: "Assinar agora" })` — todos preservados por construção pelas regras de `<armadilhas_de_locator>`. Se o Postgres não estiver disponível, registre no SUMMARY que o e2e não foi executado; não invente resultado.
8. Verificação humana da tela, conforme o `<human-check>` da Task 1.
</verification>

<success_criteria>
- A tela lê como uma superfície de venda (hierarquia, molduras, CTA com zona própria) e nenhuma das 10 proibições da tabela `<orcamento_do_ui_spec>` foi violada.
- Nenhum teste existente foi editado para acomodar a mudança.
- `07-UI-SPEC.md` continua descrevendo a tela como ela é, com os deltas e as recusas registrados no adendo.
- A decisão do operador sobre o modo SIMPLES está registrada no SUMMARY, com o motivo documentado no código quando a escolha for `manter`.
</success_criteria>

<output>
Create `.planning/quick/260907-ejn-melhorar-visual-comercial-da-tela-de-ass/260907-ejn-SUMMARY.md` when done.

O SUMMARY deve registrar, explicitamente: os três deltas aplicados; a lista de movimentos comerciais **recusados** com a regra que recusou cada um (é o que impede o próximo pedido de "deixar mais vendedor" de recomeçar do zero); a escolha do operador na Task 2; e se o e2e rodou ou não.
</output>
