import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProdutoAdmin, ComboAdmin } from "../../../_lib/types";

const { refreshMock, removerComboSimplesMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  removerComboSimplesMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("../../_lib/simples-actions", () => ({
  criarComboSimples: vi.fn(),
  atualizarComboSimples: vi.fn(),
  removerComboSimples: removerComboSimplesMock,
}));

import { ComboHub } from "./combo-hub";

const produtos: ProdutoAdmin[] = [
  { id: "p1", nome: "Arroz 5kg", precoVarejo: 25.5, estoque: 8 } as unknown as ProdutoAdmin,
];

const combos: ComboAdmin[] = [
  { id: "c1", nome: "Combo Lanche", preco: 30, itens: [{ produtoId: "p1", quantidade: 1 }] } as unknown as ComboAdmin,
];

describe("ComboHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra o menu inicial com o título 'Combos'", () => {
    render(<ComboHub slug="loja" produtos={produtos} combos={combos} onDone={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Combos" })).toBeInTheDocument();
  });

  it("chama onDone ao clicar em '← Voltar' no menu inicial", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ComboHub slug="loja" produtos={produtos} combos={combos} onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "← Voltar" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("abre o ComboWizard de criação ao clicar em 'Adicionar novo'", async () => {
    const user = userEvent.setup();
    render(<ComboHub slug="loja" produtos={produtos} combos={combos} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Adicionar novo" }));
    expect(screen.getByRole("heading", { name: "Como vai se chamar o combo?" })).toBeInTheDocument();
  });

  it("abre a lista de seleção e depois o wizard preenchido ao editar um combo", async () => {
    const user = userEvent.setup();
    render(<ComboHub slug="loja" produtos={produtos} combos={combos} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("heading", { name: "Qual combo você quer editar?" })).toBeInTheDocument();

    await user.click(screen.getByText("Combo Lanche"));
    expect(screen.getByDisplayValue("Combo Lanche")).toBeInTheDocument();
  });

  it("remove o combo selecionado, atualiza a rota e chama onDone", async () => {
    removerComboSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ComboHub slug="minha-loja" produtos={produtos} combos={combos} onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));
    await user.click(screen.getByText("Combo Lanche"));

    expect(screen.getByText('Tem certeza que quer remover "Combo Lanche"?')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sim, remover" }));

    expect(removerComboSimplesMock).toHaveBeenCalledWith("minha-loja", "c1");
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("mostra o erro retornado ao falhar a remoção", async () => {
    removerComboSimplesMock.mockResolvedValue({ error: "Combo não encontrado." });
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ComboHub slug="minha-loja" produtos={produtos} combos={combos} onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));
    await user.click(screen.getByText("Combo Lanche"));
    await user.click(screen.getByRole("button", { name: "Sim, remover" }));

    expect(await screen.findByText("Combo não encontrado.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });
});
