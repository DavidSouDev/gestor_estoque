import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { Prisma } from "@prisma/client";

/**
 * Escritas do domínio de Termos de Uso (TERM-02 e TERM-03).
 *
 * Cinco invariantes moram aqui, e as três primeiras são **constraints de banco**,
 * não `if` em TypeScript — no instante em que viram checagem em código, ficam
 * contornáveis pela próxima linha que alguém escrever fora deste arquivo:
 *
 * 1. **TERM-03 / D-07 — publicar é INSERT, sempre.** NÃO existe método `update`
 *    nem `delete` de `TermoDeUso` aqui, e essa ausência é o **contrato**, não um
 *    esquecimento. Uma versão publicada é um documento legal que pessoas
 *    aceitaram; corrigir o texto significa publicar a versão seguinte. A ausência
 *    é verificada por gate de grep executável (`npm run gates:fase-06`, plano
 *    06-08) e por teste de ausência em `termo.service.test.ts` — as duas metades
 *    existem porque o teste pega o método adicionado e o grep pega a chamada crua
 *    a `prisma.termoDeUso.update` escrita fora de um método.
 *
 * 2. **A numeração monotônica NÃO é defendida por leitura-antes-de-escrita.**
 *    Quem defende é `versao Int @unique` no banco. O `findFirst` de máximo abaixo
 *    existe só para *propor* o próximo número; quem arbitra o empate entre duas
 *    publicações concorrentes é o Postgres, devolvendo P2002 para a segunda.
 *
 * 3. **A idempotência do aceite NÃO é defendida por `findFirst` antes do
 *    `create`.** Quem defende é `@@unique([usuarioId, termoId])`. Read-then-write
 *    perde a corrida entre dois requests concorrentes — mesmo argumento já
 *    escrito no schema para `EventoWebhookAsaas.eventoId`.
 *
 * 4. **O bookkeeping `Usuario.termoAceitoId` é escrito na MESMA transação que o
 *    fato, nunca isolado.** É esse acoplamento que garante que a coluna seja
 *    sempre reconstruível a partir de `AceiteTermo`, e é a razão pela qual o gate
 *    de TERM-04 pode lê-la para decidir (ao contrário de
 *    `Empresa.ultimoStatusAuditado`, que é derivação e não pode — a divergência
 *    está escrita no JSDoc das duas colunas no schema). Um escritor único é o
 *    invariante que mantém a denormalização correta.
 *
 * 5. **`usuarioId` nunca vem de `FormData` em nenhum chamador** — é sempre
 *    derivado da sessão (Pitfall 8). Este service não tem como verificar isso: os
 *    dois argumentos de `registrarAceite` são confiados a quem chama. A nota
 *    existe para o próximo chamador não inventar um parâmetro vindo do
 *    formulário.
 */
class TermoService {
  /**
   * TERM-02. Cria a próxima versão dos termos. Nunca reescreve uma existente.
   *
   * O retorno **não** inclui `conteudo`: um endpoint que devolvesse o texto
   * inteiro no 201 encheria a resposta à toa, e quem publicou acabou de enviar o
   * texto.
   */
  async publicar(data: { conteudo: string; publicadoPorId: string }) {
    const ultimo = await prisma.termoDeUso.findFirst({
      orderBy: { versao: "desc" },
      select: { versao: true },
    });

    try {
      return await prisma.termoDeUso.create({
        data: {
          versao: (ultimo?.versao ?? 0) + 1,
          conteudo: data.conteudo,
          publicadoPorId: data.publicadoPorId,
        },
        select: { id: true, versao: true, publicadoEm: true },
      });
    } catch (error) {
      // Duas publicações concorrentes leram o mesmo máximo de versão acima e
      // propuseram o mesmo número. A constraint única é a defesa correta porque
      // o `findFirst` que precede o insert perde a corrida por construção — é o
      // mesmo argumento já registrado no schema para `EventoWebhookAsaas.eventoId`.
      // 409 (e não 500) porque o desfecho certo é o chamador tentar de novo: a
      // segunda tentativa lê o máximo já atualizado.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError("Outra publicacao ocorreu em paralelo. Tente novamente.", 409);
      }

      throw error;
    }
  }

  /**
   * TERM-03. Registra o aceite de `usuarioId` contra a versão `termoId`.
   *
   * Idempotente: chamar duas vezes para o mesmo par não grava duas linhas nem
   * devolve erro ao usuário.
   */
  async registrarAceite(usuarioId: string, termoId: string) {
    try {
      await prisma.$transaction(async (tx) => {
        // O fato imutável primeiro...
        await tx.aceiteTermo.create({ data: { usuarioId, termoId } });
        // ...e o bookkeeping depois, na MESMA transação. Um rollback não pode
        // deixar `Usuario.termoAceitoId` apontando para uma versão sem fato
        // correspondente — seria um usuário que o gate considera em dia sem que
        // exista prova do consentimento.
        await tx.usuario.update({ where: { id: usuarioId }, data: { termoAceitoId: termoId } });
      });
    } catch (error) {
      // P2002 = este usuário já aceitou esta versão. Não é erro: duplo clique,
      // retry de rede e reenvio de formulário colidem aqui, e o estado desejado
      // já está no banco. Transformar isso em 500 seria mostrar falha a quem
      // acabou de fazer exatamente o que foi pedido.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return;
      }

      throw error;
    }
  }
}

export const termoService = new TermoService();
