import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmarRemocao } from "./confirmar-remocao";

describe("ConfirmarRemocao", () => {
  it("renderiza título e mensagem", () => {
    render(
      <ConfirmarRemocao
        titulo="Remover produto?"
        mensagem='Tem certeza que quer remover "Arroz"?'
        pending={false}
        error={null}
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Remover produto?" })).toBeInTheDocument();
    expect(screen.getByText('Tem certeza que quer remover "Arroz"?')).toBeInTheDocument();
  });

  it("não renderiza mensagem de erro quando error é null", () => {
    render(
      <ConfirmarRemocao
        titulo="Remover produto?"
        mensagem="mensagem"
        pending={false}
        error={null}
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />
    );

    expect(screen.queryByText(/erro/i)).not.toBeInTheDocument();
  });

  it("renderiza a mensagem de erro quando error é informado", () => {
    render(
      <ConfirmarRemocao
        titulo="Remover produto?"
        mensagem="mensagem"
        pending={false}
        error="Produto não encontrado."
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />
    );

    expect(screen.getByText("Produto não encontrado.")).toBeInTheDocument();
  });

  it("chama onConfirmar ao clicar em 'Sim, remover'", async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn();

    render(
      <ConfirmarRemocao
        titulo="Remover produto?"
        mensagem="mensagem"
        pending={false}
        error={null}
        onConfirmar={onConfirmar}
        onCancelar={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Sim, remover" }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it("chama onCancelar ao clicar em 'Cancelar'", async () => {
    const user = userEvent.setup();
    const onCancelar = vi.fn();

    render(
      <ConfirmarRemocao
        titulo="Remover produto?"
        mensagem="mensagem"
        pending={false}
        error={null}
        onConfirmar={vi.fn()}
        onCancelar={onCancelar}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it("mostra 'Removendo...' e desabilita o botão de confirmar quando pending é verdadeiro", () => {
    render(
      <ConfirmarRemocao
        titulo="Remover produto?"
        mensagem="mensagem"
        pending
        error={null}
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />
    );

    const button = screen.getByRole("button", { name: "Removendo..." });
    expect(button).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Sim, remover" })).not.toBeInTheDocument();
  });

  it("não desabilita o botão 'Cancelar' quando pending é verdadeiro", () => {
    render(
      <ConfirmarRemocao
        titulo="Remover produto?"
        mensagem="mensagem"
        pending
        error={null}
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
  });
});
