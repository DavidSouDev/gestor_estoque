# Itens diferidos — Fase 04

Descobertas fora do escopo das mudanças desta fase. Registradas, não corrigidas.

## 1. Aviso de lint pré-existente em `app/registro/page.tsx`

- **Descoberto em:** 04-09, Task 1 (rodando `npm run lint` como acceptance criterion)
- **Sintoma:** `app/registro/page.tsx:1:8 warning 'Link' is defined but never used
  @typescript-eslint/no-unused-vars`
- **Por que não foi corrigido:** não foi introduzido por nenhum plano da Fase 04 e o arquivo não é
  tocado por ela. `npm run lint` sai com código 0 — é warning, não erro.
- **Correção sugerida:** remover o import não usado.

## 2. Worktree de agente residual versionada em `.claude/worktrees/`

- **Descoberto em:** 04-09, Task 1
- **Sintoma:** `.claude/worktrees/agent-acb1d767a64dea42f/` contém uma cópia inteira do projeto. O
  ESLint a varre (duplicando o warning do item 1); os gates de `scripts/gates-fase-04.mjs` **não** a
  varrem (partem de `app/` e `lib/` na raiz), e `vitest.config.mts` já a exclui de propósito.
- **Por que não foi corrigido:** apagar diretório de worktree é operação destrutiva de git fora do
  escopo de um plano de gates.
- **Correção sugerida:** limpeza de worktrees de agente órfãs, feita deliberadamente e fora de um
  plano de execução.
