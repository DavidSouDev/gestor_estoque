import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { AsaasApiError, asaasClient } from "@/lib/billing/asaas/client";
import { VALOR_PLANO_MENSAL, appBaseUrl, asaasCheckoutBaseUrl } from "@/lib/billing/asaas/config";
import { primeiraCobrancaEmSaoPaulo } from "@/lib/billing/asaas/datas";
import type { AsaasCheckout } from "@/lib/billing/asaas/tipos";
// Importado como TIPO de propósito: `FatosDeAssinatura` ESTENDE `FatosDeAcesso`
// em vez de redeclarar os 4 campos, e é essa herança que faz o objeto devolvido
// por `fatosDeAssinatura` ser aceito diretamente por `acessoEfetivoAte` e
// `ultimoDiaDeAcessoEmSaoPaulo` — sem remontagem e sem um segundo lugar para
// esquecer um campo quando os fatos de billing mudarem.
import type { FatosDeAcesso } from "@/lib/avaliar-acesso";

/**
 * Criação da assinatura recorrente do painel (GTW-01).
 *
 * ESCOPO PROIBIDO neste arquivo: tokenização, persistência de qualquer campo do
 * pagador, e qualquer estado de "tentativa pendente" ou retry automático. O
 * retry foi descartado nesta fase (D-07); a Fase 5 pode reintroduzi-lo de forma
 * explícita, mas não por acidente aqui.
 */

/**
 * Projeção C-07: exatamente os campos que o checkout precisa.
 *
 * `include` está proibido neste fluxo — a relação `usuarios` traria `senhaHash`
 * junto, e a Empresa é lida a cada tentativa de pagamento.
 */
const EMPRESA_CHECKOUT_SELECT = {
  id: true,
  nome: true,
  slug: true,
  trialFim: true,
  asaasCustomerId: true,
  // Pitfall 6: lido apenas para decidir se a reativação precisa limpar o campo.
  // Ver o bloco de reativação no fim de `criarCheckout`.
  canceladoEm: true,
};

/**
 * Projeção C-07 da tela de assinatura: os 4 fatos de billing mais o id da
 * assinatura no gateway.
 *
 * Mesma regra da projeção acima — `include` está proibido, porque a relação
 * `usuarios` traria `senhaHash` junto. Aqui o risco é ainda maior: esta é a
 * leitura de toda renderização da página de assinatura.
 */
const EMPRESA_ASSINATURA_SELECT = {
  id: true,
  asaasSubscriptionId: true,
  canceladoEm: true,
  acessoAte: true,
  trialFim: true,
  acessoVitalicio: true,
};

export interface CheckoutCriado {
  url: string;
  checkoutId: string;
}

/**
 * Os fatos que a página de assinatura precisa: os 4 de `FatosDeAcesso` (BILL-01)
 * mais o id da assinatura no gateway.
 *
 * `asaasSubscriptionId` nulo NÃO é um erro — é um dos estados legítimos da tela
 * (empresa em trial que nunca pagou, ou cujo checkout ainda não virou assinatura).
 */
export interface FatosDeAssinatura extends FatosDeAcesso {
  asaasSubscriptionId: string | null;
}

/**
 * O que o gateway sabe sobre a assinatura — e SÓ isso.
 *
 * O `status` do Asaas (`ACTIVE`/`EXPIRED`/`INACTIVE`) está deliberadamente
 * AUSENTE deste tipo. São duas razões independentes:
 *
 *   1. É vocabulário de fornecedor que o usuário final não sabe interpretar.
 *   2. Exibi-lo criaria uma SEGUNDA autoridade de status ao lado de
 *      `avaliarAcesso` — e BILL-01 é explícito em que o status é derivado dos
 *      nossos fatos, nunca de um campo externo.
 *
 * Sem o campo no tipo, não existe caminho de compilação para ele chegar à tela.
 */
export interface StatusAssinatura {
  origem: "asaas" | "indisponivel";
  /** `nextDueDate` cru do gateway, no formato `"YYYY-MM-DD"`. */
  proximaCobranca: string | null;
  ciclo: string | null;
}

