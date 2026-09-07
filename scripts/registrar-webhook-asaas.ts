/**
 * Registro idempotente do webhook de billing na conta do Asaas (GTW-02).
 *
 * Rodar com `npm run asaas:webhook`. É uma etapa de SETUP, uma vez por ambiente
 * — e também o comando de recuperação: como o corpo enviado inclui sempre
 * `interrupted: false`, rodá-lo de novo REATIVA a fila de entrega depois das 15
 * falhas consecutivas que a pausam (Pitfall 2 da pesquisa da Fase 3). Eventos
 * parados por mais de 14 dias são apagados em definitivo pelo Asaas, então esse
 * caminho de recuperação precisa ser um comando, não um procedimento manual.
 *
 * IDEMPOTÊNCIA: a chave é o `name`. Duas execuções não podem produzir dois
 * webhooks — o Asaas entregaria cada evento duas vezes, e ainda que o ledger
 * de `EventoWebhookAsaas` absorva a duplicata pelo `@unique` do id do evento,
 * o custo é uma fila dobrada e um diagnóstico confuso.
 *
 * SEGREDOS: este script lê `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` do ambiente
 * e NUNCA os imprime (T-03-39, T-03-44). A saída traz só id, URL, modo de
 * entrega, contagem de eventos e o contador de penalização.
 */
import { execFileSync } from "node:child_process";

import { AsaasApiError, asaasClient } from "@/lib/billing/asaas/client";
import { appBaseUrl, asaasWebhookToken } from "@/lib/billing/asaas/config";
import { EVENTOS_ASSINADOS } from "@/lib/billing/asaas/eventos";

/** Chave de idempotência. Mudar este valor cria um webhook novo, não renomeia. */
const NOME_WEBHOOK = "gestor-estoque-billing";

/** Caminho do route handler que ingere os eventos (`app/api/webhooks/asaas`). */
const CAMINHO_WEBHOOK = "/api/webhooks/asaas";

function falhar(mensagem: string): never {
  console.error(`[asaas:webhook] ${mensagem}`);
  process.exit(1);
}

/**
 * Endereço que recebe o aviso do Asaas quando a fila de entrega pausa.
 *
 * Ordem: `ASAAS_EMAIL_NOTIFICACAO` do ambiente e, na ausência dela, o
 * `user.email` do git local — o operador que roda o setup é quem precisa ser
 * avisado. Não há valor embutido no código: um endereço fixo aqui mandaria o
 * alerta de fila pausada para quem não pode agir sobre ele.
 */
function emailDeNotificacao(): string {
  const doAmbiente = process.env.ASAAS_EMAIL_NOTIFICACAO;

  if (doAmbiente) return doAmbiente;

  try {
    const doGit = execFileSync("git", ["config", "--get", "user.email"], {
      encoding: "utf8",
    }).trim();

    if (doGit) return doGit;
  } catch {
    // git ausente ou sem user.email configurado — cai no erro explícito abaixo.
  }

  return falhar(
    "defina ASAAS_EMAIL_NOTIFICACAO (ou `git config user.email`): é o endereço " +
      "que o Asaas avisa quando a fila de entrega do webhook pausa."
  );
}

async function principal(): Promise<void> {
  const base = appBaseUrl();

  // O Asaas não entrega para HTTP simples, e mesmo que entregasse o
  // `asaas-access-token` viajaria em claro no header (T-03-40 / ASVS V9).
  if (!base.startsWith("https://")) {
    falhar(`APP_BASE_URL precisa começar com https:// — valor atual não atende.`);
  }

  const entrada = {
    name: NOME_WEBHOOK,
    url: `${base}${CAMINHO_WEBHOOK}`,
    email: emailDeNotificacao(),
    authToken: asaasWebhookToken(),
    // Entrega uma de cada vez, em ordem cronológica. O ganho de vazão do modo
    // paralelo é irrelevante no volume desta aplicação (dezenas de assinaturas),
    // e a ordem preservada reduz — sem eliminar — o risco de um evento antigo
    // chegar depois de um novo. A defesa que de fato garante a correção continua
    // sendo a escrita monotônica do plano 03-06, não este modo de entrega.
    sendType: "SEQUENTIALLY",
    // A lista vem por import, NUNCA redigitada. Se ela divergir do `switch` de
    // `webhookAsaasService.processar`, um dos dois lados quebra em silêncio: ou
    // o Asaas passa a entregar eventos que caem no ramo padrão (respondidos com
    // 200 e log, inofensivo), ou deixa de entregar eventos que o código trata —
    // e esse é o caso ruim, porque não produz nenhum sinal.
    events: EVENTOS_ASSINADOS,
  };

  const lista = await asaasClient.listarWebhooks();
  const existente = (lista.data ?? []).find((webhook) => webhook.name === NOME_WEBHOOK);

  const webhook = existente
    ? await asaasClient.atualizarWebhook(existente.id, entrada)
    : await asaasClient.criarWebhook(entrada);

  const penalizacoes = webhook.penalizedRequestsCount;

  console.log(`[asaas:webhook] ${existente ? "atualizado" : "criado"}`);
  console.log(`  id                     ${webhook.id}`);
  console.log(`  url                    ${webhook.url}`);
  console.log(`  sendType               ${webhook.sendType}`);
  console.log(`  eventos                ${webhook.events.length}`);
  console.log(`  enabled                ${webhook.enabled}`);
  console.log(`  interrupted            ${webhook.interrupted}`);
  console.log(
    `  penalizedRequestsCount ${penalizacoes ?? "não informado pela API"}`
  );

  if (webhook.events.length !== EVENTOS_ASSINADOS.length) {
    falhar(
      `o Asaas registrou ${webhook.events.length} eventos, esperados ${EVENTOS_ASSINADOS.length}.`
    );
  }
}

principal().catch((erro: unknown) => {
  // O corpo de erro do Asaas pode conter dados do pagador — só status e códigos.
  if (erro instanceof AsaasApiError) {
    falhar(`API do Asaas recusou: status=${erro.status} codigos=${erro.codigos.join(",") || "-"}`);
  }

  falhar(erro instanceof Error ? erro.message : "falha desconhecida");
});
