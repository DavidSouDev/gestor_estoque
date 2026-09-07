import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { pickUniqueWithSuffix } from "@/lib/unique-suffix";
import { EMPRESA_PUBLICAVEL_SELECT, empresaPodePublicar } from "@/lib/empresa-publicavel";

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

  /**
   * ACC-03 / D-07. Leitura pública de produto por id, gateada pelo status da
   * empresa DONA do recurso.
   *
   * Por que gatear aqui e não só na resolução de slug (T-04-04):
   * `PRODUTO_CATALOGO_SELECT` expõe `empresaId` no corpo público, então qualquer
   * visitante que navegou no catálogo enquanto a loja estava saudável guardou os
   * UUIDs e pode sondá-los depois. A sondagem estilo IDOR não é hipotética.
   *
   * D-06: `CANCELADO` e `BLOQUEADO` convergem no mesmo `null` — o rótulo
   * distinto é só trilha de auditoria, não regra de gate.
   *
   * Os fatos de billing da empresa vêm no MESMO `findFirst`, por select
   * aninhado, e isso é deliberado: uma segunda query só no caminho de rejeição
   * faria "existe mas está bloqueada" custar o dobro de "não existe", e um
   * visitante anônimo enumeraria tenants pelo relógio (T-04-02).
   *
   * T-04-05: o filtro `empresa: { deletedAt: null }` fecha um buraco
   * PRÉ-EXISTENTE — até aqui o método não filtrava por tenant nenhum.
   */
  async findCatalogoById(id: string) {
    const produto = await prisma.produto.findFirst({
      where: {
        id,
        ativo: true,
        visivelCatalogo: true,
        deletedAt: null,
        // BUG PRÉ-EXISTENTE fechado neste mesmo patch (T-04-05): sem esta linha,
        // os produtos de uma empresa removida por soft delete continuam
        // publicamente legíveis por id.
        empresa: { deletedAt: null },
      },
      // O select aninhado é montado AQUI, no call site, nunca dentro de
      // `PRODUTO_CATALOGO_SELECT`: aquela constante é reutilizada por
      // `listCatalogo` e por `COMBO_CATALOGO_SELECT`, e mexer nela mudaria o
      // corpo público de outros endpoints.
      select: {
        ...PRODUTO_CATALOGO_SELECT,
        empresa: { select: EMPRESA_PUBLICAVEL_SELECT },
      },
    });

    if (!produto) {
      return null;
    }

    if (!empresaPodePublicar(produto.empresa, new Date())) {
      return null;
    }

    // A chave `empresa` é interna ao gate e sai do retorno: o formato da
    // resposta pública fica idêntico ao de antes deste patch, e nenhum fato de
    // billing atravessa (T-04-01).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { empresa, ...publico } = produto;

    return publico;
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