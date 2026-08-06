import { prisma } from "@/lib/prisma";

export interface CreateEmpresaDTO {
  nome: string;
  slug: string;

  logo?: string;
  banner?: string;
  descricao?: string;

  telefone?: string;
  instagram?: string;
}

export interface UpdateEmpresaDTO {
  nome?: string;
  slug?: string;

  logo?: string;
  banner?: string;
  descricao?: string;

  telefone?: string;
  instagram?: string;
}

class EmpresaService {
  async list() {
    return prisma.empresa.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        nome: "asc",
      },
    });
  }

  async findById(id: string) {
    return prisma.empresa.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        usuarios: true,
        produtos: true,
        combos: true,
        promocoes: true,
      },
    });
  }

  async findBySlug(slug: string) {
    return prisma.empresa.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
      include: {
        produtos: {
          where: {
            ativo: true,
          },
          orderBy: {
            ordemCatalogo: "asc",
          },
        },
        combos: {
          where: {
            ativo: true,
          },
          orderBy: {
            ordemCatalogo: "asc",
          },
        },
      },
    });
  }

  async create(data: CreateEmpresaDTO) {
    return prisma.empresa.create({
      data: {
        nome: data.nome,
        slug: data.slug,

        logo: data.logo,
        banner: data.banner,
        descricao: data.descricao,

        telefone: data.telefone,
        instagram: data.instagram,
      },
    });
  }

  async update(id: string, data: UpdateEmpresaDTO) {
    return prisma.empresa.update({
      where: {
        id,
      },
      data,
    });
  }

  async delete(id: string) {
    return prisma.empresa.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}

export const empresaService = new EmpresaService();