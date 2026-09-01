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
  // Os 5 campos de billing existem na linha real da tabela desde a migration do
  // plano 02-01 — a fixture precisa refleti-los para continuar representando uma
  // Empresa de verdade.
  acessoAte: null,
  trialFim: new Date(Date.UTC(2026, 8, 15, 3)),
  canceladoEm: null,
  acessoVitalicio: false,
  ultimoStatusAuditado: "TRIAL",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

// 30/08/2026 09:00 em São Paulo. Escolhido como "meio do dia" para que o cálculo
// do trial não dependa de nenhuma borda.
const AGORA_MEIO_DIA = new Date("2026-08-30T12:00:00.000Z");

// Derivação (não usar `meiaNoiteEmSaoPaulo` aqui — seria circular):
// 30/08 é o dia 0 → +15 dias = 14/09 → meia-noite de America/Sao_Paulo (UTC-3)
// = 14/09 03:00 UTC.
const TRIAL_FIM_MEIO_DIA = new Date("2026-09-14T03:00:00.000Z");

// 01/10/2026 09:00 em São Paulo (UTC-3). Ao contrário de `avaliarAcesso`, os
// métodos publicáveis do service leem o relógio internamente (`new Date()`) —
// então a única forma de fixar o status é fixar o relógio, como os testes de
// `registerComUsuario` já fazem.
const AGORA_PUBLICACAO = new Date("2026-10-01T12:00:00.000Z");

/**
 * Executa `fn` com o relógio parado em `AGORA_PUBLICACAO`.
 *
 * Precisa ser `async` e dar `await` DENTRO do try: o `new Date()` do service
 * roda depois do primeiro `await` (a query), ou seja, num microtask posterior —
 * restaurar o relógio antes disso devolveria o tempo real para a decisão de
 * acesso e tornaria a suíte sensível à data em que ela roda.
 */
async function comRelogio<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA_PUBLICACAO);

  try {
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}

/**
 * Os 4 fatos de billing que produzem cada status em `AGORA_PUBLICACAO`.
 * Literais absolutos de propósito — derivá-los de `avaliarAcesso` tornaria o
 * teste do gate circular com a própria regra que ele deveria travar.
 *
 * CARENCIA: `acessoAte` venceu em 25/09, e a carência de 10 dias vai até
 * 05/10 — ainda no futuro em 01/10.
 * BLOQUEADO / CANCELADO: vencidos há anos, sem ambiguidade possível.
 */
