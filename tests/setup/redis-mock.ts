import { vi, beforeEach } from "vitest";

/**
 * Fake de Redis para teste — implementa só os 4 comandos que
 * `lib/redis-rate-limiter.ts` usa (`incr`, `expire`, `get`, `del`), com
 * semântica de TTL real baseada em `Date.now()` (respeita `vi.useFakeTimers()`
 * + `vi.setSystemTime()`, usados pelos testes de rate limit para simular
 * passagem de tempo sem esperar de verdade).
 *
 * Mesmo padrão de `tests/setup/prisma-mock.ts`: estado module-level, resetado
 * a cada teste via `beforeEach` global — nenhum teste precisa saber que este
 * mock existe para se beneficiar do isolamento.
 */
interface Entrada {
  valor: number;
  expiraEm: number | null;
}

const armazenamento = new Map<string, Entrada>();

function lida(chave: string): Entrada | undefined {
  const entrada = armazenamento.get(chave);

  if (!entrada) {
    return undefined;
  }

  if (entrada.expiraEm !== null && Date.now() >= entrada.expiraEm) {
    armazenamento.delete(chave);
    return undefined;
  }

  return entrada;
}

export const redisMock = {
  async incr(chave: string): Promise<number> {
    const atual = lida(chave);
    const novoValor = (atual?.valor ?? 0) + 1;

    armazenamento.set(chave, { valor: novoValor, expiraEm: atual?.expiraEm ?? null });

    return novoValor;
  },

  async expire(chave: string, segundos: number): Promise<number> {
    const atual = armazenamento.get(chave);

    if (!atual) {
      return 0;
    }

    atual.expiraEm = Date.now() + segundos * 1000;

    return 1;
  },

  async get(chave: string): Promise<string | null> {
    const entrada = lida(chave);

    return entrada ? String(entrada.valor) : null;
  },

  async del(chave: string): Promise<number> {
    return armazenamento.delete(chave) ? 1 : 0;
  },
};

/**
 * `vi.fn()`, não uma arrow function crua: precisa ser um mock de verdade para
 * que `lib/redis-rate-limiter.test.ts` consiga sobrescrever a implementação
 * pontualmente (`mockImplementationOnce`) e simular "Redis indisponível" sem
 * precisar de um Redis de verdade.
 */
export const getRedisMock = vi.fn(() => redisMock);

vi.mock("@/lib/redis", () => ({
  getRedis: getRedisMock,
}));

beforeEach(() => {
  armazenamento.clear();
  getRedisMock.mockClear();
  getRedisMock.mockImplementation(() => redisMock);
});
