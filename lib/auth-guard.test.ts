// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/tests/setup/prisma-mock";
import { acessoService } from "@/app/services/acesso.service";
import { revalidarConta } from "./auth-guard";

vi.mock("@/app/services/acesso.service", () => ({
  acessoService: { registrarTransicao: vi.fn() },
}));

const registrarTransicao = vi.mocked(acessoService.registrarTransicao);

beforeEach(() => {
  registrarTransicao.mockReset();
  registrarTransicao.mockResolvedValue(null);
});

/** Deixa a fila de microtasks drenar: o efeito agendado roda fora do `await`. */
const drenarEfeitos = () => new Promise((resolve) => setTimeout(resolve, 0));

const TRIAL_FUTURO = new Date("2099-01-01T03:00:00.000Z");

const contaAtiva = {
  id: "user-1",
  email: "admin@teste.com",
  role: "ADMIN",
  empresaId: "empresa-1",
  empresa: {
    slug: "empresa-teste",
    acessoAte: null,
    trialFim: TRIAL_FUTURO,
    canceladoEm: null,
    acessoVitalicio: false,
    ultimoStatusAuditado: "TRIAL",
  },
};

describe("revalidarConta", () => {
  it("devolve a conta quando o usuário está ativo e a empresa não foi removida", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await expect(revalidarConta("user-1", "empresa-1")).resolves.toEqual({
      usuarioId: "user-1",
      empresaId: "empresa-1",
      empresaSlug: "empresa-teste",
      email: "admin@teste.com",
      role: "ADMIN",
      statusAcesso: "TRIAL",
      acessoExpiraEm: TRIAL_FUTURO,
      carenciaAte: null,
    });
  });

  it("filtra por id, empresaId, ativo e empresa.deletedAt na query", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await revalidarConta("user-1", "empresa-1");

    expect(prismaMock.usuario.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "user-1",
          empresaId: "empresa-1",
          ativo: true,
          empresa: { deletedAt: null },
        },
      })
    );
  });

  it("devolve null quando o banco não encontra conta ativa", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);

    await expect(revalidarConta("user-1", "empresa-1")).resolves.toBeNull();
  });

  it("devolve null (fail-closed) e loga quando a query lança", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.usuario.findFirst.mockRejectedValue(
      new Error("connection timeout") as never
    );

    await expect(revalidarConta("user-1", "empresa-1")).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("nunca seleciona senhaHash", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await revalidarConta("user-1", "empresa-1");

    const [args] = prismaMock.usuario.findFirst.mock.calls[0] as [
      { select: Record<string, unknown> },
    ];
    expect(args.select).not.toHaveProperty("senhaHash");
  });

  it("seleciona os 6 campos de empresa exigidos pela avaliação de acesso", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await revalidarConta("user-1", "empresa-1");

    // Sem esta asserção, remover um campo do `select` faria a avaliação receber
    // `undefined` silenciosamente em vez de falhar.
    const [args] = prismaMock.usuario.findFirst.mock.calls[0] as [
      { select: { empresa: { select: Record<string, unknown> } } },
    ];
    expect(Object.keys(args.select.empresa.select).sort()).toEqual([
      "acessoAte",
      "acessoVitalicio",
      "canceladoEm",
      "slug",
      "trialFim",
      "ultimoStatusAuditado",
    ]);
  });

  it("deriva o status dos fatos, nunca do status já auditado", async () => {
    // BILL-01 / BILL-04: marcar a coluna direto no banco basta — o bookkeeping
    // do compare-and-swap diz "BLOQUEADO", e ainda assim o fato manda.
    prismaMock.usuario.findFirst.mockResolvedValue({
      ...contaAtiva,
      empresa: {
        ...contaAtiva.empresa,
        trialFim: null,
        acessoVitalicio: true,
        ultimoStatusAuditado: "BLOQUEADO",
      },
    } as never);

    const conta = await revalidarConta("user-1", "empresa-1");

    expect(conta?.statusAcesso).toBe("VITALICIO");
  });

  it("não agenda auditoria quando o status não mudou", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await revalidarConta("user-1", "empresa-1");
    await drenarEfeitos();

    expect(registrarTransicao).not.toHaveBeenCalled();
  });

  it("agenda uma única auditoria AVALIACAO_SESSAO quando o status muda", async () => {
    // Trial vencido em 2020: a carência de 10 dias está muito vencida, então a
    // avaliação dá BLOQUEADO contra um `ultimoStatusAuditado` de TRIAL.
    prismaMock.usuario.findFirst.mockResolvedValue({
      ...contaAtiva,
      empresa: {
        ...contaAtiva.empresa,
        trialFim: new Date("2020-01-01T03:00:00.000Z"),
      },
    } as never);

    await revalidarConta("user-1", "empresa-1");
    await drenarEfeitos();

    // A chamada é observável aqui porque, fora de escopo de request do Next,
    // `agendarPosResposta` degrada para execução inline (plano 02-04). O
    // comportamento real de `after()` dentro de um render é verificado pelo
    // `<human-check>` deste mesmo plano, colhido em UAT ao fim da fase.
    expect(registrarTransicao).toHaveBeenCalledTimes(1);
    expect(registrarTransicao).toHaveBeenCalledWith({
      empresaId: "empresa-1",
      anterior: "TRIAL",
      novo: "BLOQUEADO",
      causa: "AVALIACAO_SESSAO",
    });
  });

  it("não derruba o request quando a auditoria falha", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    registrarTransicao.mockRejectedValue(new Error("deadlock"));
    prismaMock.usuario.findFirst.mockResolvedValue({
      ...contaAtiva,
      empresa: {
        ...contaAtiva.empresa,
        trialFim: new Date("2020-01-01T03:00:00.000Z"),
      },
    } as never);

    const conta = await revalidarConta("user-1", "empresa-1");
    await drenarEfeitos();

    expect(conta).not.toBeNull();
    expect(conta?.statusAcesso).toBe("BLOQUEADO");
    expect(consoleError.mock.calls[0][0]).toMatch(/^\[acesso\]/);

    consoleError.mockRestore();
  });
});
