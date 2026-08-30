// @vitest-environment node
import { describe, expect, it } from "vitest";
import { requireAuth, AuthError } from "./api-auth";
import { signAuthToken, type AuthTokenPayload } from "./jwt";

const payload: AuthTokenPayload = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: "empresa-teste",
  email: "admin@teste.com",
  role: "ADMIN",
};

function buildRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/produtos", { headers });
}

describe("requireAuth", () => {
  it("retorna o payload decodificado quando o Bearer token é válido", async () => {
    const token = await signAuthToken(payload);
    const request = buildRequest({ authorization: `Bearer ${token}` });

    await expect(requireAuth(request)).resolves.toEqual(payload);
  });

  it("lança AuthError 401 quando não há header authorization", async () => {
    await expect(requireAuth(buildRequest())).rejects.toBeInstanceOf(AuthError);
    await expect(requireAuth(buildRequest())).rejects.toMatchObject({ status: 401 });
  });

  it("lança AuthError quando o header não começa com 'Bearer '", async () => {
    const request = buildRequest({ authorization: "Basic algumacoisa" });
    await expect(requireAuth(request)).rejects.toBeInstanceOf(AuthError);
  });

  it("lança AuthError quando o token é inválido", async () => {
    const request = buildRequest({ authorization: "Bearer token-invalido" });
    await expect(requireAuth(request)).rejects.toThrow("Token inválido ou expirado.");
  });
});
