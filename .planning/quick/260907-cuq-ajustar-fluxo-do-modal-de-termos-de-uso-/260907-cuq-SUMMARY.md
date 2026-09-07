---
phase: quick-260907-cuq
plan: 01
subsystem: registro / aceite de termos
tags: [termos-de-uso, registro, ux, server-action, e2e]
requires:
  - "app/registro/page.tsx entregando o termo vigente por prop"
  - "empresaService.registerComUsuario gravando o aceite na mesma transação"
provides:
  - "Gate de aceite amarrado ao submit do formulário de /registro"
  - "Campo de prova de aceite `termosAceitos` validado na Server Action"
affects:
  - "app/registro/actions.ts"
  - "app/registro/_components/register-form.tsx"
  - "os 11 specs e2e que cadastram empresa pela UI"
tech-stack:
  added: []
  patterns:
    - "Interceptação do submit no onSubmit do <form> (React 19 cancela a Server Action quando defaultPrevented)"
    - "Prova de aceite em hidden input não controlado, escrita por ref dentro do onSubmit"
    - "requestSubmit() para reentrar no mesmo caminho de submissão, sem lógica duplicada"
key-files:
  created: []
  modified:
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
decisions:
  - "A memória do aceite é um useRef booleano, nunca useState: setState é assíncrono e o requestSubmit() imediato leria o valor velho (D-B)"
  - "A prova é reescrita a cada submit autorizado porque o React 19 reseta o formulário depois de cada action — comprovado por sonda, não presumido (D-C)"
  - "O botão Fechar permanece como secundário; fechar não é aceitar e o submit seguinte reabre o modal (D-D)"
metrics:
  duration: ~35min
  tasks: 4
  completed: 2026-09-07
---

# Quick Task 260907-cuq: Ajustar o fluxo do modal de Termos de Uso — Summary

Aceite dos Termos de Uso em `/registro` deixou de ser um checkbox decorativo ao lado de um botão de leitura opcional: agora o primeiro clique em **Criar minha loja** abre o modal, e só o botão **Li e aceito, criar minha loja** dispara o cadastro de verdade.

## O que mudou

**Metade CLIENT.** O gate mora no `onSubmit` do `<form>` (D-A), não no `onClick` do botão: o browser roda a validação nativa primeiro, então o modal só aparece quando o resto do formulário já está preenchido — e o submit implícito por Enter também passa pelo pedágio. Um `useRef` booleano memoriza o aceite da carga de página; um hidden input `termosAceitos` não controlado é a projeção dele no payload, escrito por ref dentro do próprio `onSubmit`.

**Metade SERVER.** `register` passou a ler `String(formData.get("termosAceitos") ?? "")` e a exigir o valor exato `"true"`. A forma colapsa os três estados de fracasso — ausente, vazio e forjado — numa recusa só, com a copy E3 literal e na mesma posição da cadeia (depois de `modoInterface`, antes de `termoId`).

**Superfície e2e.** Os 11 specs que cadastram empresa pela UI migraram para o fluxo de dois cliques. Só `cadastro-e-login.spec.ts` ganhou asserções novas (os outros dez apenas atravessam o registro para criar uma empresa).

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Trocar a prova de aceite na Server Action | `6e37f13` |
| 2 | Interceptar o submit e mover o aceite para dentro do modal | `eec65f5` |
| 3 | Migrar `e2e/cadastro-e-login.spec.ts` para o fluxo de dois cliques | `472eb49` |
| 4 | Migrar os dez specs e2e restantes e travar a superfície antiga | `eccb971` |

## Verificação — os sete itens, executados de verdade

Todos rodados a partir da raiz do worktree. Nada presumido.

| # | Comando | Resultado |
|---|---------|-----------|
| 1 | `npx tsc --noEmit` | **0 erros** (exit 0, sem saída) |
| 2 | `npm run lint` | **0 erros**, 2 warnings pré-existentes |
| 3 | `npm test` | **1159 passed**, 99 arquivos |
| 4 | `npm run gates:fase-06` | **5/5 gates OK** |
| 5 | `npm run test:e2e` | **32 passed** (1 flaky, exit 0) |
| 6 | grep superfície antiga | **0** |
| 7 | grep superfície nova | **11** |

