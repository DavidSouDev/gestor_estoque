import { test, expect } from "@playwright/test";
import { uniqueEmpresa } from "./helpers";

test.describe("Cadastro de empresa e autenticação", () => {
  test("cria uma nova empresa e entra direto no painel administrativo", async ({ page }) => {
    const empresa = uniqueEmpresa();

    await page.goto("/registro");

    await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
    await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
    await page.getByLabel("E-mail").fill(empresa.email);
    await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
    await page.getByLabel("Confirmar senha").fill(empresa.senha);

    await page.getByRole("button", { name: "Criar minha loja" }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("link", { name: "Meus Produtos" })).toBeVisible();
    await expect(page.getByText(empresa.email)).toBeVisible();
  });

  test("bloqueia cadastro com senhas diferentes", async ({ page }) => {
    const empresa = uniqueEmpresa();

    await page.goto("/registro");

    await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
    await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
    await page.getByLabel("E-mail").fill(empresa.email);
    await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
    await page.getByLabel("Confirmar senha").fill("outrasenha");

    await page.getByRole("button", { name: "Criar minha loja" }).click();

    await expect(page.getByText("As senhas não coincidem.")).toBeVisible();
    await expect(page).toHaveURL(/\/registro$/);
  });

  test("permite logout e bloqueia acesso ao painel sem sessão", async ({ page }) => {
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

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/login$`));

    await page.goto(`/${slug}/admin`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/login$`));

    await page.getByLabel("E-mail").fill(empresa.email);
    await page.getByLabel("Senha").fill(empresa.senha);
    await page.getByRole("button", { name: "Entrar no painel" }).click();

    await expect(page).toHaveURL(new RegExp(`/${slug}/admin$`));
  });
});
