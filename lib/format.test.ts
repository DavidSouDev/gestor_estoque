import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatDateTime } from "./format";

describe("formatCurrency", () => {
  it("formata número em BRL", () => {
    expect(formatCurrency(10)).toBe("R$ 10,00");
  });

  it("converte strings numéricas", () => {
    expect(formatCurrency("25.5")).toBe("R$ 25,50");
  });

  it("usa 0 como fallback para valores não numéricos", () => {
    expect(formatCurrency("não é número")).toBe("R$ 0,00");
    expect(formatCurrency(undefined)).toBe("R$ 0,00");
    expect(formatCurrency(NaN)).toBe("R$ 0,00");
  });
});

describe("formatDate", () => {
  it("formata Date no padrão dd/mm/aaaa", () => {
    expect(formatDate(new Date(Date.UTC(2026, 0, 5, 12)))).toBe("05/01/2026");
  });

  it("aceita string ISO", () => {
    expect(formatDate("2026-03-20T12:00:00.000Z")).toBe("20/03/2026");
  });
});

describe("formatDateTime", () => {
  it("formata Date com dia, mês, ano e horário", () => {
    const resultado = formatDateTime(new Date(Date.UTC(2026, 0, 5, 12, 30)));
    expect(resultado).toContain("05/01/2026");
    expect(resultado).toMatch(/\d{2}:\d{2}/);
  });
});
