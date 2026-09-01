import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { useFormStatusMock } = vi.hoisted(() => ({
  useFormStatusMock: vi.fn(),
}));

// `importOriginal` é obrigatório aqui: o @testing-library/react consome
// `react-dom/client`, e substituir o módulo inteiro derrubaria o `render`.
vi.mock("react-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-dom")>();
  return { ...original, useFormStatus: useFormStatusMock };
});

import { PagarButton } from "./pagar-button";

const PRIMARY = "#2563eb";

describe("PagarButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFormStatusMock.mockReturnValue({ pending: false });
  });

  it("renderiza um botão de submit rotulado 'Pagar agora'", () => {
    render(<PagarButton variant="banner" />);

    const botao = screen.getByRole("button", { name: "Pagar agora" });
    expect(botao).toHaveAttribute("type", "submit");
    expect(botao).toBeEnabled();
  });

  it("enquanto pendente, troca o rótulo por 'Redirecionando...' e desabilita", () => {
    useFormStatusMock.mockReturnValue({ pending: true });

    render(<PagarButton variant="banner" />);

    const botao = screen.getByRole("button", { name: "Redirecionando..." });
    expect(botao).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Pagar agora" })).not.toBeInTheDocument();
  });

  it("a variante banner usa o âmbar fixo e nenhum estilo inline de cor", () => {
    render(<PagarButton variant="banner" />);

    const botao = screen.getByRole("button");
    expect(botao.className).toContain("bg-amber-600");
    expect(botao.className).toContain("hover:bg-amber-700");
    // A cor do tenant é livre e não tem validação de contraste: sobre `amber-50`
    // ela pode sumir. Por isso o CTA do banner NÃO recebe `primaryColor`.
    expect(botao.style.backgroundColor).toBe("");
  });

  it("a variante bloqueado pinta o fundo com a cor do tenant e não traz classe de background", () => {
    render(<PagarButton variant="bloqueado" primaryColor={PRIMARY} />);

    const botao = screen.getByRole("button");
    expect(botao.style.backgroundColor).toBe("rgb(37, 99, 235)");
    expect(botao.className).not.toContain("bg-amber");
    expect(botao.className).not.toContain("bg-");
  });

  it("mantém o alvo de toque de 44px nas duas variantes", () => {
    const { unmount } = render(<PagarButton variant="banner" />);
    expect(screen.getByRole("button").className).toContain("py-3");
    unmount();

    render(<PagarButton variant="bloqueado" primaryColor={PRIMARY} />);
    expect(screen.getByRole("button").className).toContain("py-3");
  });
});
