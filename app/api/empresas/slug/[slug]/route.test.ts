// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest, buildParams } from "../../../../../tests/helpers/request";

vi.mock("../../../../services/empresa.service", () => ({
  empresaService: {
    findBySlug: vi.fn(),
  },
}));

import { empresaService } from "../../../../services/empresa.service";
import { GET } from "./route";

describe("GET /api/empresas/slug/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 quando a empresa não existe para o slug informado", async () => {
    vi.mocked(empresaService.findBySlug).mockResolvedValue(null);

    const response = await GET(buildRequest({}), buildParams({ slug: "inexistente" }));
    expect(response.status).toBe(404);
  });

  it("retorna a empresa quando encontrada pelo slug", async () => {
    vi.mocked(empresaService.findBySlug).mockResolvedValue({ id: "empresa-1", slug: "empresa-teste" } as never);

    const response = await GET(buildRequest({}), buildParams({ slug: "empresa-teste" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: "empresa-1", slug: "empresa-teste" });
    expect(empresaService.findBySlug).toHaveBeenCalledWith("empresa-teste");
  });

  // Este é o SEXTO caminho público de leitura do catálogo (04-RESEARCH.md, Achado
  // crítico 1): totalmente sem autenticação, devolve produtos, combos e promoções
  // inteiros. O D-07 do CONTEXT.md lista cinco e esquece este.
  //
  // O handler NÃO foi editado: o gate mora dentro de `findBySlug` (plano 04-01),
  // que devolve `null` para empresa bloqueada exatamente como para slug
  // inexistente. Por isso os dois testes abaixo andam em par — sozinho, o de 404
  // continuaria passando mesmo se alguém removesse o gate do service. É o de 200
  // que prova que o handler só produz 404 quando o service devolve `null`, e
  // portanto que é o gate quem produz o 404 da empresa bloqueada.
  it("empresa bloqueada responde igual a slug inexistente: 404 com o mesmo corpo", async () => {
    vi.mocked(empresaService.findBySlug).mockResolvedValue(null);

    const response = await GET(buildRequest({}), buildParams({ slug: "loja-bloqueada" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ message: "Empresa não encontrada." });
  });

  it("empresa publicável responde 200 com o catálogo — o par que prova que o 404 vem do gate", async () => {
    vi.mocked(empresaService.findBySlug).mockResolvedValue({
      id: "empresa-1",
      slug: "loja-em-dia",
      produtos: [{ id: "produto-1" }],
      combos: [{ id: "combo-1" }],
      promocoes: [{ id: "promocao-1" }],
    } as never);

    const response = await GET(buildRequest({}), buildParams({ slug: "loja-em-dia" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      id: "empresa-1",
      slug: "loja-em-dia",
      produtos: [{ id: "produto-1" }],
      combos: [{ id: "combo-1" }],
      promocoes: [{ id: "promocao-1" }],
    });
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    vi.mocked(empresaService.findBySlug).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({}), buildParams({ slug: "empresa-teste" }));
    expect(response.status).toBe(500);
  });
});
