/**
 * Os gates estáticos da Fase 4 (aplicação do bloqueio) como código executável.
 *
 * POR QUE ISTO EXISTE: até esta fase, os gates deste projeto viviam como prosa
 * nos documentos de planejamento — `04-RESEARCH.md` §Validation Architecture
 * lista quatro deles como linhas de `grep` dentro de uma tabela markdown. Prosa
 * não roda no CI. Um gate que ninguém executa não é um gate: é uma intenção
 * documentada, e a diferença só aparece no dia em que alguém viola a regra e
 * nada acontece. Este arquivo transforma as intenções em `npm run gates:fase-04`.
 *
 * REGRA TRANSVERSAL DE HIGIENE: antes de contar ocorrências dentro de um arquivo
 * de código, as linhas de comentário são descartadas. Sem isso os gates se
 * auto-invalidariam — os JSDoc normativos escritos nesta fase citam LITERALMENTE
 * os identificadores proibidos para explicar por que são proibidos (veja
 * `lib/api-auth.ts`, `lib/empresa-publicavel.ts` e `app/[slug]/_lib/empresa.ts`).
 * Um gate que conta comentários prova o oposto do que pretende: ele ficaria
 * vermelho justamente porque o código documenta a proibição corretamente.
 *
 * SEGUNDA CAMADA DA MESMA DEFESA: os identificadores proibidos são montados por
 * concatenação (`"unstable" + "_cache"`) em vez de escritos inteiros. Hoje
 * nenhum gate varre `scripts/`, então não seria necessário; a concatenação existe
 * para que ampliar o escopo de um gate no futuro não transforme este arquivo na
 * primeira violação que ele mesmo reporta. Não é obfuscação — é a convenção do
 * arquivo, aplicada nos três lugares que declaram uma agulha proibida.
 *
 * CÓDIGO DE SAÍDA: 1 a partir da primeira violação. Os gates seguintes ainda
 * rodam de propósito — quem acabou de quebrar o build quer ver a lista inteira
 * de uma vez, não descobrir a segunda falha só depois de corrigir a primeira.
 *
 * Escopo: análise estática do repositório. Não abre banco, não sobe servidor,
 * não instala nada. Sem dependência externa — só `node:fs` e `node:path`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");

let houveFalha = false;

function ok(gate, detalhe) {
  console.log(`OK    ${gate}${detalhe ? ` — ${detalhe}` : ""}`);
}

function falha(gate, motivo, evidencias = []) {
  houveFalha = true;
  process.exitCode = 1;
  console.error(`FALHA ${gate} — ${motivo}`);
  for (const evidencia of evidencias) {
    console.error(`        ${evidencia}`);
  }
}

/**
 * Linhas de código do arquivo, já sem as de comentário, cada uma com o número
 * original para que a evidência de falha aponte a linha real do arquivo.
 *
 * Heurística deliberadamente de linha inteira (e não um parser): descarta as
 * linhas que, após `trim`, começam com `//`, com `/*` ou com um asterisco — este
 * último cobre tanto a continuação quanto a linha de fechamento de um bloco
 * JSDoc. É o formato em que 100% dos comentários deste projeto são escritos, e
 * um parser seria uma dependência nova — exatamente o que o Gate 6 proíbe nesta
 * fase.
 */
function linhasDeCodigo(caminhoRelativo) {
  const conteudo = readFileSync(path.join(RAIZ, caminhoRelativo), "utf8");

  return conteudo
    .split("\n")
    .map((texto, indice) => ({ numero: indice + 1, texto }))
    .filter(({ texto }) => {
      const limpo = texto.trim();

      return !(
        limpo.startsWith("//") ||
        limpo.startsWith("*") ||
        limpo.startsWith("/*")
      );
    });
}

/** Linhas de CÓDIGO (nunca de comentário) que contêm qualquer uma das agulhas. */
function ocorrencias(caminhoRelativo, agulhas) {
  return linhasDeCodigo(caminhoRelativo)
    .filter(({ texto }) => agulhas.some((agulha) => texto.includes(agulha)))
    .map(({ numero, texto }) => `${caminhoRelativo}:${numero}: ${texto.trim()}`);
}

