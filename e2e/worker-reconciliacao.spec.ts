import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

import { seedFatosBilling, uniqueEmpresa } from "./helpers";

/**
 * Prova end-to-end, contra Postgres real, de WRK-01 e WRK-02.
 *
 * O que SÓ o Postgres real prova, e que nenhum teste unitário com Prisma mockado
 * alcança: que o compare-and-swap da auditoria converge de verdade, que a causa
 * `WORKER_DIARIO` é aceita pelo enum efetivamente APLICADO no banco (e não só
 * pelo client gerado), e que o path HTTP exato responde 200 — e não um 3xx de
 * normalização, que um agendador de cron não seguiria.
 *
 * A empresa deste spec é registrada pela UI e depois NUNCA mais faz um request
 * autenticado. Isso é o ponto inteiro: a Fase 4 já bloqueia a cada request, então
 * um teste em que alguém loga não distingue o worker do gate. Aqui, a única coisa
 * que acontece entre "empresa em TRIAL" e "empresa BLOQUEADA" é a chamada HTTP ao
 * worker.
 */

/**
 * O segredo tem que ser o MESMO que o servidor lê. Os dois lados chegam pelo
 * mesmo caminho: `playwright.config.ts` carrega o `.env` no processo de teste com
 * o leitor de ambiente do próprio Next, e o `next dev` que ele sobe lê o mesmo
 * arquivo com o mesmo leitor.
 *
 * Ausência é FALHA, nunca `skip`: pular transformaria a falta da variável num
 * spec verde que não testou absolutamente nada — exatamente o modo de falha
 * silenciosa que este arquivo existe para eliminar.
 */
const SEGREDO = process.env.CRON_SECRET;

if (!SEGREDO) {
  throw new Error(
    "CRON_SECRET ausente no processo de teste. Localmente: gere um valor com " +
      "`openssl rand -hex 32` e acrescente a linha `CRON_SECRET=<valor>` ao final " +
      "do `.env` do projeto (hexadecimal de propósito — o leitor de ambiente do " +
      "Next passa o arquivo por dotenv-expand, que trata `$` como referência a " +
      "outra variável). No CI o valor vem do bloco `env:` de " +
      "`.github/workflows/tests.yml` e nada precisa ser feito."
  );
}

/**
 * Path EXATO e sem barra final. Um 308 de normalização terminaria o job de cron
 * sem executar nada e sem erro visível, porque agendadores de cron não seguem
 * redirects.
 */
const ROTA = "/api/cron/reconciliacao-diaria";

/**
 * Mesmo COMPRIMENTO do segredo correto, de propósito. Um segredo errado de
 * comprimento diferente poderia ser recusado por um erro de tamanho de buffer na
 * comparação de tempo constante, e o teste passaria sem provar que a comparação
 * em si funciona.
 */
const SEGREDO_ERRADO = "b".repeat(SEGREDO.length);

/** Chama o worker. Sem `segredo`, nenhum header de autorização é enviado. */
function chamarWorker(request: APIRequestContext, segredo?: string) {
  return request.get(ROTA, {
    headers: segredo ? { authorization: `Bearer ${segredo}` } : {},
  });
}

/** Registro pela UI. Deixa cookie `admin_session` válido e devolve o slug. */
async function registrarPelaUI(page: Page) {
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

  return { empresa, slug: new URL(page.url()).pathname.split("/")[1] };
}

