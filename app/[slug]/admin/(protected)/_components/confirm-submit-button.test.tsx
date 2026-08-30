import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmSubmitButton } from "./confirm-submit-button";

describe("ConfirmSubmitButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("permite o submit do formulário quando o usuário confirma", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <form onSubmit={onSubmit}>
        <ConfirmSubmitButton confirmMessage="Tem certeza?">Excluir</ConfirmSubmitButton>
      </form>
    );

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    expect(window.confirm).toHaveBeenCalledWith("Tem certeza?");
    expect(onSubmit).toHaveBeenCalled();
  });

  it("impede o submit do formulário quando o usuário cancela", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <form onSubmit={onSubmit}>
        <ConfirmSubmitButton confirmMessage="Tem certeza?">Excluir</ConfirmSubmitButton>
      </form>
    );

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    expect(window.confirm).toHaveBeenCalledWith("Tem certeza?");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renderiza o conteúdo e a classe informados", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <form>
        <ConfirmSubmitButton confirmMessage="Tem certeza?" className="minha-classe">
          Excluir
        </ConfirmSubmitButton>
      </form>
    );

    const button = screen.getByRole("button", { name: "Excluir" });
    expect(button).toHaveClass("minha-classe");
    expect(button).toHaveAttribute("type", "submit");
  });
});
