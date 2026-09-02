/**
 * Coloca uma empresa de teste em qualquer um dos sete status de acesso,
 * escrevendo os 4 fatos de billing (BILL-01) direto no banco.
 *
 * Rodar com `npm run seed:billing -- --slug <slug> --status <status>`.
 *
 * POR QUE ISTO EXISTE: `empresaService.update` tem um allowlist positivo que
 * PROÍBE gravar `acessoAte`, `trialFim`, `canceladoEm` e `acessoVitalicio` por
 * HTTP. Isso não é um esquecimento — é BILL-04 e a decisão `[02-02]`: sem a
 * lista, qualquer ADMIN autenticado se daria acesso vitalício na própria
 * empresa. Consequência: não existe caminho de API legítimo para montar a
 * fixture de uma empresa bloqueada, e o e2e da Fase 4 precisa de uma.
 *
 * As duas saídas eram abrir um endpoint de teste ou escrever direto no banco a
 * partir de um script versionado. A primeira desfaz uma decisão de segurança de
 * outra fase e deixa a porta aberta em produção; a segunda mantém a dívida em
 * `scripts/`, fora do código que vai ao ar. Este arquivo é a segunda — o mesmo
 * padrão já aprovado na Fase 3 (`scripts/registrar-webhook-asaas.ts`, 03-07).
 *
 * POR QUE ELE RODA PELO RESOLVEDOR DO PROJETO: o `.env` tem que ser lido pelo
 * MESMO leitor que a aplicação usa (`@next/env`, via `scripts/resolvedor-ts.mjs`).
 * Ler por `--env-file` do Node produz valores DIFERENTES para a mesma linha do
 * arquivo — o cabeçalho de `resolvedor-ts.mjs` registra o incidente do `$` na
 * chave do Asaas, que custou horas de diagnóstico. Um único leitor elimina a
 * classe inteira de bug: o banco que este script escreve é, por construção, o
 * mesmo que a aplicação lê.
 *
 * NUNCA em produção: a guarda de ambiente abaixo é a primeira coisa executada.
 */
import { Prisma, StatusAcesso } from "@prisma/client";

import { avaliarAcesso, DIAS_DE_TRIAL, type FatosDeAcesso } from "@/lib/avaliar-acesso";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";
import { prisma } from "@/lib/prisma";

const STATUS_ACEITOS = [
  "trial",
  "em-dia",
  "carencia",
  "bloqueado",
  "cancelado",
  // ADITIVO (plano 07-07). `cancelado` acima cobre o cancelamento JÁ EXPIRADO e
  // NÃO pode ser alterado — a suíte inteira depende do comportamento dele. Este
  // aqui é o outro lado de D-06: cancelou e o período pago ainda está vigente.
  "cancelado-vigente",
  "vitalicio",
] as const;

type StatusPedido = (typeof STATUS_ACEITOS)[number];

/**
 * Ponte entre o vocabulário da linha de comando e o enum do banco.
 *
 * O tipo `Record` não é decoração: ele obriga este mapa a cobrir os sete valores
 * aceitos, então um oitavo status entrando no enum vira erro de compilação AQUI,
 * em vez de virar um `undefined` gravado no banco em tempo de execução. É o mesmo
 * mecanismo — e o mesmo motivo — da tabela `BLOQUEIA` de `lib/avaliar-acesso.ts`.
 *
 * O valor deste mapa é o status que `avaliarAcesso` DERIVA dos fatos daquele
 * vocabulário, e não o nome da linha de comando: por isso `cancelado-vigente`
 * aponta para `EM_DIA` (D-06 — cancelar não encurta o período já pago). Um
 * `--auditado cancelado-vigente` está pedindo "alinhe a auditoria em EM_DIA".
 */
const STATUS_ENUM: Record<StatusPedido, StatusAcesso> = {
  trial: StatusAcesso.TRIAL,
  "em-dia": StatusAcesso.EM_DIA,
  carencia: StatusAcesso.CARENCIA,
  bloqueado: StatusAcesso.BLOQUEADO,
  cancelado: StatusAcesso.CANCELADO,
  "cancelado-vigente": StatusAcesso.EM_DIA,
  vitalicio: StatusAcesso.VITALICIO,
};

const UM_DIA_EM_MS = 86_400_000;

function erro(mensagem: string): void {
  console.error(`[seed:billing] ${mensagem}`);
  process.exitCode = 1;
}

/** Leitura de `--chave valor` sobre `process.argv`, sem parser instalado. */
function argumento(nome: string): string | undefined {
  const posicao = process.argv.indexOf(`--${nome}`);

  if (posicao === -1) return undefined;

  return process.argv[posicao + 1];
}

