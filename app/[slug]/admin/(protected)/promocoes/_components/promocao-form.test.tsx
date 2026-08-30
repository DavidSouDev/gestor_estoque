import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromocaoForm } from "./promocao-form";
import type { ComboAdmin, PromocaoAdminDetalhe, ProdutoAdmin } from "../../../_lib/types";

const produtos = [{ id: "p1", nome: "Picanha", precoVarejo: 50 }] as unknown as ProdutoAdmin[];
const combos = [{ id: "c1", nome: "Combo Churrasco", preco: 100 }] as unknown as ComboAdmin[];

describe("PromocaoForm", () => {
  it("avisa que não há produtos cadastrados quando a lista está vazia", () => {
    render(<PromocaoForm action={vi.fn().mockResolvedValue({})} produtos={[]} combos={[]} />);

    expect(screen.getByText("Nenhum produto cadastrado.")).toBeInTheDocument();
  });

  it("não exibe a seção de combos quando não há combos", () => {
    render(<PromocaoForm action={vi.fn().mockResolvedValue({})} produtos={produtos} combos={[]} />);

    expect(screen.queryByText("Combos")).not.toBeInTheDocument();
  });

  it("exibe a seção de combos quando há combos disponíveis", () => {
    render(<PromocaoForm action={vi.fn().mockResolvedValue({})} produtos={produtos} combos={combos} />);

    expect(screen.getByText("Combos")).toBeInTheDocument();
    expect(screen.getByText(/Combo Churrasco/)).toBeInTheDocument();
  });

  it("preenche nome e datas ao editar uma promoção existente", () => {
    const promocao = {
      id: "promo-1",
      nome: "Queima de estoque",
      dataInicio: new Date("2026-01-01T10:00:00"),
      dataFim: new Date("2026-01-10T10:00:00"),
      itens: [],
    } as unknown as PromocaoAdminDetalhe;

    render(
      <PromocaoForm
        action={vi.fn().mockResolvedValue({})}
        promocao={promocao}
        produtos={produtos}
        combos={combos}
      />
    );

    expect(screen.getByLabelText("Nome")).toHaveValue("Queima de estoque");
  });

  it("marca produtos e combos já incluídos na promoção como selecionados, com o preço promocional preenchido", () => {
    const promocao = {
      id: "promo-1",
      nome: "Queima de estoque",
      dataInicio: new Date("2026-01-01T10:00:00"),
      dataFim: new Date("2026-01-10T10:00:00"),
      itens: [
        { produtoId: "p1", comboId: null, preco: 40 },
        { produtoId: null, comboId: "c1", preco: 80 },
      ],
    } as unknown as PromocaoAdminDetalhe;

    render(
      <PromocaoForm
        action={vi.fn().mockResolvedValue({})}
        promocao={promocao}
        produtos={produtos}
        combos={combos}
      />
    );

    const checkboxProduto = document.querySelector(
      'input[name="item-produto-p1"]'
    ) as HTMLInputElement;
    const precoProduto = document.querySelector(
      'input[name="preco-produto-p1"]'
    ) as HTMLInputElement;
    const checkboxCombo = document.querySelector('input[name="item-combo-c1"]') as HTMLInputElement;
    const precoCombo = document.querySelector('input[name="preco-combo-c1"]') as HTMLInputElement;

    expect(checkboxProduto.checked).toBe(true);
    expect(precoProduto.value).toBe("40");
    expect(checkboxCombo.checked).toBe(true);
    expect(precoCombo.value).toBe("80");
  });

  it("preenche o preço do produto com o preço de varejo quando não está em promoção", () => {
    render(<PromocaoForm action={vi.fn().mockResolvedValue({})} produtos={produtos} combos={[]} />);

    const precoProduto = document.querySelector(
      'input[name="preco-produto-p1"]'
    ) as HTMLInputElement;

    expect(precoProduto.value).toBe("50");
  });

  it("exibe a mensagem de erro retornada pela action", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Datas inválidas" });
    const user = userEvent.setup();

    render(<PromocaoForm action={action} produtos={produtos} combos={combos} />);

    await user.type(screen.getByLabelText("Nome"), "Promoção Teste");
    fireEvent.change(screen.getByLabelText("Início"), { target: { value: "2026-01-01T10:00" } });
    fireEvent.change(screen.getByLabelText("Fim"), { target: { value: "2026-01-10T10:00" } });
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(await screen.findByText("Datas inválidas")).toBeInTheDocument();
  });
});
