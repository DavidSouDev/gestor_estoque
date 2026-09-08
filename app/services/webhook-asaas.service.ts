import { prisma } from "@/lib/prisma";
import { CausaTransicaoAcesso, Prisma } from "@prisma/client";
import {
  assinaturaSchema,
  checkoutSchema,
  pagamentoSchema,
  redigirEnvelope,
} from "@/lib/billing/asaas/eventos";
import { asaasClient } from "@/lib/billing/asaas/client";
import { acessoAteAposPagamento } from "@/lib/billing/asaas/datas";
import { acessoService } from "@/app/services/acesso.service";
import { avaliarAcesso } from "@/lib/avaliar-acesso";
import type { AsaasPayment, AsaasSubscription } from "@/lib/billing/asaas/tipos";

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
 * 4. **A empresa afetada vem SEMPRE do mapa local, nunca do payload** (C-08,
 *    Pattern 5). Ver o comentário longo de `resolverEmpresaId`.
 *
 * 5. **`acessoAte` só cresce, e a guarda mora no banco.** Ver as três
 *    invariantes de `aplicarPagamentoConfirmado`.
 *
 * ============================================================================
 * INVARIANTE DE TERMINAÇÃO — vale para TODO caminho de `processar`.
 * ============================================================================
 *
 * Todo ramo termina em `marcarProcessado` (concluído) OU em `marcarErro` (fica
 * na fila de retrabalho `WHERE processadoEm IS NULL`, que a Fase 5 / WRK-01
 * drena). Nunca em nenhum dos dois. Um evento sem `processadoEm` e sem `erro`
 * seria invisível tanto para a fila quanto para o operador: o Asaas não
 * reenviaria (o 200 já foi respondido) e ninguém saberia que ele existiu.
 *
 * Ao adicionar um ramo novo, conferir os dois pontos de saída antes do `return`.
 */

/** Prefixo obrigatório de todo log deste subsistema. Nunca logar o corpo. */
const PREFIXO = "[webhook-asaas]";

/** Limite da coluna `erro` do ledger. */
const LIMITE_MENSAGEM_DE_ERRO = 500;

/**
 * Identificadores que um evento pode oferecer para localizar o tenant.
 *
 * Todos são `string | null | undefined` porque vêm de um payload de terceiro
 * validado por schema NÃO-estrito: campo ausente e campo nulo são a mesma
 * coisa aqui.
 */
interface DadosDeResolucao {
  /** Id `sub_…` da assinatura, quando a cobrança é recorrente. */
  subscription?: string | null;
  /** Id do checkout hospedado (`CheckoutAsaas.asaasCheckoutId`). */
  checkoutId?: string | null;
  /** Id `cus_…` do cliente no Asaas. */
  customer?: string | null;
  /** Definido por nós como `empresaId`. CROSS-CHECK apenas — nunca autoridade. */
  externalReference?: string | null;
}

/**
 * Status do Asaas que significam "o dinheiro entrou" e portanto concedem acesso.
 *
 * `CONFIRMED` está na lista, e é o gatilho principal, porque no cartão de
 * crédito o fluxo é `CREATED → CONFIRMED → (~30 dias) → RECEIVED`: `CONFIRMED`
 * é a captura aprovada, `RECEIVED` é o repasse do dinheiro para a conta Asaas.
 * Esperar por `RECEIVED` deixaria um cliente pagante bloqueado por um mês.
 *
 * Declarado como `readonly string[]` (e não tupla de literais) de propósito: o
 * vocabulário de status é de terceiro e pode crescer sem aviso — a comparação
 * precisa aceitar qualquer string, não só as conhecidas pelo compilador.
 */
const STATUS_QUE_CONCEDEM_ACESSO: readonly string[] = [
  "CONFIRMED",
  "RECEIVED",
  "RECEIVED_IN_CASH",
];

/** Extrai um sub-objeto do payload persistido sem confiar na forma dele. */
function subObjetoDoPayload(payload: unknown, chave: string): unknown {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return undefined;
  }

  return (payload as Record<string, unknown>)[chave];
}

