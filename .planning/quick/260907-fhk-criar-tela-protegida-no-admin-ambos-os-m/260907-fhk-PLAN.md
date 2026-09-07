---
phase: quick-260907-fhk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/[slug]/admin/(protected)/termos/_components/termo-leitura-card.tsx
  - app/[slug]/admin/(protected)/termos/_components/termo-leitura-card.test.tsx
  - app/[slug]/admin/(protected)/termos/page.tsx
  - app/[slug]/admin/(protected)/termos/page.test.ts
  - app/[slug]/admin/(protected)/_components/admin-nav.tsx
  - app/[slug]/admin/(protected)/_components/admin-nav.test.tsx
  - app/[slug]/admin/(protected)/_components/simples/simples-top-bar.tsx
  - app/[slug]/admin/(protected)/_components/simples/simples-top-bar.test.tsx
  - scripts/gates-fase-06.mjs
  - .planning/quick/260907-fhk-criar-tela-protegida-no-admin-ambos-os-m/260907-fhk-SUMMARY.md
autonomous: true
requirements: [TERM-RELEITURA]
user_setup: []

must_haves:
  truths:
    - "Um admin logado alcança `/{slug}/admin/termos` pelo menu nos DOIS modos de interface (item na `AdminNav` do modo COMPLETO, quarto ícone na `SimplesTopBar` do modo SIMPLES) — sem digitar URL"
    - "A tela mostra o texto integral da versão vigente dos Termos de Uso, com o número da versão e a data de publicação, na mesma frase já usada pela tela de aceite (`Versão N · publicada em dd/mm/aaaa`)"
    - "A tela é SÓ-LEITURA: nenhum botão, nenhum formulário, nenhuma action — ela não escreve `AceiteTermo` nem `Usuario.termoAceitoId`, e não é o gate de TERM-04"
    - "A rota vive DENTRO de `(protected)` e chama `requireAdminSession(slug)` na PRÓPRIA page (o layout não é boundary de autorização, T-04-06); sem sessão válida a tela não renderiza e `termoVigente()` nem chega a ser consultado"
    - "O conteúdo é renderizado como nó de texto React: marcação embutida no `conteudo` aparece LITERAL na tela, e `dangerouslySetInnerHTML` não existe em nenhum arquivo novo (D-05)"
    - "Sem termo publicado, a tela mostra um estado vazio honesto — nunca versão ou data inventadas, e nunca `redirect()`"
    - "Nenhuma rota GET de termos foi criada: a superfície REST continua sendo apenas o POST exclusivo de SUPERADMIN de `app/api/termos/route.ts`"
    - "O quarto ícone da `SimplesTopBar` tem `className` byte-idêntica à da engrenagem e à do ícone de assinatura, e `title` obrigatório — a decisão travada do quick 260907-ejn continua valendo entre TODOS os ícones, não só entre os dois antigos"
    - "O fluxo de aceite obrigatório (`app/[slug]/admin/aceitar-termos/**`) não foi tocado: `git diff --stat` não lista nenhum arquivo daquela pasta e os testes dela passam sem edição"
    - "`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run gates:fase-06` e `npm run gates:fase-07` verdes, com `git diff package.json` vazio"
  artifacts:
    - path: "app/[slug]/admin/(protected)/termos/_components/termo-leitura-card.tsx"
      provides: "Card só-leitura do termo vigente (cabeçalho + caixa rolável acessível + estado vazio)"
      contains: "Texto dos Termos de Uso"
      min_lines: 40
    - path: "app/[slug]/admin/(protected)/termos/_components/termo-leitura-card.test.tsx"
      provides: "Prova de escape de marcação, de ausência de formulário e do estado vazio"
      contains: "queryAllByRole"
    - path: "app/[slug]/admin/(protected)/termos/page.tsx"
      provides: "Server component protegido que lê a versão vigente e monta o card"
      contains: "requireAdminSession"
      min_lines: 25
    - path: "app/[slug]/admin/(protected)/termos/page.test.ts"
      provides: "Prova de que a autorização acontece ANTES da leitura e de que o `null` vira estado vazio, não redirect"
      contains: "termoVigenteMock"
    - path: "app/[slug]/admin/(protected)/_components/admin-nav.tsx"
      provides: "Oitavo item de navegação do modo COMPLETO, depois de Assinatura"
      contains: "Termos de Uso"
    - path: "app/[slug]/admin/(protected)/_components/simples/simples-top-bar.tsx"
      provides: "Quarto ícone da barra do modo SIMPLES, com paridade visual total"
      contains: "Termos de Uso"
  key_links:
    - from: "app/[slug]/admin/(protected)/termos/page.tsx"
      to: "lib/termo-vigente.ts"
      via: "termoVigente() — leitura da versão vigente, nunca Prisma direto e nunca rota GET nova"
      pattern: "termoVigente\\(\\)"
    - from: "app/[slug]/admin/(protected)/termos/page.tsx"
      to: "lib/session.ts"
      via: "requireAdminSession(slug) chamado na própria page, antes de qualquer leitura"
      pattern: "requireAdminSession\\(slug\\)"
    - from: "app/[slug]/admin/(protected)/_components/admin-nav.tsx"
      to: "/{slug}/admin/termos"
      via: "buildNavItems — oitavo item"
      pattern: "admin/termos"
    - from: "app/[slug]/admin/(protected)/_components/simples/simples-top-bar.tsx"
      to: "/{slug}/admin/termos"
      via: "Link de ícone irmão da engrenagem e da assinatura"
      pattern: "admin/termos"
