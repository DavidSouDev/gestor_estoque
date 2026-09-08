import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProdutoDetalhe } from "./produto-detalhe";
import type { ProdutoCatalogoSerializado } from "../../_lib/types";

// Ver nota sobre NBSP em produto-card.test.tsx: usamos strings literais com
// espaço comum para o matcher de getByText em vez de comparar com o valor
// "cru" de formatCurrency.
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

describe("ProdutoDetalhe", () => {
  it("exibe nome, categoria, descrição e preço do produto", () => {
    render(<ProdutoDetalhe slug="loja-teste" produto={makeProduto()} />);

    expect(screen.getByRole("heading", { name: "Arroz Branco 5kg" })).toBeInTheDocument();
    expect(screen.getByText("Mercearia")).toBeInTheDocument();
    expect(screen.getByText("Arroz tipo 1")).toBeInTheDocument();
    expect(screen.getByText("R$ 25,00")).toBeInTheDocument();
  });

  it("exibe link para voltar ao catálogo da empresa correta", () => {
    render(<ProdutoDetalhe slug="loja-teste" produto={makeProduto()} />);

    expect(screen.getByRole("link", { name: /voltar para o catálogo/i })).toHaveAttribute(
      "href",
      "/loja-teste"
    );
  });

  it("calcula e exibe o percentual de desconto quando há preço promocional menor", () => {
    render(
      <ProdutoDetalhe
        slug="loja-teste"
        produto={makeProduto({ precoVarejo: 100 })}
        precoPromocional={80}
      />
    );

    expect(screen.getByText("20% OFF")).toBeInTheDocument();
    expect(screen.getByText("R$ 100,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 80,00")).toBeInTheDocument();
  });

  it('exibe "Fora de estoque" e "Indisponível" quando o estoque é zero', () => {
    render(<ProdutoDetalhe slug="loja-teste" produto={makeProduto({ estoque: 0 })} />);

    expect(screen.getByText("Fora de estoque")).toBeInTheDocument();
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
  });

  it("exibe miniaturas para cada imagem e troca a imagem principal ao clicar", async () => {
    const user = userEvent.setup();
    render(
      <ProdutoDetalhe
        slug="loja-teste"
        produto={makeProduto({
          fotoCapa: "https://exemplo.com/capa.jpg",
          imagens: [
            { id: "img-1", produtoId: "produto-1", url: "https://exemplo.com/1.jpg", alt: null, ordem: 0, createdAt: new Date() },
          ],
        })}
      />
    );

    const miniaturas = screen.getAllByRole("button", { name: /ver imagem/i });
    expect(miniaturas).toHaveLength(2);

    await user.click(miniaturas[1]);

    const imagemPrincipal = screen.getAllByAltText("Arroz Branco 5kg")[0];
    expect(imagemPrincipal).toHaveAttribute("src", "https://exemplo.com/1.jpg");
  });

  it("exibe os botões de contato quando os links são informados", () => {
    render(
      <ProdutoDetalhe
        slug="loja-teste"
        produto={makeProduto()}
        linkWhatsapp="https://wa.me/5511999999999"
        linkInstagram="https://instagram.com/loja"
      />
    );

    expect(screen.getByText("Quer comprar este produto?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Comprar pelo WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5511999999999"
    );
    expect(screen.getByRole("link", { name: "Ver no Instagram" })).toHaveAttribute(
      "href",
      "https://instagram.com/loja"
    );
  });

  it("não exibe botões de contato quando os links não são informados", () => {
    render(<ProdutoDetalhe slug="loja-teste" produto={makeProduto()} />);

    expect(screen.queryByText("Quer comprar este produto?")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Comprar pelo WhatsApp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver no Instagram" })).not.toBeInTheDocument();
  });

  it("não renderiza miniaturas quando há apenas uma imagem", () => {
    render(
      <ProdutoDetalhe
        slug="loja-teste"
        produto={makeProduto({ fotoCapa: "https://exemplo.com/capa.jpg" })}
      />
    );

    expect(screen.queryByRole("button", { name: /ver imagem/i })).not.toBeInTheDocument();
  });
});
