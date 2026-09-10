import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminNav } from "./admin-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/loja-teste/admin/produtos",
}));

describe("AdminNav", () => {
  const baseProps = {
    slug: "loja-teste",
    empresaNome: "Mercearia Teste",
    email: "admin@teste.com",
    primaryColor: "#2563eb",
    logoutAction: vi.fn().mockResolvedValue(undefined),
  };

  it("marca o item de navegação correspondente ao pathname atual como ativo", () => {
    render(<AdminNav {...baseProps} />);

    const linkAtivo = screen.getByRole("link", { name: /meus produtos/i });
    const linkInativo = screen.getByRole("link", { name: /início/i });

    expect(linkAtivo).toHaveStyle({ backgroundColor: "#2563eb" });
    expect(linkInativo).not.toHaveStyle({ backgroundColor: "#2563eb" });
  });

  it("renderiza o nome da empresa e o e-mail do usuário", () => {
    render(<AdminNav {...baseProps} />);

    expect(screen.getByText("Mercearia Teste")).toBeInTheDocument();
    expect(screen.getByText("admin@teste.com")).toBeInTheDocument();
  });

  it("renderiza a inicial da empresa quando não há logo", () => {
    render(<AdminNav {...baseProps} />);

    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renderiza a logo da empresa em vez da inicial quando informada", () => {
    render(
      <AdminNav {...baseProps} logo="https://bucket.r2.dev/empresa-1/empresas/logos/x.png" />
    );

    const img = screen.getByRole("img", { name: "Mercearia Teste" });
    expect(img).toHaveAttribute("src", "https://bucket.r2.dev/empresa-1/empresas/logos/x.png");
    expect(screen.queryByText("M")).not.toBeInTheDocument();
  });

  it("gera os links de navegação com o slug informado", () => {
    render(<AdminNav {...baseProps} />);

    expect(screen.getByRole("link", { name: /meus produtos/i })).toHaveAttribute(
      "href",
      "/loja-teste/admin/produtos"
    );
    expect(screen.getByRole("link", { name: /combos/i })).toHaveAttribute(
      "href",
      "/loja-teste/admin/combos"
    );
  });

  it("dispara a logoutAction ao submeter o formulário de sair", async () => {
    const user = userEvent.setup();
    render(<AdminNav {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /sair/i }));

    expect(baseProps.logoutAction).toHaveBeenCalled();
  });

  // Menu hamburguer mobile: a lista de 7 itens em linha horizontal (antigo
  // `flex-row overflow-x-auto`) criava uma scrollbar que quebrava a navegação
  // no mobile. O painel agora abre/fecha por este botão, dedicado ao mobile
  // (`md:hidden`) e independente do toggle de colapsar da sidebar desktop.
  describe("menu hamburguer (mobile)", () => {
    it("alterna o rótulo acessível do botão entre abrir e fechar menu", async () => {
      const user = userEvent.setup();
      render(<AdminNav {...baseProps} />);

      expect(screen.getByRole("button", { name: /abrir menu/i })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /abrir menu/i }));

      expect(screen.getByRole("button", { name: /fechar menu/i })).toBeInTheDocument();
    });

    it("fecha o menu ao clicar num item de navegação", async () => {
      const user = userEvent.setup();
      render(<AdminNav {...baseProps} />);

      await user.click(screen.getByRole("button", { name: /abrir menu/i }));
      expect(screen.getByRole("button", { name: /fechar menu/i })).toBeInTheDocument();

      await user.click(screen.getByRole("link", { name: /combos/i }));

      expect(screen.getByRole("button", { name: /abrir menu/i })).toBeInTheDocument();
    });

    it("é independente do toggle de colapsar da sidebar desktop", async () => {
      const user = userEvent.setup();
      render(<AdminNav {...baseProps} />);

      await user.click(screen.getByRole("button", { name: /recolher menu/i }));

      expect(screen.getByRole("button", { name: /abrir menu/i })).toBeInTheDocument();
    });
  });

  // SUB-02 ("o usuário pode cancelar a assinatura") depende de existir um caminho
  // visível até /assinatura. Sem este item, a tela só seria alcançável digitando a URL.
  describe("entrada de Assinatura", () => {
    it("aponta para a rota de assinatura do slug", () => {
      render(<AdminNav {...baseProps} />);

      expect(screen.getByRole("link", { name: /assinatura/i })).toHaveAttribute(
        "href",
        "/loja-teste/admin/assinatura"
      );
    });

    it("é o último item da lista de navegação, depois de Estoque", () => {
      // Escopado ao `<nav>`: o cabeçalho tem seu próprio link (Configurações,
      // sem rótulo de texto) que `getAllByRole("link")` sem escopo também
      // pegaria, quebrando esta comparação exata por posição.
      const { container } = render(<AdminNav {...baseProps} />);
      const nav = container.querySelector("nav") as HTMLElement;
      const rotulos = within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent);

      // "Minha Loja" saiu da lista (virou o ícone de Configurações no
      // cabeçalho). Os cinco que restam estão ordenados por frequência diária
      // de uso; assinatura é o destino menos visitado do produto e fecha esse
      // gradiente. Termos de Uso pertence ao mesmo agrupamento de nível de
      // conta e é ainda menos visitado, então fecha a lista.
      expect(rotulos).toEqual([
        "Início",
        "Meus Produtos",
        "Combos",
        "Promoções",
        "Estoque",
        "Assinatura",
        "Termos de Uso",
      ]);
    });

    it("não fica ativo quando o pathname é outro", () => {
      render(<AdminNav {...baseProps} />);

      expect(screen.getByRole("link", { name: /assinatura/i })).not.toHaveStyle({
        backgroundColor: "#2563eb",
      });
    });
  });

  // "Minha Loja" deixou de ser um item de lista com rótulo — pouco intuitivo —
  // e virou só um ícone de engrenagem no cabeçalho, mesmo tratamento que
  // `simples-top-bar.tsx` já dá à mesma página. A página em `marca/` continua
  // igual; só o ponto de entrada muda.
  describe("ícone de Configurações no cabeçalho (substitui a entrada de Minha Loja)", () => {
    it("aponta para a página de marca do slug", () => {
      render(<AdminNav {...baseProps} />);

      expect(screen.getByTitle("Configurações")).toHaveAttribute(
        "href",
        "/loja-teste/admin/marca"
      );
    });

    it("não existe mais um item de navegação chamado Minha Loja", () => {
      render(<AdminNav {...baseProps} />);

      expect(screen.queryByRole("link", { name: /minha loja/i })).not.toBeInTheDocument();
    });

    it("continua visível quando a barra lateral é colapsada — sem ele o modo colapsado ficaria sem caminho até /admin/marca", async () => {
      const user = userEvent.setup();
      render(<AdminNav {...baseProps} />);

      await user.click(screen.getByRole("button", { name: /recolher menu/i }));

      expect(screen.getByTitle("Configurações")).toBeInTheDocument();
    });
  });

  // TERM-RELEITURA depende de existir um caminho VISÍVEL até /admin/termos. Sem
  // este item, a tela só seria alcançável digitando a URL — que é exatamente a
  // lacuna que o quick task 260907-fhk fecha.
  describe("entrada de Termos de Uso", () => {
    it("aponta para a rota de termos do slug", () => {
      render(<AdminNav {...baseProps} />);

      expect(screen.getByRole("link", { name: /termos de uso/i })).toHaveAttribute(
        "href",
        "/loja-teste/admin/termos"
      );
    });
  });
});