const BILLING = {
  TRIAL: {
    acessoAte: null,
    trialFim: new Date("2026-10-15T03:00:00.000Z"),
    canceladoEm: null,
    acessoVitalicio: false,
  },
  EM_DIA: {
    acessoAte: new Date("2026-11-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  },
  CARENCIA: {
    acessoAte: new Date("2026-09-25T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  },
  VITALICIO: {
    acessoAte: new Date("2020-01-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: new Date("2020-02-01T03:00:00.000Z"),
    acessoVitalicio: true,
  },
  BLOQUEADO: {
    acessoAte: new Date("2020-01-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  },
  // D-06: rótulo distinto, comportamento idêntico ao de BLOQUEADO.
  CANCELADO: {
    acessoAte: new Date("2020-01-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: new Date("2020-02-01T03:00:00.000Z"),
    acessoVitalicio: false,
  },
} as const;

/** O que a projeção pública de `findBySlug` traz, sem os fatos de billing. */
const empresaPublicaBase = {
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
    // Fake timers porque `registerComUsuario` lê `new Date()` internamente (ao
    // contrário de `avaliarAcesso`, onde `agora` é parâmetro).
    vi.useFakeTimers();
    vi.setSystemTime(AGORA_MEIO_DIA);

    try {
      mockTransaction();
      prismaMock.empresa.findMany.mockResolvedValue([]);
      prismaMock.empresa.create.mockResolvedValue(empresaBase as never);
      prismaMock.usuario.create.mockResolvedValue(usuarioBase as never);
      prismaMock.auditoriaAcesso.create.mockResolvedValue({} as never);

      const resultado = await empresaService.registerComUsuario({
        nomeEmpresa: "Minha Loja",
        nomeResponsavel: "Responsável",
        email: "responsavel@teste.com",
        senha: "senha-plana",
        modoInterface: ModoInterface.COMPLETO,
      });

      expect(bcrypt.hash).toHaveBeenCalledWith("senha-plana", 10);

      // Asserção EXATA de propósito: é a rede que detecta campo inesperado
      // entrando no create da Empresa. Não relaxar para `objectContaining`.
      expect(prismaMock.empresa.create).toHaveBeenCalledWith({
        data: {
          nome: "Minha Loja",
          slug: "minha-loja",
          modoInterface: ModoInterface.COMPLETO,
          trialFim: TRIAL_FIM_MEIO_DIA,
          ultimoStatusAuditado: "TRIAL",
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
    } finally {
      vi.useRealTimers();
    }
  });

  it("grava o trial de 14 dias e a auditoria de REGISTRO na mesma transação", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA_MEIO_DIA);

    try {
      mockTransaction();
      prismaMock.empresa.findMany.mockResolvedValue([]);
      prismaMock.empresa.create.mockResolvedValue(empresaBase as never);
      prismaMock.usuario.create.mockResolvedValue(usuarioBase as never);
      prismaMock.auditoriaAcesso.create.mockResolvedValue({} as never);

      await empresaService.registerComUsuario({
        nomeEmpresa: "Minha Loja",
        nomeResponsavel: "Responsável",
        email: "responsavel@teste.com",
        senha: "senha-plana",
        modoInterface: ModoInterface.COMPLETO,
      });

      expect(prismaMock.empresa.create).toHaveBeenCalledWith({
        data: {
          nome: "Minha Loja",
          slug: "minha-loja",
          modoInterface: ModoInterface.COMPLETO,
          trialFim: TRIAL_FIM_MEIO_DIA,
          ultimoStatusAuditado: "TRIAL",
        },
      });

      // Exatamente 4 chaves (D-17): a linha de auditoria não carrega snapshot dos
      // fatos de billing. Asserção exata, não `objectContaining`.
      expect(prismaMock.auditoriaAcesso.create).toHaveBeenCalledWith({
        data: {
          empresaId: "empresa-1",
          statusAnterior: null,
          statusNovo: "TRIAL",
          causa: "REGISTRO",
        },
      });

      // A auditoria roda dentro do callback do $transaction — o mock de transação
      // repassa o próprio prismaMock como `tx`, então a única prova possível aqui
      // é que a escrita aconteceu na mesma passagem, sem uma segunda transação.
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dá 14 dias completos para quem se cadastra às 23:59 no horário de São Paulo", async () => {
    vi.useFakeTimers();
    // 2026-09-01T02:59:00Z = 31/08/2026 23:59 em São Paulo (UTC-3).
    vi.setSystemTime(new Date("2026-09-01T02:59:00.000Z"));

    try {
      mockTransaction();
      prismaMock.empresa.findMany.mockResolvedValue([]);
      prismaMock.empresa.create.mockResolvedValue(empresaBase as never);
      prismaMock.usuario.create.mockResolvedValue(usuarioBase as never);
      prismaMock.auditoriaAcesso.create.mockResolvedValue({} as never);

      await empresaService.registerComUsuario({
        nomeEmpresa: "Minha Loja",
        nomeResponsavel: "Responsável",
        email: "responsavel@teste.com",
        senha: "senha-plana",
        modoInterface: ModoInterface.COMPLETO,
      });

      // 31/08 é o dia 0 → +15 dias = 15/09 → meia-noite SP = 15/09 03:00 UTC.
      // Com `+14` o valor seria 14/09 03:00 UTC e o usuário receberia 13 dias e
      // um minuto — é exatamente esse erro que este caso trava (D-18).
      expect(prismaMock.empresa.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            trialFim: new Date("2026-09-15T03:00:00.000Z"),
          }),
        })
      );
    } finally {
      vi.useRealTimers();
    }
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

  it("não deixa linha de auditoria órfã quando a transação de registro aborta", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA_MEIO_DIA);

    try {
      mockTransaction();
      prismaMock.empresa.findMany.mockResolvedValue([]);
      prismaMock.empresa.create.mockResolvedValue(empresaBase as never);
      prismaMock.usuario.create.mockRejectedValue(makeP2002(["email"]));
      prismaMock.auditoriaAcesso.create.mockResolvedValue({} as never);

      // O tratamento de erro não regrediu com a mudança do trial: o HttpError
      // continua sendo o que o usuário vê.
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

      // BILL-05: a auditoria vem depois do usuário na mesma transação, então um
      // registro que aborta nunca chega a escrevê-la. No banco real, mesmo se
      // tivesse sido escrita, o rollback a levaria junto.
      expect(prismaMock.auditoriaAcesso.create).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
      // Os 4 fatos entram na projeção interna a partir do plano 04-01: é o que
      // permite decidir a publicação sem uma segunda query.
      ...BILLING.EM_DIA,
    } as never);
    prismaMock.produto.findMany.mockResolvedValue([{ id: "produto-1" }] as never);
    prismaMock.combo.findMany.mockResolvedValue([{ id: "combo-1" }] as never);
    prismaMock.promocao.findMany.mockResolvedValue([{ id: "promocao-1" }] as never);

    const resultado = await comRelogio(() => empresaService.findBySlug("minha-loja"));

    expect(prismaMock.produto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empresaId: "empresa-1" }) })
    );
    expect(prismaMock.combo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empresaId: "empresa-1" }) })
    );
    expect(prismaMock.promocao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empresaId: "empresa-1" }) })
    );

    // Asserção EXATA de propósito (T-04-01): o corpo de
    // `GET /api/empresas/slug/[slug]` é público, e os 4 fatos de billing que
    // agora vêm na projeção interna NÃO podem sair daqui.
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

  it("não expõe nenhum fato de billing no corpo público (T-04-01)", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(
      { ...empresaPublicaBase, ...BILLING.EM_DIA } as never
    );
    prismaMock.produto.findMany.mockResolvedValue([] as never);
    prismaMock.combo.findMany.mockResolvedValue([] as never);
    prismaMock.promocao.findMany.mockResolvedValue([] as never);

    const resultado = await comRelogio(() => empresaService.findBySlug("minha-loja"));

    expect(resultado).not.toHaveProperty("acessoAte");
    expect(resultado).not.toHaveProperty("trialFim");
    expect(resultado).not.toHaveProperty("canceladoEm");
    expect(resultado).not.toHaveProperty("acessoVitalicio");
  });

  it("devolve null para empresa bloqueada SEM disparar o fan-out do catálogo (ACC-03, T-04-02)", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      ...empresaPublicaBase,
      ...BILLING.BLOQUEADO,
    } as never);

    const resultado = await comRelogio(() => empresaService.findBySlug("bloqueada"));

    expect(resultado).toBeNull();
    // O gate mora ANTES do Promise.all: é isso que compra a paridade de custo
    // com "slug inexistente" e fecha o canal lateral de tempo.
    expect(prismaMock.produto.findMany).not.toHaveBeenCalled();
    expect(prismaMock.combo.findMany).not.toHaveBeenCalled();
    expect(prismaMock.promocao.findMany).not.toHaveBeenCalled();
    expect(prismaMock.empresa.findFirst).toHaveBeenCalledTimes(1);
  });

  it("devolve null para empresa cancelada, exatamente como para a bloqueada (D-06)", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      ...empresaPublicaBase,
      ...BILLING.CANCELADO,
    } as never);

    const resultado = await comRelogio(() => empresaService.findBySlug("cancelada"));

    expect(resultado).toBeNull();
    expect(prismaMock.produto.findMany).not.toHaveBeenCalled();
  });

  it("continua publicando o catálogo durante a carência (D-03)", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(
      { ...empresaPublicaBase, ...BILLING.CARENCIA } as never
    );
    prismaMock.produto.findMany.mockResolvedValue([] as never);
    prismaMock.combo.findMany.mockResolvedValue([] as never);
    prismaMock.promocao.findMany.mockResolvedValue([] as never);

    const resultado = await comRelogio(() => empresaService.findBySlug("em-carencia"));

    expect(resultado).not.toBeNull();
    expect(prismaMock.produto.findMany).toHaveBeenCalled();
  });
});

