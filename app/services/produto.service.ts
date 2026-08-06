import { prisma } from "@/lib/prisma";

export interface CreateProdutoDTO {
  empresaId: string;
  codigo: string;
  nome: string;
  descricao?: string;

  precoVarejo: number;
  precoAtacado: number;

  estoque?: number;

  fotoCapa?: string;

  ordemCatalogo?: number;

  destaque?: boolean;

  ativo?: boolean;
  visivelCatalogo?: boolean;
}

export interface UpdateProdutoDTO {
  codigo?: string;
  nome?: string;
  descricao?: string;

  precoVarejo?: number;
  precoAtacado?: number;

  estoque?: number;

  fotoCapa?: string;

  ordemCatalogo?: number;

  destaque?: boolean;

  ativo?: boolean;
  visivelCatalogo?: boolean;
}

class ProdutoService {
  async list() {
    return prisma.produto.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        imagens: true,
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
    return prisma.produto.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        imagens: true,
        movimentacoes: {
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
        },
        promocoes: {
          include: {
            promocao: true,
          },
        },
      },
    });
  }

  async create(data: CreateProdutoDTO) {
    return prisma.produto.create({
      data: {
        empresaId: data.empresaId,

        codigo: data.codigo,

        nome: data.nome,
        descricao: data.descricao,

        precoVarejo: data.precoVarejo,
        precoAtacado: data.precoAtacado,

        estoque: data.estoque ?? 0,

        fotoCapa: data.fotoCapa,

        ordemCatalogo: data.ordemCatalogo ?? 0,

        destaque: data.destaque ?? false,

        ativo: data.ativo ?? true,

        visivelCatalogo: data.visivelCatalogo ?? true,
      },
    });
  }

  async update(id: string, data: UpdateProdutoDTO) {
    return prisma.produto.update({
      where: {
        id,
      },
      data,
    });
  }

  async delete(id: string) {
    return prisma.produto.update({
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
    return prisma.produto.update({
      where: {
        id,
      },
      data: {
        ordemCatalogo,
      },
    });
  }

  async updateEstoque(id: string, estoque: number) {
    return prisma.produto.update({
      where: {
        id,
      },
      data: {
        estoque,
      },
    });
  }

  async toggleCatalogo(id: string) {
    const produto = await prisma.produto.findUnique({
      where: {
        id,
      },
      select: {
        visivelCatalogo: true,
      },
    });

    if (!produto) {
      throw new Error("Produto não encontrado.");
    }

    return prisma.produto.update({
      where: {
        id,
      },
      data: {
        visivelCatalogo: !produto.visivelCatalogo,
      },
    });
  }

  async toggleDestaque(id: string) {
    const produto = await prisma.produto.findUnique({
      where: {
        id,
      },
      select: {
        destaque: true,
      },
    });

    if (!produto) {
      throw new Error("Produto não encontrado.");
    }

    return prisma.produto.update({
      where: {
        id,
      },
      data: {
        destaque: !produto.destaque,
      },
    });
  }
}

export const produtoService = new ProdutoService();