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

import {
  createAdminSession,
  destroySession,
  getSession,
  getVerifiedSession,
  requireAdminSession,
} from "./session";
import { signAuthToken, type AuthTokenPayload } from "./jwt";
import { prismaMock } from "@/tests/setup/prisma-mock";

/** Conta ativa que o stub default de tests/setup/prisma-mock.ts devolve. */
const contaAtiva = {
  id: "user-1",
  email: "admin@teste.com",
  role: "ADMIN",
  empresaId: "empresa-1",
  empresa: { slug: "empresa-teste" },
};

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

    it("redireciona quando a conta foi revogada no banco, mesmo com JWT válido", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      prismaMock.usuario.findFirst.mockResolvedValue(null as never);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );
    });

    it("redireciona quando o banco falha (fail-closed, D-01)", async () => {
      const erroSilenciado = vi.spyOn(console, "error").mockImplementation(() => {});
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      prismaMock.usuario.findFirst.mockRejectedValue(new Error("connection refused") as never);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );

      erroSilenciado.mockRestore();
    });

    it("redireciona quando o slug do banco não bate com o da URL (slug obsoleto, D-03)", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      prismaMock.usuario.findFirst.mockResolvedValue({
        ...contaAtiva,
        empresa: { slug: "slug-novo" },
      } as never);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );
    });

    it("não consulta o banco quando não há sessão (T-01-08)", async () => {
      cookieStore.get.mockReturnValue(undefined);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow("REDIRECT:");
      expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
    });

    it("não consulta o banco quando o token é de outra empresa (T-01-08)", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      await expect(requireAdminSession("outra-empresa")).rejects.toThrow("REDIRECT:");
      expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
    });

    it("aplica uma mudança no banco já no request seguinte, sem novo login", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      // Request 1: conta ativa.
      await expect(requireAdminSession("empresa-teste")).resolves.toEqual(payload);

      // A conta é desativada no banco — o cookie/JWT continua exatamente o mesmo.
      prismaMock.usuario.findFirst.mockResolvedValue(null as never);

      // Request 2: já é rejeitado.
      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );
    });
  });

  describe("getVerifiedSession", () => {
    it("retorna null quando não há cookie", async () => {
      cookieStore.get.mockReturnValue(undefined);

      await expect(getVerifiedSession()).resolves.toBeNull();
      expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
    });

    it("retorna o payload quando o banco confirma a conta", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      await expect(getVerifiedSession()).resolves.toEqual(payload);
    });

    it("retorna null quando o JWT é válido mas a conta foi revogada", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      prismaMock.usuario.findFirst.mockResolvedValue(null as never);

      await expect(getVerifiedSession()).resolves.toBeNull();
    });

    it("retorna null quando o banco falha (fail-closed, D-01)", async () => {
      const erroSilenciado = vi.spyOn(console, "error").mockImplementation(() => {});
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      prismaMock.usuario.findFirst.mockRejectedValue(new Error("connection refused") as never);

      await expect(getVerifiedSession()).resolves.toBeNull();

      erroSilenciado.mockRestore();
    });
  });
});