describe("empresaService.findPublicavelBySlug", () => {
  it("consulta por slug e deletedAt com a projeção publicável", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null);

    await comRelogio(() => empresaService.findPublicavelBySlug("minha-loja"));

    expect(prismaMock.empresa.findFirst).toHaveBeenCalledWith({
      where: { slug: "minha-loja", deletedAt: null },
      select: {
        id: true,
        acessoAte: true,
        trialFim: true,
        canceladoEm: true,
        acessoVitalicio: true,
      },
    });
  });

  it("devolve null para slug inexistente gastando exatamente 1 query", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null);

    const resultado = await comRelogio(() => empresaService.findPublicavelBySlug("inexistente"));

    expect(resultado).toBeNull();
    expect(prismaMock.empresa.findFirst).toHaveBeenCalledTimes(1);
  });

  it("devolve null para empresa bloqueada gastando exatamente a MESMA 1 query (T-04-02)", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      id: "empresa-1",
      ...BILLING.BLOQUEADO,
    } as never);

    const resultado = await comRelogio(() => empresaService.findPublicavelBySlug("bloqueada"));

    expect(resultado).toBeNull();
    // Paridade de tempo: "não existe" e "bloqueada" custam o mesmo round trip.
    expect(prismaMock.empresa.findFirst).toHaveBeenCalledTimes(1);
  });

  it("devolve null para empresa cancelada, indistinguível da bloqueada (D-06)", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      id: "empresa-1",
      ...BILLING.CANCELADO,
    } as never);

    const resultado = await comRelogio(() => empresaService.findPublicavelBySlug("cancelada"));

    expect(resultado).toBeNull();
    expect(prismaMock.empresa.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each(["TRIAL", "EM_DIA", "CARENCIA", "VITALICIO"] as const)(
    "devolve { id } para empresa em %s",
    async (situacao) => {
      prismaMock.empresa.findFirst.mockResolvedValue(
        { id: "empresa-1", ...BILLING[situacao] } as never
      );

      const resultado = await comRelogio(() => empresaService.findPublicavelBySlug("minha-loja"));

      // Asserção EXATA: nenhum fato de billing atravessa o funil.
      expect(resultado).toEqual({ id: "empresa-1" });
    }
  );
});

