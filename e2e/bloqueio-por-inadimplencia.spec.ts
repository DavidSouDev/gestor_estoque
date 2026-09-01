import { execFileSync } from "node:child_process";
import path from "node:path";

import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

import { uniqueEmpresa } from "./helpers";

const RAIZ = path.resolve(__dirname, "..");

/**
 * Coloca a empresa do slug em um status de acesso escrevendo os 4 fatos de
 * billing DIRETO no banco, por `scripts/seed-fatos-billing.ts`.
 *
 * A escrita não pode passar pela API: o allowlist de `empresaService.update`
 * proíbe gravar `acessoAte`, `trialFim`, `canceladoEm` e `acessoVitalicio` por
 * HTTP, deliberadamente (BILL-04, decisão `[02-02]`). Abrir um endpoint de teste
 * só para este spec desfaria essa decisão de segurança em produção — o script,
 * que se recusa a rodar com `NODE_ENV=production`, não.
 *
 * `execFileSync` é síncrono de propósito: quando ele retorna, a linha já está
 * gravada, então nenhuma espera artificial é necessária entre bloquear e medir.
 * A guarda re-deriva o status a cada request (ACC-04), então o efeito aparece
 * já na próxima navegação.
 */
function seedStatus(slug: string, status: "bloqueado" | "em-dia"): void {
  execFileSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--import",
      "./scripts/resolvedor-ts.mjs",
      "scripts/seed-fatos-billing.ts",
      "--slug",
      slug,
      "--status",
      status,
    ],
    { cwd: RAIZ, stdio: "inherit" }
  );
}

/** Registro pela UI. Deixa cookie `admin_session` válido e devolve o slug. */
async function registrarPelaUI(page: import("@playwright/test").Page) {
  const empresa = uniqueEmpresa();

  await page.goto("/registro");
  await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
  await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
  await page.getByLabel("E-mail").fill(empresa.email);
  await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
  await page.getByLabel("Confirmar senha").fill(empresa.senha);
  await page.getByRole("button", { name: "Criar minha loja" }).click();

  await expect(page).toHaveURL(/\/admin$/);

  return { empresa, slug: new URL(page.url()).pathname.split("/")[1] };
}

/**
 * Credenciais de API em contexto separado do browser: a `Authorization` vai
 * explícita no header, então o cookie não influencia nenhuma asserção — é o que
 * permite provar que o MESMO token atravessa bloqueio e reativação.
 */
async function credenciaisDeApi(
  request: APIRequestContext,
  email: string,
  senha: string
) {
  const login = await request.post("/api/auth/login", { data: { email, senha } });
  expect(login.status()).toBe(200);

  const { token, usuario } = await login.json();

  return {
    authHeader: { authorization: `Bearer ${token}` },
    empresaId: usuario.empresaId as string,
  };
}

/**
 * Prova end-to-end, contra Postgres real, dos critérios de sucesso #2, #3, #4 e
 * #5 do roadmap: a empresa bloqueada perde o admin (UI e API) e some do catálogo
 * de forma indistinguível de uma loja inexistente, a tela de login continua
 * respondendo sem loop de redirect, e voltar a ter acesso pago devolve tudo no
 * request seguinte — sem novo login.
 */
