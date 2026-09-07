import { describe, expect, it } from "vitest";
import { StatusAcesso } from "@prisma/client";
import { DIAS_DE_TRIAL, type FatosDeAcesso } from "@/lib/avaliar-acesso";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";
import {
  LIMIAR_DE_BLOQUEIO_EM_MASSA,
  PISO_DE_BLOQUEIO_EM_MASSA,
  perdeAcesso,
  planejarReconciliacao,
  type EmpresaAvaliavel,
} from "./reconciliacao.service";

/**
 * Nenhum mock de banco neste arquivo, de propósito: `planejarReconciliacao` é
 * pura, e é exatamente isso que torna barato provar o freio com 100 empresas.
 *
 * Todos os fatos são DERIVADOS de `agora`, nunca literais escritos à mão — o
 * motivo está em `scripts/seed-fatos-billing.ts`: "uma fixture com data escrita
 * à mão passa hoje e vira 'bloqueado' sozinha daqui a um mês". A aritmética
 * abaixo é a mesma daquele script, e `meiaNoiteEmSaoPaulo` é a única aritmética
 * de fuso autorizada no projeto.
 */
const agora = new Date();

const UM_DIA_EM_MS = 86_400_000;

const SEM_FATOS: FatosDeAcesso = {
  acessoAte: null,
  trialFim: null,
  canceladoEm: null,
  acessoVitalicio: false,
};

/** D-18: o `+1` é o mesmo de `empresaService.registerComUsuario`. */
function fatosDeTrial(): FatosDeAcesso {
  return { ...SEM_FATOS, trialFim: meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1) };
}

function fatosEmDia(): FatosDeAcesso {
  return { ...SEM_FATOS, acessoAte: meiaNoiteEmSaoPaulo(agora, 31) };
}

/**
 * Meia-noite de HOJE em São Paulo é o limite superior EXCLUSIVO de ontem: o
 * acesso pago já venceu, mas os 10 dias de carência mal começaram a correr.
 */
function fatosDeCarencia(): FatosDeAcesso {
  return { ...SEM_FATOS, acessoAte: meiaNoiteEmSaoPaulo(agora, 0) };
}

/** 30 dias além do vencimento: bem depois dos 10 de carência. */
function fatosDeBloqueio(): FatosDeAcesso {
  return { ...SEM_FATOS, acessoAte: meiaNoiteEmSaoPaulo(agora, -30) };
}

/** Trial que venceu há 30 dias — a fixture do caso "worker pulou um mês". */
function fatosDeTrialVencido(): FatosDeAcesso {
  return { ...SEM_FATOS, trialFim: meiaNoiteEmSaoPaulo(agora, -30) };
}

/** Mesmos fatos do bloqueio, mais a data que troca o rótulo para CANCELADO. */
function fatosDeCancelamento(): FatosDeAcesso {
  return {
    ...fatosDeBloqueio(),
    canceladoEm: new Date(agora.getTime() - 30 * UM_DIA_EM_MS),
  };
}

function empresa(over: Partial<EmpresaAvaliavel> = {}): EmpresaAvaliavel {
  return {
    id: crypto.randomUUID(),
    ...SEM_FATOS,
    ultimoStatusAuditado: StatusAcesso.TRIAL,
    ...over,
  };
}

/**
 * Monta lotes grandes sem custo: `perdas` empresas que vão perder acesso nesta
 * execução, `carencias` empresas cuja transição NÃO é perigosa, e o restante
 * assentado em EM_DIA (sem transição nenhuma, para o denominador ser real).
 */
function muitasEmpresas({
  total,
  perdas,
  carencias = 0,
}: {
  total: number;
  perdas: number;
  carencias?: number;
}): EmpresaAvaliavel[] {
  const lote: EmpresaAvaliavel[] = [];

  for (let i = 0; i < perdas; i += 1) {
    lote.push(empresa({ ...fatosDeBloqueio(), ultimoStatusAuditado: StatusAcesso.TRIAL }));
  }

  for (let i = 0; i < carencias; i += 1) {
    lote.push(empresa({ ...fatosDeCarencia(), ultimoStatusAuditado: StatusAcesso.EM_DIA }));
  }

  while (lote.length < total) {
    lote.push(empresa({ ...fatosEmDia(), ultimoStatusAuditado: StatusAcesso.EM_DIA }));
  }

  return lote;
}

