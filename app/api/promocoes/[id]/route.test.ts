// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest, buildParams } from "../../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../../tests/helpers/auth";

vi.mock("../../../services/promocao.service", () => ({
  promocaoService: {
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { promocaoService } from "../../../services/promocao.service";
import { GET, PATCH, DELETE } from "./route";

const promocaoDaEmpresa = { id: "promocao-1", empresaId: testAuthPayload.empresaId };
const promocaoDeOutraEmpresa = { id: "promocao-2", empresaId: "outra-empresa" };

describe("GET /api/promocoes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}), buildParams({ id: "promocao-1" }));
    expect(response.status).toBe(401);
  });

  it("retorna 404 quando a promoção não existe", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.findById).mockResolvedValue(null);

    const response = await GET(buildRequest({ token }), buildParams({ id: "inexistente" }));
    expect(response.status).toBe(404);
  });

  it("retorna 404 quando a promoção pertence a outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.findById).mockResolvedValue(promocaoDeOutraEmpresa as never);

    const response = await GET(buildRequest({ token }), buildParams({ id: "promocao-2" }));
    expect(response.status).toBe(404);
  });

  it("retorna a promoção quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.findById).mockResolvedValue(promocaoDaEmpresa as never);

    const response = await GET(buildRequest({ token }), buildParams({ id: "promocao-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(promocaoDaEmpresa);
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.findById).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ token }), buildParams({ id: "promocao-1" }));
    expect(response.status).toBe(500);
  });
});

describe("PATCH /api/promocoes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 ao tentar atualizar promoção de outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.findById).mockResolvedValue(promocaoDeOutraEmpresa as never);

    const response = await PATCH(
      buildRequest({ method: "PATCH", token, body: { nome: "Novo nome" } }),
      buildParams({ id: "promocao-2" })
    );

    expect(response.status).toBe(404);
    expect(promocaoService.update).not.toHaveBeenCalled();
  });

  it("atualiza a promoção quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.findById).mockResolvedValue(promocaoDaEmpresa as never);
    vi.mocked(promocaoService.update).mockResolvedValue({ ...promocaoDaEmpresa, nome: "Novo nome" } as never);

    const response = await PATCH(
      buildRequest({ method: "PATCH", token, body: { nome: "Novo nome" } }),
      buildParams({ id: "promocao-1" })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nome).toBe("Novo nome");
    expect(promocaoService.update).toHaveBeenCalledWith("promocao-1", { nome: "Novo nome" });
  });
});

describe("DELETE /api/promocoes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 ao tentar remover promoção de outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.findById).mockResolvedValue(promocaoDeOutraEmpresa as never);

    const response = await DELETE(buildRequest({ method: "DELETE", token }), buildParams({ id: "promocao-2" }));

    expect(response.status).toBe(404);
    expect(promocaoService.delete).not.toHaveBeenCalled();
  });

  it("remove a promoção quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(promocaoService.findById).mockResolvedValue(promocaoDaEmpresa as never);
    vi.mocked(promocaoService.delete).mockResolvedValue(promocaoDaEmpresa as never);

    const response = await DELETE(buildRequest({ method: "DELETE", token }), buildParams({ id: "promocao-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ message: "Promoção removida com sucesso." });
    expect(promocaoService.delete).toHaveBeenCalledWith("promocao-1");
  });
});
