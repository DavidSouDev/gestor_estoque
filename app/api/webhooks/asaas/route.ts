import { createHash, timingSafeEqual } from "node:crypto";
import { agendarPosResposta } from "@/lib/agendar-pos-resposta";
import { asaasWebhookToken } from "@/lib/billing/asaas/config";
import { envelopeSchema } from "@/lib/billing/asaas/eventos";
import { webhookAsaasService } from "@/app/services/webhook-asaas.service";

/**
 * Endpoint de ingestão de webhooks do Asaas (GTW-02).
 *
 * ============================================================================
 * ESTE ARQUIVO DIVERGE DE PROPÓSITO DO RESTO DA API. Leia antes de "corrigir".
 * ============================================================================
 *
 * | O resto do projeto faz            | Aqui é obrigatório                     |
 * |-----------------------------------|----------------------------------------|
 * | `NextResponse.json(x, {status:201})` | `new Response(null, { status: 200 })` |
 * | `requireAuth` (Bearer JWT)        | comparação resistente a tempo do token |
 * | 500 em erro genérico              | 200 + log com prefixo                  |
 * | processa tudo antes de responder  | `agendarPosResposta` DEPOIS do 200     |
 *
 * O motivo é assimétrico e caro: o Asaas considera sucesso **exatamente** HTTP
 * 200. Quinze respostas diferentes disso, consecutivas, PAUSAM a fila de
 * sincronização da conta, e eventos parados por mais de 14 dias são apagados
 * permanentemente. O resultado prático de um 201 distraído aqui é um cliente
 * que pagou, nunca teve `acessoAte` estendido, e foi bloqueado por defeito
 * nosso (Pitfall 2).
 *
 * Até o header ser conferido, este endpoint é público — é a maior superfície de
 * ataque introduzida pelo milestone.
 *
 * NOTA SOBRE OS COMENTÁRIOS: a prosa deste arquivo evita escrever as sequências
 * literais proibidas pelos gates de grep do plano (nomes de função de assinatura
 * HMAC, nome do header do Stripe, leitura do corpo como texto). Mesma convenção
 * de `lib/billing/asaas/eventos.ts`: o gate precisa continuar sendo sinal real
 * sobre o código, não ruído vindo dos comentários.
 */

// `node:crypto` e o Prisma (via service) exigem runtime Node; o Edge não serve.
export const runtime = "nodejs";
// Nenhuma resposta deste endpoint pode ser reaproveitada de cache.
export const dynamic = "force-dynamic";

const PREFIXO = "[webhook-asaas]";

/**
 * Resposta de sucesso ÚNICA e opaca (T-03-27).
 *
 * Novo, duplicado, desconhecido e malformado devolvem exatamente a mesma coisa:
 * corpo vazio, status 200. Não existe oráculo para enumerar eventos ou empresas
 * a partir das respostas.
 */
const OK = () => new Response(null, { status: 200 });

