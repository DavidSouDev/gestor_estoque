// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prismaMock } from "@/tests/setup/prisma-mock";
import { termoService } from "./termo.service";

const termoCriado = {
  id: "termo-4",
  versao: 4,
  publicadoEm: new Date("2026-06-01T03:00:00.000Z"),
};

function makeP2002(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "0.0.0",
    meta: { target },
  });
}

/**
 * `registrarAceite` usa transação interativa: o mock precisa executar o callback
 * entregando o próprio `prismaMock` como `tx`, senão nenhuma das duas escritas
 * chega aos spies.
 */
function mockTransaction() {
  prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) =>
    Promise.resolve(callback(prismaMock))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("termoService.publicar", () => {
  it("num banco cuja maior versao e 3, cria a versao 4", async () => {
    prismaMock.termoDeUso.findFirst.mockResolvedValue({ versao: 3 } as never);
    prismaMock.termoDeUso.create.mockResolvedValue(termoCriado as never);

    await termoService.publicar({ conteudo: "Texto da v4.", publicadoPorId: "user-1" });

    expect(prismaMock.termoDeUso.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { versao: 4, conteudo: "Texto da v4.", publicadoPorId: "user-1" },
      })
    );
  });

  it("num banco vazio, cria a versao 1", async () => {
    prismaMock.termoDeUso.findFirst.mockResolvedValue(null as never);
    prismaMock.termoDeUso.create.mockResolvedValue({ ...termoCriado, versao: 1 } as never);

    await termoService.publicar({ conteudo: "Texto da v1.", publicadoPorId: "user-1" });

    const [args] = prismaMock.termoDeUso.create.mock.calls.at(-1) as [
      { data: { versao: number } },
    ];
    expect(args.data.versao).toBe(1);
  });

  it("le o maximo de versao com orderBy desc, projetando so a versao", async () => {
    prismaMock.termoDeUso.findFirst.mockResolvedValue({ versao: 3 } as never);
    prismaMock.termoDeUso.create.mockResolvedValue(termoCriado as never);

    await termoService.publicar({ conteudo: "Texto da v4.", publicadoPorId: "user-1" });

    // A leitura existe só para PROPOR o próximo número — por isso projeta um
    // único campo. Quem arbitra o empate é `versao @unique` no Postgres.
    expect(prismaMock.termoDeUso.findFirst).toHaveBeenCalledWith({
      orderBy: { versao: "desc" },
      select: { versao: true },
    });
  });

  it("P2002 no create vira HttpError com status 409", async () => {
    prismaMock.termoDeUso.findFirst.mockResolvedValue({ versao: 3 } as never);
    prismaMock.termoDeUso.create.mockRejectedValue(makeP2002(["versao"]) as never);

    // Afirmar o `status`, e não só a mensagem: é o `status` que os 29 handlers de
    // `app/api` propagam para o cliente. Uma mensagem certa com status ausente
    // viraria 500 na resposta.
    await expect(
      termoService.publicar({ conteudo: "Texto da v4.", publicadoPorId: "user-1" })
    ).rejects.toMatchObject({
      status: 409,
      message: "Outra publicacao ocorreu em paralelo. Tente novamente.",
    });
  });

  it("erro que nao e P2002 sai igual, sem virar 409 nem 500", async () => {
    prismaMock.termoDeUso.findFirst.mockResolvedValue({ versao: 3 } as never);
    const falhaDeConexao = new Error("Connection terminated unexpectedly");
    prismaMock.termoDeUso.create.mockRejectedValue(falhaDeConexao as never);

    await expect(
      termoService.publicar({ conteudo: "Texto da v4.", publicadoPorId: "user-1" })
    ).rejects.toBe(falhaDeConexao);
  });

  it("a projecao do retorno NAO contem conteudo", async () => {
    prismaMock.termoDeUso.findFirst.mockResolvedValue({ versao: 3 } as never);
    prismaMock.termoDeUso.create.mockResolvedValue(termoCriado as never);

    const publicado = await termoService.publicar({
      conteudo: "Texto da v4.",
      publicadoPorId: "user-1",
    });

    const [args] = prismaMock.termoDeUso.create.mock.calls.at(-1) as [
      { select: Record<string, boolean> },
    ];
    // Um 201 que devolvesse o texto inteiro do documento encheria a resposta à
    // toa — quem publicou acabou de enviar esse mesmo texto.
    expect(args.select).toEqual({ id: true, versao: true, publicadoEm: true });
    expect(args.select).not.toHaveProperty("conteudo");
    expect(publicado).toEqual(termoCriado);
  });
});

