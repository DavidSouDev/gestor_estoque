// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest, buildParams } from "../../../../../tests/helpers/request";

vi.mock("../../../../services/combo.service", () => ({
  comboService: {
    findCatalogoById: vi.fn(),
  },
}));

import { comboService } from "../../../../services/combo.service";
import { GET } from "./route";

describe("GET /api/catalogo/combos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 quando o combo não existe no catálogo", async () => {
    vi.mocked(comboService.findCatalogoById).mockResolvedValue(null);

    const response = await GET(buildRequest({}), buildParams({ id: "inexistente" }));
    expect(response.status).toBe(404);
  });

  it("retorna o combo do catálogo quando encontrado", async () => {
    vi.mocked(comboService.findCatalogoById).mockResolvedValue({ id: "combo-1" } as never);

    const response = await GET(buildRequest({}), buildParams({ id: "combo-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: "combo-1" });
    expect(comboService.findCatalogoById).toHaveBeenCalledWith("combo-1");
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    vi.mocked(comboService.findCatalogoById).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({}), buildParams({ id: "combo-1" }));
    expect(response.status).toBe(500);
  });
});
