/**
 * Os gates estáticos da Fase 7 (gestão de assinatura) como código executável.
 *
 * POR QUE ISTO EXISTE: quatro das decisões desta fase são invisíveis em code
 * review porque a violação é uma linha CURTA E PLAUSÍVEL, e nenhuma delas quebra
 * um teste.
 *
 *   - Acrescentar um parâmetro de identificador de assinatura à action de
 *     cancelar parece completude — e abre, palavra por palavra, o IDOR
 *     cross-tenant que `PITFALLS.md` § Pitfall 11 nomeia: "one company cancels
 *     another's plan".
 *   - Acrescentar o fato de cancelamento ao allowlist de `empresaService.update`
 *     parece simetria — e abre `PATCH /api/empresas/[id]` para qualquer ADMIN
 *     autenticado gravar fatos de billing por HTTP, contornando BILL-04.
 *   - Mover a escrita local para ANTES da chamada ao gateway em `cancelar`
 *     parece "responder mais rápido" — e produz o pior estado que esta fase pode
 *     criar: a UI dizendo "assinatura cancelada" com o cartão do cliente sendo
 *     cobrado todo mês até virar chargeback (§ Pitfall 1).
 *   - Importar o cliente do gateway na action de polling parece coerência com
 *     D-02 — e multiplica 7 requisições por pagador contra uma quota de 25.000
 *     por 12 h (§ Pitfall 3) para responder a pergunta ERRADA, num instante em
 *     que o gateway nem teria como responder.
 *
 * As Fases 4, 5 e 6 resolveram exatamente esta classe de problema com
 * `scripts/gates-fase-04.mjs`, `-05` e `-06`; esta fase reusa a forma pela
 * quarta vez, com dois gates adicionais (a proibição de overlay da UI-SPEC e a
 * cadeia de suprimentos).
 *
 * ── AS TRÊS CAMADAS DE HIGIENE ────────────────────────────────────────────────
 *
 * 1. LINHAS DE COMENTÁRIO SÃO DESCARTADAS ANTES DE CONTAR (decisão `[04-09]`).
 *    Nesta fase isso não é refinamento, é CONDIÇÃO DE EXISTÊNCIA dos gates: os
 *    JSDoc normativos que os planos 07-04, 07-05 e 07-06 mandaram escrever citam
 *    LITERALMENTE cada um dos identificadores proibidos para explicar por que
 *    são proibidos. Um grep cru ficaria vermelho justamente porque o código
 *    documenta a proibição corretamente — 8 ocorrências, todas em JSDoc, medidas
 *    no momento da escrita deste arquivo.
 *
 * 2. AS AGULHAS SÃO MONTADAS POR CONCATENAÇÃO. Nenhum gate varre `scripts/`
 *    hoje, então não seria necessário; a concatenação existe para que ampliar o
 *    escopo de um gate no futuro não transforme este arquivo na primeira
 *    violação que ele mesmo reporta.
 *
 * 3. SÓ ARQUIVOS-FONTE SÃO VARRIDOS (`ehFonte` descarta `*.test.ts` e
 *    `*.test.tsx`). Obrigatório, não folga: os testes desta fase citam os
 *    identificadores proibidos DE PROPÓSITO. O caso de aridade em
 *    `assinatura/actions.test.ts` monta um `FormData` com um id de assinatura
 *    forjado para provar que a action o ignora, e o teste de
 *    `cancelar-assinatura.test.tsx` consulta o DOM pelo papel de diálogo e pelo
 *    atributo de modalidade para provar que NÃO existem. Um gate que varresse os
 *    testes acusaria como violação exatamente a prova de que a invariante é
 *    respeitada.
 *
 * CÓDIGO DE SAÍDA: 1 a partir da primeira violação. Os gates seguintes ainda
 * rodam de propósito — quem acabou de quebrar o build quer ver a lista inteira
 * de uma vez, não descobrir a segunda falha só depois de corrigir a primeira.
 *
 * ESCOPO: análise estática do repositório. Não abre banco, não sobe servidor,
 * não instala nada. Sem dependência externa — só `node:fs` e `node:path`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
 * Remove o conteúdo de comentário de UMA linha, dado o estado de bloco herdado da
 * linha anterior. Devolve o resíduo de código e o estado para a linha seguinte.
 *
 * POR QUE UM VARREDOR DE ESTADO, E NÃO O TESTE DE PREFIXO DAS FASES 4-6: aquele
 * teste descartava a linha inteira quando ela COMEÇAVA com uma das três marcas
 * de abertura, o que cobre comentário de linha e bloco JSDoc — mas NÃO cobre o
 * comentário JSX, cuja primeira linha começa com uma chave e cujas continuações
 * começam com prosa. Esta fase tem componentes de React com blocos JSX longos e
 * normativos, e o primeiro rascunho do Gate 1 acusou como violação a linha 229 de
 * `assinatura-card.tsx` — que é prosa dentro de um comentário JSX explicando por
 * que o identificador ali citado NÃO pode aparecer no código. Reescrever a prosa
 * para não mover contador de grep é a saída que o SUMMARY do plano 06-07 já
 * registrou como insustentável; a saída certa é o gate entender as três formas
 * de comentário que o projeto usa.
 *
 * LIMITAÇÕES CONHECIDAS E ACEITAS (um parser de verdade seria uma dependência
 * nova, exatamente o que o Gate 6 proíbe):
 *   - um `/*` dentro de string literal abriria um bloco falso. Nenhum arquivo
 *     varrido escreve isso hoje.
 *   - `//` precedido de `:` é tratado como parte de URL, e não como início de
 *     comentário — sem essa exceção, uma linha com `https://…` teria o resto
 *     descartado e uma agulha depois dela passaria despercebida.
 */
