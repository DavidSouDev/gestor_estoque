import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CatalogoClient } from "./catalogo-client";
import type { ComboComPromocao, ProdutoComPromocao } from "./catalogo-client";

const produtos: ProdutoComPromocao[] = [
  {
    id: "p1",
    nome: "Arroz Branco",
    descricao: "Arroz tipo 1",
    categoria: "Mercearia",
    precoVarejo: 20,
    estoque: 10,
    fotoCapa: null,
  },
  {
    id: "p2",
    nome: "Feijão Preto",
    descricao: "Feijão selecionado",
    categoria: "Mercearia",
    precoVarejo: 8,
    estoque: 0,
    fotoCapa: null,
    precoPromocional: 6,
  },
  {
    id: "p3",
    nome: "Refrigerante Cola",
    descricao: "Lata 350ml",
    categoria: "Bebidas",
    precoVarejo: 5,
    estoque: 20,
    fotoCapa: null,
  },
] as unknown as ProdutoComPromocao[];

const combos: ComboComPromocao[] = [
  {
    id: "c1",
    nome: "Combo Almoço",
    descricao: "Arroz + Feijão",
    preco: 25,
    fotoCapa: null,
    itens: [],
  },
] as unknown as ComboComPromocao[];

const categorias = ["Mercearia", "Bebidas"];

describe("CatalogoClient", () => {
  it("exibe todos os produtos por padrão com a contagem correta", () => {
    render(
      <CatalogoClient
        slug="loja-teste"
        nomeEmpresa="Loja Teste"
        produtos={produtos}
        combos={combos}
        categorias={categorias}
        primaryColor="#2563eb"
      />
    );

    expect(screen.getByText("3 produtos encontrados")).toBeInTheDocument();
    expect(screen.getByText("Arroz Branco")).toBeInTheDocument();
    expect(screen.getByText("Feijão Preto")).toBeInTheDocument();
    expect(screen.getByText("Refrigerante Cola")).toBeInTheDocument();
  });

  it("filtra produtos pelo termo de busca no nome", () => {
    render(
      <CatalogoClient
        slug="loja-teste"
        nomeEmpresa="Loja Teste"
        produtos={produtos}
        combos={combos}
        categorias={categorias}
        primaryColor="#2563eb"
      />
    );

    const busca = screen.getByPlaceholderText("Buscar produtos...");
    fireEvent.change(busca, { target: { value: "arroz" } });

    expect(screen.getByText("1 produto encontrado")).toBeInTheDocument();
    expect(screen.getByText("Arroz Branco")).toBeInTheDocument();
    expect(screen.queryByText("Feijão Preto")).not.toBeInTheDocument();
  });

  it("filtra produtos por categoria selecionada", async () => {
    const user = userEvent.setup();
    render(
      <CatalogoClient
        slug="loja-teste"
        nomeEmpresa="Loja Teste"
        produtos={produtos}
        combos={combos}
        categorias={categorias}
        primaryColor="#2563eb"
      />
    );

    await user.click(screen.getByRole("button", { name: "Bebidas" }));

    expect(screen.getByText("1 produto encontrado")).toBeInTheDocument();
    expect(screen.getByText("Refrigerante Cola")).toBeInTheDocument();
    expect(screen.queryByText("Arroz Branco")).not.toBeInTheDocument();
  });

  it("filtra somente produtos disponíveis quando o checkbox é marcado", async () => {
    const user = userEvent.setup();
    render(
      <CatalogoClient
        slug="loja-teste"
        nomeEmpresa="Loja Teste"
        produtos={produtos}
        combos={combos}
        categorias={categorias}
        primaryColor="#2563eb"
      />
    );

    await user.click(screen.getByLabelText("Só disponíveis"));

    expect(screen.getByText("2 produtos encontrados")).toBeInTheDocument();
    expect(screen.queryByText("Feijão Preto")).not.toBeInTheDocument();
  });

  it("filtra somente produtos em promoção quando o checkbox é marcado", async () => {
    const user = userEvent.setup();
    render(
      <CatalogoClient
        slug="loja-teste"
        nomeEmpresa="Loja Teste"
        produtos={produtos}
        combos={combos}
        categorias={categorias}
        primaryColor="#2563eb"
      />
    );

    await user.click(screen.getByLabelText("Em promoção"));

    expect(screen.getByText("1 produto encontrado")).toBeInTheDocument();
    expect(screen.getByText("Feijão Preto")).toBeInTheDocument();
  });

  it("mostra estado vazio quando nenhum produto corresponde aos filtros", () => {
    render(
      <CatalogoClient
        slug="loja-teste"
        nomeEmpresa="Loja Teste"
        produtos={produtos}
        combos={combos}
        categorias={categorias}
        primaryColor="#2563eb"
      />
    );

    const busca = screen.getByPlaceholderText("Buscar produtos...");
    fireEvent.change(busca, { target: { value: "produto-inexistente" } });

    expect(screen.getByText("Nenhum produto encontrado")).toBeInTheDocument();
  });

  it("troca para a aba de combos e exibe os combos disponíveis", async () => {
    const user = userEvent.setup();
    render(
      <CatalogoClient
        slug="loja-teste"
        nomeEmpresa="Loja Teste"
        produtos={produtos}
        combos={combos}
        categorias={categorias}
        primaryColor="#2563eb"
      />
    );

    expect(screen.queryByText("Combo Almoço")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /combos/i }));

    expect(screen.getByText("Combo Almoço")).toBeInTheDocument();
  });

  it('exibe botões "Comprar pelo WhatsApp" nos produtos e combos quando a empresa tem telefone', async () => {
    const user = userEvent.setup();
    render(
      <CatalogoClient
        slug="loja-teste"
        nomeEmpresa="Loja Teste"
        telefoneEmpresa="11999999999"
        produtos={produtos}
        combos={combos}
        categorias={categorias}
        primaryColor="#2563eb"
      />
    );

    const botoesProdutos = screen.getAllByRole("link", { name: "Comprar pelo WhatsApp" });
    expect(botoesProdutos).toHaveLength(produtos.length);
    expect(botoesProdutos[0]).toHaveAttribute("href", expect.stringContaining("https://wa.me/5511999999999"));

    await user.click(screen.getByRole("button", { name: /combos/i }));

    expect(screen.getAllByRole("link", { name: "Comprar pelo WhatsApp" })).toHaveLength(1);
  });

  it('não exibe botões "Comprar pelo WhatsApp" quando a empresa não tem telefone', () => {
    render(
      <CatalogoClient
        slug="loja-teste"
        nomeEmpresa="Loja Teste"
        produtos={produtos}
        combos={combos}
        categorias={categorias}
        primaryColor="#2563eb"
      />
    );

    expect(
      screen.queryByRole("link", { name: "Comprar pelo WhatsApp" })
    ).not.toBeInTheDocument();
  });
});
