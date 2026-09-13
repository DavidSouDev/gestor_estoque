// @vitest-environment node
import { describe, expect, it } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { produtoVarianteService } from "./produto-variante.service";

const varianteBase = {
  id: "variante-1",
  produtoId: "produto-1",
  nome: "P - Estampa A",
  precoVarejo: null,
  precoAtacado: null,
  estoque: 5,
  ordem: 0,
  ativo: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

function mockTransaction() {
  prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) =>
    Promise.resolve(callback(prismaMock))
  );
}

describe("produtoVarianteService.create", () => {
  it("cria a variante com atributos e imagens aninhados", async () => {
    mockTransaction();
    prismaMock.produtoVariante.create.mockResolvedValue(varianteBase as never);
    prismaMock.produto.update.mockResolvedValue({} as never);

    await produtoVarianteService.create({
      produtoId: "produto-1",
      nome: "P - Estampa A",
      atributos: [{ nome: "Tamanho", valor: "P" }],
      imagens: [{ url: "https://exemplo.com/1.jpg" }],
      estoque: 5,
    });

    expect(prismaMock.produtoVariante.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          produtoId: "produto-1",
          nome: "P - Estampa A",
          precoVarejo: null,
          precoAtacado: null,
          estoque: 5,
          atributos: { createMany: { data: [{ nome: "Tamanho", valor: "P", ordem: 0 }] } },
          imagens: {
            createMany: { data: [{ url: "https://exemplo.com/1.jpg", alt: undefined, ordem: 0 }] },
          },
        }),
      })
    );
  });

  it("espelha o estoque inicial da variante no agregado do produto", async () => {
    mockTransaction();
    prismaMock.produtoVariante.create.mockResolvedValue(varianteBase as never);
    prismaMock.produto.update.mockResolvedValue({} as never);

    await produtoVarianteService.create({
      produtoId: "produto-1",
      nome: "P - Estampa A",
      atributos: [{ nome: "Tamanho", valor: "P" }],
      imagens: [],
      estoque: 5,
    });

    expect(prismaMock.produto.update).toHaveBeenCalledWith({
      where: { id: "produto-1" },
      data: { estoque: { increment: 5 } },
    });
  });

  it("não mexe no estoque do produto quando a variante nasce com estoque zero", async () => {
    mockTransaction();
    prismaMock.produtoVariante.create.mockResolvedValue({ ...varianteBase, estoque: 0 } as never);

    await produtoVarianteService.create({
      produtoId: "produto-1",
      nome: "P - Estampa A",
      atributos: [{ nome: "Tamanho", valor: "P" }],
      imagens: [],
      estoque: 0,
    });

    expect(prismaMock.produto.update).not.toHaveBeenCalled();
  });
});

describe("produtoVarianteService.update", () => {
  it("lança erro quando a variante não existe", async () => {
    mockTransaction();
    prismaMock.produtoVariante.findUnique.mockResolvedValue(null);

    await expect(
      produtoVarianteService.update("inexistente", { nome: "Novo nome" })
    ).rejects.toMatchObject({ message: "Variante não encontrada.", status: 404 });
  });

  it("substitui a lista inteira de atributos quando fornecida", async () => {
    mockTransaction();
    prismaMock.produtoVariante.findUnique.mockResolvedValue({
      produtoId: "produto-1",
      estoque: 5,
      deletedAt: null,
    } as never);
    prismaMock.produtoVariante.update.mockResolvedValue(varianteBase as never);

    await produtoVarianteService.update("variante-1", {
      atributos: [{ nome: "Tamanho", valor: "M" }],
    });

    expect(prismaMock.produtoVarianteAtributo.deleteMany).toHaveBeenCalledWith({
      where: { varianteId: "variante-1" },
    });
    expect(prismaMock.produtoVarianteAtributo.createMany).toHaveBeenCalledWith({
      data: [{ varianteId: "variante-1", nome: "Tamanho", valor: "M", ordem: 0 }],
    });
  });

  it("espelha o delta de estoque no produto quando o estoque da variante muda", async () => {
    mockTransaction();
    prismaMock.produtoVariante.findUnique.mockResolvedValue({
      produtoId: "produto-1",
      estoque: 5,
      deletedAt: null,
    } as never);
    prismaMock.produtoVariante.update.mockResolvedValue(varianteBase as never);

    await produtoVarianteService.update("variante-1", { estoque: 8 });

    expect(prismaMock.produto.update).toHaveBeenCalledWith({
      where: { id: "produto-1" },
      data: { estoque: { increment: 3 } },
    });
  });

  it("não mexe no estoque do produto quando o estoque não é alterado", async () => {
    mockTransaction();
    prismaMock.produtoVariante.findUnique.mockResolvedValue({
      produtoId: "produto-1",
      estoque: 5,
      deletedAt: null,
    } as never);
    prismaMock.produtoVariante.update.mockResolvedValue(varianteBase as never);

    await produtoVarianteService.update("variante-1", { nome: "Novo nome" });

    expect(prismaMock.produto.update).not.toHaveBeenCalled();
  });
});

