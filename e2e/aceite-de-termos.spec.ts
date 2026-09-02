import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

import {
  publicarNovaVersaoDeTermos,
  seedFatosBilling,
  seedSuperadmin,
  uniqueEmpresa,
} from "./helpers";

/**
 * TERM-04 fim a fim, contra Postgres real.
 *
 * MECANISMO DE PUBLICAÇÃO — a escolha e o porquê. O plano oferecia duas formas
 * de publicar uma versão nova dentro do e2e: (a) um script de INSERT direto
 * invocado por `execFileSync`, ou (b) o endpoint real `POST /api/termos`
 * autenticado como SUPERADMIN. Escolhida a **(b)**, sem obstáculo encontrado.
 * Ela fecha os dois requisitos da fase com um mecanismo só: o SUPERADMIN publica
 * de verdade (TERM-02, passando pela autorização que lê a role do BANCO no
 * request atual) e o resto do spec observa o efeito no gate (TERM-04). A opção
 * (a) provaria apenas a metade de baixo — o gate reagindo a uma linha que
 * alguém escreveu na tabela.
 *
 * O SUPERADMIN em si não tem caminho de API: `registerComUsuario` não aceita
 * `role`, e por D-04 não deve passar a aceitar. Ele é criado por
 * `scripts/seed-superadmin.ts` no `beforeAll`, por `execFileSync` síncrono — o
 * mesmo padrão de `seedFatosBilling`, e pelo mesmo motivo (quando a chamada
 * retorna, a linha já está no banco).
 *
 * Cada teste registra a SUA empresa pela UI, com o checkbox já marcado, o que
 * grava o aceite da versão vigente naquele instante. A versão nova publicada
 * DEPOIS é o que torna aquele aceite obsoleto — é assim que o gate é acionado
 * sem nenhuma escrita direta no banco e sem manipular a sessão.
 */

/**
 * Folga de tempo para a PRIMEIRA visita a cada rota.
 *
 * Este arquivo é o primeiro da suíte em ordem alfabética, então é ele que paga a
 * compilação sob demanda do `next dev` de `/registro`, `/{slug}/admin`,
 * `/{slug}/admin/produtos`, `/{slug}/admin/aceitar-termos`,
 * `/{slug}/admin/bloqueado` e `GET /api/produtos` — os specs seguintes já as
 * encontram compiladas. Medido: os dois estouros observados na primeira execução
 * foram exatamente esses (10s no `expect` de URL e 15s no `actionTimeout` da
 * chamada REST), e ambos passaram no retry. O número acompanha o
 * `navigationTimeout` global; NÃO é máscara de loop de redirect — um loop não
 * termina em 30s nem em 300s, ele estoura com `ERR_TOO_MANY_REDIRECTS`.
 */
const PRIMEIRA_VISITA = 30_000;

/** Registro pela UI. Deixa cookie `admin_session` válido e devolve o slug. */
async function registrarPelaUI(page: Page) {
  const empresa = uniqueEmpresa();

  await page.goto("/registro");
  await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
  await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
  await page.getByLabel("E-mail").fill(empresa.email);
  await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
  await page.getByLabel("Confirmar senha").fill(empresa.senha);
  await page.getByLabel(/Li e aceito os Termos de Uso/).check();
  await page.getByRole("button", { name: "Criar minha loja" }).click();

  await expect(page).toHaveURL(/\/admin$/, { timeout: PRIMEIRA_VISITA });

  return { empresa, slug: new URL(page.url()).pathname.split("/")[1] };
}

/**
 * Bearer token em contexto separado do browser: a `Authorization` vai explícita
 * no header, então nenhum cookie influencia as asserções — é o que permite
 * provar que o MESMO token atravessa a publicação e o aceite. Mesma técnica de
 * `e2e/bloqueio-por-inadimplencia.spec.ts`.
 */
async function tokenDeApi(request: APIRequestContext, email: string, senha: string) {
  const login = await request.post("/api/auth/login", { data: { email, senha } });
  expect(login.status()).toBe(200);

  const { token } = (await login.json()) as { token: string };

  return { authorization: `Bearer ${token}` };
}

/** Conteúdo distinguível por execução, para que a tela mostre o texto novo. */
function textoDeTermo(caso: string): string {
  return (
    `[TEXTO E2E — ${caso} — ${Date.now()}]\n\n` +
    "Cláusula única: esta versão existe apenas para acionar o gate de aceite."
  );
}

