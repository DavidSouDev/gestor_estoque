// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { promocaoService } from "./promocao.service";

const promocaoBase = {
  id: "promocao-1",
  empresaId: "empresa-1",
  nome: "Promoção Teste",
  dataInicio: new Date("2026-01-01"),
  dataFim: new Date("2026-12-31"),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("promocaoService.listVigentesByEmpresa", () => {
  it("filtra promoções vigentes (dataInicio <= agora <= dataFim) escopadas por empresa", async () => {
    vi.useFakeTimers();
    const agora = new Date("2026-08-30T12:00:00.000Z");
    vi.setSystemTime(agora);

    prismaMock.promocao.findMany.mockResolvedValue([promocaoBase] as never);

    await promocaoService.listVigentesByEmpresa("empresa-1");

    expect(prismaMock.promocao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          empresaId: "empresa-1",
          dataInicio: { lte: agora },
          dataFim: { gte: agora },
        },
        orderBy: { dataInicio: "desc" },
      })
    );

    vi.useRealTimers();
  });
});

describe("promocaoService.list", () => {
  it("escopa a listagem por empresa", async () => {
    prismaMock.promocao.findMany.mockResolvedValue([promocaoBase] as never);

    await promocaoService.list("empresa-1");

    expect(prismaMock.promocao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { empresaId: "empresa-1" },
        orderBy: { dataInicio: "desc" },
      })
    );
  });
});

describe("promocaoService.findById", () => {
  it("busca a promoção pelo id com itens, produtos e combos", async () => {
    prismaMock.promocao.findUnique.mockResolvedValue(promocaoBase as never);

    await promocaoService.findById("promocao-1");

    expect(prismaMock.promocao.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "promocao-1" } })
    );
  });
});

describe("promocaoService.create", () => {
  it("cria a promoção com os itens aninhados, quando o item pertence à empresa", async () => {
    prismaMock.produto.findMany.mockResolvedValue([{ id: "produto-1" }] as never);
    prismaMock.combo.findMany.mockResolvedValue([] as never);
    prismaMock.promocao.create.mockResolvedValue(promocaoBase as never);

    await promocaoService.create({
      empresaId: "empresa-1",
      nome: "Promoção Teste",
      dataInicio: promocaoBase.dataInicio,
      dataFim: promocaoBase.dataFim,
      itens: [{ produtoId: "produto-1", preco: 9.9 }],
    });

    expect(prismaMock.produto.findMany).toHaveBeenCalledWith({
      where: { empresaId: "empresa-1" },
      select: { id: true },
    });
    expect(prismaMock.promocao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          empresaId: "empresa-1",
          nome: "Promoção Teste",
          dataInicio: promocaoBase.dataInicio,
          dataFim: promocaoBase.dataFim,
          itens: {
            create: [{ produtoId: "produto-1", comboId: undefined, preco: 9.9 }],
          },
        }),
      })
    );
  });

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * Sem este filtro, a empresa A cria uma promoção referenciando um produto da
   * empresa B e passa a expor os dados dele (preço, estoque, fotos) via
   * `GET /api/promocoes/[id]` e na própria vitrine pública de A.
   */
  it("rejeita produtoId/comboId que não pertence à empresa informada", async () => {
    prismaMock.produto.findMany.mockResolvedValue([] as never);
    prismaMock.combo.findMany.mockResolvedValue([] as never);

    await expect(
      promocaoService.create({
        empresaId: "empresa-1",
        nome: "Promoção Teste",
        dataInicio: promocaoBase.dataInicio,
        dataFim: promocaoBase.dataFim,
        itens: [{ produtoId: "produto-de-outra-empresa", preco: 9.9 }],
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(prismaMock.promocao.create).not.toHaveBeenCalled();
  });
});

describe("promocaoService.update", () => {
  it("repassa os dados informados para o prisma", async () => {
    prismaMock.promocao.update.mockResolvedValue(promocaoBase as never);

    await promocaoService.update("promocao-1", { nome: "Novo nome" });

    expect(prismaMock.promocao.update).toHaveBeenCalledWith({
      where: { id: "promocao-1" },
      data: { nome: "Novo nome" },
    });
  });
});

describe("promocaoService.delete", () => {
  it("remove a promoção (hard delete)", async () => {
    prismaMock.promocao.delete.mockResolvedValue(promocaoBase as never);

    await promocaoService.delete("promocao-1");

    expect(prismaMock.promocao.delete).toHaveBeenCalledWith({
      where: { id: "promocao-1" },
    });
  });
});

describe("promocaoService.updateItens", () => {
  it("substitui os itens da promoção dentro de uma transação, quando o item pertence à empresa", async () => {
    prismaMock.produto.findMany.mockResolvedValue([{ id: "produto-1" }] as never);
    prismaMock.combo.findMany.mockResolvedValue([] as never);
    prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) =>
      Promise.resolve(callback(prismaMock))
    );
    prismaMock.promocaoItem.deleteMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.promocaoItem.createMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.promocao.findUnique.mockResolvedValue(promocaoBase as never);

    const itens = [{ produtoId: "produto-1", preco: 9.9 }];

    const resultado = await promocaoService.updateItens("promocao-1", itens, "empresa-1");

    expect(prismaMock.promocaoItem.deleteMany).toHaveBeenCalledWith({
      where: { promocaoId: "promocao-1" },
    });
    expect(prismaMock.promocaoItem.createMany).toHaveBeenCalledWith({
      data: [{ promocaoId: "promocao-1", produtoId: "produto-1", comboId: undefined, preco: 9.9 }],
    });
    expect(prismaMock.promocao.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "promocao-1" } })
    );
    expect(resultado).toEqual(promocaoBase);
  });

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * Mesma defesa de `create`: um `produtoId` que não pertence à empresa não
   * pode substituir os itens de uma promoção.
   */
  it("rejeita produtoId/comboId que não pertence à empresa informada", async () => {
    prismaMock.produto.findMany.mockResolvedValue([] as never);
    prismaMock.combo.findMany.mockResolvedValue([] as never);

    await expect(
      promocaoService.updateItens(
        "promocao-1",
        [{ produtoId: "produto-de-outra-empresa", preco: 9.9 }],
        "empresa-1"
      )
    ).rejects.toMatchObject({ status: 400 });

    expect(prismaMock.promocaoItem.deleteMany).not.toHaveBeenCalled();
  });
});

describe("promocaoService.listAtivas", () => {
  it("lista todas as promoções vigentes, sem escopo de empresa", async () => {
    vi.useFakeTimers();
    const agora = new Date("2026-08-30T12:00:00.000Z");
    vi.setSystemTime(agora);

    prismaMock.promocao.findMany.mockResolvedValue([promocaoBase] as never);

    await promocaoService.listAtivas();

    expect(prismaMock.promocao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dataInicio: { lte: agora },
          dataFim: { gte: agora },
        },
      })
    );

    vi.useRealTimers();
  });
});
