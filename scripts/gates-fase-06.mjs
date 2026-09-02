/**
 * Os gates estáticos da Fase 6 (termos de uso e aceite) como código executável.
 *
 * POR QUE ISTO EXISTE: quatro das decisões desta fase são invisíveis em code
 * review porque a violação é uma linha curta e plausível. Trocar
 * `revalidarConta().role` por `auth.role` parece simplificação — e devolve a um
 * SUPERADMIN rebaixado uma semana inteira de poder de publicação, porque o
 * payload do JWT vale 7 dias. Acrescentar uma mutação de Prisma sobre
 * `TermoDeUso` parece conveniência — e destrói a prova de consentimento que é o
 * único produto desta fase. Deixar `role` entrar num allowlist de DTO parece
 * completude — e abre um caminho HTTP para virar superadmin. Usar um utilitário
 * de fundo da paleta âmbar do Tailwind na tela de aceite parece
 * consistência com a tela de bloqueio — e ensina ao usuário que âmbar significa
 * duas coisas diferentes na mesma sessão. As quatro quebram uma decisão
 * registrada, e NENHUMA delas quebra um teste. A Fase 4 resolveu essa classe de
 * problema com `scripts/gates-fase-04.mjs` e a Fase 5 reusou a forma; esta fase
 * reusa de novo.
 *
 * REGRA TRANSVERSAL DE HIGIENE: antes de contar ocorrências dentro de um arquivo
 * de código, as linhas de comentário são descartadas. Nesta fase isso não é
 * refinamento, é condição de existência dos gates — e os SETE planos anteriores
 * registraram, cada um por conta própria, uma colisão desta família:
 *
 *   - 06-01: `ON CONFLICT` conta 2 na migration de seed (1 no cabeçalho, 1 no DML)
 *     e `onDelete: Restrict` conta 3 no schema;
 *   - 06-02: `P2002` conta 4 em `termo.service.ts` (2 de código, 2 de JSDoc), e
 *     a mutação de `TermoDeUso` e `unstable_cache` aparecem SÓ na linha de JSDoc
 *     que os proíbe;
 *   - 06-03: as duas formas de comparação de papel sobre o token aparecem nas
 *     linhas 14 e 25 de `app/api/termos/route.ts`, em JSDoc que o próprio plano
 *     mandou escrever;
 *   - 06-04: `permitirEmpresaBloqueada` foi de 2 para 3 em `lib/api-auth.ts`
 *     porque o plano exigiu um comentário que NOMEIA a flag (2 -> 2 descartando
 *     comentário);
 *   - 06-05: `next=` conta 2 e `useFormStatus` conta 3, ambos por JSDoc normativo;
 *   - 06-06: `registrarAceite` conta 2 em `empresa.service.ts`, ambas em
 *     comentários que o plano mandou escrever;
 *   - 06-07: três comentários tiveram que ser REESCRITOS para não mover contador
 *     de grep — e o SUMMARY registra, com razão, que reescrever prosa não escala.
 *
 * Um gate que contasse comentários ficaria vermelho justamente porque o código
 * documenta a proibição corretamente. É a decisão `[04-09]`, e aqui ela é
 * obrigatória, não opcional.
 *
 * SEGUNDA CAMADA DA MESMA DEFESA: os identificadores proibidos são montados por
 * concatenação (`"auth" + ".role ==="`) em vez de escritos inteiros. Nenhum gate
 * varre `scripts/` hoje, então não seria necessário; a concatenação existe para
 * que ampliar o escopo de um gate no futuro não transforme este arquivo na
 * primeira violação que ele mesmo reporta.
 *
 * TERCEIRA CAMADA, ESPECÍFICA DESTA FASE: os gates varrem apenas arquivos-FONTE
 * (`ehFonte` descarta `*.test.ts` e `*.test.tsx`). Não é folga — é obrigatório.
 * O caso de NÃO-VACUIDADE de `app/api/termos/route.test.ts` existe justamente
 * para provar que o código NÃO autoriza pela role do token: ele decodifica o JWT,
 * afirma `role === "SUPERADMIN"`, consulta o banco mockado, afirma
 * `role === "ADMIN"`, e só então chama o handler esperando 403. Um gate que
 * varresse os testes acusaria como violação exatamente a prova de que a
 * invariante é respeitada.
 *
 * CÓDIGO DE SAÍDA: 1 a partir da primeira violação. Os gates seguintes ainda
 * rodam de propósito — quem acabou de quebrar o build quer ver a lista inteira
 * de uma vez, não descobrir a segunda falha só depois de corrigir a primeira.
 *
 * ESCOPO: análise estática do repositório. Não abre banco, não sobe servidor,
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
 * um parser seria uma dependência nova — exatamente o que o Gate 5 proíbe nesta
 * fase.
 *
 * Limitação conhecida e aceita: um comentário de FIM de linha
 * (`const x = 1; // <agulha proibida>`) não é descartado, porque a linha começa
 * com código. Nenhum arquivo desta fase escreve nessa forma; se algum passar a
 * escrever, o desfecho certo é mover a explicação para uma linha própria, não
 * relaxar o gate.
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

/** Arquivos-fonte de todo o código de aplicação — o escopo dos Gates 1 e 2. */
const fontesDaAplicacao = () =>
  [...arquivosSob("app"), ...arquivosSob("lib")].filter(ehFonte);

