import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { pickUniqueWithSuffix } from "@/lib/unique-suffix";

export interface CreateProdutoDTO {
  empresaId: string;
  codigo: string;
  nome: string;
  descricao?: string;

  categoria?: string;

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

  categoria?: string;

  precoVarejo?: number;
  precoAtacado?: number;

  estoque?: number;

  fotoCapa?: string;

  ordemCatalogo?: number;

  destaque?: boolean;

  ativo?: boolean;
  visivelCatalogo?: boolean;
}

export const PRODUTO_CATALOGO_SELECT = {
  id: true,
  empresaId: true,
  codigo: true,
  nome: true,
  descricao: true,
  categoria: true,
  precoVarejo: true,
  estoque: true,
  fotoCapa: true,
  ordemCatalogo: true,
  destaque: true,
  imagens: true,
} as const;

class ProdutoService {
  async generateUniqueCodigo(empresaId: string, nome: string) {
    const base = slugify(nome).toUpperCase().slice(0, 20) || "PRODUTO";

    const existentes = await prisma.produto.findMany({
      where: {
        empresaId,
        codigo: {
          startsWith: base,
        },
      },
      select: {
        codigo: true,
      },
    });

    const ocupados = new Set(existentes.map((produto) => produto.codigo));

    return pickUniqueWithSuffix(base, ocupados);
  }

  async listCatalogo(empresaId: string) {
    return prisma.produto.findMany({
      where: {
        empresaId,
        ativo: true,
        visivelCatalogo: true,
        deletedAt: null,
      },
      select: PRODUTO_CATALOGO_SELECT,
      orderBy: {
        ordemCatalogo: "asc",
      },
    });
  }

  async findCatalogoById(id: string) {
    return prisma.produto.findFirst({
      where: {
        id,
        ativo: true,
        visivelCatalogo: true,
        deletedAt: null,
      },
      select: PRODUTO_CATALOGO_SELECT,
    });
  }

  async list(empresaId: string) {
    return prisma.produto.findMany({
      where: {
        empresaId,
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

        categoria: data.categoria ?? "Geral",

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