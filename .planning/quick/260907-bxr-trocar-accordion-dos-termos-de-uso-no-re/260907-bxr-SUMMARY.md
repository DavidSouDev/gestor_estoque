---
phase: quick-260907-bxr
plan: 01
subsystem: registro
tags: [ui, acessibilidade, termos-de-uso, dialog-nativo, jsdom]
requires:
  - "TermoDeUso vigente publicado (fase 06)"
  - "app/registro/page.tsx passando `termo` por prop"
provides:
  - "Modal nativo de leitura dos Termos de Uso em /registro"
  - "Polyfill de HTMLDialogElement no setup global do vitest"
affects:
  - "app/registro/_components/register-form.tsx"
  - "tests/setup/vitest.setup.ts (setup global — todas as suítes de componente)"
tech-stack:
  added: []
  patterns:
    - "<dialog> nativo sem estado React espelhado: o elemento é a única fonte de verdade"
    - "Polyfill condicional de API do DOM no setup do vitest, com gatilho de remoção documentado"
key-files:
  created: []
  modified:
    - tests/setup/vitest.setup.ts
    - app/registro/_components/register-form.tsx
    - app/registro/_components/register-form.test.tsx
    - e2e/cadastro-e-login.spec.ts
decisions:
  - "Modal é <dialog> nativo, não biblioteca: Gate 5 fixa 11 deps / 20 devDeps"
  - "Sem useState para aberto/fechado — Escape fecha fora do React e dessincronizaria"
  - "Scroll-to-bottom obrigatório NÃO implementado: quebraria as 13 chamadas e2e de getByLabel(...).check()"
  - "Regressão de JS desabilitado aceita: o aceite tem duas guardas que não passam pelo modal"
metrics:
  duration: ~25min
  tasks: 3
  files: 4
  completed: 2026-09-07
---

# Quick Task 260907-bxr: Trocar o accordion dos Termos de Uso por modal

Accordion (`<details>/<summary>`) da tela `/registro` substituído por um modal
sobreposto usando o elemento `<dialog>` nativo — zero pacotes novos, checkbox de
aceite intocado, com prova em Chromium real de que `showModal`, Escape e o
backdrop funcionam.

## O que mudou

O texto dos termos não expande mais dentro do card do formulário. Um botão
`Ler os Termos de Uso (versão N)` abre um overlay com o texto integral numa área
rolável; o modal fecha por botão `Fechar`, por `Escape` e por clique no backdrop.
O checkbox de aceite, seu rótulo e o input escondido `termoId` não foram tocados.

## Tarefas executadas

| # | Tarefa | Commit |
|---|--------|--------|
| 1 | Polyfill de `HTMLDialogElement` para o jsdom | `6aed52c` |
| 2 (RED) | Cobertura falhando do modal — 7 asserções | `d4120d6` |
| 2 (GREEN) | Disclosure → `<dialog>` nativo | `0ef0556` |
| 3 | Prova e2e em Chromium real | `0f3eaea` |

O ciclo TDD da Task 2 tem os dois gates no log: `test(...)` com 7 falhas
verificadas contra o `<details>` ainda no lugar, depois `feat(...)` com as 7
passando. A não-vacuidade dos testes não é alegação — é o RED registrado.

## Verificação

| Verificação | Resultado |
|-------------|-----------|
| `npx tsc --noEmit` | 0 erros |
| `npm run lint` | 0 erros (2 warnings pré-existentes, ambos fora do escopo) |
| `npm test` | **1156/1156** (era 1153; +3 testes novos) |
| `npm run gates:fase-06` | **5/5**, incluindo Gate 4 (sem âmbar) e Gate 5 (11 deps / 20 devDeps) |
| `npx playwright test e2e/cadastro-e-login.spec.ts` | **4/4 contra Chromium e Postgres reais** |

O e2e **rodou de verdade** — não foi pulado nem presumido. Isso exigiu preparar o
worktree (ver "Achados"), e o teste novo cobre exatamente o que o teste unitário
não pode cobrir: que o browser abre o modal e que `Escape` o fecha.

## Decisões registradas

### Scroll-to-bottom obrigatório: NÃO implementado

Foi levantado como opcional pelo usuário. Colide frontalmente com a instrução de
preservar o comportamento do checkbox: desabilitar o aceite até o fim da rolagem
quebraria as **13 chamadas de `getByLabel(/Li e aceito os Termos de Uso/).check()`
espalhadas por 11 specs e2e**, nenhuma das quais abre o modal. Entre "forçar
leitura" e "não quebrar a suíte inteira", o plano escolheu o segundo — e o teste
`permite marcar o aceite SEM abrir o modal` agora trava esse contrato por escrito.

### Regressão aceita: com JS desabilitado o modal não abre

O `<details>` funcionava sem JS; o `<dialog>` não. Esta é a única tela do produto
sem sessão, então a regressão é real e não hipotética. Aceita porque **o aceite
não depende do modal abrir**: o `required` do checkbox (validação nativa do
browser) e a validação server-side em `app/registro/actions.ts` (E3) continuam
sendo as duas guardas, e nenhuma delas passa pelo modal. Registrada em comentário
normativo no próprio `register-form.tsx`, não só aqui.

### `<dialog>` nativo em vez de biblioteca

