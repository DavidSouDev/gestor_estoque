import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";

export interface ProdutoVarianteAtributoDTO {
  nome: string;
  valor: string;
}

export interface ProdutoVarianteImagemDTO {
  url: string;
  alt?: string;
}

export interface CreateProdutoVarianteDTO {
  produtoId: string;
  nome: string;
  atributos: ProdutoVarianteAtributoDTO[];
  precoVarejo?: number | null;
  precoAtacado?: number | null;
  estoque?: number;
  imagens: ProdutoVarianteImagemDTO[];
  ordem?: number;
}

export interface UpdateProdutoVarianteDTO {
  nome?: string;
  // `undefined` = não mexe; `null` = limpa o override e volta a herdar do
  // produto — mesma convenção de `fotoCapa` em produtos/actions.ts.
  precoVarejo?: number | null;
  precoAtacado?: number | null;
  estoque?: number;
  ordem?: number;
  // Quando fornecidos, substituem a lista inteira (mesma ideia do `fotoCapa`:
  // é sempre a foto toda, nunca um patch incremental). `undefined` = não mexe.
  atributos?: ProdutoVarianteAtributoDTO[];
  imagens?: ProdutoVarianteImagemDTO[];
}

const VARIANTE_INCLUDE = {
  atributos: { orderBy: { ordem: "asc" } },
  imagens: { orderBy: { ordem: "asc" } },
} as const;

class ProdutoVarianteService {
  async listByProduto(produtoId: string) {
    return prisma.produtoVariante.findMany({
      where: { produtoId, deletedAt: null },
      include: VARIANTE_INCLUDE,
      orderBy: { ordem: "asc" },
    });
  }

