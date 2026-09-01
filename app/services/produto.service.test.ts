// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * ACC-03 / D-07 / T-04-04 / T-04-05.
 *
 * O relógio é congelado porque `findCatalogoById` lê `new Date()` internamente
 * (ao contrário de `avaliarAcesso`, que recebe `agora` injetado). Sem congelar,
 * a fixture de CARÊNCIA — a única que depende de "agora está dentro dos 10
 * dias" — envelheceria e o teste começaria a falhar sozinho.
 */
const AGORA = new Date("2026-06-15T12:00:00.000Z");

const BILLING = {
  TRIAL: {
    acessoAte: null,
    trialFim: new Date("2026-07-01T03:00:00.000Z"),
    canceladoEm: null,
    acessoVitalicio: false,
  },
  EM_DIA: {
    acessoAte: new Date("2026-07-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  },
  // Venceu em 10/06; a carência de 10 dias vai até 20/06, e `AGORA` é 15/06.
  CARENCIA: {
    acessoAte: new Date("2026-06-10T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  },
  VITALICIO: {
    acessoAte: null,
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: true,
  },
  // Venceu em 01/01; a carência acabou em 11/01, muito antes de `AGORA`.
  BLOQUEADO: {
    acessoAte: new Date("2026-01-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  },
  CANCELADO: {
    acessoAte: new Date("2026-01-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: new Date("2026-01-05T03:00:00.000Z"),
    acessoVitalicio: false,
  },
} as const;

describe("produtoService.findCatalogoById", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockProdutoDeEmpresa(billing: (typeof BILLING)[keyof typeof BILLING]) {
    prismaMock.produto.findFirst.mockResolvedValue({
      id: "produto-1",
      empresaId: "empresa-1",
      nome: "Produto Teste",
      empresa: { id: "empresa-1", ...billing },
    } as never);
  }

  it("filtra o tenant por empresa.deletedAt no próprio where (T-04-05)", async () => {
    mockProdutoDeEmpresa(BILLING.EM_DIA);

    await produtoService.findCatalogoById("produto-1");

    const args = vi.mocked(prismaMock.produto.findFirst).mock.calls[0][0];

    expect(args).toMatchObject({
      where: {
        id: "produto-1",
        ativo: true,
        visivelCatalogo: true,
        deletedAt: null,
        empresa: { deletedAt: null },
      },
    });
  });

  it("devolve null quando a empresa dona está BLOQUEADO", async () => {
    mockProdutoDeEmpresa(BILLING.BLOQUEADO);

    await expect(produtoService.findCatalogoById("produto-1")).resolves.toBeNull();
  });

  it("devolve null quando a empresa dona está CANCELADO (D-06: idêntico a BLOQUEADO)", async () => {
    mockProdutoDeEmpresa(BILLING.CANCELADO);

    await expect(produtoService.findCatalogoById("produto-1")).resolves.toBeNull();
  });

  it.each(["TRIAL", "EM_DIA", "CARENCIA", "VITALICIO"] as const)(
    "devolve o produto quando a empresa dona está %s",
    async (status) => {
      mockProdutoDeEmpresa(BILLING[status]);

      const resultado = await produtoService.findCatalogoById("produto-1");

      expect(resultado).not.toBeNull();
      expect(resultado).toMatchObject({ id: "produto-1", empresaId: "empresa-1" });
    }
  );

  it("não vaza a chave empresa no corpo público (T-04-01)", async () => {
    mockProdutoDeEmpresa(BILLING.EM_DIA);

    const resultado = await produtoService.findCatalogoById("produto-1");

    expect(resultado).not.toHaveProperty("empresa");
  });

  it("gasta exatamente uma query quando rejeita por bloqueio (T-04-02)", async () => {
    mockProdutoDeEmpresa(BILLING.BLOQUEADO);

    await produtoService.findCatalogoById("produto-1");

    expect(prismaMock.produto.findFirst).toHaveBeenCalledTimes(1);
  });

  it("gasta exatamente uma query quando o produto não existe", async () => {
    prismaMock.produto.findFirst.mockResolvedValue(null);

    await expect(produtoService.findCatalogoById("inexistente")).resolves.toBeNull();
    expect(prismaMock.produto.findFirst).toHaveBeenCalledTimes(1);
  });

  it("carrega os fatos de billing da empresa no MESMO findFirst", async () => {
    mockProdutoDeEmpresa(BILLING.EM_DIA);

    await produtoService.findCatalogoById("produto-1");

    const args = vi.mocked(prismaMock.produto.findFirst).mock.calls[0][0];

    expect(args?.select).toMatchObject({
      empresa: {
        select: {
          id: true,
          acessoAte: true,
          trialFim: true,
          canceladoEm: true,
          acessoVitalicio: true,
        },
      },
    });
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
