import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// `AssinaturaCard` compõe DOIS client components que consomem `useRouter`
// (`PollerDeStatus` no estado "aguardando" e `CancelarAssinatura` nos estados
// "ativa"/"degradado"). Sem este mock, todos os casos abaixo quebram na
// renderização.
//
// O objeto devolvido é ESTÁVEL (`vi.hoisted`, uma única instância) e isso não é
// estilo: `useRouter` entra no array de dependências do `useEffect` do poller.
// Um mock que devolvesse objeto novo a cada render remontaria o timer
// indefinidamente e faria as asserções medirem outra coisa. Mesmo padrão já
// usado em `poller-de-status.test.tsx` e `bloqueado-card.test.tsx`.
const { routerMock } = vi.hoisted(() => ({
  routerMock: { refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { AssinaturaCard, type AssinaturaCardProps } from "./assinatura-card";

const E1 =
  "Não foi possível carregar os dados de cobrança agora. Seu acesso não foi afetado.";
const E3 = "Não foi possível abrir o pagamento agora. Tente novamente em alguns instantes.";

/**
 * Props do estado "ativa" — o caso central. Cada estado abaixo é uma
 * sobrescrita explícita deste objeto, no molde de `bloqueado-card.test.tsx`.
 *
 * Todas as decisões já vêm tomadas pelo servidor: o componente não deriva
 * nenhuma delas.
 */
const base: AssinaturaCardProps = {
  estado: "ativa",
  rotuloStatus: "Ativa",
  tomStatus: "positivo",
  ultimoDiaDeAcesso: "15/10/2026",
  precoMensal: "R$ 29,90",
  gateway: { proximaCobranca: "2026-10-15", ciclo: "MONTHLY", disponivel: true },
  podePagar: false,
  rotuloPagar: "Assinar agora",
  podeCancelar: true,
  primaryColor: "#2563eb",
  erroCheckout: false,
  pagarAction: vi.fn(),
  cancelarAction: vi.fn(async () => ({})),
  consultarStatusAction: vi.fn(async () => ({ liberado: false })),
};

const vitalicio: AssinaturaCardProps = {
  ...base,
  estado: "vitalicio",
  rotuloStatus: "Acesso permanente",
  tomStatus: "positivo",
  ultimoDiaDeAcesso: null,
  gateway: { proximaCobranca: null, ciclo: null, disponivel: false },
  podePagar: false,
  podeCancelar: false,
};

const aguardando: AssinaturaCardProps = {
  ...base,
  estado: "aguardando",
  rotuloStatus: "Sem assinatura",
  tomStatus: "neutro",
  gateway: { proximaCobranca: null, ciclo: null, disponivel: false },
  podePagar: true,
  rotuloPagar: "Assinar agora",
  podeCancelar: false,
};

const cancelada: AssinaturaCardProps = {
  ...base,
  estado: "cancelada",
  rotuloStatus: "Cancelada",
  tomStatus: "neutro",
  gateway: { proximaCobranca: null, ciclo: null, disponivel: false },
  podePagar: true,
  rotuloPagar: "Reativar assinatura",
  podeCancelar: false,
};

const degradado: AssinaturaCardProps = {
  ...base,
  estado: "degradado",
  gateway: { proximaCobranca: null, ciclo: null, disponivel: false },
  podeCancelar: true,
};

const PROPS_POR_ESTADO: Record<AssinaturaCardProps["estado"], AssinaturaCardProps> = {
  vitalicio,
  aguardando,
  cancelada,
  ativa: base,
  degradado,
};

/** O tile de Zona 1 que contém o rótulo dado, para inspeção de texto e classe. */
function tileDe(rotulo: string): HTMLElement {
  return screen.getByText(rotulo).parentElement as HTMLElement;
}

/** O valor renderizado logo abaixo do rótulo do tile. */
function valorDoTile(rotulo: string): string {
  return screen.getByText(rotulo).nextElementSibling?.textContent ?? "";
}

describe("AssinaturaCard", () => {
  describe("estrutura comum aos cinco estados", () => {
    it.each(Object.keys(PROPS_POR_ESTADO) as AssinaturaCardProps["estado"][])(
      "tem exatamente um h1, com 'Assinatura', no estado %s",
      (estado) => {
        render(<AssinaturaCard {...PROPS_POR_ESTADO[estado]} />);

        const titulos = screen.getAllByRole("heading", { level: 1 });
        expect(titulos).toHaveLength(1);
        expect(titulos[0]).toHaveTextContent("Assinatura");
      }
    );

    it.each(Object.keys(PROPS_POR_ESTADO) as AssinaturaCardProps["estado"][])(
      "mostra a Zona 1 completa (acesso e plano) no estado %s",
      (estado) => {
        render(<AssinaturaCard {...PROPS_POR_ESTADO[estado]} />);

        expect(screen.getByText("Acesso até")).toBeInTheDocument();
        expect(screen.getByText("Plano")).toBeInTheDocument();
        expect(screen.getByText("R$ 29,90 por mês")).toBeInTheDocument();
      }
    );

    it("traz o subtítulo da tela", () => {
      render(<AssinaturaCard {...base} />);

      expect(
        screen.getByText(
          "Veja o status da sua assinatura, até quando o acesso está pago e cancele quando quiser."
        )
      ).toBeInTheDocument();
    });

    it("nunca exibe o vocabulário de status do gateway", () => {
      // BILL-01: `avaliarAcesso` é a única autoridade de status. O enum do
      // fornecedor não tem campo no tipo e não pode aparecer na tela.
      for (const estado of Object.keys(PROPS_POR_ESTADO) as AssinaturaCardProps["estado"][]) {
        const { container, unmount } = render(
          <AssinaturaCard {...PROPS_POR_ESTADO[estado]} />
        );

        expect(container.textContent).not.toMatch(/ACTIVE|EXPIRED|INACTIVE/);
        unmount();
      }
    });
  });

  describe("estado vitalício", () => {
    it("mostra o pill de acesso permanente com tom positivo", () => {
      render(<AssinaturaCard {...vitalicio} />);

      const pill = screen.getByText("Acesso permanente").closest("span") as HTMLElement;
      expect(pill.className).toContain("bg-emerald-50");
      expect(pill.className).toContain("text-emerald-700");
    });

    it("substitui a data por 'Sem data de término', nunca por travessão", () => {
      render(<AssinaturaCard {...vitalicio} />);

      expect(valorDoTile("Acesso até")).toBe("Sem data de término");
      expect(screen.queryByText("—")).not.toBeInTheDocument();
    });

    it("não oferece pagamento nem cancelamento e não mostra a Zona 2", () => {
      render(<AssinaturaCard {...vitalicio} />);

      expect(screen.queryByRole("button", { name: "Cancelar assinatura" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Assinar|Reativar|Pagar/ })).not.toBeInTheDocument();
      expect(screen.queryByText("Próxima cobrança")).not.toBeInTheDocument();
      expect(screen.queryByText(E1)).not.toBeInTheDocument();
    });
  });

  describe("estado aguardando", () => {
    it("mostra o pill 'Sem assinatura' com tom neutro", () => {
      render(<AssinaturaCard {...aguardando} />);

      const pill = screen.getByText("Sem assinatura").closest("span") as HTMLElement;
      expect(pill.className).toContain("bg-slate-100");
      expect(pill.className).toContain("text-slate-600");
    });

    it("explica a ausência de assinatura sem abrir um segundo h1", () => {
      render(<AssinaturaCard {...aguardando} />);

      expect(screen.getByText("Sem assinatura ativa")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Não encontramos uma assinatura para esta loja. Se você acabou de pagar, a confirmação pode levar alguns minutos."
        )
      ).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("oferece 'Assinar agora' e não oferece cancelamento", () => {
      render(<AssinaturaCard {...aguardando} />);

      expect(screen.getByRole("button", { name: "Assinar agora" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancelar assinatura" })).not.toBeInTheDocument();
    });

    it("monta a tira de convergência pós-checkout", () => {
      // Achado 2: `asaasSubscriptionId` está nulo no primeiro minuto de TODO
      // assinante novo, porque `PAYMENT_CONFIRMED` chega antes de
      // `SUBSCRIPTION_CREATED`. Este é o único estado em que o poller monta.
      render(<AssinaturaCard {...aguardando} />);

      expect(screen.getByRole("status")).toHaveTextContent(
        "Verificando o status do seu acesso..."
      );
    });

    it("não mostra a Zona 2", () => {
      render(<AssinaturaCard {...aguardando} />);

      expect(screen.queryByText("Próxima cobrança")).not.toBeInTheDocument();
      expect(screen.queryByText(E1)).not.toBeInTheDocument();
    });
  });

  describe("estado cancelada", () => {
    it("mostra o pill 'Cancelada' com tom neutro — nem âmbar, nem vermelho", () => {
      render(<AssinaturaCard {...cancelada} />);

      const pill = screen.getByText("Cancelada").closest("span") as HTMLElement;
      expect(pill.className).toContain("bg-slate-100");
      expect(pill.className).not.toContain("amber");
      expect(pill.className).not.toContain("red");
    });

    it("mostra a data residual de acesso", () => {
      render(<AssinaturaCard {...cancelada} />);

      expect(valorDoTile("Acesso até")).toBe("15/10/2026");
    });

    it("oferece 'Reativar assinatura' e não oferece cancelamento", () => {
      render(<AssinaturaCard {...cancelada} />);

      expect(screen.getByRole("button", { name: "Reativar assinatura" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancelar assinatura" })).not.toBeInTheDocument();
    });

    it("não mostra a Zona 2 nem a tira do poller", () => {
      render(<AssinaturaCard {...cancelada} />);

      expect(screen.queryByText("Próxima cobrança")).not.toBeInTheDocument();
      expect(screen.queryByText(E1)).not.toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("estado ativa", () => {
    it("mostra o pill vindo das props, sem re-derivar nada", () => {
      render(<AssinaturaCard {...base} />);

      const pill = screen.getByText("Ativa").closest("span") as HTMLElement;
      expect(pill.className).toContain("bg-emerald-50");
    });

    it("usa o tom âmbar quando o servidor diz que o pagamento está pendente", () => {
      render(
        <AssinaturaCard {...base} rotuloStatus="Pagamento pendente" tomStatus="atencao" />
      );

      const pill = screen.getByText("Pagamento pendente").closest("span") as HTMLElement;
      expect(pill.className).toContain("bg-amber-50");
      expect(pill.className).toContain("text-amber-800");
    });

    it("preenche a Zona 2 com a próxima cobrança", () => {
      render(<AssinaturaCard {...base} />);

      expect(screen.getByText("Próxima cobrança")).toBeInTheDocument();
      expect(valorDoTile("Próxima cobrança")).toBe("2026-10-15");
      expect(screen.queryByText(E1)).not.toBeInTheDocument();
    });

    it("oferece o cancelamento e não oferece pagamento", () => {
      render(<AssinaturaCard {...base} />);

      expect(screen.getByRole("button", { name: "Cancelar assinatura" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Assinar|Reativar|Pagar/ })).not.toBeInTheDocument();
    });

    it("não monta a tira do poller", () => {
      render(<AssinaturaCard {...base} />);

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("estado degradado", () => {
    it("mantém a Zona 1 idêntica à do estado ativa e sem esmaecimento", () => {
      // D-02b: só a Zona 2 degrada. A conta do usuário não está quebrada e a
      // tela não pode sugerir que está.
      const { unmount } = render(<AssinaturaCard {...base} />);

      const dataAtiva = valorDoTile("Acesso até");
      const pillAtiva = (screen.getByText("Ativa").closest("span") as HTMLElement).className;
      const classeTileAtiva = tileDe("Acesso até").className;

      unmount();

      render(<AssinaturaCard {...degradado} />);

      expect(valorDoTile("Acesso até")).toBe(dataAtiva);
      expect((screen.getByText("Ativa").closest("span") as HTMLElement).className).toBe(pillAtiva);
      expect(tileDe("Acesso até").className).toBe(classeTileAtiva);
      expect(tileDe("Acesso até").className).not.toMatch(/opacity|animate-pulse/);
    });

    it("troca APENAS a Zona 2 pelo erro E1, com as duas frases", () => {
      render(<AssinaturaCard {...degradado} />);

      expect(screen.getByText(E1)).toBeInTheDocument();
      expect(screen.queryByText("Próxima cobrança")).not.toBeInTheDocument();
    });

    it("mantém o botão de cancelar presente e HABILITADO", () => {
      // Uma leitura que falhou não implica uma escrita que vai falhar, e
      // pré-desabilitar negaria a ação exatamente na tela que existe para
      // oferecê-la.
      render(<AssinaturaCard {...degradado} />);

      const botao = screen.getByRole("button", { name: "Cancelar assinatura" });
      expect(botao).toBeInTheDocument();
      expect(botao).toBeEnabled();
    });
  });

  describe("erro de checkout (E3)", () => {
    it("não renderiza a mensagem quando não houve falha", () => {
      render(<AssinaturaCard {...cancelada} />);

      expect(screen.queryByText(E3)).not.toBeInTheDocument();
    });

    it("renderiza a mensagem genérica byte-idêntica à da tela de bloqueio", () => {
      render(<AssinaturaCard {...cancelada} erroCheckout />);

      expect(screen.getByText(E3)).toBeInTheDocument();
    });
  });
});