/** Todos os arquivos sob um diretório, recursivamente, em caminho relativo à raiz. */
function arquivosSob(diretorioRelativo) {
  const base = path.join(RAIZ, diretorioRelativo);

  if (!existsSync(base)) return [];

  return readdirSync(base, { withFileTypes: true, recursive: true })
    .filter((entrada) => entrada.isFile())
    .map((entrada) =>
      path.relative(RAIZ, path.join(entrada.parentPath, entrada.name))
    );
}

const ehFonte = (arquivo) =>
  (arquivo.endsWith(".ts") || arquivo.endsWith(".tsx")) &&
  !path.basename(arquivo).includes(".test.");

// ---------------------------------------------------------------------------
// Gate 1 — unicidade do opt-out de bloqueio (T-04-13)
// ---------------------------------------------------------------------------
// `requireAuth({ permitirEmpresaBloqueada: true })` é a ÚNICA porta que deixa
// uma empresa bloqueada chamar uma rota autenticada. Ela existe por um motivo
// só: sem ela, quem está bloqueado não consegue abrir o checkout e portanto não
// consegue pagar para desbloquear. Um segundo uso, em qualquer outra rota, é uma
// escalada de privilégio disfarçada de conveniência — e passaria despercebida em
// code review, porque a linha é curta e parece inofensiva.
const ROTA_DE_CHECKOUT = "app/api/assinaturas/checkout/route.ts";

function gate1() {
  const nome = "Gate 1 (unicidade de permitirEmpresaBloqueada)";
  const encontrados = arquivosSob("app")
    .filter(ehFonte)
    .filter((arquivo) => ocorrencias(arquivo, ["permitirEmpresaBloqueada"]).length > 0);

  if (encontrados.length === 1 && encontrados[0] === ROTA_DE_CHECKOUT) {
    return ok(nome, `só em ${ROTA_DE_CHECKOUT}`);
  }

  falha(
    nome,
    `esperado exatamente 1 arquivo (${ROTA_DE_CHECKOUT}), encontrados ${encontrados.length}`,
    [
      ...encontrados,
      "O opt-out de bloqueio existe só para o checkout: é o único caminho que uma",
      "empresa bloqueada precisa percorrer para voltar a pagar. Qualquer outro uso",
      "é escalada de privilégio (T-04-13).",
    ]
  );
}

// ---------------------------------------------------------------------------
// Gate 2 — nenhum cache cross-request no caminho da guarda (T-04-08)
// ---------------------------------------------------------------------------
// ACC-04 exige reativação no request SEGUINTE ao pagamento. Um cache que
// atravessa requests congela a decisão de autorização: a empresa paga, o webhook
// grava o novo `acessoAte`, e o usuário continua bloqueado até o cache expirar.
// O cache de request do React (`cache()`) é permitido e usado de propósito — ele
// morre no fim do request. Os proibidos abaixo, não.
const ARQUIVOS_DA_GUARDA = [
  "lib/auth-guard.ts",
  "lib/session.ts",
  "lib/api-auth.ts",
  "lib/empresa-publicavel.ts",
  "app/services/empresa.service.ts",
  "app/services/produto.service.ts",
  "app/services/combo.service.ts",
  "app/[slug]/_lib/empresa.ts",
];

// Montadas por concatenação para que o próprio gate não seja a nona ocorrência
// literal do identificador que ele proíbe — este arquivo não está na lista
// acima, mas manter o hábito evita que uma futura ampliação da lista se
// auto-invalide.
const CACHES_PROIBIDOS = ["unstable" + "_cache", "use" + " cache"];

function gate2() {
  const nome = "Gate 2 (nenhum cache cross-request na guarda)";
  const ausentes = ARQUIVOS_DA_GUARDA.filter(
    (arquivo) => !existsSync(path.join(RAIZ, arquivo))
  );

  if (ausentes.length > 0) {
    return falha(nome, "arquivo da guarda não encontrado", [
      ...ausentes,
      "Se o arquivo foi renomeado, atualize ARQUIVOS_DA_GUARDA — não remova a entrada.",
    ]);
  }

  const violacoes = ARQUIVOS_DA_GUARDA.flatMap((arquivo) =>
    ocorrencias(arquivo, CACHES_PROIBIDOS)
  );

  if (violacoes.length === 0) {
    return ok(nome, `${ARQUIVOS_DA_GUARDA.length} arquivos limpos`);
  }

  falha(nome, "cache cross-request no caminho de autorização", [
    ...violacoes,
    "A decisão de acesso tem que ser tomada a cada request (ACC-04). Só o cache de",
    "request do React é permitido aqui — ele morre no fim do request.",
  ]);
}

