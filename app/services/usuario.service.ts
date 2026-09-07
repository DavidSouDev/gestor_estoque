import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { camposDaColisaoUnica } from "@/lib/prisma-error";
import { Prisma } from "@prisma/client";
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

const SAFE_SELECT = {
  id: true,
  nome: true,
  email: true,
  role: true,
  ativo: true,
  empresaId: true,
  createdAt: true,
  updatedAt: true,
  empresa: {
    select: {
      id: true,
      nome: true,
      slug: true,
    },
  },
} as const;

class UsuarioService {
  async list(empresaId: string) {
    return prisma.usuario.findMany({
      where: { empresaId },
      select: SAFE_SELECT,
      orderBy: {
        nome: "asc",
      },
    });
  }

  async findById(id: string) {
    return prisma.usuario.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
  }

  async findByEmail(email: string) {
    return prisma.usuario.findUnique({
      where: { email },
    });
  }

  async create(data: CreateUsuarioDTO) {
    const empresaJaTemAdmin = await prisma.usuario.findUnique({
      where: { empresaId: data.empresaId },
      select: { id: true },
    });

    if (empresaJaTemAdmin) {
      throw new HttpError("Esta empresa já possui um administrador cadastrado.", 409);
    }

    const senhaHash = await bcrypt.hash(data.senha, 10);

    try {
      return await prisma.usuario.create({
        data: {
          nome: data.nome,
          email: data.email,
          senhaHash,
          empresaId: data.empresaId,
        },
        select: SAFE_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // A extração mora em `lib/prisma-error.ts` porque o `meta` deste erro,
        // com driver adapter, NÃO carrega `target` — ler `meta.target` aqui
        // fazia todo P2002 escapar como erro cru, apagando a distinção entre
        // colisão de `empresaId` e de `email`. Ver o JSDoc do helper.
        const campos = camposDaColisaoUnica(error);

        if (campos.includes("empresaId")) {
          throw new HttpError("Esta empresa já possui um administrador cadastrado.", 409);
        }

        if (campos.includes("email")) {
          throw new HttpError("Este email já está em uso.", 409);
        }
      }

      throw error;
    }
  }

  async update(id: string, data: UpdateUsuarioDTO) {
    const updateData: Prisma.UsuarioUpdateInput = {
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
      select: SAFE_SELECT,
    });
  }

  async delete(id: string) {
    return prisma.usuario.update({
      where: { id },
      data: {
        ativo: false,
      },
      select: SAFE_SELECT,
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