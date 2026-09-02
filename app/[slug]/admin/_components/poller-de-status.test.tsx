import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

// `useRouter` precisa devolver um objeto ESTÁVEL: ele entra nas dependências do
// `useEffect` do poller, e uma identidade nova a cada render remontaria o timer
// indefinidamente. É também o comportamento do `useRouter` real do Next.
const { refreshMock, routerMock } = vi.hoisted(() => {
  const refreshMock = vi.fn();
  return { refreshMock, routerMock: { refresh: refreshMock } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { PollerDeStatus } from "./poller-de-status";

/** Os intervalos decididos na UI-SPEC sob a discricionariedade de D-01. */
const INTERVALOS = [2000, 3000, 4000, 6000, 8000, 10000, 12000];

const COPY_POLLING = "Verificando o status do seu acesso...";
const COPY_ESGOTOU =
  "Se você acabou de pagar, a confirmação pode levar alguns minutos. Atualize a página em instantes.";

/**
 * Avança o relógio falso DENTRO de `act`: o callback do `setTimeout` chama uma
 * Server Action e depois faz `setTentativa`, e sem o `act` a re-renderização que
 * agenda o próximo tick não é liberada antes da asserção.
 */
async function avancar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Nunca libera — o caminho do usuário que ainda não pagou. */
function acaoBloqueada() {
  return vi.fn(async () => ({ liberado: false }));
}

describe("PollerDeStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refreshMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("não chama a action ao montar: a primeira tentativa só acontece após 2000 ms", async () => {
    const consultar = acaoBloqueada();
    render(<PollerDeStatus consultarAction={consultar} />);

    expect(consultar).not.toHaveBeenCalled();

    await avancar(1999);
    expect(consultar).not.toHaveBeenCalled();

    await avancar(1);
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it("enquanto não libera, agenda cada tentativa com o intervalo seguinte do backoff", async () => {
    const consultar = acaoBloqueada();
    render(<PollerDeStatus consultarAction={consultar} />);

    for (const [indice, intervalo] of INTERVALOS.entries()) {
      // Um passo ANTES do intervalo previsto: se o componente usasse um intervalo
      // fixo, a chamada já teria acontecido aqui e a contagem estouraria.
      await avancar(intervalo - 1);
      expect(consultar).toHaveBeenCalledTimes(indice);

      await avancar(1);
      expect(consultar).toHaveBeenCalledTimes(indice + 1);
    }
  });

  it("quando a action devolve liberado, chama router.refresh() uma vez e para de agendar", async () => {
    const consultar = vi.fn(async () => ({ liberado: true }));
    render(<PollerDeStatus consultarAction={consultar} />);

    await avancar(2000);

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(consultar).toHaveBeenCalledTimes(1);

    // Muito além do backoff inteiro: nenhuma tentativa nova, nenhum refresh novo.
    await avancar(60000);
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("depois da 7ª tentativa sem liberação, para de agendar e troca para a copy de fallback", async () => {
    const consultar = acaoBloqueada();
    render(<PollerDeStatus consultarAction={consultar} />);

    expect(screen.getByRole("status")).toHaveTextContent(COPY_POLLING);

    for (const intervalo of INTERVALOS) {
      await avancar(intervalo);
    }

    expect(consultar).toHaveBeenCalledTimes(INTERVALOS.length);
    expect(screen.getByRole("status")).toHaveTextContent(COPY_ESGOTOU);

    // Teto finito (T-07-08): nenhuma 8ª tentativa, por mais que o tempo passe.
    await avancar(120000);
    expect(consultar).toHaveBeenCalledTimes(INTERVALOS.length);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("ao desmontar com um timer pendente, nenhuma action dispara depois do unmount", async () => {
    // Prova executável do `clearTimeout`: sem ele o timer sobrevive à navegação
    // e chama uma Server Action contra uma árvore desmontada (T-07-09).
    const consultar = acaoBloqueada();
    const { unmount } = render(<PollerDeStatus consultarAction={consultar} />);

    await avancar(1000); // timer de 2000 ms ainda pendente
    unmount();

    await avancar(60000);
    expect(consultar).not.toHaveBeenCalled();
  });

  it("anuncia como live region polite e nunca como alerta", async () => {
    const consultar = acaoBloqueada();
    const { container } = render(<PollerDeStatus consultarAction={consultar} />);

    const texto = screen.getByRole("status");
    expect(texto.tagName).toBe("P");
    expect(texto.className).toContain("text-xs");
    expect(texto.className).toContain("text-slate-500");

    // `role="alert"` interromperia um usuário de leitor de tela a cada poucos
    // segundos — proibido pela UI-SPEC.
    expect(container.querySelector('[role="alert"]')).toBeNull();

    const tira = container.firstElementChild as HTMLElement;
    expect(tira.className).toBe("mt-4 rounded-xl bg-slate-50 px-4 py-3 text-center");
  });
});