// ---------------------------------------------------------------------------
// Gate 3 — nenhum loading.tsx / template.tsx sob o catálogo (T-04-01)
// ---------------------------------------------------------------------------
const SEGMENTO_CATALOGO = "app/[slug]/(catalogo)";

function gate3() {
  const nome = "Gate 3 (sem loading/template no catálogo)";
  const encontrados = arquivosSob(SEGMENTO_CATALOGO).filter((arquivo) => {
    const base = path.basename(arquivo);

    return base.startsWith("loading.") || base.startsWith("template.");
  });

  if (encontrados.length === 0) {
    return ok(nome, `${SEGMENTO_CATALOGO} sem boundary de streaming`);
  }

  falha(nome, "boundary de streaming sob o catálogo público", [
    ...encontrados,
    "`notFound()` devolve 404 numa resposta não-streaming e 200 numa resposta",
    "streaming. Acrescentar um desses arquivos a este segmento transformaria",
    "silenciosamente o 404 do catálogo bloqueado num 200 — o catálogo de uma",
    "empresa inadimplente voltaria a ser indexável, sem nenhuma outra mudança.",
  ]);
}

// ---------------------------------------------------------------------------
// Gate 4 — banner de cobrança nunca no catálogo público (D-02 / T-04-19)
// ---------------------------------------------------------------------------
// O banner é assunto interno entre o SaaS e a empresa. Vazá-lo para o catálogo
// significa contar ao cliente final da loja que a loja está devendo.
const BANNER_PROIBIDO = ["Aviso" + "Carencia", "aviso-" + "carencia"];

function gate4() {
  const nome = "Gate 4 (banner fora do catálogo público)";
  const violacoes = arquivosSob(SEGMENTO_CATALOGO)
    .filter(ehFonte)
    .flatMap((arquivo) => ocorrencias(arquivo, BANNER_PROIBIDO));

  if (violacoes.length === 0) {
    return ok(nome, `${SEGMENTO_CATALOGO} sem referência ao banner`);
  }

  falha(nome, "banner de cobrança referenciado no catálogo público", [
    ...violacoes,
    "O aviso de carência é conversa entre o SaaS e a empresa (D-02). No catálogo",
    "ele conta ao cliente final que a loja está inadimplente.",
  ]);
}

// ---------------------------------------------------------------------------
// Gate 5 — enumeração dos entrypoints públicos de leitura (T-04-03)
// ---------------------------------------------------------------------------
// §Achado crítico 1 do 04-RESEARCH.md: o CONTEXT.md enumerava CINCO caminhos
// públicos; existem SEIS. O sexto (`GET /api/empresas/slug/[slug]`) já havia
// sido identificado numa pesquisa anterior e não sobreviveu até o documento da
// fase. Uma lista em prosa esquece; esta lista falha o build.
const ENTRYPOINTS_PUBLICOS = [
  "app/[slug]/(catalogo)/page.tsx",
  "app/[slug]/(catalogo)/layout.tsx",
  "app/api/empresas/slug/[slug]/route.ts",
  "app/api/catalogo/produtos/route.ts",
  "app/api/catalogo/produtos/[id]/route.ts",
  "app/api/catalogo/combos/route.ts",
  "app/api/catalogo/combos/[id]/route.ts",
];

const DIRETORIOS_PUBLICOS = ["app/api/catalogo", "app/api/empresas/slug"];

// Resolvia um slug para um id sem nenhum gate de publicabilidade — era o atalho
// que deixava uma empresa bloqueada continuar sendo alcançável por id. Removido
// na fase; o gate impede que volte.
const HELPER_BANIDO = "resolve" + "IdBySlug";

