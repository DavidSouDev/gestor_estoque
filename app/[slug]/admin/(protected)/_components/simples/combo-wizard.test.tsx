import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProdutoAdmin, ComboAdmin } from "../../../_lib/types";

const { refreshMock, criarComboSimplesMock, atualizarComboSimplesMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  criarComboSimplesMock: vi.fn(),
  atualizarComboSimplesMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("../../_lib/simples-actions", () => ({
  criarComboSimples: criarComboSimplesMock,
  atualizarComboSimples: atualizarComboSimplesMock,
}));

import { ComboWizard } from "./combo-wizard";

const produtos: ProdutoAdmin[] = [
  { id: "p1", nome: "Arroz 5kg", precoVarejo: 25.5, estoque: 8 } as unknown as ProdutoAdmin,
  { id: "p2", nome: "Feijão 1kg", precoVarejo: 8, estoque: 20 } as unknown as ProdutoAdmin,
];

const existing = {
  id: "c1",
  nome: "Combo Lanche",
  preco: 30,
  itens: [{ produtoId: "p1", quantidade: 1 }, { produtoId: "p2", quantidade: 1 }],
} as unknown as ComboAdmin;

async function preencherAteConfirmacao(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("Ex: Combo Lanche"), "Combo Feira");
  await user.click(screen.getByRole("button", { name: "Próximo" }));

  await user.click(screen.getByText("Arroz 5kg"));
  await user.click(screen.getByRole("button", { name: "Próximo" }));

  fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "20,00" } });
  await user.click(screen.getByRole("button", { name: "Próximo" }));
}

describe("ComboWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("desabilita o avanço no passo do nome até ser preenchido", async () => {
    const user = userEvent.setup();
    render(<ComboWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Próximo" })).toBeDisabled();
    await user.type(screen.getByPlaceholderText("Ex: Combo Lanche"), "Combo Feira");
    expect(screen.getByRole("button", { name: "Próximo" })).toBeEnabled();
  });

  it("chama onCancel ao clicar em Voltar no primeiro passo", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ComboWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("mostra mensagem quando não há produtos cadastrados na seleção", async () => {
    const user = userEvent.setup();
    render(<ComboWizard slug="loja" produtos={[]} onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ex: Combo Lanche"), "Combo Feira");
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    expect(screen.getByText("Você ainda não tem produtos cadastrados.")).toBeInTheDocument();
  });

  it("alterna a seleção de produtos e desabilita o avanço sem nenhum selecionado", async () => {
    const user = userEvent.setup();
    render(<ComboWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ex: Combo Lanche"), "Combo Feira");
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    expect(screen.getByRole("button", { name: "Próximo" })).toBeDisabled();

    await user.click(screen.getByText("Arroz 5kg"));
    expect(screen.getByRole("button", { name: "Próximo" })).toBeEnabled();

    await user.click(screen.getByText("Arroz 5kg"));
    expect(screen.getByRole("button", { name: "Próximo" })).toBeDisabled();
  });

  it("desabilita o avanço no passo de preço até um valor > 0 ser informado", async () => {
    const user = userEvent.setup();
    render(<ComboWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ex: Combo Lanche"), "Combo Feira");
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByText("Arroz 5kg"));
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    expect(screen.getByRole("button", { name: "Próximo" })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "20,00" } });
    expect(screen.getByRole("button", { name: "Próximo" })).toBeEnabled();
  });

  it("mostra o resumo com nome, quantidade de produtos e preço formatado", async () => {
    const user = userEvent.setup();
    render(<ComboWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);

    expect(screen.getByText("Combo Feira")).toBeInTheDocument();
    expect(screen.getByText("1 selecionados")).toBeInTheDocument();
    expect(screen.getByText("R$ 20,00")).toBeInTheDocument();
  });

  it("chama criarComboSimples com os produtos selecionados ao confirmar um combo novo", async () => {
    criarComboSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<ComboWizard slug="minha-loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);
    await user.click(screen.getByRole("button", { name: "Salvar combo" }));

    expect(await screen.findByText("Combo salvo!")).toBeInTheDocument();
    expect(criarComboSimplesMock).toHaveBeenCalledWith("minha-loja", {
      nome: "Combo Feira",
      preco: 20,
      produtoIds: ["p1"],
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(atualizarComboSimplesMock).not.toHaveBeenCalled();
  });

  it("pré-preenche nome, produtos e preço ao editar um combo existente", async () => {
    render(<ComboWizard slug="loja" produtos={produtos} existing={existing} onDone={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByDisplayValue("Combo Lanche")).toBeInTheDocument();
  });

  it("chama atualizarComboSimples ao confirmar a edição de um combo existente", async () => {
    atualizarComboSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(
      <ComboWizard slug="minha-loja" produtos={produtos} existing={existing} onDone={vi.fn()} onCancel={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Combo atualizado!")).toBeInTheDocument();
    expect(atualizarComboSimplesMock).toHaveBeenCalledWith("minha-loja", "c1", {
      nome: "Combo Lanche",
      preco: 30,
      produtoIds: ["p1", "p2"],
    });
  });

  it("mostra o erro retornado pela action e não avança para a tela de sucesso", async () => {
    criarComboSimplesMock.mockResolvedValue({ error: "Selecione ao menos um produto." });
    const user = userEvent.setup();
    render(<ComboWizard slug="minha-loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);
    await user.click(screen.getByRole("button", { name: "Salvar combo" }));

    expect(await screen.findByText("Selecione ao menos um produto.")).toBeInTheDocument();
    expect(screen.queryByText("Combo salvo!")).not.toBeInTheDocument();
  });

  it("chama onDone ao clicar em 'Voltar ao início' na tela de sucesso", async () => {
    criarComboSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ComboWizard slug="minha-loja" produtos={produtos} onDone={onDone} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);
    await user.click(screen.getByRole("button", { name: "Salvar combo" }));

    await user.click(await screen.findByRole("button", { name: "Voltar ao início" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
