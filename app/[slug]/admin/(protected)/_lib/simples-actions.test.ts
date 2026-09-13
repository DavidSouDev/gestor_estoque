// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  requireAdminSessionMock,
  produtoServiceMock,
  produtoVarianteServiceMock,
  uploadImageMock,
  deleteImageMock,
} = vi.hoisted(() => ({
  requireAdminSessionMock: vi.fn(),
  produtoServiceMock: {
    generateUniqueCodigo: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    delete: vi.fn(),
  },
  produtoVarianteServiceMock: {
    sincronizarAutomaticas: vi.fn(),
  },
  uploadImageMock: vi.fn(),
  deleteImageMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminSession: requireAdminSessionMock }));
vi.mock("@/app/services/produto.service", () => ({ produtoService: produtoServiceMock }));
vi.mock("@/app/services/produto-variante.service", () => ({
  produtoVarianteService: produtoVarianteServiceMock,
}));
// simples-actions.ts também importa combo/promocao service pras próprias
// funções de combo/promoção simples, que este arquivo não exercita — mockados
// vazios só pra cortar a cadeia de import (combo/promocao service importam
// `PRODUTO_CATALOGO_SELECT` de produto.service, que o mock acima não provê).
vi.mock("@/app/services/combo.service", () => ({ comboService: {} }));
vi.mock("@/app/services/promocao.service", () => ({ promocaoService: {} }));
vi.mock("@/lib/storage/r2", () => ({
  uploadImage: uploadImageMock,
  deleteImage: deleteImageMock,
  UploadError: class UploadError extends Error {},
}));

import { criarProdutoSimples, atualizarProdutoSimples, removerProdutoSimples } from "./simples-actions";

const auth = { sub: "usuario-1", empresaId: "empresa-1" };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminSessionMock.mockResolvedValue(auth);
  produtoServiceMock.generateUniqueCodigo.mockResolvedValue("PROD-1");
  produtoVarianteServiceMock.sincronizarAutomaticas.mockResolvedValue({ imagensRemovidas: [] });
});

describe("criarProdutoSimples", () => {
  it("cria o produto sem fotoCapa e sem sincronizar variantes quando não há fotos", async () => {
    produtoServiceMock.create.mockResolvedValue({ id: "produto-1" });

    await criarProdutoSimples("loja", { nome: "Feijão", precoVarejo: 10, estoque: 0, fotos: [] });

    expect(produtoServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ fotoCapa: undefined })
    );
    expect(produtoVarianteServiceMock.sincronizarAutomaticas).not.toHaveBeenCalled();
  });

  it("usa a única foto como fotoCapa e não cria variante nenhuma", async () => {
    produtoServiceMock.create.mockResolvedValue({ id: "produto-1" });

    await criarProdutoSimples("loja", {
      nome: "Feijão",
      precoVarejo: 10,
      estoque: 0,
      fotos: ["https://exemplo.com/1.jpg"],
    });

    expect(produtoServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ fotoCapa: "https://exemplo.com/1.jpg" })
    );
    expect(produtoVarianteServiceMock.sincronizarAutomaticas).not.toHaveBeenCalled();
  });

  it("com 2+ fotos, usa a primeira como fotoCapa e sincroniza uma variante por foto", async () => {
    produtoServiceMock.create.mockResolvedValue({ id: "produto-1" });

    await criarProdutoSimples("loja", {
      nome: "Feijão",
      precoVarejo: 10,
      estoque: 0,
      fotos: ["https://exemplo.com/1.jpg", "https://exemplo.com/2.jpg"],
    });

    expect(produtoServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ fotoCapa: "https://exemplo.com/1.jpg" })
    );
    expect(produtoVarianteServiceMock.sincronizarAutomaticas).toHaveBeenCalledWith("produto-1", [
      "https://exemplo.com/1.jpg",
      "https://exemplo.com/2.jpg",
    ]);
  });

  it("apaga do bucket as imagens que o sincronismo de variantes devolveu como removidas", async () => {
    produtoServiceMock.create.mockResolvedValue({ id: "produto-1" });
    produtoVarianteServiceMock.sincronizarAutomaticas.mockResolvedValue({
      imagensRemovidas: ["https://exemplo.com/velha.jpg"],
    });

    await criarProdutoSimples("loja", {
      nome: "Feijão",
      precoVarejo: 10,
      estoque: 0,
      fotos: ["https://exemplo.com/1.jpg", "https://exemplo.com/2.jpg"],
    });

    expect(deleteImageMock).toHaveBeenCalledWith("https://exemplo.com/velha.jpg", "empresa-1");
  });
});