---

<objective>
Dar ao admin um jeito de **reler os Termos de Uso vigentes a qualquer momento**, e não só quando o gate de aceite obrigatório o força a isso. Uma tela nova, só-leitura, dentro do painel protegido, alcançável pelo menu nos dois modos de interface.

Purpose: hoje o texto dos termos só aparece em dois lugares, ambos amarrados a um fluxo de escrita — o modal do cadastro (`app/registro/_components/register-form.tsx`) e o gate de aceite (`app/[slug]/admin/aceitar-termos/`). Quem já aceitou não tem nenhuma superfície para consultar o que aceitou. Isso é uma lacuna de produto e, para um documento contratual, uma lacuna de boa-fé.

Output: `app/[slug]/admin/(protected)/termos/` (page + card + dois arquivos de teste), o item de navegação nos dois modos, e a decisão de cor da Fase 6 estendida à superfície nova.

**Três limites que definem este plano:**

1. **É uma tela de LEITURA, não um segundo gate.** Nenhum botão de aceitar, nenhum de rejeitar, nenhuma action. O usuário que chega aqui já está em dia com os termos — `requireAdminSession` garante isso antes de a page renderizar. Qualquer formulário nesta tela seria um segundo caminho de escrita para `AceiteTermo`, que a Fase 6 deliberadamente manteve único.
2. **A rota fica DENTRO de `(protected)`, ao contrário de `aceitar-termos`.** Aquela mora fora do grupo porque o próprio guard do grupo manda o usuário para lá — colocá-la dentro produz `ERR_TOO_MANY_REDIRECTS` (registrado em `lib/session.ts:156-160` e no cabeçalho de `aceitar-termos/page.tsx`). Esta é o caso oposto: o destino de quem já passou pelo guard. O modelo estrutural é `(protected)/assinatura/page.tsx`, não `aceitar-termos/page.tsx`.
3. **Sem rota GET nova.** `app/api/termos/route.ts` documenta a superfície REST como deliberadamente mínima (só POST, só SUPERADMIN). Um server component lê `termoVigente()` direto — não existe cliente que precise do JSON.

**Fora de escopo, explicitamente:** histórico de versões antigas. `lib/termo-vigente.ts` só sabe buscar a vigente, e mostrar a vigente já atende ao pedido. Um seletor de versões exigiria uma segunda função de leitura, uma decisão de UI sobre qual versão o usuário "deveria" ver, e a distinção entre "a vigente" e "a que você aceitou" — três coisas que este plano não precisa resolver para entregar o valor pedido.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# Fonte da verdade do conteúdo (não editar)
@lib/termo-vigente.ts
@lib/format.ts

# Modelo ESTRUTURAL da rota nova (página protegida, requireAdminSession na própria page)
@app/[slug]/admin/(protected)/assinatura/page.tsx
@app/[slug]/admin/(protected)/layout.tsx

# Modelo VISUAL do bloco de texto (copiar o bloco de conteúdo, NÃO o formulário de aceite)
@app/[slug]/admin/aceitar-termos/_components/aceite-card.tsx