class AssinaturaService {
  async criarCheckout(empresaId: string): Promise<CheckoutCriado> {
    const empresa = await prisma.empresa.findFirst({
      where: {
        id: empresaId,
        deletedAt: null,
      },
      select: EMPRESA_CHECKOUT_SELECT,
    });

    if (!empresa) {
      throw new HttpError("Empresa não encontrada.", 404);
    }

    // As três URLs de callback são a mesma: o painel do próprio tenant. O
    // resultado do pagamento é lido do nosso banco (escrito pelo webhook), não
    // da URL para onde o Asaas devolve o navegador — um retorno em `successUrl`
    // não é prova de pagamento e nada nesta fase o trata como tal.
    const urlDeRetorno = `${appBaseUrl()}/${empresa.slug}/admin`;

    let checkout: AsaasCheckout;

    try {
      checkout = await asaasClient.criarCheckout({
        empresaId: empresa.id,
        nomeItem: "Plano mensal",
        descricaoItem: "Assinatura mensal do painel",
        // D-02: o preço mora em `VALOR_PLANO_MENSAL`. Um literal aqui viraria um
        // segundo lugar para mudar quando o plano subir de preço.
        valor: VALOR_PLANO_MENSAL,
        // D-03: a primeira cobrança cai no FIM DO TRIAL, não no registro. A
        // aritmética de fuso é toda de `primeiraCobrancaEmSaoPaulo` — não
        // re-derivar aqui.
        nextDueDate: primeiraCobrancaEmSaoPaulo(empresa.trialFim),
        successUrl: urlDeRetorno,
        cancelUrl: urlDeRetorno,
        expiredUrl: urlDeRetorno,
      });
    } catch (erro) {
      // C-05: `status` e `empresaId` bastam para diagnosticar. O corpo da
      // resposta do Asaas NUNCA entra no log — ele carrega dados do pagador.
      console.error(
        `[asaas] falha ao criar checkout — empresaId=${empresaId}`,
        `status=${erro instanceof AsaasApiError ? erro.status : "desconhecido"}`
      );

      throw new HttpError("Não foi possível iniciar o pagamento. Tente novamente.", 502);
    }

    // ─── FRONTEIRA D-07 ───────────────────────────────────────────────────────
    // Acima desta linha não existe NENHUMA escrita. É essa ordem — Asaas
    // primeiro, banco depois — que garante que uma falha de rede não deixe uma
    // linha órfã de "assinatura pendente": esta fase não tem retry nem
    // reconciliação, então um registro sem contrapartida no gateway ficaria
    // para sempre sem quem o resolvesse. Inverter a ordem quebra a invariante
    // provada pela asserção de ausência em `assinatura.service.test.ts`.
    // ──────────────────────────────────────────────────────────────────────────

    // Pitfall 8: este mapa é a ÚNICA associação certa entre um checkout e a
    // empresa. O payload de `CHECKOUT_PAID` traz apenas a configuração da
    // recorrência (`cycle`, `nextDueDate`) e não o id `sub_…` da assinatura
    // criada — sem esta linha, o webhook do plano 03-06 não teria como resolver
    // o tenant sem confiar no que o próprio payload afirma (C-08).
    await prisma.checkoutAsaas.create({
      data: {
        asaasCheckoutId: checkout.id,
        empresaId,
        status: checkout.status,
      },
    });

    // Open Question 1 / suposição A1 da pesquisa da Fase 3: o `link` da resposta
    // pode vir nulo, e o host do checkout de sandbox ainda é suposto — por isso
    // a base é variável de ambiente e não literal. A confirmação contra o
    // sandbox real é do plano 03-07.
    const url = checkout.link ?? `${asaasCheckoutBaseUrl()}?id=${checkout.id}`;

    // REATIVAÇÃO (Pitfall 6 / Open Question 2 da pesquisa, decidida no plano 07-04).
    //
    // Hoje NENHUM caminho do sistema limpa `canceladoEm`: `aplicarPagamentoConfirmado`
    // só estende `acessoAte`, e o worker diário nunca escreve neste campo. O efeito
    // fica mascarado por D-09 enquanto o acesso pago estiver vigente, então o bug só
    // aparece meses depois — quando o cliente que voltou para de pagar de novo, a
    // auditoria o rotula `CANCELADO` em vez de `BLOQUEADO`, e a tela de assinatura
    // mostra "cancelada" para quem é assinante ativo.
    //
    // `criarCheckout` é o único momento em que a intenção do usuário de VOLTAR é
    // inequívoca, e — diferente do webhook — é escrita local sem I/O de gateway
    // envolvido. A guarda `!== null` evita uma escrita a cada checkout de cliente
    // que nunca cancelou.
    //
    // Está DEPOIS da fronteira D-07 pelo mesmo motivo do mapa acima: se o Asaas
    // rejeitar, não houve intenção concretizada de voltar, e o campo fica como está.
    if (empresa.canceladoEm !== null) {
      await prisma.empresa.update({
        where: { id: empresaId },
        data: { canceladoEm: null },
      });
    }

    // `asaasCustomerId` e `asaasSubscriptionId` continuam intocados aqui: só
    // existem depois que o pagador conclui o checkout, e quem os preenche são os
    // eventos de webhook (plano 03-06). Neste ponto o Asaas ainda não criou nem
    // cliente nem assinatura.
    return { url, checkoutId: checkout.id };
  }

