import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuickActions } from "./quick-actions";

describe("QuickActions", () => {
  it("renderiza os links de ações rápidas com os hrefs corretos para o slug", () => {
    render(<QuickActions slug="loja-teste" />);

    expect(screen.getByRole("link", { name: /registrar venda/i })).toHaveAttribute(
      "href",
      "/loja-teste/admin/estoque"
    );
    expect(screen.getByRole("link", { name: /adicionar produto/i })).toHaveAttribute(
      "href",
      "/loja-teste/admin/produtos"
    );
    expect(screen.getByRole("link", { name: /ver promoções/i })).toHaveAttribute(
      "href",
      "/loja-teste/admin/promocoes"
    );
  });

  it("renderiza o título da seção", () => {
    render(<QuickActions slug="loja-teste" />);

    expect(screen.getByText("Ações rápidas")).toBeInTheDocument();
  });
});
