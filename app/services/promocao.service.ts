import { prisma } from "@/lib/prisma";
import { PRODUTO_CATALOGO_SELECT } from "./produto.service";
import { COMBO_CATALOGO_SELECT } from "./combo.service";

export interface PromocaoItemDTO {
  produtoId?: string;
  comboId?: string;
  preco: number;
}

export interface CreatePromocaoDTO {
  empresaId: string;

  nome: string;

  dataInicio: Date;
  dataFim: Date;

  itens: PromocaoItemDTO[];
}

export interface UpdatePromocaoDTO {
  nome?: string;

  dataInicio?: Date;
  dataFim?: Date;
}

class PromocaoService {
  async listVigentesByEmpresa(empresaId: string) {
    const agora = new Date();

    return prisma.promocao.findMany({
      where: {
        empresaId,
        dataInicio: { lte: agora },
        dataFim: { gte: agora },
      },
      select: {
        id: true,
        nome: true,
        dataInicio: true,
        dataFim: true,
        itens: {
          select: {
            id: true,
            preco: true,
            produto: { select: PRODUTO_CATALOGO_SELECT },
            combo: { select: COMBO_CATALOGO_SELECT },
          },
        },
      },
      orderBy: {
        dataInicio: "desc",
      },
    });
  }

  async list(empresaId: string) {
    return prisma.promocao.findMany({
      where: {
        empresaId,
      },
      include: {
        itens: {
          include: {
            produto: true,
            combo: true,
          },
        },
      },
      orderBy: {
        dataInicio: "desc",
      },
    });
  }

  async findById(id: string) {
    return prisma.promocao.findUnique({
      where: {
        id,
      },
      include: {
        itens: {
          include: {
            produto: true,
            combo: true,
          },
        },
      },
    });
  }

  async create(data: CreatePromocaoDTO) {
    return prisma.promocao.create({
      data: {
        empresaId: data.empresaId,

        nome: data.nome,

        dataInicio: data.dataInicio,
        dataFim: data.dataFim,

        itens: {
          create: data.itens.map((item) => ({
            produtoId: item.produtoId,
            comboId: item.comboId,
            preco: item.preco,
          })),
        },
      },
      include: {
        itens: {
          include: {
            produto: true,
            combo: true,
          },
        },
      },
    });
  }

  async update(id: string, data: UpdatePromocaoDTO) {
    return prisma.promocao.update({
      where: {
        id,
      },
      data,
    });
  }

  async delete(id: string) {
    return prisma.promocao.delete({
      where: {
        id,
      },
    });
  }

  async updateItens(
    promocaoId: string,
    itens: PromocaoItemDTO[]
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.promocaoItem.deleteMany({
        where: {
          promocaoId,
        },
      });

      await tx.promocaoItem.createMany({
        data: itens.map((item) => ({
          promocaoId,
          produtoId: item.produtoId,
          comboId: item.comboId,
          preco: item.preco,
        })),
      });

      return tx.promocao.findUnique({
        where: {
          id: promocaoId,
        },
        include: {
          itens: {
            include: {
              produto: true,
              combo: true,
            },
          },
        },
      });
    });
  }

  async listAtivas() {
    const agora = new Date();

    return prisma.promocao.findMany({
      where: {
        dataInicio: {
          lte: agora,
        },
        dataFim: {
          gte: agora,
        },
      },
      include: {
        itens: {
          include: {
            produto: true,
            combo: true,
          },
        },
      },
    });
  }
}

export const promocaoService = new PromocaoService();