import { test, expect } from "@playwright/test";
import { uniqueEmpresa } from "./helpers";

/**
 * Regressão do bug_logout: salvar o formulário de marca (`updateBranding`,
 * `app/[slug]/admin/(protected)/marca/actions.ts`) derrubava a sessão de quem
 * acabou de salvar, no MESMO clique.
 *
 * Causa raiz: `revalidarConta` (`lib/auth-guard.ts`) trata qualquer escrita em
 * `Usuario` como revogação da sessão corrente (compara `updatedAt` contra o
 * `iat` do JWT — deliberadamente grosseiro, para matar um cookie vazado depois
 * de uma troca de senha). O formulário de marca sempre reenvia o nome atual do
 * usuário junto com as cores, e uma Server Action re-renderiza a página atual
 * NA MESMA resposta (é assim que `useActionState` atualiza a UI sem reload) —
 * então uma escrita feita pela própria action já aparecia como "sessão
 * revogada" para esse re-render imediato.
 *
 * Dois reforços, os dois cobertos aqui: `updateBranding` só grava em `Usuario`
 * quando o nome realmente muda (cenário 1, abaixo, nunca chega a escrever), e
 * quando muda de verdade, `updateSelfAndRenewSession` (`lib/session.ts`)
 * reemite o cookie de sessão na MESMA escrita (cenário 2).
 */
test("salvar a marca não desloga o usuário que acabou de salvar", async ({ page }) => {
  const empresa = uniqueEmpresa();

  await page.goto("/registro");
  await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
  await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
  await page.getByLabel("CPF/CNPJ").fill(empresa.cpfCnpj);
  await page.getByLabel("E-mail").fill(empresa.email);
  await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
  await page.getByLabel("Confirmar senha").fill(empresa.senha);
  await page.getByRole("button", { name: "Criar minha loja", exact: true }).click();
  await page.getByRole("button", { name: "Li e aceito, criar minha loja" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const slug = new URL(page.url()).pathname.split("/")[1];
  const salvar = page.getByRole("button", { name: /^Salvar alterações$|^Salvo!$/ });

  await page.goto(`/${slug}/admin/marca`);
  await expect(page).toHaveURL(new RegExp(`/${slug}/admin/marca$`));

  await test.step("só a cor muda — nenhuma escrita em Usuario deveria acontecer", async () => {
    await page.locator('input[name="primaryColor"]').fill("#123456");
    await salvar.click();

    await expect(page.getByRole("button", { name: "Salvo!" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/marca$`));
  });

  await test.step("o nome do usuário muda também — exercita o reemissor de cookie", async () => {
    await page.locator('input[name="nomeUsuario"]').fill("Novo Nome Alterado");
    await page.locator('input[name="primaryColor"]').fill("#654321");
    await salvar.click();

    await expect(page.getByRole("button", { name: "Salvo!" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/marca$`));
  });

  // A sessão segue viva de verdade: navegar para outra tela protegida não cai no login.
  await page.goto(`/${slug}/admin`);
  await expect(page).toHaveURL(new RegExp(`/${slug}/admin$`));
});
