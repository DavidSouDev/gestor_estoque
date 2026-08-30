import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProdutoAdmin, ComboAdmin, PromocaoAdmin } from "../../../_lib/types";

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("../../_lib/simples-actions", () => ({
  criarProdutoSimples: vi.fn(),
  atualizarProdutoSimples: vi.fn(),
  removerProdutoSimples: vi.fn(),
  criarComboSimples: vi.fn(),
  atualizarComboSimples: vi.fn(),
  removerComboSimples: vi.fn(),
  criarPromocaoSimples: vi.fn(),
  atualizarPromocaoSimples: vi.fn(),
  removerPromocaoSimples: vi.fn(),
  registrarMovimentacaoSimples: vi.fn(),
}));

import { SimplesAssistant } from "./simples-assistant";

const produtos: ProdutoAdmin[] = [
  { id: "p1", nome: "Arroz 5kg", precoVarejo: 25.5, estoque: 8 } as unknown as ProdutoAdmin,
];

const combos: ComboAdmin[] = [
  { id: "c1", nome: "Combo Lanche", preco: 30, itens: [{ produtoId: "p1", quantidade: 1 }] } as unknown as ComboAdmin,
];

const promocoes: PromocaoAdmin[] = [
  {
    id: "pr1",
    nome: "Promoção Arroz 5kg",
    dataInicio: "2026-01-01T00:00:00.000Z",
    dataFim: "2026-01-10T23:59:59.000Z",
    itens: [{ produtoId: "p1", preco: 19.9 }],
  } as unknown as PromocaoAdmin,
];

function renderAssistant() {
  return render(
    <SimplesAssistant slug="minha-loja" nome="Ana" produtos={produtos} combos={combos} promocoes={promocoes} />
  );
}

describe("SimplesAssistant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza a saudação com o nome do usuário na tela inicial", () => {
    renderAssistant();
    expect(screen.getByRole("heading", { name: "Olá, Ana!" })).toBeInTheDocument();
  });

  it("renderiza os seis atalhos de ação na tela inicial", () => {
    renderAssistant();

    expect(screen.getByRole("button", { name: "Registrar venda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar ao estoque" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Produtos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conferir estoque" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Promoções" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Combos" })).toBeInTheDocument();
  });

  it("navega para o ProdutoHub com os produtos recebidos ao clicar em 'Produtos'", async () => {
    const user = userEvent.setup();
    renderAssistant();

    await user.click(screen.getByRole("button", { name: "Produtos" }));

    expect(screen.getByRole("heading", { name: "Produtos" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Arroz 5kg")).toBeInTheDocument();
  });

  it("navega para o fluxo de venda (MovimentacaoWizard tipo SAIDA) ao clicar em 'Registrar venda'", async () => {
    const user = userEvent.setup();
    renderAssistant();

    await user.click(screen.getByRole("button", { name: "Registrar venda" }));

    expect(screen.getByRole("heading", { name: "Qual produto foi vendido?" })).toBeInTheDocument();
    expect(screen.getByText("Arroz 5kg")).toBeInTheDocument();
  });

  it("navega para o fluxo de entrada (MovimentacaoWizard tipo ENTRADA) ao clicar em 'Adicionar ao estoque'", async () => {
    const user = userEvent.setup();
    renderAssistant();

    await user.click(screen.getByRole("button", { name: "Adicionar ao estoque" }));

    expect(screen.getByRole("heading", { name: "Qual produto vai receber estoque?" })).toBeInTheDocument();
  });

  it("navega para o EstoqueView com os produtos recebidos ao clicar em 'Conferir estoque'", async () => {
    const user = userEvent.setup();
    renderAssistant();

    await user.click(screen.getByRole("button", { name: "Conferir estoque" }));

    expect(screen.getByRole("heading", { name: "Seu estoque" })).toBeInTheDocument();
    expect(screen.getByText("Arroz 5kg")).toBeInTheDocument();
    expect(screen.getByText("8 un.")).toBeInTheDocument();
  });

  it("navega para o PromocaoHub com produtos e promoções recebidos ao clicar em 'Promoções'", async () => {
    const user = userEvent.setup();
    renderAssistant();

    await user.click(screen.getByRole("button", { name: "Promoções" }));
    expect(screen.getByRole("heading", { name: "Promoções" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Promoção Arroz 5kg")).toBeInTheDocument();
  });

  it("navega para o ComboHub com produtos e combos recebidos ao clicar em 'Combos'", async () => {
    const user = userEvent.setup();
    renderAssistant();

    await user.click(screen.getByRole("button", { name: "Combos" }));
    expect(screen.getByRole("heading", { name: "Combos" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Combo Lanche")).toBeInTheDocument();
  });

  it("volta para a tela inicial ao sair do ProdutoHub", async () => {
    const user = userEvent.setup();
    renderAssistant();

    await user.click(screen.getByRole("button", { name: "Produtos" }));
    await user.click(screen.getByRole("button", { name: "← Voltar" }));

    expect(screen.getByRole("heading", { name: "Olá, Ana!" })).toBeInTheDocument();
  });

  it("volta para a tela inicial ao sair do EstoqueView", async () => {
    const user = userEvent.setup();
    renderAssistant();

    await user.click(screen.getByRole("button", { name: "Conferir estoque" }));
    await user.click(screen.getByRole("button", { name: "← Voltar" }));

    expect(screen.getByRole("heading", { name: "Olá, Ana!" })).toBeInTheDocument();
  });

  it("volta para a tela inicial ao sair do fluxo de venda", async () => {
    const user = userEvent.setup();
    renderAssistant();

    await user.click(screen.getByRole("button", { name: "Registrar venda" }));
    await user.click(screen.getByRole("button", { name: "← Voltar" }));

    expect(screen.getByRole("heading", { name: "Olá, Ana!" })).toBeInTheDocument();
  });
});