# Modelo de TESTE de page protegida (ambiente node + mocks hoisted)
@app/[slug]/admin/aceitar-termos/page.test.ts

# Navegação dos dois modos
@app/[slug]/admin/(protected)/_components/admin-nav.tsx
@app/[slug]/admin/(protected)/_components/admin-nav.test.tsx
@app/[slug]/admin/(protected)/_components/simples/simples-top-bar.tsx
@app/[slug]/admin/(protected)/_components/simples/simples-top-bar.test.tsx

# Gate de cor da Fase 6 (Gate 4 — ESCOPO_SEM_AMBAR)
@scripts/gates-fase-06.mjs
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Card só-leitura do termo vigente</name>
  <files>
    app/[slug]/admin/(protected)/termos/_components/termo-leitura-card.tsx
    app/[slug]/admin/(protected)/termos/_components/termo-leitura-card.test.tsx
  </files>
  <behavior>
    Escreva o teste ANTES do componente e veja-o falhar (RED) — o arquivo de teste roda em jsdom, que é o ambiente padrão do `vitest.config.mts` (só `page.test.ts` do aceite força `node`).

    - Com termo: renderiza um `heading` de nível 1 com o texto `Termos de Uso`.
    - Com termo: renderiza a linha `Versão 3 · publicada em 05/09/2026` a partir de `{ versao: 3, publicadoEmFormatado: "05/09/2026" }` — o separador é o mesmo `·` de `aceite-card.tsx`.
    - Com termo: `getByRole("region", { name: "Texto dos Termos de Uso" })` existe, tem `tabIndex` 0 e `className` contendo `whitespace-pre-wrap` e `overflow-y-auto`.
    - ESCAPE (prova de que não há HTML cru): com `conteudo` contendo `<b>negrito</b>`, a região tem esse trecho como TEXTO (`toHaveTextContent("<b>negrito</b>")`) e `container.querySelector("b")` é `null`.
    - SÓ-LEITURA: `screen.queryAllByRole("button")` tem length 0 e `container.querySelector("form")` é `null`.
    - Estado vazio (`termo === null`): renderiza a frase `Nenhuma versão dos Termos de Uso está publicada no momento.`, NÃO renderiza a região de texto (`queryByRole("region", ...)` é `null`) e não contém a palavra `Versão ` seguida de número — nada de versão ou data inventada.
  </behavior>
  <action>
Crie `termo-leitura-card.tsx` exportando `TermoLeituraCardProps` e `TermoLeituraCard` (componente puro, SEM `"use client"` — ele não tem estado nem handler, e a page é server component).

Contrato de props, deliberadamente magro:

`termo` é `{ versao: number; conteudo: string; publicadoEmFormatado: string } | null`. Três ausências são intencionais e devem estar documentadas no JSDoc do arquivo: (a) NÃO existe prop `id`, porque nada é submetido — `termoId` só faz sentido num formulário de aceite; (b) NÃO existe prop de cor (`primaryColor`/`accentColor`), porque a tela vive dentro do chrome do admin, que já carrega a identidade do tenant, e porque o orçamento de cor de tenant desta superfície já está gasto (Gate 4 da Fase 6 / UI-SPEC); (c) a data chega FORMATADA do servidor, como em `AceiteCard` — nenhuma construção de `Date` dentro do componente, o que o mantém testável sem fake timers.

Estrutura (mesmo esqueleto de conteúdo de `(protected)/assinatura/_components/assinatura-card.tsx`, que é o irmão desta rota):

- Raiz `<div className="space-y-6">`.
- Bloco de cabeçalho: `<h1 className="text-xl/[1.2] font-semibold text-slate-800">Termos de Uso</h1>` seguido de `<p className="mt-2 text-sm/[1.5] text-slate-500">` com a copy `Esta é a versão vigente dos Termos de Uso da plataforma. Leia o texto completo abaixo.`
  Copy NEUTRA de propósito, sem ramo: escrever "os termos que você aceitou" seria falso para o SUPERADMIN, que é isento do gate por D-03 e mesmo assim alcança a tela. É a mesma disciplina de cópia única que `aceite-card.tsx` documenta.
