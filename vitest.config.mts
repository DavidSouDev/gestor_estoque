import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    // `.claude/**` cobre os worktrees de agente (`.claude/worktrees/<id>/`), que
    // são CÓPIAS COMPLETAS do repositório em outro commit. Sem esta exclusão o
    // vitest roda o projeto duas vezes e a suíte do worktree — presa a um estado
    // antigo do código — falha, transformando o gate da fase num sinal falso.
    // O diretório é ignorado pelo git, então nunca aparece em `git status`.
    exclude: ["**/node_modules/**", "**/.next/**", "**/e2e/**", "**/.claude/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["app/**/*.{ts,tsx}", "lib/**/*.ts"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "app/**/page.tsx",
        "app/**/layout.tsx",
        "**/node_modules/**",
      ],
    },
  },
});
