import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProdutoCard } from "./produto-card";
import type { ProdutoCatalogoSerializado } from "../../_lib/types";

// Intl.NumberFormat("pt-BR") insere um espaço não separável (NBSP) entre
// "R$" e o valor. O normalizador padrão do Testing Library colapsa esse NBSP
// para um espaço comum no texto lido do DOM, mas NÃO normaliza a string do
// matcher passada para getByText — por isso usamos strings literais com
// espaço comum em vez de comparar com o valor "cru" de formatCurrency, o que
// causaria falso-negativo.
function makeProduto(
  overrides: Partial<ProdutoCatalogoSerializado> = {}
): ProdutoCatalogoSerializado {
  return {
    id: "produto-1",
    empresaId: "empresa-1",
    codigo: "COD-1",
    nome: "Arroz Branco 5kg",
    descricao: "Arroz tipo 1",
    categoria: "Mercearia",
    precoVarejo: 25,
    estoque: 10,
    fotoCapa: null,
    ordemCatalogo: 0,
    destaque: false,
    imagens: [],
    ...overrides,
  } as ProdutoCatalogoSerializado;
}

describe("ProdutoCard", () => {
  it("exibe o preço original formatado em BRL quando não há promoção", () => {
    render(<ProdutoCard slug="loja-teste" produto={makeProduto({ precoVarejo: 25 })} />);

    expect(screen.getByText("R$ 25,00")).toBeInTheDocument();
  });

  it("exibe o nome, categoria e descrição do produto", () => {
    render(<ProdutoCard slug="loja-teste" produto={makeProduto()} />);

    expect(screen.getByText("Arroz Branco 5kg")).toBeInTheDocument();
    expect(screen.getByText("Mercearia")).toBeInTheDocument();
    expect(screen.getByText("Arroz tipo 1")).toBeInTheDocument();
  });

  it("linka para a página de detalhe do produto na loja correta", () => {
    render(<ProdutoCard slug="loja-teste" produto={makeProduto({ id: "produto-42" })} />);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/loja-teste/produtos/produto-42"
    );
  });

  it("calcula e exibe o percentual de desconto e o preço original riscado quando há precoPromocional menor que o preço original", () => {
    render(
      <ProdutoCard
        slug="loja-teste"
        produto={makeProduto({ precoVarejo: 100 })}
        precoPromocional={80}
      />
    );

    expect(screen.getByText("20% OFF")).toBeInTheDocument();
    expect(screen.getByText("R$ 100,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 80,00")).toBeInTheDocument();
  });

  it("não exibe badge de promoção quando não há preço promocional", () => {
    render(<ProdutoCard slug="loja-teste" produto={makeProduto({ precoVarejo: 100 })} />);

    expect(screen.queryByText(/% OFF/)).not.toBeInTheDocument();
  });

  it("não considera promoção quando o preço promocional não é menor que o original", () => {
    render(
      <ProdutoCard
        slug="loja-teste"
        produto={makeProduto({ precoVarejo: 100 })}
        precoPromocional={100}
      />
    );

    expect(screen.queryByText(/% OFF/)).not.toBeInTheDocument();
    expect(screen.getByText("R$ 100,00")).toBeInTheDocument();
  });

  it('exibe o badge "Fora de estoque" quando o estoque é zero', () => {
    render(<ProdutoCard slug="loja-teste" produto={makeProduto({ estoque: 0 })} />);

    expect(screen.getByText("Fora de estoque")).toBeInTheDocument();
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
  });

  it('exibe o badge "Fora de estoque" quando o estoque é negativo', () => {
    render(<ProdutoCard slug="loja-teste" produto={makeProduto({ estoque: -3 })} />);

    expect(screen.getByText("Fora de estoque")).toBeInTheDocument();
  });

  it("exibe a quantidade em estoque quando disponível", () => {
    render(<ProdutoCard slug="loja-teste" produto={makeProduto({ estoque: 7 })} />);

    expect(screen.getByText("7 em estoque")).toBeInTheDocument();
    expect(screen.queryByText("Fora de estoque")).not.toBeInTheDocument();
  });

  it("não renderiza parágrafo de descrição quando descricao é null", () => {
    const { container } = render(
      <ProdutoCard slug="loja-teste" produto={makeProduto({ descricao: null })} />
    );

    expect(container.querySelector("p.line-clamp-2")).toBeNull();
  });

  it('exibe o botão "Comprar pelo WhatsApp" com o link informado', () => {
    render(
      <ProdutoCard
        slug="loja-teste"
        produto={makeProduto()}
        linkWhatsapp="https://wa.me/5511999999999"
      />
    );

    expect(screen.getByRole("link", { name: "Comprar pelo WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5511999999999"
    );
  });

  it('não exibe o botão "Comprar pelo WhatsApp" quando não há link', () => {
    render(<ProdutoCard slug="loja-teste" produto={makeProduto()} />);

    expect(
      screen.queryByRole("link", { name: "Comprar pelo WhatsApp" })
    ).not.toBeInTheDocument();
  });
});
