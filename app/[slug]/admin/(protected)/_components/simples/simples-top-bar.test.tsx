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
});
