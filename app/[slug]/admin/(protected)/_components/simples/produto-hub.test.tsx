import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProdutoAdmin } from "../../../_lib/types";

const { refreshMock, removerProdutoSimplesMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  removerProdutoSimplesMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("../../_lib/simples-actions", () => ({
  criarProdutoSimples: vi.fn(),
  atualizarProdutoSimples: vi.fn(),
  removerProdutoSimples: removerProdutoSimplesMock,
}));

import { ProdutoHub } from "./produto-hub";

const produtos: ProdutoAdmin[] = [
  { id: "p1", nome: "Arroz 5kg", precoVarejo: 25.5, estoque: 8 } as unknown as ProdutoAdmin,
  { id: "p2", nome: "Feijão 1kg", precoVarejo: 8, estoque: 20 } as unknown as ProdutoAdmin,
];

describe("ProdutoHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra o menu inicial com o título 'Produtos'", () => {
    render(<ProdutoHub slug="loja" produtos={produtos} onDone={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Produtos" })).toBeInTheDocument();
  });

  it("chama onDone ao clicar em '← Voltar' no menu inicial", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ProdutoHub slug="loja" produtos={produtos} onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "← Voltar" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("abre o ProdutoWizard de criação ao clicar em 'Adicionar novo'", async () => {
    const user = userEvent.setup();
    render(<ProdutoHub slug="loja" produtos={produtos} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Adicionar novo" }));
    expect(screen.getByRole("heading", { name: "Como se chama o produto?" })).toBeInTheDocument();
  });

  it("abre a lista de seleção e depois o wizard preenchido ao editar um produto", async () => {
    const user = userEvent.setup();
    render(<ProdutoHub slug="loja" produtos={produtos} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("heading", { name: "Qual produto você quer editar?" })).toBeInTheDocument();

    await user.click(screen.getByText("Arroz 5kg"));
    expect(screen.getByDisplayValue("Arroz 5kg")).toBeInTheDocument();
  });

  it("volta ao menu ao clicar em Voltar na lista de edição", async () => {
    const user = userEvent.setup();
    render(<ProdutoHub slug="loja" produtos={produtos} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "← Voltar" }));

    expect(screen.getByRole("heading", { name: "Produtos" })).toBeInTheDocument();
  });

  it("remove o produto selecionado, atualiza a rota e volta ao início", async () => {
    removerProdutoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ProdutoHub slug="minha-loja" produtos={produtos} onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));
    await user.click(screen.getByText("Feijão 1kg"));

    expect(screen.getByRole("heading", { name: "Remover produto?" })).toBeInTheDocument();
    expect(screen.getByText('Tem certeza que quer remover "Feijão 1kg"?')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sim, remover" }));

    expect(removerProdutoSimplesMock).toHaveBeenCalledWith("minha-loja", "p2");
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("mostra o erro retornado ao falhar a remoção e permanece na tela de confirmação", async () => {
    removerProdutoSimplesMock.mockResolvedValue({ error: "Produto não encontrado." });
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ProdutoHub slug="minha-loja" produtos={produtos} onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));
    await user.click(screen.getByText("Feijão 1kg"));
    await user.click(screen.getByRole("button", { name: "Sim, remover" }));

    expect(await screen.findByText("Produto não encontrado.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("cancela a remoção e volta ao menu ao clicar em Cancelar", async () => {
    const user = userEvent.setup();
    render(<ProdutoHub slug="loja" produtos={produtos} onDone={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));
    await user.click(screen.getByText("Arroz 5kg"));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("heading", { name: "Produtos" })).toBeInTheDocument();
    expect(removerProdutoSimplesMock).not.toHaveBeenCalled();
  });
});
