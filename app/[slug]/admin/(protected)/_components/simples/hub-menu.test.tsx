import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HubMenu } from "./hub-menu";

describe("HubMenu", () => {
  it("renderiza o título recebido", () => {
    render(<HubMenu title="Produtos" onNovo={vi.fn()} onEditar={vi.fn()} onRemover={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Produtos" })).toBeInTheDocument();
  });

  it("chama onNovo ao clicar em 'Adicionar novo'", async () => {
    const user = userEvent.setup();
    const onNovo = vi.fn();

    render(<HubMenu title="Produtos" onNovo={onNovo} onEditar={vi.fn()} onRemover={vi.fn()} onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Adicionar novo" }));

    expect(onNovo).toHaveBeenCalledTimes(1);
  });

  it("chama onEditar ao clicar em 'Editar'", async () => {
    const user = userEvent.setup();
    const onEditar = vi.fn();

    render(<HubMenu title="Produtos" onNovo={vi.fn()} onEditar={onEditar} onRemover={vi.fn()} onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(onEditar).toHaveBeenCalledTimes(1);
  });

  it("chama onRemover ao clicar em 'Remover'", async () => {
    const user = userEvent.setup();
    const onRemover = vi.fn();

    render(<HubMenu title="Produtos" onNovo={vi.fn()} onEditar={vi.fn()} onRemover={onRemover} onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(onRemover).toHaveBeenCalledTimes(1);
  });

  it("chama onBack ao clicar em '← Voltar'", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(<HubMenu title="Produtos" onNovo={vi.fn()} onEditar={vi.fn()} onRemover={vi.fn()} onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: "← Voltar" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
