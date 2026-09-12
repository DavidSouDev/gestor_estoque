// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { Prisma } from "@prisma/client";

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    // Síncrono: `usuario.service.ts` chama `bcrypt.hashSync` UMA vez, no
    // carregamento do módulo, para computar o hash-fantasma do freio de
    // timing (ver `HASH_FANTASMA`).
    hashSync: vi.fn().mockReturnValue("hash-fantasma"),
    compare: vi.fn(),
  },
}));

const { usuarioService } = await import("./usuario.service");
const bcrypt = (await import("bcryptjs")).default;

beforeEach(() => {
  vi.mocked(bcrypt.hash).mockClear();
  vi.mocked(bcrypt.compare).mockClear();
});

const usuarioBase = {
  id: "usuario-1",
  nome: "Usuário Teste",
  email: "usuario@teste.com",
  senhaHash: "hashed-password",
  role: "ADMIN",
  ativo: true,
  empresaId: "empresa-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  empresa: {
    id: "empresa-1",
    nome: "Loja Teste",
    slug: "loja-teste",
  },
};

/**
 * Monta um P2002 na forma REAL de produção — a que o Postgres + `@prisma/adapter-pg`
 * produzem. Verificada por leitura do bundle instalado:
 * `@prisma/adapter-pg/dist/index.js:472-478` devolve
 * `{ kind: "UniqueConstraintViolation", constraint: { fields } }` como `.cause`
 * do `DriverAdapterError`, e `@prisma/query-plan-executor/dist/index.js:106181`
 * o embrulha em `meta: { driverAdapterError }`.
 *
 * A forma ANTIGA (`meta: { target }`), construída inline aqui até então, NÃO
 * chega mais nesse caminho — era por isso que estes testes ficavam verdes
 * enquanto a criação real caía na mensagem genérica de falha. A cobertura do
 * formato antigo mora em `lib/prisma-error.test.ts` (D-F); não duplicá-la aqui.
 *
 * `campos` chega SEM aspas — é o que os call sites querem afirmar via
 * `.includes("empresaId")` etc. — mas `constraint.fields` é montado AQUI com
 * cada campo aspeado, porque é isso que `adapter-pg/dist/index.js:473` extrai
 * do `detail` do Postgres, que sempre aspeia nomes de coluna
 * (`Key ("empresaId")=(...) already exists`). Sem essa aspa, o teste não
 * cobriria a remoção que `camposDaColisaoUnica` faz — a mesma lacuna que
 * escondeu o bug real (toda comparação `.includes(...)` falhando em produção).
 */
function makeP2002(campos: string[]) {
  const fieldsAspeados = campos.map((campo) => `"${campo}"`);
  const driverAdapterError = new Error(
    `Unique constraint failed on the fields: (\`${campos.join("`, `")}\`)`,
    { cause: { kind: "UniqueConstraintViolation", constraint: { fields: fieldsAspeados } } }
  );
  driverAdapterError.name = "DriverAdapterError";

  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed on the fields: (\`${campos.join("`, `")}\`)`,
    {
      code: "P2002",
      clientVersion: "7.9.1",
      meta: { modelName: "Usuario", driverAdapterError },
    }
  );
}

describe("usuarioService.list", () => {
  it("lista usuários da empresa ordenados por nome", async () => {
    prismaMock.usuario.findMany.mockResolvedValue([usuarioBase] as never);

    await usuarioService.list("empresa-1");

    expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { empresaId: "empresa-1" },
        orderBy: { nome: "asc" },
      })
    );
  });
});

describe("usuarioService.findById", () => {
  it("busca o usuário pelo id usando a projeção segura", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase as never);

    await usuarioService.findById("usuario-1");

    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "usuario-1" } })
    );
  });
});

describe("usuarioService.findByEmail", () => {
  it("busca o usuário pelo e-mail sem projeção (inclui senhaHash)", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase as never);

    await usuarioService.findByEmail("usuario@teste.com");

    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
      where: { email: "usuario@teste.com" },
    });
  });
});

