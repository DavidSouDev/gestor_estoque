import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

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
