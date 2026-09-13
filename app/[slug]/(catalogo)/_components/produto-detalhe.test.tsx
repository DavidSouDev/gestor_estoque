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
    controlaEstoquePorVariante: false,
    fotoCapa: null,
    ordemCatalogo: 0,
    destaque: false,
    imagens: [],
    variantes: [],
    ...overrides,
  } as ProdutoCatalogoSerializado;
}

function renderDetalhe(props: Partial<Parameters<typeof ProdutoDetalhe>[0]> = {}) {
  return render(
    <ProdutoDetalhe
      slug="loja-teste"
      produto={makeProduto()}
      nomeEmpresa="Loja Teste"
      {...props}
    />
  );
}

describe("ProdutoDetalhe", () => {
  it("exibe nome, categoria, descrição e preço do produto", () => {
    renderDetalhe();

    expect(screen.getByRole("heading", { name: "Arroz Branco 5kg" })).toBeInTheDocument();
    expect(screen.getByText("Mercearia")).toBeInTheDocument();
    expect(screen.getByText("Arroz tipo 1")).toBeInTheDocument();
    expect(screen.getByText("R$ 25,00")).toBeInTheDocument();
  });

  it("exibe link para voltar ao catálogo da empresa correta", () => {
    renderDetalhe();

    expect(screen.getByRole("link", { name: /voltar para o catálogo/i })).toHaveAttribute(
      "href",
      "/loja-teste"
    );
  });

  it("calcula e exibe o percentual de desconto quando há preço promocional menor", () => {
    renderDetalhe({ produto: makeProduto({ precoVarejo: 100 }), precoPromocional: 80 });

    expect(screen.getByText("20% OFF")).toBeInTheDocument();
    expect(screen.getByText("R$ 100,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 80,00")).toBeInTheDocument();
  });

  it('exibe "Fora de estoque" e "Indisponível" quando o estoque é zero', () => {
    renderDetalhe({ produto: makeProduto({ estoque: 0 }) });

    expect(screen.getByText("Fora de estoque")).toBeInTheDocument();
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
  });

  it("exibe miniaturas para cada imagem e troca a imagem principal ao clicar", async () => {
    const user = userEvent.setup();
    renderDetalhe({
      produto: makeProduto({
        fotoCapa: "https://exemplo.com/capa.jpg",
        imagens: [
          {
            id: "img-1",
            produtoId: "produto-1",
            url: "https://exemplo.com/1.jpg",
            alt: null,
            ordem: 0,
            createdAt: new Date(),
          },
        ],
      }),
    });

    const miniaturas = screen.getAllByRole("button", { name: /ver imagem/i });
    expect(miniaturas).toHaveLength(2);

    await user.click(miniaturas[1]);

    const imagemPrincipal = screen.getAllByAltText("Arroz Branco 5kg")[0];
    expect(imagemPrincipal).toHaveAttribute("src", "https://exemplo.com/1.jpg");
  });

  it("exibe os botões de contato quando os links são informados", () => {
    renderDetalhe({
      telefoneEmpresa: "(11) 99999-9999",
      linkInstagram: "https://instagram.com/loja",
    });

    expect(screen.getByText("Quer comprar este produto?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Comprar pelo WhatsApp" })).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/5511999999999")
    );
    expect(screen.getByRole("link", { name: "Ver no Instagram" })).toHaveAttribute(
      "href",
      "https://instagram.com/loja"
    );
  });

  it("não exibe botões de contato quando os links não são informados", () => {
    renderDetalhe();

    expect(screen.queryByText("Quer comprar este produto?")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Comprar pelo WhatsApp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver no Instagram" })).not.toBeInTheDocument();
  });

  it("não renderiza miniaturas quando há apenas uma imagem", () => {
    renderDetalhe({ produto: makeProduto({ fotoCapa: "https://exemplo.com/capa.jpg" }) });

    expect(screen.queryByRole("button", { name: /ver imagem/i })).not.toBeInTheDocument();
  });

  describe("variantes", () => {
    function makeProdutoComVariantes(
      overrides: Partial<ProdutoCatalogoSerializado> = {}
    ): ProdutoCatalogoSerializado {
      return makeProduto({
        fotoCapa: "https://exemplo.com/capa.jpg",
        controlaEstoquePorVariante: true,
        estoque: 15,
        variantes: [
          {
            id: "variante-p",
            produtoId: "produto-1",
            nome: "P - Estampa A",
            precoVarejo: null,
            precoAtacado: null,
            estoque: 3,
            ordem: 0,
            ativo: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            atributos: [{ id: "at-1", varianteId: "variante-p", nome: "Tamanho", valor: "P", ordem: 0 }],
            imagens: [
              {
                id: "vi-1",
                varianteId: "variante-p",
                url: "https://exemplo.com/variante-p.jpg",
                alt: null,
                ordem: 0,
                createdAt: new Date(),
              },
            ],
          },
          {
            id: "variante-m",
            produtoId: "produto-1",
            nome: "M - Estampa B",
            precoVarejo: 30,
            precoAtacado: 28,
            estoque: 0,
            ordem: 1,
            ativo: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            atributos: [{ id: "at-2", varianteId: "variante-m", nome: "Tamanho", valor: "M", ordem: 0 }],
            imagens: [],
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(overrides as any),
      });
    }

    it("exibe um botão por variante", () => {
      renderDetalhe({ produto: makeProdutoComVariantes() });

      expect(screen.getByRole("button", { name: /P - Estampa A/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /M - Estampa B/ })).toBeInTheDocument();
    });

    it("ao selecionar uma variante, troca imagem, preço e estoque exibidos", async () => {
      const user = userEvent.setup();
      renderDetalhe({ produto: makeProdutoComVariantes() });

      // Antes de selecionar: preço e estoque do produto base.
      expect(screen.getByText("R$ 25,00")).toBeInTheDocument();
      expect(screen.getByText("15 em estoque")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /M - Estampa B/ }));

      // Variante M sobrescreve o preço e tem seu próprio estoque (zerado).
      expect(screen.getByText("R$ 30,00")).toBeInTheDocument();
      expect(screen.getByText("Fora de estoque")).toBeInTheDocument();
      expect(screen.getByText("Indisponível")).toBeInTheDocument();
    });

    it("variante sem imagem própria cai de volta para a imagem do produto", async () => {
      const user = userEvent.setup();
      renderDetalhe({ produto: makeProdutoComVariantes() });

      await user.click(screen.getByRole("button", { name: /P - Estampa A/ }));
      expect(screen.getAllByAltText("P - Estampa A")[0]).toHaveAttribute(
        "src",
        "https://exemplo.com/variante-p.jpg"
      );

      await user.click(screen.getByRole("button", { name: /M - Estampa B/ }));
      expect(screen.getAllByAltText("Arroz Branco 5kg")[0]).toHaveAttribute(
        "src",
        "https://exemplo.com/capa.jpg"
      );
    });

    it("clicar de novo na variante selecionada volta pro produto base", async () => {
      const user = userEvent.setup();
      renderDetalhe({ produto: makeProdutoComVariantes() });

      const botaoM = screen.getByRole("button", { name: /M - Estampa B/ });
      await user.click(botaoM);
      expect(screen.getByText("R$ 30,00")).toBeInTheDocument();

      await user.click(botaoM);
      expect(screen.getByText("R$ 25,00")).toBeInTheDocument();
    });
  });
});
