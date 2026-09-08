// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest, buildParams } from "../../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../../tests/helpers/auth";
import { HttpError } from "@/lib/http-error";

vi.mock("../../../services/movimentacao-estoque.service", () => ({
  movimentacaoEstoqueService: {
    findById: vi.fn(),
    delete: vi.fn(),
  },
}));

import { movimentacaoEstoqueService } from "../../../services/movimentacao-estoque.service";
import { GET, DELETE } from "./route";

const movimentacaoDaEmpresa = {
  id: "mov-1",
  produto: { id: "produto-1", empresaId: testAuthPayload.empresaId },
};
const movimentacaoDeOutraEmpresa = {
  id: "mov-2",
  produto: { id: "produto-2", empresaId: "outra-empresa" },
};

describe("GET /api/movimentacoes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}), buildParams({ id: "mov-1" }));
    expect(response.status).toBe(401);
  });

  it("retorna 404 quando a movimentação não existe", async () => {
    const token = await buildAuthToken();
    vi.mocked(movimentacaoEstoqueService.findById).mockResolvedValue(null);

    const response = await GET(buildRequest({ token }), buildParams({ id: "inexistente" }));
    expect(response.status).toBe(404);
  });

  it("retorna 404 quando a movimentação pertence a produto de outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(movimentacaoEstoqueService.findById).mockResolvedValue(movimentacaoDeOutraEmpresa as never);

    const response = await GET(buildRequest({ token }), buildParams({ id: "mov-2" }));
    expect(response.status).toBe(404);
  });

  it("retorna a movimentação quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(movimentacaoEstoqueService.findById).mockResolvedValue(movimentacaoDaEmpresa as never);

    const response = await GET(buildRequest({ token }), buildParams({ id: "mov-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(movimentacaoDaEmpresa);
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(movimentacaoEstoqueService.findById).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ token }), buildParams({ id: "mov-1" }));
    expect(response.status).toBe(500);
  });
});

describe("DELETE /api/movimentacoes/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await DELETE(buildRequest({ method: "DELETE" }), buildParams({ id: "mov-1" }));
    expect(response.status).toBe(401);
  });

  it("retorna 404 ao tentar remover movimentação de produto de outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(movimentacaoEstoqueService.findById).mockResolvedValue(movimentacaoDeOutraEmpresa as never);

    const response = await DELETE(buildRequest({ method: "DELETE", token }), buildParams({ id: "mov-2" }));

    expect(response.status).toBe(404);
    expect(movimentacaoEstoqueService.delete).not.toHaveBeenCalled();
  });

  it("remove a movimentação quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(movimentacaoEstoqueService.findById).mockResolvedValue(movimentacaoDaEmpresa as never);
    vi.mocked(movimentacaoEstoqueService.delete).mockResolvedValue(movimentacaoDaEmpresa as never);

    const response = await DELETE(buildRequest({ method: "DELETE", token }), buildParams({ id: "mov-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ message: "Movimentação removida com sucesso." });
    expect(movimentacaoEstoqueService.delete).toHaveBeenCalledWith("mov-1");
  });

  it("repassa status e mensagem quando o service recusa a remoção com HttpError", async () => {
    const token = await buildAuthToken();
    vi.mocked(movimentacaoEstoqueService.findById).mockResolvedValue(movimentacaoDaEmpresa as never);
    vi.mocked(movimentacaoEstoqueService.delete).mockRejectedValue(
      new HttpError("Não é possível remover: o estoque já foi consumido abaixo da quantidade desta entrada.", 409)
    );

    const response = await DELETE(buildRequest({ method: "DELETE", token }), buildParams({ id: "mov-1" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      message: "Não é possível remover: o estoque já foi consumido abaixo da quantidade desta entrada.",
    });
  });
});
