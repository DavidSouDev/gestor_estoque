import { afterEach, describe, expect, it, vi } from "vitest";
import { cronSecret } from "./cron-config";

/**
 * `vi.stubEnv` / `vi.unstubAllEnvs` são obrigatórios aqui — e não um detalhe de
 * higiene — porque o valor é lido por ACESSOR, na chamada, e não capturado numa
 * `const` no import. Mesmo par usado em `app/api/webhooks/asaas/route.test.ts`
 * (linhas 66-76) pelo mesmo motivo.
 */
const SEGREDO = "a".repeat(64);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("cronSecret() (T-05-03)", () => {
  it("com CRON_SECRET não-vazia: devolve exatamente o valor do ambiente", () => {
    vi.stubEnv("CRON_SECRET", SEGREDO);

    expect(cronSecret()).toBe(SEGREDO);
  });

  it("com CRON_SECRET ausente: lança, em vez de devolver string vazia (fail-closed)", () => {
    vi.stubEnv("CRON_SECRET", undefined);

    expect(() => cronSecret()).toThrowError(/\[cron\].*CRON_SECRET/);
  });

  it("com CRON_SECRET vazia: lança o mesmo erro — vazio é tratado como ausente", () => {
    vi.stubEnv("CRON_SECRET", "");

    expect(() => cronSecret()).toThrowError(/\[cron\].*CRON_SECRET/);
  });

  it("importar o módulo sem CRON_SECRET NÃO lança: o throw é da chamada, não do import", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    vi.resetModules();

    // Se o valor fosse uma `const` de nível de módulo, esta linha estouraria e
    // testar o caminho de 401 do handler exigiria configurar o ambiente inteiro.
    const modulo = await import("./cron-config");

    expect(typeof modulo.cronSecret).toBe("function");
  });
});
