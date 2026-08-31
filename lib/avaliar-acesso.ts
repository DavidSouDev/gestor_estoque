import { StatusAcesso } from "@prisma/client";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";

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
