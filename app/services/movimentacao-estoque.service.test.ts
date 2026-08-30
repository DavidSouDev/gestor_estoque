// @vitest-environment node
import { describe, expect, it } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { movimentacaoEstoqueService } from "./movimentacao-estoque.service";
import { TipoMovimentacao } from "@prisma/client";

const produtoBase = {
  id: "produto-1",
  empresaId: "empresa-1",
  codigo: "PROD-1",
  nome: "Produto Teste",
  descricao: null,
  categoria: "Geral",
  precoVarejo: 10,
  precoAtacado: 8,
  estoque: 10,
  fotoCapa: null,
  ordemCatalogo: 0,
  destaque: false,
  visivelCatalogo: true,
  ativo: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const movimentacaoBase = {
  id: "movimentacao-1",
  produtoId: "produto-1",
  usuarioId: "usuario-1",
  tipo: TipoMovimentacao.ENTRADA,
  quantidade: 5,
  motivo: null,
  createdAt: new Date(),
};

function mockTransaction() {
  prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) =>
      Promise.resolve(callback(prismaMock))
    );
}

describe("movimentacaoEstoqueService.list", () => {
  it("escopa a listagem por empresa via relação com produto", async () => {
    prismaMock.movimentacaoEstoque.findMany.mockResolvedValue([movimentacaoBase] as never);

    await movimentacaoEstoqueService.list("empresa-1");

    expect(prismaMock.movimentacaoEstoque.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { produto: { empresaId: "empresa-1" } },
        orderBy: { createdAt: "desc" },
      })
    );
  });
});

describe("movimentacaoEstoqueService.findById", () => {
  it("busca a movimentação pelo id com produto e usuário", async () => {
    prismaMock.movimentacaoEstoque.findUnique.mockResolvedValue(movimentacaoBase as never);

    await movimentacaoEstoqueService.findById("movimentacao-1");

    expect(prismaMock.movimentacaoEstoque.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "movimentacao-1" } })
    );
  });
});

describe("movimentacaoEstoqueService.create", () => {
  it("lança erro quando o produto não existe", async () => {
    mockTransaction();
    prismaMock.produto.findUnique.mockResolvedValue(null);

    await expect(
      movimentacaoEstoqueService.create({
        produtoId: "produto-inexistente",
        usuarioId: "usuario-1",
        empresaId: "empresa-1",
        tipo: TipoMovimentacao.ENTRADA,
        quantidade: 5,
      })
    ).rejects.toThrow("Produto não encontrado.");

    expect(prismaMock.produto.update).not.toHaveBeenCalled();
    expect(prismaMock.movimentacaoEstoque.create).not.toHaveBeenCalled();
  });

  it("lança erro quando o produto pertence a outra empresa", async () => {
    mockTransaction();
    prismaMock.produto.findUnique.mockResolvedValue({
      ...produtoBase,
      empresaId: "outra-empresa",
    } as never);

    await expect(
      movimentacaoEstoqueService.create({
        produtoId: "produto-1",
        usuarioId: "usuario-1",
        empresaId: "empresa-1",
        tipo: TipoMovimentacao.ENTRADA,
        quantidade: 5,
      })
    ).rejects.toThrow("Produto não encontrado.");

    expect(prismaMock.produto.update).not.toHaveBeenCalled();
  });

  it("soma a quantidade ao estoque atual em uma ENTRADA", async () => {
    mockTransaction();
    prismaMock.produto.findUnique.mockResolvedValue(produtoBase as never);
    prismaMock.produto.update.mockResolvedValue({ ...produtoBase, estoque: 15 } as never);
    prismaMock.movimentacaoEstoque.create.mockResolvedValue(movimentacaoBase as never);

    await movimentacaoEstoqueService.create({
      produtoId: "produto-1",
      usuarioId: "usuario-1",
      empresaId: "empresa-1",
      tipo: TipoMovimentacao.ENTRADA,
      quantidade: 5,
    });

    expect(prismaMock.produto.update).toHaveBeenCalledWith({
      where: { id: "produto-1" },
      data: { estoque: 15 },
    });
    expect(prismaMock.movimentacaoEstoque.create).toHaveBeenCalledWith({
      data: {
        produtoId: "produto-1",
        usuarioId: "usuario-1",
        tipo: TipoMovimentacao.ENTRADA,
        quantidade: 5,
        motivo: undefined,
      },
      include: expect.objectContaining({ produto: true }),
    });
  });

  it("subtrai a quantidade do estoque atual em uma SAIDA", async () => {
    mockTransaction();
    prismaMock.produto.findUnique.mockResolvedValue(produtoBase as never);
    prismaMock.produto.update.mockResolvedValue({ ...produtoBase, estoque: 7 } as never);
    prismaMock.movimentacaoEstoque.create.mockResolvedValue(movimentacaoBase as never);

    await movimentacaoEstoqueService.create({
      produtoId: "produto-1",
      usuarioId: "usuario-1",
      empresaId: "empresa-1",
      tipo: TipoMovimentacao.SAIDA,
      quantidade: 3,
    });

    expect(prismaMock.produto.update).toHaveBeenCalledWith({
      where: { id: "produto-1" },
      data: { estoque: 7 },
    });
  });

  it("lança erro quando a SAIDA deixaria o estoque negativo", async () => {
    mockTransaction();
    prismaMock.produto.findUnique.mockResolvedValue(produtoBase as never);

    await expect(
      movimentacaoEstoqueService.create({
        produtoId: "produto-1",
        usuarioId: "usuario-1",
        empresaId: "empresa-1",
        tipo: TipoMovimentacao.SAIDA,
        quantidade: 999,
      })
    ).rejects.toThrow("Estoque insuficiente.");

    expect(prismaMock.produto.update).not.toHaveBeenCalled();
    expect(prismaMock.movimentacaoEstoque.create).not.toHaveBeenCalled();
  });

  it("define o estoque diretamente com o valor informado em um AJUSTE", async () => {
    mockTransaction();
    prismaMock.produto.findUnique.mockResolvedValue(produtoBase as never);
    prismaMock.produto.update.mockResolvedValue({ ...produtoBase, estoque: 42 } as never);
    prismaMock.movimentacaoEstoque.create.mockResolvedValue(movimentacaoBase as never);

    await movimentacaoEstoqueService.create({
      produtoId: "produto-1",
      usuarioId: "usuario-1",
      empresaId: "empresa-1",
      tipo: TipoMovimentacao.AJUSTE,
      quantidade: 42,
    });

    expect(prismaMock.produto.update).toHaveBeenCalledWith({
      where: { id: "produto-1" },
      data: { estoque: 42 },
    });
  });
});

describe("movimentacaoEstoqueService.listByProduto", () => {
  it("lista as movimentações de um produto ordenadas por data desc", async () => {
    prismaMock.movimentacaoEstoque.findMany.mockResolvedValue([movimentacaoBase] as never);

    await movimentacaoEstoqueService.listByProduto("produto-1");

    expect(prismaMock.movimentacaoEstoque.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { produtoId: "produto-1" },
        orderBy: { createdAt: "desc" },
      })
    );
  });
});

describe("movimentacaoEstoqueService.delete", () => {
  it("remove a movimentação (hard delete)", async () => {
    prismaMock.movimentacaoEstoque.delete.mockResolvedValue(movimentacaoBase as never);

    await movimentacaoEstoqueService.delete("movimentacao-1");

    expect(prismaMock.movimentacaoEstoque.delete).toHaveBeenCalledWith({
      where: { id: "movimentacao-1" },
    });
  });
});
