// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest } from "../../../../tests/helpers/request";

vi.mock("../../../services/produto.service", () => ({
  produtoService: {
    listCatalogo: vi.fn(),
  },
}));

vi.mock("../../../services/empresa.service", () => ({
  empresaService: {
    resolveIdBySlug: vi.fn(),
  },
}));

import { produtoService } from "../../../services/produto.service";
import { empresaService } from "../../../services/empresa.service";
import { GET } from "./route";

describe("GET /api/catalogo/produtos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 400 quando nenhum dos parâmetros empresaId ou slug é informado", async () => {
    const response = await GET(buildRequest({ url: "http://localhost/api/test" }));
    expect(response.status).toBe(400);
    expect(produtoService.listCatalogo).not.toHaveBeenCalled();
  });

  it("lista produtos do catálogo usando o empresaId informado na query", async () => {
    vi.mocked(produtoService.listCatalogo).mockResolvedValue([{ id: "produto-1" }] as never);

    const response = await GET(buildRequest({ url: "http://localhost/api/test?empresaId=empresa-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "produto-1" }]);
    expect(produtoService.listCatalogo).toHaveBeenCalledWith("empresa-1");
    expect(empresaService.resolveIdBySlug).not.toHaveBeenCalled();
  });

  it("resolve o empresaId a partir do slug quando empresaId não é informado", async () => {
    vi.mocked(empresaService.resolveIdBySlug).mockResolvedValue("empresa-1");
    vi.mocked(produtoService.listCatalogo).mockResolvedValue([{ id: "produto-1" }] as never);

    const response = await GET(buildRequest({ url: "http://localhost/api/test?slug=empresa-teste" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "produto-1" }]);
    expect(empresaService.resolveIdBySlug).toHaveBeenCalledWith("empresa-teste");
    expect(produtoService.listCatalogo).toHaveBeenCalledWith("empresa-1");
  });

  it("retorna 400 quando o slug informado não resolve nenhuma empresa", async () => {
    vi.mocked(empresaService.resolveIdBySlug).mockResolvedValue(null);

    const response = await GET(buildRequest({ url: "http://localhost/api/test?slug=inexistente" }));

    expect(response.status).toBe(400);
    expect(produtoService.listCatalogo).not.toHaveBeenCalled();
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const response404 = buildRequest({ url: "http://localhost/api/test?empresaId=empresa-1" });
    vi.mocked(produtoService.listCatalogo).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(response404);
    expect(response.status).toBe(500);
  });
});