test.describe("Bloqueio por inadimplência", () => {
  test("empresa em trial continua funcionando depois de os guards ligarem", async ({
    page,
    request,
  }) => {
    // Critério de sucesso #4: registrar já nasce em TRIAL (`trialFim` gravado por
    // `registerComUsuario`), e TRIAL não bloqueia nada.
    const { empresa, slug } = await registrarPelaUI(page);
    const { authHeader } = await credenciaisDeApi(request, empresa.email, empresa.senha);

    // O painel renderiza: nem `/bloqueado`, nem devolvido ao `/login`.
    await page.goto(`/${slug}/admin`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin$`));

    // O banner de carência é do status CARENCIA, não do TRIAL (ACC-01 / D-03).
    await expect(page.getByText("Pagamento pendente")).toHaveCount(0);

    // API autenticada e os dois caminhos públicos continuam abertos.
    expect((await request.get("/api/produtos", { headers: authHeader })).status()).toBe(200);
    expect((await request.get(`/${slug}`)).status()).toBe(200);
    expect((await request.get(`/api/empresas/slug/${slug}`)).status()).toBe(200);
  });

  test("empresa bloqueada perde admin, API e catálogo, e volta ao pagar", async ({
    page,
    request,
  }) => {
    // 1. Registro + credenciais. `usuario.empresaId` vem do próprio login: é o
    //    mesmo id que o corpo público do catálogo expõe, e continua disponível
    //    depois do bloqueio — quando aquele corpo já não existe mais.
    const { empresa, slug } = await registrarPelaUI(page);
    const { authHeader, empresaId } = await credenciaisDeApi(
      request,
      empresa.email,
      empresa.senha
    );

    // 2. Linha de base: sem ela, um 402/404 no passo 4 poderia ser qualquer
    //    outra falha, e não o efeito do bloqueio.
    expect((await request.get("/api/produtos", { headers: authHeader })).status()).toBe(200);
    expect((await request.get(`/${slug}`)).status()).toBe(200);

    // 3. Bloquear (ver o comentário de `seedStatus` sobre por que não é por API).
    seedStatus(slug, "bloqueado");

    // 4. Critério #2, camada de API: MESMO token, agora 402.
    const apiBloqueada = await request.get("/api/produtos", { headers: authHeader });
    expect(apiBloqueada.status()).toBe(402);

    // 5. O caminho de pagamento sobrevive ao bloqueio (T-04-13): o opt-out do
    //    checkout é o que impede o auto-DoS de trancar do lado de fora justamente
    //    quem quer pagar. Não afirmamos 200: sem credenciais de sandbox o gateway
    //    pode devolver 502, e o que este passo prova é o opt-out, não o gateway.
    const checkout = await request.post("/api/assinaturas/checkout", { headers: authHeader });
    expect(checkout.status()).not.toBe(402);

    // 6. Critério #2, camada de UI: o cookie do registro continua no browser, mas
    //    o painel manda para a tela de suspensão.
    await page.goto(`/${slug}/admin`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/bloqueado$`));

    //    Estes três asserts são TAMBÉM a prova de ausência de loop de redirect
    //    (T-04-14): a tela precisa RENDERIZAR. Se a rota morasse dentro de
    //    `(protected)`, o guard que mandou o usuário para cá dispararia de novo
    //    ao entrar, e o passo teria estourado com ERR_TOO_MANY_REDIRECTS ou com o
    //    navigationTimeout — como no passo 7 de `e2e/sessao-revogada.spec.ts`.
    await expect(page.getByRole("heading", { name: "Acesso suspenso" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pagar agora" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sair da conta" })).toBeVisible();

    // 7. Critério #3 — as 8 linhas da tabela de paridade do 04-RESEARCH.md. Cada
    //    resposta tem que ser a MESMA que um slug/id que nunca existiu produz.
    const catalogo = await request.get(`/${slug}`);
    expect(catalogo.status()).toBe(404);

    const empresaPorSlug = await request.get(`/api/empresas/slug/${slug}`);
    expect(empresaPorSlug.status()).toBe(404);
    expect(await empresaPorSlug.json()).toEqual({ message: "Empresa não encontrada." });

    const produtosPorSlug = await request.get(`/api/catalogo/produtos?slug=${slug}`);
    expect(produtosPorSlug.status()).toBe(400);

    const produtosPorId = await request.get(`/api/catalogo/produtos?empresaId=${empresaId}`);
    expect(produtosPorId.status()).toBe(200);
    expect(await produtosPorId.json()).toEqual([]);

    const combosPorSlug = await request.get(`/api/catalogo/combos?slug=${slug}`);
    expect(combosPorSlug.status()).toBe(400);

    const combosPorId = await request.get(`/api/catalogo/combos?empresaId=${empresaId}`);
    expect(combosPorId.status()).toBe(200);
    expect(await combosPorId.json()).toEqual([]);

    //    D-07: nenhum corpo público pode nomear o motivo. Um 404 que explica por
    //    que é 404 devolve por texto exatamente a informação que a paridade de
    //    status existe para esconder.
    //
    //    A lista enumera as FORMAS FLEXIONADAS que a copy da fase usa
    //    ("Acesso suspenso", "está suspenso por falta de pagamento") em vez do
    //    radical truncado: o payload RSC do `next dev` carrega marcadores
    //    internos do React cujo nome em inglês compartilha esse radical, e casar
    //    por radical acusaria a plumbing do framework como se fosse copy do
    //    produto. Nenhuma palavra do contrato de copywriting sai da lista.
    const corpos = await Promise.all(
      [catalogo, empresaPorSlug, produtosPorSlug, produtosPorId, combosPorSlug, combosPorId].map(
        (resposta) => resposta.text()
      )
    );

    const PALAVRAS_PROIBIDAS = [
      "pagamento",
      "assinatura",
      "cobrança",
      "suspenso",
      "suspensa",
      "suspensão",
    ];

    for (const corpo of corpos) {
      const texto = corpo.toLowerCase();

      for (const palavra of PALAVRAS_PROIBIDAS) {
        expect(texto).not.toContain(palavra);
      }
    }

    // 8. D-09: a porta de entrada para regularizar continua aberta, com branding
    //    do sistema. Se ela 404asse junto com o catálogo, o cliente bloqueado
    //    nunca conseguiria logar para pagar e o objetivo da fase se inverteria.
    //
    //    Contexto anônimo, e não o `page` deste teste: a tela é o que um
    //    VISITANTE EXTERNO vê, e a guarda "já estou logado" da própria página
    //    devolveria o `page` (que ainda carrega o cookie do registro) ao painel
    //    antes de renderizar qualquer coisa. O contexto separado também preserva
    //    a sessão do passo 9, que precisa ser a mesma emitida no registro.
    const visitante = await page.context().browser()!.newContext();
    const paginaAnonima = await visitante.newPage();

    await paginaAnonima.goto(`/${slug}/admin/login`);
    await expect(paginaAnonima.getByRole("button", { name: "Entrar no painel" })).toBeVisible();
    await expect(paginaAnonima.getByText(empresa.nomeEmpresa)).toHaveCount(0);
    await expect(
      paginaAnonima.getByRole("link", { name: "← Voltar ao catálogo" })
    ).toHaveCount(0);

    await visitante.close();

    // 9. Critério #5 / ACC-04: reativação automática. Nenhum novo login, nenhum
    //    token novo e nenhum cookie novo — o status é re-derivado a cada request,
    //    então pagar devolve o acesso já na chamada seguinte.
    seedStatus(slug, "em-dia");

    expect((await request.get("/api/produtos", { headers: authHeader })).status()).toBe(200);
    expect((await request.get(`/${slug}`)).status()).toBe(200);

    await page.goto(`/${slug}/admin`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin$`));
  });
});
