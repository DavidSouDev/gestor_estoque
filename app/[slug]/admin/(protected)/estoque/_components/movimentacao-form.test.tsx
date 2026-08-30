import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MovimentacaoForm } from "./movimentacao-form";
import type { ProdutoAdmin } from "../../../_lib/types";

const produtos = [
  { id: "p1", nome: "Picanha", estoque: 5 },
  { id: "p2", nome: "Carvão", estoque: 12 },
] as unknown as ProdutoAdmin[];

describe("MovimentacaoForm", () => {
  it("lista os produtos disponíveis no select, incluindo o estoque atual", () => {
    render(<MovimentacaoForm action={vi.fn().mockResolvedValue({})} produtos={produtos} />);

    expect(screen.getByRole("option", { name: "Picanha (estoque atual: 5)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Carvão (estoque atual: 12)" })).toBeInTheDocument();
  });

  it("exibe as três opções de tipo de movimentação", () => {
    render(<MovimentacaoForm action={vi.fn().mockResolvedValue({})} produtos={produtos} />);

    expect(screen.getByRole("option", { name: "Entrada (chegou mercadoria)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Saída (venda ou perda)" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Ajustar quantidade (corrigir contagem)" })
    ).toBeInTheDocument();
  });

  it("exige produto e quantidade como campos obrigatórios, mas não o motivo", () => {
    render(<MovimentacaoForm action={vi.fn().mockResolvedValue({})} produtos={produtos} />);

    expect(screen.getByLabelText("Produto")).toBeRequired();
    expect(screen.getByLabelText("Quantidade")).toBeRequired();
    expect(screen.getByLabelText("Motivo (opcional)")).not.toBeRequired();
  });

  it("exibe a mensagem de erro retornada pela action", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Estoque insuficiente" });
    const user = userEvent.setup();

    render(<MovimentacaoForm action={action} produtos={produtos} />);

    await user.selectOptions(screen.getByLabelText("Produto"), "p1");
    await user.type(screen.getByLabelText("Quantidade"), "3");
    await user.click(screen.getByRole("button", { name: /registrar/i }));

    expect(await screen.findByText("Estoque insuficiente")).toBeInTheDocument();
  });
});
