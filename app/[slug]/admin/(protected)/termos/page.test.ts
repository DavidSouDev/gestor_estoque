// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const { redirectMock, requireAdminSessionMock, termoVigenteMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  requireAdminSessionMock: vi.fn(),
  termoVigenteMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/session", () => ({
  requireAdminSession: requireAdminSessionMock,
}));

vi.mock("@/lib/termo-vigente", () => ({
  termoVigente: termoVigenteMock,
}));

// `@/lib/format` NÃO é mockado de propósito: a formatação real é parte do que
// esta suíte prova. Um mock aqui deixaria passar um `publicadoEmFormatado`
// inventado.
import AdminTermosPage from "./page";

const SLUG = "empresa-teste";

const sessao = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: SLUG,
  email: "admin@teste.com",
  role: "ADMIN" as const,
};

const vigente = {
  id: "termo-3",
  versao: 3,
  conteudo: "Texto da v3.",
  publicadoEm: new Date("2026-09-05T12:00:00Z"),
};

function renderizar(slug = SLUG) {
  return AdminTermosPage({ params: Promise.resolve({ slug }) });
}

function propsDoCard(el: ReactElement) {
  return (el.props as { termo: unknown }).termo;
}

describe("AdminTermosPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminSessionMock.mockResolvedValue(sessao);
    termoVigenteMock.mockResolvedValue(vigente);
  });

  it("exige sessão de admin do slug recebido em params", async () => {
    await renderizar();

    expect(requireAdminSessionMock).toHaveBeenCalledWith(SLUG);
  });

  it("AUTORIZAÇÃO ANTES DE LEITURA: nada é lido quando a guarda lança", async () => {
    // `requireAdminSession` sinaliza lançando (é o que `redirect()` faz). Esta
    // asserção NEGATIVA é o teste de segurança do plano (T-fhk-01): a ordem das
    // duas chamadas dentro da page é a especificação, e é isto que a prova.
    requireAdminSessionMock.mockRejectedValue(new Error(`REDIRECT:/${SLUG}/admin/login`));

    await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin/login`);
    expect(termoVigenteMock).not.toHaveBeenCalled();
  });

  it("monta o card com versão, conteúdo e data formatada — e sem o id", async () => {
    const el = await renderizar();

    // Exatamente estas três chaves. `id` não viaja: nada é submetido nesta tela.
    expect(propsDoCard(el)).toEqual({
      versao: 3,
      conteudo: "Texto da v3.",
      publicadoEmFormatado: "05/09/2026",
    });
  });

  it("sem termo publicado, devolve estado vazio em vez de redirecionar", async () => {
    // `aceitar-termos` redireciona nesse caso porque lá um termo ausente torna o
    // gate insatisfazível. Aqui a tela é informativa: mandar o usuário de volta
    // ao painel sem explicação seria pior que um estado vazio honesto.
    termoVigenteMock.mockResolvedValue(null);

    const el = await renderizar();

    expect(propsDoCard(el)).toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("REGRESSÃO DE ARQUITETURA: a page não injeta HTML, não fala com o banco e não duplica guarda", () => {
    const origem = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");

    // D-05: o conteúdo é texto puro precisamente para eliminar essa superfície.
    expect(origem).not.toContain("dangerously" + "SetInnerHTML");
    // A leitura passa pelo módulo `termo-vigente`, deduplicado por `React.cache`
    // — nunca por cliente de banco direto, e nunca por uma rota GET nova.
    expect(origem).not.toContain("prisma" + ".");
    // Quem fecha a tela é `requireAdminSession`. Guarda duplicada aqui é como se
    // produzem loops de redirect.
    expect(origem).not.toContain("termos" + "Pendentes");
    expect(origem).not.toContain("acesso" + "Bloqueado");
  });
});
