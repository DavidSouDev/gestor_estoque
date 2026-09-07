import { prisma } from "@/lib/prisma";
import { StatusAcesso, CausaTransicaoAcesso } from "@prisma/client";

class AcessoService {
  /**
   * Grava **uma** linha de auditoria se, e somente se, o status persistido da
   * empresa ainda for `anterior`.
   *
   * Duas invariantes moram aqui:
   *
   * 1. **D-16 — só transição real gera linha.** `avaliarAcesso` roda dentro de
   *    `revalidarConta`, ou seja a cada request autenticado. Se a auditoria
   *    fosse gravada sempre, cada page view do admin viraria uma linha
   *    (T-02-18). Por isso a guarda `anterior === novo` retorna antes de tocar
   *    o banco: zero I/O quando não houve mudança.
   *
   * 2. **Compare-and-swap.** Dois requests concorrentes do mesmo admin (uma
   *    page e uma Server Action, por exemplo) observam a mesma transição no
   *    mesmo instante e agendariam dois efeitos de auditoria. Condicionar a
   *    escrita da linha ao `count === 1` da atualização em massa faz o segundo
   *    virar no-op sem exceção e sem constraint única artificial (T-02-15).
   *    Uma leitura seguida de escrita — buscar a última linha, comparar em
   *    memória, criar — **não** seria atômica e gravaria duas linhas idênticas.
   *
   * O `where` casa o valor **esperado** de `ultimoStatusAuditado`, inclusive
   * `null`: no Prisma isso é igualdade a NULL válida, que é exatamente o caso
   * da primeiríssima transição de cada empresa (`REGISTRO` / `BACKFILL`).
   *
   * A linha carrega apenas status anterior, status novo, causa e horário — o
   * `createdAt` vem do `@default(now())` do schema. D-17 proíbe snapshot dos
   * fatos de billing.
   *
   * @returns a linha criada, ou `null` quando não houve transição (D-16) ou
   *   quando outro request já registrou esta mesma transição.
   */
  async registrarTransicao(params: {
    empresaId: string;
    anterior: StatusAcesso | null;
    novo: StatusAcesso;
    causa: CausaTransicaoAcesso;
  }) {
    if (params.anterior === params.novo) return null;

    return prisma.$transaction(async (tx) => {
      const { count } = await tx.empresa.updateMany({
        where: { id: params.empresaId, ultimoStatusAuditado: params.anterior },
        data: { ultimoStatusAuditado: params.novo },
      });

      if (count === 0) return null; // outro request já registrou esta transição

      return tx.auditoriaAcesso.create({
        data: {
          empresaId: params.empresaId,
          statusAnterior: params.anterior,
          statusNovo: params.novo,
          causa: params.causa,
        },
      });
    });
  }
}

export const acessoService = new AcessoService();
