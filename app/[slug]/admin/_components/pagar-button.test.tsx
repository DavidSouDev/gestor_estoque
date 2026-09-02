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

  // A tela de assinatura precisa de "Assinar agora" e "Reativar assinatura". Em vez
  // de um segundo botão de pagamento — que teria de permanecer visual e
  // comportamentalmente idêntico a este para sempre — o componente ganhou duas props
  // OPCIONAIS de rótulo. Os casos acima são a prova executável de que os defaults não
  // mudaram: o banner de carência e a tela de bloqueio não passam nenhuma das duas.
  describe("rótulos alternativos", () => {
    it("aceita um label alternativo na variante bloqueado", () => {
      render(<PagarButton variant="bloqueado" primaryColor={PRIMARY} label="Assinar agora" />);

      const botao = screen.getByRole("button", { name: "Assinar agora" });
      expect(botao).toHaveAttribute("type", "submit");
      expect(screen.queryByRole("button", { name: "Pagar agora" })).not.toBeInTheDocument();
    });

    it("usa o pendingLabel fornecido enquanto pendente", () => {
      useFormStatusMock.mockReturnValue({ pending: true });

      render(
        <PagarButton
          variant="bloqueado"
          primaryColor={PRIMARY}
          label="Reativar assinatura"
          pendingLabel="Redirecionando..."
        />,
      );

      const botao = screen.getByRole("button", { name: "Redirecionando..." });
      expect(botao).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "Reativar assinatura" }),
      ).not.toBeInTheDocument();
    });

    // O caso acima passa o próprio texto do default, então sozinho não provaria
    // que `pendingLabel` está ligado ao ternário. Este usa um valor distinto.
    it("um pendingLabel distinto do default é de fato renderizado", () => {
      useFormStatusMock.mockReturnValue({ pending: true });

      render(
        <PagarButton
          variant="bloqueado"
          primaryColor={PRIMARY}
          label="Reativar assinatura"
          pendingLabel="Abrindo o checkout..."
        />,
      );

      expect(screen.getByRole("button", { name: "Abrindo o checkout..." })).toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "Redirecionando..." }),
      ).not.toBeInTheDocument();
    });

    it("com label fornecido e pendingLabel omitido, o rótulo de espera continua o default", () => {
      useFormStatusMock.mockReturnValue({ pending: true });

      render(<PagarButton variant="bloqueado" primaryColor={PRIMARY} label="Assinar agora" />);

      expect(screen.getByRole("button", { name: "Redirecionando..." })).toBeDisabled();
    });

    it("os rótulos alternativos não alteram nenhuma classe das duas variantes", () => {
      const { unmount } = render(<PagarButton variant="banner" label="Assinar agora" />);
      const classeBanner = screen.getByRole("button").className;
      unmount();

      const semLabel = render(<PagarButton variant="banner" />);
      expect(screen.getByRole("button").className).toBe(classeBanner);
      semLabel.unmount();

      render(<PagarButton variant="bloqueado" primaryColor={PRIMARY} label="Assinar agora" />);
      const botao = screen.getByRole("button");
      expect(botao.className).toBe(
        "w-full rounded-xl py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60 focus:ring-2",
      );
      expect(botao.style.backgroundColor).toBe("rgb(37, 99, 235)");
    });
  });
});
