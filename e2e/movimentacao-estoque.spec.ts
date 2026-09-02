import { test, expect, type Page } from "@playwright/test";
import { uniqueEmpresa } from "./helpers";

async function criarEmpresaLogada(page: Page) {
  const empresa = uniqueEmpresa();

  await page.goto("/registro");
  await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
  await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
  await page.getByLabel("E-mail").fill(empresa.email);
  await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
  await page.getByLabel("Confirmar senha").fill(empresa.senha);
  await page.getByLabel(/Li e aceito os Termos de Uso/).check();
  await page.getByRole("button", { name: "Criar minha loja" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const slug = new URL(page.url()).pathname.split("/")[1];
  return { empresa, slug };
}

async function criarProduto(page: Page, slug: string, nome: string, estoqueInicial: string) {
  await page.goto(`/${slug}/admin/produtos/novo`);
  await page.getByLabel("Nome").fill(nome);
  await page.getByLabel("Preço", { exact: true }).fill("10.00");
  await page.getByLabel("Estoque").fill(estoqueInicial);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/admin/produtos$`));
}

test.describe("Movimentação de estoque", () => {
  test("registra uma ENTRADA e uma SAÍDA e o estoque do produto reflete a diferença", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto Estoque E2E ${Date.now()}`;

    await criarProduto(page, slug, nomeProduto, "10");

    await page.goto(`/${slug}/admin/estoque`);

    // ENTRADA de 5 unidades (10 -> 15). "ENTRADA" já é o tipo selecionado por padrão.
    await page.getByLabel("Produto").selectOption({ label: `${nomeProduto} (estoque atual: 10)` });
    await page.getByLabel("Quantidade").fill("5");
    await page.getByLabel("Motivo (opcional)").fill("Reposição E2E");
    await page.getByRole("button", { name: "Registrar" }).click();

    const historico = page.locator("table");
    await expect(
      historico.getByRole("row").filter({ hasText: nomeProduto }).filter({ hasText: "ENTRADA" })
    ).toBeVisible();

    // SAÍDA de 3 unidades (15 -> 12). A option agora reflete o novo estoque atual (15).
    await page.getByLabel("Produto").selectOption({ label: `${nomeProduto} (estoque atual: 15)` });
    await page.getByLabel("Tipo").selectOption({ label: "Saída (venda ou perda)" });
    await page.getByLabel("Quantidade").fill("3");
    await page.getByRole("button", { name: "Registrar" }).click();

    await expect(
      historico.getByRole("row").filter({ hasText: nomeProduto }).filter({ hasText: "SAIDA" })
    ).toBeVisible();

    await page.goto(`/${slug}/admin/produtos`);
    await expect(page.getByRole("link", { name: nomeProduto })).toBeVisible();
    await expect(page.getByText("12 un.")).toBeVisible();
  });

  test("bloqueia SAÍDA maior que o estoque disponível e não altera o estoque", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto Estoque Insuficiente E2E ${Date.now()}`;

    await criarProduto(page, slug, nomeProduto, "4");

    await page.goto(`/${slug}/admin/estoque`);
    await page.getByLabel("Produto").selectOption({ label: `${nomeProduto} (estoque atual: 4)` });
    await page.getByLabel("Tipo").selectOption({ label: "Saída (venda ou perda)" });
    await page.getByLabel("Quantidade").fill("10");
    await page.getByRole("button", { name: "Registrar" }).click();

    await expect(page.getByText("Estoque insuficiente.")).toBeVisible();

    await page.goto(`/${slug}/admin/produtos`);
    await expect(page.getByText("4 un.")).toBeVisible();
  });

  test("registrar um AJUSTE define o estoque exatamente para o valor informado", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto Estoque Ajuste E2E ${Date.now()}`;

    await criarProduto(page, slug, nomeProduto, "20");

    await page.goto(`/${slug}/admin/estoque`);
    await page.getByLabel("Produto").selectOption({ label: `${nomeProduto} (estoque atual: 20)` });
    await page
      .getByLabel("Tipo")
      .selectOption({ label: "Ajustar quantidade (corrigir contagem)" });
    await page.getByLabel("Quantidade").fill("7");
    await page.getByRole("button", { name: "Registrar" }).click();

    const historico = page.locator("table");
    await expect(
      historico.getByRole("row").filter({ hasText: nomeProduto }).filter({ hasText: "AJUSTE" })
    ).toBeVisible();

    await page.goto(`/${slug}/admin/produtos`);
    await expect(page.getByText("7 un.")).toBeVisible();
  });
});
