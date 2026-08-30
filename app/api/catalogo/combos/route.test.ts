// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest } from "../../../../tests/helpers/request";

vi.mock("../../../services/combo.service", () => ({
  comboService: {
    listCatalogo: vi.fn(),
  },
}));

vi.mock("../../../services/empresa.service", () => ({
  empresaService: {
    resolveIdBySlug: vi.fn(),
  },
}));

import { comboService } from "../../../services/combo.service";
import { empresaService } from "../../../services/empresa.service";
import { GET } from "./route";

describe("GET /api/catalogo/combos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 400 quando nenhum dos parâmetros empresaId ou slug é informado", async () => {
    const response = await GET(buildRequest({ url: "http://localhost/api/test" }));
    expect(response.status).toBe(400);
    expect(comboService.listCatalogo).not.toHaveBeenCalled();
  });

  it("lista combos do catálogo usando o empresaId informado na query", async () => {
    vi.mocked(comboService.listCatalogo).mockResolvedValue([{ id: "combo-1" }] as never);

    const response = await GET(buildRequest({ url: "http://localhost/api/test?empresaId=empresa-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "combo-1" }]);
    expect(comboService.listCatalogo).toHaveBeenCalledWith("empresa-1");
    expect(empresaService.resolveIdBySlug).not.toHaveBeenCalled();
  });

  it("resolve o empresaId a partir do slug quando empresaId não é informado", async () => {
    vi.mocked(empresaService.resolveIdBySlug).mockResolvedValue("empresa-1");
    vi.mocked(comboService.listCatalogo).mockResolvedValue([{ id: "combo-1" }] as never);

    const response = await GET(buildRequest({ url: "http://localhost/api/test?slug=empresa-teste" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "combo-1" }]);
    expect(empresaService.resolveIdBySlug).toHaveBeenCalledWith("empresa-teste");
    expect(comboService.listCatalogo).toHaveBeenCalledWith("empresa-1");
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    vi.mocked(comboService.listCatalogo).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ url: "http://localhost/api/test?empresaId=empresa-1" }));
    expect(response.status).toBe(500);
  });
});