function semComentarios(texto, dentroDeBloco) {
  let dentro = dentroDeBloco;
  let codigo = "";
  let i = 0;

  while (i < texto.length) {
    if (dentro) {
      if (texto.startsWith("*/", i)) {
        dentro = false;
        i += 2;
        continue;
      }

      i += 1;
      continue;
    }

    if (texto.startsWith("/*", i)) {
      dentro = true;
      i += 2;
      continue;
    }

    if (texto.startsWith("//", i) && texto[i - 1] !== ":") {
      break;
    }

    codigo += texto[i];
    i += 1;
  }

  return { codigo, dentro };
}

/**
 * Linhas de CÓDIGO do arquivo — as de comentário desaparecem, e as mistas ficam
 * só com o resíduo de código. Cada linha carrega o número ORIGINAL, para que a
 * evidência de falha aponte a linha real do arquivo, e o texto original, para que
 * a evidência seja legível.
 *
 * Descartar comentários antes de contar é a decisão `[04-09]`, e nesta fase é
 * condição de existência dos gates: os JSDoc normativos citam literalmente cada
 * identificador proibido para explicar por que é proibido.
 */
function linhasDeCodigo(caminhoRelativo) {
  const conteudo = readFileSync(path.join(RAIZ, caminhoRelativo), "utf8");

  let dentroDeBloco = false;

  return conteudo
    .split("\n")
    .map((texto, indice) => {
      const { codigo, dentro } = semComentarios(texto, dentroDeBloco);
      dentroDeBloco = dentro;

      return { numero: indice + 1, texto, codigo };
    })
    .filter(({ codigo }) => codigo.trim().length > 0);
}

/** Linhas de CÓDIGO (nunca de comentário) que contêm qualquer uma das agulhas. */
function ocorrencias(caminhoRelativo, agulhas) {
  return linhasDeCodigo(caminhoRelativo)
    .filter(({ codigo }) => agulhas.some((agulha) => codigo.includes(agulha)))
    .map(({ numero, texto }) => `${caminhoRelativo}:${numero}: ${texto.trim()}`);
}

