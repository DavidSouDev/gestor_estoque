// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest } from "../../../tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "../../../tests/helpers/auth";
import { prismaMock } from "../../../tests/setup/prisma-mock";

vi.mock("../../services/produto.service", () => ({
  produtoService: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

import { produtoService } from "../../services/produto.service";
import { GET, POST } from "./route";

describe("GET /api/produtos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await GET(buildRequest({}));
    expect(response.status).toBe(401);
  });

  it("retorna a lista de produtos da empresa autenticada", async () => {
    const token = await buildAuthToken();
    vi.mocked(produtoService.list).mockResolvedValue([{ id: "produto-1" }] as never);

    const response = await GET(buildRequest({ token }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "produto-1" }]);
    expect(produtoService.list).toHaveBeenCalledWith(testAuthPayload.empresaId);
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    const token = await buildAuthToken();
    vi.mocked(produtoService.list).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ token }));
    expect(response.status).toBe(500);
  });
});

describe("POST /api/produtos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando não autenticado", async () => {
    const response = await POST(buildRequest({ method: "POST", body: { nome: "Produto" } }));
    expect(response.status).toBe(401);
  });

  it("cria o produto vinculando a empresa do token autenticado, ignorando empresaId do body", async () => {
    const token = await buildAuthToken();
    vi.mocked(produtoService.create).mockResolvedValue({ id: "produto-novo" } as never);

    const response = await POST(
      buildRequest({
        method: "POST",
        token,
        body: {
          codigo: "PROD-1",
          nome: "Produto",
          precoVarejo: 10,
          precoAtacado: 8,
          empresaId: "empresa-maliciosa",
        },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: "produto-novo" });
    expect(produtoService.create).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "Produto", empresaId: testAuthPayload.empresaId })
    );
  });

  /**
   * ⚠️ CASO CRÍTICO — não remova nem relaxe.
   *
   * Antes da validação, `precoVarejo` negativo seguia direto para o Prisma sem
   * checagem nenhuma.
   */
  it("retorna 400 quando precoVarejo é negativo, sem chamar o service", async () => {
    const token = await buildAuthToken();

    const response = await POST(
      buildRequest({
        method: "POST",
        token,
        body: { codigo: "PROD-1", nome: "Produto", precoVarejo: -10, precoAtacado: 8 },
      })
    );

    expect(response.status).toBe(400);
    expect(produtoService.create).not.toHaveBeenCalled();
  });

  it("retorna 400 quando falta um campo obrigatório (precoAtacado)", async () => {
    const token = await buildAuthToken();

    const response = await POST(
      buildRequest({
        method: "POST",
        token,
        body: { codigo: "PROD-1", nome: "Produto", precoVarejo: 10 },
      })
    );

    expect(response.status).toBe(400);
    expect(produtoService.create).not.toHaveBeenCalled();
  });
});

/**
 * ACC-02, ponta a ponta, numa rota escolhida por ser QUALQUER UMA.
 *
 * Este arquivo não foi editado fora deste bloco, e `app/api/produtos/route.ts`
 * não foi tocado por esta fase: o handler já devolvia `{ status: error.status }`
 * genericamente. É essa propriedade — e não um `if` novo em cada rota — que faz
 * o gate valer para os 29 handlers de uma vez. Se alguém trocar o repasse
 * genérico por um 401 hardcodado aqui, este teste cai.
 */
describe("/api/produtos — gate de assinatura herdado da guarda de auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.usuario.findFirst.mockResolvedValue({
      id: "user-1",
      email: "admin@teste.com",
      role: "ADMIN",
      empresaId: "empresa-1",
      updatedAt: new Date("2020-01-01T00:00:00.000Z"),
      // Termos em dia (mesmo `id` do vigente que o stub global devolve): estes
      // casos medem o gate de ASSINATURA, e o 402 tem que vir de lá. Sem isto o
      // gate de termos da Fase 6 também estaria armado e o 402 continuaria
      // aparecendo — mas por precedência, não por ser o único gate ativo.
      termoAceitoId: "termo-1",
      empresa: {
        slug: "empresa-teste",
        acessoAte: new Date("2020-01-01T03:00:00.000Z"),
        trialFim: null,
        canceladoEm: null,
        acessoVitalicio: false,
        ultimoStatusAuditado: "BLOQUEADO",
      },
    } as never);
  });

  it("GET de empresa bloqueada: 402 e o service nem chega a ser chamado", async () => {
    const token = await buildAuthToken();

    const response = await GET(buildRequest({ token }));
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body).toEqual({ message: "Assinatura suspensa por falta de pagamento." });
    expect(produtoService.list).not.toHaveBeenCalled();
  });

  it("POST de empresa bloqueada: 402, nenhuma escrita", async () => {
    const token = await buildAuthToken();

    const response = await POST(
      buildRequest({ method: "POST", token, body: { nome: "Produto" } })
    );

    expect(response.status).toBe(402);
    expect(produtoService.create).not.toHaveBeenCalled();
  });
});
