import { prisma } from "@/lib/prisma";
import { produtoService } from "./produto.service";
import { comboService } from "./combo.service";
import { promocaoService } from "./promocao.service";
import { generateUniqueSlug } from "@/lib/slug";
import { HttpError } from "@/lib/http-error";
import { ModoInterface, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

export interface RegisterComUsuarioDTO {
  nomeEmpresa: string;
  nomeResponsavel: string;
  email: string;
  senha: string;
  modoInterface: ModoInterface;
}

export interface CreateEmpresaDTO {
  nome: string;
  slug: string;

  logo?: string;
  banner?: string;
  descricao?: string;

  telefone?: string;
  instagram?: string;

  primaryColor?: string;
  accentColor?: string;
}

export interface UpdateEmpresaDTO {
  nome?: string;
  slug?: string;

  logo?: string;
  banner?: string;
  descricao?: string;

  telefone?: string;
  instagram?: string;

  primaryColor?: string;
  accentColor?: string;

  modoInterface?: ModoInterface;
}

class EmpresaService {
  async registerComUsuario(data: RegisterComUsuarioDTO) {
    const slug = await generateUniqueSlug(data.nomeEmpresa);
    const senhaHash = await bcrypt.hash(data.senha, 10);

    try {
      return await prisma.$transaction(async (tx) => {
        const empresa = await tx.empresa.create({
          data: {
            nome: data.nomeEmpresa,
            slug,
            modoInterface: data.modoInterface,
          },
        });

        const usuario = await tx.usuario.create({
          data: {
            nome: data.nomeResponsavel,
            email: data.email,
            senhaHash,
            empresaId: empresa.id,
          },
        });

        return { empresa, usuario };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];

        if (target.includes("email")) {
          throw new HttpError("Este email já está em uso.", 409);
        }

        if (target.includes("slug")) {
          throw new HttpError(
            "Não foi possível gerar um identificador único para a empresa. Tente novamente.",
            409
          );
        }
      }

      throw error;
    }
  }

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
        primaryColor: true,
        accentColor: true,
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

  async findHeaderData(id: string) {
    return prisma.empresa.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        nome: true,
        slug: true,
        logo: true,
        primaryColor: true,
        accentColor: true,
        modoInterface: true,
      },
    });
  }

  async findBranding(id: string) {
    return prisma.empresa.findFirst({
      where: {
        id,
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
        primaryColor: true,
        accentColor: true,
        modoInterface: true,
      },
    });
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

        primaryColor: data.primaryColor,
        accentColor: data.accentColor,
      },
    });
  }

  // Allowlist explícito — NÃO simplificar para `data` cru.
  // `UpdateEmpresaDTO` é um tipo de compilação: ele é apagado no build e não filtra nada em runtime.
  // `app/api/empresas/[id]/route.ts` repassa o body cru do request (`await request.json()`) para cá,
  // e o check `id !== auth.empresaId` do route handler NÃO protege — o ataque é o ADMIN escrevendo
  // na própria empresa. Sem esta lista positiva, `acessoAte`, `trialFim`, `canceladoEm` e
  // `acessoVitalicio` seriam graváveis por HTTP e BILL-04 ("acesso vitalício só via banco, sem UI")
  // seria contornável por qualquer ADMIN autenticado.
  // Campo novo em `UpdateEmpresaDTO` só passa a ser gravável se for adicionado aqui de propósito.
  async update(id: string, data: UpdateEmpresaDTO) {
    const permitido: Prisma.EmpresaUpdateInput = {};

    if (data.nome !== undefined) permitido.nome = data.nome;
    if (data.slug !== undefined) permitido.slug = data.slug;

    if (data.logo !== undefined) permitido.logo = data.logo;
    if (data.banner !== undefined) permitido.banner = data.banner;
    if (data.descricao !== undefined) permitido.descricao = data.descricao;

    if (data.telefone !== undefined) permitido.telefone = data.telefone;
    if (data.instagram !== undefined) permitido.instagram = data.instagram;

    if (data.primaryColor !== undefined) permitido.primaryColor = data.primaryColor;
    if (data.accentColor !== undefined) permitido.accentColor = data.accentColor;

    if (data.modoInterface !== undefined) permitido.modoInterface = data.modoInterface;

    return prisma.empresa.update({
      where: {
        id,
      },
      data: permitido,
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