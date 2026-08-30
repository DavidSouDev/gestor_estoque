// @vitest-environment node
import { describe, expect, it, beforeEach, vi } from "vitest";
import { signAuthToken, verifyAuthToken, type AuthTokenPayload } from "./jwt";

const payload: AuthTokenPayload = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: "empresa-teste",
  email: "admin@teste.com",
  role: "ADMIN",
};

describe("jwt", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
  });

  it("assina e verifica um token válido, preservando o payload", async () => {
    const token = await signAuthToken(payload);
    const decoded = await verifyAuthToken(token);

    expect(decoded).toEqual(payload);
  });

  it("lança erro ao verificar um token inválido", async () => {
    await expect(verifyAuthToken("token-invalido")).rejects.toThrow();
  });

  it("lança erro ao assinar sem JWT_SECRET configurado", async () => {
    vi.stubEnv("JWT_SECRET", "");
    await expect(signAuthToken(payload)).rejects.toThrow("JWT_SECRET não configurado.");
    vi.unstubAllEnvs();
  });

  it("rejeita token assinado com segredo diferente", async () => {
    const token = await signAuthToken(payload);

    process.env.JWT_SECRET = "outro-segredo";
    await expect(verifyAuthToken(token)).rejects.toThrow();
  });
});
