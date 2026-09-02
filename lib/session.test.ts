// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const { cookieStore, redirectMock } = vi.hoisted(() => {
  const cookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  const redirectMock = vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });

  return { cookieStore, redirectMock };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import {
  createAdminSession,
  destroySession,
  getSession,
  getVerifiedSession,
  requireAdminSession,
} from "./session";
import { signAuthToken, type AuthTokenPayload } from "./jwt";
import { prismaMock } from "@/tests/setup/prisma-mock";

/**
 * `id` do termo publicado que o stub default de tests/setup/prisma-mock.ts
 * devolve em `termoDeUso.findFirst`.
 */
const TERMO_VIGENTE_ID = "termo-1";

/** Conta ativa que o stub default de tests/setup/prisma-mock.ts devolve. */
const contaAtiva = {
  id: "user-1",
  email: "admin@teste.com",
  role: "ADMIN",
  // Combinação NEUTRA de termos: o ponteiro de último aceite é o MESMO `id` do
  // vigente, então `termosPendentes` é `false` e os casos que medem o gate de
  // assinatura continuam medindo só ele.
  termoAceitoId: TERMO_VIGENTE_ID,
  empresaId: "empresa-1",
  empresa: { slug: "empresa-teste" },
};

const payload: AuthTokenPayload = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: "empresa-teste",
  email: "admin@teste.com",
  role: "ADMIN",
};

/** Os 4 fatos de billing da Empresa, na forma em que a query os projeta. */
interface FatosDoStub {
  acessoAte: Date | null;
  trialFim: Date | null;
  canceladoEm: Date | null;
  acessoVitalicio: boolean;
}

const UM_DIA_EM_MS = 86_400_000;

/**
 * Fatos que produzem cada status. `acessoAte` da carência é calculado a partir
 * do relógio (2 dias atrás, bem dentro dos 10 de `DIAS_DE_CARENCIA`) e não é um
 * literal fixo: um literal envelheceria e o caso viraria BLOQUEADO sozinho um
 * dia qualquer.
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
 * `ultimoStatusAuditado` recebe o MESMO status esperado de propósito: com os
 * dois iguais, `revalidarConta` não agenda linha de auditoria e o teste mede
 * apenas a guarda, sem efeito colateral de escrita atravessando o caso.
 */
function stubComStatus(status: keyof typeof BILLING) {
  prismaMock.usuario.findFirst.mockResolvedValue({
    ...contaAtiva,
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
    ...contaAtiva,
    role,
    termoAceitoId,
    empresa: {
      slug: "empresa-teste",
      ...BILLING[status],
      ultimoStatusAuditado: status,
    },
  } as never);
}