describe("empresaService.findPublicavelById", () => {
  it("consulta por id e deletedAt com a projeção publicável", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null);

    await comRelogio(() => empresaService.findPublicavelById("empresa-1"));

    expect(prismaMock.empresa.findFirst).toHaveBeenCalledWith({
      where: { id: "empresa-1", deletedAt: null },
      select: {
        id: true,
        acessoAte: true,
        trialFim: true,
        canceladoEm: true,
        acessoVitalicio: true,
      },
    });
  });

  it("devolve null para id inexistente gastando exatamente 1 query", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null);

    const resultado = await comRelogio(() => empresaService.findPublicavelById("nao-existe"));

    expect(resultado).toBeNull();
    expect(prismaMock.empresa.findFirst).toHaveBeenCalledTimes(1);
  });

  it("devolve null para empresa bloqueada gastando exatamente a MESMA 1 query (T-04-02)", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      id: "empresa-1",
      ...BILLING.BLOQUEADO,
    } as never);

    const resultado = await comRelogio(() => empresaService.findPublicavelById("empresa-1"));

    expect(resultado).toBeNull();
    expect(prismaMock.empresa.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each(["TRIAL", "EM_DIA", "CARENCIA", "VITALICIO"] as const)(
    "devolve { id } para empresa em %s",
    async (situacao) => {
      prismaMock.empresa.findFirst.mockResolvedValue(
        { id: "empresa-1", ...BILLING[situacao] } as never
      );

      const resultado = await comRelogio(() => empresaService.findPublicavelById("empresa-1"));

      expect(resultado).toEqual({ id: "empresa-1" });
    }
  );
});

