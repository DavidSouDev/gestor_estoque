// @vitest-environment node
import { describe, expect, it } from "vitest";
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

describe("comboService.findCatalogoById", () => {
  it("busca um combo ativo, visível e não deletado pelo id", async () => {
    prismaMock.combo.findFirst.mockResolvedValue(comboBase as never);

    await comboService.findCatalogoById("combo-1");

    expect(prismaMock.combo.findFirst).toHaveBeenCalledWith({
      where: { id: "combo-1", ativo: true, visivel: true, deletedAt: null },
      select: COMBO_CATALOGO_SELECT,
    });
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
    prismaMock.comboItem.deleteMany.mockResolvedValue({ count: 2 } as never);
    prismaMock.comboItem.createMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.combo.findUnique.mockResolvedValue(comboBase as never);

    const itens = [{ produtoId: "produto-1", quantidade: 2 }];

    const resultado = await comboService.updateItens("combo-1", itens);

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
});
