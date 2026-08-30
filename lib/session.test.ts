// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const { cookieStore, redirectMock } = vi.hoisted(() => {
  const cookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  const redirectMock = vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });

  return { cookieStore, redirectMock };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { createAdminSession, destroySession, getSession, requireAdminSession } from "./session";
import { signAuthToken, type AuthTokenPayload } from "./jwt";

const payload: AuthTokenPayload = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: "empresa-teste",
  email: "admin@teste.com",
  role: "ADMIN",
};

describe("session", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    vi.clearAllMocks();
  });

  describe("createAdminSession", () => {
    it("grava um cookie httpOnly assinado com o payload", async () => {
      await createAdminSession(payload);

      expect(cookieStore.set).toHaveBeenCalledWith(
        "admin_session",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        })
      );
    });
  });

  describe("destroySession", () => {
    it("remove o cookie de sessão", async () => {
      await destroySession();
      expect(cookieStore.delete).toHaveBeenCalledWith("admin_session");
    });
  });

  describe("getSession", () => {
    it("retorna null quando não há cookie", async () => {
      cookieStore.get.mockReturnValue(undefined);
      await expect(getSession()).resolves.toBeNull();
    });

    it("retorna null quando o token é inválido", async () => {
      cookieStore.get.mockReturnValue({ value: "token-invalido" });
      await expect(getSession()).resolves.toBeNull();
    });

    it("retorna o payload decodificado para um token válido", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      await expect(getSession()).resolves.toEqual(payload);
    });
  });

  describe("requireAdminSession", () => {
    it("retorna a sessão quando o slug bate com a empresa do token", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      await expect(requireAdminSession("empresa-teste")).resolves.toEqual(payload);
    });

    it("redireciona para o login quando não há sessão", async () => {
      cookieStore.get.mockReturnValue(undefined);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );
    });

    it("redireciona quando o slug da sessão é de outra empresa", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      await expect(requireAdminSession("outra-empresa")).rejects.toThrow(
        "REDIRECT:/outra-empresa/admin/login"
      );
    });
  });
});