### Gates de superfície (saída literal)

```
$ grep -rn --include='*.ts' --include='*.tsx' -e 'aceiteTermos' -e 'Li e aceito os Termos de Uso' -e 'Ler os Termos de Uso' app lib e2e | wc -l
0

$ grep -rl 'Li e aceito, criar minha loja' e2e | wc -l
11
```

### Lint — os 2 warnings são pré-existentes e fora do escopo

```
app/registro/page.tsx
  1:8  warning  'Link' is defined but never used
app/services/reconciliacao.service.test.ts
  35:10  warning  'fatosDeTrial' is defined but never used

✖ 2 problems (0 errors, 2 warnings)
```

O de `app/registro/page.tsx` está registrado no STATE desde `01-04` (removê-lo estouraria o teto de diff daquele acceptance criteria). Nenhum arquivo tocado por esta task introduziu warning novo.

### Gates da Fase 6 (saída literal)

```
OK    Gate 4 (nenhuma paleta âmbar nos arquivos novos da fase) — 5 fontes varridas
OK    Gate 5 (nenhum pacote instalado na fase) — 11 deps / 20 devDeps

Resultado: 5/5 gates OK.
```

Zero pacotes novos: o `<dialog>` continua nativo.

### Contagem de testes: 1156 → 1159 (+3)

A diferença é explicável linha a linha, e nenhum teste foi apagado sem substituto:

- `actions.test.ts`: **+1**. O caso "valor diferente de on" virou três casos distintos (ausente, vazio, forjado); o de `termoId` permaneceu.
- `register-form.test.tsx`: **+2**. Saíram dois testes cuja superfície deixou de existir ("renderiza o gatilho do modal" e "permite marcar o aceite SEM abrir o modal") e o "exige o checkbox de aceite". Entraram cinco: ausência do gatilho e da caixa de seleção, prova vazia antes do aceite, primeiro submit abre sem chamar a action, aceite dispara a action uma vez com o payload correto, e segundo submit não reabre o modal.

### e2e: 32 passed, 1 flaky — investigado, não é regressão

O flaky foi `aceite-de-termos.spec.ts:99` ("cai no gate, aceita e volta ao painel"), que passou no retry. A causa está no artefato de erro da primeira tentativa:

```
TimeoutError: apiRequestContext.post: Timeout 15000ms exceeded.
  - → POST http://localhost:3100/api/termos
```

Não tem relação com esta mudança, por duas evidências: (a) o estouro é numa chamada REST de publicação de termos, que esta task não tocou; (b) o snapshot da página no momento da falha mostra o painel admin já renderizado com o nome e o e-mail da empresa — ou seja, o registro pelo fluxo NOVO de dois cliques já tinha funcionado. É exatamente o custo de compilação sob demanda que o cabeçalho do próprio spec documenta ("15s no `actionTimeout` da chamada REST, e ambos passaram no retry"), agravado aqui por ser um worktree com `.next` frio e "slow filesystem detected" reportado pelo Next.

## Achado de runtime: D-C confirmado por medição, não por suposição

O plano afirmava que o React 19 reseta o formulário depois de cada action e que por isso a prova precisa ser reescrita a cada submit autorizado. Isso foi **medido**, não aceito de fé. Uma sonda temporária no teste do segundo submit imprimiu, logo depois de a action retornar erro:

```
SONDA email: "" prova: ""
```

O hidden input de prova volta VAZIO. Sem a reescrita dentro do `onSubmit`, o segundo envio (o de quem corrigiu o e-mail depois de um "E-mail já cadastrado") chegaria ao servidor sem prova e seria recusado com a copy E3 — por um motivo que o usuário não teria como entender. A asserção ficou no teste, permanente, no lugar da sonda.

