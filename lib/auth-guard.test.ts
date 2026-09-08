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

/**
 * O termo publicado que o stub global de `tests/setup/prisma-mock.ts` devolve.
 * Repetido aqui como constante para que os casos de termos comparem contra o
 * MESMO `id` sem depender de o leitor abrir o arquivo de setup.
 */
const TERMO_VIGENTE = {
  id: "termo-1",
  versao: 1,
  conteudo: "Termos de teste.",
  publicadoEm: new Date("2026-01-01T03:00:00.000Z"),
};

const contaAtiva = {
  id: "user-1",
  email: "admin@teste.com",
  role: "ADMIN",
  // Combinação NEUTRA de termos (plano 06-01): o ponteiro de último aceite da
  // conta é o MESMO `id` do vigente, então `termosPendentes` é `false` e os
  // casos que não são sobre termos continuam medindo só o que mediam antes.
  termoAceitoId: TERMO_VIGENTE.id,
  empresaId: "empresa-1",
  updatedAt: new Date("2020-01-01T00:00:00.000Z"),
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
      termosPendentes: false,
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

describe("revalidarConta — invalidação de sessão por troca de conta", () => {
  const AGORA_SEGUNDOS = Math.floor(Date.now() / 1000);

  it("aceita quando o token foi emitido DEPOIS da última alteração na conta", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue({
      ...contaAtiva,
      updatedAt: new Date((AGORA_SEGUNDOS - 3600) * 1000),
    } as never);

    const conta = await revalidarConta("user-1", "empresa-1", AGORA_SEGUNDOS);

    expect(conta).not.toBeNull();
  });

  it("recusa (fail-closed) quando o token foi emitido ANTES da última alteração na conta", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue({
      ...contaAtiva,
      updatedAt: new Date((AGORA_SEGUNDOS + 3600) * 1000),
    } as never);

    const conta = await revalidarConta("user-1", "empresa-1", AGORA_SEGUNDOS);

    expect(conta).toBeNull();
  });

  it("tolera o descompasso de granularidade entre iat (segundos) e updatedAt (ms) no mesmo instante", async () => {
    // Simula login/registro: updatedAt gravado alguns ms depois do início do
    // MESMO segundo em que o iat (arredondado para baixo) foi capturado — sem
    // tolerância, isso invalidaria todo login/registro recém-criado.
    prismaMock.usuario.findFirst.mockResolvedValue({
      ...contaAtiva,
      updatedAt: new Date(AGORA_SEGUNDOS * 1000 + 900),
    } as never);

    const conta = await revalidarConta("user-1", "empresa-1", AGORA_SEGUNDOS);

    expect(conta).not.toBeNull();
  });

  it("sem tokenEmitidoEm (parâmetro omitido), nunca invalida por conta de updatedAt", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue({
      ...contaAtiva,
      updatedAt: new Date((AGORA_SEGUNDOS + 999_999) * 1000),
    } as never);

    const conta = await revalidarConta("user-1", "empresa-1");

    expect(conta).not.toBeNull();
  });
});

