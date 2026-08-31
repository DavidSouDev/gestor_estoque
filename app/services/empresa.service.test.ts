// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { Prisma, ModoInterface } from "@prisma/client";

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (senha: string) => `hashed:${senha}`),
    compare: vi.fn(async () => true),
  },
}));

import bcrypt from "bcryptjs";
import { empresaService, type UpdateEmpresaDTO } from "./empresa.service";

const empresaBase = {
  id: "empresa-1",
  nome: "Minha Loja",
  slug: "minha-loja",
  logo: null,
  banner: null,
  descricao: null,
  telefone: null,
  instagram: null,
  primaryColor: "#18181b",
  accentColor: "#f59e0b",
  modoInterface: ModoInterface.COMPLETO,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const usuarioBase = {
  id: "usuario-1",
  nome: "Responsável",
  email: "responsavel@teste.com",
  senhaHash: "hashed:senha-plana",
  role: "ADMIN",
  ativo: true,
  empresaId: "empresa-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockTransaction() {
  prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) =>
      Promise.resolve(callback(prismaMock))
    );
}

function makeP2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "0.0.0",
    meta: { target },
  });
}

beforeEach(() => {
  vi.mocked(bcrypt.hash).mockClear();
});

describe("empresaService.registerComUsuario", () => {
  it("gera um slug único a partir do nome da empresa, hasheia a senha e cria empresa+usuário em transação", async () => {
    mockTransaction();
    prismaMock.empresa.findMany.mockResolvedValue([]);
    prismaMock.empresa.create.mockResolvedValue(empresaBase as never);
    prismaMock.usuario.create.mockResolvedValue(usuarioBase as never);

    const resultado = await empresaService.registerComUsuario({
      nomeEmpresa: "Minha Loja",
      nomeResponsavel: "Responsável",
      email: "responsavel@teste.com",
      senha: "senha-plana",
      modoInterface: ModoInterface.COMPLETO,
    });

    expect(bcrypt.hash).toHaveBeenCalledWith("senha-plana", 10);

    expect(prismaMock.empresa.create).toHaveBeenCalledWith({
      data: {
        nome: "Minha Loja",
        slug: "minha-loja",
        modoInterface: ModoInterface.COMPLETO,
      },
    });

    expect(prismaMock.usuario.create).toHaveBeenCalledWith({
      data: {
        nome: "Responsável",
        email: "responsavel@teste.com",
        senhaHash: "hashed:senha-plana",
        empresaId: empresaBase.id,
      },
    });

    expect(resultado).toEqual({ empresa: empresaBase, usuario: usuarioBase });
  });

  it("adiciona sufixo ao slug quando já existe um slug igual", async () => {
    mockTransaction();
    prismaMock.empresa.findMany.mockResolvedValue([{ slug: "minha-loja" }] as never);
    prismaMock.empresa.create.mockResolvedValue({ ...empresaBase, slug: "minha-loja-2" } as never);
    prismaMock.usuario.create.mockResolvedValue(usuarioBase as never);

    await empresaService.registerComUsuario({
      nomeEmpresa: "Minha Loja",
      nomeResponsavel: "Responsável",
      email: "responsavel@teste.com",
      senha: "senha-plana",
      modoInterface: ModoInterface.COMPLETO,
    });

    expect(prismaMock.empresa.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "minha-loja-2" }) })
    );
  });

  it("converte violação de unicidade de email em HttpError 409", async () => {
    mockTransaction();
    prismaMock.empresa.findMany.mockResolvedValue([]);
    prismaMock.empresa.create.mockResolvedValue(empresaBase as never);
    prismaMock.usuario.create.mockRejectedValue(makeP2002(["email"]));

    await expect(
      empresaService.registerComUsuario({
        nomeEmpresa: "Minha Loja",
        nomeResponsavel: "Responsável",
        email: "responsavel@teste.com",
        senha: "senha-plana",
        modoInterface: ModoInterface.COMPLETO,
      })
    ).rejects.toMatchObject({
      message: "Este email já está em uso.",
      status: 409,
    });
  });

  it("converte violação de unicidade de slug em HttpError 409", async () => {
    mockTransaction();
    prismaMock.empresa.findMany.mockResolvedValue([]);
    prismaMock.empresa.create.mockRejectedValue(makeP2002(["slug"]));

    await expect(
      empresaService.registerComUsuario({
        nomeEmpresa: "Minha Loja",
        nomeResponsavel: "Responsável",
        email: "responsavel@teste.com",
        senha: "senha-plana",
        modoInterface: ModoInterface.COMPLETO,
      })
    ).rejects.toMatchObject({
      message: "Não foi possível gerar um identificador único para a empresa. Tente novamente.",
      status: 409,
    });
  });

  it("repropaga erros que não são violação de unicidade conhecida", async () => {
    mockTransaction();
    prismaMock.empresa.findMany.mockResolvedValue([]);
    prismaMock.empresa.create.mockRejectedValue(new Error("Falha de conexão"));

    await expect(
      empresaService.registerComUsuario({
        nomeEmpresa: "Minha Loja",
        nomeResponsavel: "Responsável",
        email: "responsavel@teste.com",
        senha: "senha-plana",
        modoInterface: ModoInterface.COMPLETO,
      })
    ).rejects.toThrow("Falha de conexão");
  });
});