class WebhookAsaasService {
  /**
   * Traduz um evento de webhook no `empresaId` afetado — usando EXCLUSIVAMENTE
   * o mapa local.
   *
   * ==========================================================================
   * POR QUE A ORDEM IMPORTA, E POR QUE `externalReference` NÃO RESOLVE NADA.
   * ==========================================================================
   *
   * O payload de webhook é entrada NÃO CONFIÁVEL. O Asaas não assina o corpo:
   * a autenticidade da entrega se apoia num bearer estático, que é replayável
   * por quem o capturar (T-03-23). Portanto **nenhum identificador vindo do
   * payload autoriza coisa alguma**. A autoridade é sempre uma coluna que NÓS
   * gravamos, a partir de um fluxo que NÓS iniciamos:
   *
   *   1. `Empresa.asaasSubscriptionId` — gravado por `capturarAssinatura` a
   *      partir de `SUBSCRIPTION_CREATED`, e `@unique` no schema. A unicidade é
   *      o que impede um `sub_…` forjado de apontar para duas empresas.
   *   2. `CheckoutAsaas.asaasCheckoutId` — gravado quando NÓS criamos o
   *      checkout, também `@unique`. Cobre a janela em que a cobrança chega
   *      antes de a assinatura existir (Open Question 2). **Na prática este é o
   *      passo que resolve o primeiro pagamento de todo cliente**, e o
   *      `checkoutId` correspondente NÃO vem do payload: vem do campo
   *      `checkoutSession` do objeto RE-BUSCADO na API. Ver o comentário do
   *      passo 3 de `aplicarPagamentoConfirmado`.
   *   3. `Empresa.asaasCustomerId` — o mais fraco dos três (não é `@unique`),
   *      por isso é o último. Existe para o caso em que o cliente já pagou
   *      antes por outro caminho.
   *
   * A ordem é do identificador mais específico para o mais genérico: uma
   * assinatura pertence a exatamente uma empresa; um cliente do Asaas, em
   * teoria, poderia estar ligado a mais de um fluxo nosso.
   *
   * O campo de referência externa é usado **apenas como cross-check**. Aceitá-lo
   * como fonte seria IDOR direto (C-08, ASVS V4): quem forjasse um webhook
   * escolheria a empresa alvo simplesmente escrevendo o id dela no corpo, e
   * estenderia acesso pago de qualquer tenant. Existe ainda um segundo motivo,
   * independente da segurança: a suposição A3 do Assumptions Log da pesquisa —
   * que a referência externa definida no checkout propagaria para a assinatura e
   * para as cobranças. A homologação do plano 03-07 **REFUTOU A3 com evidência**:
   * ela vem `null` na cobrança e na assinatura, e consultar a API por ela devolve
   * zero resultados. Um "fallback" por referência externa não resolveria nada —
   * como cross-check, a ausência é inofensiva.
   *
   * NOTA SOBRE A PROCEDÊNCIA DOS IDENTIFICADORES: nada acima muda pelo fato de
   * o `checkoutId` passar a vir de `checkoutSession`. Esse campo é lido do objeto
   * devolvido pela API do Asaas em resposta à NOSSA chave — não do corpo não
   * assinado — e ainda assim ele não autoriza sozinho: só vale se casar com uma
   * linha de `CheckoutAsaas` que nós mesmos gravamos ao criar o checkout. A
   * cadeia de confiança continua terminando numa escrita nossa.
   *
   * Divergência entre o mapa local e a referência externa é sinal de defeito
   * nosso ou de tentativa de forja: é logada, e o **mapa local prevalece**.
   *
   * @returns o `empresaId` resolvido, ou `null`. Nulo NÃO é erro recuperável
   *   por adivinhação: quem chama marca `erro` no ledger e deixa o evento na
   *   fila de retrabalho. Criar empresa aqui seria criar tenant a partir de
   *   entrada não confiável.
   */
  async resolverEmpresaId(dados: DadosDeResolucao): Promise<string | null> {
    let empresaId: string | null = null;

    if (dados.subscription) {
      const empresa = await prisma.empresa.findFirst({
        where: { asaasSubscriptionId: dados.subscription, deletedAt: null },
        select: { id: true },
      });

      empresaId = empresa?.id ?? null;
    }

    if (!empresaId && dados.checkoutId) {
      const checkout = await prisma.checkoutAsaas.findUnique({
        where: { asaasCheckoutId: dados.checkoutId },
        select: { empresaId: true },
      });

      empresaId = checkout?.empresaId ?? null;
    }

    if (!empresaId && dados.customer) {
      // `asaasCustomerId` NÃO é `@unique` no schema (ver JSDoc acima). Um
      // `findFirst` aqui escolheria uma linha arbitrária se duas empresas um
      // dia compartilharem o mesmo valor — silenciosamente estendendo acesso
      // para o tenant ERRADO. `take: 2` detecta a ambiguidade sem precisar
      // contar todas as linhas: ao achar a segunda, já sabemos que não dá
      // para resolver com segurança, e o fail-closed do resto da função cuida
      // do resto (nulo vira erro no ledger, nunca acesso por adivinhação).
      const empresas = await prisma.empresa.findMany({
        where: { asaasCustomerId: dados.customer, deletedAt: null },
        select: { id: true },
        take: 2,
      });

      if (empresas.length > 1) {
        console.error(`${PREFIXO} asaasCustomerId ambíguo entre múltiplas empresas`, {
          customer: dados.customer,
        });
      } else {
        empresaId = empresas[0]?.id ?? null;
      }
    }

    // Cross-check, nunca fonte. Note que ele só roda quando o mapa local JÁ
    // resolveu: sem resolução, a referência externa não pode salvar o evento.
    if (
      empresaId &&
      dados.externalReference &&
      dados.externalReference !== empresaId
    ) {
      console.error(`${PREFIXO} referência externa diverge do mapa local`, {
        mapaLocal: empresaId,
        referenciaExterna: dados.externalReference,
      });
    }

    return empresaId;
  }

