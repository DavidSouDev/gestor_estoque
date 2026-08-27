import { prisma } from "@/lib/prisma";
import { produtoService } from "./produto.service";
import { comboService } from "./combo.service";
import { promocaoService } from "./promocao.service";

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
        usuarios: {
          select: {
            id: true,
            nome: true,
            email: true,
            role: true,
            ativo: true,
          },
        },
        produtos: true,
        combos: true,
        promocoes: true,
      },
    });
  }

  async findBySlug(slug: string) {
    const empresa = await prisma.empresa.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
      select: {
        id: true,
        nome: true,
        slug: true,
        logo: true,
        banner: true,
        descricao: true,
        telefone: true,
        instagram: true,
      },
    });

    if (!empresa) {
      return null;
    }

    const [produtos, combos, promocoes] = await Promise.all([
      produtoService.listCatalogo(empresa.id),
      comboService.listCatalogo(empresa.id),
      promocaoService.listVigentesByEmpresa(empresa.id),
    ]);

    return {
      ...empresa,
      produtos,
      combos,
      promocoes,
    };
  }

  async resolveIdBySlug(slug: string) {
    const empresa = await prisma.empresa.findFirst({
      where: {
        slug,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    return empresa?.id ?? null;
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