/**
 * Os fatos são SEMPRE derivados de `agora`, nunca literais fixos: uma fixture
 * com data escrita à mão passa hoje e vira "bloqueado" sozinha daqui a um mês.
 *
 * Nenhuma aritmética de fuso é feita aqui — `meiaNoiteEmSaoPaulo` é a única
 * autorizada no projeto, e ela já resolve as viradas de horário de verão que o
 * `lib/fuso-sao-paulo.ts` documenta.
 */
function fatosPara(status: StatusPedido, agora: Date): FatosDeAcesso {
  const vazio: FatosDeAcesso = {
    acessoAte: null,
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  };

  switch (status) {
    // D-18: o `+1` é o mesmo de `empresaService.registerComUsuario` — sem ele,
    // um cadastro às 23:59 receberia 13 dias e um minuto de trial.
    case "trial":
      return { ...vazio, trialFim: meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1) };

    case "em-dia":
      return { ...vazio, acessoAte: meiaNoiteEmSaoPaulo(agora, 31) };

    // Meia-noite de HOJE em São Paulo é o limite superior EXCLUSIVO de ontem:
    // o acesso pago já venceu, mas os 10 dias de `DIAS_DE_CARENCIA` mal
    // começaram a correr.
    case "carencia":
      return { ...vazio, acessoAte: meiaNoiteEmSaoPaulo(agora, 0) };

    // 30 dias além do vencimento: bem depois dos 10 de carência.
    case "bloqueado":
      return { ...vazio, acessoAte: meiaNoiteEmSaoPaulo(agora, -30) };

    // Mesmos fatos de `bloqueado` mais a data de cancelamento — é só ela que
    // troca o rótulo de BLOQUEADO para CANCELADO (D-08); o gate trata os dois
    // igual.
    case "cancelado":
      return {
        ...vazio,
        acessoAte: meiaNoiteEmSaoPaulo(agora, -30),
        canceladoEm: new Date(agora.getTime() - 30 * UM_DIA_EM_MS),
      };

    // O OUTRO lado de D-06, e o único estado em que a tela de assinatura
    // renderiza "Cancelada" com data residual: o usuário cancelou (a data está
    // gravada) e o período que ele já pagou continua vigente. `avaliarAcesso`
    // devolve EM_DIA — `canceladoEm` não é sequer consultado enquanto
    // `agora < acessoAte` (lib/avaliar-acesso.ts:76) —, então a empresa mantém
    // admin e catálogo até a data que a tela mostra.
    //
    // `trialFim` fica nulo de propósito: com ele preenchido, o trial de uma
    // empresa recém-registrada poderia vencer DEPOIS de `acessoAte` e
    // `ultimoDiaDeAcessoEmSaoPaulo` passaria a exibir a data do trial, tornando
    // a asserção da fixture dependente do instante do registro.
    case "cancelado-vigente":
      return {
        ...vazio,
        acessoAte: meiaNoiteEmSaoPaulo(agora, 31),
        canceladoEm: new Date(agora.getTime() - UM_DIA_EM_MS),
      };

    // D-03: precedência absoluta. Os outros três fatos ficam vazios de
    // propósito, para o caso provar que a coluna sozinha basta (BILL-04).
    case "vitalicio":
      return { ...vazio, acessoVitalicio: true };
  }
}