/**
 * Igual à função acima, mas ignorando caixa.
 *
 * Usada só pelo Gate 1: ali a agulha é um NOME DE IDENTIFICADOR, e quem
 * reintroduzir a violação pode escrevê-la em qualquer convenção de caixa
 * (`...Id`, `...ID`, `...id`). Nos demais gates a agulha é um trecho literal de
 * chamada ou de classe de CSS, onde a caixa é parte do contrato e afrouxá-la só
 * produziria falso positivo.
 */
function ocorrenciasIgnorandoCaixa(caminhoRelativo, agulhas) {
  const alvos = agulhas.map((agulha) => agulha.toLowerCase());

  return linhasDeCodigo(caminhoRelativo)
    .filter(({ codigo }) => alvos.some((alvo) => codigo.toLowerCase().includes(alvo)))
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

const segmentos = (arquivo) => arquivo.split(path.sep);

/**
 * Linhas de CÓDIGO do corpo de um método de classe, da linha seguinte à
 * assinatura até a chave de fechamento na indentação de dois espaços.
 *
 * Devolve `null` quando a assinatura não é encontrada — e isso é FALHA, não
 * sucesso: renomear o método não pode desligar a checagem em silêncio. É a mesma
 * disciplina de `camposDaInterface` da Fase 6.
 */
function corpoDoMetodo(caminhoRelativo, assinatura) {
  const linhas = linhasDeCodigo(caminhoRelativo);
  const inicio = linhas.findIndex(({ codigo }) => codigo.includes(assinatura));

  if (inicio === -1) return null;

  const corpo = [];

  for (const linha of linhas.slice(inicio + 1)) {
    if (/^\s{2}\}\s*$/.test(linha.codigo)) return corpo;
    corpo.push(linha);
  }

  return null;
}

/**
 * Linhas de campo do corpo de uma interface, em linhas de código. Devolve `null`
 * quando a interface não é encontrada — pelo mesmo motivo de `corpoDoMetodo`.
 * Copiada de `gates-fase-06.mjs`.
 */
function camposDaInterface(caminhoRelativo, nomeDaInterface) {
  const linhas = linhasDeCodigo(caminhoRelativo);
  const inicio = linhas.findIndex(({ codigo }) =>
    codigo.includes(`interface ${nomeDaInterface}`)
  );

  if (inicio === -1) return null;

  const campos = [];

  for (const linha of linhas.slice(inicio + 1)) {
    if (linha.codigo.trim().startsWith("}")) return campos;
    campos.push(linha);
  }

  return null;
}

/** Confere que os arquivos nomeados por um gate ainda existem. */
function ausentes(arquivos) {
  return arquivos.filter((arquivo) => !existsSync(path.join(RAIZ, arquivo)));
}

// ---------------------------------------------------------------------------
// Gate 1 — nenhum identificador de assinatura atravessa a fronteira
//          cliente→servidor (D-05 / § Pitfall 11, T-07-40)
// ---------------------------------------------------------------------------
// A defesa de D-05 não é uma checagem — é uma AUSÊNCIA. `cancelarAssinatura` tem
// aridade 1, e o único argumento é o `slug`, que serve exclusivamente para
// confirmar que a sessão pertence a ESTA empresa. O `empresaId` sai de
// `getVerifiedSession()` e o identificador da assinatura no gateway é lido da
// própria Empresa, já dentro do service. Nenhum id vem do cliente.
//
// É essa ausência que torna seguro ler o 404 do `DELETE` do Asaas como "já
// removida": a doc do fornecedor usa o mesmo 404 para "não existe" e para "não
// pertence à conta autenticada", e o segundo caso é inalcançável POR CONSTRUÇÃO
// justamente porque o id nunca veio de fora.
//
// ESCOPO — a camada de FRONTEIRA, e não a árvore inteira do admin: arquivos de
// action, de `_lib/` e de `_components/`. As `page.tsx` ficam DE FORA de
// propósito, e não por conveniência: `assinatura/page.tsx` lê
// `fatos.asaasSubscriptionId` do resultado do service para escolher o ramo da
// ordem normativa, o que é uma leitura de fato LOCAL no servidor — o oposto
// exato do que este gate proíbe. Incluí-la produziria um falso positivo
// permanente sobre a linha que implementa a decisão corretamente.
const AGULHAS_DE_ID_DE_ASSINATURA = [
  "assinatura" + "Id",
  "subscription" + "Id",
  "customer" + "Id",
];

