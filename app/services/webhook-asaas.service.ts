import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { redigirEnvelope } from "@/lib/billing/asaas/eventos";

/**
 * Ledger de eventos de webhook do Asaas: registro, despacho e marcação de
 * conclusão/erro (GTW-02, GTW-04).
 *
 * ============================================================================
 * TRÊS INVARIANTES QUE ESTE ARQUIVO EXISTE PARA MANTER.
 * ============================================================================
 *
 * 1. **O Postgres, não a aplicação, decide o que é duplicado.** A tentação é
 *    fazer um `findFirst` pelo `eventoId` antes do insert. Isso perde a corrida:
 *    duas entregas concorrentes do mesmo evento passam pela leitura juntas, as
 *    duas não encontram nada, e as duas inserem — o processamento roda duas
 *    vezes e o acesso é estendido em dobro. A única defesa correta é a
 *    constraint `eventoId @unique` do schema: a segunda entrega colide em
 *    `P2002`, que aqui é o **caminho feliz** (duplicado → 200 sem processar) e
 *    não um erro. Note que isso diverge do uso de `P2002` em
 *    `empresa.service.ts`, onde ele vira `HttpError` 409.
 *
 * 2. **O payload persistido é sempre a versão REDIGIDA** (GTW-01 / Pitfall 9).
 *    Nenhum caminho deste arquivo grava o envelope bruto. `redigirEnvelope`
 *    (plano 03-03) é uma allowlist positiva: dado de cartão e CPF/CNPJ nunca
 *    são copiados, nem hoje nem quando o Asaas adicionar um campo sensível novo
 *    sem aviso — coisa que a documentação deles diz explicitamente que vai
 *    acontecer.
 *
 * 3. **Status de acesso é DERIVADO por `avaliarAcesso`, jamais escrito**
 *    (BILL-01 / D-16, Fase 2). É por isso que os oito eventos de observação —
 *    atraso, recusa de captura, estorno, chargeback, expiração e cancelamento
 *    de checkout, inativação e remoção de assinatura — não escrevem nada. Ver o
 *    comentário longo no ramo de `PAYMENT_OVERDUE`.
 *
 * ============================================================================
 * FRONTEIRA DESTA WAVE (plano 03-05, wave 2).
 * ============================================================================
 *
 * Os quatro eventos que mutam estado (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`,
 * `SUBSCRIPTION_CREATED`, `CHECKOUT_PAID`) são despachados aqui mas deixados
 * DELIBERADAMENTE não-processados: `marcarErro` é chamado, `processadoEm`
 * permanece `null`. Assim, se a execução parar entre as waves, nenhum evento é
 * perdido — eles ficam na fila de retrabalho `WHERE processadoEm IS NULL` que o
 * plano 03-06 e, depois, a Fase 5 (WRK-01) consomem. Marcá-los como concluídos
 * seria a única forma de perdê-los para sempre.
 *
 * Proibido neste arquivo NESTA wave: `prisma.empresa.update`,
 * `prisma.empresa.updateMany`, `prisma.$transaction`,
 * `acessoService.registrarTransicao`. Todos entram no plano 03-06.
 */

/** Prefixo obrigatório de todo log deste subsistema. Nunca logar o corpo. */
const PREFIXO = "[webhook-asaas]";

/** Limite da coluna `erro` do ledger. */
const LIMITE_MENSAGEM_DE_ERRO = 500;

