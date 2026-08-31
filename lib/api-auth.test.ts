// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { requireAuth, AuthError } from "./api-auth";
import { signAuthToken, type AuthTokenPayload } from "./jwt";
import { prismaMock } from "@/tests/setup/prisma-mock";

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

  it("lança AuthError 401 quando a conta foi revogada no banco", async () => {
    const token = await signAuthToken(payload);
    const request = buildRequest({ authorization: `Bearer ${token}` });
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);

    await expect(requireAuth(request)).rejects.toBeInstanceOf(AuthError);
    await expect(requireAuth(request)).rejects.toMatchObject({
      status: 401,
      message: "Sessão inválida.",
    });
  });

  it("lança AuthError 401 com a MESMA mensagem quando o banco falha (D-01, T-01-06)", async () => {
    const erroSilenciado = vi.spyOn(console, "error").mockImplementation(() => {});
    const token = await signAuthToken(payload);
    const request = buildRequest({ authorization: `Bearer ${token}` });
    prismaMock.usuario.findFirst.mockRejectedValue(new Error("connection refused") as never);

    // Mesma mensagem genérica do caso de conta revogada: a resposta não
    // distingue "usuário inativo" de "empresa removida" de "banco fora do ar".
    await expect(requireAuth(request)).rejects.toMatchObject({
      status: 401,
      message: "Sessão inválida.",
    });

    erroSilenciado.mockRestore();
  });

  it("não consulta o banco quando não há header authorization (T-01-08)", async () => {
    await expect(requireAuth(buildRequest())).rejects.toBeInstanceOf(AuthError);
    expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
  });

  it("aplica uma mudança no banco já no request seguinte, com o mesmo token", async () => {
    const token = await signAuthToken(payload);

    // Request 1: conta ativa.
    await expect(requireAuth(buildRequest({ authorization: `Bearer ${token}` }))).resolves.toEqual(
      payload
    );

    // A conta é desativada no banco — o token continua exatamente o mesmo.
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);

    // Request 2: já é 401.
    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toMatchObject({ status: 401 });
  });
});