describe("produtoVarianteService.delete", () => {
  it("marca ativo=false e deletedAt, e retira o estoque da variante do agregado", async () => {
    mockTransaction();
    prismaMock.produtoVariante.findUnique.mockResolvedValue({
      produtoId: "produto-1",
      estoque: 5,
      deletedAt: null,
    } as never);
    prismaMock.produtoVariante.update.mockResolvedValue({
      ...varianteBase,
      ativo: false,
    } as never);

    await produtoVarianteService.delete("variante-1");

    expect(prismaMock.produtoVariante.update).toHaveBeenCalledWith({
      where: { id: "variante-1" },
      data: { ativo: false, deletedAt: expect.any(Date) },
    });
    expect(prismaMock.produto.update).toHaveBeenCalledWith({
      where: { id: "produto-1" },
      data: { estoque: { decrement: 5 } },
    });
  });

  it("lança erro quando a variante já foi apagada", async () => {
    mockTransaction();
    prismaMock.produtoVariante.findUnique.mockResolvedValue({
      produtoId: "produto-1",
      estoque: 5,
      deletedAt: new Date(),
    } as never);

    await expect(produtoVarianteService.delete("variante-1")).rejects.toMatchObject({
      message: "Variante não encontrada.",
      status: 404,
    });
  });
});

describe("produtoVarianteService.sincronizarAutomaticas", () => {
  it("cria uma variante por foto quando há 2 ou mais, sem pedir atributos", async () => {
    mockTransaction();
    prismaMock.produtoVariante.findMany.mockResolvedValue([]);
    prismaMock.produtoVariante.create.mockResolvedValue(varianteBase as never);

    const resultado = await produtoVarianteService.sincronizarAutomaticas("produto-1", [
      "https://exemplo.com/1.jpg",
      "https://exemplo.com/2.jpg",
    ]);

    expect(prismaMock.produtoVariante.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.produtoVariante.create).toHaveBeenNthCalledWith(1, {
      data: {
        produtoId: "produto-1",
        nome: "Variante 1",
        ordem: 0,
        imagens: { create: { url: "https://exemplo.com/1.jpg", ordem: 0 } },
      },
    });
    expect(prismaMock.produtoVariante.create).toHaveBeenNthCalledWith(2, {
      data: {
        produtoId: "produto-1",
        nome: "Variante 2",
        ordem: 1,
        imagens: { create: { url: "https://exemplo.com/2.jpg", ordem: 0 } },
      },
    });
    expect(resultado.imagensRemovidas).toEqual([]);
  });

  it("não cria variante nenhuma quando há só 1 foto (ou nenhuma)", async () => {
    mockTransaction();
    prismaMock.produtoVariante.findMany.mockResolvedValue([]);

    await produtoVarianteService.sincronizarAutomaticas("produto-1", ["https://exemplo.com/1.jpg"]);

    expect(prismaMock.produtoVariante.create).not.toHaveBeenCalled();
  });

  it("apaga só as variantes SEM atributos (automáticas), preservando as criadas à mão no modo COMPLETO", async () => {
    mockTransaction();
    prismaMock.produtoVariante.findMany.mockResolvedValue([
      { id: "auto-1", atributos: [], imagens: [{ url: "https://exemplo.com/velha.jpg" }] },
      {
        id: "manual-1",
        atributos: [{ nome: "Tamanho", valor: "P" }],
        imagens: [{ url: "https://exemplo.com/manual.jpg" }],
      },
    ] as never);

    await produtoVarianteService.sincronizarAutomaticas("produto-1", [
      "https://exemplo.com/nova-1.jpg",
      "https://exemplo.com/nova-2.jpg",
    ]);

    expect(prismaMock.produtoVariante.delete).toHaveBeenCalledTimes(1);
    expect(prismaMock.produtoVariante.delete).toHaveBeenCalledWith({ where: { id: "auto-1" } });
  });

  it("devolve as URLs de imagem que saíram do conjunto, para o chamador apagar do bucket", async () => {
    mockTransaction();
    prismaMock.produtoVariante.findMany.mockResolvedValue([
      {
        id: "auto-1",
        atributos: [],
        imagens: [{ url: "https://exemplo.com/ficou.jpg" }, { url: "https://exemplo.com/saiu.jpg" }],
      },
    ] as never);

    const resultado = await produtoVarianteService.sincronizarAutomaticas("produto-1", [
      "https://exemplo.com/ficou.jpg",
      "https://exemplo.com/nova.jpg",
    ]);

    expect(resultado.imagensRemovidas).toEqual(["https://exemplo.com/saiu.jpg"]);
  });
});

describe("produtoVarianteService.toggleAtivo", () => {
  it("inverte o campo ativo sem mexer no estoque do produto", async () => {
    prismaMock.produtoVariante.findUnique.mockResolvedValue({ ativo: true } as never);
    prismaMock.produtoVariante.update.mockResolvedValue({ ...varianteBase, ativo: false } as never);

    await produtoVarianteService.toggleAtivo("variante-1");

    expect(prismaMock.produtoVariante.update).toHaveBeenCalledWith({
      where: { id: "variante-1" },
      data: { ativo: false },
    });
    expect(prismaMock.produto.update).not.toHaveBeenCalled();
  });
});
