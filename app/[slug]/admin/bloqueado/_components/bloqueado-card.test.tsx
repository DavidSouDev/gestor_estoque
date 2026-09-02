import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// A tela passou a montar `PollerDeStatus`, que é client component e chama
// `useRouter`. Sem este mock TODOS os casos abaixo quebram na renderização —
// inclusive os da Fase 4, que são a rede de segurança de que esta tela não
// mudou. O objeto devolvido é estável porque entra nas dependências de um
// `useEffect`.
const { routerMock } = vi.hoisted(() => ({
  routerMock: { refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { BloqueadoCard } from "./bloqueado-card";

const props = {
  primaryColor: "#2563eb",
  accentColor: "#7c3aed",
  erroCheckout: false,
  pagarAction: vi.fn(),
  logoutAction: vi.fn(),
  consultarStatusAction: vi.fn(async () => ({ liberado: false })),
};

describe("BloqueadoCard", () => {
  it("tem exatamente um h1, com 'Acesso suspenso'", () => {
    render(<BloqueadoCard {...props} />);

    const titulos = screen.getAllByRole("heading", { level: 1 });
    expect(titulos).toHaveLength(1);
    expect(titulos[0]).toHaveTextContent("Acesso suspenso");
  });

  it("explica a suspensão e que a volta é automática", () => {
    render(<BloqueadoCard {...props} />);

    expect(
      screen.getByText(
        "O painel da sua loja está suspenso por falta de pagamento, e o catálogo saiu do ar. Assim que o pagamento for confirmado, tudo volta automaticamente."
      )
    ).toBeInTheDocument();
  });

  it("oferece pagamento e saída", () => {
    render(<BloqueadoCard {...props} />);

    expect(screen.getByRole("button", { name: "Pagar agora" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair da conta" })).toBeInTheDocument();
  });

  it("não exibe o erro de checkout quando não houve falha", () => {
    render(<BloqueadoCard {...props} />);

    expect(screen.queryByText(/Não foi possível abrir o pagamento/)).not.toBeInTheDocument();
  });

  it("exibe o erro genérico de checkout quando houve falha", () => {
    render(<BloqueadoCard {...props} erroCheckout />);

    expect(
      screen.getByText(
        "Não foi possível abrir o pagamento agora. Tente novamente em alguns instantes."
      )
    ).toBeInTheDocument();
  });

  it("não menciona cancelamento voluntário nem data de fim de acesso", () => {
    // D-06: BLOQUEADO e CANCELADO compartilham UMA string. Qualquer cópia que
    // fale em "cancelamento" delataria o branch por status que o contrato proíbe.
    // Histórico de pagamento e data exata de fim são da Fase 7.
    render(<BloqueadoCard {...props} erroCheckout />);

    expect(screen.queryByText(/cancel/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vence/i)).not.toBeInTheDocument();
  });

  it("monta a tira de convergência pós-checkout como live region polite", () => {
    // D-01: incondicional, para TODO visitante bloqueado — é a tela de retorno
    // do checkout de quem acabou de pagar.
    render(<BloqueadoCard {...props} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Verificando o status do seu acesso..."
    );
  });

  it("pinta a barra de gradiente com as duas cores do tenant", () => {
    const { container } = render(<BloqueadoCard {...props} />);

    const barra = container.querySelector(".h-2") as HTMLElement;
    expect(barra).toBeTruthy();
    expect(barra.style.background).toContain("linear-gradient");
  });
});
