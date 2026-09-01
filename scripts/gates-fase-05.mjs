/**
 * Os gates estáticos da Fase 5 (worker diário de reconciliação) como código executável.
 *
 * POR QUE ISTO EXISTE: quatro das decisões desta fase são invisíveis em code
 * review porque a violação é uma linha curta e plausível. Trocar
 * `Promise.allSettled` por `Promise.all` parece simplificação; ler um header de
 * schedule de uma plataforma específica parece conveniência; reintroduzir o
 * agendamento pós-resposta parece consistência com o webhook; acrescentar
 * `ultimoStatusAuditado` a um `select` novo parece inofensivo. As quatro quebram
 * uma decisão registrada, e NENHUMA delas quebra um teste. A Fase 4 já resolveu
 * essa classe de problema com `scripts/gates-fase-04.mjs`; esta fase reusa a forma.
 *
 * REGRA TRANSVERSAL DE HIGIENE: antes de contar ocorrências dentro de um arquivo
 * de código, as linhas de comentário são descartadas. Sem isso os gates se
 * auto-invalidariam — o JSDoc normativo de `app/api/cron/reconciliacao-diaria/route.ts`
 * cita LITERALMENTE os identificadores proibidos para explicar por que são
 * proibidos (o cabeçalho de sete pontos nomeia `Vercel Cron`, o agendamento
 * pós-resposta e o gateway de pagamento; `lib/billing/cron-config.ts` faz o
 * mesmo com `CRON_SECRET`). Um gate que conta comentários prova o oposto do que
 * pretende: ele ficaria vermelho justamente porque o código documenta a
 * proibição corretamente.
 *
 * SEGUNDA CAMADA DA MESMA DEFESA: os identificadores proibidos são montados por
 * concatenação (`"x-vercel" + "-cron"`) em vez de escritos inteiros. Nenhum gate
 * varre `scripts/` hoje, então não seria necessário; a concatenação existe para
 * que ampliar o escopo de um gate no futuro não transforme este arquivo na
 * primeira violação que ele mesmo reporta. É a convenção do arquivo, aplicada
 * nos cinco lugares que declaram uma agulha proibida.
 *
 * TERCEIRA CAMADA, ESPECÍFICA DESTA FASE: os Gates 2, 3 e 5 varrem apenas
 * arquivos-FONTE (`ehFonte` descarta `*.test.ts`). Não é folga — é obrigatório.
 * `app/api/cron/reconciliacao-diaria/route.test.ts` importa e mocka o helper de
 * agendamento pós-resposta DE PROPÓSITO, para afirmar que ele NÃO é chamado: é
 * essa asserção negativa que transforma o Pitfall 4 em regressão detectável. Um
 * gate que varresse os testes acusaria como violação exatamente a prova de que
 * a invariante é respeitada.
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

/** O worker inteiro, incluindo qualquer rota futura que nasça sob o mesmo segmento. */
const DIRETORIO_DO_WORKER = "app/api/cron";
/** O handler concreto: alvo do Gate 4, cuja forma é verificada linha a linha. */
const ROTA_DO_WORKER = "app/api/cron/reconciliacao-diaria/route.ts";

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

/** Arquivos-fonte de todo o código de aplicação — o escopo dos Gates 1 e 5. */
const fontesDaAplicacao = () =>
  [...arquivosSob("app"), ...arquivosSob("lib")].filter(ehFonte);

// ---------------------------------------------------------------------------
// Gate 1 — neutralidade de plataforma de hosting (D-07, critério #3, T-05-22)
// ---------------------------------------------------------------------------
// O critério de sucesso #3 desta fase exige que o endpoint funcione IGUAL atrás
// de Vercel Cron ou de um crontab de VPS, SEM mudança de código. `Authorization:
// Bearer` não viola isso (é o formato que a Vercel manda automaticamente e é
// trivial de reproduzir com `curl`); o que viola é ler o user-agent do agendador
// ou um header de schedule específico da plataforma — só existe num dos dois
// hosts, e no outro o worker passa a se comportar diferente em silêncio.
//
// `vercel.json` na raiz é a mesma violação por outro caminho: commitar o bloco
// `"crons"` é TOMAR a decisão de hosting que D-07 adia deliberadamente. O
// agendamento sugerido mora num comentário do handler, que é documentação e não
// configuração de plataforma.
const AGULHAS_DE_PLATAFORMA = [
  "x-vercel" + "-cron",
  "vercel" + "-cron",
  "@vercel" + "/functions",
];

