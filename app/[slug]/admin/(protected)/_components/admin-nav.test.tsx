import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

    it("é o último item da lista, depois de Minha Loja", () => {
      render(<AdminNav {...baseProps} />);

      const rotulos = screen.getAllByRole("link").map((link) => link.textContent);

      // Os seis existentes estão ordenados por frequência diária de uso; assinatura
      // é o destino menos visitado do produto e fecha esse gradiente. Termos de Uso
      // pertence ao mesmo agrupamento de nível de conta e é ainda menos visitado,
      // então fecha a lista.
      expect(rotulos).toEqual([
        "Início",
        "Meus Produtos",
        "Combos",
        "Promoções",
        "Estoque",
        "Minha Loja",
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

  it("marca o item de Assinatura como ativo e não ativa Minha Loja", async () => {
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
    expect(screen.getByRole("link", { name: /minha loja/i })).not.toHaveStyle({
      backgroundColor: "#2563eb",
    });
    expect(screen.getByRole("link", { name: /início/i })).not.toHaveStyle({
      backgroundColor: "#2563eb",
    });
  });
});
