// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest, buildParams } from "../../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../../tests/helpers/auth";

vi.mock("../../../services/usuario.service", () => ({
  usuarioService: {
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { usuarioService } from "../../../services/usuario.service";
import { GET, PATCH, DELETE } from "./route";

const usuarioDaEmpresa = { id: "usuario-1", empresaId: testAuthPayload.empresaId };
const usuarioDeOutraEmpresa = { id: "usuario-2", empresaId: "outra-empresa" };

describe("GET /api/usuarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}), buildParams({ id: "usuario-1" }));
    expect(response.status).toBe(401);
  });

  it("retorna 404 quando o usuário não existe", async () => {
    const token = await buildAuthToken();
    vi.mocked(usuarioService.findById).mockResolvedValue(null);

    const response = await GET(buildRequest({ token }), buildParams({ id: "inexistente" }));
    expect(response.status).toBe(404);
  });

  it("retorna 404 quando o usuário pertence a outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(usuarioService.findById).mockResolvedValue(usuarioDeOutraEmpresa as never);

    const response = await GET(buildRequest({ token }), buildParams({ id: "usuario-2" }));
    expect(response.status).toBe(404);
  });

  it("retorna o usuário quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(usuarioService.findById).mockResolvedValue(usuarioDaEmpresa as never);

    const response = await GET(buildRequest({ token }), buildParams({ id: "usuario-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(usuarioDaEmpresa);
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(usuarioService.findById).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ token }), buildParams({ id: "usuario-1" }));
    expect(response.status).toBe(500);
  });
});

describe("PATCH /api/usuarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 ao tentar atualizar usuário de outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(usuarioService.findById).mockResolvedValue(usuarioDeOutraEmpresa as never);

    const response = await PATCH(
      buildRequest({ method: "PATCH", token, body: { nome: "Novo nome" } }),
      buildParams({ id: "usuario-2" })
    );

    expect(response.status).toBe(404);
    expect(usuarioService.update).not.toHaveBeenCalled();
  });

  it("atualiza o usuário quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(usuarioService.findById).mockResolvedValue(usuarioDaEmpresa as never);
    vi.mocked(usuarioService.update).mockResolvedValue({ ...usuarioDaEmpresa, nome: "Novo nome" } as never);

    const response = await PATCH(
      buildRequest({ method: "PATCH", token, body: { nome: "Novo nome" } }),
      buildParams({ id: "usuario-1" })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nome).toBe("Novo nome");
    expect(usuarioService.update).toHaveBeenCalledWith("usuario-1", { nome: "Novo nome" });
  });
});

describe("DELETE /api/usuarios/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 ao tentar remover usuário de outra empresa", async () => {
    const token = await buildAuthToken();
    vi.mocked(usuarioService.findById).mockResolvedValue(usuarioDeOutraEmpresa as never);

    const response = await DELETE(buildRequest({ method: "DELETE", token }), buildParams({ id: "usuario-2" }));

    expect(response.status).toBe(404);
    expect(usuarioService.delete).not.toHaveBeenCalled();
  });

  it("remove (soft delete) o usuário quando pertence à empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(usuarioService.findById).mockResolvedValue(usuarioDaEmpresa as never);
    vi.mocked(usuarioService.delete).mockResolvedValue(usuarioDaEmpresa as never);

    const response = await DELETE(buildRequest({ method: "DELETE", token }), buildParams({ id: "usuario-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ message: "Usuário removido com sucesso." });
    expect(usuarioService.delete).toHaveBeenCalledWith("usuario-1");
  });
});