const CONFIG_DE_PLATAFORMA = "vercel.json";

function gate1() {
  const nome = "Gate 1 (neutralidade de plataforma de hosting)";

  const violacoes = fontesDaAplicacao().flatMap((arquivo) =>
    ocorrencias(arquivo, AGULHAS_DE_PLATAFORMA)
  );

  if (violacoes.length > 0) {
    falha(nome, "acoplamento a uma plataforma de hosting específica", [
      ...violacoes,
      "O critério de sucesso #3 exige que o endpoint funcione igual atrás de Vercel",
      "Cron ou de um crontab de VPS SEM mudança de código. Ler o user-agent do",
      "agendador ou um header de schedule específico da plataforma quebra isso em",
      "silêncio: num dos dois hosts a linha simplesmente não existe.",
    ]);
  }

  const configCommitada = existsSync(path.join(RAIZ, CONFIG_DE_PLATAFORMA));

  if (configCommitada) {
    falha(nome, `${CONFIG_DE_PLATAFORMA} commitado na raiz`, [
      CONFIG_DE_PLATAFORMA,
      "Commitar o bloco `crons` é tomar a decisão de hosting que D-07 adia. O",
      "agendamento sugerido (o cron expression e o `curl` equivalente) já está",
      `documentado no cabeçalho de ${ROTA_DO_WORKER} — documentação, não configuração.`,
    ]);
  }

  if (violacoes.length === 0 && !configCommitada) {
    ok(nome, `app/ e lib/ neutros, sem ${CONFIG_DE_PLATAFORMA}`);
  }
}

// ---------------------------------------------------------------------------
// Gate 2 — o worker AGUARDA as escritas (Pitfall 4, T-05-17)
// ---------------------------------------------------------------------------
// Enfileirar o trabalho para depois do `return` é o padrão do projeto para a
// auditoria de `revalidarConta`, e por isso a tentação é real. Aqui seria um
// erro: o corpo JSON é a ÚNICA superfície de observabilidade autorizada por
// D-04, e responder antes de as escritas terminarem reportaria contagens vazias
// — com as transições aparecendo no banco depois e ninguém sabendo.
const AGENDAMENTO_PROIBIDO = "agendar" + "PosResposta";

function gate2() {
  const nome = "Gate 2 (o worker aguarda as escritas)";
  const violacoes = arquivosSob(DIRETORIO_DO_WORKER)
    .filter(ehFonte)
    .flatMap((arquivo) => ocorrencias(arquivo, [AGENDAMENTO_PROIBIDO]));

  if (violacoes.length === 0) {
    return ok(nome, `${DIRETORIO_DO_WORKER} sem agendamento pós-resposta`);
  }

  falha(nome, "trabalho agendado para depois da resposta", [
    ...violacoes,
    "O corpo JSON é a única superfície de observabilidade autorizada por D-04.",
    "Agendar as escritas para depois do `return` reportaria contagens vazias, com",
    "as transições aparecendo no banco depois. O trabalho não está no caminho do",
    "TTFB — o trabalho É a resposta.",
  ]);
}

// ---------------------------------------------------------------------------
// Gate 3 — o worker NÃO fala com o gateway de pagamento (D-06, T-05-23)
// ---------------------------------------------------------------------------
// D-06 escopa o worker para reavaliar exclusivamente os 4 fatos de billing já
// salvos na Empresa. Qualquer import do módulo do gateway é a reconciliação
// ATIVA que a fase descartou, entrando pela porta dos fundos — e traz junto a
// latência de rede, o rate limit do fornecedor e um modo de falha novo, tudo
// dentro de um job que a fase desenhou para ser puro sobre dados locais.
const AGULHAS_DO_GATEWAY = ["asa" + "as", "Asa" + "as"];

