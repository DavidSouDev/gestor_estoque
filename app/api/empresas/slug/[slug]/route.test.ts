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

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    vi.mocked(empresaService.findBySlug).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({}), buildParams({ slug: "empresa-teste" }));
    expect(response.status).toBe(500);
  });
});
