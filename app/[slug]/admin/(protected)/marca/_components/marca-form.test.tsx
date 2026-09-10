import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarcaForm } from "./marca-form";

const empresa = {
  nome: "Mercearia Teste",
  descricao: "Produtos frescos",
  logo: null,
  telefone: "11999999999",
  instagram: "mercearia",
  primaryColor: "#2563eb",
  accentColor: "#059669",
  modoInterface: "COMPLETO" as const,
};

describe("MarcaForm", () => {
  it("preenche os campos com os dados atuais da empresa e do usuário", () => {
    render(<MarcaForm action={vi.fn().mockResolvedValue({})} empresa={empresa} nomeUsuario="David" />);

    // Os campos não têm `htmlFor`/`id` associando o <label> ao input, então
    // localizamos os inputs pelo atributo `name` em vez de getByLabelText.
    const porNome = (name: string) =>
      document.querySelector(`input[name="${name}"]`) as HTMLInputElement;

    expect(porNome("nomeUsuario")).toHaveValue("David");
    expect(porNome("nome")).toHaveValue("Mercearia Teste");
    expect(porNome("descricao")).toHaveValue("Produtos frescos");
    expect(porNome("telefone")).toHaveValue("(11) 99999-9999");
    expect(porNome("instagram")).toHaveValue("mercearia");
  });

  it("renderiza o seletor de modo de interface com o modo atual da empresa", () => {
    render(<MarcaForm action={vi.fn().mockResolvedValue({})} empresa={empresa} nomeUsuario="David" />);

    const hiddenInput = document.querySelector('input[name="modoInterface"]') as HTMLInputElement;
    expect(hiddenInput.value).toBe("COMPLETO");
  });

  it("atualiza o preview do cabeçalho ao digitar o nome da empresa", async () => {
    const user = userEvent.setup();
    render(<MarcaForm action={vi.fn().mockResolvedValue({})} empresa={empresa} nomeUsuario="David" />);

    const nomeInput = document.querySelector('input[name="nome"]') as HTMLInputElement;
    await user.clear(nomeInput);
    await user.type(nomeInput, "Nova Loja");

    expect(screen.getAllByText("Nova Loja").length).toBeGreaterThan(0);
  });

  it("atualiza a cor principal ao clicar em uma cor predefinida", async () => {
    const user = userEvent.setup();
    render(<MarcaForm action={vi.fn().mockResolvedValue({})} empresa={empresa} nomeUsuario="David" />);

    const botaoCor = document.querySelector(
      'button[style*="background-color: rgb(124, 58, 237)"]'
    ) as HTMLButtonElement;
    expect(botaoCor).toBeTruthy();

    await user.click(botaoCor);

    const inputCor = document.querySelector('input[name="primaryColor"]') as HTMLInputElement;
    expect(inputCor.value).toBe("#7c3aed");
  });

  it("exibe a mensagem de erro retornada pela action", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Cor inválida" });
    const user = userEvent.setup();

    render(<MarcaForm action={action} empresa={empresa} nomeUsuario="David" />);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    expect(await screen.findByText("Cor inválida")).toBeInTheDocument();
  });

  it("exibe 'Salvo!' no botão após salvar com sucesso", async () => {
    const action = vi.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<MarcaForm action={action} empresa={empresa} nomeUsuario="David" />);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    expect(await screen.findByRole("button", { name: "Salvo!" })).toBeInTheDocument();
  });
});
