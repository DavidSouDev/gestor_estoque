import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("converte para minúsculas e troca espaços por hífen", () => {
    expect(slugify("Loja do João")).toBe("loja-do-joao");
  });

  it("remove acentos e caracteres especiais", () => {
    expect(slugify("Açaí & Cia!")).toBe("acai-cia");
  });

  it("remove hífens duplicados nas bordas", () => {
    expect(slugify("  --Empresa Teste--  ")).toBe("empresa-teste");
  });

  it("retorna 'empresa' quando a entrada não gera nenhum caractere válido", () => {
    expect(slugify("!!!")).toBe("empresa");
    expect(slugify("")).toBe("empresa");
  });

  it("colapsa múltiplos separadores em um único hífen", () => {
    expect(slugify("a   b___c")).toBe("a-b-c");
  });
});