describe("empresaService.findBrandingBySlug", () => {
  const brandingBase = {
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
  };

  it("seleciona os campos de branding MAIS os 4 fatos de billing numa só query", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null);

    await comRelogio(() => empresaService.findBrandingBySlug("minha-loja"));

    expect(prismaMock.empresa.findFirst).toHaveBeenCalledWith({
      where: { slug: "minha-loja", deletedAt: null },
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
        acessoAte: true,
        trialFim: true,
        canceladoEm: true,
        acessoVitalicio: true,
      },
    });
    expect(prismaMock.empresa.findFirst).toHaveBeenCalledTimes(1);
  });

  it("devolve null para slug inexistente", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(null);

    await expect(
      comRelogio(() => empresaService.findBrandingBySlug("inexistente"))
    ).resolves.toBeNull();
  });

  it("NÃO devolve null para empresa bloqueada: devolve o branding com bloqueada true (D-09)", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      ...brandingBase,
      ...BILLING.BLOQUEADO,
    } as never);

    const resultado = await comRelogio(() => empresaService.findBrandingBySlug("bloqueada"));

    // A tela de login de uma empresa bloqueada precisa continuar respondendo:
    // sem isso o cliente não consegue logar para pagar e o objetivo da fase se
    // inverte (04-RESEARCH.md, Achado crítico 2).
    expect(resultado).toEqual({ ...brandingBase, bloqueada: true });
  });

  it("marca bloqueada true também para empresa cancelada (D-06)", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      ...brandingBase,
      ...BILLING.CANCELADO,
    } as never);

    const resultado = await comRelogio(() => empresaService.findBrandingBySlug("cancelada"));

    expect(resultado).toMatchObject({ bloqueada: true });
  });

  it("devolve bloqueada false para empresa saudável", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(
      { ...brandingBase, ...BILLING.EM_DIA } as never
    );

    const resultado = await comRelogio(() => empresaService.findBrandingBySlug("minha-loja"));

    expect(resultado).toEqual({ ...brandingBase, bloqueada: false });
  });

  it("devolve bloqueada false durante a carência (D-03)", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(
      { ...brandingBase, ...BILLING.CARENCIA } as never
    );

    const resultado = await comRelogio(() => empresaService.findBrandingBySlug("em-carencia"));

    expect(resultado).toMatchObject({ bloqueada: false });
  });

  it("não devolve os fatos de billing crus para o cliente (T-04-01)", async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      ...brandingBase,
      ...BILLING.BLOQUEADO,
    } as never);

    const resultado = await comRelogio(() => empresaService.findBrandingBySlug("bloqueada"));

    expect(resultado).not.toHaveProperty("acessoAte");
    expect(resultado).not.toHaveProperty("trialFim");
    expect(resultado).not.toHaveProperty("canceladoEm");
    expect(resultado).not.toHaveProperty("acessoVitalicio");
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
  it("cria a empresa com os dados informados e os fatos de billing de trial (CR-01)", async () => {
    // Fake timers porque `create` lê `new Date()` internamente, igual a
    // `registerComUsuario`.
    vi.useFakeTimers();
    vi.setSystemTime(AGORA_MEIO_DIA);

    try {
      mockTransaction();
      prismaMock.empresa.create.mockResolvedValue(empresaBase as never);
      prismaMock.auditoriaAcesso.create.mockResolvedValue({} as never);

      await empresaService.create({
        nome: "Minha Loja",
        slug: "minha-loja",
      });

      // Asserção EXATA de propósito (WR-03): é a rede que teria detectado CR-01
      // (trialFim/ultimoStatusAuditado ausentes) antes de chegar em produção.
      // Não relaxar para `objectContaining`.
      expect(prismaMock.empresa.create).toHaveBeenCalledWith({
        data: {
          nome: "Minha Loja",
          slug: "minha-loja",

          logo: undefined,
          banner: undefined,
          descricao: undefined,

          telefone: undefined,
          instagram: undefined,

          primaryColor: undefined,
          accentColor: undefined,

          trialFim: TRIAL_FIM_MEIO_DIA,
          ultimoStatusAuditado: "TRIAL",
        },
      });

      // Mesma trilha de auditoria de BILL-05 que `registerComUsuario` grava,
      // na mesma transação da criação da Empresa.
      expect(prismaMock.auditoriaAcesso.create).toHaveBeenCalledWith({
        data: {
          empresaId: empresaBase.id,
          statusAnterior: null,
          statusNovo: "TRIAL",
          causa: "REGISTRO",
        },
      });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("repassa os campos opcionais informados", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA_MEIO_DIA);

    try {
      mockTransaction();
      prismaMock.empresa.create.mockResolvedValue(empresaBase as never);
      prismaMock.auditoriaAcesso.create.mockResolvedValue({} as never);

      await empresaService.create({
        nome: "Minha Loja",
        slug: "minha-loja",
        logo: "logos/logo.png",
        banner: "banners/banner.png",
        descricao: "Descrição da loja",
        telefone: "11999999999",
        instagram: "@minhaloja",
        primaryColor: "#18181b",
        accentColor: "#f59e0b",
      });

      expect(prismaMock.empresa.create).toHaveBeenCalledWith({
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

          trialFim: TRIAL_FIM_MEIO_DIA,
          ultimoStatusAuditado: "TRIAL",
        },
      });
    } finally {
      vi.useRealTimers();
    }
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
