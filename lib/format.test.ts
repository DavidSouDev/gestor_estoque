import { describe, expect, it } from "vitest";
import {
  formatCpfCnpjInput,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatInstagramHandle,
  formatPhoneInput,
} from "./format";

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

describe("formatPhoneInput", () => {
  it("devolve string vazia sem dígitos", () => {
    expect(formatPhoneInput("")).toBe("");
    expect(formatPhoneInput("abc")).toBe("");
  });

  it("monta o DDD progressivamente", () => {
    expect(formatPhoneInput("1")).toBe("(1");
    expect(formatPhoneInput("11")).toBe("(11");
  });

  it("adiciona o início do número após o DDD", () => {
    expect(formatPhoneInput("119999")).toBe("(11) 9999");
  });

  it("formata fixo (10 dígitos) com bloco de 4", () => {
    expect(formatPhoneInput("1133334444")).toBe("(11) 3333-4444");
  });

  it("formata celular (11 dígitos) com bloco de 5", () => {
    expect(formatPhoneInput("11999999999")).toBe("(11) 99999-9999");
  });

  it("ignora caracteres não numéricos já digitados (parênteses, traço)", () => {
    expect(formatPhoneInput("(11) 99999-9999")).toBe("(11) 99999-9999");
  });

  it("trunca em 11 dígitos", () => {
    expect(formatPhoneInput("119999999999999")).toBe("(11) 99999-9999");
  });
});

describe("formatCpfCnpjInput", () => {
  it("devolve string vazia sem dígitos", () => {
    expect(formatCpfCnpjInput("")).toBe("");
    expect(formatCpfCnpjInput("abc")).toBe("");
  });

  it("monta o CPF progressivamente", () => {
    expect(formatCpfCnpjInput("123")).toBe("123");
    expect(formatCpfCnpjInput("123456")).toBe("123.456");
    expect(formatCpfCnpjInput("123456789")).toBe("123.456.789");
  });

  it("formata CPF completo (11 dígitos)", () => {
    expect(formatCpfCnpjInput("12345678909")).toBe("123.456.789-09");
  });

  it("passa a formatar como CNPJ a partir do 12º dígito", () => {
    expect(formatCpfCnpjInput("112223330001")).toBe("11.222.333/0001");
  });

  it("formata CNPJ completo (14 dígitos)", () => {
    expect(formatCpfCnpjInput("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("ignora caracteres não numéricos já digitados", () => {
    expect(formatCpfCnpjInput("123.456.789-09")).toBe("123.456.789-09");
  });

  it("trunca em 14 dígitos", () => {
    expect(formatCpfCnpjInput("1122233300018199999")).toBe("11.222.333/0001-81");
  });
});

describe("formatInstagramHandle", () => {
  it("mantém o handle puro como está", () => {
    expect(formatInstagramHandle("mercearia")).toBe("mercearia");
  });

  it("remove um ou mais @ do início", () => {
    expect(formatInstagramHandle("@mercearia")).toBe("mercearia");
    expect(formatInstagramHandle("@@mercearia")).toBe("mercearia");
  });

  it("extrai o handle de uma URL completa colada", () => {
    expect(formatInstagramHandle("https://www.instagram.com/mercearia")).toBe("mercearia");
    expect(formatInstagramHandle("https://instagram.com/mercearia/")).toBe("mercearia");
  });

  it("descarta query string e barra final", () => {
    expect(formatInstagramHandle("mercearia?hl=pt")).toBe("mercearia");
    expect(formatInstagramHandle("mercearia/")).toBe("mercearia");
  });

  it("remove espaços internos", () => {
    expect(formatInstagramHandle("mer cearia")).toBe("mercearia");
  });
});