describe("empresaService.list", () => {
  it("lista apenas empresas não deletadas, ordenadas por nome", async () => {
    prismaMock.empresa.findMany.mockResolvedValue([empresaBase] as never);

    await empresaService.list();

    expect(prismaMock.empresa.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { nome: "asc" },
    });
  });
});

describe("empresaService.findById", () => {
  it("busca a empresa não deletada com usuários, produtos, combos e promoções", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(empresaBase as never);

    await empresaService.findById("empresa-1");

    expect(prismaMock.empresa.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "empresa-1", deletedAt: null } })
    );
  });
});

describe("empresaService.findBySlug", () => {
  it("retorna null quando a empresa não é encontrada, sem consultar catálogo", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null);

    const resultado = await empresaService.findBySlug("inexistente");

    expect(resultado).toBeNull();
    expect(prismaMock.produto.findMany).not.toHaveBeenCalled();
    expect(prismaMock.combo.findMany).not.toHaveBeenCalled();
    expect(prismaMock.promocao.findMany).not.toHaveBeenCalled();
  });

  it("combina os dados públicos da empresa com produtos, combos e promoções vigentes escopados por empresa", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      id: "empresa-1",
      nome: "Minha Loja",
      slug: "minha-loja",
      logo: null,
      banner: null,
      descricao: null,
      telefone: null,
      instagram: null,
      primaryColor: "#18181b",
      accentColor: "#f59e0b",
    } as never);
    prismaMock.produto.findMany.mockResolvedValue([{ id: "produto-1" }] as never);
    prismaMock.combo.findMany.mockResolvedValue([{ id: "combo-1" }] as never);
    prismaMock.promocao.findMany.mockResolvedValue([{ id: "promocao-1" }] as never);

    const resultado = await empresaService.findBySlug("minha-loja");

    expect(prismaMock.produto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empresaId: "empresa-1" }) })
    );
    expect(prismaMock.combo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empresaId: "empresa-1" }) })
    );
    expect(prismaMock.promocao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empresaId: "empresa-1" }) })
    );

    expect(resultado).toEqual({
      id: "empresa-1",
      nome: "Minha Loja",
      slug: "minha-loja",
      logo: null,
      banner: null,
      descricao: null,
      telefone: null,
      instagram: null,
      primaryColor: "#18181b",
      accentColor: "#f59e0b",
      produtos: [{ id: "produto-1" }],
      combos: [{ id: "combo-1" }],
      promocoes: [{ id: "promocao-1" }],
    });
  });
});

describe("empresaService.findHeaderData", () => {
  it("seleciona apenas os campos de cabeçalho da empresa não deletada", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(empresaBase as never);

    await empresaService.findHeaderData("empresa-1");

    expect(prismaMock.empresa.findFirst).toHaveBeenCalledWith({
      where: { id: "empresa-1", deletedAt: null },
      select: {
        id: true,
        nome: true,
        slug: true,
        logo: true,
        primaryColor: true,
        accentColor: true,
        modoInterface: true,
      },
    });
  });
});

