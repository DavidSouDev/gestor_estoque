import { describe, expect, it, vi } from "vitest";
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
});