**Efeito colateral que mudou o desenho do helper de teste:** depois do reset, o React repõe o valor anterior no campo num render seguinte. Digitar por cima concatenava os dois (`"david@teste.comdavid@teste.com"`), produzindo um e-mail inválido que o `reportValidity()` do jsdom barrava antes de qualquer submit — o segundo submit simplesmente não acontecia. O helper passou a fazer `clear()` antes de `type()`, o que o torna reutilizável dentro do mesmo teste. Diagnosticado por sonda (`valido: false`), não por tentativa e erro.

## Ameaças

| Threat ID | Disposição | Como ficou |
|-----------|-----------|------------|
| T-Q08-01 | accept | Paridade explícita com o controle antigo (D-E): um POST montado à mão sempre pôde forjar o valor. O que se preserva é a força do caminho DOM |
| T-Q08-02 | mitigate | `type="button"` explícito nos dois botões do modal; teste afirma que "Fechar" não chama a action |
| T-Q08-03 | mitigate | `defaultValue=""` e escrita só dentro do `onSubmit`; teste afirma valor vazio antes do aceite e `"true"` no payload depois |
| T-Q08-04 | accept | Sem JS a Server Action de `useActionState` não roda; um POST à mão chega sem prova e é recusado pela E3. Desfecho é falha FECHADA |
| T-Q08-05 | mitigate | D-05 preservado: nó de texto React, sem `dangerouslySetInnerHTML`; teste do `<img onerror>` mantido no fluxo novo |
| T-Q08-06 | mitigate | D-C: valor reescrito a cada submit autorizado; teste do segundo submit cobre |
| T-Q08-SC | mitigate | Zero pacotes novos; Gate 5 verde em 11 deps / 20 devDeps |

## Desvios do plano

Um só, de forma e não de conteúdo.

**[Rule 3 - Blocking] Asserções de ausência sem citar o vocabulário proibido.** O plano pedia (Task 2) testes de ausência via `queryByRole`/`queryByLabelText` do gatilho e do checkbox antigos — mas escrever esses locators exigiria os literais que o gate de superfície da Task 4 proíbe em `app/`, e `register-form.test.tsx` está em `app/`. As duas instruções eram incompatíveis ao pé da letra. Resolvido por asserções estruturais, que provam o mesmo com mais força:

- `expect(screen.queryAllByRole("button", { name: /Termos/ })).toHaveLength(0)` — nenhum botão do formulário fala dos termos, o que cobre o gatilho removido sem nomeá-lo.
- `expect(screen.queryByRole("checkbox")).toBeNull()` e `document.querySelector('input[type="checkbox"]')` nulo — não existe mais **nenhuma** caixa de seleção no formulário, o que é mais forte que afirmar a ausência de uma específica.

Sem impacto no comportamento; o gate 1 fecha em 0 com comentários incluídos.

## Preparo de ambiente (worktree)

Confirmando a nota herdada de `260907-bxr`: o worktree nasce sem `node_modules` e sem `.env`. Foi preciso `npm ci` (symlink é recusado pelo Turbopack), `npx prisma generate`, `npx next typegen` e copiar o `.env` do checkout principal. Verificado antes de rodar e2e que a porta 3100 estava livre — com `reuseExistingServer: true` no config, um `next dev` remanescente do checkout principal faria o Playwright testar o código ANTIGO e reportar verde enganoso. Postgres estava de pé em 5432, então a suíte rodou contra banco real.

## Known Stubs

Nenhum. Não há placeholder, dado mockado ou caminho não implementado introduzido por esta task.

## Self-Check: PASSED

Arquivos modificados conferidos no disco e commits conferidos no git:

- `app/registro/actions.ts` — FOUND (`termosAceitos` presente, 2 ocorrências)
- `app/registro/_components/register-form.tsx` — FOUND (`requestSubmit` presente)
- `app/registro/_components/register-form.test.tsx` — FOUND (`Li e aceito, criar minha loja` presente)
- `e2e/cadastro-e-login.spec.ts` — FOUND (`Li e aceito, criar minha loja` presente)
- Commits `6e37f13`, `eec65f5`, `472eb49`, `eccb971` — todos FOUND em `git log`
