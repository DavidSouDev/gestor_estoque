import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterForm } from "./register-form";

describe("RegisterForm", () => {
  it("renderiza os campos obrigatórios do formulário", () => {
    render(<RegisterForm action={vi.fn().mockResolvedValue({})} />);

    expect(screen.getByLabelText("Nome da empresa")).toBeRequired();
    expect(screen.getByLabelText("Seu nome")).toBeRequired();
    expect(screen.getByLabelText("E-mail")).toBeRequired();
    expect(screen.getByLabelText("Senha")).toBeRequired();
    expect(screen.getByLabelText("Confirmar senha")).toBeRequired();
  });

  it("renderiza o seletor de modo de interface com as duas opções", () => {
    render(<RegisterForm action={vi.fn().mockResolvedValue({})} />);

    expect(screen.getByText("Completo")).toBeInTheDocument();
    expect(screen.getByText("Simples")).toBeInTheDocument();
  });

  it("atualiza o input escondido modoInterface ao trocar o modo", async () => {
    const user = userEvent.setup();
    render(<RegisterForm action={vi.fn().mockResolvedValue({})} />);

    const hiddenInput = document.querySelector('input[name="modoInterface"]') as HTMLInputElement;
    expect(hiddenInput.value).toBe("COMPLETO");

    await user.click(screen.getByText("Simples"));

    expect(hiddenInput.value).toBe("SIMPLES");
  });

  it("não exibe mensagem de erro quando a action ainda não retornou erro", () => {
    render(<RegisterForm action={vi.fn().mockResolvedValue({})} />);

    expect(screen.queryByText(/erro/i)).not.toBeInTheDocument();
  });

  it("exibe a mensagem de erro retornada pela action", async () => {
    const action = vi.fn().mockResolvedValue({ error: "E-mail já cadastrado" });
    const user = userEvent.setup();

    render(<RegisterForm action={action} />);

    await user.type(screen.getByLabelText("Nome da empresa"), "Mercearia São José");
    await user.type(screen.getByLabelText("Seu nome"), "David");
    await user.type(screen.getByLabelText("E-mail"), "david@teste.com");
    await user.type(screen.getByLabelText("Senha"), "senha1234");
    await user.type(screen.getByLabelText("Confirmar senha"), "senha1234");

    await user.click(screen.getByRole("button", { name: /criar minha loja/i }));

    expect(await screen.findByText("E-mail já cadastrado")).toBeInTheDocument();
    expect(action).toHaveBeenCalled();
  });
});