// ---------------------------------------------------------------------------
// Gate 1 — autorização nunca pela role do JWT (Pitfall 2, T-06-01)
// ---------------------------------------------------------------------------
// `requireAuth` devolve deliberadamente o payload do JWT, e não a conta fresca:
// a decisão `[01-03]` registra que devolver `ContaAtiva` quebraria as ~40 call
// sites da assinatura pública. Esse payload é assinado uma vez e vale por 7
// dias — é dado velho por construção.
//
// Consequência: toda decisão de PAPEL tem que sair de `revalidarConta`, que lê o
// banco no request atual. A segunda leitura é gratuita (o `React.cache` do DAL a
// deduplica dentro do request), então não há sequer troca de desempenho a
// discutir. Autorizar por `auth.role` daria a um SUPERADMIN rebaixado para ADMIN
// uma semana inteira de poder de publicação sobre os termos da plataforma.
const AGULHAS_DE_ROLE_DO_TOKEN = [
  "auth" + ".role ===",
  "session" + ".role ===",
  "payload" + ".role ===",
];

function gate1() {
  const nome = "Gate 1 (autorização nunca pela role do JWT)";

  const violacoes = fontesDaAplicacao().flatMap((arquivo) =>
    ocorrencias(arquivo, AGULHAS_DE_ROLE_DO_TOKEN)
  );

  if (violacoes.length === 0) {
    return ok(nome, "app/ e lib/ decidem papel pela conta revalidada");
  }

  falha(nome, "comparação de papel escrita sobre o payload do token", [
    ...violacoes,
    "O payload do JWT tem até 7 dias de idade. A role tem que vir de",
    "`revalidarConta`, que lê o banco no request ATUAL — e a segunda leitura é",
    "gratuita, porque o `React.cache` do DAL a deduplica dentro do request.",
    "Um SUPERADMIN rebaixado continuaria publicando termos por uma semana inteira.",
  ]);
}

// ---------------------------------------------------------------------------
// Gate 2 — `TermoDeUso` é imutável (TERM-03 / D-07, T-06-17)
// ---------------------------------------------------------------------------
// Publicar é INSERT, SEMPRE. Uma versão publicada nunca é editada, corrigida,
// arquivada ou removida: se o texto estava errado, a correção é uma versão NOVA,
// e os aceites da anterior continuam válidos sobre o texto que foi de fato
// exibido. Um `update` sobre uma versão já aceita reescreve retroativamente
// aquilo com que as pessoas concordaram — que é o único produto desta fase.
//
// A ausência destes métodos é o contrato de TERM-03; a FK `onDelete: Restrict`
// em `AceiteTermo.termoId` é a segunda camada da mesma defesa (o Postgres recusa
// o DELETE mesmo que alguém escreva a chamada), e o teste de AUSÊNCIA de método
// em `app/services/termo.service.test.ts` é a terceira.
const AGULHAS_DE_MUTACAO_DE_TERMO = [
  "termoDeUso" + ".update",
  "termoDeUso" + ".delete",
  "termoDeUso" + ".updateMany",
  "termoDeUso" + ".deleteMany",
  "termoDeUso" + ".upsert",
];

function gate2() {
  const nome = "Gate 2 (TermoDeUso é imutável)";

  const violacoes = fontesDaAplicacao().flatMap((arquivo) =>
    ocorrencias(arquivo, AGULHAS_DE_MUTACAO_DE_TERMO)
  );

  if (violacoes.length === 0) {
    return ok(nome, "nenhuma escrita sobre versão publicada em app/ ou lib/");
  }

  falha(nome, "escrita sobre uma versão publicada dos termos", [
    ...violacoes,
    "Publicar é INSERT, sempre (D-07). A ausência destes métodos É o contrato de",
    "TERM-03, e a FK `onDelete: Restrict` em AceiteTermo.termoId é a segunda",
    "camada da mesma defesa. Se o texto está errado, publique uma versão NOVA.",
  ]);
}