async function principal(): Promise<void> {
  // PRIMEIRA coisa executada, antes de qualquer I/O: este script grava campos
  // que a aplicação proíbe de gravar por HTTP. Ele existe para a máquina do
  // desenvolvedor e para CI — em produção, recusa.
  if (process.env.NODE_ENV === "production") {
    return erro(
      "recusado: NODE_ENV=production. Este script grava fatos de billing que a " +
        "aplicação proíbe de gravar por HTTP (BILL-04); ele é só para testes locais e CI."
    );
  }

  const slug = argumento("slug");
  const status = argumento("status");

  // POR QUE ESTA FLAG EXISTE: sem ela, a escrita abaixo alinha
  // `ultimoStatusAuditado` ao status que `avaliarAcesso` derivou, e a empresa
  // semeada fica — por construção — SEM transição pendente. Esse é o estado
  // CORRETO para o e2e da Fase 4, que mede um GATE e quer o estado assentado, e
  // é fatal para o da Fase 5: o worker diário existe justamente para aplicar
  // transições pendentes, então um e2e sem nenhuma passaria verde contra um
  // worker completamente quebrado (`05-RESEARCH.md` §Achado crítico 4).
  //
  // Passar `--auditado <status>` desalinha os dois de propósito, produzindo a
  // única fixture capaz de provar que o worker faz alguma coisa. É recurso de
  // TESTE: a defesa real continua sendo a guarda de `NODE_ENV=production` no
  // topo desta função, que este caminho não afrouxa.
  const auditado = argumento("auditado");

  if (!slug) {
    return erro("informe --slug <slug> da empresa.");
  }

  if (!status || !(STATUS_ACEITOS as readonly string[]).includes(status)) {
    return erro(
      `informe --status <${STATUS_ACEITOS.join(" | ")}>` +
        (status ? ` — recebido "${status}".` : ".")
    );
  }

  if (auditado !== undefined && !(STATUS_ACEITOS as readonly string[]).includes(auditado)) {
    return erro(
      `informe --auditado <${STATUS_ACEITOS.join(" | ")}> — recebido "${auditado}".`
    );
  }

  const agora = new Date();
  const fatos = fatosPara(status as StatusPedido, agora);
  const derivado = avaliarAcesso(fatos, agora);

  try {
    // `ultimoStatusAuditado` entra na MESMA escrita, alinhado ao status que
    // `avaliarAcesso` acabou de derivar. É bookkeeping do compare-and-swap da
    // auditoria (D-16): se ele ficasse com o valor antigo, o primeiro request
    // depois do seed veria uma transição que nunca aconteceu de verdade e
    // gravaria uma linha de trilha espúria. Alinhar aqui deixa o e2e medindo o
    // gate, e não um efeito colateral de escrita atravessando.
    //
    // O default — sem a flag — é exatamente esse alinhamento, e é ele que mantém
    // `e2e/bloqueio-por-inadimplencia.spec.ts` verde sem uma linha alterada.
    const empresa = await prisma.empresa.update({
      where: { slug },
      data: {
        acessoAte: fatos.acessoAte,
        trialFim: fatos.trialFim,
        canceladoEm: fatos.canceladoEm,
        acessoVitalicio: fatos.acessoVitalicio,
        ultimoStatusAuditado: auditado
          ? STATUS_ENUM[auditado as StatusPedido]
          : derivado.status,
      },
      select: {
        slug: true,
        acessoAte: true,
        trialFim: true,
        canceladoEm: true,
        acessoVitalicio: true,
        ultimoStatusAuditado: true,
      },
    });

    console.log(`[seed:billing] ${status}`);
    console.log(`  slug                 ${empresa.slug}`);
    console.log(`  acessoAte            ${empresa.acessoAte?.toISOString() ?? "null"}`);
    console.log(`  trialFim             ${empresa.trialFim?.toISOString() ?? "null"}`);
    console.log(`  canceladoEm          ${empresa.canceladoEm?.toISOString() ?? "null"}`);
    console.log(`  acessoVitalicio      ${empresa.acessoVitalicio}`);
    console.log(`  ultimoStatusAuditado ${empresa.ultimoStatusAuditado}`);
    console.log(`  status derivado      ${derivado.status}`);

    if (auditado) {
      console.log(`  auditado forçado     ${auditado} (transição pendente de propósito)`);
    }

    // Rede de segurança contra um mapa de fatos que não produza o status pedido:
    // o script tem que montar fatos que `avaliarAcesso` classifique, nunca
    // inventar um status próprio.
    if (derivado.status === StatusAcesso.BLOQUEADO && status === "cancelado") {
      erro("os fatos de `cancelado` derivaram BLOQUEADO — canceladoEm não foi gravado.");
    }

    // Mesma rede de segurança para o status novo, e ela é o inverso da de cima:
    // aqui o erro seria montar fatos JÁ EXPIRADOS e produzir uma empresa
    // bloqueada onde o e2e espera uma empresa em dia com cancelamento pendente —
    // a tela de assinatura sequer seria alcançável (`requireAdminSession` manda
    // para `/bloqueado`), e o caso passaria a testar outra coisa em silêncio.
    if (derivado.status !== StatusAcesso.EM_DIA && status === "cancelado-vigente") {
      erro(
        `os fatos de \`cancelado-vigente\` derivaram ${derivado.status} em vez de EM_DIA — ` +
          "a empresa não tem período pago vigente e a tela de assinatura não será alcançável."
      );
    }
  } catch (falha) {
    if (falha instanceof Prisma.PrismaClientKnownRequestError && falha.code === "P2025") {
      return erro(`nenhuma empresa com slug "${slug}" (P2025) — nada foi gravado.`);
    }

    throw falha;
  }
}

principal()
  .catch((falha: unknown) => {
    erro(falha instanceof Error ? falha.message : "falha desconhecida");
  })
  .finally(() => prisma.$disconnect());