test.describe("Worker diário de reconciliação", () => {
  test("recusa chamada sem segredo e com segredo errado (WRK-02)", async ({ request }) => {
    // 1. Sem header nenhum.
    const semSegredo = await chamarWorker(request);
    expect(semSegredo.status()).toBe(401);

    //    O corpo VAZIO é a mitigação de enumeração: um 401 que devolvesse JSON
    //    explicando o motivo ("header ausente" versus "segredo inválido") entregaria
    //    ao atacante a informação que o status genérico existe para esconder. Sem
    //    esta asserção, essa regressão passaria despercebida — o status continuaria
    //    401 nos dois casos.
    expect((await semSegredo.text()).trim()).toBe("");

    // 2. Segredo errado do MESMO comprimento do correto.
    const segredoErrado = await chamarWorker(request, SEGREDO_ERRADO);
    expect(segredoErrado.status()).toBe(401);
    expect((await segredoErrado.text()).trim()).toBe("");

    // 3. Segredo correto. `status()` igual a 200 EXATAMENTE, e não `ok()`: `ok()`
    //    aceita qualquer 2xx-3xx, e um redirect aqui seria um job de cron que não
    //    executa nada. É a mesma razão de `ROTA` não ter barra final.
    const autorizado = await chamarWorker(request, SEGREDO);
    expect(autorizado.status()).toBe(200);
  });

  test("aplica a transição pendente de uma empresa que ninguém logou, e é idempotente (WRK-01)", async ({
    page,
    request,
  }) => {
    // 1. A empresa nasce em TRIAL, com `ultimoStatusAuditado` alinhado pelo próprio
    //    registro. Depois desta linha, nenhum request autenticado é feito por ela.
    const { slug } = await registrarPelaUI(page);

    // 2. Chamada de DRENAGEM. Assenta qualquer transição pendente deixada por
    //    outros specs ou por execuções anteriores contra este mesmo banco local,
    //    para as contagens dos passos 4 e 5 serem atribuíveis só à empresa deste
    //    teste.
    const drenagem = await chamarWorker(request, SEGREDO);
    expect(drenagem.status()).toBe(200);

    //    `disparou` verdadeiro AQUI não é bug do worker: significa que o banco
    //    local acumulou 5 ou mais perdas de acesso pendentes, e o freio de
    //    segurança suprimiu todas elas — deixando o passo 4 sem chão. A correção é
    //    recriar o banco de e2e, NUNCA relaxar esta asserção.
    expect((await drenagem.json()).freio.disparou).toBe(false);

    // 3. A ÚNICA forma de produzir uma transição pendente: os fatos derivam
    //    BLOQUEADO enquanto `ultimoStatusAuditado` fica em TRIAL. Sem o
    //    desalinhamento, o seed deixaria a empresa já auditada como BLOQUEADO e os
    //    passos abaixo mediriam zero contra um worker de qualquer qualidade.
    seedFatosBilling(slug, "bloqueado", { auditado: "trial" });

    // 4. Chamada de APLICAÇÃO. Uma empresa que ninguém tocou é transicionada por
    //    uma chamada HTTP — WRK-01.
    const aplicacao = await chamarWorker(request, SEGREDO);
    expect(aplicacao.status()).toBe(200);

    const corpoAplicacao = await aplicacao.json();
    expect(corpoAplicacao.transicoesDetectadas).toBe(1);
    expect(corpoAplicacao.aplicadas).toBe(1);
    expect(corpoAplicacao.erros).toHaveLength(0);

    //    1 perda absoluta está abaixo do piso, então o freio não arma. Este assert é
    //    também a prova ponta a ponta do piso: sem ele, o freio percentual sozinho
    //    consideraria "1 de poucas empresas" uma catástrofe e suprimiria a única
    //    transição legítima — o worker nunca bloquearia ninguém num banco pequeno.
    expect(corpoAplicacao.freio.disparou).toBe(false);

    // 5. Chamada de IDEMPOTÊNCIA: critério de sucesso #2 do roadmap medido contra
    //    Postgres real. A segunda execução não penaliza ninguém de novo — não
    //    porque exista um registro de execução, mas porque o status já auditado
    //    passou a coincidir com o derivado.
    const idempotencia = await chamarWorker(request, SEGREDO);
    expect(idempotencia.status()).toBe(200);

    const corpoIdempotencia = await idempotencia.json();
    expect(corpoIdempotencia.transicoesDetectadas).toBe(0);
    expect(corpoIdempotencia.aplicadas).toBe(0);

    // 6. Corroboração visível. ATENÇÃO: este passo sozinho NÃO prova NADA sobre o
    //    worker. A Fase 4 re-deriva o status a cada request a partir dos fatos, então
    //    a empresa apareceria bloqueada aqui mesmo que o worker jamais tivesse
    //    rodado. Ele está no spec só para mostrar que o estado que o worker gravou é
    //    coerente com o que o usuário vê. A prova do worker são as contagens dos
    //    passos 4 e 5.
    await page.goto(`/${slug}/admin`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/admin/bloqueado$`));
  });
});