describe("termoService.registrarAceite", () => {
  it("grava o fato e o bookkeeping na MESMA transacao", async () => {
    mockTransaction();
    prismaMock.aceiteTermo.create.mockResolvedValue({ id: "aceite-1" } as never);
    prismaMock.usuario.update.mockResolvedValue({ id: "user-1" } as never);

    await termoService.registrarAceite("user-1", "termo-4");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.aceiteTermo.create).toHaveBeenCalledWith({
      data: { usuarioId: "user-1", termoId: "termo-4" },
    });
    expect(prismaMock.usuario.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { termoAceitoId: "termo-4" },
    });
  });

  it("o fato e criado ANTES do bookkeeping", async () => {
    mockTransaction();
    prismaMock.aceiteTermo.create.mockResolvedValue({ id: "aceite-1" } as never);
    prismaMock.usuario.update.mockResolvedValue({ id: "user-1" } as never);

    await termoService.registrarAceite("user-1", "termo-4");

    // A ordem importa: o bookkeeping é derivado do fato, nunca o contrário. Um
    // rollback entre as duas escritas não pode deixar `Usuario.termoAceitoId`
    // apontando para uma versão sem `AceiteTermo` correspondente.
    const ordemDoFato = prismaMock.aceiteTermo.create.mock.invocationCallOrder[0];
    const ordemDoBookkeeping = prismaMock.usuario.update.mock.invocationCallOrder[0];
    expect(ordemDoFato).toBeLessThan(ordemDoBookkeeping);
  });

  it("idempotente: P2002 RESOLVE em vez de rejeitar", async () => {
    prismaMock.$transaction.mockRejectedValue(makeP2002(["usuarioId", "termoId"]) as never);

    // Duplo clique, retry de rede e reenvio de formulário colidem na constraint
    // `@@unique([usuarioId, termoId])`. O estado desejado já está no banco, então
    // o desfecho correto é retorno silencioso — não um 500 na cara de quem
    // acabou de fazer exatamente o que foi pedido.
    await expect(termoService.registrarAceite("user-1", "termo-4")).resolves.toBeUndefined();
  });

  it("erro generico dentro da transacao e propagado", async () => {
    const falhaDeDeadlock = new Error("deadlock detected");
    prismaMock.$transaction.mockRejectedValue(falhaDeDeadlock as never);

    await expect(termoService.registrarAceite("user-1", "termo-4")).rejects.toBe(falhaDeDeadlock);
  });
});

describe("superficie do termoService (TERM-03)", () => {
  it("nao expoe nenhum metodo de atualizacao ou remocao de termo", () => {
    // Esta asserção é a metade "em teste" do contrato de TERM-03: publicar é
    // INSERT, sempre, e a ausência de caminho de escrita sobre uma versão já
    // publicada é o contrato, não um esquecimento.
    //
    // A metade "em grep" mora em `npm run gates:fase-06` (plano 06-08). As duas
    // existem porque cobrem falhas diferentes: este teste pega o MÉTODO que
    // alguém adicionar ao service, e o grep pega a CHAMADA CRUA a
    // `prisma.termoDeUso.update` escrita fora de qualquer método (num handler,
    // numa Server Action, num script).
    const superficie = termoService as unknown as Record<string, unknown>;

    expect(superficie.atualizar).toBeUndefined();
    expect(superficie.editar).toBeUndefined();
    expect(superficie.update).toBeUndefined();
    expect(superficie.remover).toBeUndefined();
    expect(superficie.delete).toBeUndefined();
    expect(superficie.arquivar).toBeUndefined();

    // Não-vacuidade: os dois métodos que DEVEM existir existem, então as
    // asserções acima não estão passando por o objeto estar vazio.
    expect(typeof superficie.publicar).toBe("function");
    expect(typeof superficie.registrarAceite).toBe("function");
  });
});
