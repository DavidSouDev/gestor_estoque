// @vitest-environment node
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { redirectMock, getVerifiedSessionMock, termoVigenteMock, registrarAceiteMock } = vi.hoisted(
  () => ({
    redirectMock: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
    getVerifiedSessionMock: vi.fn(),
    termoVigenteMock: vi.fn(),
    registrarAceiteMock: vi.fn(),
  })
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/session", () => ({
  getVerifiedSession: getVerifiedSessionMock,
}));

vi.mock("@/lib/termo-vigente", () => ({
  termoVigente: termoVigenteMock,
}));

vi.mock("@/app/services/termo.service", () => ({
  termoService: { registrarAceite: registrarAceiteMock },
}));

import { aceitarTermos } from "./actions";

const SLUG = "empresa-teste";

const sessao = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: SLUG,
  email: "admin@teste.com",
  role: "ADMIN" as const,
};

const vigente = {
  id: "termo-2",
  versao: 2,
  conteudo: "Texto da versao 2.",
  publicadoEm: new Date("2026-09-01T00:00:00Z"),
};

/** O formulário real carrega UM campo: o `termoId` escondido. */
function form(campos: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) {
    fd.set(chave, valor);
  }
  return fd;
}

describe("aceitarTermos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedSessionMock.mockResolvedValue(sessao);
    termoVigenteMock.mockResolvedValue(vigente);
    registrarAceiteMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sem sessão, manda para o login antes de qualquer I/O de termos", async () => {
    // Pitfall 8: a action mora FORA de `(protected)`, então nenhum guard a
    // cobre — ela se autoriza sozinha, e a ordem é parte da mitigação.
    getVerifiedSessionMock.mockResolvedValue(null);

    await expect(aceitarTermos(SLUG, form({ termoId: vigente.id }))).rejects.toThrow(
      `REDIRECT:/${SLUG}/admin/login`
    );
    expect(termoVigenteMock).not.toHaveBeenCalled();
    expect(registrarAceiteMock).not.toHaveBeenCalled();
  });

  it("com sessão de outro tenant, manda para o login antes de qualquer I/O de termos", async () => {
    getVerifiedSessionMock.mockResolvedValue({ ...sessao, empresaSlug: "outra-empresa" });

    await expect(aceitarTermos(SLUG, form({ termoId: vigente.id }))).rejects.toThrow(
      `REDIRECT:/${SLUG}/admin/login`
    );
    expect(termoVigenteMock).not.toHaveBeenCalled();
    expect(registrarAceiteMock).not.toHaveBeenCalled();
  });

  it("sem termo vigente no banco, devolve ao painel sem gravar nada", async () => {
    // O gate de TERM-04 falha ABERTO: sem documento publicado não há o que
    // aceitar, e a tela é inalcançável por construção.
    termoVigenteMock.mockResolvedValue(null);

    await expect(aceitarTermos(SLUG, form({ termoId: "termo-1" }))).rejects.toThrow(
      `REDIRECT:/${SLUG}/admin`
    );
    expect(registrarAceiteMock).not.toHaveBeenCalled();
  });

  it("recusa o aceite quando o termo mudou entre o render e o submit (TOCTOU)", async () => {
    // Pitfall 4: o hidden input é dado controlado pelo cliente. A checagem é
    // IGUALDADE contra o vigente do servidor, nunca "usa o que veio".
    await expect(aceitarTermos(SLUG, form({ termoId: "termo-1" }))).rejects.toThrow(
      `REDIRECT:/${SLUG}/admin/aceitar-termos?erro=termos-atualizados`
    );
    expect(registrarAceiteMock).not.toHaveBeenCalled();
  });

  it.each([
    ["ausente", {}],
    ["vazio", { termoId: "" }],
  ])("trata o termoId %s como divergência e não grava", async (_rotulo, campos) => {
    await expect(aceitarTermos(SLUG, form(campos))).rejects.toThrow(
      `REDIRECT:/${SLUG}/admin/aceitar-termos?erro=termos-atualizados`
    );
    expect(registrarAceiteMock).not.toHaveBeenCalled();
  });

  it("grava o aceite com o usuário da sessão e devolve ao painel", async () => {
    await expect(aceitarTermos(SLUG, form({ termoId: vigente.id }))).rejects.toThrow(
      `REDIRECT:/${SLUG}/admin`
    );
    expect(registrarAceiteMock).toHaveBeenCalledWith("user-1", vigente.id);
  });

  it("ignora um usuarioId forjado no formulário e grava o da sessão", async () => {
    // T-06-06: sem derivar o `usuarioId` da sessão, qualquer sessão válida
    // gravaria consentimento em nome de outra pessoa.
    await expect(
      aceitarTermos(SLUG, form({ termoId: vigente.id, usuarioId: "user-invasor" }))
    ).rejects.toThrow(`REDIRECT:/${SLUG}/admin`);
    expect(registrarAceiteMock).toHaveBeenCalledWith("user-1", vigente.id);
  });

  it("uma falha do service vira ?erro=termos-atualizados depois do log, nunca tela quebrada", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    registrarAceiteMock.mockRejectedValue(new Error("banco fora do ar"));

    await expect(aceitarTermos(SLUG, form({ termoId: vigente.id }))).rejects.toThrow(
      `REDIRECT:/${SLUG}/admin/aceitar-termos?erro=termos-atualizados`
    );
    expect(spy).toHaveBeenCalled();
  });

  it("o redirect de sucesso não é engolido pelo catch do service", async () => {
    // `redirect()` sinaliza lançando `NEXT_REDIRECT`; se ficasse dentro do
    // `try`, o `catch` o engoliria e a navegação não aconteceria.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(aceitarTermos(SLUG, form({ termoId: vigente.id }))).rejects.toThrow(
      `REDIRECT:/${SLUG}/admin`
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
