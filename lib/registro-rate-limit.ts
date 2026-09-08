/**
 * Freio contra criação automatizada em massa de empresas via `/registro`.
 * Mesma fábrica de `lib/login-rate-limit.ts` (`lib/redis-rate-limiter.ts`,
 * compartilhada via Redis), mas estado e limiares SEPARADOS: registro público
 * tem um perfil de ameaça e de tráfego diferente do login.
 *
 * A chave é o IP do chamador (`lib/client-ip.ts`), nunca o email: variar o
 * email a cada tentativa é trivial para quem automatiza — o IP é o custo real
 * de escalar o abuso.
 *
 * Limiar bem mais generoso que o do login (30 em 15 min, contra 5 em 15 min
 * do login) por dois motivos: criar uma empresa tem mais fricção e menos
 * valor para automação em massa do que adivinhar senha, e a suíte e2e
 * (`playwright.config.ts`, `workers: 1`, sequencial) registra várias dezenas
 * de empresas de teste ao longo de uma execução, todas do mesmo balde
 * `"desconhecido"` — um limiar mais apertado quebraria CI sem relação com
 * segurança real.
 */
import { criarRateLimiter } from "./redis-rate-limiter";

const limiter = criarRateLimiter({
  prefixo: "registro:ip",
  janelaSegundos: 15 * 60,
  limiteTentativas: 30,
  bloqueioSegundos: 15 * 60,
});

/** `true` enquanto a chave estiver dentro da janela de bloqueio ATUAL. */
export async function registroBloqueado(chave: string): Promise<boolean> {
  return limiter.bloqueado(chave);
}

/**
 * Registra UMA CRIAÇÃO DE EMPRESA bem-sucedida — nunca uma tentativa que
 * falhou na validação. Uma tentativa com senha errada/campo faltando não
 * grava nada no banco, então não há recurso a proteger ali; contar só o
 * sucesso deixa quem erra a senha repetidamente tentar de novo sem ser
 * bloqueado, e ainda assim limita o dano real (empresas de fato criadas).
 */
export async function registrarCriacaoDeEmpresa(chave: string): Promise<void> {
  await limiter.registrarTentativa(chave);
}
