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

    await page.getByRole("button", { name: "Criar minha loja", exact: true }).click();
    await page.getByRole("button", { name: "Li e aceito, criar minha loja" }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("link", { name: "Meus Produtos" })).toBeVisible();
    await expect(page.getByText(empresa.email)).toBeVisible();

    // Critério de sucesso #1 da Fase 2, contra Postgres real: a empresa nova usa o
    // painel normalmente. Uma empresa criada sem `trialFim` cairia em BLOQUEADO no
    // motor de decisão — navegar por uma segunda tela protegida é a prova prática
    // de que o trial foi gravado no registro.
    await page.getByRole("link", { name: "Meus Produtos" }).click();
    await expect(page).toHaveURL(/\/admin\/produtos$/);
    await expect(page.getByRole("heading", { name: "Produtos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Novo produto" })).toBeVisible();

    // Nesta fase nada é bloqueado (a aplicação do bloqueio é a Fase 4). Esta
    // asserção negativa trava esse contrato: nenhuma mensagem de bloqueio ou de
    // cobrança pode aparecer para quem acabou de se cadastrar.
    await expect(page.getByText(/bloquead|pagamento|assinatura vencida/i)).toHaveCount(0);

    // O valor exato de `trialFim` é responsabilidade do teste unitário e do gate
    // SQL do plano 02-01 — o processo do Playwright não carrega `.env` e não deve
    // conhecer credenciais de banco.
  });

  // O polyfill de `HTMLDialogElement` em `tests/setup/vitest.setup.ts` é um dublê:
  // ele prova que o componente CHAMA `showModal`, nunca que o browser abre um modal.
  // Só este teste fecha essa lacuna — e o fechamento por Escape não tem cobertura
  // unitária nenhuma, porque o jsdom não implementa a tecla.
  //
  // `exact: true` no botão de submit é obrigatório NESTE spec: o modal fica aberto
  // enquanto os locators são resolvidos, e "Li e aceito, criar minha loja" contém
  // "criar minha loja" como substring. Sem `exact`, o Playwright casaria com os
  // dois botões e estouraria o strict mode. Nos outros dez specs o modal está
  // sempre fechado no momento do clique, e o locator simples continua correto.
  test("o submit abre os Termos num modal, e só o aceite cria a conta", async ({ page }) => {
    const empresa = uniqueEmpresa();

    await page.goto("/registro");

    await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
    await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
    await page.getByLabel("E-mail").fill(empresa.email);
    await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
    await page.getByLabel("Confirmar senha").fill(empresa.senha);

    const textoDoTermo = page.getByRole("region", { name: "Texto dos Termos de Uso" });
    const submeter = page.getByRole("button", { name: "Criar minha loja", exact: true });

    // Fechado, o `<dialog>` fica sob `display: none` — o texto não empurra o formulário.
    await expect(textoDoTermo).toBeHidden();

    // O primeiro submit é o pedágio: abre o modal e NÃO dispara a Server Action.
    await submeter.click();
    await expect(textoDoTermo).toBeVisible();
    await expect(page).toHaveURL(/\/registro$/);

    await page.keyboard.press("Escape");
    await expect(textoDoTermo).toBeHidden();
    await expect(page).toHaveURL(/\/registro$/);

    // D-D: fechar não é aceitar. O submit seguinte reabre o modal.
    await submeter.click();
    await expect(textoDoTermo).toBeVisible();

    await page.getByRole("button", { name: "Li e aceito, criar minha loja" }).click();

    await expect(page).toHaveURL(/\/admin$/);
  });

  test("bloqueia cadastro com senhas diferentes", async ({ page }) => {
    const empresa = uniqueEmpresa();

    await page.goto("/registro");

    await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
    await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
    await page.getByLabel("E-mail").fill(empresa.email);
    await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
    await page.getByLabel("Confirmar senha").fill("outrasenha");

    // O modal abre normalmente: `senha` e `confirmarSenha` diferentes passam pela
    // validação nativa do browser (ambos preenchidos). A recusa continua vindo do
    // servidor, DEPOIS do aceite.
    await page.getByRole("button", { name: "Criar minha loja", exact: true }).click();
    await page.getByRole("button", { name: "Li e aceito, criar minha loja" }).click();

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
    await page.getByRole("button", { name: "Criar minha loja", exact: true }).click();
    await page.getByRole("button", { name: "Li e aceito, criar minha loja" }).click();
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
