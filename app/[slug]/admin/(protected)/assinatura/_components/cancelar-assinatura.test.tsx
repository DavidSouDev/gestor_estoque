import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { CancelarAssinatura } from "./cancelar-assinatura";

const DATA = "15/10/2026";

/** Frase byte-idêntica à de `aviso-carencia.tsx` — UI-SPEC § Copy que não muda. */
const CONSEQUENCIA = "Depois disso, o painel e o catálogo da sua loja saem do ar.";

const E2 = "Não foi possível cancelar agora. Tente novamente em instantes.";

function renderizar(cancelarAction = vi.fn(async () => ({}) as { error?: string })) {
  const utils = render(
    <CancelarAssinatura ultimoDiaDeAcesso={DATA} cancelarAction={cancelarAction} />
  );
  return { ...utils, cancelarAction };
}

const gatilho = () => screen.queryByRole("button", { name: "Cancelar assinatura" });
const heading = () => screen.queryByRole("heading", { name: "Cancelar a assinatura?" });
const confirmar = () => screen.getByRole("button", { name: "Sim, cancelar assinatura" });
const abortar = () => screen.getByRole("button", { name: "Manter assinatura" });

describe("CancelarAssinatura", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("na view padrão mostra só o gatilho e não chama a Server Action", () => {
    const { cancelarAction } = renderizar();

    expect(gatilho()).toBeInTheDocument();
    expect(heading()).not.toBeInTheDocument();
    expect(cancelarAction).not.toHaveBeenCalled();
  });

  it("D-03: um clique não cancela — apenas substitui a view pela confirmação", async () => {
    const user = userEvent.setup();
    const { cancelarAction } = renderizar();

    await user.click(gatilho()!);

    expect(heading()).toBeInTheDocument();
    // Substituição de view, não overlay: o gatilho SAI do documento.
    expect(gatilho()).not.toBeInTheDocument();
    expect(cancelarAction).not.toHaveBeenCalled();
  });

  it("D-03: a data exata e a frase travada aparecem ANTES do segundo clique", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(gatilho()!);

    const corpo = `Seu acesso continua ativo até ${DATA} e a assinatura não será renovada. ${CONSEQUENCIA}`;
    expect(screen.getByText(corpo)).toBeInTheDocument();
    expect(screen.getByText(corpo).textContent).toContain("não será renovada");
    expect(screen.getByText(corpo).textContent?.endsWith(CONSEQUENCIA)).toBe(true);
  });

  it("'Manter assinatura' volta para a view padrão sem chamar a Server Action", async () => {
    const user = userEvent.setup();
    const { cancelarAction } = renderizar();

    await user.click(gatilho()!);
    await user.click(abortar());

    expect(gatilho()).toBeInTheDocument();
    expect(heading()).not.toBeInTheDocument();
    expect(cancelarAction).not.toHaveBeenCalled();
  });

  it("D-05: o segundo clique chama a Server Action UMA vez e SEM nenhum argumento", async () => {
    const user = userEvent.setup();
    const { cancelarAction } = renderizar();

    await user.click(gatilho()!);
    await user.click(confirmar());

    expect(cancelarAction).toHaveBeenCalledTimes(1);
    // A action chega já vinculada ao slug pelo servidor. Nenhum identificador
    // atravessa a fronteira cliente→servidor.
    expect(cancelarAction).toHaveBeenCalledWith();
    expect(cancelarAction.mock.calls[0]).toHaveLength(0);
  });

  it("no sucesso, chama router.refresh()", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(gatilho()!);
    await user.click(confirmar());

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("T-07-30: no erro, a view de confirmação PERMANECE aberta com a mensagem em linha", async () => {
    const user = userEvent.setup();
    const cancelarAction = vi.fn(async () => ({ error: E2 }));
    renderizar(cancelarAction);

    await user.click(gatilho()!);
    await user.click(confirmar());

    expect(screen.getByText(E2)).toBeInTheDocument();
    // Fechar a view numa falha leria como sucesso — o pior desfecho disponível.
    expect(heading()).toBeInTheDocument();
    expect(gatilho()).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("não renderiza bloco de erro enquanto não houver erro", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(gatilho()!);

    expect(screen.queryByText(E2)).not.toBeInTheDocument();
  });

  it("T-07-31: enquanto pendente, os DOIS botões ficam disabled e o destrutivo diz 'Cancelando...'", async () => {
    const user = userEvent.setup();
    let liberar!: (valor: { error?: string }) => void;
    const emVoo = new Promise<{ error?: string }>((resolve) => {
      liberar = resolve;
    });
    const cancelarAction = vi.fn(() => emVoo);
    renderizar(cancelarAction);

    await user.click(gatilho()!);
    await user.click(confirmar());

    const destrutivo = screen.getByRole("button", { name: "Cancelando..." });
    expect(destrutivo).toBeDisabled();
    expect(abortar()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Sim, cancelar assinatura" })).not.toBeInTheDocument();

    await act(async () => {
      liberar({});
    });
  });

  it("acessibilidade: ao abrir a confirmação o foco vai para o heading", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(gatilho()!);

    expect(heading()).toHaveFocus();
  });

  it("acessibilidade: ao fechar por 'Manter assinatura' o foco volta para o gatilho", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(gatilho()!);
    await user.click(abortar());

    expect(gatilho()).toHaveFocus();
  });

  it("acessibilidade: o foco não é roubado na montagem inicial", () => {
    renderizar();

    expect(gatilho()).not.toHaveFocus();
  });

  it("não é um overlay: sem role=dialog, sem aria-modal e com um único h1", async () => {
    const user = userEvent.setup();
    const { container } = renderizar();

    await user.click(gatilho()!);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector("[aria-modal]")).toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("os dois botões da confirmação são <button type='button'>, com o confirmar antes do abortar", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(gatilho()!);

    expect(confirmar()).toHaveAttribute("type", "button");
    expect(abortar()).toHaveAttribute("type", "button");

    const rotulos = screen.getAllByRole("button").map((b) => b.textContent);
    expect(rotulos).toEqual(["Sim, cancelar assinatura", "Manter assinatura"]);
  });

  it("depois de um erro, reabrir a confirmação não traz a mensagem antiga", async () => {
    const user = userEvent.setup();
    const cancelarAction = vi.fn(async () => ({ error: E2 }));
    renderizar(cancelarAction);

    await user.click(gatilho()!);
    await user.click(confirmar());
    expect(screen.getByText(E2)).toBeInTheDocument();

    await user.click(abortar());
    await user.click(gatilho()!);

    expect(screen.queryByText(E2)).not.toBeInTheDocument();
  });
});
