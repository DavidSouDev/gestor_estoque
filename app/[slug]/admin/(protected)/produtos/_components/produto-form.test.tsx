import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProdutoForm } from "./produto-form";
import type { ProdutoAdminDetalhe } from "../../../_lib/types";

function buildProduto(overrides: Partial<ProdutoAdminDetalhe> = {}): ProdutoAdminDetalhe {
  return {
    id: "produto-1",
    nome: "Arroz Branco 5kg",
    precoVarejo: 25,
    precoAtacado: 22,
    estoque: 10,
    codigo: "ARZ-001",
    categoria: "Mercearia",
    descricao: "Arroz tipo 1",
    fotoCapa: "https://exemplo.com/foto.jpg",
    destaque: true,
    visivelCatalogo: false,
    ...overrides,
  } as unknown as ProdutoAdminDetalhe;
}

describe("ProdutoForm", () => {
  it("renderiza campos vazios com valores padrão ao criar um novo produto", () => {
    render(<ProdutoForm action={vi.fn().mockResolvedValue({})} />);

    expect(screen.getByLabelText("Nome")).toHaveValue("");
    expect(screen.getByLabelText("Nome")).toBeRequired();
    expect(screen.getByLabelText("Preço")).toBeRequired();
    expect(screen.getByLabelText("Estoque")).toHaveValue(0);
  });

  it("preenche os campos com os dados do produto ao editar", () => {
    render(<ProdutoForm action={vi.fn().mockResolvedValue({})} produto={buildProduto()} />);

    expect(screen.getByLabelText("Nome")).toHaveValue("Arroz Branco 5kg");
    expect(screen.getByLabelText("Preço")).toHaveValue(25);
    expect(screen.getByLabelText("Estoque")).toHaveValue(10);
  });

  it("exibe os campos avançados dentro da seção colapsável ao expandir", async () => {
    const user = userEvent.setup();
    render(<ProdutoForm action={vi.fn().mockResolvedValue({})} produto={buildProduto()} />);

    await user.click(screen.getByText("Mais opções"));

    expect(screen.getByLabelText("Código")).toHaveValue("ARZ-001");
    expect(screen.getByLabelText("Categoria")).toHaveValue("Mercearia");
    expect(screen.getByLabelText("Descrição")).toHaveValue("Arroz tipo 1");
    expect(screen.getByLabelText("Preço atacado")).toHaveValue(22);
    expect(screen.getByLabelText("Foto (URL)")).toHaveValue("https://exemplo.com/foto.jpg");
    expect(screen.getByLabelText("Destaque")).toBeChecked();
    expect(screen.getByLabelText("Visível no catálogo")).not.toBeChecked();
  });

  it("usa 'Geral' como categoria padrão e catálogo visível para um novo produto", async () => {
    const user = userEvent.setup();
    render(<ProdutoForm action={vi.fn().mockResolvedValue({})} />);

    await user.click(screen.getByText("Mais opções"));

    expect(screen.getByLabelText("Categoria")).toHaveValue("Geral");
    expect(screen.getByLabelText("Visível no catálogo")).toBeChecked();
    expect(screen.getByLabelText("Destaque")).not.toBeChecked();
  });

  it("exibe a mensagem de erro retornada pela action", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Nome já utilizado" });
    const user = userEvent.setup();

    render(<ProdutoForm action={action} />);

    await user.type(screen.getByLabelText("Nome"), "Produto Teste");
    await user.type(screen.getByLabelText("Preço"), "10");
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(await screen.findByText("Nome já utilizado")).toBeInTheDocument();
  });
});