- Bloco de conteúdo: `<div className="rounded-2xl border border-slate-100 bg-white p-6">`.
  - Com termo: `<p className="text-xs text-slate-500">Versão {termo.versao} · publicada em {termo.publicadoEmFormatado}</p>` e, abaixo, a caixa rolável — copie o bloco de `aceite-card.tsx` (linhas 97-104) trocando SÓ a altura máxima: `role="region"`, `aria-label="Texto dos Termos de Uso"`, `tabIndex={0}`, `className="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm/[1.5] text-slate-700"`, e `{termo.conteudo}` como único filho. O `tabIndex` não é enfeite: uma caixa rolável sem filho focável é inalcançável por teclado. `max-h-72` virou `max-h-[60vh]` porque aqui a leitura é o propósito da tela, não um passo intermediário de um formulário.
  - Sem termo: `<p className="text-sm/[1.5] text-slate-500">` com `Nenhuma versão dos Termos de Uso está publicada no momento.` e uma segunda frase `Assim que uma versão for publicada, ela aparece aqui.` Nada mais — sem ícone de erro, sem tinta vermelha: não é falha do usuário, e em operação normal este ramo é inalcançável.

PROIBIDO neste arquivo, e o JSDoc deve dizer por quê: `dangerouslySetInnerHTML` (D-05 torna `conteudo` texto puro exatamente para eliminar essa superfície); qualquer utilitário `amber-` (âmbar é o vocabulário de PAGAMENTO desta aplicação, ensinado pela Fase 4 — ver o comentário do Gate 4 em `scripts/gates-fase-06.mjs`); qualquer `<form>`, `<button>` ou action.
  </action>
  <verify>
    <automated>npx vitest run termo-leitura-card</automated>
  </verify>
  <done>Os testes do card passam (RED antes, GREEN depois), a região é acessível por teclado, marcação no `conteudo` sai literal e o estado vazio não inventa versão nem data.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Rota protegida /{slug}/admin/termos</name>
  <files>
    app/[slug]/admin/(protected)/termos/page.tsx
    app/[slug]/admin/(protected)/termos/page.test.ts
  </files>
  <behavior>
    Escreva `page.test.ts` ANTES da page e veja-o falhar. Copie a MECÂNICA de `app/[slug]/admin/aceitar-termos/page.test.ts`: primeira linha `// @vitest-environment node`, mocks criados com `vi.hoisted`, `redirect` mockado para lançar `REDIRECT:<url>`, e a page invocada como função async recebendo `{ params: Promise.resolve({ slug }) }`. Mocke `@/lib/session` (`requireAdminSession`) e `@/lib/termo-vigente` (`termoVigente`). NÃO mocke `@/lib/format` — a formatação real é parte do que se prova.

    - Chama `requireAdminSession` com o slug recebido em `params`.
    - AUTORIZAÇÃO ANTES DE LEITURA: quando `requireAdminSession` lança (é o que `redirect()` faz), a page rejeita e `termoVigenteMock` NÃO foi chamado. Esta asserção negativa é o teste de segurança do plano.
    - Com termo vigente `{ id, versao: 3, conteudo: "Texto da v3.", publicadoEm: new Date("2026-09-05T12:00:00Z") }`, o elemento devolvido tem `props.termo` igual a `{ versao: 3, conteudo: "Texto da v3.", publicadoEmFormatado: "05/09/2026" }` — exatamente essas três chaves, sem `id`.
    - Com `termoVigente()` devolvendo `null`, a page NÃO lança, NÃO chama `redirect` e devolve o elemento com `props.termo === null`.
    - REGRESSÃO DE ARQUITETURA (leitura do próprio fonte com `readFileSync`, como o último caso de `aceitar-termos/page.test.ts`): o fonte de `page.tsx` não contém `dangerouslySetInnerHTML`, não contém `prisma.` (a leitura passa pelo módulo `termo-vigente`, deduplicado por `React.cache`) e não contém `termosPendentes` nem `acessoBloqueado` (nenhuma guarda duplicada — quem faz isso é `requireAdminSession`).
  </behavior>
  <action>
Crie `app/[slug]/admin/(protected)/termos/page.tsx` como server component async, no molde de `(protected)/assinatura/page.tsx`:

```
export default async function AdminTermosPage({ params }: { params: Promise<{ slug: string }> })
```

Corpo, nesta ordem exata:

1. `const { slug } = await params;`
2. `await requireAdminSession(slug);` — SEM atribuir a uma variável (nada da sessão é usado: `TermoDeUso` é global, sem `empresaId`, então não há isolamento de tenant a aplicar aqui; a chamada existe pela autorização, e o `await` sem atribuição também evita warning de variável não usada no lint).
3. `const vigente = await termoVigente();`
4. `return <TermoLeituraCard termo={vigente ? { versao: vigente.versao, conteudo: vigente.conteudo, publicadoEmFormatado: formatDate(vigente.publicadoEm) } : null} />;`

`formatDate` vem de `@/lib/format` — a data é formatada AQUI, no servidor, pelo mesmo motivo que em `aceitar-termos/page.tsx`.

Escreva um JSDoc de cabeçalho cobrindo os quatro pontos que um leitor futuro vai querer contestar:

- **Por que DENTRO de `(protected)`, ao contrário de `aceitar-termos`.** Aquela rota mora fora do grupo porque o guard do grupo manda o usuário para ela; esta é o destino de quem JÁ passou pelo guard, e portanto não pode gerar loop. Mover esta pasta para fora do grupo tiraria o chrome do admin e a autorização de graça, sem ganho nenhum.
- **Por que nenhuma guarda simétrica é replicada.** `requireAdminSession` já cobre sessão válida, empresa não bloqueada e termos aceitos (`lib/session.ts:124-163`). O layout NÃO é o boundary (T-04-06) — quem fecha a tela é a chamada acima, na própria page.
- **Por que `null` NÃO redireciona.** `aceitar-termos` redireciona nesse caso porque ali um termo ausente torna o gate insatisfazível. Aqui a tela é informativa: um estado vazio honesto é a resposta correta, e mandar o usuário de volta ao painel sem explicação seria pior.
- **Por que não existe rota GET.** `app/api/termos/route.ts` registra a superfície REST como deliberadamente mínima; um server component lê o módulo direto e nenhum cliente precisa do JSON.
  </action>
  <verify>
    <automated>npx vitest run termos/page.test.ts</automated>
  </verify>
  <done>A rota renderiza o card com a versão vigente para admin autenticado, devolve estado vazio quando não há termo publicado, e prova por asserção negativa que nada é lido do banco antes da autorização passar.</done>
</task>

<task type="auto">
  <name>Task 3: Navegação nos dois modos + escopo do gate de cor</name>
  <files>
    app/[slug]/admin/(protected)/_components/admin-nav.tsx
    app/[slug]/admin/(protected)/_components/admin-nav.test.tsx
    app/[slug]/admin/(protected)/_components/simples/simples-top-bar.tsx
    app/[slug]/admin/(protected)/_components/simples/simples-top-bar.test.tsx
    scripts/gates-fase-06.mjs
  </files>
  <action>
**A. `admin-nav.tsx` (modo COMPLETO).** Acrescente ao objeto `ICONS` a chave `termos` com o glifo de documento já usado em `aceite-card.tsx` (linha 75): `"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"`. Em `buildNavItems`, acrescente um OITAVO item depois de `Assinatura`: `{ href: \`/${slug}/admin/termos\`, label: "Termos de Uso", icon: ICONS.termos }`. Comente por que é o último: os seis primeiros estão ordenados por frequência diária de uso e o comentário existente já explica que `Assinatura` fecha esse gradiente "junto dos controles de nível de conta" — releitura de contrato pertence ao mesmo agrupamento e é o destino menos visitado de todos. Nenhuma outra linha do arquivo muda: a lógica de `active` (`pathname.startsWith(item.href)`) já funciona para a rota nova, porque nenhum href existente é prefixo de `/admin/termos`.

**B. `admin-nav.test.tsx`.** Atualize o caso `"é o último item da lista, depois de Minha Loja"`: o array `rotulos` passa a ter OITO entradas, com `"Termos de Uso"` no fim. Acrescente um `describe("entrada de Termos de Uso")` com dois casos: (1) `getByRole("link", { name: /termos de uso/i })` tem `href` `/loja-teste/admin/termos`; (2) usando o mesmo padrão de remontagem do bloco `AdminNav em /assinatura` (que já faz `vi.resetModules()` + `vi.doMock("next/navigation")`), com `usePathname` devolvendo `/loja-teste/admin/termos`, o item de Termos fica ativo (`backgroundColor: "#2563eb"`) e nem `Assinatura` nem `Início` ficam. Os casos existentes que buscam `/assinatura/i` continuam válidos — `"Termos de Uso"` não casa com nenhum regex já usado no arquivo.