// Ler o corpo do request numa action da fase é a OUTRA forma do mesmo furo: com
// `formData` em mãos, o id volta a atravessar a fronteira sem que nenhum
// parâmetro nomeado apareça na assinatura da função. As duas actions abaixo
// recebem `FormData` do React por construção e NUNCA podem lê-lo.
const AGULHA_DE_CORPO_DE_REQUEST = "formData" + ".get(";

const ACTIONS_DA_FASE = [
  "app/[slug]/admin/(protected)/assinatura/actions.ts",
  "app/[slug]/admin/_lib/assinatura-actions.ts",
];

function gate1() {
  const nome = "Gate 1 (nenhum id de assinatura atravessa a fronteira cliente→servidor)";

  const escopo = arquivosSob("app/[slug]/admin")
    .filter(ehFonte)
    .filter((arquivo) => {
      const partes = segmentos(arquivo);

      return (
        path.basename(arquivo) === "actions.ts" ||
        partes.includes("_lib") ||
        partes.includes("_components")
      );
    });

  const violacoes = escopo.flatMap((arquivo) =>
    ocorrenciasIgnorandoCaixa(arquivo, AGULHAS_DE_ID_DE_ASSINATURA)
  );

  if (violacoes.length > 0) {
    falha(nome, "identificador de billing nomeado na camada de fronteira", [
      ...violacoes,
      "§ Pitfall 11 nomeia o cenário palavra por palavra: uma action de cancelar",
      "que aceita o id do corpo do formulário em vez de derivá-lo de",
      "`session.empresaId` deixa uma empresa cancelar o plano de outra. O id sai",
      "da sessão no servidor e de mais lugar nenhum — a defesa é a AUSÊNCIA do",
      "parâmetro, não uma checagem que alguém possa esquecer de escrever.",
    ]);
  }

  const semArquivo = ausentes(ACTIONS_DA_FASE);

  if (semArquivo.length > 0) {
    falha(nome, "action da fase não existe mais", [
      ...semArquivo,
      "Se o arquivo foi renomeado ou movido, atualize ACTIONS_DA_FASE — não",
      "remova a entrada. Uma action que o gate não acha é uma action que ninguém",
      "verifica.",
    ]);
  }

  const corpoLido = ACTIONS_DA_FASE.filter((arquivo) =>
    existsSync(path.join(RAIZ, arquivo))
  ).flatMap((arquivo) => ocorrencias(arquivo, [AGULHA_DE_CORPO_DE_REQUEST]));

  if (corpoLido.length > 0) {
    falha(nome, "action da fase lendo o corpo do request", [
      ...corpoLido,
      "O React entrega um `FormData` junto do argumento vinculado; ele NUNCA é",
      "lido. Ler o corpo é a outra forma do mesmo furo — o id volta a atravessar",
      "a fronteira sem aparecer na assinatura da função.",
    ]);
  }

  if (violacoes.length === 0 && semArquivo.length === 0 && corpoLido.length === 0) {
    ok(nome, `${escopo.length} fontes de fronteira, ${ACTIONS_DA_FASE.length} actions da fase`);
  }
}

