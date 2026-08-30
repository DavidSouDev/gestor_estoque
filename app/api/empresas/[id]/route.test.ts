// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest, buildParams } from "../../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../../tests/helpers/auth";

vi.mock("../../../services/empresa.service", () => ({
  empresaService: {
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { empresaService } from "../../../services/empresa.service";
import { GET, PATCH, DELETE } from "./route";

const empresaDoToken = { id: testAuthPayload.empresaId, nome: "Empresa Teste" };

describe("GET /api/empresas/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}), buildParams({ id: testAuthPayload.empresaId }));
    expect(response.status).toBe(401);
  });

  it("retorna 404 quando o id não corresponde à empresa do token, sem consultar o service", async () => {
    const token = await buildAuthToken();

    const response = await GET(buildRequest({ token }), buildParams({ id: "outra-empresa" }));

    expect(response.status).toBe(404);
    expect(empresaService.findById).not.toHaveBeenCalled();
  });

  it("retorna 404 quando a empresa do token não é encontrada", async () => {
    const token = await buildAuthToken();
    vi.mocked(empresaService.findById).mockResolvedValue(null);

    const response = await GET(buildRequest({ token }), buildParams({ id: testAuthPayload.empresaId }));
    expect(response.status).toBe(404);
  });

  it("retorna a empresa quando o id corresponde ao token", async () => {
    const token = await buildAuthToken();
    vi.mocked(empresaService.findById).mockResolvedValue(empresaDoToken as never);

    const response = await GET(buildRequest({ token }), buildParams({ id: testAuthPayload.empresaId }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(empresaDoToken);
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(empresaService.findById).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ token }), buildParams({ id: testAuthPayload.empresaId }));
    expect(response.status).toBe(500);
  });
});

describe("PATCH /api/empresas/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 ao tentar atualizar empresa diferente da do token", async () => {
    const token = await buildAuthToken();

    const response = await PATCH(
      buildRequest({ method: "PATCH", token, body: { nome: "Novo nome" } }),
      buildParams({ id: "outra-empresa" })
    );

    expect(response.status).toBe(404);
    expect(empresaService.update).not.toHaveBeenCalled();
  });

  it("atualiza a empresa quando o id corresponde ao token", async () => {
    const token = await buildAuthToken();
    vi.mocked(empresaService.update).mockResolvedValue({ ...empresaDoToken, nome: "Novo nome" } as never);

    const response = await PATCH(
      buildRequest({ method: "PATCH", token, body: { nome: "Novo nome" } }),
      buildParams({ id: testAuthPayload.empresaId })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nome).toBe("Novo nome");
    expect(empresaService.update).toHaveBeenCalledWith(testAuthPayload.empresaId, { nome: "Novo nome" });
  });
});

describe("DELETE /api/empresas/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 ao tentar remover empresa diferente da do token", async () => {
    const token = await buildAuthToken();

    const response = await DELETE(
      buildRequest({ method: "DELETE", token }),
      buildParams({ id: "outra-empresa" })
    );

    expect(response.status).toBe(404);
    expect(empresaService.delete).not.toHaveBeenCalled();
  });

  it("remove a empresa quando o id corresponde ao token", async () => {
    const token = await buildAuthToken();
    vi.mocked(empresaService.delete).mockResolvedValue(empresaDoToken as never);

    const response = await DELETE(
      buildRequest({ method: "DELETE", token }),
      buildParams({ id: testAuthPayload.empresaId })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ message: "Empresa removida com sucesso." });
    expect(empresaService.delete).toHaveBeenCalledWith(testAuthPayload.empresaId);
  });
});
