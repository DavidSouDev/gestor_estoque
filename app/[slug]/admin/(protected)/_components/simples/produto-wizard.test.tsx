import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProdutoAdmin } from "../../../_lib/types";

const {
  refreshMock,
  criarProdutoSimplesMock,
  atualizarProdutoSimplesMock,
  uploadImagemProdutoMock,
  removerImagemProdutoMock,
} = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  criarProdutoSimplesMock: vi.fn(),
  atualizarProdutoSimplesMock: vi.fn(),
  uploadImagemProdutoMock: vi.fn(),
  removerImagemProdutoMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("../../_lib/simples-actions", () => ({
  criarProdutoSimples: criarProdutoSimplesMock,
  atualizarProdutoSimples: atualizarProdutoSimplesMock,
  uploadImagemProduto: uploadImagemProdutoMock,
  removerImagemProduto: removerImagemProdutoMock,
}));

// O recorte real depende de dimensões de imagem decodificada pelo navegador
// (`naturalWidth`/`getBoundingClientRect`), que o jsdom não simula. O modal é
// substituído por um botão que aplica o arquivo bruto, mantendo o teste focado
// na integração do wizard com o fluxo de upload, não na matemática do recorte.
vi.mock("@/app/_components/image-crop-modal", () => ({
  ImageCropModal: ({ file, onConfirm }: { file: File; onConfirm: (file: File) => void }) => (
    <button type="button" onClick={() => onConfirm(file)}>
      Aplicar recorte (mock)
    </button>
  ),
}));

import { ProdutoWizard } from "./produto-wizard";

const existing = {
  id: "p1",
  nome: "Arroz 5kg",
  precoVarejo: 25.5,
  estoque: 8,
  fotoCapa: "https://exemplo.com/foto.png",
} as unknown as ProdutoAdmin;

async function preencherAteConfirmacao(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("Ex: Arroz 5kg"), "Feijão");
  await user.click(screen.getByRole("button", { name: "Próximo" }));

  fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "12,50" } });
  await user.click(screen.getByRole("button", { name: "Próximo" }));

  await user.click(screen.getByRole("button", { name: "Próximo" }));

  await user.click(screen.getByRole("button", { name: "Pular" }));
}