  /**
   * Os fatos de billing da empresa, sem nenhum I/O de gateway (SUB-01).
   *
   * É a leitura com que a página decide QUAL dos estados de tela renderizar —
   * vitalícia, cancelada, sem assinatura ou assinante — ANTES de decidir se vale
   * a pena falar com o Asaas. Inverter essa ordem faz o produto consultar o
   * gateway com um id de assinatura já removida.
   *
   * `findFirst` com `deletedAt: null` no MESMO `where`, nunca `findUnique({ id })`:
   * uma empresa soft-deletada não pode devolver fatos de billing (C-07).
   */
  async fatosDeAssinatura(empresaId: string): Promise<FatosDeAssinatura | null> {
    const empresa = await prisma.empresa.findFirst({
      where: {
        id: empresaId,
        deletedAt: null,
      },
      select: EMPRESA_ASSINATURA_SELECT,
    });

    if (!empresa) {
      return null;
    }

    // Campos listados um a um (e não um rest spread sobre `id`): é o que faz o
    // compilador reclamar se um fato novo de billing entrar na projeção sem
    // entrar no contrato — em vez de vazá-lo silenciosamente para a tela.
    return {
      asaasSubscriptionId: empresa.asaasSubscriptionId,
      acessoAte: empresa.acessoAte,
      trialFim: empresa.trialFim,
      canceladoEm: empresa.canceladoEm,
      acessoVitalicio: empresa.acessoVitalicio,
    };
  }

  /**
   * Leitura viva da assinatura no gateway (SUB-01, D-02).
   *
   * ESTE MÉTODO NÃO LANÇA — e essa é a ÚNICA inversão da convenção de erro do
   * projeto neste arquivo. A razão é D-02b: uma indisponibilidade do Asaas não
   * pode derrubar a página de assinatura, porque tudo que realmente importa
   * (status de acesso, data de fim, botão de cancelar) é derivado dos NOSSOS
   * fatos e continua correto sem o gateway.
   *
   * A degradação é EXPLÍCITA, não silenciosa: `origem: "indisponivel"` com os
   * dois campos nulos. Devolver um valor antigo — ou omitir a distinção — faria a
   * tela afirmar como atual um dado que ninguém confirmou.
   */
  async consultarAssinatura(asaasSubscriptionId: string): Promise<StatusAssinatura> {
    try {
      const assinatura = await asaasClient.buscarAssinatura(asaasSubscriptionId);

      return {
        origem: "asaas",
        proximaCobranca: assinatura.nextDueDate,
        ciclo: assinatura.cycle,
      };
    } catch (erro) {
      // C-05: `status` basta para diagnosticar. O corpo da resposta do Asaas
      // NUNCA entra no log — ele carrega dados do pagador.
      console.error(
        `[asaas] falha ao consultar assinatura`,
        `status=${erro instanceof AsaasApiError ? erro.status : "desconhecido"}`
      );

      return { origem: "indisponivel", proximaCobranca: null, ciclo: null };
    }
  }

