// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/tests/setup/prisma-mock";
import { revalidarConta } from "./auth-guard";

const TRIAL_FUTURO = new Date("2099-01-01T03:00:00.000Z");

const contaAtiva = {
  id: "user-1",
  email: "admin@teste.com",
  role: "ADMIN",
  empresaId: "empresa-1",
  empresa: {
    slug: "empresa-teste",
    acessoAte: null,
    trialFim: TRIAL_FUTURO,
    canceladoEm: null,
    acessoVitalicio: false,
    ultimoStatusAuditado: "TRIAL",
  },
};

describe("revalidarConta", () => {
  it("devolve a conta quando o usuário está ativo e a empresa não foi removida", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await expect(revalidarConta("user-1", "empresa-1")).resolves.toEqual({
      usuarioId: "user-1",
      empresaId: "empresa-1",
      empresaSlug: "empresa-teste",
      email: "admin@teste.com",
      role: "ADMIN",
      statusAcesso: "TRIAL",
      acessoExpiraEm: TRIAL_FUTURO,
      carenciaAte: null,
    });
  });

  it("filtra por id, empresaId, ativo e empresa.deletedAt na query", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await revalidarConta("user-1", "empresa-1");

    expect(prismaMock.usuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "user-1",
          empresaId: "empresa-1",
          ativo: true,
          empresa: { deletedAt: null },
        },
      })
    );
  });

  it("devolve null quando o banco não encontra conta ativa", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);

    await expect(revalidarConta("user-1", "empresa-1")).resolves.toBeNull();
  });

  it("devolve null (fail-closed) e loga quando a query lança", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.usuario.findFirst.mockRejectedValue(
      new Error("connection timeout") as never
    );

    await expect(revalidarConta("user-1", "empresa-1")).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("nunca seleciona senhaHash", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await revalidarConta("user-1", "empresa-1");

    const [args] = prismaMock.usuario.findFirst.mock.calls[0] as [
      { select: Record<string, unknown> },
    ];
    expect(args.select).not.toHaveProperty("senhaHash");
  });
});