// ---------------------------------------------------------------------------
// Gate 2 — os 4 fatos de billing continuam fora do allowlist de
//          `empresaService.update` (BILL-04 / decisão [02-02], T-07-41)
// ---------------------------------------------------------------------------
// `app/api/empresas/[id]/route.ts` repassa o body CRU do request (`await
// request.json()`) para `update`. `UpdateEmpresaDTO` é tipo de compilação: ele é
// apagado no build e não filtra nada em runtime. O que protege é a lista
// positiva dentro do método — e o ataque não é cross-tenant, é o ADMIN
// escrevendo na PRÓPRIA empresa, contra o qual o check `id !== auth.empresaId`
// do route handler não faz nada.
//
// Esta fase é justamente a que passou a gravar o fato de cancelamento, e fez isso
// com `prisma.empresa.update` direto dentro de `assinaturaService.cancelar` — não
// por descuido, mas para não tocar neste allowlist. O precedente é
// `webhookAsaasService.capturarAssinatura`, que grava pelo mesmo caminho e pela
// mesma razão.
//
// ESCOPO — o corpo do método e os campos do DTO, e não o arquivo inteiro:
// `empresa.service.ts` cita os quatro fatos em projeções `select` legítimas
// (branding público, dados de header, registro com trial). Varrer o arquivo todo
// seria um falso positivo permanente sobre código correto.
const AGULHAS_DE_FATO_DE_BILLING = [
  "cancelado" + "Em",
  "acesso" + "Ate",
  "trial" + "Fim",
  "acesso" + "Vitalicio",
];

const SERVICE_DE_EMPRESA = "app/services/empresa.service.ts";
const METODO_DE_UPDATE = "async update(id: string";
const DTO_DE_UPDATE = "UpdateEmpresaDTO";

function gate2() {
  const nome = "Gate 2 (fatos de billing fora do allowlist de update)";

  const corpo = corpoDoMetodo(SERVICE_DE_EMPRESA, METODO_DE_UPDATE);

  if (corpo === null) {
    return falha(nome, `método \`update\` não encontrado em ${SERVICE_DE_EMPRESA}`, [
      "Se o método foi renomeado ou movido, atualize METODO_DE_UPDATE — não",
      "remova a checagem. Um allowlist que o gate não acha é um allowlist que",
      "ninguém verifica.",
    ]);
  }

  const campos = camposDaInterface(SERVICE_DE_EMPRESA, DTO_DE_UPDATE);

  if (campos === null) {
    return falha(nome, `interface ${DTO_DE_UPDATE} não encontrada em ${SERVICE_DE_EMPRESA}`, [
      "Se o DTO foi renomeado ou movido, atualize DTO_DE_UPDATE — não remova a",
      "checagem.",
    ]);
  }

  const violacoes = [...corpo, ...campos]
    .filter(({ codigo }) =>
      AGULHAS_DE_FATO_DE_BILLING.some((agulha) => codigo.includes(agulha))
    )
    .map(({ numero, texto }) => `${SERVICE_DE_EMPRESA}:${numero}: ${texto.trim()}`);

  if (violacoes.length === 0) {
    return ok(
      nome,
      `${corpo.length} linhas do allowlist e ${campos.length} campos do DTO, sem fato de billing`
    );
  }

  falha(nome, "fato de billing gravável por HTTP", [
    ...violacoes,
    "`app/api/empresas/[id]/route.ts` repassa o body CRU do request para este",
    "método, e o DTO é apagado no build — só a lista positiva filtra em runtime.",
    "Com o campo aqui, qualquer ADMIN autenticado se daria acesso vitalício (ou",
    "cancelaria a si mesmo) por HTTP, contornando BILL-04. Quem precisa gravar",
    "esses fatos escreve direto pelo service do domínio, como",
    "`assinaturaService.cancelar` e `webhookAsaasService.capturarAssinatura`.",
  ]);
}

// ---------------------------------------------------------------------------
// Gate 3 — em `cancelar`, o gateway vem ANTES do banco (D-04, T-07-42)
// ---------------------------------------------------------------------------
// A ordem é NORMATIVA e a inversão é uma linha que parece uma otimização. O
// estado que ela produz é o pior que esta fase pode criar: o fato de cancelamento
// gravado, a tela dizendo "Cancelada", e o cartão do cliente continuando a ser
// cobrado todo mês até virar chargeback (§ Pitfall 1). Nenhum teste de unidade
// pega isso — os dois passos continuam acontecendo, só que na ordem errada.
//
// Este gate compara ÍNDICES DE LINHA dentro do método, e por isso é uma checagem
// de ORDEM e não de presença: ele complementa a asserção de ausência de escrita
// antes do gateway que o plano 07-04 deixou em `assinatura.service.test.ts`.
const SERVICE_DE_ASSINATURA = "app/services/assinatura.service.ts";
const METODO_DE_CANCELAR = "async cancelar(empresaId";
const AGULHA_DE_REMOCAO_NO_GATEWAY = "asaasClient" + ".removerAssinatura";
const AGULHA_DE_ESCRITA_LOCAL = "prisma" + ".empresa.update";