describe("perdeAcesso (D-02 / Pitfall 6)", () => {
  it("TRIAL → BLOQUEADO é perda nova", () => {
    expect(
      perdeAcesso({
        empresaId: "e1",
        anterior: StatusAcesso.TRIAL,
        novo: StatusAcesso.BLOQUEADO,
      })
    ).toBe(true);
  });

  it("BLOQUEADO → CANCELADO NÃO é perda nova: a empresa já estava sem acesso", () => {
    // O predicado ingênuo (`novo === BLOQUEADO || novo === CANCELADO`) devolveria
    // true aqui e inflaria o numerador do freio contra o texto de D-02.
    expect(
      perdeAcesso({
        empresaId: "e2",
        anterior: StatusAcesso.BLOQUEADO,
        novo: StatusAcesso.CANCELADO,
      })
    ).toBe(false);
  });

  it("null → BLOQUEADO é perda nova: nunca auditada é lida como 'tinha acesso'", () => {
    expect(
      perdeAcesso({ empresaId: "e3", anterior: null, novo: StatusAcesso.BLOQUEADO })
    ).toBe(true);
  });

  it("TRIAL → CARENCIA não é perda: CARENCIA não bloqueia nada (D-03)", () => {
    expect(
      perdeAcesso({
        empresaId: "e4",
        anterior: StatusAcesso.TRIAL,
        novo: StatusAcesso.CARENCIA,
      })
    ).toBe(false);
  });
});

describe("passada 1 — detecção de transições (WRK-01)", () => {
  it("lote vazio: nenhuma transição, proporção 0 e freio desarmado (sem divisão por zero)", () => {
    const plano = planejarReconciliacao([], agora);

    expect(plano.avaliadas).toBe(0);
    expect(plano.transicoes).toEqual([]);
    expect(plano.perigosas).toEqual([]);
    expect(plano.aplicaveis).toEqual([]);
    expect(plano.freio.disparou).toBe(false);
    expect(plano.freio.proporcao).toBe(0);
    expect(Number.isNaN(plano.freio.proporcao)).toBe(false);
  });

  it("status derivado igual ao auditado: nenhuma transição (guarda D-16 em memória)", () => {
    const lote = [
      empresa({ ...fatosEmDia(), ultimoStatusAuditado: StatusAcesso.EM_DIA }),
    ];

    const plano = planejarReconciliacao(lote, agora);

    expect(plano.avaliadas).toBe(1);
    expect(plano.transicoes).toEqual([]);
  });

  it("status derivado diferente do auditado: transição com anterior e novo corretos", () => {
    const alvo = empresa({
      ...fatosDeCarencia(),
      ultimoStatusAuditado: StatusAcesso.EM_DIA,
    });

    const plano = planejarReconciliacao([alvo], agora);

    expect(plano.transicoes).toEqual([
      {
        empresaId: alvo.id,
        anterior: StatusAcesso.EM_DIA,
        novo: StatusAcesso.CARENCIA,
      },
    ]);
  });

  it("trial vencido há 30 dias: UMA transição TRIAL → BLOQUEADO, sem passo CARENCIA", () => {
    const alvo = empresa({
      ...fatosDeTrialVencido(),
      ultimoStatusAuditado: StatusAcesso.TRIAL,
    });

    const plano = planejarReconciliacao([alvo], agora);

    // Asserção EXATA (e não `objectContaining`): é ela que prova a ausência de
    // encadeamento. A trilha registra transições observadas, não simuladas.
    expect(plano.transicoes).toHaveLength(1);
    expect(plano.transicoes[0]).toEqual({
      empresaId: alvo.id,
      anterior: StatusAcesso.TRIAL,
      novo: StatusAcesso.BLOQUEADO,
    });
    expect(plano.transicoes.map((t) => t.novo)).not.toContain(StatusAcesso.CARENCIA);
  });

  it("empresa já bloqueada que passa a CANCELADO: transição existe, mas não é perigosa", () => {
    const alvo = empresa({
      ...fatosDeCancelamento(),
      ultimoStatusAuditado: StatusAcesso.BLOQUEADO,
    });

    const plano = planejarReconciliacao([alvo], agora);

    expect(plano.transicoes).toHaveLength(1);
    expect(plano.perigosas).toEqual([]);
    expect(plano.aplicaveis).toHaveLength(1);
  });
});

