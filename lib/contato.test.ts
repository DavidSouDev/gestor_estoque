import { describe, expect, it } from "vitest";
import { instagramLink, whatsappLink } from "./contato";

describe("whatsappLink", () => {
  it("adiciona o DDI 55 a um número local com DDD (11 dígitos)", () => {
    expect(whatsappLink("11999999999")).toBe("https://wa.me/5511999999999");
  });

  it("adiciona o DDI 55 a um número local sem o 9º dígito (10 dígitos)", () => {
    expect(whatsappLink("1133334444")).toBe("https://wa.me/551133334444");
  });

  it("remove formatação (parênteses, espaço, traço) antes de normalizar", () => {
    expect(whatsappLink("(11) 99999-9999")).toBe("https://wa.me/5511999999999");
  });

  it("mantém o número como está quando já vem com o DDI 55", () => {
    expect(whatsappLink("5511999999999")).toBe("https://wa.me/5511999999999");
  });

  it("inclui a mensagem pré-preenchida codificada como query string", () => {
    expect(whatsappLink("11999999999", "Olá! Tenho interesse no produto X")).toBe(
      "https://wa.me/5511999999999?text=Ol%C3%A1!%20Tenho%20interesse%20no%20produto%20X"
    );
  });

  it("retorna null para telefone vazio ou com poucos dígitos", () => {
    expect(whatsappLink("")).toBeNull();
    expect(whatsappLink("123")).toBeNull();
  });
});

describe("instagramLink", () => {
  it("monta o link a partir de um handle simples", () => {
    expect(instagramLink("mercearia")).toBe("https://instagram.com/mercearia");
  });

  it("remove o @ inicial", () => {
    expect(instagramLink("@mercearia")).toBe("https://instagram.com/mercearia");
  });

  it("extrai o handle de uma URL completa colada pelo lojista", () => {
    expect(instagramLink("https://www.instagram.com/mercearia/")).toBe(
      "https://instagram.com/mercearia"
    );
    expect(instagramLink("https://instagram.com/mercearia?hl=pt")).toBe(
      "https://instagram.com/mercearia"
    );
  });

  it("retorna null para valor vazio", () => {
    expect(instagramLink("")).toBeNull();
    expect(instagramLink("   ")).toBeNull();
  });
});
