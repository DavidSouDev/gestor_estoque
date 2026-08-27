import { prisma } from "@/lib/prisma";
import { TipoMovimentacao } from "@prisma/client";

export interface CreateMovimentacaoDTO {
  produtoId: string;
  usuarioId: string;
  empresaId: string;

  tipo: TipoMovimentacao;

  quantidade: number;

  motivo?: string;
}

class MovimentacaoEstoqueService {
  async list(empresaId: string) {
    return prisma.movimentacaoEstoque.findMany({
      where: {
        produto: {
          empresaId,
        },
      },
      include: {
        produto: true,
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async findById(id: string) {
    return prisma.movimentacaoEstoque.findUnique({
      where: {
        id,
      },
      include: {
        produto: true,
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
    });
  }

  async create(data: CreateMovimentacaoDTO) {
    return prisma.$transaction(async (tx) => {
      const produto = await tx.produto.findUnique({
        where: {
          id: data.produtoId,
        },
      });

      if (!produto || produto.empresaId !== data.empresaId) {
        throw new Error("Produto não encontrado.");
      }

      let novoEstoque = produto.estoque;

      switch (data.tipo) {
        case TipoMovimentacao.ENTRADA:
          novoEstoque += data.quantidade;
          break;

        case TipoMovimentacao.SAIDA:
          novoEstoque -= data.quantidade;

          if (novoEstoque < 0) {
            throw new Error("Estoque insuficiente.");
          }

          break;

        case TipoMovimentacao.AJUSTE:
          novoEstoque = data.quantidade;
          break;
      }

      await tx.produto.update({
        where: {
          id: produto.id,
        },
        data: {
          estoque: novoEstoque,
        },
      });

      return tx.movimentacaoEstoque.create({
        data: {
          produtoId: data.produtoId,
          usuarioId: data.usuarioId,
          tipo: data.tipo,
          quantidade: data.quantidade,
          motivo: data.motivo,
        },
        include: {
          produto: true,
          usuario: {
            select: {
              id: true,
              nome: true,
            },
          },
        },
      });
    });
  }

  async listByProduto(produtoId: string) {
    return prisma.movimentacaoEstoque.findMany({
      where: {
        produtoId,
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async delete(id: string) {
    return prisma.movimentacaoEstoque.delete({
      where: {
        id,
      },
    });
  }
}

export const movimentacaoEstoqueService = new MovimentacaoEstoqueService();