function gate3() {
  const nome = "Gate 3 (em `cancelar`, o gateway vem antes do banco)";

  const corpo = corpoDoMetodo(SERVICE_DE_ASSINATURA, METODO_DE_CANCELAR);

  if (corpo === null) {
    return falha(nome, `método \`cancelar\` não encontrado em ${SERVICE_DE_ASSINATURA}`, [
      "Se o método foi renomeado ou movido, atualize METODO_DE_CANCELAR — não",
      "remova a checagem.",
    ]);
  }

  const posicaoGateway = corpo.findIndex(({ codigo }) =>
    codigo.includes(AGULHA_DE_REMOCAO_NO_GATEWAY)
  );
  const posicaoEscrita = corpo.findIndex(({ codigo }) =>
    codigo.includes(AGULHA_DE_ESCRITA_LOCAL)
  );

  if (posicaoGateway === -1 || posicaoEscrita === -1) {
    return falha(nome, "um dos dois passos normativos sumiu de `cancelar`", [
      `remoção no gateway: ${posicaoGateway === -1 ? "AUSENTE" : `linha ${corpo[posicaoGateway].numero}`}`,
      `escrita local:      ${posicaoEscrita === -1 ? "AUSENTE" : `linha ${corpo[posicaoEscrita].numero}`}`,
      "Cancelar é parar a cobrança no gateway E registrar a intenção do usuário.",
      "Sem o primeiro passo o cartão continua sendo cobrado; sem o segundo o",
      "sistema não sabe que o cliente saiu.",
    ]);
  }

  if (posicaoGateway < posicaoEscrita) {
    return ok(
      nome,
      `gateway na linha ${corpo[posicaoGateway].numero}, banco na ${corpo[posicaoEscrita].numero}`
    );
  }

  falha(nome, "a escrita local acontece ANTES da chamada ao gateway", [
    `${SERVICE_DE_ASSINATURA}:${corpo[posicaoEscrita].numero}: ${corpo[posicaoEscrita].texto.trim()}`,
    `${SERVICE_DE_ASSINATURA}:${corpo[posicaoGateway].numero}: ${corpo[posicaoGateway].texto.trim()}`,
    "§ Pitfall 1: nesta ordem, uma falha do gateway deixa o pior estado que a",
    "fase pode produzir — a UI afirmando 'assinatura cancelada' enquanto o cartão",
    "do cliente continua sendo cobrado todo mês, até virar chargeback. A fase não",
    "tem retry nem reconciliação para desfazer isso.",
  ]);
}

// ---------------------------------------------------------------------------
// Gate 4 — a action de polling não fala com o gateway (§ Pitfall 3, T-07-43)
// ---------------------------------------------------------------------------
// A pergunta que o poller faz é "o painel já destravou?", e a resposta vem de
// fatos LOCAIS via `revalidarConta` + `acessoBloqueado`. Consultar o gateway a
// cada tick seria errado duas vezes, de forma independente:
//
//   (a) VOLUME: 7 tentativas por pagador que volta do checkout, contra uma quota
//       de 25.000 requisições por 12 h. É amplificação contra um recurso de
//       terceiro que a aplicação inteira compartilha.
//   (b) SEMÂNTICA: o id da assinatura no gateway está NULO justamente nos
//       segundos em que esta action mais roda — a homologação [03-07] provou que
//       `PAYMENT_CONFIRMED` chega ANTES de `SUBSCRIPTION_CREATED`, que é quem
//       escreve o id. Consultar o gateway ali é literalmente impossível.
const ACTION_DE_POLLING = "app/[slug]/admin/_lib/assinatura-actions.ts";
const AGULHAS_DE_GATEWAY = ["asaas" + "Client", "buscar" + "Assinatura"];

