// @vitest-environment node
import { describe, expect, it } from "vitest";
import { registroBloqueado, registrarCriacaoDeEmpresa } from "./registro-rate-limit";

/**
 * O freio é compartilhado via Redis (`tests/setup/redis-mock.ts`), cujo estado
 * é resetado GLOBALMENTE antes de cada `it()`. Cada teste ainda usa uma chave
 * (IP) PRÓPRIA por clareza de leitura.
 */

describe("registroBloqueado / registrarCriacaoDeEmpresa", () => {
  it("não bloqueia um IP sem nenhuma criação registrada", async () => {
    expect(await registroBloqueado("198.51.100.1")).toBe(false);
  });

  it("não bloqueia antes de atingir o limite de criações", async () => {
    const ip = "198.51.100.2";

    for (let i = 0; i < 29; i += 1) {
      await registrarCriacaoDeEmpresa(ip);
    }

    expect(await registroBloqueado(ip)).toBe(false);
  });

  it("bloqueia ao atingir o limite de criações dentro da janela", async () => {
    const ip = "198.51.100.3";

    for (let i = 0; i < 30; i += 1) {
      await registrarCriacaoDeEmpresa(ip);
    }

    expect(await registroBloqueado(ip)).toBe(true);
  });
});
