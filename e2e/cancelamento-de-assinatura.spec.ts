import { test, expect } from "@playwright/test";

import { expectGoneFromCatalogo, seedFatosBilling, uniqueEmpresa } from "./helpers";

/**
 * SUB-01 e SUB-03 fim a fim, contra Postgres real, mais o caso de isolamento
 * entre tenants (§ Pitfall 11).
 *
 * ## O QUE ESTE SPEC NÃO COBRE, E POR QUÊ
 *
 * A tela de assinatura tem cinco estados. Três deles — "aguardando", "cancelada"
 * e "vitalicio" — saem da ordem normativa de `assinatura/page.tsx` ANTES de
 * qualquer I/O de gateway, e por isso são integralmente exercitáveis offline,
 * contra o banco real, no CI. É o que este arquivo faz.
 *
 * Os outros dois — "ativa" e "degradado" — só são alcançáveis com
 * `Empresa.asaasSubscriptionId` preenchido, o que exige uma assinatura de
 * verdade criada por um checkout de verdade. O `DELETE` real de
 * `asaasClient.removerAssinatura` tem a mesma dependência. As duas coisas
 * esbarram no cadastro completo da conta de sandbox do Asaas, que é um BLOCKER
 * registrado em `STATE.md` (suposições A1/A2/A3), e pertencem ao checkpoint do
 * plano 07-08 — não a este.
 *
 * Esta ausência é uma decisão lida, não uma lacuna suposta. Um spec que tentasse
 * cobrir aqueles dois estados sem a credencial cairia sempre no ramo
 * "degradado", provando apenas que o gateway está inacessível no ambiente de
 * teste — o que é verdade em qualquer máquina e não prova nada sobre o produto.
 *
 * REACHABILITY (UI-SPEC § Reachability is bounded): a rota vive DENTRO de
 * `(protected)`, então uma empresa bloqueada NÃO a alcança. O Caso 4 abaixo
 * afirma isso como o comportamento CORRETO. Um spec que espere o contrário está
 * afirmando um bug.
 */

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
  await page.getByRole("button", { name: "Li e aceito, criar minha loja" }).click();

  await expect(page).toHaveURL(/\/admin$/);

  return { empresa, slug: new URL(page.url()).pathname.split("/")[1] };
}

/** O tile "Acesso até" da Zona 1 — o rótulo e o valor moram no mesmo bloco. */
function tileAcessoAte(page: import("@playwright/test").Page) {
  return page.getByText("Acesso até", { exact: true }).locator("..");
}

