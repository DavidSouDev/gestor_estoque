// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { criarRateLimiter } from "./redis-rate-limiter";
import { getRedis } from "./redis";
import { redisMock } from "@/tests/setup/redis-mock";

function limiterDeTeste(prefixo: string) {
  return criarRateLimiter({
    prefixo,
    janelaSegundos: 60,
    limiteTentativas: 3,
    bloqueioSegundos: 60,
  });
}

describe("criarRateLimiter", () => {
  it("não bloqueia antes de atingir o limite", async () => {
    const limiter = limiterDeTeste("teste-1");

    await limiter.registrarTentativa("chave-a");
    await limiter.registrarTentativa("chave-a");

    expect(await limiter.bloqueado("chave-a")).toBe(false);
  });

  it("bloqueia ao atingir o limite de tentativas", async () => {
    const limiter = limiterDeTeste("teste-2");

    await limiter.registrarTentativa("chave-b");
    await limiter.registrarTentativa("chave-b");
    await limiter.registrarTentativa("chave-b");

    expect(await limiter.bloqueado("chave-b")).toBe(true);
  });

  it("limpar remove o bloqueio", async () => {
    const limiter = limiterDeTeste("teste-3");

    await limiter.registrarTentativa("chave-c");
    await limiter.registrarTentativa("chave-c");
    await limiter.registrarTentativa("chave-c");
    expect(await limiter.bloqueado("chave-c")).toBe(true);

    await limiter.limpar("chave-c");

    expect(await limiter.bloqueado("chave-c")).toBe(false);
  });

  it("dois prefixos diferentes não compartilham contagem, mesmo com a mesma chave lógica", async () => {
    const limiterA = limiterDeTeste("namespace-a");
    const limiterB = limiterDeTeste("namespace-b");

    await limiterA.registrarTentativa("mesma-chave");
    await limiterA.registrarTentativa("mesma-chave");
    await limiterA.registrarTentativa("mesma-chave");

    expect(await limiterA.bloqueado("mesma-chave")).toBe(true);
    expect(await limiterB.bloqueado("mesma-chave")).toBe(false);
  });

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * O freio é defesa em profundidade, não a barreira de autenticação em si
   * (essa é `bcrypt.compare`, que não depende do Redis). Se o Redis cair,
   * login/registro precisam continuar funcionando SEM o freio — nunca travar
   * a aplicação inteira por causa de uma peça de segunda camada fora do ar.
   */
  describe("fail-open quando o Redis está indisponível", () => {
    it("bloqueado() devolve false (nunca bloqueia por engano) quando o Redis lança", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const limiter = limiterDeTeste("teste-fail-open-bloqueado");
      vi.spyOn(redisMock, "get").mockRejectedValueOnce(new Error("ECONNREFUSED"));

      expect(await limiter.bloqueado("qualquer-chave")).toBe(false);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("registrarTentativa() engole o erro sem lançar quando o Redis está fora do ar", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const limiter = limiterDeTeste("teste-fail-open-registrar");
      vi.spyOn(redisMock, "incr").mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(limiter.registrarTentativa("qualquer-chave")).resolves.toBeUndefined();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("limpar() engole o erro sem lançar quando o Redis está fora do ar", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const limiter = limiterDeTeste("teste-fail-open-limpar");
      vi.spyOn(redisMock, "del").mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(limiter.limpar("qualquer-chave")).resolves.toBeUndefined();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("getRedis() lançando (ex.: REDIS_URL ausente) também é absorvido, fail-open", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const limiter = limiterDeTeste("teste-fail-open-sem-config");

      // Este teste importa `getRedis` só para provar que o mock do módulo
      // inteiro (`@/lib/redis`) é o ponto de substituição — trocar sua
      // implementação por uma que lança cobre também o caso "env var ausente"
      // do client real, sem precisar simular ioredis de verdade.
      const getRedisMockado = vi.mocked(getRedis);
      getRedisMockado.mockImplementationOnce(() => {
        throw new Error("[redis] variável de ambiente ausente: REDIS_URL");
      });

      expect(await limiter.bloqueado("qualquer-chave")).toBe(false);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });
});
