import { describe, expect, it } from "vitest";
import { StatusAcesso } from "@prisma/client";
import {
  acessoBloqueado,
  avaliarAcesso,
  diasRestantesDeCarencia,
  podePublicarCatalogo,
  type FatosDeAcesso,
} from "./avaliar-acesso";

/**
 * Linha do tempo de referência. Todas as datas são instantes UTC explícitos:
 * o Brasil não tem mais horário de verão, então a meia-noite de
 * `America/Sao_Paulo` é sempre `03:00Z` nas datas usadas aqui.
 *
 *   TRIAL_FIM ........... 2026-09-15  (meia-noite SP)
 *   CARENCIA_DO_TRIAL ... 2026-09-25  (TRIAL_FIM + 10 dias)
 *   ACESSO_ATE .......... 2026-10-01  (meia-noite SP)
 *   CARENCIA_DO_ACESSO .. 2026-10-11  (ACESSO_ATE + 10 dias)
 *
 * Nenhum fake timer: `agora` é parâmetro da função (Pattern 2 / T-02-13).
 */
const TRIAL_FIM = "2026-09-15T03:00:00.000Z";
const CARENCIA_DO_TRIAL = "2026-09-25T03:00:00.000Z";
const ACESSO_ATE = "2026-10-01T03:00:00.000Z";
const CARENCIA_DO_ACESSO = "2026-10-11T03:00:00.000Z";

const CANCELADO_EM = "2026-09-20T14:32:11.000Z";

interface Cenario {
  nome: string;
  fatos: {
    acessoAte: string | null;
    trialFim: string | null;
    canceladoEm: string | null;
    acessoVitalicio: boolean;
  };
  agora: string;
  esperado: {
    status: StatusAcesso;
    expiraEm: string | null;
    carenciaAte: string | null;
  };
}

