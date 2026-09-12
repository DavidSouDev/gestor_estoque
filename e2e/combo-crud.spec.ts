import { test, expect, type Page } from "@playwright/test";
import { uniqueEmpresa } from "./helpers";

async function criarEmpresaLogada(page: Page) {
  const empresa = uniqueEmpresa();

  await page.goto("/registro");
  await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
  await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
  await page.getByLabel("CPF/CNPJ").fill(empresa.cpfCnpj);
  await page.getByLabel("E-mail").fill(empresa.email);
  await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
  await page.getByLabel("Confirmar senha").fill(empresa.senha);
  await page.getByRole("button", { name: "Criar minha loja" }).click();
  await page.getByRole("button", { name: "Li e aceito, criar minha loja" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const slug = new URL(page.url()).pathname.split("/")[1];
  return { empresa, slug };
}

async function criarProduto(page: Page, slug: string, nome: string, preco: string) {
  await page.goto(`/${slug}/admin/produtos/novo`);
  await page.getByLabel("Nome").fill(nome);
  await page.getByLabel("Preço", { exact: true }).fill(preco);
  await page.getByLabel("Estoque").fill("10");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/admin/produtos$`));
}

// Note: os nomes de produto e combo aqui de propósito NÃO compartilham um
// prefixo textual (ex.: nunca "Produto Combo X" + "Combo X") — como os dois
// usam Date.now() em sequência, é comum caírem no mesmo milissegundo, e se um
// nome fosse substring do outro o getByText(nomeCombo) daria falso positivo
// batendo no card do produto.
async function abrirAbaCombos(page: Page) {
  await page.getByRole("button", { name: "Combos" }).click();
}

// Análogo ao expectGoneFromCatalogo de helpers.ts, mas reabrindo a aba
// "Combos" a cada reload — o catálogo reseta para a aba "Produtos" (estado de
// componente client-side) em toda navegação, então um reload "cru" faria essa
// asserção passar por engano com a aba errada aberta.
async function expectComboGoneFromCatalogo(page: Page, slug: string, nomeCombo: string) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    await page.goto(`/${slug}`);
    await abrirAbaCombos(page);

    if ((await page.getByText(nomeCombo).count()) === 0) {
      return;
    }

    await page.waitForTimeout(500);
  }

  await expect(page.getByText(nomeCombo)).toHaveCount(0);
}

test.describe("CRUD de combo e reflexo no catálogo público", () => {
  test("cria um combo com produto selecionado e ele aparece no admin e no catálogo público", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Item Base E2E ${Date.now()}`;
    const nomeCombo = `Combo E2E ${Date.now()}`;

    await criarProduto(page, slug, nomeProduto, "50.00");

    await page.goto(`/${slug}/admin/combos/novo`);
    await page.getByLabel("Nome").fill(nomeCombo);
    await page.getByLabel("Preço").fill("80.00");

    const linhaProduto = page.locator("label", { hasText: nomeProduto });
    await linhaProduto.getByRole("checkbox").check();

    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/combos$`));
    await expect(page.getByRole("link", { name: nomeCombo })).toBeVisible();
    await expect(page.getByText("1 produto(s)")).toBeVisible();
    await expect(page.getByText("R$ 80,00")).toBeVisible();

    // O catálogo público separa produtos e combos em abas; a aba "Combos"
    // precisa ser aberta explicitamente para o ComboCard ser renderizado.
    await page.goto(`/${slug}`);
    await abrirAbaCombos(page);
    await expect(page.getByText(nomeCombo)).toBeVisible();
    await expect(page.getByText(`1x ${nomeProduto}`)).toBeVisible();
    await expect(page.getByText("R$ 80,00")).toBeVisible();
  });

  test("combo sem nenhum produto selecionado é rejeitado com mensagem de erro", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeCombo = `Combo Vazio E2E ${Date.now()}`;

    await page.goto(`/${slug}/admin/combos/novo`);
    await page.getByLabel("Nome").fill(nomeCombo);
    await page.getByLabel("Preço").fill("10.00");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("Selecione ao menos um produto para o combo.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/combos/novo$`));
  });

  test("combo oculto do catálogo não aparece na vitrine pública", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Item Base Oculto E2E ${Date.now()}`;
    const nomeCombo = `Combo Oculto E2E ${Date.now()}`;

    await criarProduto(page, slug, nomeProduto, "20.00");

    await page.goto(`/${slug}/admin/combos/novo`);
    await page.getByLabel("Nome").fill(nomeCombo);
    await page.getByLabel("Preço").fill("35.00");
    await page.locator("label", { hasText: nomeProduto }).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/combos$`));

    await page.getByText("Visível").click();
    await expect(page.getByText("Oculto")).toBeVisible();

    await expectComboGoneFromCatalogo(page, slug, nomeCombo);
  });

  test("remove um combo e ele some da listagem", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Item Base Removivel E2E ${Date.now()}`;
    const nomeCombo = `Combo Removivel E2E ${Date.now()}`;

    await criarProduto(page, slug, nomeProduto, "15.00");

    await page.goto(`/${slug}/admin/combos/novo`);
    await page.getByLabel("Nome").fill(nomeCombo);
    await page.getByLabel("Preço").fill("25.00");
    await page.locator("label", { hasText: nomeProduto }).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/combos$`));
    await expect(page.getByRole("link", { name: nomeCombo })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("row", { name: new RegExp(nomeCombo) }).getByRole("button", { name: "Remover" }).click();

    await expect(page.getByRole("link", { name: nomeCombo })).toHaveCount(0);
  });
});
