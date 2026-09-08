// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest } from "../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../tests/helpers/auth";
import { prismaMock } from "../../../tests/setup/prisma-mock";

vi.mock("../../services/empresa.service", () => ({
  empresaService: {
    findById: vi.fn(),
    create: vi.fn(),
  },
}));

import { empresaService } from "../../services/empresa.service";
import { GET, POST } from "./route";

/**
 * A role que autoriza `POST /api/empresas` vem do BANCO (`revalidarConta`),
 * nunca do payload do token — mesmo raciocínio de `app/api/termos/route.ts`.
 */
function mockContaComRole(role: "ADMIN" | "SUPERADMIN") {
  prismaMock.usuario.findFirst.mockResolvedValue({
    id: "user-1",
    email: "admin@teste.com",
    role,
    empresaId: "empresa-1",
    termoAceitoId: "termo-1",
    updatedAt: new Date("2020-01-01T00:00:00.000Z"),
    empresa: {
      slug: "empresa-teste",
      acessoAte: null,
      trialFim: new Date("2099-01-01T03:00:00.000Z"),
      canceladoEm: null,
      acessoVitalicio: false,
      ultimoStatusAuditado: "TRIAL",
    },
  } as never);
}

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

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * Sem esta checagem, qualquer usuário autenticado (ADMIN comum de qualquer
   * empresa) podia criar empresas arbitrárias sem administrador — e, combinado
   * com `POST /api/usuarios`, virar administrador delas.
   */
  it("retorna 403 para ADMIN comum, sem chamar o service", async () => {
    const token = await buildAuthToken();
    mockContaComRole("ADMIN");

    const response = await POST(
      buildRequest({ method: "POST", token, body: { nome: "Empresa Nova", slug: "empresa-nova" } })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ message: "Ação não permitida." });
    expect(empresaService.create).not.toHaveBeenCalled();
  });

  it("cria a empresa a partir dos dados do body quando o chamador é SUPERADMIN no banco", async () => {
    const token = await buildAuthToken({ role: "SUPERADMIN" });
    mockContaComRole("SUPERADMIN");
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
    const token = await buildAuthToken({ role: "SUPERADMIN" });
    mockContaComRole("SUPERADMIN");
    vi.mocked(empresaService.create).mockRejectedValue(new Error("falha no banco"));

    const response = await POST(
      buildRequest({ method: "POST", token, body: { nome: "Empresa Nova", slug: "empresa-nova" } })
    );
    expect(response.status).toBe(500);
  });
});
