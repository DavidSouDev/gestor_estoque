import { describe, expect, it } from "vitest";
import { pickUniqueWithSuffix } from "./unique-suffix";

describe("pickUniqueWithSuffix", () => {
  it("retorna o valor base quando ele ainda não está ocupado", () => {
    expect(pickUniqueWithSuffix("loja", new Set())).toBe("loja");
  });

  it("adiciona sufixo -2 quando o base já está ocupado", () => {
    expect(pickUniqueWithSuffix("loja", new Set(["loja"]))).toBe("loja-2");
  });

  it("incrementa o sufixo até encontrar um valor livre", () => {
    const ocupados = new Set(["loja", "loja-2", "loja-3"]);
    expect(pickUniqueWithSuffix("loja", ocupados)).toBe("loja-4");
  });

  it("não é afetado por sufixos não sequenciais", () => {
    const ocupados = new Set(["loja", "loja-5"]);
    expect(pickUniqueWithSuffix("loja", ocupados)).toBe("loja-2");
  });
});