/**
 * Confere a autenticidade da entrega (T-03-21, T-03-22).
 *
 * O ASAAS NÃO ASSINA O CORPO. Não há assinatura HMAC, não há header de
 * assinatura, não há timestamp de frescor e não existe função de "construir o
 * evento verificado" como no idioma do Stripe. O mecanismo real é bem mais
 * simples: nós geramos um `authToken` e o registramos junto com a URL em
 * `POST /v3/webhooks`; o Asaas ecoa essa string LITERALMENTE no header
 * `asaas-access-token` de toda entrega.
 *
 * Duas consequências diretas:
 *
 * 1. Ler o corpo como JSON é seguro — não existe hash sobre os bytes crus a
 *    preservar, então não há motivo para lê-lo como texto e re-parsear.
 * 2. A defesa contra replay NÃO vem de checagem de frescor de timestamp (não há
 *    timestamp assinado). Ela vem inteiramente de: ledger de idempotência
 *    (`eventoId @unique`), escrita monotônica de `acessoAte` (plano 03-06) e
 *    re-fetch autoritativo de `GET /v3/payments/{id}` antes de estender acesso
 *    (plano 03-06). Esse conjunto é o CONTROLE COMPENSATÓRIO para a ausência de
 *    assinatura de corpo — que é limitação do fornecedor (T-03-23), não defeito
 *    nosso.
 *
 * Sobre a comparação em si: é proibido comparar as duas strings diretamente com
 * `===`. Comparação de string curto-circuita no primeiro byte divergente e vaza
 * o segredo por timing (ASVS V6). O hash SHA-256 dos dois lados resolve DUAS
 * coisas de uma vez: `timingSafeEqual` lança quando os buffers têm tamanhos
 * diferentes — o que aconteceria com qualquer token de tamanho inesperado — e o
 * próprio comprimento do segredo deixa de ser observável, já que todo hash tem
 * 32 bytes.
 *
 * `asaasWebhookToken()` lança quando a variável de ambiente está ausente. Isso é
 * deliberado e não é capturado: com o segredo não configurado o endpoint está
 * quebrado, e um 500 faz o Asaas reenviar depois — melhor que um 401 silencioso
 * que também falharia, porém sem deixar claro que a causa é configuração.
 */
function tokenValido(recebido: string | null): boolean {
  if (!recebido) return false;

  const doHeader = createHash("sha256").update(recebido).digest();
  const esperado = createHash("sha256").update(asaasWebhookToken()).digest();

  return timingSafeEqual(doHeader, esperado);
}

/**
 * Ordem obrigatória do § Pattern 2 (persist-then-ack). A doc do Asaas é
 * explícita: *"Responda HTTP 200 somente após confirmar a persistência do
 * evento"*.
 *
 * Nenhum `await` de chamada externa (Asaas, fetch) pode aparecer antes do
 * `return` — o timeout de leitura do Asaas é de 10 segundos.
 */
export async function POST(request: Request) {
  // (1) Autenticidade. Falha genérica, sem corpo: não revela se o header estava
  // ausente, errado ou com tamanho inesperado (espelha `lib/api-auth.ts`).
  if (!tokenValido(request.headers.get("asaas-access-token"))) {
    return new Response(null, { status: 401 });
  }

  // (2) Corpo. Malformado NUNCA vira falha — quinze delas pausam a fila.
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    console.error(`${PREFIXO} corpo não é JSON`);
    return OK();
  }

  // (3) Forma mínima do envelope. `safeParse` sobre schema não-estrito: campo
  // desconhecido do Asaas passa e é ignorado (plano 03-03), nunca invalida.
  const envelope = envelopeSchema.safeParse(corpo);
  if (!envelope.success) {
    // Sem o corpo no log: ele pode carregar PII (T-03-28).
    console.error(`${PREFIXO} envelope sem id/event`);
    return OK();
  }

  const { id, event } = envelope.data;

  // (4) Idempotência decidida pelo Postgres, não pela aplicação. O service
  // recebe o envelope BRUTO — é ele que redige o payload antes de persistir.
  try {
    const resultado = await webhookAsaasService.registrarEvento(id, event, corpo);

    if (resultado === "DUPLICADO") {
      // Entrega repetida: 200 e nenhum processamento (T-03-24).
      return OK();
    }
  } catch (erro) {
    console.error(`${PREFIXO} falha ao persistir evento`, id, erro);
    // ÚNICO caminho autenticado que não devolve 200, e é deliberado: sem a
    // linha no ledger, confirmar o recebimento perderia o evento para sempre —
    // depois do 200 o Asaas nunca reenvia. Melhor devolver falha e deixar que
    // ele reenvie.
    return new Response(null, { status: 500 });
  }

  // (5) Processamento fora do ciclo do request. `agendarPosResposta` já trata
  // `after()`, drenagem no SIGTERM, throw síncrono e o fallback fora de escopo
  // de request — usar como está, nunca reimplementar.
  agendarPosResposta(() => webhookAsaasService.processar(id));

  // (6)
  return OK();
}
