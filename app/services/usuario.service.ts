import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export interface CreateUsuarioDTO {
  nome: string;
  email: string;
  senha: string;
  empresaId: string;
}

export interface UpdateUsuarioDTO {
  nome?: string;
  email?: string;
  senha?: string;
  ativo?: boolean;
}

class UsuarioService {
  async list() {
    return prisma.usuario.findMany({
      include: {
        empresa: {
          select: {
            id: true,
            nome: true,
            slug: true,
          },
        },
      },
      orderBy: {
        nome: "asc",
      },
    });
  }

  async findById(id: string) {
    return prisma.usuario.findUnique({
      where: { id },
      include: {
        empresa: {
          select: {
            id: true,
            nome: true,
            slug: true,
          },
        },
      },
    });
  }

  async findByEmail(email: string) {
    return prisma.usuario.findUnique({
      where: { email },
    });
  }

  async create(data: CreateUsuarioDTO) {
    const senhaHash = await bcrypt.hash(data.senha, 10);

    return prisma.usuario.create({
      data: {
        nome: data.nome,
        email: data.email,
        senhaHash,
        empresaId: data.empresaId,
      },
      include: {
        empresa: {
          select: {
            id: true,
            nome: true,
            slug: true,
          },
        },
      },
    });
  }

  async update(id: string, data: UpdateUsuarioDTO) {
    const updateData: any = {
      nome: data.nome,
      email: data.email,
      ativo: data.ativo,
    };

    if (data.senha) {
      updateData.senhaHash = await bcrypt.hash(data.senha, 10);
    }

    return prisma.usuario.update({
      where: { id },
      data: updateData,
      include: {
        empresa: {
          select: {
            id: true,
            nome: true,
            slug: true,
          },
        },
      },
    });
  }

  async delete(id: string) {
    return prisma.usuario.update({
      where: { id },
      data: {
        ativo: false,
      },
    });
  }

  async validatePassword(email: string, senha: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: {
        empresa: true,
      },
    });

    if (!usuario) {
      return null;
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senhaHash);

    if (!senhaValida) {
      return null;
    }

    return usuario;
  }
}

export const usuarioService = new UsuarioService();