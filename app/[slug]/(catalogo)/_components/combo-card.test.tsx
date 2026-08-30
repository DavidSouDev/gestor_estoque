import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComboCard } from "./combo-card";
import type { ComboCatalogoSerializado, ProdutoCatalogoSerializado } from "../../_lib/types";

// Ver nota sobre NBSP em produto-card.test.tsx: usamos strings literais com
// espaço comum para o matcher de getByText em vez de comparar com o valor
// "cru" de formatCurrency (que usa   entre "R$" e o número).
function makeProdutoItem(
  overrides: Partial<ProdutoCatalogoSerializado> = {}
): ProdutoCatalogoSerializado {
  return {
    id: "produto-1",
    empresaId: "empresa-1",
    codigo: "COD-1",
    nome: "Picanha",
    descricao: null,
    categoria: "Carnes",
    precoVarejo: 50,
    estoque: 10,
    fotoCapa: null,
    ordemCatalogo: 0,
    destaque: false,
    imagens: [],
    ...overrides,
  } as ProdutoCatalogoSerializado;
}

function makeCombo(
  overrides: Partial<ComboCatalogoSerializado> = {}
): ComboCatalogoSerializado {
  return {
    id: "combo-1",
    empresaId: "empresa-1",
    nome: "Combo Churrasco",
    descricao: "Carnes e acompanhamentos",
    preco: 100,
    fotoCapa: null,
    ordemCatalogo: 0,
    destaque: false,
    itens: [
      { id: "item-1", quantidade: 2, produto: makeProdutoItem({ nome: "Picanha" }) },
      {
        id: "item-2",
        quantidade: 1,
        produto: makeProdutoItem({ id: "produto-2", nome: "Carvão" }),
      },
    ],
    ...overrides,
  } as ComboCatalogoSerializado;
}

describe("ComboCard", () => {
  it("exibe o nome, a descrição e o preço formatado do combo quando não há promoção", () => {
    render(<ComboCard combo={makeCombo({ preco: 100 })} />);

    expect(screen.getByText("Combo Churrasco")).toBeInTheDocument();
    expect(screen.getByText("Carnes e acompanhamentos")).toBeInTheDocument();
    expect(screen.getByText("R$ 100,00")).toBeInTheDocument();
    expect(screen.queryByText(/COMBO -/)).not.toBeInTheDocument();
  });

  it("lista os itens do combo com suas quantidades e nomes", () => {
    render(<ComboCard combo={makeCombo()} />);

    expect(screen.getByText("2x Picanha")).toBeInTheDocument();
    expect(screen.getByText("1x Carvão")).toBeInTheDocument();
  });

  it("calcula e exibe o percentual de desconto e o preço original riscado quando há precoPromocional menor que o preço original", () => {
    render(<ComboCard combo={makeCombo({ preco: 200 })} precoPromocional={150} />);

    expect(screen.getByText("COMBO -25%")).toBeInTheDocument();
    expect(screen.getByText("R$ 200,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 150,00")).toBeInTheDocument();
  });

  it("não trata como promoção quando precoPromocional é maior que o preço original", () => {
    render(<ComboCard combo={makeCombo({ preco: 100 })} precoPromocional={120} />);

    expect(screen.queryByText(/COMBO -/)).not.toBeInTheDocument();
    expect(screen.getByText("R$ 100,00")).toBeInTheDocument();
  });

  it("não renderiza texto de descrição quando descricao é null", () => {
    render(<ComboCard combo={makeCombo({ descricao: null })} />);

    expect(screen.queryByText("Carnes e acompanhamentos")).not.toBeInTheDocument();
  });
});
