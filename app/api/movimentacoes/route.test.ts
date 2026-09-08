// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest } from "../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../tests/helpers/auth";

vi.mock("../../services/movimentacao-estoque.service", () => ({
  movimentacaoEstoqueService: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

import { movimentacaoEstoqueService } from "../../services/movimentacao-estoque.service";
import { GET, POST } from "./route";

describe("GET /api/movimentacoes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}));
    expect(response.status).toBe(401);
  });

  it("retorna a lista de movimentações da empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(movimentacaoEstoqueService.list).mockResolvedValue([{ id: "mov-1" }] as never);

    const response = await GET(buildRequest({ token }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "mov-1" }]);
    expect(movimentacaoEstoqueService.list).toHaveBeenCalledWith(testAuthPayload.empresaId);
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(movimentacaoEstoqueService.list).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ token }));
    expect(response.status).toBe(500);
  });
});

describe("POST /api/movimentacoes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await POST(
      buildRequest({ method: "POST", body: { produtoId: "produto-1", tipo: "ENTRADA", quantidade: 10 } })
    );
    expect(response.status).toBe(401);
  });

  it("cria a movimentação vinculando empresa e usuário do token autenticado, ignorando dados do body", async () => {
    const token = await buildAuthToken();
    vi.mocked(movimentacaoEstoqueService.create).mockResolvedValue({ id: "mov-novo" } as never);

    const response = await POST(
      buildRequest({
        method: "POST",
        token,
        body: {
          produtoId: "produto-1",
          tipo: "ENTRADA",
          quantidade: 10,
          empresaId: "empresa-maliciosa",
          usuarioId: "usuario-malicioso",
        },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: "mov-novo" });
    expect(movimentacaoEstoqueService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        produtoId: "produto-1",
        tipo: "ENTRADA",
        quantidade: 10,
        empresaId: testAuthPayload.empresaId,
        usuarioId: testAuthPayload.sub,
      })
    );
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(movimentacaoEstoqueService.create).mockRejectedValue(new Error("falha no banco"));

    const response = await POST(
      buildRequest({
        method: "POST",
        token,
        body: { produtoId: "produto-1", tipo: "ENTRADA", quantidade: 10 },
      })
    );
    expect(response.status).toBe(500);
  });

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * Sem esta validação, `{tipo:"SAIDA", quantidade:-500}` invertia a
   * subtração em soma no service, fabricando estoque.
   */
  it("retorna 400 quando quantidade é negativa, sem chamar o service", async () => {
    const token = await buildAuthToken();

    const response = await POST(
      buildRequest({
        method: "POST",
        token,
        body: { produtoId: "produto-1", tipo: "SAIDA", quantidade: -500 },
      })
    );

    expect(response.status).toBe(400);
    expect(movimentacaoEstoqueService.create).not.toHaveBeenCalled();
  });

  it("retorna 400 quando tipo não é um valor válido do enum", async () => {
    const token = await buildAuthToken();

    const response = await POST(
      buildRequest({
        method: "POST",
        token,
        body: { produtoId: "produto-1", tipo: "TIPO_INVENTADO", quantidade: 10 },
      })
    );

    expect(response.status).toBe(400);
    expect(movimentacaoEstoqueService.create).not.toHaveBeenCalled();
  });
});
