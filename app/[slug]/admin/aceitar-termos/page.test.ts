// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const {
  redirectMock,
  getVerifiedSessionMock,
  revalidarContaMock,
  findHeaderDataMock,
  termoVigenteMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  getVerifiedSessionMock: vi.fn(),
  revalidarContaMock: vi.fn(),
  findHeaderDataMock: vi.fn(),
  termoVigenteMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/session", () => ({
  getVerifiedSession: getVerifiedSessionMock,
}));

vi.mock("@/lib/auth-guard", () => ({
  revalidarConta: revalidarContaMock,
}));

vi.mock("@/app/services/empresa.service", () => ({
  empresaService: { findHeaderData: findHeaderDataMock },
}));

vi.mock("@/lib/termo-vigente", () => ({
  termoVigente: termoVigenteMock,
}));

import AdminAceitarTermosPage from "./page";

const SLUG = "empresa-teste";

const sessao = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: SLUG,
  email: "admin@teste.com",
  role: "ADMIN" as const,
  iat: 1_700_000_000,
};

const conta = (statusAcesso: string, termosPendentes: boolean) => ({
  usuarioId: "user-1",
  empresaId: "empresa-1",
  empresaSlug: SLUG,
  email: "admin@teste.com",
  role: "ADMIN",
  statusAcesso,
  acessoExpiraEm: null,
  carenciaAte: null,
  termosPendentes,
});

const vigente = {
  id: "termo-2",
  versao: 2,
  conteudo: "Texto da versao 2.",
  publicadoEm: new Date("2026-09-02T12:00:00Z"),
};

function renderizar(slug = SLUG, erro?: string) {
  return AdminAceitarTermosPage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(erro ? { erro } : {}),
  });
}

/** Só os props visuais: as duas actions são funções ligadas, sempre distintas. */
function propsVisuais(el: ReactElement) {
  const p = el.props as {
    primaryColor: string;
    accentColor: string;
    erro: boolean;
    termo: { id: string; versao: number; conteudo: string; publicadoEmFormatado: string };
  };
  return {
    primaryColor: p.primaryColor,
    accentColor: p.accentColor,
    erro: p.erro,
    termo: p.termo,
  };
}

describe("AdminAceitarTermosPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    termoVigenteMock.mockResolvedValue(vigente);
    findHeaderDataMock.mockResolvedValue({
      id: "empresa-1",
      nome: "Empresa Teste",
      slug: SLUG,
      logo: null,
      primaryColor: "#2563eb",
      accentColor: "#7c3aed",
      modoInterface: "COMPLETO",
    });
  });

  it("sem sessão, manda para o login e não consulta o banco", async () => {
    getVerifiedSessionMock.mockResolvedValue(null);

    await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin/login`);
    // A ordem das condições é a especificação da máquina de estados, e esta
    // asserção negativa é o que a prova.
    expect(revalidarContaMock).not.toHaveBeenCalled();
  });

  it("com sessão de outro tenant, manda para o login e não consulta o banco", async () => {
    getVerifiedSessionMock.mockResolvedValue({ ...sessao, empresaSlug: "outra-empresa" });

    await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin/login`);
    expect(revalidarContaMock).not.toHaveBeenCalled();
  });

  it("nunca renderiza a tela sem uma conta confirmada no banco", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(null);

    await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin`);
  });

  it.each(["BLOQUEADO", "CANCELADO"])(
    "manda a empresa suspensa (%s) para a tela de bloqueio, mesmo com termos pendentes",
    async (status) => {
      // Estado (bloqueado, pendente) da máquina de estados: o bloqueio vence.
      // `bloqueado/page.tsx` NÃO checa termos, então lá a tela renderiza e o
      // ciclo fecha — é exatamente esta assimetria que evita o loop.
      getVerifiedSessionMock.mockResolvedValue(sessao);
      revalidarContaMock.mockResolvedValue(conta(status, true));

      await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin/bloqueado`);
    }
  );

  it("manda a empresa suspensa SEM termos pendentes para a tela de bloqueio", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(conta("BLOQUEADO", false));

    await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin/bloqueado`);
  });

  it.each(["TRIAL", "EM_DIA", "CARENCIA", "VITALICIO"])(
    "devolve ao painel quem está em dia (%s) e sem termos pendentes",
    async (status) => {
      getVerifiedSessionMock.mockResolvedValue(sessao);
      revalidarContaMock.mockResolvedValue(conta(status, false));

      await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin`);
    }
  );

  it("devolve ao painel quando não existe termo vigente", async () => {
    // A tela é inalcançável sem termo, por construção: o gate falha ABERTO, e
    // `termosPendentes` já seria `false` nesse cenário. A condição existe como
    // guarda simétrica, não como caminho esperado.
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(conta("EM_DIA", true));
    termoVigenteMock.mockResolvedValue(null);

    await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin`);
  });

  it("renderiza o card com o termo vigente para quem tem aceite pendente", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(conta("EM_DIA", true));

    const el = await renderizar();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(revalidarContaMock).toHaveBeenCalledWith("user-1", "empresa-1", 1_700_000_000);
    expect(propsVisuais(el)).toEqual({
      primaryColor: "#2563eb",
      accentColor: "#7c3aed",
      erro: false,
      termo: {
        id: "termo-2",
        versao: 2,
        conteudo: "Texto da versao 2.",
        publicadoEmFormatado: "02/09/2026",
      },
    });
  });

  it("propaga ?erro=termos-atualizados para a tela, e só ele", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(conta("EM_DIA", true));

    expect(propsVisuais(await renderizar(SLUG, "termos-atualizados")).erro).toBe(true);
    expect(propsVisuais(await renderizar(SLUG, "qualquer-outra-coisa")).erro).toBe(false);
  });

  it("cai no branding neutro quando a empresa não tem cores", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(conta("EM_DIA", true));
    findHeaderDataMock.mockResolvedValue(null);

    const visuais = propsVisuais(await renderizar());
    expect(visuais.primaryColor).toBe("#18181b");
    expect(visuais.accentColor).toBe("#3f3f46");
  });

  it("REGRESSÃO DA MÁQUINA DE ESTADOS: bloqueado/page.tsx não checa termos", () => {
    // Um dia alguém vai achar que falta "consistência" ali e acrescentar a
    // checagem de termos à guarda da tela de bloqueio. No estado (bloqueado,
    // pendente) isso produz `/bloqueado` -> `/aceitar-termos` -> `/bloqueado`
    // indefinidamente. Este teste transforma esse impulso num build vermelho em
    // vez de num loop de redirect em produção (T-06-26).
    const origem = readFileSync(
      fileURLToPath(new URL("../bloqueado/page.tsx", import.meta.url)),
      "utf8"
    );

    expect(origem).not.toContain("termosPendentes");
  });
});
