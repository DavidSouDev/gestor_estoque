// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest } from "../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../tests/helpers/auth";
import { HttpError } from "@/lib/http-error";

vi.mock("../../services/usuario.service", () => ({
  usuarioService: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

import { usuarioService } from "../../services/usuario.service";
import { GET, POST } from "./route";

describe("GET /api/usuarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}));
    expect(response.status).toBe(401);
  });

  it("retorna a lista de usuários da empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(usuarioService.list).mockResolvedValue([{ id: "usuario-1" }] as never);

    const response = await GET(buildRequest({ token }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "usuario-1" }]);
    expect(usuarioService.list).toHaveBeenCalledWith(testAuthPayload.empresaId);
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(usuarioService.list).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ token }));
    expect(response.status).toBe(500);
  });
});

describe("POST /api/usuarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cria o usuário a partir dos dados do body (rota não exige autenticação)", async () => {
    vi.mocked(usuarioService.create).mockResolvedValue({ id: "usuario-novo" } as never);

    const response = await POST(
      buildRequest({
        method: "POST",
        body: { nome: "Usuário", email: "usuario@teste.com", senha: "123456", empresaId: "empresa-1" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: "usuario-novo" });
    expect(usuarioService.create).toHaveBeenCalledWith({
      nome: "Usuário",
      email: "usuario@teste.com",
      senha: "123456",
      empresaId: "empresa-1",
    });
  });

  it("retorna o status do HttpError quando o service rejeita com um erro de negócio", async () => {
    vi.mocked(usuarioService.create).mockRejectedValue(
      new HttpError("Este email já está em uso.", 409)
    );

    const response = await POST(
      buildRequest({
        method: "POST",
        body: { nome: "Usuário", email: "usuario@teste.com", senha: "123456", empresaId: "empresa-1" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toBe("Este email já está em uso.");
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    vi.mocked(usuarioService.create).mockRejectedValue(new Error("falha no banco"));

    const response = await POST(
      buildRequest({
        method: "POST",
        body: { nome: "Usuário", email: "usuario@teste.com", senha: "123456", empresaId: "empresa-1" },
      })
    );
    expect(response.status).toBe(500);
  });
});
