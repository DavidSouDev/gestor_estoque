// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest } from "../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../tests/helpers/auth";

vi.mock("../../services/empresa.service", () => ({
  empresaService: {
    findById: vi.fn(),
    create: vi.fn(),
  },
}));

import { empresaService } from "../../services/empresa.service";
import { GET, POST } from "./route";

describe("GET /api/empresas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}));
    expect(response.status).toBe(401);
  });

  it("retorna a empresa do token autenticado como lista", async () => {
    const token = await buildAuthToken();
    vi.mocked(empresaService.findById).mockResolvedValue({ id: "empresa-1" } as never);

    const response = await GET(buildRequest({ token }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "empresa-1" }]);
    expect(empresaService.findById).toHaveBeenCalledWith(testAuthPayload.empresaId);
  });

  it("retorna lista vazia quando a empresa do token não é encontrada", async () => {
    const token = await buildAuthToken();
    vi.mocked(empresaService.findById).mockResolvedValue(null);

    const response = await GET(buildRequest({ token }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(empresaService.findById).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ token }));
    expect(response.status).toBe(500);
  });
});

describe("POST /api/empresas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await POST(buildRequest({ method: "POST", body: { nome: "Empresa", slug: "empresa" } }));
    expect(response.status).toBe(401);
  });

  it("cria a empresa a partir dos dados do body quando autenticado", async () => {
    const token = await buildAuthToken();
    vi.mocked(empresaService.create).mockResolvedValue({ id: "empresa-nova" } as never);

    const response = await POST(
      buildRequest({ method: "POST", token, body: { nome: "Empresa Nova", slug: "empresa-nova" } })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: "empresa-nova" });
    expect(empresaService.create).toHaveBeenCalledWith({ nome: "Empresa Nova", slug: "empresa-nova" });
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(empresaService.create).mockRejectedValue(new Error("falha no banco"));

    const response = await POST(
      buildRequest({ method: "POST", token, body: { nome: "Empresa Nova", slug: "empresa-nova" } })
    );
    expect(response.status).toBe(500);
  });
});
