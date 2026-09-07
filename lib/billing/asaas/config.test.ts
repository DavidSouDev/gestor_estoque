// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appBaseUrl,
  asaasApiKey,
  asaasApiUrl,
  asaasCheckoutBaseUrl,
  asaasWebhookToken,
  VALOR_PLANO_MENSAL,
} from "./config";

/**
 * Os cinco acessores são testados pela mesma tabela: o contrato é idêntico para
 * todos, e um acessor novo que esqueça o fail-fast tem que quebrar aqui.
 */
const acessores = [
  {
    nome: "asaasApiUrl",
    fn: asaasApiUrl,
    env: "ASAAS_API_URL",
    exemplo: "https://api-sandbox.asaas.com/v3",
  },
  {
    nome: "asaasApiKey",
    fn: asaasApiKey,
    env: "ASAAS_API_KEY",
    exemplo: "chave-de-api-ficticia",
  },
  {
    nome: "asaasWebhookToken",
    fn: asaasWebhookToken,
    env: "ASAAS_WEBHOOK_TOKEN",
    exemplo: "token-de-webhook-ficticio",
  },
  {
    nome: "asaasCheckoutBaseUrl",
    fn: asaasCheckoutBaseUrl,
    env: "ASAAS_CHECKOUT_BASE_URL",
    exemplo: "https://sandbox.asaas.com/checkoutSession/show",
  },
  {
    nome: "appBaseUrl",
    fn: appBaseUrl,
    env: "APP_BASE_URL",
    exemplo: "http://localhost:3000",
  },
];

let ambienteOriginal: NodeJS.ProcessEnv;

beforeEach(() => {
  ambienteOriginal = { ...process.env };

  // Cada caso define explicitamente o que precisa: o estado de partida é
  // "nenhuma variável do Asaas definida".
  for (const { env } of acessores) {
    delete process.env[env];
  }
});

afterEach(() => {
  process.env = ambienteOriginal;
  vi.unstubAllEnvs();
});

describe("acessores de configuração do Asaas", () => {
  it.each(acessores)(
    "$nome devolve o valor exato de $env quando ela está definida",
    ({ fn, env, exemplo }) => {
      process.env[env] = exemplo;

      expect(fn()).toBe(exemplo);
    }
  );

  it.each(acessores)(
    "$nome lança citando [asaas] e $env quando a variável está ausente",
    ({ fn, env }) => {
      expect(() => fn()).toThrow(/\[asaas\]/);
      expect(() => fn()).toThrow(env);
    }
  );

  it.each(acessores)(
    "$nome trata $env vazia como ausente e lança (nunca devolve string vazia)",
    ({ fn, env }) => {
      process.env[env] = "";

      expect(() => fn()).toThrow(/\[asaas\]/);
      expect(() => fn()).toThrow(env);
    }
  );

  it("importar o módulo com nenhuma env var definida não lança (fail-fast é por acessor, não por import)", async () => {
    vi.resetModules();

    const modulo = await import("@/lib/billing/asaas/config");

    expect(typeof modulo.asaasApiKey).toBe("function");
  });
});

describe("VALOR_PLANO_MENSAL", () => {
  it("é 29.9 conforme D-02 (plano único mensal de R$29,90)", () => {
    expect(VALOR_PLANO_MENSAL).toBe(29.9);
  });
});
