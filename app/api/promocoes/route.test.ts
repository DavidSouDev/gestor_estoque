// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest } from "../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../tests/helpers/auth";

vi.mock("../../services/promocao.service", () => ({
  promocaoService: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

import { promocaoService } from "../../services/promocao.service";
import { GET, POST } from "./route";

describe("GET /api/promocoes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}));
    expect(response.status).toBe(401);
  });

  it("retorna a lista de promoções da empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.list).mockResolvedValue([{ id: "promocao-1" }] as never);

    const response = await GET(buildRequest({ token }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "promocao-1" }]);
    expect(promocaoService.list).toHaveBeenCalledWith(testAuthPayload.empresaId);
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.list).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ token }));
    expect(response.status).toBe(500);
  });
});

describe("POST /api/promocoes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await POST(buildRequest({ method: "POST", body: { nome: "Promoção" } }));
    expect(response.status).toBe(401);
  });

  const corpoValido = {
    nome: "Promoção",
    dataInicio: "2026-01-01T00:00:00.000Z",
    dataFim: "2026-12-31T00:00:00.000Z",
    itens: [{ produtoId: "produto-1", preco: 9.9 }],
  };

  it("cria a promoção vinculando a empresa do token autenticado, ignorando empresaId do body", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.create).mockResolvedValue({ id: "promocao-nova" } as never);

    const response = await POST(
      buildRequest({
        method: "POST",
        token,
        body: { ...corpoValido, empresaId: "empresa-maliciosa" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: "promocao-nova" });
    expect(promocaoService.create).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "Promoção", empresaId: testAuthPayload.empresaId })
    );
  });

  it("retorna 400 quando não há nenhum item, sem chamar o service", async () => {
    const token = await buildAuthToken();

    const response = await POST(
      buildRequest({ method: "POST", token, body: { ...corpoValido, itens: [] } })
    );

    expect(response.status).toBe(400);
    expect(promocaoService.create).not.toHaveBeenCalled();
  });

  it("retorna 400 quando dataFim não é depois de dataInicio", async () => {
    const token = await buildAuthToken();

    const response = await POST(
      buildRequest({
        method: "POST",
        token,
        body: { ...corpoValido, dataInicio: "2026-06-01T00:00:00.000Z", dataFim: "2026-01-01T00:00:00.000Z" },
      })
    );

    expect(response.status).toBe(400);
    expect(promocaoService.create).not.toHaveBeenCalled();
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.create).mockRejectedValue(new Error("falha no banco"));

    const response = await POST(buildRequest({ method: "POST", token, body: corpoValido }));
    expect(response.status).toBe(500);
  });
});