function gate4() {
  const nome = "Gate 4 (a action de polling não fala com o gateway)";

  if (ausentes([ACTION_DE_POLLING]).length > 0) {
    return falha(nome, `${ACTION_DE_POLLING} não existe mais`, [
      "Se o arquivo foi renomeado ou movido, atualize ACTION_DE_POLLING — não",
      "remova a checagem.",
    ]);
  }

  const violacoes = ocorrencias(ACTION_DE_POLLING, AGULHAS_DE_GATEWAY);

  if (violacoes.length === 0) {
    return ok(nome, "o polling responde por fatos locais");
  }

  falha(nome, "o arquivo da action de polling toca o gateway", [
    ...violacoes,
    "São 7 tentativas por pagador que volta do checkout, contra uma quota de",
    "25.000 requisições por 12 h — e para responder a pergunta ERRADA. O id da",
    "assinatura no gateway está nulo exatamente nesse instante (§ Achado 2), de",
    "modo que a consulta nem teria o que consultar. A pergunta certa é 'o painel",
    "já destravou?', e ela se responde com `revalidarConta` + `acessoBloqueado`.",
  ]);
}

// ---------------------------------------------------------------------------
// Gate 5 — nem overlay, nem uma segunda fonte de data (UI-SPEC, T-07-46)
// ---------------------------------------------------------------------------
// (a) OVERLAY. D-03 pede "modal"; a UI-SPEC entrega a SUBSTÂNCIA — confirmação
//     explícita, dois cliques, data exata visível antes do segundo — trocando a
//     view no lugar de sobrepô-la. O projeto tem ZERO overlays e já tem este
//     padrão em `confirmar-remocao.tsx`. Um overlay de verdade é um SISTEMA
//     (focus trap, scroll lock, Escape, return-focus, portal, background inert):
//     construí-lo pela metade produz uma armadilha de acessibilidade, e
//     construí-lo inteiro é inventar um design system dentro de uma fase que
//     declinou explicitamente inventar um.
//
// (b) DATA EM COMPONENTE. `lib/avaliar-acesso.ts` e `lib/fuso-sao-paulo.ts` são
//     os donos ÚNICOS da derivação e da formatação de data desta fase. Os fatos
//     de billing são limites superiores EXCLUSIVOS: renderizar o valor cru diria
//     "ativo até 15/10" num dia em que o usuário já não tem nada, e formatar sem
//     fuso desliza mais um dia de calendário em qualquer servidor fora de São
//     Paulo. Os dois erros são invisíveis em code review e visíveis para todo
//     usuário. O componente recebe a string JÁ PRONTA — se ele puder construir
//     uma data, alguém vai construir.
const AGULHAS_DE_OVERLAY = [
  "role=" + '"dialog"',
  "aria-" + "modal",
  "create" + "Portal",
  "fixed inset-" + "0",
];

const AGULHAS_DE_DATA = ["new Date" + "(", "Intl" + "."];

const ROTA_NOVA_DA_FASE = "app/[slug]/admin/(protected)/assinatura";
const COMPONENTE_NOVO_DA_FASE = "app/[slug]/admin/_components/poller-de-status.tsx";

