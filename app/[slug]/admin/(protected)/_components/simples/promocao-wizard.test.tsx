import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProdutoAdmin, PromocaoAdmin } from "../../../_lib/types";

const { refreshMock, criarPromocaoSimplesMock, atualizarPromocaoSimplesMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  criarPromocaoSimplesMock: vi.fn(),
  atualizarPromocaoSimplesMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("../../_lib/simples-actions", () => ({
  criarPromocaoSimples: criarPromocaoSimplesMock,
  atualizarPromocaoSimples: atualizarPromocaoSimplesMock,
}));

import { PromocaoWizard } from "./promocao-wizard";

const produtos: ProdutoAdmin[] = [
  { id: "p1", nome: "Arroz 5kg", precoVarejo: 25.5, estoque: 8 } as unknown as ProdutoAdmin,
  { id: "p2", nome: "Feijão 1kg", precoVarejo: 8, estoque: 20 } as unknown as ProdutoAdmin,
];

function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}

const existing = {
  id: "pr1",
  nome: "Promoção Arroz 5kg",
  dataInicio: "2026-01-01T00:00:00.000Z",
  dataFim: "2026-01-10T23:59:59.000Z",
  itens: [{ produtoId: "p1", preco: 19.9 }],
} as unknown as PromocaoAdmin;

async function preencherAteConfirmacao(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("Arroz 5kg"));
  fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "19,90" } });
  await user.click(screen.getByRole("button", { name: "Próximo" }));
  await user.click(screen.getByRole("button", { name: "Próximo" }));
  await user.click(screen.getByRole("button", { name: "Próximo" }));
}

describe("PromocaoWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra a lista de produtos no primeiro passo com o preço de varejo como sub-rótulo", () => {
    render(<PromocaoWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Qual produto vai entrar em promoção?" })).toBeInTheDocument();
    expect(screen.getByText("R$ 25,50")).toBeInTheDocument();
  });

  it("chama onCancel ao voltar da lista de produtos", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<PromocaoWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "← Voltar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("pré-preenche o preço promocional com o preço de varejo do produto ao selecioná-lo", async () => {
    const user = userEvent.setup();
    render(<PromocaoWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByText("Arroz 5kg"));
    expect(screen.getByPlaceholderText("0,00")).toHaveValue("25.5");
  });

  it("desabilita o avanço no passo de preço até um valor > 0", async () => {
    const user = userEvent.setup();
    render(<PromocaoWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByText("Arroz 5kg"));
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Próximo" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "19,90" } });
    expect(screen.getByRole("button", { name: "Próximo" })).toBeEnabled();
  });

  it("usa hoje e daqui a uma semana como datas padrão para uma promoção nova", async () => {
    const user = userEvent.setup();
    render(<PromocaoWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByText("Arroz 5kg"));
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    const inicioInput = screen.getByDisplayValue(hojeStr());
    expect(inicioInput).toBeInTheDocument();
  });

  it("usa a data de início como mínimo para a data de fim", async () => {
    const user = userEvent.setup();
    render(<PromocaoWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByText("Arroz 5kg"));
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    fireEvent.change(screen.getByDisplayValue(hojeStr()), { target: { value: "2026-05-10" } });
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    expect(screen.getByRole("heading", { name: "Quando termina a promoção?" })).toBeInTheDocument();
    expect(document.querySelector('input[type="date"][min="2026-05-10"]')).toBeInTheDocument();
  });

  it("mostra o resumo com produto, preço promocional e período formatados", async () => {
    const user = userEvent.setup();
    render(<PromocaoWizard slug="loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);

    expect(screen.getByText("Arroz 5kg")).toBeInTheDocument();
    expect(screen.getByText("R$ 19,90")).toBeInTheDocument();
  });

  it("chama criarPromocaoSimples com os dados preenchidos ao confirmar", async () => {
    criarPromocaoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<PromocaoWizard slug="minha-loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);
    await user.click(screen.getByRole("button", { name: "Salvar promoção" }));

    expect(await screen.findByText("Promoção salva!")).toBeInTheDocument();
    expect(criarPromocaoSimplesMock).toHaveBeenCalledWith(
      "minha-loja",
      expect.objectContaining({ produtoId: "p1", preco: 19.9 })
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("começa pela lista de produtos mesmo ao editar, e preserva o preço promocional existente ao reselecionar o produto", async () => {
    const user = userEvent.setup();
    render(
      <PromocaoWizard slug="loja" produtos={produtos} existing={existing} onDone={vi.fn()} onCancel={vi.fn()} />
    );

    expect(screen.getByRole("heading", { name: "Qual produto vai entrar em promoção?" })).toBeInTheDocument();

    await user.click(screen.getByText("Arroz 5kg"));

    expect(screen.getByRole("heading", { name: "Qual vai ser o preço promocional?" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("0,00")).toHaveValue("19.9");
  });

  it("chama atualizarPromocaoSimples ao confirmar a edição de uma promoção existente", async () => {
    atualizarPromocaoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(
      <PromocaoWizard
        slug="minha-loja"
        produtos={produtos}
        existing={existing}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByText("Arroz 5kg"));
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Promoção atualizada!")).toBeInTheDocument();
    expect(atualizarPromocaoSimplesMock).toHaveBeenCalledWith(
      "minha-loja",
      "pr1",
      expect.objectContaining({ produtoId: "p1", preco: 19.9, dataInicio: "2026-01-01", dataFim: "2026-01-10" })
    );
  });

  it("mostra o erro retornado pela action e não avança para a tela de sucesso", async () => {
    criarPromocaoSimplesMock.mockResolvedValue({ error: "A data final precisa ser depois da data inicial." });
    const user = userEvent.setup();
    render(<PromocaoWizard slug="minha-loja" produtos={produtos} onDone={vi.fn()} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);
    await user.click(screen.getByRole("button", { name: "Salvar promoção" }));

    expect(await screen.findByText("A data final precisa ser depois da data inicial.")).toBeInTheDocument();
    expect(screen.queryByText("Promoção salva!")).not.toBeInTheDocument();
  });

  it("chama onDone ao clicar em 'Voltar ao início' na tela de sucesso", async () => {
    criarPromocaoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<PromocaoWizard slug="minha-loja" produtos={produtos} onDone={onDone} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);
    await user.click(screen.getByRole("button", { name: "Salvar promoção" }));

    await user.click(await screen.findByRole("button", { name: "Voltar ao início" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
