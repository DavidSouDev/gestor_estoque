import { prisma } from "@/lib/prisma";
import { PRODUTO_CATALOGO_SELECT } from "./produto.service";
import { EMPRESA_PUBLICAVEL_SELECT, empresaPodePublicar } from "@/lib/empresa-publicavel";
import { HttpError } from "@/lib/http-error";

interface ComboItemDTO {
  produtoId: string;
  quantidade: number;
}

/**
 * Nunca confiar em `produtoId` vindo do chamador sem confirmar que pertence à
 * MESMA empresa do combo — mesma defesa que `itensValidosDaEmpresa` já aplica
 * em `promocao.service.ts` (combos não referenciam outros combos, só
 * produtos, então o filtro aqui é mais simples). Sem este filtro, a empresa A
 * monta um combo referenciando um produto da empresa B e passa a expô-lo
 * (preço, estoque, fotos) na própria vitrine pública de A. Aplicada no
 * SERVICE, não só no chamador, para que TODO chamador (REST e Server Action)
 * fique protegido, e não só quem lembrar de filtrar antes de chamar.
 */
async function produtosValidosDaEmpresa(
  itens: ComboItemDTO[],
  empresaId: string
): Promise<ComboItemDTO[]> {
  const produtos = await prisma.produto.findMany({
    where: { empresaId },
    select: { id: true },
  });
  const produtoIds = new Set(produtos.map((produto) => produto.id));

  return itens.filter((item) => produtoIds.has(item.produtoId));
}

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

export const COMBO_CATALOGO_SELECT = {
  id: true,
  empresaId: true,
  nome: true,
  descricao: true,
  preco: true,
  fotoCapa: true,
  ordemCatalogo: true,
  destaque: true,
  itens: {
    select: {
      id: true,
      quantidade: true,
      produto: {
        select: PRODUTO_CATALOGO_SELECT,
      },
    },
  },
} as const;

class ComboService {
  async listCatalogo(empresaId: string) {
    return prisma.combo.findMany({
      where: {
        empresaId,
        ativo: true,
        visivel: true,
        deletedAt: null,
      },
      select: COMBO_CATALOGO_SELECT,
      orderBy: {
        ordemCatalogo: "asc",
      },
    });
  }

  /**
   * ACC-03 / D-07. Analog byte-paralelo de `produtoService.findCatalogoById` —
   * o que existe lá tem que existir aqui, e vice-versa. A única diferença
   * legítima é `visivel` (combo) vs `visivelCatalogo` (produto); os dois campos
   * NÃO devem ser uniformizados.
   *
   * `COMBO_CATALOGO_SELECT` também expõe `empresaId` no corpo público, então a
   * sondagem por id documentada em T-04-04 vale igual para combos.
   *
   * D-06: `CANCELADO` e `BLOQUEADO` convergem no mesmo `null`.
   *
   * Os fatos de billing vêm no MESMO `findFirst`: uma segunda query só no
   * caminho de rejeição criaria o canal lateral de tempo de T-04-02.
   *
   * T-04-05: `empresa: { deletedAt: null }` fecha o mesmo buraco pré-existente
   * de tenant que o método de produto tinha.
   */
  async findCatalogoById(id: string) {
    const combo = await prisma.combo.findFirst({
      where: {
        id,
        ativo: true,
        visivel: true,
        deletedAt: null,
        // BUG PRÉ-EXISTENTE fechado neste mesmo patch (T-04-05): sem esta linha,
        // os combos de uma empresa removida por soft delete continuam
        // publicamente legíveis por id.
        empresa: { deletedAt: null },
      },
      // Select aninhado montado AQUI, no call site: `COMBO_CATALOGO_SELECT` é
      // reutilizada por `listCatalogo`, e mexer nela mudaria o corpo público de
      // outro endpoint.
      select: {
        ...COMBO_CATALOGO_SELECT,
        empresa: { select: EMPRESA_PUBLICAVEL_SELECT },
      },
    });

    if (!combo) {
      return null;
    }

    if (!empresaPodePublicar(combo.empresa, new Date())) {
      return null;
    }

    // A chave `empresa` é interna ao gate e sai do retorno: formato da resposta
    // pública idêntico ao de antes deste patch (T-04-01).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { empresa, ...publico } = combo;

    return publico;
  }

  async list(empresaId: string) {
    return prisma.combo.findMany({
      where: {
        empresaId,
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

  /**
   * `empresaId` é OBRIGATÓRIO pelo mesmo motivo de `promocaoService.updateItens`:
   * sem filtrar `itens` contra ela aqui, este método aceitaria referenciar
   * produto de outra empresa — mesmo com os chamadores atuais já filtrando
   * antes de chamar, um terceiro chamador futuro herda a proteção de graça.
   */
  async updateItens(comboId: string, itensBrutos: ComboItemDTO[], empresaId: string) {
    const itens = await produtosValidosDaEmpresa(itensBrutos, empresaId);

    if (itens.length === 0) {
      throw new HttpError("Nenhum item válido informado para esta empresa.", 400);
    }

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