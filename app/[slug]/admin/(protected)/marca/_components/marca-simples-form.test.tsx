import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarcaSimplesForm } from "./marca-simples-form";

const empresa = {
  nome: "Mercearia Teste",
  descricao: "Produtos frescos",
  logo: null,
  telefone: "11999999999",
  instagram: "mercearia",
  primaryColor: "#2563eb",
  accentColor: "#059669",
  modoInterface: "SIMPLES" as const,
};

describe("MarcaSimplesForm", () => {
  it("renderiza o link de voltar para o painel com o slug correto", () => {
    render(
      <MarcaSimplesForm
        slug="loja-teste"
        action={vi.fn().mockResolvedValue({})}
        empresa={empresa}
        nomeUsuario="David"
      />
    );

    expect(screen.getByRole("link", { name: /voltar/i })).toHaveAttribute(
      "href",
      "/loja-teste/admin"
    );
  });

  it("renderiza o título Configurações", () => {
    render(
      <MarcaSimplesForm
        slug="loja-teste"
        action={vi.fn().mockResolvedValue({})}
        empresa={empresa}
        nomeUsuario="David"
      />
    );

    expect(screen.getByRole("heading", { name: "Configurações" })).toBeInTheDocument();
  });

  it("preenche os campos com os dados atuais da empresa e do usuário", () => {
    render(
      <MarcaSimplesForm
        slug="loja-teste"
        action={vi.fn().mockResolvedValue({})}
        empresa={empresa}
        nomeUsuario="David"
      />
    );

    expect(screen.getByLabelText("Seu nome")).toHaveValue("David");
    expect(screen.getByLabelText("Nome da loja")).toHaveValue("Mercearia Teste");
    expect(screen.getByLabelText("Descrição")).toHaveValue("Produtos frescos");
    expect(screen.getByLabelText("Telefone")).toHaveValue("11999999999");
    expect(screen.getByLabelText("Instagram")).toHaveValue("mercearia");
  });

  it("renderiza o seletor de modo de interface com o modo atual da empresa", () => {
    render(
      <MarcaSimplesForm
        slug="loja-teste"
        action={vi.fn().mockResolvedValue({})}
        empresa={empresa}
        nomeUsuario="David"
      />
    );

    const hiddenInput = document.querySelector('input[name="modoInterface"]') as HTMLInputElement;
    expect(hiddenInput.value).toBe("SIMPLES");
  });

  it("atualiza a cor principal ao clicar em uma cor predefinida", async () => {
    const user = userEvent.setup();
    render(
      <MarcaSimplesForm
        slug="loja-teste"
        action={vi.fn().mockResolvedValue({})}
        empresa={empresa}
        nomeUsuario="David"
      />
    );

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

    render(
      <MarcaSimplesForm slug="loja-teste" action={action} empresa={empresa} nomeUsuario="David" />
    );

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    expect(await screen.findByText("Cor inválida")).toBeInTheDocument();
  });

  it("exibe 'Salvo!' no botão após salvar com sucesso", async () => {
    const action = vi.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <MarcaSimplesForm slug="loja-teste" action={action} empresa={empresa} nomeUsuario="David" />
    );

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    expect(await screen.findByRole("button", { name: "Salvo!" })).toBeInTheDocument();
  });
});
