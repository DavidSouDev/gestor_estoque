import { describe, expect, it } from "vitest";
import { documentoValido, normalizarDocumento } from "./cpf-cnpj";

describe("normalizarDocumento", () => {
  it("remove pontuação de CPF", () => {
    expect(normalizarDocumento("123.456.789-09")).toBe("12345678909");
  });

  it("remove pontuação de CNPJ", () => {
    expect(normalizarDocumento("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("mantém string vazia sem dígitos", () => {
    expect(normalizarDocumento("abc")).toBe("");
  });
});

describe("documentoValido — CPF", () => {
  it("aceita CPF válido conhecido", () => {
    expect(documentoValido("12345678909")).toBe(true);
  });

  it("rejeita dígito verificador incorreto", () => {
    expect(documentoValido("12345678900")).toBe(false);
  });

  it("rejeita sequência de dígitos repetidos", () => {
    expect(documentoValido("11111111111")).toBe(false);
    expect(documentoValido("00000000000")).toBe(false);
  });

  it("rejeita tamanho diferente de 11", () => {
    expect(documentoValido("123456789")).toBe(false);
  });
});

describe("documentoValido — CNPJ", () => {
  it("aceita CNPJ válido conhecido", () => {
    expect(documentoValido("11222333000181")).toBe(true);
  });

  it("rejeita dígito verificador incorreto", () => {
    expect(documentoValido("11222333000199")).toBe(false);
  });

  it("rejeita sequência de dígitos repetidos", () => {
    expect(documentoValido("11111111111111")).toBe(false);
  });

  it("rejeita tamanho diferente de 14", () => {
    expect(documentoValido("1122233300018")).toBe(false);
  });
});

describe("documentoValido — geral", () => {
  it("rejeita string vazia", () => {
    expect(documentoValido("")).toBe(false);
  });
});
