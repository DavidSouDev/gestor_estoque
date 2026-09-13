import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { Prisma, TipoMovimentacao } from "@prisma/client";

export interface CreateMovimentacaoDTO {
  produtoId: string;
  usuarioId: string;
  empresaId: string;

  // Obrigatório quando o produto tem `controlaEstoquePorVariante`, proibido
  // quando não tem — ver a checagem de exclusividade em `create()`.
  produtoVarianteId?: string;

  tipo: TipoMovimentacao;

  quantidade: number;

  motivo?: string;
}

class MovimentacaoEstoqueService {
  async list(empresaId: string) {
    return prisma.movimentacaoEstoque.findMany({
      where: {
        produto: {
          empresaId,
        },
      },
      include: {
        produto: true,
        produtoVariante: true,
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async findById(id: string) {
    return prisma.movimentacaoEstoque.findUnique({
      where: {
        id,
      },
      include: {
        produto: true,
        produtoVariante: true,
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * A escrita do estoque é um `updateMany` com a condição de negócio NO
   * `WHERE`, nunca um `estoque` calculado em JS a partir de uma leitura
   * anterior. Duas SAIDAs concorrentes no mesmo produto sob READ COMMITTED
   * (default do Postgres) podiam antes ler o MESMO `estoque` inicial, as duas
   * passarem na checagem de "não fica negativo" em JS, e a segunda escrita
   * pisar na primeira (lost update) — o estoque final ficava maior do que
   * deveria e divergia da soma real das movimentações registradas. Com a
   * condição dentro do `WHERE` (`estoque: { gte: quantidade }`), a checagem e
   * o decremento acontecem no MESMO comando SQL: se a segunda SAIDA chegar ao
   * banco depois da primeira já ter consumido o estoque, o `WHERE` dela
   * simplesmente não bate mais, `count` vem 0, e ela falha corretamente com
   * "Estoque insuficiente." em vez de aplicar um decremento inválido.
   *
   * O `findUnique` inicial continua existindo só para dar um erro limpo de
   * "produto não encontrado" — a garantia de corretude sob concorrência mora
   * inteira no `updateMany` condicional, não nele.
   *
   * Variantes (fase "variantes de produto"): quando o produto controla
   * estoque por variante, a MESMA técnica (condição no WHERE) se aplica ao
   * saldo da VARIANTE, e o delta aplicado nela é espelhado — na MESMA
   * transação — em `produto.estoque`, que passa a ser só um agregado. Os dois
   * modos (produto vs. variante) são mutuamente exclusivos: nunca ficam
   * escolhidos "errado" porque `produto.controlaEstoquePorVariante` decide, e
   * a checagem abaixo recusa a combinação inconsistente antes de mexer em
   * qualquer saldo.
   */
  async create(data: CreateMovimentacaoDTO) {
    // Defesa de segunda camada: os dois chamadores atuais (Zod `.positive()`
    // em `app/api/movimentacoes/route.ts` e a checagem manual em
    // `estoque/actions.ts`) já barram isto antes de chegar aqui, mas o
    // service não pode depender só deles — sem este piso, um `ENTRADA` com
    // quantidade negativa decrementaria o estoque por fora da checagem de
    // "Estoque insuficiente" (que só existe para `SAIDA`), e um `AJUSTE`
    // gravaria um valor negativo direto.
    if (!Number.isFinite(data.quantidade) || data.quantidade <= 0) {
      throw new HttpError("Quantidade deve ser maior que zero.", 400);
    }

    return prisma.$transaction(async (tx) => {
      const produto = await tx.produto.findUnique({
        where: {
          id: data.produtoId,
        },
        select: {
          id: true,
          empresaId: true,
          controlaEstoquePorVariante: true,
        },
      });

      if (!produto || produto.empresaId !== data.empresaId) {
        throw new HttpError("Produto não encontrado.", 404);
      }

      if (produto.controlaEstoquePorVariante && !data.produtoVarianteId) {
        throw new HttpError(
          "Este produto controla estoque por variante — selecione uma variante.",
          400
        );
      }

      if (!produto.controlaEstoquePorVariante && data.produtoVarianteId) {
        throw new HttpError("Este produto não controla estoque por variante.", 400);
      }

      if (data.produtoVarianteId) {
        return this.criarMovimentacaoVariante(tx, data, data.produtoVarianteId);
      }

      let resultado: { count: number };

      switch (data.tipo) {
        case TipoMovimentacao.ENTRADA:
          resultado = await tx.produto.updateMany({
            where: { id: data.produtoId, empresaId: data.empresaId },
            data: { estoque: { increment: data.quantidade } },
          });
          break;

        case TipoMovimentacao.SAIDA:
          resultado = await tx.produto.updateMany({
            where: {
              id: data.produtoId,
              empresaId: data.empresaId,
              estoque: { gte: data.quantidade },
            },
            data: { estoque: { decrement: data.quantidade } },
          });

          if (resultado.count === 0) {
            throw new HttpError("Estoque insuficiente.", 409);
          }

          break;

        case TipoMovimentacao.AJUSTE:
          resultado = await tx.produto.updateMany({
            where: { id: data.produtoId, empresaId: data.empresaId },
            data: { estoque: data.quantidade },
          });
          break;
      }

      // Guarda residual: o produto existia no `findUnique` acima mas sumiu
      // (removido por outra transação) antes deste `updateMany` — janela
      // estreita, mas o `count` já vem 0 de graça, então checar custa nada.
      if (resultado.count === 0) {
        throw new HttpError("Produto não encontrado.", 404);
      }

      return tx.movimentacaoEstoque.create({
        data: {
          produtoId: data.produtoId,
          usuarioId: data.usuarioId,
          tipo: data.tipo,
          quantidade: data.quantidade,
          motivo: data.motivo,
        },
        include: {
          produto: true,
          usuario: {
            select: {
              id: true,
              nome: true,
            },
          },
        },
      });
    });
  }

  /**
   * `tx` é o `Prisma.TransactionClient` da transação aberta em `create()` —
   * este método nunca abre a própria transação, só existe pra não inchar
   * `create()` com o branch de variante inline.
   */
  private async criarMovimentacaoVariante(
    tx: Prisma.TransactionClient,
    data: CreateMovimentacaoDTO,
    produtoVarianteId: string
  ) {
    const variante = await tx.produtoVariante.findFirst({
      where: { id: produtoVarianteId, produtoId: data.produtoId, deletedAt: null },
      select: { id: true, estoque: true },
    });

    if (!variante) {
      throw new HttpError("Variante não encontrada.", 404);
    }

    let delta: number;

    switch (data.tipo) {
      case TipoMovimentacao.ENTRADA: {
        const resultado = await tx.produtoVariante.updateMany({
          where: { id: variante.id },
          data: { estoque: { increment: data.quantidade } },
        });

        if (resultado.count === 0) {
          throw new HttpError("Variante não encontrada.", 404);
        }

        delta = data.quantidade;
        break;
      }

      case TipoMovimentacao.SAIDA: {
        const resultado = await tx.produtoVariante.updateMany({
          where: { id: variante.id, estoque: { gte: data.quantidade } },
          data: { estoque: { decrement: data.quantidade } },
        });

        if (resultado.count === 0) {
          throw new HttpError("Estoque insuficiente.", 409);
        }

        delta = -data.quantidade;
        break;
      }

      case TipoMovimentacao.AJUSTE: {
        // AJUSTE grava um valor absoluto — o delta a espelhar no produto só
        // existe depois de saber o valor ANTERIOR. A condição
        // `estoque: variante.estoque` no WHERE é um lock otimista: se outra
        // transação já tiver mexido no saldo da variante entre a leitura
        // acima e este UPDATE, `count` vem 0 e o ajuste é recusado em vez de
        // sobrescrever um valor que já está desatualizado.
        const resultado = await tx.produtoVariante.updateMany({
          where: { id: variante.id, estoque: variante.estoque },
          data: { estoque: data.quantidade },
        });

        if (resultado.count === 0) {
          throw new HttpError(
            "O estoque da variante mudou enquanto este ajuste era enviado. Tente novamente.",
            409
          );
        }

        delta = data.quantidade - variante.estoque;
        break;
      }
    }

    if (delta !== 0) {
      await tx.produto.updateMany({
        where: { id: data.produtoId },
        data: { estoque: { increment: delta } },
      });
    }

    return tx.movimentacaoEstoque.create({
      data: {
        produtoId: data.produtoId,
        produtoVarianteId: variante.id,
        usuarioId: data.usuarioId,
        tipo: data.tipo,
        quantidade: data.quantidade,
        motivo: data.motivo,
      },
      include: {
        produto: true,
        produtoVariante: true,
        usuario: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });
  }

  async listByProduto(produtoId: string) {
    return prisma.movimentacaoEstoque.findMany({
      where: {
        produtoId,
      },
      include: {
        produtoVariante: true,
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
    });
  }

  /**
   * Remover uma movimentação sem reverter o efeito dela no estoque quebrava o
   * invariante "estoque = soma das movimentações": era possível registrar uma
   * ENTRADA fraudulenta (incrementa o estoque de verdade) e em seguida
   * deletar o próprio registro, apagando a explicação do número sem reverter
   * o estoque — o único ponto do sistema em que um log de auditoria era
   * editável, num produto cujo propósito central é controle de estoque
   * confiável. A correção reverte o efeito dentro da MESMA transação da
   * exclusão, com a mesma técnica de condição-no-WHERE do `create()` acima
   * (nunca um valor calculado em JS a partir de leitura anterior).
   *
   * AJUSTE não é revertível: ele grava um valor absoluto, e o valor anterior
   * ao ajuste não fica armazenado em lugar nenhum — não há como "desfazer"
   * sem inventar um número. Em vez de fingir uma reversão incorreta, a
   * exclusão de AJUSTE é recusada; a correção correta é registrar um novo
   * ajuste com o valor certo, preservando o histórico completo.
   *
   * Quando a movimentação é de variante (`produtoVarianteId` preenchido), a
   * reversão incide sobre o saldo da variante e o mesmo delta é espelhado em
   * `produto.estoque`, igual ao `create()`.
   */
  async delete(id: string) {
    return prisma.$transaction(async (tx) => {
      const movimentacao = await tx.movimentacaoEstoque.findUnique({
        where: { id },
        select: {
          id: true,
          produtoId: true,
          produtoVarianteId: true,
          tipo: true,
          quantidade: true,
        },
      });

      if (!movimentacao) {
        throw new HttpError("Movimentação não encontrada.", 404);
      }

      if (movimentacao.tipo === TipoMovimentacao.AJUSTE) {
        throw new HttpError(
          "Não é possível remover um ajuste de estoque — o valor anterior não fica registrado. Registre um novo ajuste para corrigir o estoque.",
          422
        );
      }

      const varianteId = movimentacao.produtoVarianteId;

      let resultado: { count: number };

      if (movimentacao.tipo === TipoMovimentacao.ENTRADA) {
        // Reverte o incremento. Só é seguro se o estoque atual comporta o
        // decremento — se parte dela já foi consumida por uma SAIDA
        // registrada depois, a exclusão é recusada em vez de deixar o
        // estoque negativo.
        resultado = varianteId
          ? await tx.produtoVariante.updateMany({
              where: { id: varianteId, estoque: { gte: movimentacao.quantidade } },
              data: { estoque: { decrement: movimentacao.quantidade } },
            })
          : await tx.produto.updateMany({
              where: { id: movimentacao.produtoId, estoque: { gte: movimentacao.quantidade } },
              data: { estoque: { decrement: movimentacao.quantidade } },
            });

        if (resultado.count === 0) {
          throw new HttpError(
            "Não é possível remover: o estoque já foi consumido abaixo da quantidade desta entrada.",
            409
          );
        }

        if (varianteId) {
          await tx.produto.updateMany({
            where: { id: movimentacao.produtoId },
            data: { estoque: { decrement: movimentacao.quantidade } },
          });
        }
      } else {
        // SAIDA: reverter incrementando é sempre seguro, nunca produz
        // estoque negativo.
        resultado = varianteId
          ? await tx.produtoVariante.updateMany({
              where: { id: varianteId },
              data: { estoque: { increment: movimentacao.quantidade } },
            })
          : await tx.produto.updateMany({
              where: { id: movimentacao.produtoId },
              data: { estoque: { increment: movimentacao.quantidade } },
            });

        if (resultado.count === 0) {
          throw new HttpError("Produto não encontrado.", 404);
        }

        if (varianteId) {
          await tx.produto.updateMany({
            where: { id: movimentacao.produtoId },
            data: { estoque: { increment: movimentacao.quantidade } },
          });
        }
      }

      return tx.movimentacaoEstoque.delete({
        where: { id },
      });
    });
  }
}

export const movimentacaoEstoqueService = new MovimentacaoEstoqueService();