  /**
   * Cancela a assinatura recorrente (SUB-02, D-04).
   *
   * O acesso já pago NÃO é encurtado: `acessoAte` fica intocado e `avaliarAcesso`
   * continua devolvendo `EM_DIA` até o período expirar (D-06). O que este método
   * faz é parar as cobranças futuras e registrar a intenção do usuário.
   *
   * A ordem dos passos abaixo é NORMATIVA.
   */
  async cancelar(empresaId: string): Promise<void> {
    const empresa = await prisma.empresa.findFirst({
      where: {
        id: empresaId,
        deletedAt: null,
      },
      select: EMPRESA_ASSINATURA_SELECT,
    });

    if (!empresa) {
      throw new HttpError("Empresa não encontrada.", 404);
    }

    // No-op idempotente, ANTES da checagem de assinatura e antes do gateway.
    // Existe para duplo-submit e para reentrada (usuário reenvia depois de um
    // timeout): o cancelamento já aconteceu, e um segundo `DELETE` só produziria
    // um 404 para engolir logo em seguida. Reescrever a data também estaria
    // errado — ela é o registro de QUANDO o usuário cancelou.
    if (empresa.canceladoEm !== null) {
      return;
    }

    if (!empresa.asaasSubscriptionId) {
      throw new HttpError("Nenhuma assinatura ativa para cancelar.", 409);
    }

    try {
      await asaasClient.removerAssinatura(empresa.asaasSubscriptionId);
    } catch (erro) {
      // Pitfall 4: `DELETE /v3/subscriptions/{id}` NÃO é idempotente — a segunda
      // chamada devolve 404. Tratar esse 404 como falha deixaria o pior estado
      // possível: a cobrança parada no gateway e o sistema achando que o cliente
      // continua assinante.
      //
      // A doc do Asaas usa o mesmo 404 para "não existe" e para "não pertence à
      // conta autenticada". Aqui o segundo caso é IMPOSSÍVEL POR CONSTRUÇÃO: o id
      // nunca veio do cliente (D-05) — foi lido da própria Empresa da sessão, na
      // query acima. Por isso é seguro ler o 404 como "já não existe lá".
      if (!(erro instanceof AsaasApiError) || erro.status !== 404) {
        // C-05: `status` e `empresaId`, nunca o corpo do gateway.
        console.error(
          `[asaas] falha ao cancelar assinatura — empresaId=${empresaId}`,
          `status=${erro instanceof AsaasApiError ? erro.status : "desconhecido"}`
        );

        throw new HttpError("Não foi possível cancelar agora. Tente novamente.", 502);
      }
    }

    // ─── FRONTEIRA D-04 ───────────────────────────────────────────────────────
    // Acima desta linha não existe NENHUMA escrita. A ordem — Asaas primeiro,
    // banco depois — é o que impede o pior estado que esta fase pode produzir:
    // `canceladoEm` gravado, a UI afirmando "assinatura cancelada", e o cartão
    // do cliente continuando a ser cobrado todo mês até virar chargeback.
    // Inverter a ordem quebra a invariante provada pela asserção de ausência em
    // `assinatura.service.test.ts`.
    // ──────────────────────────────────────────────────────────────────────────

    // Escrita DIRETA, e não por `empresaService.update`, de propósito: o allowlist
    // positivo daquele método é defesa deliberada de BILL-04 — ele recebe o body
    // cru de `PATCH /api/empresas/[id]`, e acrescentar `canceladoEm` à lista
    // abriria o campo para qualquer ADMIN autenticado gravar por HTTP. O
    // precedente é `webhookAsaasService.capturarAssinatura`, que grava
    // `asaasSubscriptionId` pelo mesmo caminho e pela mesma razão.
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { canceladoEm: new Date() },
    });

    // NENHUMA linha de auditoria é gravada aqui, e isso é deliberado: com
    // `acessoAte` ainda no futuro, o status derivado NÃO muda (D-06 mantém
    // `EM_DIA`) — não há transição a registrar, e inventar uma criaria um evento
    // de auditoria sem contrapartida no estado. A transição para `CANCELADO`
    // acontece quando o período expira, e quem a registra já existe:
    // `revalidarConta` (`AVALIACAO_SESSAO`) ou o worker diário (`WORKER_DIARIO`).
    // Consequência direta: esta fase não precisa de nenhum valor novo de
    // `CausaTransicaoAcesso` nem de nenhuma migration.
  }
}

export const assinaturaService = new AssinaturaService();
