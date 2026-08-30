import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemPicker } from "./item-picker";

type Item = { id: string; nome: string; preco: number };

const items: Item[] = [
  { id: "1", nome: "Arroz", preco: 10 },
  { id: "2", nome: "Feijão", preco: 8 },
];

describe("ItemPicker", () => {
  it("renderiza título e subtítulo", () => {
    render(
      <ItemPicker
        items={items}
        title="Escolha um item"
        subtitle="Toque em um deles"
        emptyMessage="Nada por aqui"
        getKey={(item) => item.id}
        getLabel={(item) => item.nome}
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Escolha um item" })).toBeInTheDocument();
    expect(screen.getByText("Toque em um deles")).toBeInTheDocument();
  });

  it("mostra a mensagem vazia quando não há itens", () => {
    render(
      <ItemPicker
        items={[]}
        title="Escolha um item"
        emptyMessage="Nada por aqui"
        getKey={(item: Item) => item.id}
        getLabel={(item: Item) => item.nome}
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText("Nada por aqui")).toBeInTheDocument();
  });

  it("renderiza o rótulo e o sub-rótulo de cada item quando getSublabel é passado", () => {
    render(
      <ItemPicker
        items={items}
        title="Escolha um item"
        emptyMessage="Nada por aqui"
        getKey={(item) => item.id}
        getLabel={(item) => item.nome}
        getSublabel={(item) => `R$ ${item.preco}`}
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText("Arroz")).toBeInTheDocument();
    expect(screen.getByText("R$ 10")).toBeInTheDocument();
    expect(screen.getByText("Feijão")).toBeInTheDocument();
    expect(screen.getByText("R$ 8")).toBeInTheDocument();
  });

  it("não renderiza sub-rótulo quando getSublabel não é passado", () => {
    render(
      <ItemPicker
        items={items}
        title="Escolha um item"
        emptyMessage="Nada por aqui"
        getKey={(item) => item.id}
        getLabel={(item) => item.nome}
        onSelect={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.queryByText("R$ 10")).not.toBeInTheDocument();
  });

  it("chama onSelect com o item correto ao clicar nele", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ItemPicker
        items={items}
        title="Escolha um item"
        emptyMessage="Nada por aqui"
        getKey={(item) => item.id}
        getLabel={(item) => item.nome}
        onSelect={onSelect}
        onBack={vi.fn()}
      />
    );

    await user.click(screen.getByText("Feijão"));
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it("chama onBack ao clicar em '← Voltar'", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(
      <ItemPicker
        items={items}
        title="Escolha um item"
        emptyMessage="Nada por aqui"
        getKey={(item) => item.id}
        getLabel={(item) => item.nome}
        onSelect={vi.fn()}
        onBack={onBack}
      />
    );

    await user.click(screen.getByRole("button", { name: "← Voltar" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
