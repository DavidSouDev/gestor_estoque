import { test, expect, type Page } from "@playwright/test";
import { expectGoneFromCatalogo, uniqueEmpresa } from "./helpers";

async function criarEmpresaLogada(page: Page) {
  const empresa = uniqueEmpresa();

  await page.goto("/registro");
  await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
  await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
  await page.getByLabel("E-mail").fill(empresa.email);
  await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
  await page.getByLabel("Confirmar senha").fill(empresa.senha);
  await page.getByRole("button", { name: "Criar minha loja" }).click();
  await page.getByRole("button", { name: "Li e aceito, criar minha loja" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const slug = new URL(page.url()).pathname.split("/")[1];
  return { empresa, slug };
}

test.describe("CRUD de produto e reflexo no catálogo público", () => {
  test("cria um produto e ele aparece listado no admin e no catálogo público", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto E2E ${Date.now()}`;

    await page.goto(`/${slug}/admin/produtos/novo`);
    await page.getByLabel("Nome").fill(nomeProduto);
    await page.getByLabel("Preço", { exact: true }).fill("29.90");
    await page.getByLabel("Estoque").fill("15");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/produtos$`));
    await expect(page.getByRole("link", { name: nomeProduto })).toBeVisible();
    await expect(page.getByText("15 un.")).toBeVisible();

    await page.goto(`/${slug}`);
    await expect(page.getByText(nomeProduto)).toBeVisible();
    await expect(page.getByText("R$ 29,90")).toBeVisible();
  });

  test("produto oculto do catálogo não aparece na vitrine pública", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto Oculto E2E ${Date.now()}`;

    await page.goto(`/${slug}/admin/produtos/novo`);
    await page.getByLabel("Nome").fill(nomeProduto);
    await page.getByLabel("Preço", { exact: true }).fill("10.00");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/produtos$`));

    await page.getByText("Visível").click();
    await expect(page.getByText("Oculto")).toBeVisible();

    await page.goto(`/${slug}`);
    await expectGoneFromCatalogo(page, page.getByText(nomeProduto));
  });

  test("remove um produto e ele some da listagem", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto Removivel E2E ${Date.now()}`;

    await page.goto(`/${slug}/admin/produtos/novo`);
    await page.getByLabel("Nome").fill(nomeProduto);
    await page.getByLabel("Preço", { exact: true }).fill("5.00");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/produtos$`));
    await expect(page.getByRole("link", { name: nomeProduto })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("row", { name: new RegExp(nomeProduto) }).getByRole("button", { name: "Remover" }).click();

    await expect(page.getByRole("link", { name: nomeProduto })).toHaveCount(0);
  });
});
