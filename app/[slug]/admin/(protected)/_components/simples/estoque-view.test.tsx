import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EstoqueView } from "./estoque-view";
import type { ProdutoAdmin } from "../../../_lib/types";

function produto(overrides: Partial<ProdutoAdmin> = {}): ProdutoAdmin {
  return {
    id: "p1",
    nome: "Produto",
    estoque: 10,
    precoVarejo: 9.9,
    ...overrides,
  } as unknown as ProdutoAdmin;
}

describe("EstoqueView", () => {
  it("mostra mensagem quando não há produtos", () => {
    render(<EstoqueView produtos={[]} onBack={vi.fn()} />);

    expect(screen.getByText("Você ainda não tem produtos cadastrados.")).toBeInTheDocument();
  });

  it("lista os produtos com nome e quantidade em estoque", () => {
    render(
      <EstoqueView
        produtos={[
          produto({ id: "p1", nome: "Arroz", estoque: 12 }),
          produto({ id: "p2", nome: "Feijão", estoque: 3 }),
        ]}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText("Arroz")).toBeInTheDocument();
    expect(screen.getByText("12 un.")).toBeInTheDocument();
    expect(screen.getByText("Feijão")).toBeInTheDocument();
    expect(screen.getByText("3 un.")).toBeInTheDocument();
  });

  it("usa o badge vermelho quando o estoque é zero", () => {
    render(<EstoqueView produtos={[produto({ estoque: 0 })]} onBack={vi.fn()} />);

    expect(screen.getByText("0 un.")).toHaveClass("bg-red-50", "text-red-600");
  });

  it("usa o badge âmbar quando o estoque está no limite baixo (≤ 5)", () => {
    render(<EstoqueView produtos={[produto({ estoque: 5 })]} onBack={vi.fn()} />);

    expect(screen.getByText("5 un.")).toHaveClass("bg-amber-50", "text-amber-700");
  });

  it("usa o badge verde quando o estoque está acima do limite baixo", () => {
    render(<EstoqueView produtos={[produto({ estoque: 6 })]} onBack={vi.fn()} />);

    expect(screen.getByText("6 un.")).toHaveClass("bg-emerald-50", "text-emerald-700");
  });

  it("chama onBack ao clicar em '← Voltar'", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(<EstoqueView produtos={[]} onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: "← Voltar" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
