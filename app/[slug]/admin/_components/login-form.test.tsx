import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("renderiza os campos de e-mail e senha como obrigatórios", () => {
    render(<LoginForm action={vi.fn().mockResolvedValue({})} primaryColor="#2563eb" />);

    expect(screen.getByLabelText("E-mail")).toBeRequired();
    expect(screen.getByLabelText("Senha")).toBeRequired();
  });

  it("não exibe erro antes de qualquer submissão", () => {
    render(<LoginForm action={vi.fn().mockResolvedValue({})} primaryColor="#2563eb" />);

    expect(screen.queryByText(/inválid/i)).not.toBeInTheDocument();
  });

  it("exibe a mensagem de erro quando a action retorna erro", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Credenciais inválidas" });
    const user = userEvent.setup();

    render(<LoginForm action={action} primaryColor="#2563eb" />);

    await user.type(screen.getByLabelText("E-mail"), "admin@teste.com");
    await user.type(screen.getByLabelText("Senha"), "senha1234");
    await user.click(screen.getByRole("button", { name: /entrar no painel/i }));

    expect(await screen.findByText("Credenciais inválidas")).toBeInTheDocument();
    expect(action).toHaveBeenCalled();
  });
});
