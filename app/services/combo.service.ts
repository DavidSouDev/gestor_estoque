import { prisma } from "@/lib/prisma";

export interface CreateComboDTO {
  empresaId: string;

  nome: string;
  descricao?: string;

  preco: number;

  fotoCapa?: string;

  ordemCatalogo?: number;

  destaque?: boolean;

  ativo?: boolean;
  visivel?: boolean;
}

export interface UpdateComboDTO {
  nome?: string;
  descricao?: string;

  preco?: number;

  fotoCapa?: string;

  ordemCatalogo?: number;

  destaque?: boolean;

  ativo?: boolean;
  visivel?: boolean;
}

class ComboService {
  async list() {
    return prisma.combo.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        itens: {
          include: {
            produto: true,
          },
        },
        promocoes: {
          include: {
            promocao: true,
          },
        },
      },
      orderBy: {
        ordemCatalogo: "asc",
      },
    });
  }

  async findById(id: string) {
    return prisma.combo.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        itens: {
          include: {
            produto: true,
          },
        },
        promocoes: {
          include: {
            promocao: true,
          },
        },
      },
    });
  }

  async create(data: CreateComboDTO) {
    return prisma.combo.create({
      data: {
        empresaId: data.empresaId,

        nome: data.nome,
        descricao: data.descricao,

        preco: data.preco,

        fotoCapa: data.fotoCapa,

        ordemCatalogo: data.ordemCatalogo ?? 0,

        destaque: data.destaque ?? false,

        ativo: data.ativo ?? true,
        visivel: data.visivel ?? true,
      },
    });
  }

  async update(id: string, data: UpdateComboDTO) {
    return prisma.combo.update({
      where: {
        id,
      },
      data,
    });
  }

  async delete(id: string) {
    return prisma.combo.update({
      where: {
        id,
      },
      data: {
        ativo: false,
        deletedAt: new Date(),
      },
    });
  }

  async reorder(id: string, ordemCatalogo: number) {
    return prisma.combo.update({
      where: {
        id,
      },
      data: {
        ordemCatalogo,
      },
    });
  }

  async toggleCatalogo(id: string) {
    const combo = await prisma.combo.findUnique({
      where: {
        id,
      },
      select: {
        visivel: true,
      },
    });

    if (!combo) {
      throw new Error("Combo não encontrado.");
    }

    return prisma.combo.update({
      where: {
        id,
      },
      data: {
        visivel: !combo.visivel,
      },
    });
  }

  async toggleDestaque(id: string) {
    const combo = await prisma.combo.findUnique({
      where: {
        id,
      },
      select: {
        destaque: true,
      },
    });

    if (!combo) {
      throw new Error("Combo não encontrado.");
    }

    return prisma.combo.update({
      where: {
        id,
      },
      data: {
        destaque: !combo.destaque,
      },
    });
  }

  async updateItens(
    comboId: string,
    itens: {
      produtoId: string;
      quantidade: number;
    }[]
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.comboItem.deleteMany({
        where: {
          comboId,
        },
      });

      await tx.comboItem.createMany({
        data: itens.map((item) => ({
          comboId,
          produtoId: item.produtoId,
          quantidade: item.quantidade,
        })),
      });

      return tx.combo.findUnique({
        where: {
          id: comboId,
        },
        include: {
          itens: {
            include: {
              produto: true,
            },
          },
        },
      });
    });
  }
}

export const comboService = new ComboService();