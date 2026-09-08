/**
 * Freio contra força bruta de senha no login, aplicado dentro de
 * `usuarioService.validatePassword` — o único ponto por onde as duas portas de
 * login do projeto (REST `POST /api/auth/login` e a Server Action do admin
 * web) passam, então proteger ali cobre as duas de uma vez. Compartilhado via
 * Redis (`lib/redis-rate-limiter.ts`) — agregado entre todas as instâncias do
 * processo, não por instância.
 *
 * Dois freios independentes, dois vetores de ataque diferentes:
 *
 * 1. **Por EMAIL** (`loginBloqueado`/`registrarFalhaDeLogin`): pega o ataque
 *    de força bruta contra UMA conta (muitas senhas, um email). A chave é o
 *    email informado, normalizado — nunca o resultado da consulta ao banco.
 *    Isso é deliberado: se o freio só contasse falhas para email que existe,
 *    o próprio bloqueio viraria um oráculo de enumeração de contas (um
 *    atacante distinguiria "email existe" de "email não existe" pelo momento
 *    em que passa a receber 429). Contar sempre, exista ou não a conta,
 *    remove esse canal lateral.
 *
 * 2. **Por IP** (`loginBloqueadoPorIp`/`registrarFalhaDeLoginPorIp`): pega o
 *    ataque de "password spraying" — 1 senha comum testada contra milhares de
 *    emails vazados, uma tentativa por email, que NUNCA dispara o freio por
 *    email (5 falhas para o MESMO email). Limiar bem mais generoso que o do
 *    email (20 contra 5) porque uma chave de IP pode representar várias
 *    pessoas legítimas atrás do mesmo NAT/proxy corporativo — o objetivo aqui
 *    é frear automação em escala, não pessoas errando a própria senha.
 */
import { criarRateLimiter } from "./redis-rate-limiter";

const JANELA_SEGUNDOS = 15 * 60;
const BLOQUEIO_SEGUNDOS = 15 * 60;

function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

const porEmail = criarRateLimiter({
  prefixo: "login:email",
  janelaSegundos: JANELA_SEGUNDOS,
  limiteTentativas: 5,
  bloqueioSegundos: BLOQUEIO_SEGUNDOS,
});

/** `true` enquanto o email estiver dentro da janela de bloqueio ATUAL. */
export async function loginBloqueado(email: string): Promise<boolean> {
  return porEmail.bloqueado(normalizar(email));
}

export async function registrarFalhaDeLogin(email: string): Promise<void> {
  await porEmail.registrarTentativa(normalizar(email));
}

/** Login bem-sucedido: a conta não deve carregar penalidade de tentativas antigas. */
export async function limparTentativasDeLogin(email: string): Promise<void> {
  await porEmail.limpar(normalizar(email));
}

const porIp = criarRateLimiter({
  prefixo: "login:ip",
  janelaSegundos: JANELA_SEGUNDOS,
  limiteTentativas: 20,
  bloqueioSegundos: BLOQUEIO_SEGUNDOS,
});

/** `true` enquanto o IP estiver dentro da janela de bloqueio ATUAL. */
export async function loginBloqueadoPorIp(ip: string): Promise<boolean> {
  return porIp.bloqueado(ip);
}

export async function registrarFalhaDeLoginPorIp(ip: string): Promise<void> {
  await porIp.registrarTentativa(ip);
}

/** Login bem-sucedido: o IP não deve carregar penalidade de tentativas antigas. */
export async function limparTentativasDeLoginPorIp(ip: string): Promise<void> {
  await porIp.limpar(ip);
}