test.describe("Assinatura e cancelamento", () => {
  test("estado 'sem assinatura' renderiza a tela inteira e é alcançável pela navegação do painel", async ({
    page,
  }) => {
    // Uma empresa recém-registrada nasce em TRIAL com `asaasSubscriptionId`
    // nulo: é literalmente o primeiro minuto de todo assinante novo, e o único
    // estado que se obtém sem nenhuma escrita direta no banco.
    const { slug } = await registrarPelaUI(page);

    // ─── CASO 2 — NAVEGAÇÃO (D-06 + adição de escopo da UI-SPEC) ──────────────
    // O tenant nasce em COMPLETO (o formulário de registro tem esse default), o
    // que exercita a barra LATERAL. A entrada equivalente do modo SIMPLES vive
    // em `simples-top-bar.tsx` e é coberta pelo teste de componente do plano
    // 07-03: alternar o `modoInterface` daqui custaria uma segunda jornada de
    // formulário inteira para reprovar a mesma linha de `href`.
    await page.getByRole("link", { name: "Assinatura" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/assinatura$`));

    // ─── CASO 1 — SUB-01, ESTADO "aguardando" ────────────────────────────────
    await expect(page.getByRole("heading", { name: "Assinatura", level: 1 })).toBeVisible();

    // Zona 1: a data vem de `trialFim` por `ultimoDiaDeAcessoEmSaoPaulo`, que é
    // o ÚNICO produtor dessa string no projeto. O formato é o contrato; o valor
    // depende do dia do registro e por isso não é fixado aqui.
    await expect(tileAcessoAte(page)).toContainText(/\d{2}\/\d{2}\/\d{4}/);

    // `exact` de propósito: o heading secundário "Sem assinatura ativa" contém
    // esta mesma frase, e sem o exato a asserção passaria mesmo sem o pill.
    await expect(page.getByText("Sem assinatura", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sem assinatura ativa" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Assinar agora" })).toBeVisible();

    // A tira de convergência pós-checkout (D-01). `role="status"` é live region
    // *polite* — o papel assertivo interromperia leitor de tela a cada tick.
    await expect(page.getByRole("status")).toBeVisible();

    // Nenhuma chamada ao Asaas aconteceu em nada acima: com
    // `asaasSubscriptionId` nulo a page sai da ordem normativa antes do I/O. É
    // exatamente por isso que este caso roda offline no CI.
  });

  test("cancelada com acesso residual mostra a data que sobrou e oferece reativar", async ({
    page,
  }) => {
    const { slug } = await registrarPelaUI(page);

    // ─── CASO 3 — SUB-01, ESTADO "cancelada" ─────────────────────────────────
    // `canceladoEm` preenchido E `acessoAte` no futuro: por D-06 o status
    // derivado continua EM_DIA, então a empresa mantém o painel — o público
    // exato do critério de sucesso #3. (Ver `seedFatosBilling` sobre por que a
    // escrita não passa pela API.)
    seedFatosBilling(slug, "cancelado-vigente");

    await page.goto(`/${slug}/admin/assinatura`);

    await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();
    await expect(tileAcessoAte(page)).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    await expect(page.getByRole("button", { name: "Reativar assinatura" })).toBeVisible();

    // O gatilho de cancelar NÃO pode existir aqui: `podeCancelar` é falso fora
    // dos estados "ativa"/"degradado", e oferecer um segundo cancelamento a quem
    // já cancelou é a porta de entrada do duplo-submit que o no-op idempotente
    // de `assinaturaService.cancelar` existe para absorver.
    await expect(page.getByRole("button", { name: "Cancelar assinatura" })).toHaveCount(0);

    // PROVA INDIRETA E BARATA DE QUE O GATEWAY NÃO FOI CONSULTADO: com
    // `canceladoEm` preenchido, o ramo (b) da ordem normativa sai antes do I/O.
    // A página renderizou completa num ambiente sem credencial válida de Asaas —
    // se a ordem fosse invertida, a Zona 2 apareceria (como `InlineError`, no
    // melhor caso) e este bloco não existiria.
    await expect(page.getByText("Próxima cobrança")).toHaveCount(0);
    await expect(
      page.getByText("Não foi possível carregar os dados de cobrança agora.")
    ).toHaveCount(0);
  });

  test("empresa cancelada e expirada perde o admin, a tela de assinatura e o catálogo", async ({
    page,
  }) => {
    const { empresa, slug } = await registrarPelaUI(page);

    // Linha de base. Sem ela, um catálogo vazio no passo final poderia ser
    // qualquer outra falha em vez do efeito do bloqueio.
    await page.goto(`/${slug}`);
    await expect(page.getByText(empresa.nomeEmpresa)).toBeVisible();

    // ─── CASO 4 — SUB-03 (critério de sucesso #4) ────────────────────────────
    // `cancelado` = `canceladoEm` gravado E período pago já expirado, que é o
    // estado em que uma empresa cancelada cai quando o período acaba.
    seedFatosBilling(slug, "cancelado");

    // NENHUMA linha de enforcement foi escrita nesta fase: o que este caso prova
    // é que o fato novo (`canceladoEm`) entra no fluxo de bloqueio que já existia
    // desde as Fases 2 e 4, sem tratamento especial.
    await page.goto(`/${slug}/admin`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/bloqueado$`));

    // A tela de assinatura mora DENTRO de `(protected)`, então ela TAMBÉM manda
    // para `/bloqueado` — e isso é o comportamento correto, não uma regressão.
    // Quem está suspenso precisa chegar primeiro à tela de pagamento, que é a
    // única superfície do admin que ele ainda percorre (T-04-10). Um redirect
    // para `/assinatura` aqui seria o loop `ERR_TOO_MANY_REDIRECTS` que
    // `lib/session.ts` documenta.
    await page.goto(`/${slug}/admin/assinatura`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/bloqueado$`));

    // A tela de suspensão RENDERIZA — a prova de ausência de loop de redirect.
    await expect(page.getByRole("heading", { name: "Acesso suspenso" })).toBeVisible();

    // Catálogo despublicado, de forma indistinguível de uma loja inexistente.
    await page.goto(`/${slug}`);
    await expectGoneFromCatalogo(page, page.getByText(empresa.nomeEmpresa));
  });

  test("um tenant não alcança a assinatura de outro, e nenhum id atravessa a fronteira", async ({
    page,
    browser,
  }) => {
    // ─── CASO 5 — ISOLAMENTO (§ Pitfall 11, checklist de PITFALLS.md) ────────
    const { slug: slugA } = await registrarPelaUI(page);

    // A empresa B nasce num contexto SEPARADO de propósito: registrar no mesmo
    // `page` sobrescreveria o cookie de A, e o teste passaria a navegar como B —
    // provando exatamente nada sobre isolamento.
    const contextoB = await browser.newContext();
    const paginaB = await contextoB.newPage();
    const { slug: slugB } = await registrarPelaUI(paginaB);
    await contextoB.close();

    // Logado como A, tentando a tela de B: `requireAdminSession` compara o slug
    // da rota com `session.empresaSlug` ANTES de revalidar a conta, e devolve ao
    // login DO OUTRO tenant. Nunca 200, nunca a tela de A servida sob a URL de B.
    await page.goto(`/${slugB}/admin/assinatura`);
    await expect(page).toHaveURL(new RegExp(`/${slugB}/admin/login$`));

    // De volta à própria tela: PROVA DE SUPERFÍCIE de D-05. Nenhum campo do DOM
    // carrega identificador de assinatura ou de cliente do gateway, porque a
    // action de cancelar chega já vinculada ao slug pelo servidor e o
    // `empresaId` sai da sessão. Complementa a asserção de aridade
    // (`cancelarAssinatura.length === 1`) do teste unitário do plano 07-05: lá
    // se prova a assinatura da função, aqui se prova que o formulário renderizado
    // também não tem por onde alimentá-la.
    await page.goto(`/${slugA}/admin/assinatura`);
    await expect(page.getByRole("heading", { name: "Assinatura", level: 1 })).toBeVisible();

    await expect(page.locator('input[name*="assinatura" i]')).toHaveCount(0);
    await expect(page.locator('input[name*="subscription" i]')).toHaveCount(0);
    await expect(page.locator('input[name*="customer" i]')).toHaveCount(0);
  });
});