describe("usuarioService.create", () => {
  it("lança erro quando a empresa já possui um administrador cadastrado", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ id: "usuario-existente" } as never);

    await expect(
      usuarioService.create({
        nome: "Novo usuário",
        email: "novo@teste.com",
        senha: "senha123",
        empresaId: "empresa-1",
      })
    ).rejects.toMatchObject({
      message: "Esta empresa já possui um administrador cadastrado.",
      status: 409,
    });

    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it("cria o usuário com a senha hasheada quando a empresa ainda não tem administrador", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    prismaMock.usuario.create.mockResolvedValue(usuarioBase as never);

    await usuarioService.create({
      nome: "Usuário Teste",
      email: "usuario@teste.com",
      senha: "senha123",
      empresaId: "empresa-1",
    });

    expect(bcrypt.hash).toHaveBeenCalledWith("senha123", 10);
    expect(prismaMock.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          nome: "Usuário Teste",
          email: "usuario@teste.com",
          senhaHash: "hashed-password",
          empresaId: "empresa-1",
        },
      })
    );
  });

  it("lança erro 409 quando a criação falha por violação de unicidade em empresaId", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    prismaMock.usuario.create.mockRejectedValue(makeP2002(["empresaId"]));

    await expect(
      usuarioService.create({
        nome: "Usuário Teste",
        email: "usuario@teste.com",
        senha: "senha123",
        empresaId: "empresa-1",
      })
    ).rejects.toMatchObject({
      message: "Esta empresa já possui um administrador cadastrado.",
      status: 409,
    });
  });

  it("lança erro 409 quando a criação falha por violação de unicidade em email", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    prismaMock.usuario.create.mockRejectedValue(makeP2002(["email"]));

    await expect(
      usuarioService.create({
        nome: "Usuário Teste",
        email: "usuario@teste.com",
        senha: "senha123",
        empresaId: "empresa-1",
      })
    ).rejects.toMatchObject({
      message: "Este email já está em uso.",
      status: 409,
    });
  });

  it("repropaga erros que não são de violação de unicidade (P2002)", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    const erroInesperado = new Error("Falha de conexão");
    prismaMock.usuario.create.mockRejectedValue(erroInesperado);

    await expect(
      usuarioService.create({
        nome: "Usuário Teste",
        email: "usuario@teste.com",
        senha: "senha123",
        empresaId: "empresa-1",
      })
    ).rejects.toThrow("Falha de conexão");
  });
});

describe("usuarioService.update", () => {
  it("atualiza apenas nome, email e ativo quando a senha não é informada", async () => {
    prismaMock.usuario.update.mockResolvedValue(usuarioBase as never);

    await usuarioService.update("usuario-1", { nome: "Novo nome", ativo: false });

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: "usuario-1" },
      data: { nome: "Novo nome", email: undefined, ativo: false },
      select: expect.any(Object),
    });
  });

  it("hasheia e inclui a nova senha quando a senha atual confere", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ senhaHash: "hash-antigo" } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    prismaMock.usuario.update.mockResolvedValue(usuarioBase as never);

    await usuarioService.update("usuario-1", {
      senha: "novaSenha123",
      senhaAtual: "senhaAntiga123",
    });

    expect(bcrypt.compare).toHaveBeenCalledWith("senhaAntiga123", "hash-antigo");
    expect(bcrypt.hash).toHaveBeenCalledWith("novaSenha123", 10);
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: "usuario-1" },
      data: { nome: undefined, email: undefined, ativo: undefined, senhaHash: "hashed-password" },
      select: expect.any(Object),
    });
  });

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * Sem esta checagem, um Bearer token/cookie vazado bastava para trocar a
   * senha da conta sem nunca precisar da senha antiga (sequestro silencioso).
   */
  it("recusa trocar a senha quando a senha atual não confere", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ senhaHash: "hash-antigo" } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      usuarioService.update("usuario-1", { senha: "novaSenha123", senhaAtual: "senha-errada" })
    ).rejects.toMatchObject({ message: "Senha atual incorreta.", status: 403 });

    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });

  it("recusa trocar a senha quando senhaAtual não é informada", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ senhaHash: "hash-antigo" } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      usuarioService.update("usuario-1", { senha: "novaSenha123" })
    ).rejects.toMatchObject({ message: "Senha atual incorreta.", status: 403 });

    expect(bcrypt.compare).toHaveBeenCalledWith("", "hash-antigo");
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });

  it("lança 404 ao trocar senha de um usuário que não existe mais", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);

    await expect(
      usuarioService.update("inexistente", { senha: "novaSenha123", senhaAtual: "qualquer" })
    ).rejects.toMatchObject({ message: "Usuário não encontrado.", status: 404 });

    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });

  it("não consulta o banco em busca da senha atual quando `senha` não está sendo trocada", async () => {
    prismaMock.usuario.update.mockResolvedValue(usuarioBase as never);

    await usuarioService.update("usuario-1", { nome: "Só o nome" });

    expect(prismaMock.usuario.findUnique).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });
});