function gate3() {
  const nome = "Gate 3 (worker não fala com o gateway)";
  const violacoes = arquivosSob(DIRETORIO_DO_WORKER)
    .filter(ehFonte)
    .flatMap((arquivo) => ocorrencias(arquivo, AGULHAS_DO_GATEWAY));

  if (violacoes.length === 0) {
    return ok(nome, `${DIRETORIO_DO_WORKER} sem referência ao gateway`);
  }

  falha(nome, "referência ao gateway de pagamento dentro do worker", [
    ...violacoes,
    "D-06 escopa o worker para reavaliar exclusivamente os 4 fatos de billing",
    "locais. Consultar o gateway é a reconciliação ativa que a fase descartou.",
    "A fila `EventoWebhookAsaas WHERE processadoEm IS NULL` NÃO é drenada aqui.",
  ]);
}

// ---------------------------------------------------------------------------
// Gate 4 — forma do handler (Pitfall 3, Pattern 4, T-05-05, T-05-24)
// ---------------------------------------------------------------------------
// Quatro linhas do handler carregam uma decisão cada. Todas as quatro sobrevivem
// a um code review distraído, e nenhuma quebra um teste ao ser trocada — é
// exatamente esse o perfil de invariante que precisa de gate estático.
const FORMA_DO_HANDLER = [
  {
    agulha: "export async " + "function GET",
    esperado: 1,
    porque:
      "O Vercel Cron dispara EXCLUSIVAMENTE GET e não há como configurar outro " +
      "método: um handler POST-only aparece no painel com 405 e o job falha em " +
      "silêncio (T-05-24). Se alguém quiser POST por higiene semântica, exportar " +
      "os DOIS delegando à MESMA função — nunca substituir o GET.",
  },
  {
    agulha: "Promise" + ".all(",
    esperado: 0,
    porque:
      "`all` aborta na primeira rejeição: uma empresa com o banco resistindo " +
      "derrubaria a reconciliação das outras do lote, violando D-05 diretamente.",
  },
  {
    agulha: "Promise" + ".allSettled",
    esperado: 1,
    porque:
      "É o que garante isolamento de falha por empresa (D-05) e que nenhuma " +
      "rejeição vire `unhandledRejection` — toda promise do array é observada.",
  },
  {
    agulha: "new " + "Date()",
    esperado: 1,
    porque:
      "Um único `agora` para TODA a execução. Ler o relógio por empresa faria " +
      "uma virada de meia-noite no meio do laço colocar duas empresas com fatos " +
      "idênticos em status diferentes — o resultado passaria a depender da ordem " +
      "em que o `findMany` devolveu as linhas.",
  },
  {
    agulha: "deletedAt" + ": null",
    esperado: 1,
    porque:
      "Empresas soft-deleted diluiriam o denominador do freio e, por terem ficado " +
      "sem status auditado no backfill da Fase 2, cairiam como transição " +
      "'nunca auditada' → BLOQUEADO, contadas como perdas de acesso perigosas " +
      "(Pitfall 8).",
  },
];

function gate4() {
  const nome = "Gate 4 (forma do handler do worker)";

  if (!existsSync(path.join(RAIZ, ROTA_DO_WORKER))) {
    return falha(nome, "o handler do worker não existe", [
      ROTA_DO_WORKER,
      "Se a rota foi movida, atualize ROTA_DO_WORKER — não remova o gate.",
    ]);
  }

  let quebrou = false;

  for (const { agulha, esperado, porque } of FORMA_DO_HANDLER) {
    const encontradas = ocorrencias(ROTA_DO_WORKER, [agulha]);

    if (encontradas.length === esperado) continue;

    quebrou = true;
    falha(
      nome,
      `\`${agulha}\` esperado ${esperado}x em linhas de código, encontrado ${encontradas.length}x`,
      [...encontradas, porque]
    );
  }

  if (!quebrou) {
    ok(nome, `${FORMA_DO_HANDLER.length} condições verificadas em ${ROTA_DO_WORKER}`);
  }
}

