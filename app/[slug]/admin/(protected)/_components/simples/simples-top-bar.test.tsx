import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SimplesTopBar } from "./simples-top-bar";

describe("SimplesTopBar", () => {
  it("renderiza o nome da empresa e a inicial no avatar", () => {
    render(
      <SimplesTopBar slug="minha-loja" empresaNome="minha loja" primaryColor="#123456" logoutAction={vi.fn()} />
    );

    expect(screen.getByText("minha loja")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("aplica a cor primária como background do avatar", () => {
    render(
      <SimplesTopBar slug="minha-loja" empresaNome="Loja" primaryColor="#123456" logoutAction={vi.fn()} />
    );

    expect(screen.getByText("L")).toHaveStyle({ backgroundColor: "#123456" });
  });

  it("aponta o link de configurações para a página de marca do slug", () => {
    render(
      <SimplesTopBar slug="minha-loja" empresaNome="Loja" primaryColor="#123456" logoutAction={vi.fn()} />
    );

    expect(screen.getByTitle("Configurações")).toHaveAttribute("href", "/minha-loja/admin/marca");
  });

  it("submete o form de logout ao clicar em Sair", async () => {
    const user = userEvent.setup();
    const logoutAction = vi.fn().mockResolvedValue(undefined);

    render(
      <SimplesTopBar slug="minha-loja" empresaNome="Loja" primaryColor="#123456" logoutAction={logoutAction} />
    );

    await user.click(screen.getByTitle("Sair"));

    expect(logoutAction).toHaveBeenCalledTimes(1);
  });

  // `admin-nav.tsx` só renderiza para modoInterface === "COMPLETO". Sem esta entrada,
  // um tenant SIMPLES não teria nenhuma rota até /assinatura e SUB-02 seria falso
  // para essa população inteira (T-07-15).
  describe("entrada de Assinatura", () => {
    it("aponta para a rota de assinatura do slug", () => {
      render(
        <SimplesTopBar slug="minha-loja" empresaNome="Loja" primaryColor="#123456" logoutAction={vi.fn()} />
      );

      expect(screen.getByTitle("Assinatura")).toHaveAttribute(
        "href",
        "/minha-loja/admin/assinatura"
      );
    });

    it("fica depois da engrenagem e antes do botão de sair", () => {
      render(
        <SimplesTopBar slug="minha-loja" empresaNome="Loja" primaryColor="#123456" logoutAction={vi.fn()} />
      );

      const engrenagem = screen.getByTitle("Configurações");
      const assinatura = screen.getByTitle("Assinatura");
      const sair = screen.getByTitle("Sair");

      // Sair continua sendo o último controle da barra: é o único cuja posição os
      // usuários memorizaram e o único com hover vermelho.
      expect(
        engrenagem.compareDocumentPosition(assinatura) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        assinatura.compareDocumentPosition(sair) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

  });

  // TERM-RELEITURA depende de um caminho visível até /admin/termos nos DOIS
  // modos. `admin-nav.tsx` cobre só o COMPLETO.
  describe("entrada de Termos de Uso", () => {
    it("aponta para a rota de termos do slug", () => {
      render(
        <SimplesTopBar slug="minha-loja" empresaNome="Loja" primaryColor="#123456" logoutAction={vi.fn()} />
      );

      expect(screen.getByTitle("Termos de Uso")).toHaveAttribute(
        "href",
        "/minha-loja/admin/termos"
      );
    });

    it("fica depois da engrenagem e antes do botão de sair", () => {
      render(
        <SimplesTopBar slug="minha-loja" empresaNome="Loja" primaryColor="#123456" logoutAction={vi.fn()} />
      );

      const engrenagem = screen.getByTitle("Configurações");
      const termos = screen.getByTitle("Termos de Uso");
      const sair = screen.getByTitle("Sair");

      expect(
        engrenagem.compareDocumentPosition(termos) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        termos.compareDocumentPosition(sair) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });
  });

  // A paridade vale entre TODOS os ícones de navegação da barra, não só entre os
  // dois primeiros: é a decisão travada do quick 260907-ejn (07-UI-SPEC §Touch
  // Targets — pontos de entrada novos "must match" os irmãos; §Color — a cor do
  // tenant não entra nestes botões). `Sair` fica de fora de propósito: é o único
  // com hover vermelho.
  it.each(["Assinatura", "Termos de Uso"])(
    "o ícone de %s usa o mesmo tratamento visual da engrenagem",
    (titulo) => {
      render(
        <SimplesTopBar slug="minha-loja" empresaNome="Loja" primaryColor="#123456" logoutAction={vi.fn()} />
      );

      expect(screen.getByTitle(titulo).className).toBe(
        screen.getByTitle("Configurações").className
      );
    }
  );
});
