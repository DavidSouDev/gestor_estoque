// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { requireAuth, AuthError, STATUS_ASSINATURA_SUSPENSA } from "./api-auth";
import { signAuthToken, type AuthTokenPayload } from "./jwt";
import { prismaMock } from "@/tests/setup/prisma-mock";

const payload: AuthTokenPayload = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: "empresa-teste",
  email: "admin@teste.com",
  role: "ADMIN",
};

function buildRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/produtos", { headers });
}

/** Os 4 fatos de billing da Empresa, na forma em que a query os projeta. */
interface FatosDoStub {
  acessoAte: Date | null;
  trialFim: Date | null;
  canceladoEm: Date | null;
  acessoVitalicio: boolean;
}

const UM_DIA_EM_MS = 86_400_000;

/**
 * Fatos que produzem cada status. O `acessoAte` da carência é derivado do
 * relógio (2 dias atrás, dentro dos 10 de `DIAS_DE_CARENCIA`) em vez de um
 * literal fixo, que envelheceria e transformaria o caso em BLOQUEADO sozinho.
 */
const BILLING: Record<string, FatosDoStub> = {
  BLOQUEADO: {
    acessoAte: new Date("2020-01-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  },
  CANCELADO: {
    acessoAte: new Date("2020-01-01T03:00:00.000Z"),
    trialFim: null,
    canceladoEm: new Date("2020-06-01T03:00:00.000Z"),
    acessoVitalicio: false,
  },
  CARENCIA: {
    acessoAte: new Date(Date.now() - 2 * UM_DIA_EM_MS),
    trialFim: null,
    canceladoEm: null,
    acessoVitalicio: false,
  },
  TRIAL: {
    acessoAte: null,
    trialFim: new Date("2099-01-01T03:00:00.000Z"),
    canceladoEm: null,
    acessoVitalicio: false,
  },
  EM_DIA: {
    acessoAte: new Date("2099-01-01T03:00:00.000Z"),
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
};

/**
 * Sobrescreve o stub default do prisma-mock com os fatos de um status.
 *
 * `ultimoStatusAuditado` recebe o MESMO status esperado de propósito: iguais,
 * `revalidarConta` não agenda linha de auditoria e o caso mede só a guarda.
 */
/**
 * `id` do termo publicado que o stub default de tests/setup/prisma-mock.ts
 * devolve em `termoDeUso.findFirst`.
 */
const TERMO_VIGENTE_ID = "termo-1";

function stubComStatus(status: keyof typeof BILLING) {
  prismaMock.usuario.findFirst.mockResolvedValue({
    id: "user-1",
    email: "admin@teste.com",
    role: "ADMIN",
    empresaId: "empresa-1",
    // Combinação NEUTRA de termos: o ponteiro de último aceite é o MESMO `id`
    // do vigente que o stub global devolve, então `termosPendentes` é `false` e
    // os casos de assinatura continuam medindo só o gate de assinatura.
    termoAceitoId: TERMO_VIGENTE_ID,
    empresa: {
      slug: "empresa-teste",
      ...BILLING[status],
      ultimoStatusAuditado: status,
    },
  } as never);
}

/**
 * Igual a `stubComStatus`, mas variando também a role e o ponteiro de último
 * aceite — os dois insumos do gate de TERM-04.
 */
function stubComTermos(
  status: keyof typeof BILLING,
  termoAceitoId: string | null,
  role: string = "ADMIN"
) {
  prismaMock.usuario.findFirst.mockResolvedValue({
    id: "user-1",
    email: "admin@teste.com",
    role,
    empresaId: "empresa-1",
    termoAceitoId,
    empresa: {
      slug: "empresa-teste",
      ...BILLING[status],
      ultimoStatusAuditado: status,
    },
  } as never);
}

describe("requireAuth", () => {
  it("retorna o payload decodificado quando o Bearer token é válido", async () => {
    const token = await signAuthToken(payload);
    const request = buildRequest({ authorization: `Bearer ${token}` });

    await expect(requireAuth(request)).resolves.toEqual(payload);
  });

  it("lança AuthError 401 quando não há header authorization", async () => {
    await expect(requireAuth(buildRequest())).rejects.toBeInstanceOf(AuthError);
    await expect(requireAuth(buildRequest())).rejects.toMatchObject({ status: 401 });
  });

  it("lança AuthError quando o header não começa com 'Bearer '", async () => {
    const request = buildRequest({ authorization: "Basic algumacoisa" });
    await expect(requireAuth(request)).rejects.toBeInstanceOf(AuthError);
  });

  it("lança AuthError quando o token é inválido", async () => {
    const request = buildRequest({ authorization: "Bearer token-invalido" });
    await expect(requireAuth(request)).rejects.toThrow("Token inválido ou expirado.");
  });

  it("lança AuthError 401 quando a conta foi revogada no banco", async () => {
    const token = await signAuthToken(payload);
    const request = buildRequest({ authorization: `Bearer ${token}` });
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);

    await expect(requireAuth(request)).rejects.toBeInstanceOf(AuthError);
    await expect(requireAuth(request)).rejects.toMatchObject({
      status: 401,
      message: "Sessão inválida.",
    });
  });

  it("lança AuthError 401 com a MESMA mensagem quando o banco falha (D-01, T-01-06)", async () => {
    const erroSilenciado = vi.spyOn(console, "error").mockImplementation(() => {});
    const token = await signAuthToken(payload);
    const request = buildRequest({ authorization: `Bearer ${token}` });
    prismaMock.usuario.findFirst.mockRejectedValue(new Error("connection refused") as never);

    // Mesma mensagem genérica do caso de conta revogada: a resposta não
    // distingue "usuário inativo" de "empresa removida" de "banco fora do ar".
    await expect(requireAuth(request)).rejects.toMatchObject({
      status: 401,
      message: "Sessão inválida.",
    });

    erroSilenciado.mockRestore();
  });

  it("não consulta o banco quando não há header authorization (T-01-08)", async () => {
    await expect(requireAuth(buildRequest())).rejects.toBeInstanceOf(AuthError);
    expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
  });

  it("aplica uma mudança no banco já no request seguinte, com o mesmo token", async () => {
    const token = await signAuthToken(payload);

    // Request 1: conta ativa.
    await expect(requireAuth(buildRequest({ authorization: `Bearer ${token}` }))).resolves.toEqual(
      payload
    );

    // A conta é desativada no banco — o token continua exatamente o mesmo.
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);

    // Request 2: já é 401.
    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe("requireAuth — gate de assinatura", () => {
  // Literal cru de propósito: afirmar contra a própria constante exportada
  // tornaria o caso uma tautologia, incapaz de pegar uma troca de valor.
  it("a constante de status exportada é 402", () => {
    expect(STATUS_ASSINATURA_SUSPENSA).toBe(402);
  });

  it("BLOQUEADO: lança AuthError 402 com a mensagem de assinatura suspensa", async () => {
    const token = await signAuthToken(payload);
    stubComStatus("BLOQUEADO");

    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toMatchObject({
      status: 402,
      message: "Assinatura suspensa por falta de pagamento.",
    });
  });

  it("CANCELADO: mesmo erro, mesmo status, mesma mensagem (D-06)", async () => {
    const token = await signAuthToken(payload);
    stubComStatus("CANCELADO");

    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toMatchObject({
      status: 402,
      message: "Assinatura suspensa por falta de pagamento.",
    });
  });

  it.each(["TRIAL", "EM_DIA", "CARENCIA", "VITALICIO"] as const)(
    "%s: resolve com o payload — não é status de bloqueio",
    async (status) => {
      const token = await signAuthToken(payload);
      stubComStatus(status);

      await expect(
        requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
      ).resolves.toEqual(payload);
    }
  );

  it("opt-out: empresa BLOQUEADA passa quando a rota permite (Pitfall 1)", async () => {
    const token = await signAuthToken(payload);
    stubComStatus("BLOQUEADO");

    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }), {
        permitirEmpresaBloqueada: true,
      })
    ).resolves.toEqual(payload);
  });

  it("conta revogada continua sendo 401, e não 402 (a ordem dos dois gates)", async () => {
    const token = await signAuthToken(payload);
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);

    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toMatchObject({ status: 401, message: "Sessão inválida." });
  });

  it("conta revogada continua 401 mesmo com o opt-out ligado", async () => {
    const token = await signAuthToken(payload);
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);

    // O opt-out dispensa a checagem de assinatura e SÓ ela: o checkout não
    // pode virar uma porta para conta inativa ou empresa removida.
    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }), {
        permitirEmpresaBloqueada: true,
      })
    ).rejects.toMatchObject({ status: 401, message: "Sessão inválida." });
  });

  it("sem token continua sendo 401, sem tocar o banco", async () => {
    stubComStatus("BLOQUEADO");

    await expect(requireAuth(buildRequest())).rejects.toMatchObject({
      status: 401,
      message: "Não autenticado.",
    });
    expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
  });

  it("ACC-04: o MESMO token rejeitado com 402 volta a ser aceito assim que acessoAte avança", async () => {
    const token = await signAuthToken(payload);

    // Request 1: assinatura vencida.
    stubComStatus("BLOQUEADO");
    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toMatchObject({ status: 402 });

    // O webhook estende `acessoAte` no banco. O token não muda, ninguém faz
    // login de novo, e nada é invalidado à mão.
    stubComStatus("EM_DIA");

    // Request 2: já passa.
    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).resolves.toEqual(payload);
  });
});

