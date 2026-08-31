import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { AsaasApiError, asaasClient } from "@/lib/billing/asaas/client";
import { VALOR_PLANO_MENSAL, appBaseUrl, asaasCheckoutBaseUrl } from "@/lib/billing/asaas/config";
import { primeiraCobrancaEmSaoPaulo } from "@/lib/billing/asaas/datas";
import type { AsaasCheckout } from "@/lib/billing/asaas/tipos";

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
};

export interface CheckoutCriado {
  url: string;
  checkoutId: string;
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

    // Nada é gravado na Empresa aqui: `asaasCustomerId` e `asaasSubscriptionId`
    // só existem depois que o pagador conclui o checkout, e quem os preenche são
    // os eventos de webhook (plano 03-06). Neste ponto o Asaas ainda não criou
    // nem cliente nem assinatura.
    return { url, checkoutId: checkout.id };
  }
}

export const assinaturaService = new AssinaturaService();