describe("freio composto (D-01)", () => {
  it("100 empresas / 20 perdas: NÃO arma — 20% não é MAIOR que 20%", () => {
    const plano = planejarReconciliacao(muitasEmpresas({ total: 100, perdas: 20 }), agora);

    expect(plano.perigosas).toHaveLength(20);
    expect(plano.freio.proporcao).toBe(LIMIAR_DE_BLOQUEIO_EM_MASSA);
    expect(plano.freio.disparou).toBe(false);
    expect(plano.aplicaveis).toHaveLength(20);
    expect(plano.freio.suprimidas).toBe(0);
  });

  it("100 empresas / 21 perdas: ARMA — o par logo acima do limiar", () => {
    const plano = planejarReconciliacao(muitasEmpresas({ total: 100, perdas: 21 }), agora);

    expect(plano.perigosas).toHaveLength(21);
    expect(plano.freio.disparou).toBe(true);
    expect(plano.aplicaveis).toHaveLength(0);
    expect(plano.freio.suprimidas).toBe(21);
  });

  it("4 empresas / 1 perda: NÃO arma — 25% > 20%, mas 1 está abaixo do piso", () => {
    // Este é o caso de D-01 revisado: sem o piso absoluto, um bloqueio legítimo
    // numa base pequena tornaria o worker um no-op silencioso.
    const plano = planejarReconciliacao(muitasEmpresas({ total: 4, perdas: 1 }), agora);

    expect(plano.perigosas).toHaveLength(1);
    expect(plano.freio.proporcao).toBeGreaterThan(LIMIAR_DE_BLOQUEIO_EM_MASSA);
    expect(plano.freio.disparou).toBe(false);
    expect(plano.aplicaveis).toHaveLength(1);
  });

  it("20 empresas / 5 perdas: ARMA — mesmo percentual, exatamente no piso", () => {
    const plano = planejarReconciliacao(muitasEmpresas({ total: 20, perdas: 5 }), agora);

    expect(plano.perigosas).toHaveLength(PISO_DE_BLOQUEIO_EM_MASSA);
    expect(plano.freio.proporcao).toBeGreaterThan(LIMIAR_DE_BLOQUEIO_EM_MASSA);
    expect(plano.freio.disparou).toBe(true);
    expect(plano.aplicaveis).toHaveLength(0);
  });

  it("100 empresas / 30 perdas: ARMA — 30% acima do limiar e bem acima do piso", () => {
    const plano = planejarReconciliacao(muitasEmpresas({ total: 100, perdas: 30 }), agora);

    expect(plano.freio.disparou).toBe(true);
    expect(plano.freio.proporcao).toBeCloseTo(0.3);
    expect(plano.aplicaveis).toHaveLength(0);
  });
});

describe("freio armado preserva transições não-perigosas (D-03)", () => {
  it("100 empresas, 30 perdas e 10 CARENCIA: só as 10 permanecem aplicáveis", () => {
    const plano = planejarReconciliacao(
      muitasEmpresas({ total: 100, perdas: 30, carencias: 10 }),
      agora
    );

    expect(plano.freio.disparou).toBe(true);
    expect(plano.transicoes).toHaveLength(40);
    expect(plano.perigosas).toHaveLength(30);

    // O freio é uma trava contra perda de acesso em massa, não uma parada total.
    expect(plano.aplicaveis).toHaveLength(10);
    expect(plano.aplicaveis.every((t) => !perdeAcesso(t))).toBe(true);
    expect(plano.aplicaveis.every((t) => t.novo === StatusAcesso.CARENCIA)).toBe(true);
    expect(plano.freio.suprimidas).toBe(30);
  });

  it("freio desarmado: aplicáveis é a lista inteira e suprimidas é 0", () => {
    const plano = planejarReconciliacao(
      muitasEmpresas({ total: 100, perdas: 4, carencias: 10 }),
      agora
    );

    expect(plano.freio.disparou).toBe(false);
    expect(plano.aplicaveis).toEqual(plano.transicoes);
    expect(plano.aplicaveis).toHaveLength(14);
    expect(plano.freio.suprimidas).toBe(0);
  });
});