describe("empresaService.findBranding", () => {
  it("seleciona os campos de identidade visual da empresa não deletada", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(empresaBase as never);

    await empresaService.findBranding("empresa-1");

    expect(prismaMock.empresa.findFirst).toHaveBeenCalledWith({
      where: { id: "empresa-1", deletedAt: null },
      select: {
        id: true,
        nome: true,
        slug: true,
        logo: true,
        banner: true,
        descricao: true,
        telefone: true,
        instagram: true,
        primaryColor: true,
        accentColor: true,
        modoInterface: true,
      },
    });
  });
});

describe("empresaService.resolveIdBySlug", () => {
  it("retorna o id quando a empresa existe", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({ id: "empresa-1" } as never);

    await expect(empresaService.resolveIdBySlug("minha-loja")).resolves.toBe("empresa-1");
  });

  it("retorna null quando a empresa não existe", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null);

    await expect(empresaService.resolveIdBySlug("inexistente")).resolves.toBeNull();
  });
});

describe("empresaService.create", () => {
  it("cria a empresa com os dados informados", async () => {
    prismaMock.empresa.create.mockResolvedValue(empresaBase as never);

    await empresaService.create({
      nome: "Minha Loja",
      slug: "minha-loja",
    });

    expect(prismaMock.empresa.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nome: "Minha Loja",
        slug: "minha-loja",
      }),
    });
  });
});

describe("empresaService.update", () => {
  it("repassa os dados informados para o prisma", async () => {
    prismaMock.empresa.update.mockResolvedValue(empresaBase as never);

    await empresaService.update("empresa-1", { nome: "Novo Nome" });

    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      data: { nome: "Novo Nome" },
    });
  });

  it("não aceita campos de billing no payload", async () => {
    prismaMock.empresa.update.mockResolvedValue(empresaBase as never);

    // O cast duplo é proposital: esses campos não existem em UpdateEmpresaDTO, e é exatamente
    // por isso que o TypeScript não é defesa suficiente — o body de PATCH /api/empresas/[id]
    // vem de request.json() e nunca passou pelo compilador.
    await empresaService.update("empresa-1", {
      nome: "Loja",
      acessoVitalicio: true,
      acessoAte: new Date(Date.UTC(2030, 0, 1, 3, 0, 0)),
      trialFim: new Date(Date.UTC(2030, 0, 16, 3, 0, 0)),
      canceladoEm: new Date(Date.UTC(2030, 0, 20, 3, 0, 0)),
      ultimoStatusAuditado: "VITALICIO",
    } as unknown as UpdateEmpresaDTO);

    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      data: { nome: "Loja" },
    });

    const dataRecebido = prismaMock.empresa.update.mock.calls[0][0].data;

    expect(dataRecebido).not.toHaveProperty("acessoVitalicio");
    expect(dataRecebido).not.toHaveProperty("acessoAte");
    expect(dataRecebido).not.toHaveProperty("trialFim");
    expect(dataRecebido).not.toHaveProperty("canceladoEm");
    expect(dataRecebido).not.toHaveProperty("ultimoStatusAuditado");
  });

  it("repassa os 10 campos legítimos quando todos são informados", async () => {
    prismaMock.empresa.update.mockResolvedValue(empresaBase as never);

    await empresaService.update("empresa-1", {
      nome: "Minha Loja",
      slug: "minha-loja",
      logo: "logos/logo.png",
      banner: "banners/banner.png",
      descricao: "Descrição da loja",
      telefone: "11999999999",
      instagram: "@minhaloja",
      primaryColor: "#18181b",
      accentColor: "#f59e0b",
      modoInterface: ModoInterface.SIMPLES,
    });

    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      data: {
        nome: "Minha Loja",
        slug: "minha-loja",
        logo: "logos/logo.png",
        banner: "banners/banner.png",
        descricao: "Descrição da loja",
        telefone: "11999999999",
        instagram: "@minhaloja",
        primaryColor: "#18181b",
        accentColor: "#f59e0b",
        modoInterface: ModoInterface.SIMPLES,
      },
    });
  });
});

describe("empresaService.delete", () => {
  it("faz soft delete preenchendo deletedAt", async () => {
    prismaMock.empresa.update.mockResolvedValue(empresaBase as never);

    await empresaService.delete("empresa-1");

    expect(prismaMock.empresa.update).toHaveBeenCalledWith({
      where: { id: "empresa-1" },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
