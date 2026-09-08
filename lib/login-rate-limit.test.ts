// @vitest-environment node
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  loginBloqueado,
  registrarFalhaDeLogin,
  limparTentativasDeLogin,
  loginBloqueadoPorIp,
  registrarFalhaDeLoginPorIp,
  limparTentativasDeLoginPorIp,
} from "./login-rate-limit";

/**
 * O freio agora é compartilhado via Redis (`tests/setup/redis-mock.ts`), cujo
 * estado é resetado GLOBALMENTE antes de cada `it()` — isolamento entre testes
 * já vem de graça. Mesmo assim, cada teste usa um email/IP PRÓPRIO por
 * clareza de leitura (evita ambiguidade sobre "de onde veio esse bloqueio" ao
 * ler um caso isolado).
 */

describe("loginBloqueado / registrarFalhaDeLogin", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("não bloqueia um email sem nenhuma falha registrada", async () => {
    expect(await loginBloqueado("nunca-falhou@teste.com")).toBe(false);
  });

  it("não bloqueia antes de atingir o limite de falhas", async () => {
    const email = "poucas-falhas@teste.com";

    await registrarFalhaDeLogin(email);
    await registrarFalhaDeLogin(email);
    await registrarFalhaDeLogin(email);
    await registrarFalhaDeLogin(email);

    expect(await loginBloqueado(email)).toBe(false);
  });

  it("bloqueia ao atingir o limite de falhas dentro da janela", async () => {
    const email = "muitas-falhas@teste.com";

    for (let i = 0; i < 5; i += 1) {
      await registrarFalhaDeLogin(email);
    }

    expect(await loginBloqueado(email)).toBe(true);
  });

  it("trata o email de forma case-insensitive e ignorando espaços", async () => {
    const email = "Case-Insensitive@Teste.com";

    for (let i = 0; i < 5; i += 1) {
      await registrarFalhaDeLogin(email);
    }

    expect(await loginBloqueado("  case-insensitive@teste.com  ")).toBe(true);
  });

  it("conta falhas mesmo quando o email não corresponde a nenhuma conta (evita oráculo de enumeração)", async () => {
    const email = "inexistente-mas-rastreado@teste.com";

    for (let i = 0; i < 5; i += 1) {
      await registrarFalhaDeLogin(email);
    }

    expect(await loginBloqueado(email)).toBe(true);
  });

  it("libera o bloqueio depois que a janela de bloqueio expira", async () => {
    vi.useFakeTimers();
    const inicio = new Date("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(inicio);

    const email = "bloqueio-expira@teste.com";

    for (let i = 0; i < 5; i += 1) {
      await registrarFalhaDeLogin(email);
    }

    expect(await loginBloqueado(email)).toBe(true);

    vi.setSystemTime(new Date(inicio.getTime() + 16 * 60 * 1000));

    expect(await loginBloqueado(email)).toBe(false);
  });

  it("reinicia a contagem quando a falha seguinte vem depois da janela (sem bloquear)", async () => {
    vi.useFakeTimers();
    const inicio = new Date("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(inicio);

    const email = "falhas-espacadas@teste.com";

    await registrarFalhaDeLogin(email);
    await registrarFalhaDeLogin(email);
    await registrarFalhaDeLogin(email);
    await registrarFalhaDeLogin(email);

    // Passa da janela de 15 min sem uma 5ª falha.
    vi.setSystemTime(new Date(inicio.getTime() + 16 * 60 * 1000));
    await registrarFalhaDeLogin(email);

    expect(await loginBloqueado(email)).toBe(false);
  });

  it("limparTentativasDeLogin remove o bloqueio (login bem-sucedido)", async () => {
    const email = "login-bem-sucedido@teste.com";

    for (let i = 0; i < 5; i += 1) {
      await registrarFalhaDeLogin(email);
    }

    expect(await loginBloqueado(email)).toBe(true);

    await limparTentativasDeLogin(email);

    expect(await loginBloqueado(email)).toBe(false);
  });
});

/**
 * Freio SEPARADO do de email — pega "password spraying" (1 tentativa por
 * email, milhares de emails, nunca bate as 5 falhas por conta). Cada teste usa
 * um IP PRÓPRIO pelo mesmo motivo do describe acima.
 */
describe("loginBloqueadoPorIp / registrarFalhaDeLoginPorIp", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("não bloqueia um IP sem nenhuma falha registrada", async () => {
    expect(await loginBloqueadoPorIp("203.0.113.10")).toBe(false);
  });

  it("não bloqueia antes de atingir o limite de falhas (20, mais generoso que o de email)", async () => {
    const ip = "203.0.113.11";

    for (let i = 0; i < 19; i += 1) {
      await registrarFalhaDeLoginPorIp(ip);
    }

    expect(await loginBloqueadoPorIp(ip)).toBe(false);
  });

  it("bloqueia ao atingir o limite de falhas dentro da janela, mesmo com emails diferentes a cada tentativa", async () => {
    const ip = "203.0.113.12";

    for (let i = 0; i < 20; i += 1) {
      await registrarFalhaDeLoginPorIp(ip);
    }

    expect(await loginBloqueadoPorIp(ip)).toBe(true);
  });

  it("limparTentativasDeLoginPorIp remove o bloqueio (login bem-sucedido)", async () => {
    const ip = "203.0.113.13";

    for (let i = 0; i < 20; i += 1) {
      await registrarFalhaDeLoginPorIp(ip);
    }

    expect(await loginBloqueadoPorIp(ip)).toBe(true);

    await limparTentativasDeLoginPorIp(ip);

    expect(await loginBloqueadoPorIp(ip)).toBe(false);
  });
});
