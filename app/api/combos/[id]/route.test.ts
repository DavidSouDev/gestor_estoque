// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest, buildParams } from "../../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../../tests/helpers/auth";

vi.mock("../../../services/combo.service", () => ({
  comboService: {
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { comboService } from "../../../services/combo.service";
import { GET, PATCH, DELETE } from "./route";

const comboDaEmpresa = { id: "combo-1", empresaId: testAuthPayload.empresaId };
const comboDeOutraEmpresa = { id: "combo-2", empresaId: "outra-empresa" };

describe("GET /api/combos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}), buildParams({ id: "combo-1" }));
    expect(response.status).toBe(401);
  });

  it("retorna 404 quando o combo não existe", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.findById).mockResolvedValue(null);

    const response = await GET(buildRequest({ token }), buildParams({ id: "inexistente" }));
    expect(response.status).toBe(404);
  });

  it("retorna 404 quando o combo pertence a outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.findById).mockResolvedValue(comboDeOutraEmpresa as never);

    const response = await GET(buildRequest({ token }), buildParams({ id: "combo-2" }));
    expect(response.status).toBe(404);
  });

  it("retorna o combo quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.findById).mockResolvedValue(comboDaEmpresa as never);

    const response = await GET(buildRequest({ token }), buildParams({ id: "combo-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(comboDaEmpresa);
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.findById).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ token }), buildParams({ id: "combo-1" }));
    expect(response.status).toBe(500);
  });
});

describe("PATCH /api/combos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 ao tentar atualizar combo de outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.findById).mockResolvedValue(comboDeOutraEmpresa as never);

    const response = await PATCH(
      buildRequest({ method: "PATCH", token, body: { nome: "Novo nome" } }),
      buildParams({ id: "combo-2" })
    );

    expect(response.status).toBe(404);
    expect(comboService.update).not.toHaveBeenCalled();
  });

  it("atualiza o combo quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.findById).mockResolvedValue(comboDaEmpresa as never);
    vi.mocked(comboService.update).mockResolvedValue({ ...comboDaEmpresa, nome: "Novo nome" } as never);

    const response = await PATCH(
      buildRequest({ method: "PATCH", token, body: { nome: "Novo nome" } }),
      buildParams({ id: "combo-1" })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nome).toBe("Novo nome");
    expect(comboService.update).toHaveBeenCalledWith("combo-1", { nome: "Novo nome" });
  });
});

describe("DELETE /api/combos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 ao tentar remover combo de outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.findById).mockResolvedValue(comboDeOutraEmpresa as never);

    const response = await DELETE(buildRequest({ method: "DELETE", token }), buildParams({ id: "combo-2" }));

    expect(response.status).toBe(404);
    expect(comboService.delete).not.toHaveBeenCalled();
  });

  it("remove o combo quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(comboService.findById).mockResolvedValue(comboDaEmpresa as never);
    vi.mocked(comboService.delete).mockResolvedValue(comboDaEmpresa as never);

    const response = await DELETE(buildRequest({ method: "DELETE", token }), buildParams({ id: "combo-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ message: "Combo removido com sucesso." });
    expect(comboService.delete).toHaveBeenCalledWith("combo-1");
  });
});
