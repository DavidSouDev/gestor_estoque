// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest } from "../../../../tests/helpers/request";

vi.mock("../../../services/usuario.service", () => ({
  usuarioService: {
    validatePassword: vi.fn(),
  },
}));

import { usuarioService } from "../../../services/usuario.service";
import { POST } from "./route";

const usuarioAtivo = {
  id: "user-1",
  nome: "Admin",
  email: "admin@teste.com",
  senhaHash: "hash",
  role: "ADMIN",
  ativo: true,
  empresaId: "empresa-1",
  empresa: {
    id: "empresa-1",
    slug: "empresa-teste",
    deletedAt: null,
  },
};

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 400 quando faltam email ou senha", async () => {
    const response = await POST(buildRequest({ method: "POST", body: { email: "admin@teste.com" } }));
    expect(response.status).toBe(400);
    expect(usuarioService.validatePassword).not.toHaveBeenCalled();
  });

  it("retorna 401 quando as credenciais são inválidas", async () => {
    vi.mocked(usuarioService.validatePassword).mockResolvedValue(null);

    const response = await POST(
      buildRequest({ method: "POST", body: { email: "admin@teste.com", senha: "errada" } })
    );

    expect(response.status).toBe(401);
  });

  it("retorna 401 quando o usuário está inativo", async () => {
    vi.mocked(usuarioService.validatePassword).mockResolvedValue({
      ...usuarioAtivo,
      ativo: false,
    } as never);

    const response = await POST(
      buildRequest({ method: "POST", body: { email: "admin@teste.com", senha: "123456" } })
    );

    expect(response.status).toBe(401);
  });

  it("retorna 401 quando a empresa do usuário foi removida", async () => {
    // Alinhamento com o DAL (`empresa: { deletedAt: null }`): sem isso o login
    // emitiria um token de 7 dias que a revalidação rejeitaria no request
    // seguinte — "entra e é expulso na hora" (T-01-01).
    vi.mocked(usuarioService.validatePassword).mockResolvedValue({
      ...usuarioAtivo,
      empresa: { ...usuarioAtivo.empresa, deletedAt: new Date("2026-01-01T00:00:00Z") },
    } as never);

    const response = await POST(
      buildRequest({ method: "POST", body: { email: "admin@teste.com", senha: "123456" } })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    // Mesma mensagem genérica de credencial inválida: o cliente não deve
    // conseguir distinguir o motivo da rejeição (T-01-06).
    expect(body.message).toBe("Email ou senha inválidos.");
  });

  it("retorna 200 com token e dados do usuário em caso de sucesso", async () => {
    vi.mocked(usuarioService.validatePassword).mockResolvedValue(usuarioAtivo as never);

    const response = await POST(
      buildRequest({ method: "POST", body: { email: "admin@teste.com", senha: "123456" } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.token).toBe("string");
    expect(body.usuario).toEqual({
      id: "user-1",
      nome: "Admin",
      email: "admin@teste.com",
      role: "ADMIN",
      empresaId: "empresa-1",
    });
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    vi.mocked(usuarioService.validatePassword).mockRejectedValue(new Error("falha no banco"));

    const response = await POST(
      buildRequest({ method: "POST", body: { email: "admin@teste.com", senha: "123456" } })
    );

    expect(response.status).toBe(500);
  });
});
