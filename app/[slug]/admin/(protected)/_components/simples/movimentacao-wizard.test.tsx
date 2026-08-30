import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProdutoAdmin } from "../../../_lib/types";

const { refreshMock, registrarMovimentacaoSimplesMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  registrarMovimentacaoSimplesMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("../../_lib/simples-actions", () => ({
  registrarMovimentacaoSimples: registrarMovimentacaoSimplesMock,
}));

import { MovimentacaoWizard } from "./movimentacao-wizard";

const produtos: ProdutoAdmin[] = [
  { id: "p1", nome: "Arroz 5kg", precoVarejo: 25.5, estoque: 8 } as unknown as ProdutoAdmin,
  { id: "p2", nome: "Feijão 1kg", precoVarejo: 8, estoque: 20 } as unknown as ProdutoAdmin,
];

async function selecionarProdutoEAvancar(user: ReturnType<typeof userEvent.setup>, nome = "Arroz 5kg") {
  await user.click(screen.getByText(nome));
}

describe("MovimentacaoWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra a pergunta de venda e o estoque atual como sub-rótulo no tipo SAIDA", () => {
    render(<MovimentacaoWizard slug="loja" produtos={produtos} tipo="SAIDA" onDone={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Qual produto foi vendido?" })).toBeInTheDocument();
    expect(screen.getByText("estoque: 8")).toBeInTheDocument();
  });

  it("mostra a pergunta de entrada no tipo ENTRADA", () => {
    render(<MovimentacaoWizard slug="loja" produtos={produtos} tipo="ENTRADA" onDone={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Qual produto vai receber estoque?" })).toBeInTheDocument();
  });

  it("chama onDone ao clicar em '← Voltar' na seleção de produto (primeiro passo)", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<MovimentacaoWizard slug="loja" produtos={produtos} tipo="SAIDA" onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "← Voltar" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("avança para o passo de quantidade com o NumberStepper iniciando em 1", async () => {
    const user = userEvent.setup();
    render(<MovimentacaoWizard slug="loja" produtos={produtos} tipo="SAIDA" onDone={vi.fn()} />);

    await selecionarProdutoEAvancar(user);

    expect(screen.getByRole("heading", { name: "Quantas unidades?" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(1);
  });

  it("não deixa a quantidade ir abaixo de 1 (mínimo customizado)", async () => {
    const user = userEvent.setup();
    render(<MovimentacaoWizard slug="loja" produtos={produtos} tipo="SAIDA" onDone={vi.fn()} />);

    await selecionarProdutoEAvancar(user);
    await user.click(screen.getByText("−"));

    expect(screen.getByRole("spinbutton")).toHaveValue(1);
  });

  it("incrementa a quantidade ao clicar em +", async () => {
    const user = userEvent.setup();
    render(<MovimentacaoWizard slug="loja" produtos={produtos} tipo="SAIDA" onDone={vi.fn()} />);

    await selecionarProdutoEAvancar(user);
    await user.click(screen.getByText("+"));
    await user.click(screen.getByText("+"));

    expect(screen.getByRole("spinbutton")).toHaveValue(3);
  });

  it("mostra a confirmação de venda com a quantidade e o nome do produto", async () => {
    const user = userEvent.setup();
    render(<MovimentacaoWizard slug="loja" produtos={produtos} tipo="SAIDA" onDone={vi.fn()} />);

    await selecionarProdutoEAvancar(user, "Feijão 1kg");
    await user.click(screen.getByText("+"));
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    expect(screen.getByRole("heading", { name: "Confirma a venda de 2x Feijão 1kg?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar venda" })).toBeInTheDocument();
  });

  it("mostra a confirmação de entrada com o texto correspondente", async () => {
    const user = userEvent.setup();
    render(<MovimentacaoWizard slug="loja" produtos={produtos} tipo="ENTRADA" onDone={vi.fn()} />);

    await selecionarProdutoEAvancar(user);
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    expect(screen.getByRole("heading", { name: "Confirma a entrada de 1x Arroz 5kg?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar entrada" })).toBeInTheDocument();
  });

  it("chama registrarMovimentacaoSimples com produtoId, quantidade e tipo corretos ao confirmar a venda", async () => {
    registrarMovimentacaoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<MovimentacaoWizard slug="minha-loja" produtos={produtos} tipo="SAIDA" onDone={vi.fn()} />);

    await selecionarProdutoEAvancar(user, "Feijão 1kg");
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Confirmar venda" }));

    expect(await screen.findByText("Venda registrada!")).toBeInTheDocument();
    expect(registrarMovimentacaoSimplesMock).toHaveBeenCalledWith("minha-loja", {
      produtoId: "p2",
      quantidade: 1,
      tipo: "SAIDA",
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("mostra a mensagem de sucesso correta para entrada de estoque", async () => {
    registrarMovimentacaoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<MovimentacaoWizard slug="minha-loja" produtos={produtos} tipo="ENTRADA" onDone={vi.fn()} />);

    await selecionarProdutoEAvancar(user);
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Confirmar entrada" }));

    expect(await screen.findByText("Estoque atualizado!")).toBeInTheDocument();
    expect(screen.getByText("+1x Arroz 5kg")).toBeInTheDocument();
  });

  it("mostra o erro retornado pela action e não avança para a tela de sucesso", async () => {
    registrarMovimentacaoSimplesMock.mockResolvedValue({ error: "Estoque insuficiente." });
    const user = userEvent.setup();
    render(<MovimentacaoWizard slug="minha-loja" produtos={produtos} tipo="SAIDA" onDone={vi.fn()} />);

    await selecionarProdutoEAvancar(user);
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Confirmar venda" }));

    expect(await screen.findByText("Estoque insuficiente.")).toBeInTheDocument();
    expect(screen.queryByText("Venda registrada!")).not.toBeInTheDocument();
  });

  it("permite registrar outra movimentação, reiniciando produto e quantidade", async () => {
    registrarMovimentacaoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<MovimentacaoWizard slug="minha-loja" produtos={produtos} tipo="SAIDA" onDone={vi.fn()} />);

    await selecionarProdutoEAvancar(user);
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Confirmar venda" }));

    await user.click(await screen.findByRole("button", { name: "Registrar outra venda" }));

    expect(screen.getByRole("heading", { name: "Qual produto foi vendido?" })).toBeInTheDocument();
  });

  it("chama onDone ao clicar em 'Voltar ao início' na tela de sucesso", async () => {
    registrarMovimentacaoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<MovimentacaoWizard slug="minha-loja" produtos={produtos} tipo="SAIDA" onDone={onDone} />);

    await selecionarProdutoEAvancar(user);
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Confirmar venda" }));

    await user.click(await screen.findByRole("button", { name: "Voltar ao início" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