// Mesmo padrão de remontagem do bloco `AdminNav em /assinatura`: o mock de
// `usePathname` é fixo por arquivo, então provar o estado ativo da rota nova
// exige um módulo remontado com pathname próprio.
describe("AdminNav em /termos", () => {
  const baseProps = {
    slug: "loja-teste",
    empresaNome: "Mercearia Teste",
    email: "admin@teste.com",
    primaryColor: "#2563eb",
    logoutAction: vi.fn().mockResolvedValue(undefined),
  };

  afterEach(() => {
    vi.doUnmock("next/navigation");
    vi.resetModules();
  });

  it("marca o item de Termos de Uso como ativo e não ativa Assinatura nem Início", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      usePathname: () => "/loja-teste/admin/termos",
    }));

    const { AdminNav: AdminNavRemontado } = await import("./admin-nav");
    render(<AdminNavRemontado {...baseProps} />);

    expect(screen.getByRole("link", { name: /termos de uso/i })).toHaveStyle({
      backgroundColor: "#2563eb",
    });
    // `pathname.startsWith(item.href)` casa com /termos e com nenhuma outra
    // rota, porque nenhum href existente é prefixo dele.
    expect(screen.getByRole("link", { name: /assinatura/i })).not.toHaveStyle({
      backgroundColor: "#2563eb",
    });
    expect(screen.getByRole("link", { name: /início/i })).not.toHaveStyle({
      backgroundColor: "#2563eb",
    });
  });
});

// O mock de `usePathname` acima é fixo por arquivo. Para provar o estado ativo da
// rota nova sem tocar nele, este bloco remonta o módulo com um pathname próprio.
describe("AdminNav em /assinatura", () => {
  const baseProps = {
    slug: "loja-teste",
    empresaNome: "Mercearia Teste",
    email: "admin@teste.com",
    primaryColor: "#2563eb",
    logoutAction: vi.fn().mockResolvedValue(undefined),
  };

  afterEach(() => {
    vi.doUnmock("next/navigation");
    vi.resetModules();
  });

  it("marca o item de Assinatura como ativo e não ativa Estoque", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      usePathname: () => "/loja-teste/admin/assinatura",
    }));

    const { AdminNav: AdminNavRemontado } = await import("./admin-nav");
    render(<AdminNavRemontado {...baseProps} />);

    expect(screen.getByRole("link", { name: /assinatura/i })).toHaveStyle({
      backgroundColor: "#2563eb",
    });
    // `pathname.startsWith(item.href)` casa com /assinatura e com nenhuma outra
    // rota, porque nenhum href existente é prefixo dele.
    expect(screen.getByRole("link", { name: /estoque/i })).not.toHaveStyle({
      backgroundColor: "#2563eb",
    });
    expect(screen.getByRole("link", { name: /início/i })).not.toHaveStyle({
      backgroundColor: "#2563eb",
    });
  });
});
