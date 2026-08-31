// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// Desfaz o mock global instalado por tests/setup/prisma-mock.ts — este arquivo
// precisa exercitar o módulo real de lib/prisma.ts, não o DeepMockProxy.
vi.unmock("@/lib/prisma");

describe("prisma singleton", () => {
  afterEach(() => {
    delete (globalThis as { prisma?: unknown }).prisma;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reaproveita a mesma instância entre reavaliações do módulo em produção", async () => {
    delete (globalThis as { prisma?: unknown }).prisma;
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");

    const primeiro = await import("@/lib/prisma");
    vi.resetModules();
    const segundo = await import("@/lib/prisma");

    expect(segundo.prisma).toBe(primeiro.prisma);
  });

  it("publica o client no globalThis em produção", async () => {
    delete (globalThis as { prisma?: unknown }).prisma;
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");

    await import("@/lib/prisma");

    expect((globalThis as { prisma?: unknown }).prisma).toBeDefined();
  });
});