// ---------------------------------------------------------------------------
// Gate 5 — `ultimoStatusAuditado` não vaza para caminho de decisão (T-02-03, T-05-09)
// ---------------------------------------------------------------------------
// Esta é a versão EXECUTÁVEL do gate que a Fase 2 deixou em prosa dentro do
// `02-06-PLAN.md`: lá ele era uma linha de `grep` embutida num `<automated>`, o
// que só o fazia rodar dentro daquele plano. Aqui ele passa a rodar sempre.
//
// A coluna é bookkeeping do compare-and-swap de `registrarTransicao`, NUNCA
// fonte da verdade de acesso: quem decide o status é `avaliarAcesso` sobre os 4
// fatos (BILL-01). Um sétimo arquivo lendo esta coluna para decidir alguma coisa
// é a regressão que BILL-01 existe para impedir — e ela é silenciosa, porque na
// maioria das vezes o valor persistido COINCIDE com o derivado. Ela só diverge
// quando importa: quando o status acabou de mudar e ninguém auditou ainda.
//
// Os DOIS ÚLTIMOS arquivos da lista foram acrescentados pela Fase 5, e o uso
// deles é exclusivamente como `anterior` do compare-and-swap — o worker lê a
// coluna para preencher a transição que vai gravar, jamais para decidir acesso.
const AUTORIZADOS_A_LER_STATUS_AUDITADO = [
  "app/services/acesso.service.ts",
  "app/services/empresa.service.ts",
  "app/services/webhook-asaas.service.ts",
  "lib/auth-guard.ts",
  "app/services/reconciliacao.service.ts",
  "app/api/cron/reconciliacao-diaria/route.ts",
];

const STATUS_AUDITADO = "ultimoStatus" + "Auditado";

function gate5() {
  const nome = "Gate 5 (ultimoStatusAuditado fora de caminho de decisão)";

  const violacoes = fontesDaAplicacao()
    .filter((arquivo) => !AUTORIZADOS_A_LER_STATUS_AUDITADO.includes(arquivo))
    .flatMap((arquivo) => ocorrencias(arquivo, [STATUS_AUDITADO]));

  if (violacoes.length > 0) {
    falha(nome, `${STATUS_AUDITADO} fora da lista de arquivos autorizados`, [
      ...violacoes,
      "A coluna é bookkeeping do compare-and-swap, nunca fonte da verdade de",
      "acesso. Quem decide é `avaliarAcesso` sobre os 4 fatos (BILL-01). Se o",
      "arquivo novo precisa mesmo dela como `anterior` de uma transição,",
      "acrescente-o a AUTORIZADOS_A_LER_STATUS_AUDITADO com a justificativa.",
    ]);
  }

  const ausentes = AUTORIZADOS_A_LER_STATUS_AUDITADO.filter(
    (arquivo) => !existsSync(path.join(RAIZ, arquivo))
  );

  if (ausentes.length > 0) {
    falha(nome, "arquivo autorizado não existe mais", [
      ...ausentes,
      "Se o arquivo foi renomeado, atualize a lista — não remova a entrada.",
    ]);
  }

  if (violacoes.length === 0 && ausentes.length === 0) {
    ok(
      nome,
      `${AUTORIZADOS_A_LER_STATUS_AUDITADO.length} arquivos autorizados, nenhum sétimo`
    );
  }
}

// ---------------------------------------------------------------------------
// Gate 6 — nenhum pacote instalado nesta fase (T-05-SC)
// ---------------------------------------------------------------------------
// Números MEDIDOS no início da Fase 5, contra o `package.json` herdado da Fase 4
// (que já os verificava com os mesmos valores). A fase declarou explicitamente
// não instalar nada: a §Package Legitimacy Audit de `05-RESEARCH.md` está VAZIA
// — nenhum pacote `[ASSUMED]`, nenhum `[SUS]` — e todo o worker é código próprio
// sobre `node:crypto`, Prisma e o motor de acesso que já existiam.
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
      "A Fase 5 declarou não instalar nada e sua Package Legitimacy Audit está",
      "vazia. Um pacote novo aqui exige um ciclo de verificação de legitimidade",
      "ANTES de ajustar estes números.",
    ]
  );
}

console.log("Gates estáticos da Fase 5 (worker diário de reconciliação)\n");

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
