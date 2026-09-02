import { StatusAcesso } from "@prisma/client";
import { formatarDiaEmSaoPaulo, meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";

/**
 * Carência única de 10 dias (D-04 e D-07): trial vencido e pagamento vencido
 * usam exatamente o mesmo prazo antes do bloqueio.
 */
export const DIAS_DE_CARENCIA = 10;

/**
 * Duração do trial em dias (BILL-03).
 *
 * Quem grava `trialFim` usa `meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1)`:
 * o `+1` é D-18 — o dia do cadastro é o dia 0, então o trial termina na
 * meia-noite de São Paulo do 15º dia. Sem o `+1`, um cadastro às 23:59
 * receberia 13 dias e um minuto em vez dos 14 dias completos prometidos.
 *
 * Consumida pelo plano 02-05 (registro).
 */
export const DIAS_DE_TRIAL = 14;

/**
 * Os 4 fatos de billing da Empresa (BILL-01). São a fonte da verdade; o status
 * nunca é armazenado, sempre derivado destes campos.
 */
export interface FatosDeAcesso {
  acessoAte: Date | null;
  trialFim: Date | null;
  canceladoEm: Date | null;
  acessoVitalicio: boolean;
}

/**
 * `carenciaAte` é devolvido (e não re-derivado pelo chamador) porque ACC-01
 * (Fase 4) precisa exibir "dias restantes" no banner de carência.
 */
export interface ResultadoAcesso {
  status: StatusAcesso;
  expiraEm: Date | null;
  carenciaAte: Date | null;
}

/**
 * Função PURA. Não faz I/O, não lê o relógio por conta própria, não lê env e
 * nunca escreve nada — em particular, nunca preenche `canceladoEm` (D-10).
 *
 * `agora` é sempre injetado pelo chamador: é o que torna as viradas de data
 * exatas (critério de sucesso #2) testáveis sem fake timers.
 *
 * A ordem das regras abaixo é normativa — trocá-la muda o resultado.
 */
export function avaliarAcesso(fatos: FatosDeAcesso, agora: Date): ResultadoAcesso {
  // D-03: precedência absoluta, antes de qualquer outra regra. Vale mesmo com
  // `canceladoEm` preenchido e todas as datas vencidas (BILL-04: marcar a
  // coluna direto no banco basta, sem nenhuma outra alteração).
  if (fatos.acessoVitalicio) {
    return { status: StatusAcesso.VITALICIO, expiraEm: null, carenciaAte: null };
  }

  // D-05: o trial vale até o fim, mesmo com `acessoAte` já no futuro — quem
  // pagou durante o trial não perde os dias restantes. Por isso esta regra vem
  // ANTES da de `acessoAte`.
  // D-02: limite inclusivo — no instante exato em que `agora` atinge
  // `trialFim` a empresa já saiu do trial (comparação estrita `<`).
  if (fatos.trialFim && agora < fatos.trialFim) {
    return { status: StatusAcesso.TRIAL, expiraEm: fatos.trialFim, carenciaAte: null };
  }

  // D-06: cancelamento pendente com acesso pago vigente ainda é "em dia" — o
  // status reflete acesso real, não intenção futura de sair. `canceladoEm` NÃO
  // é consultado aqui de propósito.
  // D-09: por consequência, uma empresa com `canceladoEm` preenchido e um
  // `acessoAte` novo no futuro (o que o webhook da Fase 3 produz) volta a
  // EM_DIA naturalmente, sem tratamento especial: `canceladoEm` é um fato
  // ativo, não um registro histórico permanente.
  if (fatos.acessoAte && agora < fatos.acessoAte) {
    return { status: StatusAcesso.EM_DIA, expiraEm: fatos.acessoAte, carenciaAte: null };
  }

  // Expirado. A carência conta do fato que venceu POR ÚLTIMO (Pitfall 5): se
  // contasse só de `trialFim`, quem pagou uma vez e parou nasceria com a
  // carência já vencida.
  const candidatos = [fatos.trialFim, fatos.acessoAte].filter(
    (d): d is Date => d !== null
  );

  // Pitfall 6 / T-02-10: sem nenhum fato de billing, fail-closed. Coerente com
  // a decisão [01-02] ("revalidarConta devolve null também em erro de banco").
  if (candidatos.length === 0) {
    return { status: StatusAcesso.BLOQUEADO, expiraEm: null, carenciaAte: null };
  }

  const expiraEm = new Date(Math.max(...candidatos.map((d) => d.getTime())));
  const carenciaAte = meiaNoiteEmSaoPaulo(expiraEm, DIAS_DE_CARENCIA);

  // D-04 e D-07: trial vencido e pagamento vencido usam a MESMA carência.
  if (agora < carenciaAte) {
    return { status: StatusAcesso.CARENCIA, expiraEm, carenciaAte };
  }

  // D-08: rótulo distinto para quem cancelou formalmente, mesmo comportamento
  // de bloqueio (a Fase 4 trata os dois igual).
  // D-10: quem só parou de pagar nunca chega aqui como CANCELADO — falta de
  // pagamento não preenche `canceladoEm`.
  return {
    status: fatos.canceladoEm ? StatusAcesso.CANCELADO : StatusAcesso.BLOQUEADO,
    expiraEm,
    carenciaAte,
  };
}

/**
 * Tabela normativa do que "bloqueado" significa. Privada de propósito: o acesso
 * é sempre por `acessoBloqueado` / `podePublicarCatalogo`.
 *
 * O tipo `Record<StatusAcesso, boolean>` é OBRIGATÓRIO e não é decoração:
 *
 * - comparar o status com EM_DIA por desigualdade — o atalho tentador —
 *   derrubaria TRIAL, CARENCIA e VITALICIO junto, invertendo três regras de
 *   negócio de uma vez.
 * - um 7º valor entrando no enum vira erro de compilação AQUI, em vez de virar
 *   bloqueio (ou liberação) silencioso em produção. T-04-15.
 */
const BLOQUEIA: Record<StatusAcesso, boolean> = {
  [StatusAcesso.TRIAL]: false,
  [StatusAcesso.EM_DIA]: false,
  [StatusAcesso.CARENCIA]: false,
  [StatusAcesso.VITALICIO]: false,
  [StatusAcesso.BLOQUEADO]: true,
  [StatusAcesso.CANCELADO]: true,
};

/**
 * ACC-02. Único predicado de bloqueio do sistema — admin e catálogo derivam
 * daqui, nunca de uma comparação de status escrita à mão no chamador (BILL-01).
 *
 * D-06: `CANCELADO` recebe tratamento IDÊNTICO a `BLOQUEADO`; o rótulo distinto
 * existe só para a trilha de auditoria (D-08 da Fase 2), não para o gate.
 *
 * D-03: `CARENCIA` NÃO bloqueia nada. É apenas o aviso do banner no admin — o
 * catálogo público continua no ar durante os 10 dias de `DIAS_DE_CARENCIA`.
 */
export function acessoBloqueado(status: StatusAcesso): boolean {
  return BLOQUEIA[status];
}

/**
 * ACC-03. Hoje é exatamente a negação de `acessoBloqueado`.
 *
 * Existe como nome próprio, e não como `!acessoBloqueado(...)` inline no
 * chamador, porque admin e catálogo podem divergir na Fase 7 (ex.: manter o
 * catálogo publicado após um cancelamento voluntário). Com o nome próprio essa
 * divergência é uma linha aqui; sem ele, uma caçada por negações espalhadas.
 */
export function podePublicarCatalogo(status: StatusAcesso): boolean {
  return !acessoBloqueado(status);
}

const UM_DIA_EM_MS = 86_400_000;

/**
 * ACC-01. Dias locais inteiros que ainda restam até `carenciaAte` — o número que
 * o banner de carência mostra ("faltam N dias").
 *
 * Este é o ÚNICO lugar autorizado a calcular "dias restantes" (Pitfall 5 do
 * 04-RESEARCH.md). Subtrair datas no fuso do servidor, ou formatá-las sem
 * `timeZone`, produz off-by-one: o banner diz "restam 2 dias" e o bloqueio cai
 * na manhã seguinte.
 *
 * `agora` é injetado; esta função nunca lê o relógio do sistema por conta
 * própria — é o que torna as viradas de dia testáveis sem fake timers, igual a
 * `avaliarAcesso`.
 *
 * Aritmética: os dois extremos são meias-noites de `America/Sao_Paulo`, então a
 * diferença é um número inteiro de dias locais. `Math.round` (e não `ceil`):
 * um dia de mudança de offset tem 23h ou 25h, e `ceil` transformaria as 23h em
 * um dia espúrio a mais. `Math.max(0, …)` clampa — a carência vencida mostra 0,
 * nunca um número negativo. Data inválida também cai em 0 (fail-closed: mostrar
 * "vence hoje" pede o pagamento; mostrar `NaN` não pede nada).
 */
export function diasRestantesDeCarencia(carenciaAte: Date, agora: Date): number {
  // Limite superior EXCLUSIVO do dia local de `agora`: a meia-noite de amanhã em
  // São Paulo. Com ele, uma carência que vence hoje devolve 0 durante o dia
  // inteiro, das 00:01 às 23:59.
  const fimDoDiaLocal = meiaNoiteEmSaoPaulo(agora, 1);
  const dias = (carenciaAte.getTime() - fimDoDiaLocal.getTime()) / UM_DIA_EM_MS;

  if (!Number.isFinite(dias)) {
    return 0;
  }

  return Math.max(0, Math.round(dias));
}

/**
 * SUB-01. A data em que o acesso REALMENTE termina se nada mais for pago: o
 * MAIOR entre `trialFim` e `acessoAte`.
 *
 * Existe como segunda função — em vez de reusar `ResultadoAcesso.expiraEm` — por
 * causa de D-05. Durante o trial, `avaliarAcesso` devolve `expiraEm = trialFim`
 * mesmo quando `acessoAte` já está mais à frente, porque o trial vale até o fim
 * para quem pagou durante ele. Consequência (Pitfall 2 de `07-RESEARCH.md`): uma
 * empresa com `trialFim = 15/09` e `acessoAte = 15/10` que lesse `expiraEm`
 * veria "ativo até 15/09" e acharia que perdeu o mês que já pagou. `expiraEm` é
 * o campo certo para DECIDIR acesso; este é o campo certo para EXIBIR até quando
 * o acesso vai.
 *
 * `acessoVitalicio` tem precedência absoluta e devolve `null` — mesma regra D-03
 * da linha 56, "sem data de fim" e não "data de fim no passado".
 *
 * `canceladoEm` não é consultado: cancelar não encurta o período já pago (D-06).
 *
 * Função PURA e sem relógio: o resultado não depende de "agora" — a data de fim
 * é um fato dos dados, não do instante em que se pergunta.
 */
export function acessoEfetivoAte(fatos: FatosDeAcesso): Date | null {
  if (fatos.acessoVitalicio) {
    return null;
  }

  const candidatos = [fatos.trialFim, fatos.acessoAte].filter(
    (d): d is Date => d !== null
  );

  if (candidatos.length === 0) {
    return null;
  }

  return new Date(Math.max(...candidatos.map((d) => d.getTime())));
}

/**
 * SUB-01/SUB-02. O ÚLTIMO DIA de acesso em `dd/mm/aaaa` — a string que a tela de
 * assinatura e o modal de cancelamento exibem. Único produtor dessa string; a UI
 * nunca formata `acessoAte` por conta própria (mesma disciplina que o JSDoc de
 * `diasRestantesDeCarencia` declara para "dias restantes").
 *
 * Evita duas metades de um mesmo erro, ambas invisíveis em code review:
 *
 * (a) `acessoAte` e `trialFim` são LIMITES SUPERIORES EXCLUSIVOS — a meia-noite
 *     de São Paulo do dia SEGUINTE ao último dia de acesso. `avaliarAcesso`
 *     compara `agora < fatos.acessoAte` (linha 76) e `acessoAteAposPagamento`,
 *     em `lib/billing/asaas/datas.ts`, documenta-se como "o LIMITE SUPERIOR
 *     EXCLUSIVO". Renderizar o valor cru diria "ativo até 15/10" num dia em que
 *     o usuário já não tem nada.
 * (b) Formatar sem `timeZone` desliza mais um dia de calendário em qualquer
 *     servidor fora de São Paulo — por isso `formatarDiaEmSaoPaulo`, e não
 *     `lib/format.ts:formatDate`.
 *
 * Subtrair 1 MILISSEGUNDO (e não um dia inteiro) é deliberado: o dia de
 * calendário de São Paulo do instante `limite - 1ms` é sempre o último dia de
 * acesso, inclusive se o limite algum dia não for exatamente meia-noite e
 * inclusive atravessando mudança de offset.
 */
export function ultimoDiaDeAcessoEmSaoPaulo(fatos: FatosDeAcesso): string | null {
  const limite = acessoEfetivoAte(fatos);

  if (limite === null) {
    return null;
  }

  return formatarDiaEmSaoPaulo(new Date(limite.getTime() - 1));
}