class WebhookAsaasService {
  /**
   * Insere o evento no ledger. É o passo (3) do persist-then-ack: o 200 só pode
   * ser devolvido depois que esta chamada resolve.
   *
   * @returns `"NOVO"` quando a linha foi criada; `"DUPLICADO"` quando a
   *   constraint única já tinha registrado esta mesma entrega.
   * @throws qualquer erro do Prisma que **não** seja `P2002` — o route handler
   *   traduz isso em 500 para que o Asaas reenvie. Engolir aqui perderia o
   *   evento em silêncio.
   */
  async registrarEvento(
    eventoId: string,
    evento: string,
    bruto: unknown
  ): Promise<"NOVO" | "DUPLICADO"> {
    try {
      await prisma.eventoWebhookAsaas.create({
        data: {
          eventoId,
          evento,
          // Invariante 2: REDIGIDO, nunca o bruto. O cast é só para satisfazer
          // o tipo `InputJsonValue` do Prisma; o valor em runtime é exatamente
          // o objeto devolvido pela allowlist.
          payload: redigirEnvelope(bruto) as Prisma.InputJsonObject,
        },
      });

      return "NOVO";
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === "P2002"
      ) {
        // Caminho FELIZ, não erro: a mesma entrega já está no ledger. Quem
        // chama responde 200 e não agenda processamento nenhum.
        return "DUPLICADO";
      }

      throw erro;
    }
  }

  /** Conclui o evento e o retira da fila de retrabalho. */
  async marcarProcessado(
    eventoId: string,
    empresaId: string | null = null
  ): Promise<void> {
    await prisma.eventoWebhookAsaas.update({
      where: { eventoId },
      data: {
        processadoEm: new Date(),
        erro: null,
        ...(empresaId ? { empresaId } : {}),
      },
    });
  }

  /**
   * Registra a falha SEM concluir o evento.
   *
   * Pitfall 10: o 200 já foi enviado quando este método roda, então o Asaas
   * nunca reenvia — `processadoEm IS NULL` é a única fila de recuperação, e é
   * ela que a Fase 5 (WRK-01) drena. Preencher `processadoEm` aqui apagaria o
   * evento da fila e ele sumiria para sempre. O `console.error` sozinho também
   * não bastaria: log não é consultável.
   */
  async marcarErro(eventoId: string, mensagem: string): Promise<void> {
    await prisma.eventoWebhookAsaas.update({
      where: { eventoId },
      data: {
        erro: mensagem.slice(0, LIMITE_MENSAGEM_DE_ERRO),
        tentativas: { increment: 1 },
      },
    });
  }

  /**
   * Despacha o evento já persistido. Roda dentro de `agendarPosResposta`,
   * DEPOIS do 200 — por isso nada aqui pode rejeitar: uma rejeição não teria
   * para onde ir e o evento sumiria sem rastro consultável.
   */
  async processar(eventoId: string): Promise<void> {
    try {
      const registro = await prisma.eventoWebhookAsaas.findUnique({
        where: { eventoId },
        select: {
          eventoId: true,
          evento: true,
          // Ainda não consumido nesta wave; é o insumo dos handlers de mutação
          // do plano 03-06. Selecionado aqui para fixar o contrato de leitura.
          payload: true,
          processadoEm: true,
        },
      });

      if (!registro) {
        console.error(`${PREFIXO} evento ausente do ledger`, eventoId);
        return;
      }

      if (registro.processadoEm) {
        // Segunda barreira de idempotência, além da constraint única: cobre o
        // caso de dois agendamentos para o mesmo `eventoId` dentro do processo.
        return;
      }

      switch (registro.evento) {
        // ==================================================================
        // GRUPO 1 — OBSERVAÇÃO. Nenhuma escrita de fato de billing.
        // ==================================================================
        case "PAYMENT_OVERDUE":
          // NÃO ESCREVER AQUI É O REQUISITO, NÃO UMA OMISSÃO (GTW-04,
          // Pattern 4, Pitfall 4).
          //
          // GTW-04 diz que o webhook de atraso "inicia a contagem da carência",
          // o que soa como um comando de escrita. Não é. `avaliarAcesso()` da
          // Fase 2 já devolve `CARENCIA` assim que `agora >= acessoAte`, e
          // `acessoAte` é, por construção (D-01), a meia-noite de São Paulo da
          // data de vencimento da cobrança não paga. A carência de 10 dias
          // começa SOZINHA no instante em que ela vence. Escrever algo aqui
          // seria:
          //
          //  - redundante: o estado derivado já é o correto;
          //  - perigoso: uma entrega atrasada, ou um `PAYMENT_OVERDUE` que
          //    chega depois do `PAYMENT_RECEIVED` do mesmo mês, encurtaria ou
          //    reiniciaria a carência de quem já pagou;
          //  - contrário a BILL-01/D-16: status é derivado, nunca armazenado.
          //
          // A Fase 2 deliberadamente não tem coluna `carenciaInicioEm`; se uma
          // aparecer no schema, este ramo é o suspeito.
          //
          // Nota sobre auditoria: RESEARCH § Pattern 4 sugere chamar
          // `acessoService.registrarTransicao` aqui para que uma empresa cujo
          // admin não faz login tenha o momento da carência registrado. Isso
          // não entra nesta wave — `registrarTransicao` abre `$transaction` e
          // escreve em `Empresa.ultimoStatusAuditado`, e a fronteira desta wave
          // é "nenhuma mutação". Decisão do plano 03-06.
          //
          // Estorno e chargeback (`PAYMENT_REFUNDED`,
          // `PAYMENT_CHARGEBACK_REQUESTED`) caem no mesmo grupo por outro
          // motivo: revogar acesso já pago é decisão de PRODUTO, levantada para
          // a Fase 7. E reduzir `acessoAte` violaria a escrita monotônica
          // (Pattern 3), que é justamente a defesa contra reentrega de evento
          // antigo.
        case "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED":
        case "PAYMENT_REFUNDED":
        case "PAYMENT_CHARGEBACK_REQUESTED":
        case "CHECKOUT_EXPIRED":
        case "CHECKOUT_CANCELED":
        case "SUBSCRIPTION_INACTIVATED":
        case "SUBSCRIPTION_DELETED":
          console.error(
            `${PREFIXO} evento observado, sem mutação de estado`,
            registro.eventoId,
            registro.evento
          );
          await this.marcarProcessado(eventoId);
          return;

        // ==================================================================
        // GRUPO 2 — MUTADORES DE ESTADO. Fora do escopo desta wave.
        // ==================================================================
        case "PAYMENT_CONFIRMED":
        case "PAYMENT_RECEIVED":
        case "SUBSCRIPTION_CREATED":
        case "CHECKOUT_PAID":
          // TODO(03-06): resolver o tenant pelo mapa local (Pattern 5), re-buscar
          // o pagamento em `GET /v3/payments/{id}` e estender `acessoAte` com o
          // `updateMany` monotônico (Pattern 3).
          //
          // Até lá o evento fica INTENCIONALMENTE na fila `processadoEm IS NULL`.
          // `marcarProcessado` aqui seria o único jeito de perdê-lo caso a
          // execução parasse entre as waves.
          await this.marcarErro(
            eventoId,
            "handler de mutação pendente — plano 03-06"
          );
          return;

        // ==================================================================
        // GRUPO 3 — DESCONHECIDO.
        // ==================================================================
        default:
          // Anti-padrão explícito: "retornar 500 para evento desconhecido".
          // Eventos novos aparecem sem aviso na fila do Asaas, e uma exceção
          // aqui — mesmo depois do 200 — deixaria a linha presa na fila de
          // retrabalho sem que ninguém possa fazer nada com ela. Logar e
          // concluir é a resposta correta.
          console.error(
            `${PREFIXO} evento desconhecido`,
            registro.eventoId,
            registro.evento
          );
          await this.marcarProcessado(eventoId);
          return;
      }
    } catch (erro) {
      console.error(`${PREFIXO} falha ao processar evento`, eventoId, erro);

      try {
        await this.marcarErro(
          eventoId,
          erro instanceof Error ? erro.message : String(erro)
        );
      } catch (erroAoGravar) {
        // Último recurso: se nem gravar o erro funciona (banco fora), o log é
        // tudo que resta. Propagar daqui rejeitaria a promise que
        // `agendarPosResposta` executa fora do ciclo do request.
        console.error(
          `${PREFIXO} falha ao gravar o erro no ledger`,
          eventoId,
          erroAoGravar
        );
      }
    }
  }
}

export const webhookAsaasService = new WebhookAsaasService();