  /**
   * Inclui `produto` (id/empresaId/controlaEstoquePorVariante) pra quem
   * chama poder validar posse (`assertBelongsToEmpresa`) e o modo de estoque
   * sem precisar de uma segunda query.
   */
  async findById(id: string) {
    return prisma.produtoVariante.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...VARIANTE_INCLUDE,
        produto: {
          select: { id: true, empresaId: true, controlaEstoquePorVariante: true },
        },
      },
    });
  }

  /**
   * O estoque inicial da variante é espelhado no agregado do produto sem
   * gerar `MovimentacaoEstoque` — mesmo comportamento que editar `estoque`
   * direto no formulário do produto já tem hoje (produto.service.ts `create`/
   * `update`). O rastro de auditoria por movimentação continua existindo só
   * para entradas/saídas/ajustes feitos depois, via
   * movimentacao-estoque.service.ts.
   */
  async create(data: CreateProdutoVarianteDTO) {
    return prisma.$transaction(async (tx) => {
      const estoqueInicial = data.estoque ?? 0;

      const variante = await tx.produtoVariante.create({
        data: {
          produtoId: data.produtoId,
          nome: data.nome,
          precoVarejo: data.precoVarejo ?? null,
          precoAtacado: data.precoAtacado ?? null,
          estoque: estoqueInicial,
          ordem: data.ordem ?? 0,
          atributos: {
            createMany: {
              data: data.atributos.map((atributo, index) => ({
                nome: atributo.nome,
                valor: atributo.valor,
                ordem: index,
              })),
            },
          },
          imagens: {
            createMany: {
              data: data.imagens.map((imagem, index) => ({
                url: imagem.url,
                alt: imagem.alt,
                ordem: index,
              })),
            },
          },
        },
        include: VARIANTE_INCLUDE,
      });

      if (estoqueInicial !== 0) {
        await tx.produto.update({
          where: { id: data.produtoId },
          data: { estoque: { increment: estoqueInicial } },
        });
      }

      return variante;
    });
  }

  async update(id: string, data: UpdateProdutoVarianteDTO) {
    return prisma.$transaction(async (tx) => {
      const atual = await tx.produtoVariante.findUnique({
        where: { id },
        select: { produtoId: true, estoque: true, deletedAt: true },
      });

      if (!atual || atual.deletedAt) {
        throw new HttpError("Variante não encontrada.", 404);
      }

      if (data.atributos) {
        await tx.produtoVarianteAtributo.deleteMany({ where: { varianteId: id } });

        if (data.atributos.length > 0) {
          await tx.produtoVarianteAtributo.createMany({
            data: data.atributos.map((atributo, index) => ({
              varianteId: id,
              nome: atributo.nome,
              valor: atributo.valor,
              ordem: index,
            })),
          });
        }
      }

      if (data.imagens) {
        await tx.produtoVarianteImagem.deleteMany({ where: { varianteId: id } });

        if (data.imagens.length > 0) {
          await tx.produtoVarianteImagem.createMany({
            data: data.imagens.map((imagem, index) => ({
              varianteId: id,
              url: imagem.url,
              alt: imagem.alt,
              ordem: index,
            })),
          });
        }
      }

      const variante = await tx.produtoVariante.update({
        where: { id },
        data: {
          nome: data.nome,
          precoVarejo: data.precoVarejo,
          precoAtacado: data.precoAtacado,
          estoque: data.estoque,
          ordem: data.ordem,
        },
        include: VARIANTE_INCLUDE,
      });

      if (data.estoque !== undefined && data.estoque !== atual.estoque) {
        await tx.produto.update({
          where: { id: atual.produtoId },
          data: { estoque: { increment: data.estoque - atual.estoque } },
        });
      }

      return variante;
    });
  }

  /**
   * Soft delete (mesmo padrão de `produto.service.ts`): marca `ativo: false`
   * e `deletedAt`, e retira o saldo da variante do agregado do produto — uma
   * variante removida (ex: estampa descontinuada) não deveria continuar
   * contando estoque que não é mais vendável.
   *
   * Diferente de `toggleAtivo`: pausar uma variante não mexe no agregado,
   * porque o estoque físico continua existindo, só fica temporariamente fora
   * do catálogo.
   */
  async delete(id: string) {
    return prisma.$transaction(async (tx) => {
      const atual = await tx.produtoVariante.findUnique({
        where: { id },
        select: { produtoId: true, estoque: true, deletedAt: true },
      });

      if (!atual || atual.deletedAt) {
        throw new HttpError("Variante não encontrada.", 404);
      }

      const variante = await tx.produtoVariante.update({
        where: { id },
        data: { ativo: false, deletedAt: new Date() },
      });

      if (atual.estoque !== 0) {
        await tx.produto.update({
          where: { id: atual.produtoId },
          data: { estoque: { decrement: atual.estoque } },
        });
      }

      return variante;
    });
  }

  async toggleAtivo(id: string) {
    const variante = await prisma.produtoVariante.findUnique({
      where: { id },
      select: { ativo: true },
    });

    if (!variante) {
      throw new HttpError("Variante não encontrada.", 404);
    }

    return prisma.produtoVariante.update({
      where: { id },
      data: { ativo: !variante.ativo },
    });
  }

  async reorder(id: string, ordem: number) {
    return prisma.produtoVariante.update({
      where: { id },
      data: { ordem },
    });
  }

  /**
   * Modo SIMPLES (assistente): "várias fotos de uma vez" vira uma variante
   * por foto, sem pedir atributo nenhum. Essas variantes não têm identidade
   * própria a preservar entre chamadas (nenhum preço/estoque configurado à
   * mão), então cada chamada aqui SUBSTITUI o conjunto inteiro — apagar tudo
   * e recriar é mais simples e seguro do que casar a lista antiga com a nova
   * item a item.
   *
   * Reconhece uma variante como "automática" por ter ZERO atributos: o
   * formulário do modo COMPLETO (`variantes-actions.ts` `validarVariante`)
   * exige pelo menos um, então esse estado só existe se tiver vindo daqui —
   * variantes criadas à mão no modo COMPLETO nunca são tocadas por este
   * método.
   *
   * Hard delete (não o soft-delete de `delete()`): sem uso de
   * `controlaEstoquePorVariante`, nenhuma `MovimentacaoEstoque` referencia
   * estas variantes, então não há trilha de auditoria a preservar — manter
   * linhas "apagadas" pra sempre só acumularia lixo sem UI nenhuma pra
   * revê-las.
   *
   * Não fala com o R2: devolve as URLs que saíram do conjunto pra quem chamou
   * decidir se/quando apagar do bucket (mesma fronteira service/action do
   * resto do arquivo).
   */
  async sincronizarAutomaticas(
    produtoId: string,
    fotos: string[]
  ): Promise<{ imagensRemovidas: string[] }> {
    return prisma.$transaction(async (tx) => {
      const existentes = await tx.produtoVariante.findMany({
        where: { produtoId, deletedAt: null },
        include: { atributos: true, imagens: true },
      });

      const automaticas = existentes.filter((variante) => variante.atributos.length === 0);
      const imagensAntigas = automaticas.flatMap((variante) =>
        variante.imagens.map((imagem) => imagem.url)
      );

      for (const variante of automaticas) {
        await tx.produtoVariante.delete({ where: { id: variante.id } });
      }

      if (fotos.length >= 2) {
        for (const [index, url] of fotos.entries()) {
          await tx.produtoVariante.create({
            data: {
              produtoId,
              nome: `Variante ${index + 1}`,
              ordem: index,
              imagens: { create: { url, ordem: 0 } },
            },
          });
        }
      }

      const imagensRemovidas = imagensAntigas.filter((url) => !fotos.includes(url));

      return { imagensRemovidas };
    });
  }
}

export const produtoVarianteService = new ProdutoVarianteService();
