import { test, expect, type Page } from "@playwright/test";
import { uniqueEmpresa } from "./helpers";

// PNG 1x1 mínimo válido — o conteúdo não importa pro teste, só precisa
// passar pela validação de tipo (`image/png`) do upload real no R2.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

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

async function adicionarVariante(
  page: Page,
  { nome, tamanho, estoque }: { nome: string; tamanho: string; estoque: string }
) {
  await page.getByRole("button", { name: "+ Nova variante" }).click();
  await page.getByLabel("Nome da variante").fill(nome);
  await page.locator('input[name="atributoNome"]').fill("Tamanho");
  await page.locator('input[name="atributoValor"]').fill(tamanho);
  await page.getByLabel("Estoque desta variante").fill(estoque);
  await page.getByRole("button", { name: "Salvar variante" }).click();
  await expect(page.getByRole("button", { name: "+ Nova variante" })).toBeVisible();
}

test.describe("Variantes de produto", () => {
  test("cria variantes, movimenta o estoque de uma delas e o catálogo público reflete a seleção", async ({
    page,
  }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto Variantes E2E ${Date.now()}`;

    await page.goto(`/${slug}/admin/produtos/novo`);
    await page.getByLabel("Nome").fill(nomeProduto);
    await page.getByLabel("Preço", { exact: true }).fill("20.00");
    await page.getByLabel("Ativar controle por variante").check();
    await page.getByRole("button", { name: "Salvar" }).click();

    // Criar já redireciona direto pra tela de edição — é lá que mora a seção
    // de variantes, então dá pra continuar sem precisar procurar o produto
    // na listagem de novo.
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/produtos/[^/]+$`));
    await expect(page.getByRole("heading", { name: "Editar produto" })).toBeVisible();

    await adicionarVariante(page, { nome: "P - Estampa A", tamanho: "P", estoque: "5" });
    await adicionarVariante(page, { nome: "M - Estampa B", tamanho: "M", estoque: "0" });

    await expect(page.getByText("Tamanho: P")).toBeVisible();
    await expect(page.getByText("R$ 20,00 · 5 em estoque")).toBeVisible();
    await expect(page.getByText("Tamanho: M")).toBeVisible();
    await expect(page.getByText("R$ 20,00 · 0 em estoque")).toBeVisible();

    // Movimenta o estoque de UMA variante especificamente (não do produto).
    await page.goto(`/${slug}/admin/estoque`);
    await page.getByLabel("Produto").selectOption({ label: nomeProduto });
    await page
      .getByLabel("Variante")
      .selectOption({ label: "P - Estampa A (estoque atual: 5)" });
    await page.getByLabel("Quantidade").fill("3");
    await page.getByRole("button", { name: "Registrar" }).click();

    const historico = page.locator("table");
    await expect(
      historico
        .getByRole("row")
        .filter({ hasText: nomeProduto })
        .filter({ hasText: "P - Estampa A" })
        .filter({ hasText: "ENTRADA" })
    ).toBeVisible();

    // O agregado do produto (soma das variantes) reflete o novo saldo: 5 + 3 = 8.
    await page.goto(`/${slug}/admin/produtos`);
    await expect(page.getByText("8 un.")).toBeVisible();

    // Catálogo público: seleciona cada variante e confirma que preço/estoque
    // exibidos mudam de acordo.
    await page.goto(`/${slug}`);
    await page.getByRole("link", { name: nomeProduto }).first().click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/produtos/`));

    await expect(page.getByText("8 em estoque")).toBeVisible();

    await page.getByRole("button", { name: "M - Estampa B" }).click();
    await expect(page.getByText("Indisponível")).toBeVisible();
    await expect(page.getByText("Fora de estoque")).toBeVisible();

    await page.getByRole("button", { name: "P - Estampa A" }).click();
    await expect(page.getByText("8 em estoque")).toBeVisible();
  });

  test("selecionar várias fotos direto no formulário do produto (modo Completo) cria uma variante por foto", async ({
    page,
  }) => {
    const { slug } = await criarEmpresaLogada(page);
    const nomeProduto = `Produto Fotos Completo E2E ${Date.now()}`;

    await page.goto(`/${slug}/admin/produtos/novo`);
    await page.getByLabel("Nome").fill(nomeProduto);
    await page.getByLabel("Preço", { exact: true }).fill("35.00");

    await page.locator('input[type="file"][multiple]').setInputFiles([
      { name: "estampa-a.png", mimeType: "image/png", buffer: PNG_1X1 },
      { name: "estampa-b.png", mimeType: "image/png", buffer: PNG_1X1 },
    ]);
    await expect(page.getByText(/2 fotos escolhidas/)).toBeVisible();

    await page.getByRole("button", { name: "Salvar" }).click();

    // Criar redireciona direto pra edição, onde a seção Variantes já mostra
    // as duas variantes criadas automaticamente a partir das fotos — sem
    // precisar passar por "+ Nova variante".
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/produtos/[^/]+$`));
    await expect(page.getByText("Variante 1")).toBeVisible();
    await expect(page.getByText("Variante 2")).toBeVisible();

    await page.goto(`/${slug}`);
    await page.getByRole("link", { name: nomeProduto }).first().click();
    await expect(page.getByRole("button", { name: "Variante 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Variante 2" })).toBeVisible();
  });
});