function gate5() {
  const nome = "Gate 5 (nem overlay, nem segunda fonte de data nos arquivos novos)";

  if (ausentes([COMPONENTE_NOVO_DA_FASE]).length > 0) {
    return falha(nome, `${COMPONENTE_NOVO_DA_FASE} não existe mais`, [
      "Se o arquivo foi renomeado ou movido, atualize COMPONENTE_NOVO_DA_FASE —",
      "não remova a entrada.",
    ]);
  }

  const escopo = [...arquivosSob(ROTA_NOVA_DA_FASE), COMPONENTE_NOVO_DA_FASE].filter(ehFonte);

  if (escopo.length === 0) {
    return falha(nome, `nenhuma fonte encontrada sob ${ROTA_NOVA_DA_FASE}`, [
      "Um gate que varre zero arquivos passa contra qualquer código. Se a rota",
      "mudou de lugar, atualize ROTA_NOVA_DA_FASE.",
    ]);
  }

  const componentes = escopo.filter((arquivo) => segmentos(arquivo).includes("_components"));

  const overlays = escopo.flatMap((arquivo) => ocorrencias(arquivo, AGULHAS_DE_OVERLAY));

  if (overlays.length > 0) {
    falha(nome, "marcador de overlay numa superfície da fase", [
      ...overlays,
      "A confirmação de cancelamento é uma SUBSTITUIÇÃO de view, não um overlay —",
      "o mesmo padrão de `confirmar-remocao.tsx`, e o projeto não tem nenhum",
      "overlay. Um overlay de verdade é um sistema inteiro (focus trap, scroll",
      "lock, Escape, return-focus, portal, background inert); pela metade, é uma",
      "armadilha de acessibilidade.",
    ]);
  }

  const datas = componentes.flatMap((arquivo) => ocorrencias(arquivo, AGULHAS_DE_DATA));

  if (datas.length > 0) {
    falha(nome, "componente derivando ou formatando data por conta própria", [
      ...datas,
      "`lib/avaliar-acesso.ts` e `lib/fuso-sao-paulo.ts` são os donos únicos disso.",
      "Os fatos de billing são limites superiores EXCLUSIVOS e o fuso é",
      "`America/Sao_Paulo`: as duas metades do erro são invisíveis em code review",
      "e visíveis para todo usuário. O componente recebe a string já pronta.",
    ]);
  }

  if (overlays.length === 0 && datas.length === 0) {
    ok(nome, `${escopo.length} fontes da fase, ${componentes.length} delas componentes`);
  }
}

// ---------------------------------------------------------------------------
// Gate 6 — nenhum pacote instalado nesta fase (T-07-SC)
// ---------------------------------------------------------------------------
// Números MEDIDOS no início da Fase 7, contra o `package.json` herdado INALTERADO
// da Fase 6 (que já os verificava com os mesmos valores). A fase declarou
// explicitamente não instalar nada: a § Package Legitimacy Audit de
// `07-RESEARCH.md` está VAZIA — nenhum pacote `[ASSUMED]`, nenhum `[SUS]`,
// nenhum `[SLOP]` —, de modo que o gate de legitimidade é vacuamente satisfeito e
// nenhum checkpoint humano de verificação de pacote foi disparado.
//
// A TENTAÇÃO NOMEADA DESTA FASE É UMA BIBLIOTECA DE MODAL. D-03 pede "modal", e
// a resposta do projeto é o Gate 5 acima: substituição de view, com o padrão que
// já existe. Um `npm install` de uma lib de diálogo resolveria a mesma frase do
// requisito trazendo junto uma árvore de dependências inteira para dentro de um
// produto que processa pagamento.
//
// Se você chegou neste gate porque precisa mesmo de um pacote novo, este número
// NÃO é o que deve ser ajustado primeiro. Um install que aparece no meio de uma
// fase que declarou não instalar nada é o sinal exato de slopsquatting: pare,
// verifique a legitimidade do pacote no registro
// (`gsd-tools query package-legitimacy check`), e só então atualize o número
// junto com o registro da verificação.
const DEPENDENCIAS_ESPERADAS = 11;
const DEV_DEPENDENCIAS_ESPERADAS = 20;

function gate6() {
  const nome = "Gate 6 (nenhum pacote instalado na fase)";
  const manifesto = JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8"));
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
      "A Fase 7 declarou não instalar nada e sua Package Legitimacy Audit está",
      "vazia. A tentação nomeada era uma biblioteca de modal — a resposta do",
      "projeto é o Gate 5. Um pacote novo aqui exige um ciclo de verificação de",
      "legitimidade ANTES de ajustar estes números.",
    ]
  );
}

console.log("Gates estáticos da Fase 7 (gestão de assinatura)\n");

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