// ---------------------------------------------------------------------------
// Gate 3 — `role` não é gravável por HTTP (T-06-02)
// ---------------------------------------------------------------------------
// `SUPERADMIN` é o papel mais poderoso do sistema e a única forma legítima de
// criá-lo é `scripts/seed-superadmin.ts`, FORA do runtime da aplicação. Nenhum
// caminho HTTP pode escrever a coluna — nem no cadastro, nem na edição de
// usuário, nem por spread de um corpo JSON num `data`.
//
// HONESTIDADE SOBRE O QUE ESTE GATE É: ele NÃO é um analisador de fluxo. Um grep
// cru de `role:` daria falso positivo em toda projeção de `select` (e há várias,
// legítimas, em `SAFE_SELECT`). O que ele faz são duas coisas de escopo limitado:
//   (1) um conjunto de AGULHAS CONHECIDAS — as formas em que uma escrita de role
//       vinda do corpo do request costuma aparecer; e
//   (2) uma checagem de FORMA dos dois DTOs de usuário: nenhum deles pode
//       declarar um campo `role`, porque é a declaração que abre a porta.
// Um caminho novo e criativo escaparia dos dois. Isto é um piso, não um teto — e
// está escrito aqui para que ninguém leia um `OK` deste gate como prova formal.
//
// EXCEÇÃO PERMITIDA: `scripts/seed-superadmin.ts` escreve `role` de propósito, e
// não é varrido — não está em `app/` nem em `lib/`. É o único lugar legítimo.
const AGULHAS_DE_ESCRITA_DE_ROLE = [
  "role" + ": data.role",
  "role" + ": body.role",
  "role" + ": input.role",
  "role" + ": dto.role",
];

const SERVICE_DE_USUARIO = "app/services/usuario.service.ts";
const DTOS_SEM_ROLE = ["CreateUsuarioDTO", "UpdateUsuarioDTO"];

/**
 * Linhas de campo do corpo de uma interface, em linhas de código. Devolve `null`
 * quando a interface não é encontrada — e isso é FALHA, não sucesso: renomear o
 * DTO não pode desligar a checagem em silêncio.
 */
function camposDaInterface(caminhoRelativo, nomeDaInterface) {
  const linhas = linhasDeCodigo(caminhoRelativo);
  const inicio = linhas.findIndex(({ texto }) =>
    texto.includes(`interface ${nomeDaInterface}`)
  );

  if (inicio === -1) return null;

  const campos = [];

  for (const linha of linhas.slice(inicio + 1)) {
    if (linha.texto.trim().startsWith("}")) return campos;
    campos.push(linha);
  }

  return null;
}

function gate3() {
  const nome = "Gate 3 (role não é gravável por HTTP)";

  const escopo = [...arquivosSob("app/api"), ...arquivosSob("app/services")].filter(
    ehFonte
  );

  const violacoes = escopo.flatMap((arquivo) =>
    ocorrencias(arquivo, AGULHAS_DE_ESCRITA_DE_ROLE)
  );

  if (violacoes.length > 0) {
    falha(nome, "escrita de `role` a partir do corpo do request", [
      ...violacoes,
      "SUPERADMIN é o papel mais poderoso do sistema e só nasce por",
      "`scripts/seed-superadmin.ts`, fora do runtime. Nenhum caminho HTTP pode",
      "escrever a coluna — nem por campo explícito, nem por spread de um corpo JSON.",
    ]);
  }

  const dtosComRole = [];

  for (const dto of DTOS_SEM_ROLE) {
    const campos = camposDaInterface(SERVICE_DE_USUARIO, dto);

    if (campos === null) {
      falha(nome, `interface ${dto} não encontrada em ${SERVICE_DE_USUARIO}`, [
        "Se o DTO foi renomeado ou movido, atualize DTOS_SEM_ROLE / SERVICE_DE_USUARIO —",
        "não remova a checagem. Um DTO que o gate não acha é um DTO que ninguém verifica.",
      ]);
      continue;
    }

    for (const { numero, texto } of campos) {
      if (/^\s*role\??\s*:/.test(texto)) {
        dtosComRole.push(`${SERVICE_DE_USUARIO}:${numero}: ${texto.trim()} (${dto})`);
      }
    }
  }

  if (dtosComRole.length > 0) {
    falha(nome, "um DTO de usuário declara o campo `role`", [
      ...dtosComRole,
      "A declaração é o que abre a porta: com o campo no DTO, basta um chamador",
      "repassar o corpo do request para o service. Papel se atribui fora do runtime.",
    ]);
  }

  if (violacoes.length === 0 && dtosComRole.length === 0) {
    ok(
      nome,
      `${escopo.length} fontes de app/api e app/services, ${DTOS_SEM_ROLE.length} DTOs sem \`role\``
    );
  }
}