describe("session", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret";
    vi.clearAllMocks();
  });

  describe("createAdminSession", () => {
    it("grava um cookie httpOnly assinado com o payload", async () => {
      await createAdminSession(payload);

      expect(cookieStore.set).toHaveBeenCalledWith(
        "admin_session",
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        })
      );
    });
  });

  describe("destroySession", () => {
    it("remove o cookie de sessão", async () => {
      await destroySession();
      expect(cookieStore.delete).toHaveBeenCalledWith("admin_session");
    });
  });

  describe("getSession", () => {
    it("retorna null quando não há cookie", async () => {
      cookieStore.get.mockReturnValue(undefined);
      await expect(getSession()).resolves.toBeNull();
    });

    it("retorna null quando o token é inválido", async () => {
      cookieStore.get.mockReturnValue({ value: "token-invalido" });
      await expect(getSession()).resolves.toBeNull();
    });

    it("retorna o payload decodificado para um token válido", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      await expect(getSession()).resolves.toEqual(payload);
    });
  });

  describe("requireAdminSession", () => {
    it("retorna a sessão quando o slug bate com a empresa do token", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      await expect(requireAdminSession("empresa-teste")).resolves.toEqual(payload);
    });

    it("redireciona para o login quando não há sessão", async () => {
      cookieStore.get.mockReturnValue(undefined);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );
    });

    it("redireciona quando o slug da sessão é de outra empresa", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      await expect(requireAdminSession("outra-empresa")).rejects.toThrow(
        "REDIRECT:/outra-empresa/admin/login"
      );
    });

    it("redireciona quando a conta foi revogada no banco, mesmo com JWT válido", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      prismaMock.usuario.findFirst.mockResolvedValue(null as never);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );
    });

    it("redireciona quando o banco falha (fail-closed, D-01)", async () => {
      const erroSilenciado = vi.spyOn(console, "error").mockImplementation(() => {});
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      prismaMock.usuario.findFirst.mockRejectedValue(new Error("connection refused") as never);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );

      erroSilenciado.mockRestore();
    });

    it("redireciona quando o slug do banco não bate com o da URL (slug obsoleto, D-03)", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      prismaMock.usuario.findFirst.mockResolvedValue({
        ...contaAtiva,
        empresa: { slug: "slug-novo" },
      } as never);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );
    });

    it("não consulta o banco quando não há sessão (T-01-08)", async () => {
      cookieStore.get.mockReturnValue(undefined);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow("REDIRECT:");
      expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
    });

    it("não consulta o banco quando o token é de outra empresa (T-01-08)", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      await expect(requireAdminSession("outra-empresa")).rejects.toThrow("REDIRECT:");
      expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
    });

    it("aplica uma mudança no banco já no request seguinte, sem novo login", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      // Request 1: conta ativa.
      await expect(requireAdminSession("empresa-teste")).resolves.toEqual(payload);

      // A conta é desativada no banco — o cookie/JWT continua exatamente o mesmo.
      prismaMock.usuario.findFirst.mockResolvedValue(null as never);

      // Request 2: já é rejeitado.
      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );
    });
  });

  describe("requireAdminSession — gate de assinatura", () => {
    it("BLOQUEADO: redireciona para a tela de bloqueio (ACC-02)", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComStatus("BLOQUEADO");

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/bloqueado"
      );
    });

    it("CANCELADO: mesmo destino de BLOQUEADO, sem distinção (D-06)", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComStatus("CANCELADO");

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/bloqueado"
      );
    });

    it("TRIAL: devolve o payload, sem redirect", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComStatus("TRIAL");

      await expect(requireAdminSession("empresa-teste")).resolves.toEqual(payload);
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("EM_DIA: devolve o payload, sem redirect", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComStatus("EM_DIA");

      await expect(requireAdminSession("empresa-teste")).resolves.toEqual(payload);
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("CARENCIA: devolve o payload — carência NÃO bloqueia (D-03)", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComStatus("CARENCIA");

      await expect(requireAdminSession("empresa-teste")).resolves.toEqual(payload);
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("VITALICIO: devolve o payload, sem redirect", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComStatus("VITALICIO");

      await expect(requireAdminSession("empresa-teste")).resolves.toEqual(payload);
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("sem sessão: continua indo para o login, nunca para a tela de bloqueio", async () => {
      cookieStore.get.mockReturnValue(undefined);
      stubComStatus("BLOQUEADO");

      // Ordem dos dois redirects: mesmo com a empresa bloqueada no banco, uma
      // sessão inexistente sai pelo login — e sem consultar o banco.
      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );
      expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
    });

    it("sessão de outro tenant + empresa bloqueada: login, não bloqueio", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComStatus("BLOQUEADO");

      await expect(requireAdminSession("outra-empresa")).rejects.toThrow(
        "REDIRECT:/outra-empresa/admin/login"
      );
    });
  });

  describe("requireAdminSession — gate de termos (TERM-04)", () => {
    it("termos pendentes: redireciona para a tela de aceite", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComTermos("EM_DIA", null);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/aceitar-termos"
      );
    });

    it("aceite de versão antiga também é pendente", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComTermos("EM_DIA", "termo-antigo");

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/aceitar-termos"
      );
    });

    it("bloqueio E termos pendentes: o BLOQUEIO vence (precedência, D-08)", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComTermos("BLOQUEADO", null);

      // Esta é a metade em teste da prova de ausência de loop: o estado
      // (bloqueado, pendente) só é estável porque o gate de assinatura vem
      // primeiro E porque `/admin/bloqueado` NÃO checa termos. A outra metade —
      // a guarda simétrica da página — é do plano 06-05. Invertida a ordem, o
      // cliente inadimplente teria um passo a mais entre ele e o pagamento
      // (T-04-10) e o par de rotas passaria a se redirecionar mutuamente.
      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/bloqueado"
      );
      expect(redirectMock).not.toHaveBeenCalledWith(
        "/empresa-teste/admin/aceitar-termos"
      );
    });

    it("sem bloqueio e sem termos pendentes: renderiza (devolve o payload)", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComTermos("EM_DIA", TERMO_VIGENTE_ID);

      await expect(requireAdminSession("empresa-teste")).resolves.toEqual(payload);
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("SUPERADMIN em empresa vitalícia sem aceite: não redireciona (D-02 + D-03)", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      stubComTermos("VITALICIO", null, "SUPERADMIN");

      await expect(requireAdminSession("empresa-teste")).resolves.toEqual(payload);
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("sessão inválida + termos pendentes: continua indo para o login", async () => {
      cookieStore.get.mockReturnValue(undefined);
      stubComTermos("EM_DIA", null);

      await expect(requireAdminSession("empresa-teste")).rejects.toThrow(
        "REDIRECT:/empresa-teste/admin/login"
      );
      expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("getVerifiedSession", () => {
    it("retorna null quando não há cookie", async () => {
      cookieStore.get.mockReturnValue(undefined);

      await expect(getVerifiedSession()).resolves.toBeNull();
      expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
    });

    it("retorna o payload quando o banco confirma a conta", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });

      await expect(getVerifiedSession()).resolves.toEqual(payload);
    });

    it("retorna null quando o JWT é válido mas a conta foi revogada", async () => {
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      prismaMock.usuario.findFirst.mockResolvedValue(null as never);

      await expect(getVerifiedSession()).resolves.toBeNull();
    });

    it("retorna null quando o banco falha (fail-closed, D-01)", async () => {
      const erroSilenciado = vi.spyOn(console, "error").mockImplementation(() => {});
      const token = await signAuthToken(payload);
      cookieStore.get.mockReturnValue({ value: token });
      prismaMock.usuario.findFirst.mockRejectedValue(new Error("connection refused") as never);

      await expect(getVerifiedSession()).resolves.toBeNull();

      erroSilenciado.mockRestore();
    });
  });
});