describe("revalidarConta — termosPendentes (TERM-04)", () => {
  /**
   * Sobrescreve o stub global variando SÓ o que o caso mede: a role e o
   * ponteiro de último aceite. Os fatos de billing continuam sendo os neutros
   * (trial no futuro + mesmo status auditado) de propósito — uma empresa que
   * caísse em BLOQUEADO mudaria `statusAcesso` e confundiria a leitura.
   */
  function stubComTermo(campos: { role?: string; termoAceitoId: string | null }) {
    prismaMock.usuario.findFirst.mockResolvedValue({
      ...contaAtiva,
      role: campos.role ?? "ADMIN",
      termoAceitoId: campos.termoAceitoId,
    } as never);
  }

  it("ADMIN que aceitou a versão vigente: não tem termos pendentes", async () => {
    stubComTermo({ termoAceitoId: TERMO_VIGENTE.id });

    const conta = await revalidarConta("user-1", "empresa-1");

    expect(conta?.termosPendentes).toBe(false);
  });

  it("ADMIN que nunca aceitou nada: tem termos pendentes", async () => {
    stubComTermo({ termoAceitoId: null });

    const conta = await revalidarConta("user-1", "empresa-1");

    expect(conta?.termosPendentes).toBe(true);
  });

  it("ADMIN que aceitou uma versão antiga: tem termos pendentes", async () => {
    // A comparação é por `id`, nunca por `versao` nem por `publicadoEm`: o `id`
    // é o único identificador estável do documento que a pessoa aceitou.
    stubComTermo({ termoAceitoId: "termo-antigo" });

    const conta = await revalidarConta("user-1", "empresa-1");

    expect(conta?.termosPendentes).toBe(true);
  });

  it("SUPERADMIN sem nenhum aceite: NÃO tem termos pendentes (D-03)", async () => {
    // Mitigação de impasse, não conveniência (Pitfall 9): o SUPERADMIN é quem
    // publica a versão vigente. Gateá-lo pela própria publicação trancaria a
    // plataforma inteira, sem ninguém capaz de destravá-la.
    stubComTermo({ role: "SUPERADMIN", termoAceitoId: null });

    const conta = await revalidarConta("user-1", "empresa-1");

    expect(conta?.termosPendentes).toBe(false);
  });

  it("SUPERADMIN com aceite de versão antiga: continua sem termos pendentes", async () => {
    stubComTermo({ role: "SUPERADMIN", termoAceitoId: "termo-antigo" });

    const conta = await revalidarConta("user-1", "empresa-1");

    expect(conta?.termosPendentes).toBe(false);
  });

  it("banco sem nenhum termo publicado: não gateia ninguém (falha ABERTO)", async () => {
    // Assimetria deliberada do RESEARCH: gatear contra um documento inexistente
    // derrubaria TODOS os tenants de uma vez. O registro (06-06) faz o oposto
    // com o mesmo `null`, e os dois lados estão comentados de propósito.
    stubComTermo({ termoAceitoId: null });
    prismaMock.termoDeUso.findFirst.mockResolvedValue(null as never);

    const conta = await revalidarConta("user-1", "empresa-1");

    expect(conta?.termosPendentes).toBe(false);
  });

  it("erro na tabela de termos: devolve null (fail-closed, mesmo catch de D-01)", async () => {
    // Consequência aceita (T-06-27): uma falha na tabela de termos derruba a
    // SESSÃO inteira, não só o gate. O prefixo `[auth-guard]` no log é a
    // ferramenta de distinguir "termos quebrados" de "conta revogada".
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.termoDeUso.findFirst.mockRejectedValue(
      new Error("relation \"TermoDeUso\" does not exist") as never
    );

    await expect(revalidarConta("user-1", "empresa-1")).resolves.toBeNull();
    expect(consoleError.mock.calls[0][0]).toMatch(/^\[auth-guard\]/);

    consoleError.mockRestore();
  });

  it("seleciona termoAceitoId na raiz do select, sem include", async () => {
    // A coluna é escalar e entra no `select` existente DE GRAÇA: nenhuma query
    // nova por causa dela. `include` continua proibido no modelo Usuario (C-06).
    prismaMock.usuario.findFirst.mockResolvedValue(contaAtiva as never);

    await revalidarConta("user-1", "empresa-1");

    const [args] = prismaMock.usuario.findFirst.mock.calls[0] as [
      Record<string, unknown> & { select: Record<string, unknown> },
    ];
    expect(args.select.termoAceitoId).toBe(true);
    expect(args).not.toHaveProperty("include");
  });

  it("os campos existentes de ContaAtiva continuam com os mesmos valores", async () => {
    stubComTermo({ termoAceitoId: null });

    const conta = await revalidarConta("user-1", "empresa-1");

    expect(conta).toEqual({
      usuarioId: "user-1",
      empresaId: "empresa-1",
      empresaSlug: "empresa-teste",
      email: "admin@teste.com",
      role: "ADMIN",
      statusAcesso: "TRIAL",
      acessoExpiraEm: TRIAL_FUTURO,
      carenciaAte: null,
      termosPendentes: true,
    });
  });
});
