// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EMPRESA_PUBLICAVEL_SELECT, empresaPodePublicar } from "./empresa-publicavel";
import type { FatosDeAcesso } from "./avaliar-acesso";

// 01/10/2026 09:00 em São Paulo (UTC-3). Mesma convenção da suíte de
// `avaliar-acesso`: nenhum fake timer, o relógio é sempre parâmetro.
const AGORA = new Date("2026-10-01T12:00:00.000Z");

function fatos(parcial: Partial<FatosDeAcesso>): FatosDeAcesso {
  return {
    acessoAte: null,
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
    ...parcial,
  };
}

describe("EMPRESA_PUBLICAVEL_SELECT", () => {
  it("projeta exatamente o id mais os 4 fatos de billing", () => {
    // Asserção EXATA de propósito: qualquer campo a mais nesta projeção é um
    // campo que passa a atravessar o funil público do catálogo (T-04-01).
    expect(EMPRESA_PUBLICAVEL_SELECT).toEqual({
      id: true,
      acessoAte: true,
      trialFim: true,
      canceladoEm: true,
      acessoVitalicio: true,
    });
  });
});

describe("empresaPodePublicar", () => {
  it("devolve false para null (empresa inexistente ou soft-deletada)", () => {
    expect(empresaPodePublicar(null, AGORA)).toBe(false);
  });

  it("devolve false para undefined", () => {
    expect(empresaPodePublicar(undefined, AGORA)).toBe(false);
  });

  it("devolve true para acesso vitalício, mesmo com tudo vencido (D-03/BILL-04)", () => {
    expect(
      empresaPodePublicar(
        fatos({
          acessoVitalicio: true,
          acessoAte: new Date("2020-01-01T03:00:00.000Z"),
          trialFim: new Date("2019-01-01T03:00:00.000Z"),
          canceladoEm: new Date("2020-02-01T03:00:00.000Z"),
        }),
        AGORA
      )
    ).toBe(true);
  });

  it("devolve true durante o trial", () => {
    expect(
      empresaPodePublicar(fatos({ trialFim: new Date("2026-10-15T03:00:00.000Z") }), AGORA)
    ).toBe(true);
  });

  it("devolve true com pagamento vigente", () => {
    expect(
      empresaPodePublicar(fatos({ acessoAte: new Date("2026-11-01T03:00:00.000Z") }), AGORA)
    ).toBe(true);
  });

  it("devolve true durante a carência — CARENCIA não despublica o catálogo (D-03)", () => {
    // acessoAte venceu em 25/09; a carência de 10 dias vai até 05/10.
    expect(
      empresaPodePublicar(fatos({ acessoAte: new Date("2026-09-25T03:00:00.000Z") }), AGORA)
    ).toBe(true);
  });

  it("devolve false para empresa BLOQUEADA (carência vencida há anos)", () => {
    expect(
      empresaPodePublicar(fatos({ acessoAte: new Date("2020-01-01T03:00:00.000Z") }), AGORA)
    ).toBe(false);
  });

  it("devolve false para empresa CANCELADA — mesmo resultado de BLOQUEADA (D-06)", () => {
    const bloqueada = empresaPodePublicar(
      fatos({ acessoAte: new Date("2020-01-01T03:00:00.000Z") }),
      AGORA
    );
    const cancelada = empresaPodePublicar(
      fatos({
        acessoAte: new Date("2020-01-01T03:00:00.000Z"),
        canceladoEm: new Date("2020-02-01T03:00:00.000Z"),
      }),
      AGORA
    );

    expect(cancelada).toBe(false);
    expect(cancelada).toBe(bloqueada);
  });

  it("devolve false sem nenhum fato de billing (fail-closed)", () => {
    expect(empresaPodePublicar(fatos({}), AGORA)).toBe(false);
  });

  it("não muta os fatos recebidos", () => {
    const entrada = fatos({ acessoAte: new Date("2026-11-01T03:00:00.000Z") });
    const copia = { ...entrada };

    empresaPodePublicar(entrada, AGORA);

    expect(entrada).toEqual(copia);
  });
});