Focus trap, Escape, retorno de foco, top layer e `::backdrop` vêm prontos do
browser. Instalar headlessui/radix/react-modal derrubaria o Gate 5 de
`gates:fase-06`, que fixa a contagem de dependências como prova executável de
T-06-SC — e escrever focus trap à mão seria inventar um design system para
revelar um bloco de texto.

### Sem estado React espelhando aberto/fechado

O `<dialog>` é a única fonte de verdade. `Escape` fecha o elemento nativamente,
sem passar pelo React: um `useState` paralelo dessincronizaria no primeiro
`Escape` e o componente passaria a mentir sobre o próprio estado.

## Dívida de infraestrutura de teste

**`tests/setup/vitest.setup.ts` ganhou um polyfill de `HTMLDialogElement`.**

O jsdom 29.1.1 traz `HTMLDialogElementImpl` como classe literalmente vazia
(`node_modules/jsdom/lib/jsdom/living/nodes/HTMLDialogElement-impl.js`): o
construtor global existe, mas `show`, `showModal` e `close` são `undefined`.

O polyfill é um **dublê**, não uma implementação — só reflete o atributo `open`,
o que basta porque o estilo padrão do jsdom já esconde `<dialog>` fechado. Ele
**não** prova nada sobre top layer, `inert`, foco preso, retorno de foco, Escape
ou `::backdrop`. É exatamente por isso que a Task 3 existe.

**Gatilho de remoção:** apagar o bloco quando o jsdom implementar
`HTMLDialogElement` de verdade. Ele já é condicional (`if (!...prototype.showModal)`),
então morre inerte sozinho — mas deve ser removido, não deixado apodrecendo.

## Achados durante a execução

**O worktree não conseguia rodar `next dev` — três causas em cascata, todas de
ambiente, nenhuma de código.** Registrado porque vai acontecer de novo em todo
worktree deste projeto:

1. `tsc --noEmit` acusava `Cannot find name 'LayoutProps'` em `app/layout.tsx`
   (arquivo que esta task não tocou). É um tipo global gerado pelo Next 16 em
   `.next/types`, que não existe num worktree recém-criado. Resolvido por
   `npx next typegen`.
2. O Turbopack falhava com `Could not find the Next.js package`: ele detecta a
   raiz do workspace pelo `package-lock.json` (que é versionado e portanto está
   no worktree), mas `node_modules` só existia no checkout principal.
3. Symlinkar `node_modules` para o repositório principal **não funciona** — o
   Turbopack recusa com `Symlink [project]/node_modules is invalid, it points out
   of the filesystem root`. A única saída foi `npm ci` dentro do worktree
   (649 pacotes, do lockfile existente, nenhum pacote novo) + `npx prisma generate`.

Além disso, `.env` é gitignored e não acompanha o worktree; foi copiado do
checkout principal para o worktree para que o `next dev` do Playwright
encontrasse `DATABASE_URL`.

**Limpeza pendente para o operador:** o worktree
`.claude/worktrees/agent-a822e2c78761443f8` contém uma cópia de `.env` (com
credenciais reais de banco e a chave do Asaas). Remover o worktree depois do
merge elimina a cópia. Nenhum desses artefatos entrou em commit — `git status`
ficou limpo em todos os quatro commits, e `.env`, `node_modules` e `.next` são
todos gitignored.

## Ameaças do registro STRIDE

| Threat ID | Disposição | Estado |
|-----------|-----------|--------|
| T-Q07-01 (XSS no texto do termo) | mitigate | **Fechada.** Texto segue nó de texto React; `grep -c dangerouslySetInnerHTML` no arquivo = 0; teste do `<img onerror>` prova ausência do elemento no DOM depois de abrir o modal |
| T-Q07-02 (botões do modal submetendo o form) | mitigate | **Fechada.** `type="button"` explícito nos dois botões; teste afirma que `Fechar` não chama a `action` |
| T-Q07-03 (spoofing do `termoId`) | accept | Inalterado — o input escondido não foi tocado |
| T-Q07-04 (modal não abre sem JS) | accept | Aceita e documentada acima e em comentário no código |
| T-Q07-SC (instalação de pacotes) | mitigate | **Fechada.** Zero dependências adicionadas; Gate 5 verde em 11 deps / 20 devDeps. O `npm ci` do worktree instalou apenas o que já estava no lockfile |

## Desvios do plano

Nenhum desvio de escopo. As três tasks foram executadas como escritas, na ordem
escrita. O trabalho extra foi preparação de ambiente do worktree (item "Achados"),
que não alterou nenhum arquivo versionado.

## Nota para o operador

Verificação visual sugerida e **não bloqueante** (o plano a marcou como opcional):
abrir `/registro`, estreitar a janela até ~375px de largura e confirmar que o
modal cabe na tela com o texto rolando por dentro, em vez de a caixa crescer para
fora. O `max-h-[85vh]` no wrapper e o `min-h-0 flex-1` na região do texto são o
que garantem isso, mas só o olho confirma.

## Self-Check: PASSED

Arquivos afirmados, todos presentes:

- `tests/setup/vitest.setup.ts` — FOUND
- `app/registro/_components/register-form.tsx` — FOUND
- `app/registro/_components/register-form.test.tsx` — FOUND
- `e2e/cadastro-e-login.spec.ts` — FOUND

Commits afirmados, todos no log:

- `6aed52c` — FOUND
- `d4120d6` — FOUND
- `0ef0556` — FOUND
- `0f3eaea` — FOUND
