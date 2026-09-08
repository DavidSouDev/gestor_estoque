/**
 * Fábrica de freios de força bruta compartilhados via Redis — usada por
 * `lib/login-rate-limit.ts` (por email e por IP) e `lib/registro-rate-limit.ts`
 * (por IP). Substitui a versão anterior em memória (`Map` module-level, um
 * freio por INSTÂNCIA do processo): num deploy com múltiplas instâncias ou
 * serverless, o limite anterior era por instância — um atacante distribuindo
 * tentativas entre instâncias, ou um simples redeploy, resetava a contagem. Com
 * Redis compartilhado, o limite é agregado de verdade.
 *
 * Bônus de correção: a versão em memória precisava de um teto de chaves
 * rastreadas (`MAX_CHAVES_RASTREADAS`) e de uma lógica de eviction cuidadosa
 * para não virar ela mesma um vetor de bypass (inundar o freio com chaves
 * descartáveis para "empurrar" a entrada de um alvo já bloqueado para fora do
 * teto). Isso deixa de existir: cada chave no Redis expira sozinha via TTL,
 * não há teto de capacidade nem eviction manual — o Redis já é, por natureza,
 * a store compartilhada que os comentários antigos deste projeto citavam como
 * "infraestrutura que o projeto não tem hoje".
 *
 * DESIGN: fail-open deliberado. Se o Redis estiver fora do ar, `bloqueado()`
 * devolve `false` (nunca bloqueia por engano) e `registrarTentativa()`/`limpar()`
 * engolem o erro (só logam). O freio é uma camada de DEFESA EM PROFUNDIDADE,
 * não a barreira de autenticação em si — essa continua sendo `bcrypt.compare`,
 * que não depende do Redis. Preferir "login funciona sem o freio" a "login
 * quebrado porque o Redis caiu" é a mesma lógica que já rege o resto do
 * projeto (ex.: `deleteImage` em `lib/storage/r2.ts` é best-effort pelo mesmo
 * motivo: uma peça de segunda camada fora do ar não pode derrubar o fluxo
 * principal).
 */
import { getRedis } from "./redis";

export interface RateLimiter {
  /** `true` enquanto a chave estiver dentro da janela de bloqueio ATUAL. */
  bloqueado(chave: string): Promise<boolean>;
  /**
   * Registra uma tentativa. Ao atingir o limite DENTRO da janela, arma o
   * bloqueio. Uma tentativa fora da janela reinicia a contagem — não acumula
   * indefinidamente (o TTL do Redis cuida disso sozinho).
   */
  registrarTentativa(chave: string): Promise<void>;
  /** Sucesso: a chave não deve carregar penalidade de tentativas antigas. */
  limpar(chave: string): Promise<void>;
}

export interface RateLimiterOptions {
  /**
   * Isola o namespace deste freio dos demais que compartilham a mesma
   * instância de Redis (login por email, login por IP, registro por IP).
   */
  prefixo: string;
  janelaSegundos: number;
  limiteTentativas: number;
  bloqueioSegundos: number;
}

export function criarRateLimiter(opcoes: RateLimiterOptions): RateLimiter {
  const { prefixo, janelaSegundos, limiteTentativas, bloqueioSegundos } = opcoes;

  function chaveRedis(chave: string): string {
    return `ratelimit:${prefixo}:${chave}`;
  }

  return {
    async bloqueado(chave) {
      try {
        const valor = await getRedis().get(chaveRedis(chave));
        return valor !== null && Number(valor) >= limiteTentativas;
      } catch (error) {
        console.error(
          `[rate-limit:${prefixo}] Redis indisponível, falha aberta:`,
          error instanceof Error ? error.message : error
        );
        return false;
      }
    },

    async registrarTentativa(chave) {
      try {
        const redis = getRedis();
        const chaveCompleta = chaveRedis(chave);
        const contagem = await redis.incr(chaveCompleta);

        if (contagem === 1) {
          // Primeira tentativa desta janela: arma o TTL da contagem.
          await redis.expire(chaveCompleta, janelaSegundos);
        } else if (contagem === limiteTentativas) {
          // Acabou de atingir o limite AGORA: estende o TTL para o período de
          // bloqueio (pode ser mais longo que o resto da janela restante) — a
          // MESMA chave serve de contador e de flag de bloqueio, então
          // `bloqueado()` some junto quando o bloqueio expira, sem precisar de
          // uma segunda chave nem de limpeza manual.
          await redis.expire(chaveCompleta, bloqueioSegundos);
        }
      } catch (error) {
        console.error(
          `[rate-limit:${prefixo}] Redis indisponível, tentativa não registrada:`,
          error instanceof Error ? error.message : error
        );
      }
    },

    async limpar(chave) {
      try {
        await getRedis().del(chaveRedis(chave));
      } catch (error) {
        console.error(
          `[rate-limit:${prefixo}] Redis indisponível, limpeza ignorada:`,
          error instanceof Error ? error.message : error
        );
      }
    },
  };
}
