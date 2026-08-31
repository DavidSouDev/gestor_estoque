// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { agendarPosResposta } from "./agendar-pos-resposta";

afterEach(() => {
  vi.restoreAllMocks();
});

// WR-01: `seguro()` agora encadeia `Promise.resolve().then(tarefa)` em vez de
// chamar `tarefa()` direto, para capturar throws síncronos também. Isso soma
// ticks extras de adoção de promise que variam conforme a engine — em vez de
// contar `await Promise.resolve()` às cegas, agenda um macrotask (`setTimeout`)
// para garantir que toda a fila de microtasks pendente já drenou.
function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("agendarPosResposta", () => {
  // Este caso roda SEM mockar `next/server` de propósito: é a prova real de que
  // o `E468` ("`after` was called outside a request scope") é capturado. Sem
  // ele, a suíte inteira quebraria no momento em que `revalidarConta` passar a
  // agendar a auditoria (plano 02-06).
  it("executa a tarefa inline e não lança fora de escopo de request", async () => {
    const tarefa = vi.fn(async () => "feito");

    expect(() => agendarPosResposta(tarefa)).not.toThrow();

    // WR-01: `tarefa` agora é chamada via `Promise.resolve().then(tarefa)` (não
    // mais de forma síncrona) para que um throw síncrono também seja capturado
    // pelo `.catch` — por isso é preciso deixar a fila de microtasks drenar
    // antes de observar a chamada.
    await flushMicrotasks();

    expect(tarefa).toHaveBeenCalledTimes(1);
  });

  it("não propaga nem deixa unhandled rejection quando a tarefa rejeita, e loga com prefixo [acesso]", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const falha = new Error("banco fora do ar");
    const tarefa = vi.fn(async () => {
      throw falha;
    });

    expect(() => agendarPosResposta(tarefa)).not.toThrow();

    // Deixa a fila de microtasks drenar: se o `.catch` interno não existisse, a
    // rejeição viraria unhandled rejection aqui e derrubaria o teste.
    await flushMicrotasks();

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [mensagem, erro] = consoleError.mock.calls[0] as [string, unknown];
    expect(mensagem.startsWith("[acesso]")).toBe(true);
    expect(erro).toBe(falha);

    consoleError.mockRestore();
  });

  // O comportamento real de `after()` dentro de um render do Next (o callback
  // rodar só depois do response sair) NÃO é reproduzível em Vitest — não há
  // AsyncLocalStorage de request nem ciclo de vida de response para observar.
  // A prova real é o `<human-check>` do plano 02-06. O que este caso prova é
  // apenas o contrato do wrapper: havendo escopo de request, a tarefa é
  // DELEGADA a `after` e não executada de forma síncrona.
  it("delega a after() sem executar a tarefa quando há escopo de request", async () => {
    vi.resetModules();
    const agendados: Array<() => unknown> = [];
    vi.doMock("next/server", () => ({
      after: (callback: () => unknown) => {
        agendados.push(callback);
      },
    }));

    try {
      const { agendarPosResposta: agendarComEscopo } = await import(
        "./agendar-pos-resposta"
      );
      const tarefa = vi.fn(async () => "feito");

      agendarComEscopo(tarefa);

      expect(agendados).toHaveLength(1);
      expect(typeof agendados[0]).toBe("function");
      expect(tarefa).not.toHaveBeenCalled();

      // E o que foi entregue a `after` é de fato a tarefa embrulhada.
      await agendados[0]!();
      expect(tarefa).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock("next/server");
      vi.resetModules();
    }
  });

  // WR-02: motivo de falha de `after()` diferente do E468 esperado não pode
  // ser mascarado da mesma forma silenciosa — precisa ficar observável.
  it("loga quando after() falha por um motivo diferente de 'outside a request scope'", async () => {
    vi.resetModules();
    vi.doMock("next/server", () => ({
      after: () => {
        throw new Error("falha interna inesperada do Next");
      },
    }));

    try {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const { agendarPosResposta: agendarComFalhaInesperada } = await import(
        "./agendar-pos-resposta"
      );
      const tarefa = vi.fn(async () => "feito");

      expect(() => agendarComFalhaInesperada(tarefa)).not.toThrow();

      expect(consoleError).toHaveBeenCalledWith(
        "[acesso] after() falhou por motivo inesperado, executando inline:",
        expect.any(Error)
      );

      // E mesmo assim o fallback continua executando a tarefa inline — a
      // falha de after() não pode perder o efeito.
      await flushMicrotasks();
      expect(tarefa).toHaveBeenCalledTimes(1);

      consoleError.mockRestore();
    } finally {
      vi.doUnmock("next/server");
      vi.resetModules();
    }
  });
});
