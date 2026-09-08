import Redis from "ioredis";

/**
 * Singleton do client Redis — mesmo padrão de `lib/prisma.ts`: atribuição
 * incondicional em `globalForRedis.redis` evita múltiplas conexões em dev
 * (hot-reload recria o módulo a cada troca de arquivo, mas o objeto global
 * sobrevive entre recargas).
 *
 * `REDIS_URL` é lido de forma PREGUIÇOSA — só na primeira chamada real de
 * `getRedis()`, nunca no import do módulo — pelo mesmo motivo já documentado
 * em `lib/billing/asaas/config.ts` e `lib/storage/r2.ts`: um módulo que
 * importa este arquivo não pode quebrar em teste só por a env var estar
 * ausente (o client aqui é sempre mockado em teste via `tests/setup/redis-mock.ts`,
 * então este caminho nem roda na suíte).
 *
 * `lazyConnect: true` evita abrir a conexão TCP na primeira importação — só no
 * primeiro comando de verdade, mesma filosofia de inicialização preguiçosa já
 * usada no resto do projeto.
 *
 * `maxRetriesPerRequest`/`connectTimeout`/`commandTimeout` existem para que uma
 * falha do Redis NUNCA prenda um request de login/registro por muito tempo —
 * os freios de força bruta (`lib/login-rate-limit.ts`, `lib/registro-rate-limit.ts`)
 * são desenhados para FALHAR ABERTO se o Redis estiver fora do ar (ver JSDoc de
 * `lib/redis-rate-limiter.ts`): a autenticação em si (bcrypt) continua
 * funcionando, só a camada extra de freio fica temporariamente indisponível.
 * Sem esses limites, um Redis inalcançável faria cada tentativa de login ficar
 * pendurada até o timeout default do driver, em vez de falhar rápido.
 */
const globalForRedis = globalThis as unknown as { redis?: Redis };

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    const url = process.env.REDIS_URL;

    if (!url) {
      throw new Error("[redis] variável de ambiente ausente: REDIS_URL");
    }

    const redis = new Redis(url, {
      lazyConnect: true,
      // Bounda quantas vezes UM COMANDO é reenviado antes de desistir — é o que
      // faz uma tentativa de login falhar rápido (fail-open) em vez de ficar
      // pendurada. Não confundir com `retryStrategy` abaixo, que é sobre
      // RECONEXÃO da conexão TCP em si, não sobre comandos individuais.
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 1000,
      // Backoff limitado, mas NUNCA desiste de vez: como o processo Node é de
      // longa duração (self-hosted, não serverless), um Redis que caiu e volta
      // precisa reconectar sozinho — desistir de reconectar prenderia o freio
      // em "sempre indisponível" até o próximo restart da aplicação.
      retryStrategy: (tentativas) => Math.min(tentativas * 200, 5000),
    });

    redis.on("error", (error) => {
      console.error("[redis] erro de conexão:", error.message);
    });

    globalForRedis.redis = redis;
  }

  return globalForRedis.redis;
}
