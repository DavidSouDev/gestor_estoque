// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { StatusAcesso, CausaTransicaoAcesso } from "@prisma/client";
import { acessoService } from "./acesso.service";

const linhaBase = {
  id: "auditoria-1",
  empresaId: "empresa-1",
  statusAnterior: StatusAcesso.TRIAL,
  statusNovo: StatusAcesso.CARENCIA,
  causa: CausaTransicaoAcesso.AVALIACAO_SESSAO,
  createdAt: new Date("2026-08-31T03:00:00.000Z"),
};

function mockTransaction() {
  prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) =>
      Promise.resolve(callback(prismaMock))
    );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acessoService.registrarTransicao", () => {
  it("D-16: não toca o banco quando o status avaliado é igual ao último auditado", async () => {
    const resultado = await acessoService.registrarTransicao({
      empresaId: "empresa-1",
      anterior: StatusAcesso.EM_DIA,
      novo: StatusAcesso.EM_DIA,
      causa: CausaTransicaoAcesso.AVALIACAO_SESSAO,
    });

    expect(resultado).toBeNull();
    // Zero I/O: a função roda a cada request autenticado, gravar (ou sequer
    // abrir transação) aqui geraria carga por page view do admin.
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.auditoriaAcesso.create).not.toHaveBeenCalled();
  });

  it("faz o compare-and-swap condicionado ao status anterior esperado", async () => {
    mockTransaction();
    prismaMock.empresa.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.auditoriaAcesso.create.mockResolvedValue(linhaBase as never);

    const resultado = await acessoService.registrarTransicao({
      empresaId: "empresa-1",
      anterior: StatusAcesso.TRIAL,
      novo: StatusAcesso.CARENCIA,
      causa: CausaTransicaoAcesso.AVALIACAO_SESSAO,
    });

    expect(prismaMock.empresa.updateMany).toHaveBeenCalledWith({
      where: { id: "empresa-1", ultimoStatusAuditado: "TRIAL" },
      data: { ultimoStatusAuditado: "CARENCIA" },
    });
    expect(resultado).toEqual(linhaBase);
  });

  it("D-17: a linha carrega exatamente empresaId, statusAnterior, statusNovo e causa", async () => {
    mockTransaction();
    prismaMock.empresa.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.auditoriaAcesso.create.mockResolvedValue(linhaBase as never);

    await acessoService.registrarTransicao({
      empresaId: "empresa-1",
      anterior: StatusAcesso.TRIAL,
      novo: StatusAcesso.CARENCIA,
      causa: CausaTransicaoAcesso.AVALIACAO_SESSAO,
    });

    // Asserção EXATA (não `objectContaining`): é ela que prova a ausência de
    // snapshot dos fatos de billing. `createdAt` vem do @default(now()).
    expect(prismaMock.auditoriaAcesso.create).toHaveBeenCalledWith({
      data: {
        empresaId: "empresa-1",
        statusAnterior: "TRIAL",
        statusNovo: "CARENCIA",
        causa: "AVALIACAO_SESSAO",
      },
    });
  });

  it("concorrência: vira no-op sem exceção quando outro request já registrou a transição", async () => {
    mockTransaction();
    prismaMock.empresa.updateMany.mockResolvedValue({ count: 0 } as never);

    const resultado = await acessoService.registrarTransicao({
      empresaId: "empresa-1",
      anterior: StatusAcesso.TRIAL,
      novo: StatusAcesso.CARENCIA,
      causa: CausaTransicaoAcesso.AVALIACAO_SESSAO,
    });

    expect(resultado).toBeNull();
    expect(prismaMock.auditoriaAcesso.create).not.toHaveBeenCalled();
  });

  it("primeira transição da empresa: anterior nulo casa ultimoStatusAuditado null", async () => {
    mockTransaction();
    prismaMock.empresa.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.auditoriaAcesso.create.mockResolvedValue({
      ...linhaBase,
      statusAnterior: null,
      statusNovo: StatusAcesso.TRIAL,
      causa: CausaTransicaoAcesso.REGISTRO,
    } as never);

    await acessoService.registrarTransicao({
      empresaId: "empresa-1",
      anterior: null,
      novo: StatusAcesso.TRIAL,
      causa: CausaTransicaoAcesso.REGISTRO,
    });

    expect(prismaMock.empresa.updateMany).toHaveBeenCalledWith({
      where: { id: "empresa-1", ultimoStatusAuditado: null },
      data: { ultimoStatusAuditado: "TRIAL" },
    });
    expect(prismaMock.auditoriaAcesso.create).toHaveBeenCalledWith({
      data: {
        empresaId: "empresa-1",
        statusAnterior: null,
        statusNovo: "TRIAL",
        causa: "REGISTRO",
      },
    });
  });

  it.each([
    [CausaTransicaoAcesso.REGISTRO],
    [CausaTransicaoAcesso.BACKFILL],
    [CausaTransicaoAcesso.AVALIACAO_SESSAO],
  ])("causa %s chega intacta ao create", async (causa) => {
    mockTransaction();
    prismaMock.empresa.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.auditoriaAcesso.create.mockResolvedValue(linhaBase as never);

    await acessoService.registrarTransicao({
      empresaId: "empresa-1",
      anterior: null,
      novo: StatusAcesso.TRIAL,
      causa,
    });

    expect(prismaMock.auditoriaAcesso.create).toHaveBeenCalledWith({
      data: {
        empresaId: "empresa-1",
        statusAnterior: null,
        statusNovo: "TRIAL",
        causa,
      },
    });
  });
});
