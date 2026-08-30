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

// Mesma formatação usada em promocao-form.tsx (toDatetimeLocal) para preencher
// os campos <input type="datetime-local">.
function toDatetimeLocal(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function periodoVigente() {
  const agora = new Date();
  const inicio = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  const fim = new Date(agora.getTime() + 24 * 60 * 60 * 1000);

  return { inicio: toDatetimeLocal(inicio), fim: toDatetimeLocal(fim) };
}

test.describe("CRUD de promoção e reflexo no catálogo público", () => {
  test("cria uma promoção vigente para um produto e o preço promocional aparece no catálogo", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto Promo E2E ${Date.now()}`;
    const nomePromocao = `Promoção E2E ${Date.now()}`;
    const { inicio, fim } = periodoVigente();

    await criarProduto(page, slug, nomeProduto, "100.00");

    await page.goto(`/${slug}/admin/promocoes/novo`);
    await page.getByLabel("Nome").fill(nomePromocao);
    await page.getByLabel("Início").fill(inicio);
    await page.getByLabel("Fim").fill(fim);

    const linhaProduto = page.locator("label", { hasText: nomeProduto });
    await linhaProduto.getByRole("checkbox").check();
    await linhaProduto.locator('input[type="number"]').fill("50.00");

    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/promocoes$`));
    await expect(page.getByRole("link", { name: nomePromocao })).toBeVisible();
    await expect(page.getByText("Vigente")).toBeVisible();
    await expect(page.getByText("1 item(ns)")).toBeVisible();

    await page.goto(`/${slug}`);
    await expect(page.getByText(nomeProduto)).toBeVisible();
    await expect(page.getByText("R$ 100,00")).toBeVisible();
    await expect(page.getByText("R$ 50,00")).toBeVisible();
    await expect(page.getByText("50% OFF")).toBeVisible();
  });

  test("promoção fora do período fica marcada como 'Fora do período' e não aparece no catálogo", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto Promo Futura E2E ${Date.now()}`;
    const nomePromocao = `Promoção Futura E2E ${Date.now()}`;

    await criarProduto(page, slug, nomeProduto, "40.00");

    const agora = new Date();
    const inicio = toDatetimeLocal(new Date(agora.getTime() + 5 * 24 * 60 * 60 * 1000));
    const fim = toDatetimeLocal(new Date(agora.getTime() + 10 * 24 * 60 * 60 * 1000));

    await page.goto(`/${slug}/admin/promocoes/novo`);
    await page.getByLabel("Nome").fill(nomePromocao);
    await page.getByLabel("Início").fill(inicio);
    await page.getByLabel("Fim").fill(fim);

    const linhaProduto = page.locator("label", { hasText: nomeProduto });
    await linhaProduto.getByRole("checkbox").check();
    await linhaProduto.locator('input[type="number"]').fill("20.00");

    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/promocoes$`));
    await expect(page.getByText("Fora do período")).toBeVisible();

    await page.goto(`/${slug}`);
    await expectGoneFromCatalogo(page, page.getByText("50% OFF"));
  });

  test("bloqueia promoção com data final antes da inicial", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto Promo Invalida E2E ${Date.now()}`;
    const nomePromocao = `Promoção Invalida E2E ${Date.now()}`;

    await criarProduto(page, slug, nomeProduto, "30.00");

    const agora = new Date();
    const inicio = toDatetimeLocal(new Date(agora.getTime() + 24 * 60 * 60 * 1000));
    const fim = toDatetimeLocal(agora);

    await page.goto(`/${slug}/admin/promocoes/novo`);
    await page.getByLabel("Nome").fill(nomePromocao);
    await page.getByLabel("Início").fill(inicio);
    await page.getByLabel("Fim").fill(fim);

    const linhaProduto = page.locator("label", { hasText: nomeProduto });
    await linhaProduto.getByRole("checkbox").check();

    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("A data final precisa ser depois da data inicial.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/promocoes/novo$`));
  });

  test("remove uma promoção e ela some da listagem", async ({ page }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto Promo Removivel E2E ${Date.now()}`;
    const nomePromocao = `Promoção Removivel E2E ${Date.now()}`;
    const { inicio, fim } = periodoVigente();

    await criarProduto(page, slug, nomeProduto, "60.00");

    await page.goto(`/${slug}/admin/promocoes/novo`);
    await page.getByLabel("Nome").fill(nomePromocao);
    await page.getByLabel("Início").fill(inicio);
    await page.getByLabel("Fim").fill(fim);
    await page.locator("label", { hasText: nomeProduto }).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/promocoes$`));
    await expect(page.getByRole("link", { name: nomePromocao })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("row", { name: new RegExp(nomePromocao) })
      .getByRole("button", { name: "Remover" })
      .click();

    await expect(page.getByRole("link", { name: nomePromocao })).toHaveCount(0);
  });
});
