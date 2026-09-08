// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { comboService, COMBO_CATALOGO_SELECT } from "./combo.service";

const comboBase = {
  id: "combo-1",
  empresaId: "empresa-1",
  nome: "Combo Teste",
  descricao: null,
  preco: 20,
  fotoCapa: null,
  ordemCatalogo: 0,
  destaque: false,
  ativo: true,
  visivel: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe("comboService.listCatalogo", () => {
  it("lista apenas combos ativos, visíveis e não deletados, ordenados", async () => {
    prismaMock.combo.findMany.mockResolvedValue([comboBase] as never);

    const resultado = await comboService.listCatalogo("empresa-1");

    expect(prismaMock.combo.findMany).toHaveBeenCalledWith({
      where: { empresaId: "empresa-1", ativo: true, visivel: true, deletedAt: null },
      select: COMBO_CATALOGO_SELECT,
      orderBy: { ordemCatalogo: "asc" },
    });
    expect(resultado).toEqual([comboBase]);
  });
});

/**
 * Fixtures espelhadas de `produto.service.test.ts` — o gate de combo é o analog
 * byte-paralelo do de produto, e os testes acompanham. Relógio congelado porque
 * `findCatalogoById` lê `new Date()` internamente.
 */
const AGORA = new Date("2026-06-15T12:00:00.000Z");

const BILLING = {
  TRIAL: {
    acessoAte: null,
    trialFim: new Date("2026-07-01T03:00:00.000Z"),
    canceladoEm: null,
    acessoVitalicio: false,
  },
  EM_DIA: {
    acessoAte: new Date("2026-07-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  },
  // Venceu em 10/06; a carência de 10 dias vai até 20/06, e `AGORA` é 15/06.
  CARENCIA: {
    acessoAte: new Date("2026-06-10T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  },
  VITALICIO: {
    acessoAte: null,
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: true,
  },
  // Venceu em 01/01; a carência acabou em 11/01, muito antes de `AGORA`.
  BLOQUEADO: {
    acessoAte: new Date("2026-01-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  },
  CANCELADO: {
    acessoAte: new Date("2026-01-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: new Date("2026-01-05T03:00:00.000Z"),
    acessoVitalicio: false,
  },
} as const;

describe("comboService.findCatalogoById", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockComboDeEmpresa(billing: (typeof BILLING)[keyof typeof BILLING]) {
    prismaMock.combo.findFirst.mockResolvedValue({
      ...comboBase,
      empresa: { id: "empresa-1", ...billing },
    } as never);
  }

  it("busca um combo ativo, visível, não deletado e de tenant vivo pelo id", async () => {
    mockComboDeEmpresa(BILLING.EM_DIA);

    await comboService.findCatalogoById("combo-1");

    expect(prismaMock.combo.findFirst).toHaveBeenCalledWith({
      where: {
        id: "combo-1",
        ativo: true,
        visivel: true,
        deletedAt: null,
        empresa: { deletedAt: null },
      },
      select: {
        ...COMBO_CATALOGO_SELECT,
        empresa: {
          select: {
            id: true,
            acessoAte: true,
            trialFim: true,
            canceladoEm: true,
            acessoVitalicio: true,
          },
        },
      },
    });
  });

  it("filtra o tenant por empresa.deletedAt no próprio where (T-04-05)", async () => {
    mockComboDeEmpresa(BILLING.EM_DIA);

    await comboService.findCatalogoById("combo-1");

    const args = vi.mocked(prismaMock.combo.findFirst).mock.calls[0][0];

    expect(args).toMatchObject({ where: { empresa: { deletedAt: null } } });
  });

  it("devolve null quando a empresa dona está BLOQUEADO", async () => {
    mockComboDeEmpresa(BILLING.BLOQUEADO);

    await expect(comboService.findCatalogoById("combo-1")).resolves.toBeNull();
  });

  it("devolve null quando a empresa dona está CANCELADO (D-06: idêntico a BLOQUEADO)", async () => {
    mockComboDeEmpresa(BILLING.CANCELADO);

    await expect(comboService.findCatalogoById("combo-1")).resolves.toBeNull();
  });

  it.each(["TRIAL", "EM_DIA", "CARENCIA", "VITALICIO"] as const)(
    "devolve o combo quando a empresa dona está %s",
    async (status) => {
      mockComboDeEmpresa(BILLING[status]);

      const resultado = await comboService.findCatalogoById("combo-1");

      expect(resultado).not.toBeNull();
      expect(resultado).toMatchObject({ id: "combo-1", empresaId: "empresa-1" });
    }
  );

  it("não vaza a chave empresa no corpo público (T-04-01)", async () => {
    mockComboDeEmpresa(BILLING.EM_DIA);

    const resultado = await comboService.findCatalogoById("combo-1");

    expect(resultado).not.toHaveProperty("empresa");
    expect(resultado).toEqual(comboBase);
  });

  it("gasta exatamente uma query quando rejeita por bloqueio (T-04-02)", async () => {
    mockComboDeEmpresa(BILLING.BLOQUEADO);

    await comboService.findCatalogoById("combo-1");

    expect(prismaMock.combo.findFirst).toHaveBeenCalledTimes(1);
  });

  it("gasta exatamente uma query quando o combo não existe", async () => {
    prismaMock.combo.findFirst.mockResolvedValue(null);

    await expect(comboService.findCatalogoById("inexistente")).resolves.toBeNull();
    expect(prismaMock.combo.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("comboService.list", () => {
  it("escopa por empresa e exclui deletados", async () => {
    prismaMock.combo.findMany.mockResolvedValue([comboBase] as never);

    await comboService.list("empresa-1");

    expect(prismaMock.combo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { empresaId: "empresa-1", deletedAt: null },
      })
    );
  });
});

describe("comboService.findById", () => {
  it("busca combo não deletado pelo id com itens e promoções", async () => {
    prismaMock.combo.findFirst.mockResolvedValue(comboBase as never);

    await comboService.findById("combo-1");

    expect(prismaMock.combo.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "combo-1", deletedAt: null },
      })
    );
  });
});

describe("comboService.create", () => {
  it("aplica valores padrão quando campos opcionais não são informados", async () => {
    prismaMock.combo.create.mockResolvedValue(comboBase as never);

    await comboService.create({
      empresaId: "empresa-1",
      nome: "Combo Teste",
      preco: 20,
    });

    expect(prismaMock.combo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ordemCatalogo: 0,
        destaque: false,
        ativo: true,
        visivel: true,
      }),
    });
  });

  it("respeita valores explicitamente informados", async () => {
    prismaMock.combo.create.mockResolvedValue(comboBase as never);

    await comboService.create({
      empresaId: "empresa-1",
      nome: "Combo Teste",
      preco: 20,
      ordemCatalogo: 5,
      destaque: true,
      ativo: false,
      visivel: false,
    });

    expect(prismaMock.combo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ordemCatalogo: 5,
        destaque: true,
        ativo: false,
        visivel: false,
      }),
    });
  });
});

describe("comboService.update", () => {
  it("repassa os dados informados para o prisma", async () => {
    prismaMock.combo.update.mockResolvedValue(comboBase as never);

    await comboService.update("combo-1", { nome: "Novo nome" });

    expect(prismaMock.combo.update).toHaveBeenCalledWith({
      where: { id: "combo-1" },
      data: { nome: "Novo nome" },
    });
  });
});

describe("comboService.delete", () => {
  it("faz soft delete marcando ativo=false e preenchendo deletedAt", async () => {
    prismaMock.combo.update.mockResolvedValue(comboBase as never);

    await comboService.delete("combo-1");

    expect(prismaMock.combo.update).toHaveBeenCalledWith({
      where: { id: "combo-1" },
      data: { ativo: false, deletedAt: expect.any(Date) },
    });
  });
});

describe("comboService.reorder", () => {
  it("atualiza apenas ordemCatalogo", async () => {
    prismaMock.combo.update.mockResolvedValue(comboBase as never);

    await comboService.reorder("combo-1", 3);

    expect(prismaMock.combo.update).toHaveBeenCalledWith({
      where: { id: "combo-1" },
      data: { ordemCatalogo: 3 },
    });
  });
});

describe("comboService.toggleCatalogo", () => {
  it("inverte a visibilidade atual no catálogo", async () => {
    prismaMock.combo.findUnique.mockResolvedValue({ visivel: true } as never);
    prismaMock.combo.update.mockResolvedValue(comboBase as never);

    await comboService.toggleCatalogo("combo-1");

    expect(prismaMock.combo.update).toHaveBeenCalledWith({
      where: { id: "combo-1" },
      data: { visivel: false },
    });
  });

  it("lança erro quando o combo não existe", async () => {
    prismaMock.combo.findUnique.mockResolvedValue(null);

    await expect(comboService.toggleCatalogo("inexistente")).rejects.toThrow(
      "Combo não encontrado."
    );
    expect(prismaMock.combo.update).not.toHaveBeenCalled();
  });
});

describe("comboService.toggleDestaque", () => {
  it("inverte o destaque atual", async () => {
    prismaMock.combo.findUnique.mockResolvedValue({ destaque: false } as never);
    prismaMock.combo.update.mockResolvedValue(comboBase as never);

    await comboService.toggleDestaque("combo-1");

    expect(prismaMock.combo.update).toHaveBeenCalledWith({
      where: { id: "combo-1" },
      data: { destaque: true },
    });
  });

  it("lança erro quando o combo não existe", async () => {
    prismaMock.combo.findUnique.mockResolvedValue(null);

    await expect(comboService.toggleDestaque("inexistente")).rejects.toThrow(
      "Combo não encontrado."
    );
    expect(prismaMock.combo.update).not.toHaveBeenCalled();
  });
});

describe("comboService.updateItens", () => {
  it("substitui os itens do combo dentro de uma transação", async () => {
    prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) =>
      Promise.resolve(callback(prismaMock))
    );
    prismaMock.produto.findMany.mockResolvedValue([{ id: "produto-1" }] as never);
    prismaMock.comboItem.deleteMany.mockResolvedValue({ count: 2 } as never);
    prismaMock.comboItem.createMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.combo.findUnique.mockResolvedValue(comboBase as never);

    const itens = [{ produtoId: "produto-1", quantidade: 2 }];

    const resultado = await comboService.updateItens("combo-1", itens, "empresa-1");

    expect(prismaMock.produto.findMany).toHaveBeenCalledWith({
      where: { empresaId: "empresa-1" },
      select: { id: true },
    });
    expect(prismaMock.comboItem.deleteMany).toHaveBeenCalledWith({
      where: { comboId: "combo-1" },
    });
    expect(prismaMock.comboItem.createMany).toHaveBeenCalledWith({
      data: [{ comboId: "combo-1", produtoId: "produto-1", quantidade: 2 }],
    });
    expect(prismaMock.combo.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "combo-1" } })
    );
    expect(resultado).toEqual(comboBase);
  });

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * Mesma defesa que `promocaoService.updateItens` já tem: sem filtrar contra
   * a empresa, um combo poderia referenciar produto de OUTRO tenant e expô-lo
   * (preço, estoque, fotos) na vitrine pública errada.
   */
  it("ignora produtoId que não pertence à empresa informada", async () => {
    prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) =>
      Promise.resolve(callback(prismaMock))
    );
    prismaMock.produto.findMany.mockResolvedValue([{ id: "produto-1" }] as never);

    const itens = [{ produtoId: "produto-de-outra-empresa", quantidade: 1 }];

    await expect(
      comboService.updateItens("combo-1", itens, "empresa-1")
    ).rejects.toMatchObject({
      message: "Nenhum item válido informado para esta empresa.",
      status: 400,
    });

    expect(prismaMock.comboItem.deleteMany).not.toHaveBeenCalled();
  });
});
