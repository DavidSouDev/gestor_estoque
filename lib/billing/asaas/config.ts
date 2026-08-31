/**
 * Leitura das credenciais do gateway Asaas.
 *
 * REGRA ABSOLUTA: nenhuma destas variáveis tem valor default e nenhuma delas
 * pode ser coalescida para string vazia. O projeto já lê `JWT_SECRET` e as
 * credenciais do R2 com coalescência silenciosa para vazio — o efeito é um
 * segredo ausente virar uma chamada autenticada com credencial em branco, que
 * falha lá na frente com um erro sem relação com a causa. Este é o terceiro
 * segredo do projeto e não repete o defeito (T-03-06).
 *
 * DECISÃO (diverge de 03-RESEARCH.md § Code Examples #1, que faz `throw` no topo
 * do módulo): os valores são lidos por ACESSOR, não por `const` de nível de
 * módulo. Motivo: `app/api/webhooks/asaas/route.ts` é importado pelo seu próprio
 * `route.test.ts`, e um throw no import tornaria impossível testar o caminho de
 * 401 sem configurar o ambiente inteiro. `lib/storage/r2.ts` já estabelece esse
 * idioma de lazy-init no projeto. A semântica fail-fast é preservada — a
 * diferença é o MOMENTO (primeira leitura em vez de import), não a rigidez.
 */

function obrigatorio(nome: string): string {
  const valor = process.env[nome];

  // String vazia é tratada como ausente de propósito: `ASAAS_API_KEY=` num
  // `.env` mal preenchido é indistinguível, na prática, de não ter a chave.
  if (valor === undefined || valor === "") {
    throw new Error(`[asaas] variável de ambiente ausente: ${nome}`);
  }

  return valor;
}

/** Base da API v3. Sandbox: `https://api-sandbox.asaas.com/v3` (D-06). */
export function asaasApiUrl(): string {
  return obrigatorio("ASAAS_API_URL");
}

/** Chave enviada no header `access_token` — nunca `Authorization: Bearer`. */
export function asaasApiKey(): string {
  return obrigatorio("ASAAS_API_KEY");
}

/**
 * Token que NÓS geramos e registramos no Asaas; ele volta em todo webhook no
 * header `asaas-access-token`. Não é obtido do painel.
 */
export function asaasWebhookToken(): string {
  return obrigatorio("ASAAS_WEBHOOK_TOKEN");
}

/**
 * Base do checkout hospedado, usada para montar a URL quando o campo `link` da
 * resposta vem `null`. O host de sandbox é uma suposição rastreada (A1 do
 * Assumptions Log), confirmada no plano 03-07 — por isso é env var, não literal.
 */
export function asaasCheckoutBaseUrl(): string {
  return obrigatorio("ASAAS_CHECKOUT_BASE_URL");
}

/** Origem pública da aplicação, usada nas URLs de callback e do webhook. */
export function appBaseUrl(): string {
  return obrigatorio("APP_BASE_URL");
}

/**
 * Preço mensal do plano único, R$29,90 (D-02).
 *
 * Substitui a suposição de R$49,90 usada apenas na comparação de taxas da
 * pesquisa. É o `value` do item enviado ao checkout do Asaas.
 */
export const VALOR_PLANO_MENSAL = 29.9;