**C. `simples-top-bar.tsx` (modo SIMPLES).** Acrescente um QUARTO controle, `<Link>`, posicionado ENTRE o ícone de assinatura e o `<form>` de logout — `Sair` continua sendo o último controle da barra, que é o único cuja posição os usuários memorizaram. `href={\`/${slug}/admin/termos\`}`, `title="Termos de Uso"` (obrigatório: é o único nome acessível de um controle só-de-ícone), `className` COPIADA CARACTERE A CARACTERE da engrenagem — `"flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"` — e o mesmo `<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">` com o path de documento do item A inline. Comente que a paridade visual não é preferência estética e sim a decisão travada do quick 260907-ejn (07-UI-SPEC §Touch Targets: pontos de entrada novos "are siblings appended to those rows and must match them"; §Color: a cor do tenant não é usada nos botões de ícone desta barra), e que o path é duplicado de propósito porque `ICONS` é privado de `admin-nav.tsx`, um client component — exportá-lo só para compartilhar uma string criaria acoplamento sem benefício, como o comentário do ícone de assinatura já registra.

**D. `simples-top-bar.test.tsx`.** Duas mudanças. (1) GENERALIZE o caso `"usa o mesmo tratamento visual da engrenagem"`: ele hoje compara só `Assinatura` com `Configurações`; passe a iterar sobre `["Assinatura", "Termos de Uso"]` afirmando, para cada um, `className` idêntica à da engrenagem, e renomeie o caso para deixar claro que a paridade vale entre TODOS os ícones de navegação (o botão `Sair` fica de fora, como hoje — ele é o único com hover vermelho). (2) Acrescente um `describe("entrada de Termos de Uso")` com dois casos: `href` correto para o slug, e ordem — `Configurações` antes de `Termos de Uso`, `Termos de Uso` antes de `Sair`, usando o mesmo `compareDocumentPosition` do bloco vizinho.

**E. `scripts/gates-fase-06.mjs`.** Acrescente `"app/[slug]/admin/(protected)/termos"` a `ESCOPO_SEM_AMBAR.diretorios` (uma linha, mais uma linha de comentário citando este quick task). Motivo: o Gate 4 existe para impedir que uma superfície de TERMOS use a paleta de PAGAMENTO, e a tela nova é uma superfície de termos — deixá-la fora do escopo permitiria, amanhã, exatamente a colisão de vocabulário que o gate documenta. `arquivosSob` usa `path.join` + `existsSync` sem globbing, então colchetes e parênteses no caminho são literais e funcionam. A checagem de `ausentes` só se aplica à lista `arquivos`, não a `diretorios` — nada mais precisa mudar.

Não toque em nenhum arquivo de `app/[slug]/admin/aceitar-termos/` nem em `app/registro/`: os dois fluxos de aceite seguem exatamente como estão, e a prova disso é `git diff --stat` não listar nada dessas pastas.
  </action>
  <verify>
    <automated>npx vitest run admin-nav simples-top-bar && npm run gates:fase-06 && npm test && npx tsc --noEmit && npm run lint && git diff --stat -- package.json 'app/[slug]/admin/aceitar-termos' app/registro</automated>
  </verify>
  <done>Os dois modos de interface têm caminho visível até `/{slug}/admin/termos`; a paridade visual da barra do modo SIMPLES é afirmada entre os três ícones; `gates:fase-06` segue 5/5 já cobrindo a pasta nova; a suíte completa, `tsc` e `lint` verdes; `git diff --stat` do último comando sai VAZIO (nem `package.json`, nem o fluxo de aceite, nem o registro foram tocados).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navegador → rota `(protected)/termos` | Requisição possivelmente sem sessão, com sessão de outro tenant ou com sessão revogada |
