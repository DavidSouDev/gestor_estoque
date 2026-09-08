import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
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

/**
 * Nunca confiar em `produtoId`/`comboId` vindo do chamador sem confirmar que
 * pertence à MESMA empresa da promoção: sem este filtro, a empresa A cria uma
 * promoção referenciando um produto da empresa B e passa a expô-lo (preço,
 * estoque, fotos) tanto por `GET /api/promocoes/[id]` quanto na própria
 * vitrine pública de A. Mesma defesa que `itensValidosDaEmpresa` já aplica na
 * Server Action de combos/promoções — replicada aqui, no service, para que
 * TODO chamador (REST e Server Action) fique protegido, e não só quem lembrar
 * de filtrar antes de chamar.
 */
async function itensValidosDaEmpresa(
  itens: PromocaoItemDTO[],
  empresaId: string
): Promise<PromocaoItemDTO[]> {
  const [produtos, combos] = await Promise.all([
    prisma.produto.findMany({ where: { empresaId }, select: { id: true } }),
    prisma.combo.findMany({ where: { empresaId }, select: { id: true } }),
  ]);

  const produtoIds = new Set(produtos.map((produto) => produto.id));
  const comboIds = new Set(combos.map((combo) => combo.id));

  return itens.filter((item) =>
    item.produtoId ? produtoIds.has(item.produtoId) : item.comboId ? comboIds.has(item.comboId) : false
  );
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
    const itens = await itensValidosDaEmpresa(data.itens, data.empresaId);

    if (itens.length === 0) {
      throw new HttpError("Nenhum item válido informado para esta empresa.", 400);
    }

    return prisma.promocao.create({
      data: {
        empresaId: data.empresaId,

        nome: data.nome,

        dataInicio: data.dataInicio,
        dataFim: data.dataFim,

        itens: {
          create: itens.map((item) => ({
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

  /**
   * `empresaId` é OBRIGATÓRIO pelo mesmo motivo de `create`: sem filtrar
   * `itens` contra ela aqui, este método reabriria a MESMA falha de
   * `create` — mesmo com os dois chamadores atuais (`promocoes/actions.ts` e
   * `_lib/simples-actions.ts`) já validando antes de chamar, um terceiro
   * chamador futuro (ex: um PATCH REST com `itens`, hoje inexistente de
   * propósito) herdaria a proteção de graça em vez de precisar reimplementar.
   */
  async updateItens(
    promocaoId: string,
    itensBrutos: PromocaoItemDTO[],
    empresaId: string
  ) {
    const itens = await itensValidosDaEmpresa(itensBrutos, empresaId);

    if (itens.length === 0) {
      throw new HttpError("Nenhum item válido informado para esta empresa.", 400);
    }

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