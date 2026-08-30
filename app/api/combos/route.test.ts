// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest } from "../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../tests/helpers/auth";

vi.mock("../../services/combo.service", () => ({
  comboService: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

import { comboService } from "../../services/combo.service";
import { GET, POST } from "./route";

describe("GET /api/combos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}));
    expect(response.status).toBe(401);
  });

  it("retorna a lista de combos da empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.list).mockResolvedValue([{ id: "combo-1" }] as never);

    const response = await GET(buildRequest({ token }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "combo-1" }]);
    expect(comboService.list).toHaveBeenCalledWith(testAuthPayload.empresaId);
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.list).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ token }));
    expect(response.status).toBe(500);
  });
});

describe("POST /api/combos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await POST(buildRequest({ method: "POST", body: { nome: "Combo" } }));
    expect(response.status).toBe(401);
  });

  it("cria o combo vinculando a empresa do token autenticado, ignorando empresaId do body", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.create).mockResolvedValue({ id: "combo-novo" } as never);

    const response = await POST(
      buildRequest({
        method: "POST",
        token,
        body: { nome: "Combo", empresaId: "empresa-maliciosa" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: "combo-novo" });
    expect(comboService.create).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "Combo", empresaId: testAuthPayload.empresaId })
    );
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.create).mockRejectedValue(new Error("falha no banco"));

    const response = await POST(buildRequest({ method: "POST", token, body: { nome: "Combo" } }));
    expect(response.status).toBe(500);
  });
});