describe("ProdutoWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("desabilita o avanço no passo 1 até o nome ser preenchido", async () => {
    const user = userEvent.setup();
    render(<ProdutoWizard slug="loja" onDone={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Próximo" })).toBeDisabled();
    await user.type(screen.getByPlaceholderText("Ex: Arroz 5kg"), "Feijão");
    expect(screen.getByRole("button", { name: "Próximo" })).toBeEnabled();
  });

  it("chama onCancel ao clicar em Voltar no primeiro passo", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ProdutoWizard slug="loja" onDone={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("desabilita o avanço no passo de preço até um valor > 0 ser informado", async () => {
    const user = userEvent.setup();
    render(<ProdutoWizard slug="loja" onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ex: Arroz 5kg"), "Feijão");
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    expect(screen.getByRole("button", { name: "Próximo" })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "10,00" } });
    expect(screen.getByRole("button", { name: "Próximo" })).toBeEnabled();
  });

  it("usa o NumberStepper para ajustar o estoque no terceiro passo", async () => {
    const user = userEvent.setup();
    render(<ProdutoWizard slug="loja" onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ex: Arroz 5kg"), "Feijão");
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "10,00" } });
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    expect(screen.getByRole("spinbutton")).toHaveValue(0);
    await user.click(screen.getByText("+"));
    expect(screen.getByRole("spinbutton")).toHaveValue(1);
  });

  it("mostra 'Pular' quando não há foto e 'Próximo' após enviar uma foto", async () => {
    uploadImagemProdutoMock.mockResolvedValue({ url: "https://exemplo.com/x.png" });
    const user = userEvent.setup();
    render(<ProdutoWizard slug="loja" onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Ex: Arroz 5kg"), "Feijão");
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    fireEvent.change(screen.getByPlaceholderText("0,00"), { target: { value: "10,00" } });
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    expect(screen.getByRole("button", { name: "Pular" })).toBeInTheDocument();

    const file = new File(["conteudo"], "foto.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: "Aplicar recorte (mock)" }));

    expect(await screen.findByRole("button", { name: "Próximo" })).toBeInTheDocument();
    expect(uploadImagemProdutoMock).toHaveBeenCalledWith("loja", expect.any(FormData));
  });

  it("mostra o resumo correto na etapa de confirmação", async () => {
    const user = userEvent.setup();
    render(<ProdutoWizard slug="loja" onDone={vi.fn()} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);

    expect(screen.getByText("Feijão")).toBeInTheDocument();
    expect(screen.getByText("R$ 12,50")).toBeInTheDocument();
    expect(screen.getByText("0 unidades")).toBeInTheDocument();
  });

  it("chama criarProdutoSimples com os dados preenchidos ao confirmar um produto novo", async () => {
    criarProdutoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<ProdutoWizard slug="minha-loja" onDone={vi.fn()} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);
    await user.click(screen.getByRole("button", { name: "Salvar produto" }));

    expect(await screen.findByText("Produto salvo!")).toBeInTheDocument();
    expect(criarProdutoSimplesMock).toHaveBeenCalledWith("minha-loja", {
      nome: "Feijão",
      precoVarejo: 12.5,
      estoque: 0,
      fotoCapa: undefined,
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(atualizarProdutoSimplesMock).not.toHaveBeenCalled();
  });

  it("chama atualizarProdutoSimples ao confirmar a edição de um produto existente", async () => {
    atualizarProdutoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<ProdutoWizard slug="minha-loja" existing={existing} onDone={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByDisplayValue("Arroz 5kg")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Produto atualizado!")).toBeInTheDocument();
    expect(atualizarProdutoSimplesMock).toHaveBeenCalledWith("minha-loja", "p1", {
      nome: "Arroz 5kg",
      precoVarejo: 25.5,
      estoque: 8,
      fotoCapa: "https://exemplo.com/foto.png",
    });
    expect(screen.queryByRole("button", { name: "Adicionar outro" })).not.toBeInTheDocument();
    expect(removerImagemProdutoMock).not.toHaveBeenCalled();
  });

  it("apaga a foto antiga do bucket ao trocar a foto de um produto existente", async () => {
    atualizarProdutoSimplesMock.mockResolvedValue({ success: true });
    uploadImagemProdutoMock.mockResolvedValue({ url: "https://exemplo.com/nova-foto.png" });
    const user = userEvent.setup();
    render(<ProdutoWizard slug="minha-loja" existing={existing} onDone={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Próximo" }));

    await user.click(screen.getByRole("button", { name: "Trocar imagem" }));

    const file = new File(["conteudo"], "nova-foto.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: "Aplicar recorte (mock)" }));

    await screen.findByRole("button", { name: "Próximo" });
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Produto atualizado!")).toBeInTheDocument();
    expect(atualizarProdutoSimplesMock).toHaveBeenCalledWith("minha-loja", "p1", {
      nome: "Arroz 5kg",
      precoVarejo: 25.5,
      estoque: 8,
      fotoCapa: "https://exemplo.com/nova-foto.png",
    });
    expect(removerImagemProdutoMock).toHaveBeenCalledWith(
      "minha-loja",
      "https://exemplo.com/foto.png"
    );
  });

  it("mostra o erro retornado pela action e não avança para a tela de sucesso", async () => {
    criarProdutoSimplesMock.mockResolvedValue({ error: "Já existe um produto com esse código." });
    const user = userEvent.setup();
    render(<ProdutoWizard slug="minha-loja" onDone={vi.fn()} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);
    await user.click(screen.getByRole("button", { name: "Salvar produto" }));

    expect(await screen.findByText("Já existe um produto com esse código.")).toBeInTheDocument();
    expect(screen.queryByText("Produto salvo!")).not.toBeInTheDocument();
  });

  it("permite adicionar outro produto após salvar, reiniciando o formulário", async () => {
    criarProdutoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<ProdutoWizard slug="minha-loja" onDone={vi.fn()} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);
    await user.click(screen.getByRole("button", { name: "Salvar produto" }));

    await user.click(await screen.findByRole("button", { name: "Adicionar outro" }));

    expect(screen.getByPlaceholderText("Ex: Arroz 5kg")).toHaveValue("");
  });

  it("chama onDone ao clicar em 'Voltar ao início' na tela de sucesso", async () => {
    criarProdutoSimplesMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ProdutoWizard slug="minha-loja" onDone={onDone} onCancel={vi.fn()} />);

    await preencherAteConfirmacao(user);
    await user.click(screen.getByRole("button", { name: "Salvar produto" }));

    await user.click(await screen.findByRole("button", { name: "Voltar ao início" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