describe("atualizarProdutoSimples", () => {
  function mockProdutoExistente(fotoCapa: string | null) {
    produtoServiceMock.findById.mockResolvedValue({
      id: "produto-1",
      empresaId: "empresa-1",
      fotoCapa,
    });
  }

  it("remove a fotoCapa antiga do bucket quando o produto fica sem nenhuma foto", async () => {
    mockProdutoExistente("https://exemplo.com/antiga.jpg");

    await atualizarProdutoSimples("loja", "produto-1", {
      nome: "Feijão",
      precoVarejo: 10,
      estoque: 0,
      fotos: [],
    });

    expect(deleteImageMock).toHaveBeenCalledWith("https://exemplo.com/antiga.jpg", "empresa-1");
  });

  it("não apaga a fotoCapa antiga se ela continua entre as fotos escolhidas", async () => {
    mockProdutoExistente("https://exemplo.com/mesma.jpg");

    await atualizarProdutoSimples("loja", "produto-1", {
      nome: "Feijão",
      precoVarejo: 10,
      estoque: 0,
      fotos: ["https://exemplo.com/mesma.jpg"],
    });

    expect(deleteImageMock).not.toHaveBeenCalled();
  });

  it("apaga a fotoCapa antiga só UMA vez mesmo se o sincronismo também a devolver como removida", async () => {
    mockProdutoExistente("https://exemplo.com/antiga.jpg");
    produtoVarianteServiceMock.sincronizarAutomaticas.mockResolvedValue({
      imagensRemovidas: ["https://exemplo.com/antiga.jpg"],
    });

    await atualizarProdutoSimples("loja", "produto-1", {
      nome: "Feijão",
      precoVarejo: 10,
      estoque: 0,
      fotos: ["https://exemplo.com/nova.jpg"],
    });

    expect(deleteImageMock).toHaveBeenCalledTimes(1);
    expect(deleteImageMock).toHaveBeenCalledWith("https://exemplo.com/antiga.jpg", "empresa-1");
  });

  it("recusa produto de outra empresa", async () => {
    produtoServiceMock.findById.mockResolvedValue({
      id: "produto-1",
      empresaId: "outra-empresa",
      fotoCapa: null,
    });

    const resultado = await atualizarProdutoSimples("loja", "produto-1", {
      nome: "Feijão",
      precoVarejo: 10,
      estoque: 0,
      fotos: [],
    });

    expect(resultado).toEqual({ error: "Produto não encontrado." });
    expect(produtoServiceMock.update).not.toHaveBeenCalled();
  });
});

describe("removerProdutoSimples", () => {
  it("apaga do bucket a fotoCapa e as imagens de todas as variantes do produto", async () => {
    produtoServiceMock.findById.mockResolvedValue({
      id: "produto-1",
      empresaId: "empresa-1",
      fotoCapa: "https://exemplo.com/capa.jpg",
      variantes: [
        { imagens: [{ url: "https://exemplo.com/v1.jpg" }] },
        { imagens: [{ url: "https://exemplo.com/v2.jpg" }] },
      ],
    });

    await removerProdutoSimples("loja", "produto-1");

    expect(deleteImageMock).toHaveBeenCalledWith("https://exemplo.com/capa.jpg", "empresa-1");
    expect(deleteImageMock).toHaveBeenCalledWith("https://exemplo.com/v1.jpg", "empresa-1");
    expect(deleteImageMock).toHaveBeenCalledWith("https://exemplo.com/v2.jpg", "empresa-1");
  });
});