| `TermoDeUso.conteudo` (banco) → DOM do admin | Texto controlado por SUPERADMIN via `POST /api/termos`, renderizado numa página autenticada |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fhk-01 | Information Disclosure | `app/[slug]/admin/(protected)/termos/page.tsx` | mitigate | `requireAdminSession(slug)` chamado na PRÓPRIA page (o layout não é boundary — T-04-06), antes de qualquer leitura; provado pela asserção negativa "termoVigente não é chamado quando a guarda lança" na Task 2 |
| T-fhk-02 | Tampering (XSS) | `termo-leitura-card.tsx` | mitigate | Conteúdo renderizado como nó de texto React; `dangerouslySetInnerHTML` proibido no arquivo e provado ausente por dois caminhos — teste de escape com `<b>negrito</b>` literal (Task 1) e leitura do fonte da page (Task 2) |
| T-fhk-03 | Elevation of Privilege | rota nova × isolamento multi-tenant | accept | `TermoDeUso` é global (sem `empresaId`) e a page não faz nenhuma query por empresa; não há dado de tenant a vazar. A rota continua exigindo sessão de admin válida do slug (T-fhk-01) |
| T-fhk-04 | Repudiation | ausência de escrita | mitigate | A tela não tem `<form>`, `<button>` nem action — provado por `queryAllByRole("button")` length 0 e `querySelector("form")` null (Task 1). O único caminho de escrita de `AceiteTermo` continua sendo `aceitar-termos/actions.ts`, intocado |
| T-fhk-05 | Denial of Service | estado sem termo publicado | mitigate | `termoVigente()` devolvendo `null` renderiza estado vazio, nunca `redirect()` nem `notFound()` — o usuário não fica preso nem em loop; caso coberto na Task 2 |
| T-fhk-SC | Tampering | npm installs | mitigate | Nenhum pacote instalado: zero import novo fora de `@/lib/*` e `next/link`. `npm run gates:fase-06` (Gate 5) conta 11 deps / 20 devDeps e falha se mudar; `git diff package.json` verificado vazio na Task 3 |
</threat_model>

<verification>
Rodar na raiz do repositório, nesta ordem:

1. `npx vitest run termo-leitura-card` — card só-leitura, escape e estado vazio.
2. `npx vitest run termos/page.test.ts` — autorização antes de leitura, props e regressão de arquitetura.
3. `npx vitest run admin-nav simples-top-bar` — navegação e paridade visual nos dois modos.
4. `npm test` — suíte completa (baseline 1171 testes; o número final é maior, mas NENHUM teste pré-existente pode ser removido, e os únicos editados são os quatro casos nomeados na Task 3).
5. `npx tsc --noEmit` e `npm run lint` — zero erro.
6. `npm run gates:fase-06` (5/5, já cobrindo a pasta nova) e `npm run gates:fase-07` (6/6, prova de que nada da fase de assinatura regrediu).
7. `git diff --stat -- package.json 'app/[slug]/admin/aceitar-termos' app/registro` — saída VAZIA.

<human-check id="260907-fhk-H1">
Confirmação visual opcional, depois dos itens acima (não bloqueia o merge; a estrutura já está travada por teste):
- `npm run dev`, logar num tenant COMPLETO e clicar em "Termos de Uso" no menu lateral — o texto integral aparece com versão e data, a caixa rola e é alcançável por Tab.
- Trocar o tenant para modo SIMPLES em `/{slug}/admin/marca` e conferir que o quarto ícone da barra superior aparece com o mesmo tamanho, mesma cor e mesmo hover dos outros dois, e leva à mesma tela.
</human-check>
</verification>

<success_criteria>
- `/{slug}/admin/termos` existe dentro de `(protected)`, exige `requireAdminSession` na própria page e mostra conteúdo, versão e data de publicação do termo vigente.
- A tela é só-leitura: zero botão, zero formulário, zero action, zero escrita.
- Os dois modos de interface têm caminho de navegação visível até a tela, e o ícone do modo SIMPLES é visualmente indistinguível dos vizinhos.
- Nenhuma rota GET de termos foi criada e nenhum arquivo do fluxo de aceite obrigatório foi tocado.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run gates:fase-06` e `npm run gates:fase-07` verdes; `git diff package.json` vazio.
</success_criteria>

<output>
Criar `.planning/quick/260907-fhk-criar-tela-protegida-no-admin-ambos-os-m/260907-fhk-SUMMARY.md` ao terminar, registrando: os arquivos criados, os quatro casos de teste pré-existentes que foram EDITADOS (e por quê), a contagem final de `npm test`, e a decisão de deixar histórico de versões fora de escopo.
</output>
