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
  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * Sem este piso, ENTRADA com quantidade negativa decrementaria o estoque
   * por fora da checagem de "Estoque insuficiente" (exclusiva de SAIDA), e
   * AJUSTE gravaria um valor negativo direto — mesmo com os chamadores atuais
   * (Zod `.positive()` na API, checagem manual na Server Action) já barrando
   * isso antes de chegar aqui.
   */
  it.each([TipoMovimentacao.ENTRADA, TipoMovimentacao.SAIDA, TipoMovimentacao.AJUSTE])(
    "recusa quantidade <= 0 para %s, sem tocar o banco",
    async (tipo) => {
      mockTransaction();

      await expect(
        movimentacaoEstoqueService.create({
          produtoId: "produto-1",
          usuarioId: "usuario-1",
          empresaId: "empresa-1",
          tipo,
          quantidade: -5,
        })
      ).rejects.toMatchObject({ message: "Quantidade deve ser maior que zero.", status: 400 });

      expect(prismaMock.produto.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.produto.updateMany).not.toHaveBeenCalled();
    }
  );

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
    ).rejects.toMatchObject({ message: "Produto não encontrado.", status: 404 });

    expect(prismaMock.produto.updateMany).not.toHaveBeenCalled();
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
    ).rejects.toMatchObject({ message: "Produto não encontrado.", status: 404 });

    expect(prismaMock.produto.updateMany).not.toHaveBeenCalled();
  });

  it("soma a quantidade ao estoque atual em uma ENTRADA, via increment atômico", async () => {
    mockTransaction();
    prismaMock.produto.findUnique.mockResolvedValue(produtoBase as never);
    prismaMock.produto.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.movimentacaoEstoque.create.mockResolvedValue(movimentacaoBase as never);

    await movimentacaoEstoqueService.create({
      produtoId: "produto-1",
      usuarioId: "usuario-1",
      empresaId: "empresa-1",
      tipo: TipoMovimentacao.ENTRADA,
      quantidade: 5,
    });

    expect(prismaMock.produto.updateMany).toHaveBeenCalledWith({
      where: { id: "produto-1", empresaId: "empresa-1" },
      data: { estoque: { increment: 5 } },
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

  it("subtrai a quantidade do estoque atual em uma SAIDA, com a checagem de saldo no WHERE", async () => {
    mockTransaction();
    prismaMock.produto.findUnique.mockResolvedValue(produtoBase as never);
    prismaMock.produto.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.movimentacaoEstoque.create.mockResolvedValue(movimentacaoBase as never);

    await movimentacaoEstoqueService.create({
      produtoId: "produto-1",
      usuarioId: "usuario-1",
      empresaId: "empresa-1",
      tipo: TipoMovimentacao.SAIDA,
      quantidade: 3,
    });

    expect(prismaMock.produto.updateMany).toHaveBeenCalledWith({
      where: { id: "produto-1", empresaId: "empresa-1", estoque: { gte: 3 } },
      data: { estoque: { decrement: 3 } },
    });
  });

  it("lança erro quando a SAIDA deixaria o estoque negativo", async () => {
    mockTransaction();
    prismaMock.produto.findUnique.mockResolvedValue(produtoBase as never);
    prismaMock.produto.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      movimentacaoEstoqueService.create({
        produtoId: "produto-1",
        usuarioId: "usuario-1",
        empresaId: "empresa-1",
        tipo: TipoMovimentacao.SAIDA,
        quantidade: 999,
      })
    ).rejects.toMatchObject({ message: "Estoque insuficiente.", status: 409 });

    expect(prismaMock.movimentacaoEstoque.create).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * Prova a correção da race condition: mesmo com `estoque: 10` no
   * `findUnique` (lido ANTES), se o `updateMany` condicional falhar (`count:
   * 0` — outra transação já consumiu o estoque entre a leitura e a escrita),
   * o resultado é "Estoque insuficiente.", nunca um decremento aplicado sobre
   * dado desatualizado.
   */
  it("rejeita a SAIDA quando outra transação concorrente já consumiu o estoque entre a leitura e a escrita", async () => {
    mockTransaction();
    prismaMock.produto.findUnique.mockResolvedValue({ ...produtoBase, estoque: 10 } as never);
    // O `updateMany` condicional (`estoque >= quantidade` no WHERE) é quem
    // decide de verdade — aqui ele falha mesmo o `findUnique` tendo mostrado
    // estoque "suficiente", simulando a corrida ganha por outra transação.
    prismaMock.produto.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      movimentacaoEstoqueService.create({
        produtoId: "produto-1",
        usuarioId: "usuario-1",
        empresaId: "empresa-1",
        tipo: TipoMovimentacao.SAIDA,
        quantidade: 8,
      })
    ).rejects.toMatchObject({ message: "Estoque insuficiente.", status: 409 });

    expect(prismaMock.movimentacaoEstoque.create).not.toHaveBeenCalled();
  });

  it("define o estoque diretamente com o valor informado em um AJUSTE", async () => {
    mockTransaction();
    prismaMock.produto.findUnique.mockResolvedValue(produtoBase as never);
    prismaMock.produto.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.movimentacaoEstoque.create.mockResolvedValue(movimentacaoBase as never);

    await movimentacaoEstoqueService.create({
      produtoId: "produto-1",
      usuarioId: "usuario-1",
      empresaId: "empresa-1",
      tipo: TipoMovimentacao.AJUSTE,
      quantidade: 42,
    });

    expect(prismaMock.produto.updateMany).toHaveBeenCalledWith({
      where: { id: "produto-1", empresaId: "empresa-1" },
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
  it("lança erro quando a movimentação não existe", async () => {
    mockTransaction();
    prismaMock.movimentacaoEstoque.findUnique.mockResolvedValue(null);

    await expect(movimentacaoEstoqueService.delete("inexistente")).rejects.toMatchObject({
      message: "Movimentação não encontrada.",
      status: 404,
    });

    expect(prismaMock.produto.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.movimentacaoEstoque.delete).not.toHaveBeenCalled();
  });

  it("recusa remover um AJUSTE, porque o valor anterior não fica registrado", async () => {
    mockTransaction();
    prismaMock.movimentacaoEstoque.findUnique.mockResolvedValue({
      ...movimentacaoBase,
      tipo: TipoMovimentacao.AJUSTE,
    } as never);

    await expect(movimentacaoEstoqueService.delete("movimentacao-1")).rejects.toMatchObject({
      status: 422,
    });

    expect(prismaMock.produto.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.movimentacaoEstoque.delete).not.toHaveBeenCalled();
  });

  it("reverte uma ENTRADA decrementando o estoque antes de apagar o registro", async () => {
    mockTransaction();
    prismaMock.movimentacaoEstoque.findUnique.mockResolvedValue({
      ...movimentacaoBase,
      tipo: TipoMovimentacao.ENTRADA,
      quantidade: 5,
    } as never);
    prismaMock.produto.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.movimentacaoEstoque.delete.mockResolvedValue(movimentacaoBase as never);

    await movimentacaoEstoqueService.delete("movimentacao-1");

    expect(prismaMock.produto.updateMany).toHaveBeenCalledWith({
      where: { id: "produto-1", estoque: { gte: 5 } },
      data: { estoque: { decrement: 5 } },
    });
    expect(prismaMock.movimentacaoEstoque.delete).toHaveBeenCalledWith({
      where: { id: "movimentacao-1" },
    });
  });

  it("recusa remover uma ENTRADA se o estoque já foi consumido abaixo da quantidade dela", async () => {
    mockTransaction();
    prismaMock.movimentacaoEstoque.findUnique.mockResolvedValue({
      ...movimentacaoBase,
      tipo: TipoMovimentacao.ENTRADA,
      quantidade: 5,
    } as never);
    prismaMock.produto.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(movimentacaoEstoqueService.delete("movimentacao-1")).rejects.toMatchObject({
      status: 409,
    });

    expect(prismaMock.movimentacaoEstoque.delete).not.toHaveBeenCalled();
  });

  it("reverte uma SAIDA incrementando o estoque antes de apagar o registro", async () => {
    mockTransaction();
    prismaMock.movimentacaoEstoque.findUnique.mockResolvedValue({
      ...movimentacaoBase,
      tipo: TipoMovimentacao.SAIDA,
      quantidade: 3,
    } as never);
    prismaMock.produto.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.movimentacaoEstoque.delete.mockResolvedValue(movimentacaoBase as never);

    await movimentacaoEstoqueService.delete("movimentacao-1");

    expect(prismaMock.produto.updateMany).toHaveBeenCalledWith({
      where: { id: "produto-1" },
      data: { estoque: { increment: 3 } },
    });
    expect(prismaMock.movimentacaoEstoque.delete).toHaveBeenCalledWith({
      where: { id: "movimentacao-1" },
    });
  });
});