// ---------------------------------------------------------------------------
// Gate 4 — nenhuma paleta âmbar nos arquivos novos da fase (UI-SPEC, T-06-37)
// ---------------------------------------------------------------------------
// A Fase 4 gastou seu orçamento de cor ensinando UMA associação: âmbar significa
// "sua situação de pagamento". O gate de termos é outro evento, com outro
// remédio — nada está vencido, nada está suspenso, e pagar NÃO resolve (que é
// exatamente por que o espelho REST devolve 403, e não o código de pagamento).
// Um usuário que esteja TAMBÉM em carência veria, na mesma sessão, duas telas
// âmbar idênticas significando coisas diferentes, e a associação que a Fase 4
// construiu passaria a valer para as duas — ou seja, para nenhuma.
//
// IMPORTANTE — `app/registro/page.tsx` NÃO entra no escopo deste gate. O
// gradiente `#f59e0b` daquele arquivo é PRÉ-EXISTENTE (anterior a esta fase),
// não é utilitário Tailwind, e o plano 06-07 preservou a linha caractere a
// caractere de propósito. Varrer aquele arquivo produziria um falso positivo
// permanente que ninguém poderia corrigir sem violar outra decisão.
const AGULHA_AMBAR = "amb" + "er-";

const ESCOPO_SEM_AMBAR = {
  diretorios: ["app/[slug]/admin/aceitar-termos"],
  arquivos: ["app/registro/_components/register-form.tsx"],
};

function gate4() {
  const nome = "Gate 4 (nenhuma paleta âmbar nos arquivos novos da fase)";

  const escopo = [
    ...ESCOPO_SEM_AMBAR.diretorios.flatMap((diretorio) => arquivosSob(diretorio)),
    ...ESCOPO_SEM_AMBAR.arquivos,
  ].filter(ehFonte);

  const ausentes = ESCOPO_SEM_AMBAR.arquivos.filter(
    (arquivo) => !existsSync(path.join(RAIZ, arquivo))
  );

  if (ausentes.length > 0) {
    falha(nome, "arquivo do escopo não existe mais", [
      ...ausentes,
      "Se o arquivo foi renomeado, atualize ESCOPO_SEM_AMBAR — não remova a entrada.",
    ]);
  }

  const violacoes = escopo.flatMap((arquivo) => ocorrencias(arquivo, [AGULHA_AMBAR]));

  if (violacoes.length > 0) {
    falha(nome, "paleta âmbar usada numa superfície de termos", [
      ...violacoes,
      "Âmbar é o vocabulário de PAGAMENTO desta aplicação, ensinado pela Fase 4.",
      "O gate de termos é outro evento e tem outro remédio: nada está vencido e",
      "pagar não resolve — por isso o espelho REST devolve 403. Duas telas âmbar",
      "idênticas na mesma sessão significando coisas diferentes destroem a",
      "associação em vez de reusá-la. Use slate, como o resto desta superfície.",
    ]);
  }

  if (violacoes.length === 0 && ausentes.length === 0) {
    ok(nome, `${escopo.length} fontes varridas, app/registro/page.tsx fora do escopo`);
  }
}

// ---------------------------------------------------------------------------
// Gate 5 — nenhum pacote instalado nesta fase (T-06-SC)
// ---------------------------------------------------------------------------
// Números MEDIDOS no início da Fase 6, contra o `package.json` herdado INALTERADO
// da Fase 5 (que já os verificava com os mesmos valores). A fase declarou
// explicitamente não instalar nada: a §Package Legitimacy Audit de
// `06-RESEARCH.md` está VAZIA — nenhum pacote `[ASSUMED]`, nenhum `[SUS]`,
// nenhum `[SLOP]` — de modo que o gate de legitimidade é vacuamente satisfeito e
// nenhum checkpoint humano de verificação de pacote foi disparado nesta fase.
// Todo o trabalho é código próprio sobre Prisma, `zod` e os módulos de sessão que
// já existiam.
//
// Se você chegou neste gate porque precisa mesmo de um pacote novo, este número
// NÃO é o que deve ser ajustado primeiro. Um install que aparece no meio de uma
// fase que declarou não instalar nada é o sinal exato de slopsquatting: pare,
// verifique a legitimidade do pacote no registro, e só então atualize o número
// junto com o registro da verificação.
const DEPENDENCIAS_ESPERADAS = 11;
const DEV_DEPENDENCIAS_ESPERADAS = 20;

function gate5() {
  const nome = "Gate 5 (nenhum pacote instalado na fase)";
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
      "A Fase 6 declarou não instalar nada e sua Package Legitimacy Audit está",
      "vazia. Um pacote novo aqui exige um ciclo de verificação de legitimidade",
      "ANTES de ajustar estes números.",
    ]
  );
}

console.log("Gates estáticos da Fase 6 (termos de uso e aceite)\n");

gate1();
gate2();
gate3();
gate4();
gate5();

console.log(
  houveFalha
    ? "\nResultado: FALHA — corrija as violações acima antes do merge."
    : "\nResultado: 5/5 gates OK."
);
