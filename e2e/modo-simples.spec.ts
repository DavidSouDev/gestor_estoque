import { test, expect } from "@playwright/test";
import { uniqueEmpresa } from "./helpers";

test.describe("Modo simples de interface", () => {
  test("cadastro no modo SIMPLES renderiza o painel simplificado em vez do dashboard padrão", async ({ page }) => {
    const empresa = uniqueEmpresa();
    const primeiroNome = empresa.nomeResponsavel.split(" ")[0];

    await page.goto("/registro");
    await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
    await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
    await page.getByLabel("E-mail").fill(empresa.email);
    await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
    await page.getByLabel("Confirmar senha").fill(empresa.senha);

    await page.getByRole("button", { name: "Simples" }).click();
    await page.getByRole("button", { name: "Criar minha loja" }).click();

    await expect(page).toHaveURL(/\/admin$/);

    // Dashboard do modo SIMPLES (SimplesAssistant), não o dashboard COMPLETO padrão.
    await expect(page.getByRole("heading", { name: `Olá, ${primeiroNome}!` })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Visão Geral" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Produtos" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar venda" })).toBeVisible();
  });

  test("permite criar um produto pelo wizard do modo simples e ele aparece no catálogo admin", async ({ page }) => {
    const empresa = uniqueEmpresa();
    const nomeProduto = `Produto Simples E2E ${Date.now()}`;

    await page.goto("/registro");
    await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
    await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
    await page.getByLabel("E-mail").fill(empresa.email);
    await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
    await page.getByLabel("Confirmar senha").fill(empresa.senha);
    await page.getByRole("button", { name: "Simples" }).click();
    await page.getByRole("button", { name: "Criar minha loja" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    const slug = new URL(page.url()).pathname.split("/")[1];

    await page.getByRole("button", { name: "Produtos" }).click();
    await expect(page.getByRole("heading", { name: "Produtos" })).toBeVisible();

    await page.getByRole("button", { name: "Adicionar novo" }).click();

    // Passo 1: nome
    await expect(page.getByRole("heading", { name: "Como se chama o produto?" })).toBeVisible();
    await page.getByPlaceholder("Ex: Arroz 5kg").fill(nomeProduto);
    await page.getByRole("button", { name: "Próximo" }).click();

    // Passo 2: preço
    await expect(page.getByRole("heading", { name: "Qual o preço de venda?" })).toBeVisible();
    await page.getByPlaceholder("0,00").fill("39.90");
    await page.getByRole("button", { name: "Próximo" }).click();

    // Passo 3: estoque (usa o stepper, incrementando duas vezes a partir de 0)
    await expect(
      page.getByRole("heading", { name: "Quantos você tem em estoque agora?" })
    ).toBeVisible();
    await page.getByRole("button", { name: "+" }).click();
    await page.getByRole("button", { name: "+" }).click();
    await page.getByRole("button", { name: "Próximo" }).click();

    // Passo 4: foto (pulado)
    await expect(page.getByRole("heading", { name: "Quer adicionar uma foto?" })).toBeVisible();
    await page.getByRole("button", { name: "Pular" }).click();

    // Passo 5: confirmação
    await expect(page.getByRole("heading", { name: "Confirma esses dados?" })).toBeVisible();
    await expect(page.getByText(nomeProduto)).toBeVisible();
    await page.getByRole("button", { name: "Salvar produto" }).click();

    await expect(page.getByRole("heading", { name: "Produto salvo!" })).toBeVisible();

    await page.getByRole("button", { name: "Voltar ao início" }).click();
    await expect(page.getByRole("heading", { name: /^Olá, / })).toBeVisible();

    // Confirma que o produto criado pelo wizard simples foi persistido de verdade,
    // conferindo na listagem padrão de produtos do admin.
    await page.goto(`/${slug}/admin/produtos`);
    await expect(page.getByRole("link", { name: nomeProduto })).toBeVisible();
    await expect(page.getByText("2 un.")).toBeVisible();
  });
});
