import { execFileSync } from "node:child_process";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

const RAIZ = path.resolve(__dirname, "..");

/** Os seis status que `scripts/seed-fatos-billing.ts` aceita em `--status`. */
export type StatusSeed =
  | "trial"
  | "em-dia"
  | "carencia"
  | "bloqueado"
  | "cancelado"
  | "vitalicio";

/**
 * Coloca a empresa do slug em um status de acesso escrevendo os 4 fatos de
 * billing DIRETO no banco, por `scripts/seed-fatos-billing.ts`.
 *
 * A escrita não pode passar pela API: o allowlist de `empresaService.update`
 * proíbe gravar `acessoAte`, `trialFim`, `canceladoEm` e `acessoVitalicio` por
 * HTTP, deliberadamente (BILL-04, decisão `[02-02]`). Abrir um endpoint de teste
 * só para este spec desfaria essa decisão de segurança em produção — o script,
 * que se recusa a rodar com `NODE_ENV=production`, não.
 *
 * `execFileSync` é síncrono de propósito: quando ele retorna, a linha já está
 * gravada, então nenhuma espera artificial é necessária entre bloquear e medir.
 * A guarda re-deriva o status a cada request (ACC-04), então o efeito aparece
 * já na próxima navegação.
 *
 * SOBRE `opcoes.auditado`: sem ele, o script alinha `ultimoStatusAuditado` ao
 * status que acabou de derivar dos fatos, e a empresa fica SEM transição
 * pendente. Esse é o estado certo para medir um GATE (Fase 4), que quer o estado
 * assentado, e inútil para medir o WORKER (Fase 5), que só age sobre transições
 * pendentes — um e2e de worker sobre uma empresa alinhada passaria verde contra
 * um worker quebrado. Passar `auditado` desalinha os dois de propósito.
 */
export function seedFatosBilling(
  slug: string,
  status: StatusSeed,
  opcoes?: { auditado?: StatusSeed }
): void {
  const argumentos = [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--import",
    "./scripts/resolvedor-ts.mjs",
    "scripts/seed-fatos-billing.ts",
    "--slug",
    slug,
    "--status",
    status,
  ];

  // No FINAL do array, nunca no meio: mantém o diff de qualquer mudança futura
  // legível e o comando reproduzível na mão a partir do log.
  if (opcoes?.auditado) {
    argumentos.push("--auditado", opcoes.auditado);
  }

  execFileSync(process.execPath, argumentos, { cwd: RAIZ, stdio: "inherit" });
}

/**
 * O catálogo público às vezes serve uma resposta obtida um instante antes da
 * revalidação do Server Action terminar (observado sob carga no `next dev`).
 * Uma simples espera no DOM não ajuda porque `toHaveCount` não refaz a
 * navegação — então aqui forçamos alguns `reload()` reais até o item sumir.
 */
export async function expectGoneFromCatalogo(page: Page, locator: Locator) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    if ((await locator.count()) === 0) {
      return;
    }
    await page.waitForTimeout(500);
    await page.reload();
  }

  await expect(locator).toHaveCount(0);
}

export function uniqueEmpresa() {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  return {
    nomeEmpresa: `Loja E2E ${suffix}`,
    nomeResponsavel: "Admin E2E",
    email: `admin-e2e-${suffix}@teste.com`,
    senha: "senha123",
  };
}