  /**
   * Ramo de `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED`: aqui dinheiro vira acesso
   * (GTW-03, GTW-04).
   *
   * ==========================================================================
   * TRÊS INVARIANTES ESTRUTURAIS. Nenhuma delas é uma checagem defensiva.
   * ==========================================================================
   *
   * **(a) O re-fetch é controle de segurança, não redundância** (Pitfall 1,
   * T-03-32). O Asaas não assina o corpo do webhook: a autenticidade se apoia
   * num bearer estático, replayável por quem o capturar. Um payload forjado
   * afirmando "pago" concederia acesso grátis para sempre. Reconferir a cobrança
   * na API — com a nossa chave, contra o servidor deles — é o que faz a forja
   * não sobreviver. Por isso o `dueDate` usado no cálculo é o do RE-FETCH, e
   * nunca o do payload: aceitar o vencimento afirmado permitiria comprar anos de
   * acesso com um único corpo forjado.
   *
   * **(b) `acessoAte` é função PURA do `dueDate`** (Pitfall 5). Derivar de
   * `new Date()` faria cada reentrega do MESMO evento avançar o acesso mais um
   * mês, e o nosso calendário se desalinharia permanentemente do calendário de
   * cobrança do gateway. Sendo puro, o webhook reentregue produz exatamente o
   * mesmo instante — e é isso que transforma a escrita abaixo num no-op.
   *
   * **(c) A guarda de monotonicidade mora no `WHERE`, nunca num `if`.** Ver o
   * comentário no passo 6.
   *
   * `param payment` chega como `unknown` porque é payload de terceiro lido do
   * ledger: só passa a ter forma depois do `safeParse`. O objeto com forma
   * garantida neste método é `autoritativo`, que veio da API.
   */
  async aplicarPagamentoConfirmado(
    eventoId: string,
    payment: unknown
  ): Promise<void> {
    const validado = pagamentoSchema.safeParse(payment);

    if (!validado.success) {
      await this.marcarErro(
        eventoId,
        "payload de pagamento sem os campos exigidos"
      );
      return;
    }

    // 1. RE-FETCH AUTORITATIVO — invariante (a).
    let autoritativo: AsaasPayment;

    try {
      autoritativo = await asaasClient.buscarPagamento(validado.data.id);
    } catch (erro) {
      // Falha do gateway não pode derrubar o processamento nem propagar: este
      // método roda depois do 200, dentro do trabalho pós-resposta (T-03-37).
      // O evento fica na fila `processadoEm IS NULL` para a Fase 5 retentar.
      await this.marcarErro(
        eventoId,
        `falha ao reconferir a cobranca no gateway: ${
          erro instanceof Error ? erro.message : String(erro)
        }`
      );
      return;
    }

    // 2. GUARDA DE STATUS. Um payload que afirma "pago" só vale se o gateway
    // concordar. Qualquer outro status é anomalia registrada, não silêncio.
    if (!STATUS_QUE_CONCEDEM_ACESSO.includes(autoritativo.status)) {
      await this.marcarErro(
        eventoId,
        `cobranca nao esta paga no gateway: ${autoritativo.status}`
      );
      return;
    }

    // 3. TENANT PELO MAPA LOCAL — os identificadores vêm do objeto autoritativo,
    // e mesmo assim nenhum deles autoriza por si (ver `resolverEmpresaId`).
    //
    // `checkoutSession` é obrigatório aqui, não opcional: sem ele a PRIMEIRA
    // cobrança de todo checkout recorrente é insolúvel. A homologação do plano
    // 03-07 mediu a ordem real de entrega e ela desmente a suposição da
    // pesquisa — `PAYMENT_CONFIRMED` chega ANTES de `SUBSCRIPTION_CREATED`
    // (`sendType` sequencial ordena dentro de cada recurso, não entre recursos).
    // Como `externalReference` também não propaga para a cobrança (A3 refutada
    // com evidência), sem esta linha o mapa por `sub_…` ainda não existe, o
    // `cus_…` ainda não foi gravado, e um cliente que pagou fica na carência até
    // ser bloqueado. Foi exatamente o que aconteceu no primeiro pagamento real.
    const empresaId = await this.resolverEmpresaId({
      subscription: autoritativo.subscription,
      checkoutId: autoritativo.checkoutSession,
      customer: autoritativo.customer,
      externalReference: autoritativo.externalReference,
    });

    if (!empresaId) {
      await this.marcarErro(
        eventoId,
        "empresa nao resolvida para evento de pagamento"
      );
      return;
    }

    // 4. FATOS ATUAIS, com `select` explícito (C-07). `ultimoStatusAuditado` não
    // é fato de billing: entra só como `anterior` do compare-and-swap.
    const fatos = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        acessoAte: true,
        trialFim: true,
        canceladoEm: true,
        acessoVitalicio: true,
        ultimoStatusAuditado: true,
      },
    });

    if (!fatos) {
      await this.marcarErro(
        eventoId,
        "empresa resolvida nao encontrada ao ler os fatos de billing"
      );
      return;
    }

    // 5. CÁLCULO PURO — invariante (b). Proibido `new Date()` / `Date.now()`
    // nesta derivação.
    const novoAcessoAte = acessoAteAposPagamento(autoritativo.dueDate);

    // 6. ESCRITA MONOTÔNICA — invariante (c).
    //
    // A guarda está no `WHERE` e não num `if` porque um `if` em memória lê,
    // decide e escreve em três momentos distintos: entre a leitura e a escrita,
    // o worker diário da Fase 5 (ou outra entrega concorrente) pode ter movido
    // `acessoAte`, e a decisão já nasce velha. No `WHERE`, o Postgres avalia a
    // condição e aplica a escrita no MESMO comando — sem lock, sem coluna de
    // versão, sem transação.
    //
    // O efeito concreto: um `PAYMENT_CONFIRMED` de janeiro reentregue em março
    // produz um `novoAcessoAte` de fevereiro, que é MENOR que o valor corrente
    // de novembro. Nenhuma linha casa, `count === 0`, e nada acontece — nem
    // escrita nem auditoria. Uma empresa em dia não pode ser bloqueada por
    // reentrega (GTW-04). O ramo `acessoAte: null` cobre a primeira cobrança de
    // quem nunca pagou, cujo valor corrente não é comparável com `lt`.
    const { count } = await prisma.empresa.updateMany({
      where: {
        id: empresaId,
        OR: [{ acessoAte: null }, { acessoAte: { lt: novoAcessoAte } }],
      },
      data: { acessoAte: novoAcessoAte },
    });

    // 7. Fora de ordem: o evento foi TRATADO, apenas não havia o que mudar.
    // Deixá-lo na fila de retrabalho faria a Fase 5 retentá-lo para sempre.
    if (count === 0) {
      await this.marcarProcessado(eventoId, empresaId);
      return;
    }

    // 8. AUDITORIA. O status novo é DERIVADO dos fatos já atualizados — nunca um
    // literal. Escrever "pagou, logo está em dia" quebraria a invariante
    // BILL-01/D-16 da Fase 2 e daria a resposta errada para quem pagou durante o
    // trial (D-05) ou tem acesso vitalício (D-03).
    //
    // Note também o que NÃO é feito aqui: nenhuma linha de auditoria é criada
    // direto na tabela. O compare-and-swap já existe em `acessoService` e
    // duplicá-lo produziria linhas repetidas sob concorrência (T-02-15).
    const novo = avaliarAcesso(
      {
        acessoAte: novoAcessoAte,
        trialFim: fatos.trialFim,
        canceladoEm: fatos.canceladoEm,
        acessoVitalicio: fatos.acessoVitalicio,
      },
      new Date()
    ).status;

    await acessoService.registrarTransicao({
      empresaId,
      anterior: fatos.ultimoStatusAuditado,
      novo,
      causa: CausaTransicaoAcesso.WEBHOOK_PAGAMENTO,
    });

    await this.marcarProcessado(eventoId, empresaId);
  }

  /**
   * Ramo de `SUBSCRIPTION_CREATED`: captura os identificadores externos.
   *
   * Pitfall 8: este é o **único** evento que entrega o id `sub_…` da assinatura
   * criada. O evento de checkout pago traz apenas a CONFIGURAÇÃO da recorrência
   * (ciclo, próximo vencimento, data final) — não o id. Sem capturar aqui,
   * nenhuma cobrança futura da assinatura seria reconhecida como pertencente a
   * esta empresa, e todo `PAYMENT_CONFIRMED` recorrente cairia na fila de
   * retrabalho para sempre.
   *
   * A escrita é feita direto em `prisma.empresa.update`, e NÃO pelo service de
   * Empresa: o allowlist de campos daquele caminho (D-02-02, Fase 2) proíbe
   * campos de billing por design, e a decisão registrada lá é que escritas
   * legítimas de webhook usam método dedicado — mass assignment não é o modo
   * correto de contorná-lo (T-03-35).
   *
   * `param subscription` chega como `unknown` de propósito: é payload de
   * terceiro, e só passa a ter forma depois do `safeParse`.
   */
  async capturarAssinatura(eventoId: string, subscription: unknown): Promise<void> {
    const validado = assinaturaSchema.safeParse(subscription);

    if (!validado.success) {
      await this.marcarErro(
        eventoId,
        "payload de SUBSCRIPTION_CREATED sem os campos exigidos"
      );
      return;
    }

    // RE-FETCH AUTORITATIVO, pelo mesmo motivo do ramo de pagamento (T-03-32) e
    // por um segundo, específico deste ramo: o payload do webhook NÃO traz
    // `checkoutSession`, e é ele a única ponte de volta ao mapa local enquanto
    // `asaasSubscriptionId` e `asaasCustomerId` ainda estão nulos. Sem o
    // re-fetch, a resolução dependeria de `customer` (ainda não gravado) ou da
    // referência externa (que a homologação provou vir nula) — e este evento,
    // que é justamente quem CRIA o mapa por `sub_…`, nunca conseguiria criá-lo.
    let autoritativo: AsaasSubscription;

    try {
      autoritativo = await asaasClient.buscarAssinatura(validado.data.id);
    } catch (erro) {
      await this.marcarErro(
        eventoId,
        `falha ao reconferir a assinatura no gateway: ${
          erro instanceof Error ? erro.message : String(erro)
        }`
      );
      return;
    }

    const empresaId = await this.resolverEmpresaId({
      checkoutId: autoritativo.checkoutSession,
      customer: autoritativo.customer,
      externalReference: autoritativo.externalReference,
    });

    if (!empresaId) {
      // Sem checkout nosso na origem (assinatura criada por fora do produto),
      // o evento fica na fila `processadoEm IS NULL` para a Fase 5 reprocessar.
      await this.marcarErro(
        eventoId,
        "empresa nao resolvida para SUBSCRIPTION_CREATED"
      );
      return;
    }

    await prisma.empresa.update({
      where: { id: empresaId },
      data: {
        asaasSubscriptionId: autoritativo.id,
        asaasCustomerId: autoritativo.customer,
      },
    });

    await this.marcarProcessado(eventoId, empresaId);
  }

  /**
   * Ramo de `CHECKOUT_PAID`: registra o desfecho do checkout e captura o
   * `cus_…`.
   *
   * PROIBIDO extrair o id da assinatura do sub-objeto de recorrência deste
   * payload (Pitfall 8): aquele objeto traz apenas `cycle`, `nextDueDate` e
   * `endDate`. Código que tentasse lê-lo gravaria `undefined` silenciosamente e
   * quebraria toda a resolução por assinatura mais tarde. O id real vem de
   * `SUBSCRIPTION_CREATED`.
   *
   * Este ramo **não** estende `acessoAte`. Checkout pago é o desfecho da
   * captura do cartão; quem paga o acesso é o `PAYMENT_CONFIRMED` da cobrança
   * correspondente, que é reconferido na API antes de qualquer escrita.
   */
  async capturarCheckoutPago(eventoId: string, checkout: unknown): Promise<void> {
    const validado = checkoutSchema.safeParse(checkout);

    if (!validado.success) {
      await this.marcarErro(
        eventoId,
        "payload de CHECKOUT_PAID sem os campos exigidos"
      );
      return;
    }

    const dados = validado.data;

    const empresaId = await this.resolverEmpresaId({
      checkoutId: dados.id,
      customer: dados.customer,
      externalReference: dados.externalReference,
    });

    if (!empresaId) {
      await this.marcarErro(eventoId, "empresa nao resolvida para CHECKOUT_PAID");
      return;
    }

    // `status` é string livre no schema de propósito: vocabulário de terceiro
    // pode crescer sem aviso (ver comentário do model no schema.prisma).
    await prisma.checkoutAsaas.update({
      where: { asaasCheckoutId: dados.id },
      data: { status: dados.status },
    });

    if (dados.customer) {
      await prisma.empresa.update({
        where: { id: empresaId },
        data: { asaasCustomerId: dados.customer },
      });
    }

    await this.marcarProcessado(eventoId, empresaId);
  }

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
        // GRUPO 2 — CAPTURA DE IDENTIFICADORES EXTERNOS.
        // Escreve no MAPA LOCAL, nunca em fato de billing.
        // ==================================================================
        case "SUBSCRIPTION_CREATED":
          await this.capturarAssinatura(
            eventoId,
            subObjetoDoPayload(registro.payload, "subscription")
          );
          return;

        case "CHECKOUT_PAID":
          await this.capturarCheckoutPago(
            eventoId,
            subObjetoDoPayload(registro.payload, "checkout")
          );
          return;

        // ==================================================================
        // GRUPO 3 — MUTADORES DE FATO DE BILLING. O único caminho do dinheiro.
        // ==================================================================
        case "PAYMENT_CONFIRMED":
        case "PAYMENT_RECEIVED":
          // Os dois compartilham handler porque a guarda de status é feita
          // sobre a resposta AUTORITATIVA, não sobre o nome do evento — e a
          // escrita monotônica torna o segundo, do mesmo vencimento, um no-op.
          await this.aplicarPagamentoConfirmado(
            eventoId,
            subObjetoDoPayload(registro.payload, "payment")
          );
          return;

        // ==================================================================
        // GRUPO 4 — DESCONHECIDO.
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