const cenarios: Cenario[] = [
  // --- D-03 / BILL-04: precedência absoluta do acesso vitalicio ------------
  {
    nome: "vitalicio vence canceladoEm e todas as datas vencidas (D-03, BILL-04)",
    fatos: {
      acessoAte: "2026-02-01T03:00:00.000Z",
      trialFim: "2026-01-01T03:00:00.000Z",
      canceladoEm: "2026-01-10T09:00:00.000Z",
      acessoVitalicio: true,
    },
    agora: "2026-10-15T12:00:00.000Z",
    esperado: { status: StatusAcesso.VITALICIO, expiraEm: null, carenciaAte: null },
  },
  {
    nome: "vitalicio sem nenhum outro fato vence até o fail-closed (D-03)",
    fatos: { acessoAte: null, trialFim: null, canceladoEm: null, acessoVitalicio: true },
    agora: "2026-10-15T12:00:00.000Z",
    esperado: { status: StatusAcesso.VITALICIO, expiraEm: null, carenciaAte: null },
  },

  // --- D-02: as 3 viradas exatas, dos dois lados da fronteira --------------
  {
    nome: "1ms antes de trialFim ainda é trial (D-02)",
    fatos: {
      acessoAte: null,
      trialFim: TRIAL_FIM,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    agora: "2026-09-15T02:59:59.999Z",
    esperado: { status: StatusAcesso.TRIAL, expiraEm: TRIAL_FIM, carenciaAte: null },
  },
  {
    nome: "no instante exato de trialFim o trial acabou e começa a carencia (D-02)",
    fatos: {
      acessoAte: null,
      trialFim: TRIAL_FIM,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    agora: TRIAL_FIM,
    esperado: {
      status: StatusAcesso.CARENCIA,
      expiraEm: TRIAL_FIM,
      carenciaAte: CARENCIA_DO_TRIAL,
    },
  },
  {
    nome: "1ms antes de acessoAte ainda está em dia (D-02)",
    fatos: {
      acessoAte: ACESSO_ATE,
      trialFim: null,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    agora: "2026-10-01T02:59:59.999Z",
    esperado: { status: StatusAcesso.EM_DIA, expiraEm: ACESSO_ATE, carenciaAte: null },
  },
  {
    nome: "no instante exato de acessoAte o período pago acabou e começa a carencia (D-02)",
    fatos: {
      acessoAte: ACESSO_ATE,
      trialFim: null,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    agora: ACESSO_ATE,
    esperado: {
      status: StatusAcesso.CARENCIA,
      expiraEm: ACESSO_ATE,
      carenciaAte: CARENCIA_DO_ACESSO,
    },
  },
  {
    nome: "1ms antes de carenciaAte ainda está em carencia (D-02)",
    fatos: {
      acessoAte: ACESSO_ATE,
      trialFim: null,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    agora: "2026-10-11T02:59:59.999Z",
    esperado: {
      status: StatusAcesso.CARENCIA,
      expiraEm: ACESSO_ATE,
      carenciaAte: CARENCIA_DO_ACESSO,
    },
  },
  {
    nome: "no instante exato de carenciaAte a empresa está bloqueada (D-02)",
    fatos: {
      acessoAte: ACESSO_ATE,
      trialFim: null,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    agora: CARENCIA_DO_ACESSO,
    esperado: {
      status: StatusAcesso.BLOQUEADO,
      expiraEm: ACESSO_ATE,
      carenciaAte: CARENCIA_DO_ACESSO,
    },
  },

  // --- D-05 / D-06: precedência do trial e leitura de acesso real ----------
  {
    nome: "quem pagou durante o trial continua em trial até trialFim (D-05)",
    fatos: {
      acessoAte: ACESSO_ATE,
      trialFim: TRIAL_FIM,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    agora: "2026-09-10T12:00:00.000Z",
    esperado: { status: StatusAcesso.TRIAL, expiraEm: TRIAL_FIM, carenciaAte: null },
  },
  {
    nome: "cancelamento pendente com acesso pago vigente ainda é em dia (D-06)",
    fatos: {
      acessoAte: ACESSO_ATE,
      trialFim: null,
      canceladoEm: CANCELADO_EM,
      acessoVitalicio: false,
    },
    agora: "2026-09-25T12:00:00.000Z",
    esperado: { status: StatusAcesso.EM_DIA, expiraEm: ACESSO_ATE, carenciaAte: null },
  },

  // --- D-07 / D-08 / D-10: cancelado vs. bloqueado ------------------------
  {
    nome: "empresa cancelada com acessoAte vencido há 3 dias entra na mesma carencia (D-07)",
    fatos: {
      acessoAte: ACESSO_ATE,
      trialFim: null,
      canceladoEm: CANCELADO_EM,
      acessoVitalicio: false,
    },
    agora: "2026-10-04T03:00:00.000Z",
    esperado: {
      status: StatusAcesso.CARENCIA,
      expiraEm: ACESSO_ATE,
      carenciaAte: CARENCIA_DO_ACESSO,
    },
  },
  {
    nome: "empresa cancelada com a carencia vencida vira CANCELADO, não BLOQUEADO (D-08)",
    fatos: {
      acessoAte: ACESSO_ATE,
      trialFim: null,
      canceladoEm: CANCELADO_EM,
      acessoVitalicio: false,
    },
    agora: "2026-10-12T03:00:00.000Z",
    esperado: {
      status: StatusAcesso.CANCELADO,
      expiraEm: ACESSO_ATE,
      carenciaAte: CARENCIA_DO_ACESSO,
    },
  },
  {
    nome: "quem só parou de pagar sem cancelar vira BLOQUEADO, nunca CANCELADO (D-08, D-10)",
    fatos: {
      acessoAte: ACESSO_ATE,
      trialFim: null,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    agora: "2026-10-12T03:00:00.000Z",
    esperado: {
      status: StatusAcesso.BLOQUEADO,
      expiraEm: ACESSO_ATE,
      carenciaAte: CARENCIA_DO_ACESSO,
    },
  },
  {
    nome: "reativação: canceladoEm preenchido com acessoAte novo no futuro volta a em dia (D-09)",
    fatos: {
      acessoAte: "2026-11-01T03:00:00.000Z",
      trialFim: TRIAL_FIM,
      canceladoEm: CANCELADO_EM,
      acessoVitalicio: false,
    },
    agora: "2026-10-15T12:00:00.000Z",
    esperado: {
      status: StatusAcesso.EM_DIA,
      expiraEm: "2026-11-01T03:00:00.000Z",
      carenciaAte: null,
    },
  },

  // --- Pitfall 5 e 6: as 4 combinações de nulidade ------------------------
  {
    nome: "sem nenhum fato de billing, fail-closed em BLOQUEADO (Pitfall 6)",
    fatos: { acessoAte: null, trialFim: null, canceladoEm: null, acessoVitalicio: false },
    agora: "2026-10-15T12:00:00.000Z",
    esperado: { status: StatusAcesso.BLOQUEADO, expiraEm: null, carenciaAte: null },
  },
  {
    nome: "só trialFim vencido: a carencia conta do trial (Pitfall 5)",
    fatos: {
      acessoAte: null,
      trialFim: TRIAL_FIM,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    agora: "2026-09-18T03:00:00.000Z",
    esperado: {
      status: StatusAcesso.CARENCIA,
      expiraEm: TRIAL_FIM,
      carenciaAte: CARENCIA_DO_TRIAL,
    },
  },
  {
    nome: "só acessoAte vencido: a carencia conta do pagamento (Pitfall 5)",
    fatos: {
      acessoAte: ACESSO_ATE,
      trialFim: null,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    agora: "2026-10-04T03:00:00.000Z",
    esperado: {
      status: StatusAcesso.CARENCIA,
      expiraEm: ACESSO_ATE,
      carenciaAte: CARENCIA_DO_ACESSO,
    },
  },
  {
    nome: "trial antigo e pagamento recente: a carencia conta do fato que venceu por último (Pitfall 5)",
    fatos: {
      acessoAte: ACESSO_ATE,
      trialFim: TRIAL_FIM,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    // 19 dias depois de trialFim (carência do trial já vencida em 25/09) mas só
    // 3 dias depois de acessoAte: contar de trialFim devolveria BLOQUEADO.
    agora: "2026-10-04T03:00:00.000Z",
    esperado: {
      status: StatusAcesso.CARENCIA,
      expiraEm: ACESSO_ATE,
      carenciaAte: CARENCIA_DO_ACESSO,
    },
  },

  // --- Critério de sucesso #5: os fatos exatos do backfill do plano 02-01 --
  {
    nome: "backfill: trialFim 15 dias à frente e o resto nulo devolve trial (critério #5)",
    fatos: {
      acessoAte: null,
      // meiaNoiteEmSaoPaulo("2026-08-31T12:00:00Z", 15), o que a migration grava.
      trialFim: TRIAL_FIM,
      canceladoEm: null,
      acessoVitalicio: false,
    },
    agora: "2026-08-31T12:00:00.000Z",
    esperado: { status: StatusAcesso.TRIAL, expiraEm: TRIAL_FIM, carenciaAte: null },
  },
];

function comoFatos(fatos: Cenario["fatos"]): FatosDeAcesso {
  return {
    acessoAte: fatos.acessoAte === null ? null : new Date(fatos.acessoAte),
    trialFim: fatos.trialFim === null ? null : new Date(fatos.trialFim),
    canceladoEm: fatos.canceladoEm === null ? null : new Date(fatos.canceladoEm),
    acessoVitalicio: fatos.acessoVitalicio,
  };
}

describe("avaliarAcesso", () => {
  it.each(cenarios)("$nome", ({ fatos, agora, esperado }) => {
    const resultado = avaliarAcesso(comoFatos(fatos), new Date(agora));

    expect(resultado.status).toBe(esperado.status);
    expect(resultado.expiraEm?.toISOString() ?? null).toBe(esperado.expiraEm);
    expect(resultado.carenciaAte?.toISOString() ?? null).toBe(esperado.carenciaAte);
  });

  it("exercita os 6 valores de StatusAcesso na tabela de cenarios", () => {
    const exercitados = new Set(
      cenarios.map((c) => avaliarAcesso(comoFatos(c.fatos), new Date(c.agora)).status)
    );

    expect([...exercitados].sort()).toEqual(Object.values(StatusAcesso).sort());
  });

  it("é pura: mesma entrada devolve o mesmo resultado e não muta os fatos", () => {
    const fatos = comoFatos({
      acessoAte: ACESSO_ATE,
      trialFim: TRIAL_FIM,
      canceladoEm: CANCELADO_EM,
      acessoVitalicio: false,
    });
    const agora = new Date("2026-10-04T03:00:00.000Z");

    const primeira = avaliarAcesso(fatos, agora);
    const segunda = avaliarAcesso(fatos, agora);

    expect(primeira).toEqual(segunda);
    expect(fatos.acessoAte?.toISOString()).toBe(ACESSO_ATE);
    expect(fatos.trialFim?.toISOString()).toBe(TRIAL_FIM);
    expect(fatos.canceladoEm?.toISOString()).toBe(CANCELADO_EM);
    expect(agora.toISOString()).toBe("2026-10-04T03:00:00.000Z");
  });
});

/**
 * D-06: `BLOQUEADO` e `CANCELADO` são o MESMO comportamento.
 * D-03: `CARENCIA` não bloqueia nada — o catálogo segue no ar e o admin só
 * ganha um banner.
 *
 * A tabela abaixo é escrita à mão, status por status, DE PROPÓSITO: se ela
 * fosse derivada da implementação (`BLOQUEIA[s]`) o teste seria uma tautologia
 * e não pegaria uma inversão de valor.
 */
const BLOQUEIO_ESPERADO: Array<[StatusAcesso, boolean]> = [
  [StatusAcesso.TRIAL, false],
  [StatusAcesso.EM_DIA, false],
  [StatusAcesso.CARENCIA, false],
  [StatusAcesso.VITALICIO, false],
  [StatusAcesso.BLOQUEADO, true],
  [StatusAcesso.CANCELADO, true],
];

describe("acessoBloqueado", () => {
  it.each(BLOQUEIO_ESPERADO)("%s bloqueia? %s", (status, esperado) => {
    expect(acessoBloqueado(status)).toBe(esperado);
  });

  it("trata CANCELADO exatamente como BLOQUEADO (D-06)", () => {
    expect(acessoBloqueado(StatusAcesso.CANCELADO)).toBe(
      acessoBloqueado(StatusAcesso.BLOQUEADO)
    );
  });

  it("NÃO bloqueia CARENCIA (D-03)", () => {
    expect(acessoBloqueado(StatusAcesso.CARENCIA)).toBe(false);
  });
});

describe("podePublicarCatalogo", () => {
  it.each(BLOQUEIO_ESPERADO)("%s publica? (negação de %s)", (status, bloqueia) => {
    expect(podePublicarCatalogo(status)).toBe(!bloqueia);
  });
});

describe("exaustividade dos predicados de bloqueio (T-04-15)", () => {
  // Trava executável: um 7º status entrando no enum quebra AQUI, e não
  // silenciosamente em produção liberando (ou bloqueando) o valor novo.
  it("StatusAcesso tem exatamente 6 valores", () => {
    expect(Object.keys(StatusAcesso)).toHaveLength(6);
  });

  it("todos os 6 valores estão cobertos pela tabela escrita à mão", () => {
    expect(BLOQUEIO_ESPERADO.map(([s]) => s).sort()).toEqual(
      Object.values(StatusAcesso).sort()
    );
  });

  it("acessoBloqueado e podePublicarCatalogo são negações exatas para os 6 valores", () => {
    for (const status of Object.values(StatusAcesso)) {
      expect(acessoBloqueado(status)).toBe(!podePublicarCatalogo(status));
      expect(typeof acessoBloqueado(status)).toBe("boolean");
    }
  });
});

describe("diasRestantesDeCarencia", () => {
  // 01/09/2026 09:00 em São Paulo (UTC-3). O fim do dia local é a meia-noite
  // de 02/09 = 2026-09-02T03:00:00Z.
  const AGORA = new Date("2026-09-01T12:00:00.000Z");

  it("devolve 0 quando a carência vence hoje (carenciaAte = meia-noite de hoje+1)", () => {
    expect(diasRestantesDeCarencia(new Date("2026-09-02T03:00:00.000Z"), AGORA)).toBe(0);
  });

  it("devolve 1 quando a carência vence na meia-noite de hoje+2", () => {
    expect(diasRestantesDeCarencia(new Date("2026-09-03T03:00:00.000Z"), AGORA)).toBe(1);
  });

  it("devolve 2 quando a carência vence na meia-noite de hoje+3", () => {
    expect(diasRestantesDeCarencia(new Date("2026-09-04T03:00:00.000Z"), AGORA)).toBe(2);
  });

  it("devolve os 10 dias cheios logo depois do vencimento do acesso", () => {
    // acessoAte = 2026-10-01T03:00Z ⇒ carenciaAte = 2026-10-11T03:00Z.
    // Às 09:00 BRT de 01/10 o fim do dia local é 02/10 03:00Z ⇒ 9 dias.
    const { carenciaAte } = avaliarAcesso(
      comoFatos({
        acessoAte: ACESSO_ATE,
        trialFim: null,
        canceladoEm: null,
        acessoVitalicio: false,
      }),
      new Date("2026-10-01T12:00:00.000Z")
    );

    expect(carenciaAte).not.toBeNull();
    expect(diasRestantesDeCarencia(carenciaAte!, new Date("2026-10-01T12:00:00.000Z"))).toBe(9);
  });

  it("difere de exatamente 1 entre 23:30 e 00:30 BRT do dia seguinte (Pitfall 5)", () => {
    const CARENCIA = new Date("2026-09-11T03:00:00.000Z");

    // 23:30 de 01/09 em São Paulo.
    const antesDaVirada = diasRestantesDeCarencia(CARENCIA, new Date("2026-09-02T02:30:00.000Z"));
    // 00:30 de 02/09 em São Paulo — mesmo `carenciaAte`, uma hora depois.
    const depoisDaVirada = diasRestantesDeCarencia(CARENCIA, new Date("2026-09-02T03:30:00.000Z"));

    expect(antesDaVirada - depoisDaVirada).toBe(1);
  });

  it("não muda de valor ao longo do mesmo dia local (00:30 e 23:30 do MESMO dia)", () => {
    const CARENCIA = new Date("2026-09-11T03:00:00.000Z");

    // 00:30 e 23:30 do dia 02/09 em São Paulo.
    const cedo = diasRestantesDeCarencia(CARENCIA, new Date("2026-09-02T03:30:00.000Z"));
    const tarde = diasRestantesDeCarencia(CARENCIA, new Date("2026-09-03T02:30:00.000Z"));

    expect(cedo).toBe(tarde);
  });

  it("clampa em 0 quando a carência já venceu (nunca negativo)", () => {
    expect(diasRestantesDeCarencia(new Date("2026-08-01T03:00:00.000Z"), AGORA)).toBe(0);
    expect(diasRestantesDeCarencia(new Date("2020-01-01T03:00:00.000Z"), AGORA)).toBe(0);
  });

  it("nunca devolve NaN, nem para uma data inválida (fail-closed)", () => {
    for (const carencia of [
      new Date("2026-09-02T03:00:00.000Z"),
      new Date("2026-09-20T03:00:00.000Z"),
      new Date("2020-01-01T03:00:00.000Z"),
      new Date(Number.NaN),
    ]) {
      const dias = diasRestantesDeCarencia(carencia, AGORA);
      expect(Number.isNaN(dias)).toBe(false);
      expect(Number.isInteger(dias)).toBe(true);
      expect(dias).toBeGreaterThanOrEqual(0);
    }
  });

  it("não muta os argumentos e não depende do relógio real", () => {
    const carencia = new Date("2026-09-05T03:00:00.000Z");
    const agora = new Date(AGORA);

    const primeira = diasRestantesDeCarencia(carencia, agora);
    const segunda = diasRestantesDeCarencia(carencia, agora);

    expect(primeira).toBe(segunda);
    expect(carencia.toISOString()).toBe("2026-09-05T03:00:00.000Z");
    expect(agora.toISOString()).toBe(AGORA.toISOString());
  });
});
