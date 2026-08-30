import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComboForm } from "./combo-form";
import type { ComboAdminDetalhe, ProdutoAdmin } from "../../../_lib/types";

const produtos = [
  { id: "p1", nome: "Picanha" },
  { id: "p2", nome: "Carvão" },
] as unknown as ProdutoAdmin[];

function buildCombo(overrides: Partial<ComboAdminDetalhe> = {}): ComboAdminDetalhe {
  return {
    id: "combo-1",
    nome: "Combo Churrasco",
    preco: 100,
    descricao: "",
    fotoCapa: "",
    destaque: false,
    visivel: true,
    itens: [],
    ...overrides,
  } as unknown as ComboAdminDetalhe;
}

describe("ComboForm", () => {
  it("avisa que é preciso cadastrar produtos quando a lista está vazia", () => {
    render(<ComboForm action={vi.fn().mockResolvedValue({})} produtos={[]} />);

    expect(screen.getByText("Cadastre produtos antes de criar um combo.")).toBeInTheDocument();
  });

  it("lista os produtos disponíveis como checkboxes", () => {
    render(<ComboForm action={vi.fn().mockResolvedValue({})} produtos={produtos} />);

    expect(screen.getByLabelText(/Picanha/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Carvão/)).toBeInTheDocument();
  });

  it("marca como selecionados os produtos que já fazem parte do combo", () => {
    const combo = buildCombo({
      itens: [{ produtoId: "p1", quantidade: 2 }] as unknown as ComboAdminDetalhe["itens"],
    });

    render(<ComboForm action={vi.fn().mockResolvedValue({})} combo={combo} produtos={produtos} />);

    expect(screen.getByLabelText(/Picanha/)).toBeChecked();
    expect(screen.getByLabelText(/Carvão/)).not.toBeChecked();
  });

  it("preenche nome e preço ao editar um combo existente", () => {
    const combo = buildCombo();

    render(<ComboForm action={vi.fn().mockResolvedValue({})} combo={combo} produtos={produtos} />);

    expect(screen.getByLabelText("Nome")).toHaveValue("Combo Churrasco");
    expect(screen.getByLabelText("Preço")).toHaveValue(100);
  });

  it("marca 'Visível no catálogo' por padrão para um novo combo", async () => {
    const user = userEvent.setup();
    render(<ComboForm action={vi.fn().mockResolvedValue({})} produtos={produtos} />);

    await user.click(screen.getByText("Mais opções"));

    expect(screen.getByLabelText("Visível no catálogo")).toBeChecked();
    expect(screen.getByLabelText("Destaque")).not.toBeChecked();
  });

  it("exibe a mensagem de erro retornada pela action", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Selecione ao menos um produto" });
    const user = userEvent.setup();

    render(<ComboForm action={action} produtos={produtos} />);

    await user.type(screen.getByLabelText("Nome"), "Combo Teste");
    await user.type(screen.getByLabelText("Preço"), "50");
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(await screen.findByText("Selecione ao menos um produto")).toBeInTheDocument();
  });
});
