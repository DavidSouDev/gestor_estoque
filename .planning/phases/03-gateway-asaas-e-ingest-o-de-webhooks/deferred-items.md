# Itens diferidos — Fase 03

Descobertas fora do escopo das tasks executadas. Registradas, **não** corrigidas.

| # | Encontrado em | Item | Por que não foi corrigido |
|---|---------------|------|---------------------------|
| 1 | 03-07 Task 3 | `npm run lint` reporta o mesmo warning duas vezes (`'Link' is defined but never used` em `app/registro/page.tsx`), porque o ESLint também percorre a cópia do repositório em `.claude/worktrees/agent-acb1d767a64dea42f/`. | O gate `npm run lint` continua saindo 0 — é ruído, não falso-vermelho. O caso análogo do vitest FOI corrigido porque lá o worktree obsoleto derrubava o gate (78 falhas). Correção sugerida: acrescentar `".claude/**"` ao `globalIgnores` de `eslint.config.mjs`. |
| 2 | 03-07 Task 3 | Warning pré-existente `'Link' is defined but never used` em `app/registro/page.tsx`. | Anterior a esta fase (já registrado no SUMMARY de 03-06). Nenhuma task desta fase toca esse arquivo. |
| 3 | 03-07 Task 3 | O worktree órfão `.claude/worktrees/agent-acb1d767a64dea42f` (branch `worktree-agent-acb1d767a64dea42f`, commit `ee5c199`) continua registrado em `git worktree list`. | Remover worktree é operação destrutiva e fora do escopo do plano. Limpeza sugerida quando o operador confirmar que o trabalho dele já foi mesclado: `git worktree remove`. |
