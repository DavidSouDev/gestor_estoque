// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const { redirectMock, getVerifiedSessionMock, revalidarContaMock, findHeaderDataMock } = vi.hoisted(
  () => ({
    redirectMock: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
    getVerifiedSessionMock: vi.fn(),
    revalidarContaMock: vi.fn(),
    findHeaderDataMock: vi.fn(),
  })
);

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

import AdminBloqueadoPage from "./page";

const SLUG = "empresa-teste";

const sessao = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: SLUG,
  email: "admin@teste.com",
  role: "ADMIN" as const,
  iat: 1_700_000_000,
};

const conta = (statusAcesso: string) => ({
  usuarioId: "user-1",
  empresaId: "empresa-1",
  empresaSlug: SLUG,
  email: "admin@teste.com",
  role: "ADMIN",
  statusAcesso,
  acessoExpiraEm: null,
  carenciaAte: null,
});

function renderizar(slug = SLUG, erro?: string) {
  return AdminBloqueadoPage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(erro ? { erro } : {}),
  });
}

/** Só os props visuais: as duas actions são funções ligadas, sempre distintas. */
function propsVisuais(el: ReactElement) {
  const p = el.props as { primaryColor: string; accentColor: string; erroCheckout: boolean };
  return { primaryColor: p.primaryColor, accentColor: p.accentColor, erroCheckout: p.erroCheckout };
}

describe("AdminBloqueadoPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(revalidarContaMock).not.toHaveBeenCalled();
  });

  it("com sessão de outro tenant, manda para o login e não consulta o banco", async () => {
    getVerifiedSessionMock.mockResolvedValue({ ...sessao, empresaSlug: "outra-empresa" });

    await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin/login`);
    expect(revalidarContaMock).not.toHaveBeenCalled();
  });

  it("nunca renderiza a tela sem uma conta confirmada no banco", async () => {
    // Caso defensivo: `getVerifiedSession` já revalidou a conta neste mesmo
    // request (e a revalidação é deduplicada), então na prática não se chega
    // aqui com `null`. O destino é o painel, que aplica a guarda completa —
    // o que não pode acontecer é a tela de suspensão renderizar mesmo assim.
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(null);

    await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin`);
  });

  it.each(["TRIAL", "EM_DIA", "CARENCIA", "VITALICIO"])(
    "devolve a empresa em dia (%s) para o painel",
    async (status) => {
      getVerifiedSessionMock.mockResolvedValue(sessao);
      revalidarContaMock.mockResolvedValue(conta(status));

      await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin`);
    }
  );

  it("renderiza a tela para a empresa BLOQUEADA", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(conta("BLOQUEADO"));

    const el = await renderizar();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(revalidarContaMock).toHaveBeenCalledWith("user-1", "empresa-1", 1_700_000_000);
    expect(propsVisuais(el)).toEqual({
      primaryColor: "#2563eb",
      accentColor: "#7c3aed",
      erroCheckout: false,
    });
  });

  it("renderiza EXATAMENTE a mesma tela para BLOQUEADO e CANCELADO", async () => {
    // D-06: rótulo distinto no banco, comportamento e cópia idênticos na tela.
    getVerifiedSessionMock.mockResolvedValue(sessao);

    revalidarContaMock.mockResolvedValue(conta("BLOQUEADO"));
    const bloqueado = await renderizar();

    revalidarContaMock.mockResolvedValue(conta("CANCELADO"));
    const cancelado = await renderizar();

    expect(cancelado.type).toBe(bloqueado.type);
    expect(propsVisuais(cancelado)).toEqual(propsVisuais(bloqueado));
  });

  it("propaga ?erro=checkout para a tela, e só ele", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(conta("BLOQUEADO"));

    expect(propsVisuais(await renderizar(SLUG, "checkout")).erroCheckout).toBe(true);
    expect(propsVisuais(await renderizar(SLUG, "qualquer-outra-coisa")).erroCheckout).toBe(false);
  });

  it("cai no branding neutro quando a empresa não tem cores", async () => {
    getVerifiedSessionMock.mockResolvedValue(sessao);
    revalidarContaMock.mockResolvedValue(conta("CANCELADO"));
    findHeaderDataMock.mockResolvedValue(null);

    expect(propsVisuais(await renderizar())).toEqual({
      primaryColor: "#18181b",
      accentColor: "#3f3f46",
      erroCheckout: false,
    });
  });
});
