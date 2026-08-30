// @vitest-environment node
import { describe, expect, it } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { produtoService } from "./produto.service";

const produtoBase = {
  id: "produto-1",
  empresaId: "empresa-1",
  codigo: "PROD-1",
  nome: "Produto Teste",
  descricao: null,
  categoria: "Geral",
  precoVarejo: 10,
  precoAtacado: 8,
  estoque: 5,
  fotoCapa: null,
  ordemCatalogo: 0,
  destaque: false,
  visivelCatalogo: true,
  ativo: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe("produtoService.generateUniqueCodigo", () => {
  it("gera um código a partir do slug do nome em maiúsculas", async () => {
    prismaMock.produto.findMany.mockResolvedValue([]);

    await expect(produtoService.generateUniqueCodigo("empresa-1", "Camisa Polo")).resolves.toBe(
      "CAMISA-POLO"
    );
  });

  it("usa o fallback de slugify (EMPRESA) quando o nome não gera slug válido", async () => {
    prismaMock.produto.findMany.mockResolvedValue([]);

    await expect(produtoService.generateUniqueCodigo("empresa-1", "!!!")).resolves.toBe("EMPRESA");
  });

  it("adiciona sufixo quando o código já existe para a empresa", async () => {
    prismaMock.produto.findMany.mockResolvedValue([{ codigo: "CAMISA-POLO" }] as never);

    await expect(produtoService.generateUniqueCodigo("empresa-1", "Camisa Polo")).resolves.toBe(
      "CAMISA-POLO-2"
    );
  });

  it("escopa a busca de códigos existentes por empresa", async () => {
    prismaMock.produto.findMany.mockResolvedValue([]);

    await produtoService.generateUniqueCodigo("empresa-1", "Camisa Polo");

    expect(prismaMock.produto.findMany).toHaveBeenCalledWith({
      where: { empresaId: "empresa-1", codigo: { startsWith: "CAMISA-POLO" } },
      select: { codigo: true },
    });
  });
});

describe("produtoService.listCatalogo", () => {
  it("lista apenas produtos ativos, visíveis e não deletados, ordenados", async () => {
    prismaMock.produto.findMany.mockResolvedValue([produtoBase] as never);

    const resultado = await produtoService.listCatalogo("empresa-1");

    expect(prismaMock.produto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { empresaId: "empresa-1", ativo: true, visivelCatalogo: true, deletedAt: null },
        orderBy: { ordemCatalogo: "asc" },
      })
    );
    expect(resultado).toEqual([produtoBase]);
  });
});

describe("produtoService.create", () => {
  it("aplica os valores padrão quando campos opcionais não são informados", async () => {
    prismaMock.produto.create.mockResolvedValue(produtoBase as never);

    await produtoService.create({
      empresaId: "empresa-1",
      codigo: "PROD-1",
      nome: "Produto Teste",
      precoVarejo: 10,
      precoAtacado: 8,
    });

    expect(prismaMock.produto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        categoria: "Geral",
        estoque: 0,
        ordemCatalogo: 0,
        destaque: false,
        ativo: true,
        visivelCatalogo: true,
      }),
    });
  });

  it("respeita os valores explicitamente informados", async () => {
    prismaMock.produto.create.mockResolvedValue(produtoBase as never);

    await produtoService.create({
      empresaId: "empresa-1",
      codigo: "PROD-1",
      nome: "Produto Teste",
      precoVarejo: 10,
      precoAtacado: 8,
      categoria: "Bebidas",
      estoque: 20,
      destaque: true,
      ativo: false,
      visivelCatalogo: false,
    });

    expect(prismaMock.produto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        categoria: "Bebidas",
        estoque: 20,
        destaque: true,
        ativo: false,
        visivelCatalogo: false,
      }),
    });
  });
});

describe("produtoService.delete", () => {
  it("faz soft delete marcando ativo=false e preenchendo deletedAt", async () => {
    prismaMock.produto.update.mockResolvedValue(produtoBase as never);

    await produtoService.delete("produto-1");

    expect(prismaMock.produto.update).toHaveBeenCalledWith({
      where: { id: "produto-1" },
      data: { ativo: false, deletedAt: expect.any(Date) },
    });
  });
});

describe("produtoService.toggleCatalogo", () => {
  it("inverte a visibilidade atual no catálogo", async () => {
    prismaMock.produto.findUnique.mockResolvedValue({ visivelCatalogo: true } as never);
    prismaMock.produto.update.mockResolvedValue(produtoBase as never);

    await produtoService.toggleCatalogo("produto-1");

    expect(prismaMock.produto.update).toHaveBeenCalledWith({
      where: { id: "produto-1" },
      data: { visivelCatalogo: false },
    });
  });

  it("lança erro quando o produto não existe", async () => {
    prismaMock.produto.findUnique.mockResolvedValue(null);

    await expect(produtoService.toggleCatalogo("inexistente")).rejects.toThrow(
      "Produto não encontrado."
    );
    expect(prismaMock.produto.update).not.toHaveBeenCalled();
  });
});

describe("produtoService.toggleDestaque", () => {
  it("inverte o destaque atual", async () => {
    prismaMock.produto.findUnique.mockResolvedValue({ destaque: false } as never);
    prismaMock.produto.update.mockResolvedValue(produtoBase as never);

    await produtoService.toggleDestaque("produto-1");

    expect(prismaMock.produto.update).toHaveBeenCalledWith({
      where: { id: "produto-1" },
      data: { destaque: true },
    });
  });

  it("lança erro quando o produto não existe", async () => {
    prismaMock.produto.findUnique.mockResolvedValue(null);

    await expect(produtoService.toggleDestaque("inexistente")).rejects.toThrow(
      "Produto não encontrado."
    );
  });
});

describe("produtoService.updateEstoque", () => {
  it("atualiza apenas o campo estoque", async () => {
    prismaMock.produto.update.mockResolvedValue(produtoBase as never);

    await produtoService.updateEstoque("produto-1", 42);

    expect(prismaMock.produto.update).toHaveBeenCalledWith({
      where: { id: "produto-1" },
      data: { estoque: 42 },
    });
  });
});
