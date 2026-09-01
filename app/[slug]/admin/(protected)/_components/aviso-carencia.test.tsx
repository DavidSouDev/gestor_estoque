import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvisoCarencia } from "./aviso-carencia";

const pagarAction = vi.fn();

/**
 * Nenhum fake timer, nenhum controle de fuso: o componente é uma função pura de
 * um número. A aritmética de "faltam N dias" mora em `diasRestantesDeCarencia`
 * (`lib/avaliar-acesso.ts`) e é testada lá, com relógio injetado (Pitfall 5).
 */
describe("AvisoCarencia", () => {
  it("com 5 dias, diz quantos dias faltam e o que acontece depois", () => {
    render(<AvisoCarencia diasRestantes={5} pagarAction={pagarAction} />);

    expect(
      screen.getByText(
        "Seu acesso vence em 5 dias. Depois disso, o painel e o catálogo da sua loja saem do ar."
      )
    ).toBeInTheDocument();
  });

  it("com 2 dias, usa a mesma frase no plural", () => {
    render(<AvisoCarencia diasRestantes={2} pagarAction={pagarAction} />);

    expect(
      screen.getByText(
        "Seu acesso vence em 2 dias. Depois disso, o painel e o catálogo da sua loja saem do ar."
      )
    ).toBeInTheDocument();
  });

  it("com 1 dia, diz 'amanhã' e nunca 'em 1 dias'", () => {
    render(<AvisoCarencia diasRestantes={1} pagarAction={pagarAction} />);

    expect(
      screen.getByText(
        "Seu acesso vence amanhã. Depois disso, o painel e o catálogo da sua loja saem do ar."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/vence em 1 dias/)).not.toBeInTheDocument();
  });

  it("com 0 dias, diz 'hoje'", () => {
    render(<AvisoCarencia diasRestantes={0} pagarAction={pagarAction} />);

    expect(
      screen.getByText(
        "Seu acesso vence hoje. Depois disso, o painel e o catálogo da sua loja saem do ar."
      )
    ).toBeInTheDocument();
  });

  it("o título é sempre 'Pagamento pendente'", () => {
    const { unmount } = render(<AvisoCarencia diasRestantes={0} pagarAction={pagarAction} />);
    expect(screen.getByText("Pagamento pendente")).toBeInTheDocument();
    unmount();

    render(<AvisoCarencia diasRestantes={9} pagarAction={pagarAction} />);
    expect(screen.getByText("Pagamento pendente")).toBeInTheDocument();
  });

  it("é uma região viva educada: role='status', nunca role='alert'", () => {
    // Aviso persistente: interromper o leitor de tela a cada page load seria
    // hostil. `status` é polite, `alert` é assertivo (UI-SPEC §Accessibility).
    render(<AvisoCarencia diasRestantes={3} pagarAction={pagarAction} />);

    const regiao = screen.getByRole("status");
    expect(regiao).toHaveTextContent("Pagamento pendente");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("oferece o mesmo CTA da tela de bloqueio, dentro de um form ligado ao pagarAction", () => {
    const { container } = render(
      <AvisoCarencia diasRestantes={4} pagarAction={pagarAction} />
    );

    const botao = screen.getByRole("button", { name: "Pagar agora" });
    expect(botao).toHaveAttribute("type", "submit");

    const form = container.querySelector("form");
    expect(form).toBeTruthy();
    expect(form).toContainElement(botao);
  });

  it("não tem controle de fechar, dispensar ou adiar", () => {
    // ACC-01 exige o banner em TODA tela do admin; um dispensar o derrotaria.
    render(<AvisoCarencia diasRestantes={4} pagarAction={pagarAction} />);

    expect(screen.queryByRole("button", { name: /fechar|dispensar/i })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
