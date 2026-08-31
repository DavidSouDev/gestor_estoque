import { test, expect } from "@playwright/test";
import { uniqueEmpresa } from "./helpers";

/**
 * Prova end-to-end, contra Postgres real, de que revogar uma conta a derruba já
 * no request seguinte — sem novo login e sem esperar os 7 dias do JWT — e de que
 * as telas públicas (login e registro) continuam utilizáveis por quem carrega um
 * cookie/token obsoleto.
 *
 * A revogação é feita pela própria API do produto (`PATCH /api/usuarios/[id]`),
 * nunca por escrita direta no banco: o processo do Playwright não carrega `.env`
 * e não deve conhecer credenciais de banco.
 */
test.describe("Sessão revogada", () => {
  test("derruba a conta no request seguinte sem gerar loop de redirect", async ({
    page,
    request,
  }) => {
    const empresa = uniqueEmpresa();

    // 1. Registro pela UI — deixa um cookie `admin_session` válido no browser.
    await page.goto("/registro");
    await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
    await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
    await page.getByLabel("E-mail").fill(empresa.email);
    await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
    await page.getByLabel("Confirmar senha").fill(empresa.senha);
    await page.getByRole("button", { name: "Criar minha loja" }).click();

    await expect(page).toHaveURL(/\/admin$/);

    const slug = new URL(page.url()).pathname.split("/")[1];

    // 2. Credenciais de API (contexto separado do browser: a Authorization vai
    //    explícita no header, então o cookie não influencia as asserções).
    const loginResponse = await request.post("/api/auth/login", {
      data: { email: empresa.email, senha: empresa.senha },
    });
    expect(loginResponse.status()).toBe(200);

    const { token, usuario } = await loginResponse.json();
    const authHeader = { authorization: `Bearer ${token}` };

    // 3. Linha de base: com a conta ativa, a API autoriza.
    const antes = await request.get("/api/produtos", { headers: authHeader });
    expect(antes.status()).toBe(200);

    // 4. Revogação pela API. Neste instante a conta ainda está ativa, então
    //    `requireAuth` autoriza a própria chamada que a desativa.
    const revogacao = await request.patch(`/api/usuarios/${usuario.id}`, {
      headers: authHeader,
      data: { ativo: false },
    });
    expect(revogacao.status()).toBe(200);

    // 5. Revogação imediata na camada de API: MESMO token, agora 401.
    const depois = await request.get("/api/produtos", { headers: authHeader });
    expect(depois.status()).toBe(401);

    // 6. Revogação imediata na camada de UI: o cookie do registro continua no
    //    browser, mas o admin não autoriza mais.
    await page.goto(`/${slug}/admin`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/login$`));

    // 7. Ausência de loop de redirect (§ Pitfall 1): a tela de login precisa
    //    RENDERIZAR. Se a guarda "já estou logado" usasse apenas o JWT, o
    //    passo 6 teria falhado com ERR_TOO_MANY_REDIRECTS ou estourado o
    //    navigationTimeout — este assert torna o loop uma falha determinística.
    await expect(page.getByRole("button", { name: "Entrar no painel" })).toBeVisible();

    // 8. Mesma prova para a outra guarda pública: /registro não devolve o
    //    usuário revogado ao admin.
    await page.goto("/registro");
    await expect(page.getByRole("button", { name: "Criar minha loja" })).toBeVisible();
  });
});
