// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest, buildParams } from "../../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../../tests/helpers/auth";

vi.mock("../../../services/produto.service", () => ({
  produtoService: {
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { produtoService } from "../../../services/produto.service";
import { GET, PATCH, DELETE } from "./route";

const produtoDaEmpresa = { id: "produto-1", empresaId: testAuthPayload.empresaId };
const produtoDeOutraEmpresa = { id: "produto-2", empresaId: "outra-empresa" };

describe("GET /api/produtos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}), buildParams({ id: "produto-1" }));
    expect(response.status).toBe(401);
  });

  it("retorna 404 quando o produto não existe", async () => {
    const token = await buildAuthToken();
    vi.mocked(produtoService.findById).mockResolvedValue(null);

    const response = await GET(buildRequest({ token }), buildParams({ id: "inexistente" }));
    expect(response.status).toBe(404);
  });

  it("retorna 404 quando o produto pertence a outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(produtoService.findById).mockResolvedValue(produtoDeOutraEmpresa as never);

    const response = await GET(buildRequest({ token }), buildParams({ id: "produto-2" }));
    expect(response.status).toBe(404);
  });

  it("retorna o produto quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(produtoService.findById).mockResolvedValue(produtoDaEmpresa as never);

    const response = await GET(buildRequest({ token }), buildParams({ id: "produto-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(produtoDaEmpresa);
  });
});

describe("PATCH /api/produtos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 ao tentar atualizar produto de outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(produtoService.findById).mockResolvedValue(produtoDeOutraEmpresa as never);

    const response = await PATCH(
      buildRequest({ method: "PATCH", token, body: { nome: "Novo nome" } }),
      buildParams({ id: "produto-2" })
    );

    expect(response.status).toBe(404);
    expect(produtoService.update).not.toHaveBeenCalled();
  });

  it("atualiza o produto quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(produtoService.findById).mockResolvedValue(produtoDaEmpresa as never);
    vi.mocked(produtoService.update).mockResolvedValue({ ...produtoDaEmpresa, nome: "Novo nome" } as never);

    const response = await PATCH(
      buildRequest({ method: "PATCH", token, body: { nome: "Novo nome" } }),
      buildParams({ id: "produto-1" })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nome).toBe("Novo nome");
    expect(produtoService.update).toHaveBeenCalledWith("produto-1", { nome: "Novo nome" });
  });
});

describe("DELETE /api/produtos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 ao tentar remover produto de outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(produtoService.findById).mockResolvedValue(produtoDeOutraEmpresa as never);

    const response = await DELETE(buildRequest({ method: "DELETE", token }), buildParams({ id: "produto-2" }));

    expect(response.status).toBe(404);
    expect(produtoService.delete).not.toHaveBeenCalled();
  });

  it("remove (soft delete) o produto quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(produtoService.findById).mockResolvedValue(produtoDaEmpresa as never);
    vi.mocked(produtoService.delete).mockResolvedValue(produtoDaEmpresa as never);

    const response = await DELETE(buildRequest({ method: "DELETE", token }), buildParams({ id: "produto-1" }));

    expect(response.status).toBe(200);
    expect(produtoService.delete).toHaveBeenCalledWith("produto-1");
  });
});