function gate5() {
  const nome = "Gate 5 (entrypoints públicos enumerados)";
  const novos = DIRETORIOS_PUBLICOS.flatMap(arquivosSob)
    .filter((arquivo) => path.basename(arquivo) === "route.ts")
    .filter((arquivo) => !ENTRYPOINTS_PUBLICOS.includes(arquivo));

  if (novos.length > 0) {
    falha(nome, "caminho público novo fora da lista enumerada", [
      ...novos,
      "Um caminho público novo nasceu — confirme que ele passa por `findPublicavel*`",
      "antes de acrescentá-lo a ENTRYPOINTS_PUBLICOS. A lista existe porque o",
      "CONTEXT.md desta fase já perdeu um dos seis caminhos existentes.",
    ]);
  }

  const ausentes = ENTRYPOINTS_PUBLICOS.filter(
    (arquivo) => !existsSync(path.join(RAIZ, arquivo))
  );

  if (ausentes.length > 0) {
    falha(nome, "entrypoint público enumerado não existe mais", [
      ...ausentes,
      "Se o caminho foi removido de propósito, remova-o também de ENTRYPOINTS_PUBLICOS.",
    ]);
  }

  const ressurgido = [...arquivosSob("app"), ...arquivosSob("lib")]
    .filter(ehFonte)
    .flatMap((arquivo) => ocorrencias(arquivo, [HELPER_BANIDO]));

  if (ressurgido.length > 0) {
    falha(nome, `${HELPER_BANIDO} voltou a aparecer`, [
      ...ressurgido,
      "Ele resolvia slug → id sem nenhum gate de publicabilidade, o que deixava a",
      "empresa bloqueada alcançável por id. Use `findPublicavel*`.",
    ]);
  }

  if (novos.length === 0 && ausentes.length === 0 && ressurgido.length === 0) {
    ok(nome, `${ENTRYPOINTS_PUBLICOS.length} entrypoints, nenhum novo`);
  }
}

// ---------------------------------------------------------------------------
// Gate 6 — nenhum pacote instalado nesta fase (T-04-SC)
// ---------------------------------------------------------------------------
// Números MEDIDOS no início da Fase 4, contra o `package.json` herdado da Fase 3.
// A fase declarou explicitamente não instalar nada (04-RESEARCH.md §Standard
// Stack e §Package Legitimacy Audit): todo o enforcement é código próprio sobre
// bibliotecas que já estavam aqui.
//
// Se você chegou neste gate porque precisa mesmo de um pacote novo, este número
// NÃO é o que deve ser ajustado primeiro. Um install que aparece no meio de uma
// fase que declarou não instalar nada é o sinal exato de slopsquatting: pare,
// verifique a legitimidade do pacote no registro, e só então atualize o número
// junto com o registro da verificação.
const DEPENDENCIAS_ESPERADAS = 11;
const DEV_DEPENDENCIAS_ESPERADAS = 20;

function gate6() {
  const nome = "Gate 6 (nenhum pacote instalado na fase)";
  const manifesto = JSON.parse(
    readFileSync(path.join(RAIZ, "package.json"), "utf8")
  );
  const dependencias = Object.keys(manifesto.dependencies ?? {}).length;
  const devDependencias = Object.keys(manifesto.devDependencies ?? {}).length;

  if (
    dependencias === DEPENDENCIAS_ESPERADAS &&
    devDependencias === DEV_DEPENDENCIAS_ESPERADAS
  ) {
    return ok(nome, `${dependencias} deps / ${devDependencias} devDeps`);
  }

  falha(
    nome,
    `esperado ${DEPENDENCIAS_ESPERADAS} deps e ${DEV_DEPENDENCIAS_ESPERADAS} devDeps, ` +
      `encontrados ${dependencias} e ${devDependencias}`,
    [
      "A Fase 4 declarou não instalar nada. Um pacote novo aqui exige um ciclo de",
      "verificação de legitimidade ANTES de ajustar estes números.",
    ]
  );
}

console.log("Gates estáticos da Fase 4 (aplicação do bloqueio)\n");

gate1();
gate2();
gate3();
gate4();
gate5();
gate6();

console.log(
  houveFalha
    ? "\nResultado: FALHA — corrija as violações acima antes do merge."
    : "\nResultado: 6/6 gates OK."
);