describe("requireAuth — gate de termos (TERM-04)", () => {
  it("empresa em dia e termos aceitos: resolve com o payload", async () => {
    const token = await signAuthToken(payload);
    stubComTermos("EM_DIA", TERMO_VIGENTE_ID);

    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).resolves.toEqual(payload);
  });

  it("termos pendentes: lança AuthError 403 com a mensagem de termos", async () => {
    const token = await signAuthToken(payload);
    stubComTermos("EM_DIA", null);

    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toBeInstanceOf(AuthError);
    // 403 e não 402: 402 é "pague e resolve"; aqui pagar não resolve nada.
    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toMatchObject({
      status: 403,
      message: "Termos de uso pendentes de aceite.",
    });
  });

  it("aceite de versão antiga também dá 403", async () => {
    const token = await signAuthToken(payload);
    stubComTermos("EM_DIA", "termo-antigo");

    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toMatchObject({ status: 403 });
  });

  it("bloqueio E termos pendentes: 402, não 403 (o gate de assinatura vem primeiro)", async () => {
    const token = await signAuthToken(payload);
    stubComTermos("BLOQUEADO", null);

    // Espelho REST da precedência provada em `lib/session.test.ts`: quem está
    // bloqueado tem que chegar ao caminho de pagamento primeiro (T-04-10).
    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toMatchObject({
      status: 402,
      message: "Assinatura suspensa por falta de pagamento.",
    });
  });

  it("permitirEmpresaBloqueada NÃO dispensa o gate de termos: 403 mesmo assim", async () => {
    const token = await signAuthToken(payload);
    stubComTermos("BLOQUEADO", null);

    // A flag existe para UM caso (o checkout, T-04-10) e dispensa a checagem de
    // assinatura e SÓ ela. Um cliente com termos pendentes que abra o checkout
    // recebe 403, e isso é correto: o caminho de aceite é a tela web, que não
    // passa por aqui.
    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }), {
        permitirEmpresaBloqueada: true,
      })
    ).rejects.toMatchObject({
      status: 403,
      message: "Termos de uso pendentes de aceite.",
    });
  });

  it("SUPERADMIN sem nenhum aceite: resolve com o payload (D-03)", async () => {
    const token = await signAuthToken(payload);
    stubComTermos("EM_DIA", null, "SUPERADMIN");

    // A isenção é decidida sobre a role lida do BANCO dentro de
    // `revalidarConta`, nunca sobre a do token (T-06-01): como ela CONCEDE
    // acesso, uma role obsoleta no JWT bastaria para pular o gate.
    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).resolves.toEqual(payload);
  });

  it("conta revogada continua 401, e não 403", async () => {
    const token = await signAuthToken(payload);
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);

    await expect(
      requireAuth(buildRequest({ authorization: `Bearer ${token}` }))
    ).rejects.toMatchObject({ status: 401, message: "Sessão inválida." });
  });
});
