import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProdutoAdmin, PromocaoAdmin } from "../../../_lib/types";

const { refreshMock, removerPromocaoSimplesMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  removerPromocaoSimplesMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("../../_lib/simples-actions", () => ({
  criarPromocaoSimples: vi.fn(),
  atualizarPromocaoSimples: vi.fn(),
  removerPromocaoSimples: removerPromocaoSimplesMock,
}));

import { PromocaoHub } from "./promocao-hub";

const produtos: ProdutoAdmin[] = [
  { id: "p1", nome: "Arroz 5kg", precoVarejo: 25.5, estoque: 8 } as unknown as ProdutoAdmin,
];

const promocaoSimples = {
  id: "pr1",
  nome: "Promoção Arroz 5kg",
  dataInicio: "2026-01-01T00:00:00.000Z",
  dataFim: "2026-01-10T23:59:59.000Z",
  itens: [{ produtoId: "p1", preco: 19.9 }],
} as unknown as PromocaoAdmin;

const promocaoMultiItem = {
  id: "pr2",
  nome: "Promoção Combo",
  dataInicio: "2026-01-01T00:00:00.000Z",
  dataFim: "2026-01-10T23:59:59.000Z",
  itens: [
    { produtoId: "p1", preco: 19.9 },
    { produtoId: "p2", preco: 10 },
  ],
} as unknown as PromocaoAdmin;

describe("PromocaoHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra o menu inicial com o título 'Promoções'", () => {
    render(<PromocaoHub slug="loja" produtos={produtos} promocoes={[]} onDone={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Promoções" })).toBeInTheDocument();
  });

  it("chama onDone ao clicar em '← Voltar' no menu inicial", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<PromocaoHub slug="loja" produtos={produtos} promocoes={[]} onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "← Voltar" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("abre o PromocaoWizard de criação ao clicar em 'Adicionar novo'", async () => {
    const user = userEvent.setup();
    render(<PromocaoHub slug="loja" produtos={produtos} promocoes={[]} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Adicionar novo" }));
    expect(screen.getByRole("heading", { name: "Qual produto vai entrar em promoção?" })).toBeInTheDocument();
  });

  it("só lista promoções de 1 produto para edição, ocultando promoções multi-item feitas fora do modo simples", async () => {
    const user = userEvent.setup();
    render(
      <PromocaoHub
        slug="loja"
        produtos={produtos}
        promocoes={[promocaoSimples, promocaoMultiItem]}
        onDone={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByText("Promoção Arroz 5kg")).toBeInTheDocument();
    expect(screen.queryByText("Promoção Combo")).not.toBeInTheDocument();
  });

  it("só lista promoções de 1 produto para remoção", async () => {
    const user = userEvent.setup();
    render(
      <PromocaoHub
        slug="loja"
        produtos={produtos}
        promocoes={[promocaoSimples, promocaoMultiItem]}
        onDone={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(screen.getByText("Promoção Arroz 5kg")).toBeInTheDocument();
    expect(screen.queryByText("Promoção Combo")).not.toBeInTheDocument();
  });

  it("mostra a data final como sub-rótulo na lista de edição", async () => {
    const user = userEvent.setup();
    render(<PromocaoHub slug="loja" produtos={produtos} promocoes={[promocaoSimples]} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("até 10/01/2026")).toBeInTheDocument();
  });

  it("abre o wizard de edição preenchido ao selecionar a promoção", async () => {
    const user = userEvent.setup();
    render(<PromocaoHub slug="loja" produtos={produtos} promocoes={[promocaoSimples]} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByText("Promoção Arroz 5kg"));

    expect(screen.getByRole("heading", { name: "Qual produto vai entrar em promoção?" })).toBeInTheDocument();
  });

  it("remove a promoção selecionada, atualiza a rota e chama onDone", async () => {
    removerPromocaoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <PromocaoHub slug="minha-loja" produtos={produtos} promocoes={[promocaoSimples]} onDone={onDone} />
    );

    await user.click(screen.getByRole("button", { name: "Remover" }));
    await user.click(screen.getByText("Promoção Arroz 5kg"));

    expect(screen.getByText('Tem certeza que quer remover "Promoção Arroz 5kg"?')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sim, remover" }));

    expect(removerPromocaoSimplesMock).toHaveBeenCalledWith("minha-loja", "pr1");
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("mostra o erro retornado ao falhar a remoção", async () => {
    removerPromocaoSimplesMock.mockResolvedValue({ error: "Promoção não encontrada." });
    const user = userEvent.setup();
    render(<PromocaoHub slug="minha-loja" produtos={produtos} promocoes={[promocaoSimples]} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));
    await user.click(screen.getByText("Promoção Arroz 5kg"));
    await user.click(screen.getByRole("button", { name: "Sim, remover" }));

    expect(await screen.findByText("Promoção não encontrada.")).toBeInTheDocument();
  });
});