describe("usuarioService.delete", () => {
  it("desativa o usuário (ativo=false) em vez de removê-lo", async () => {
    prismaMock.usuario.update.mockResolvedValue(usuarioBase as never);

    await usuarioService.delete("usuario-1");

    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: "usuario-1" },
      data: { ativo: false },
      select: expect.any(Object),
    });
  });
});

describe("usuarioService.validatePassword", () => {
  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * `bcrypt.compare` PRECISA rodar mesmo quando o usuário não existe — contra
   * `HASH_FANTASMA`, não contra o hash real. Um `bcrypt.compare` pulado aqui
   * reabre o canal lateral de tempo: a ausência da chamada (resposta quase
   * instantânea) distingue "email não cadastrado" de "email cadastrado, senha
   * errada" (que paga o custo do bcrypt), mesmo com a mensagem de erro sendo
   * idêntica nos dois casos.
   */
  it("retorna null quando o usuário não existe, mas ainda assim paga o custo do bcrypt (freio de timing)", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const resultado = await usuarioService.validatePassword("inexistente@teste.com", "senha123");

    expect(resultado).toBeNull();
    expect(bcrypt.compare).toHaveBeenCalledWith("senha123", "hash-fantasma");
  });

  it("retorna null quando a senha informada não confere com o hash", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const resultado = await usuarioService.validatePassword("usuario@teste.com", "senhaErrada");

    expect(bcrypt.compare).toHaveBeenCalledWith("senhaErrada", "hashed-password");
    expect(resultado).toBeNull();
  });

  it("retorna o usuário (com empresa) quando a senha confere", async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const resultado = await usuarioService.validatePassword("usuario@teste.com", "senha123");

    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith({
      where: { email: "usuario@teste.com" },
      include: { empresa: true },
    });
    expect(resultado).toEqual(usuarioBase);
  });

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * Email dedicado ("forca-bruta@...") e não reutilizado em nenhum outro teste
   * deste arquivo: o freio de `lib/login-rate-limit.ts` é um Map module-level,
   * e reaproveitar o email de outro `it` contaminaria a contagem de falhas.
   */
  it("lança 429 após 5 tentativas malsucedidas para o mesmo email, sem sequer consultar o banco na 6ª", async () => {
    const email = "forca-bruta@teste.com";
    prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    for (let i = 0; i < 5; i += 1) {
      expect(await usuarioService.validatePassword(email, "senha-errada")).toBeNull();
    }

    prismaMock.usuario.findUnique.mockClear();

    await expect(usuarioService.validatePassword(email, "senha-errada")).rejects.toMatchObject({
      message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
      status: 429,
    });
    expect(prismaMock.usuario.findUnique).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * Prova que o freio por IP pega "password spraying": 1 tentativa por email
   * DIFERENTE a cada vez, nunca acumulando as 5 falhas do freio por email,
   * mas todas do MESMO IP. IP dedicado, não reutilizado em nenhum outro teste.
   */
  it("lança 429 por IP após 20 tentativas com emails DIFERENTES do mesmo IP (password spraying)", async () => {
    const ip = "203.0.113.50";
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    for (let i = 0; i < 20; i += 1) {
      expect(
        await usuarioService.validatePassword(`spray-${i}@teste.com`, "123456", ip)
      ).toBeNull();
    }

    prismaMock.usuario.findUnique.mockClear();

    await expect(
      usuarioService.validatePassword("spray-mais-um@teste.com", "123456", ip)
    ).rejects.toMatchObject({
      message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
      status: 429,
    });
    expect(prismaMock.usuario.findUnique).not.toHaveBeenCalled();
  });
});