test.describe("Aceite obrigatório dos Termos de Uso", () => {
  // O SUPERADMIN é pré-requisito dos quatro casos. O script é idempotente por
  // email, então rodar a suíte de novo é um no-op — não acumula tenant interno.
  test.beforeAll(() => {
    seedSuperadmin();
  });

  test("cai no gate, aceita e volta ao painel — com o aceite persistido", async ({
    page,
    request,
  }) => {
    const { slug } = await registrarPelaUI(page);

    // O registro já gravou o aceite da versão vigente. Publicar uma NOVA versão
    // é o que torna aquele aceite obsoleto (D-07: publicar é INSERT, a versão
    // anterior continua intacta no banco).
    const novo = await publicarNovaVersaoDeTermos(request, textoDeTermo("caso 1"));

    // 1. O gate dispara na primeira navegação autenticada seguinte, sem novo
    //    login: `revalidarConta` re-deriva `termosPendentes` a cada request.
    await page.goto(`/${slug}/admin`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/aceitar-termos$`), {
      timeout: PRIMEIRA_VISITA,
    });
    await expect(page.getByRole("heading", { name: "Termos de Uso" })).toBeVisible();

    //    A tela mostra a versão NOVA, não a que o usuário já havia aceitado.
    await expect(page.getByText(`Versão ${novo.versao} ·`)).toBeVisible();

    // 2. Aceitar devolve ao painel.
    await page.getByRole("button", { name: "Aceitar e continuar" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin$`));
    await expect(page.getByRole("link", { name: "Meus Produtos" })).toBeVisible();

    // 3. A prova de que o aceite foi PERSISTIDO, e não de que o redirect da
    //    action funcionou: uma SEGUNDA navegação, para outra página protegida,
    //    passa direto pelo gate. Se `AceiteTermo` + `Usuario.termoAceitoId` não
    //    tivessem sido gravados na mesma transação, este passo voltaria para
    //    `/aceitar-termos`.
    await page.goto(`/${slug}/admin/produtos`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/produtos$`), {
      timeout: PRIMEIRA_VISITA,
    });
    await expect(page.getByRole("heading", { name: "Produtos" })).toBeVisible();
  });

  test("sai da conta pela tela de aceite sem entrar em loop", async ({ page, request }) => {
    // Critério de sucesso #4 do roadmap: ninguém pode ficar preso na tela de
    // aceite. `Sair da conta` está ligado à action `logout` EXISTENTE, que não
    // chama `requireAdminSession` — e é essa propriedade que garante a saída.
    const { slug } = await registrarPelaUI(page);
    await publicarNovaVersaoDeTermos(request, textoDeTermo("caso 2"));

    await page.goto(`/${slug}/admin`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/aceitar-termos$`));

    // Contagem de respostas de redirect HTTP durante a saída. Um loop real se
    // manifestaria como `ERR_TOO_MANY_REDIRECTS` (a partir de ~20 saltos) ou
    // como estouro do `navigationTimeout`; o limite abaixo é folgado de
    // propósito — ele existe para separar "alguns saltos normais" de "cadeia",
    // não para fixar o número exato de saltos do framework.
    let redirecionamentos = 0;
    const contar = (resposta: { status: () => number }) => {
      if ([301, 302, 303, 307, 308].includes(resposta.status())) redirecionamentos += 1;
    };

    page.on("response", contar);

    await page.getByRole("button", { name: "Sair da conta" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/login$`));

    page.off("response", contar);

    // A tela de login RENDERIZA — a asserção que um loop não sobreviveria.
    await expect(page.getByRole("button", { name: "Entrar no painel" })).toBeVisible();
    expect(redirecionamentos).toBeLessThan(5);

    // E a sessão realmente morreu: voltar ao painel devolve ao login, não à
    // tela de aceite.
    await page.goto(`/${slug}/admin`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/login$`));
  });

  test("espelho REST devolve 403 antes do aceite e 200 depois, no MESMO token", async ({
    page,
    request,
  }) => {
    // Achado Crítico 2 / T-06-05: sem o espelho em `requireAuth`, um ADMIN com
    // termos pendentes continuaria mutando dados por Bearer token enquanto a UI
    // o mandava para a tela de aceite.
    const { empresa, slug } = await registrarPelaUI(page);
    const authHeader = await tokenDeApi(request, empresa.email, empresa.senha);

    // Linha de base: sem ela, um 403 adiante poderia ser qualquer outra falha.
    const baseline = await request.get("/api/produtos", {
      headers: authHeader,
      timeout: PRIMEIRA_VISITA,
    });
    expect(baseline.status()).toBe(200);

    await publicarNovaVersaoDeTermos(request, textoDeTermo("caso 3"));

    // 403 (não 402): pagar não resolveria nada aqui — o que falta é o aceite.
    const pendente = await request.get("/api/produtos", { headers: authHeader });
    expect(pendente.status()).toBe(403);

    // Aceitar pela UI, no browser.
    await page.goto(`/${slug}/admin/aceitar-termos`);
    await expect(page.getByRole("heading", { name: "Termos de Uso" })).toBeVisible();
    await page.getByRole("button", { name: "Aceitar e continuar" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin$`));

    // MESMO token, sem novo login e sem token novo: o gate lê o estado fresco a
    // cada request, então o aceite feito pelo browser vale para a API na
    // chamada seguinte.
    const liberado = await request.get("/api/produtos", { headers: authHeader });
    expect(liberado.status()).toBe(200);
  });

  test("bloqueio tem precedência sobre termos, nas duas direções", async ({ page, request }) => {
    // T-04-10 / T-06-26: quem está suspenso tem que chegar à tela de pagamento.
    // Este é o caso que provaria um loop se a guarda simétrica estivesse errada
    // — se ele estourar por timeout, o bug É o loop.
    const { slug } = await registrarPelaUI(page);
    await publicarNovaVersaoDeTermos(request, textoDeTermo("caso 4"));

    // O estado (bloqueado, termos pendentes) — o par que o loop exigiria.
    seedFatosBilling(slug, "bloqueado");

    await page.goto(`/${slug}/admin`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/bloqueado$`), {
      timeout: PRIMEIRA_VISITA,
    });
    await expect(page.getByRole("heading", { name: "Acesso suspenso" })).toBeVisible();

    // A outra direção: entrar DIRETO na tela de aceite devolve ao bloqueio. É a
    // guarda simétrica de `aceitar-termos/page.tsx` (bloqueio antes de termos,
    // na mesma ordem dos dois guards) que faz isto — e `bloqueado/page.tsx` NÃO
    // checa termos, deliberadamente, senão as duas telas se devolveriam
    // indefinidamente.
    await page.goto(`/${slug}/admin/aceitar-termos`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/bloqueado$`));
    await expect(page.getByRole("button", { name: "Pagar agora" })).toBeVisible();
  });
});
