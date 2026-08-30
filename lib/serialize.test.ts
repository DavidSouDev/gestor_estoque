import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { serializeDecimals } from "./serialize";

describe("serializeDecimals", () => {
  it("converte um Decimal em number", () => {
    const decimal = new Prisma.Decimal("19.90");
    expect(serializeDecimals(decimal)).toBe(19.9);
  });

  it("converte Decimals aninhados em objetos", () => {
    const input = {
      nome: "Produto",
      precoVarejo: new Prisma.Decimal("10.50"),
      precoAtacado: new Prisma.Decimal("8.00"),
    };

    expect(serializeDecimals(input)).toEqual({
      nome: "Produto",
      precoVarejo: 10.5,
      precoAtacado: 8,
    });
  });

  it("converte Decimals dentro de arrays e relations", () => {
    const input = {
      itens: [
        { preco: new Prisma.Decimal("1.00") },
        { preco: new Prisma.Decimal("2.50") },
      ],
    };

    expect(serializeDecimals(input)).toEqual({
      itens: [{ preco: 1 }, { preco: 2.5 }],
    });
  });

  it("preserva instâncias de Date sem alterá-las", () => {
    const data = new Date("2026-01-01T00:00:00.000Z");
    expect(serializeDecimals({ createdAt: data }).createdAt).toBe(data);
  });

  it("mantém valores primitivos e null inalterados", () => {
    expect(serializeDecimals(null)).toBeNull();
    expect(serializeDecimals(42)).toBe(42);
    expect(serializeDecimals("texto")).toBe("texto");
    expect(serializeDecimals(true)).toBe(true);
  });
});
