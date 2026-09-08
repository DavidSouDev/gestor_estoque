// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest } from "@/tests/helpers/request";
import { buildAuthToken, testAuthPayload } from "@/tests/helpers/auth";
import { HttpError } from "@/lib/http-error";
import { prismaMock } from "@/tests/setup/prisma-mock";

vi.mock("@/app/services/assinatura.service", () => ({
  assinaturaService: { criarCheckout: vi.fn() },
}));

import { assinaturaService } from "@/app/services/assinatura.service";
import { POST } from "./route";

const URL_CHECKOUT = "http://localhost/api/assinaturas/checkout";

const checkoutCriado = {
  url: "https://sandbox.asaas.com/checkoutSession/show?id=chk_7b2f4c8e9a1d",
  checkoutId: "chk_7b2f4c8e9a1d",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(assinaturaService.criarCheckout).mockResolvedValue(checkoutCriado);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/assinaturas/checkout", () => {
  it("T-03-16: sem Authorization devolve 401 e o service nem chega a ser chamado", async () => {
    const response = await POST(buildRequest({ method: "POST", url: URL_CHECKOUT }));

    expect(response.status).toBe(401);
    expect(assinaturaService.criarCheckout).not.toHaveBeenCalled();
  });

  it("autenticado: devolve 200 com { url, checkoutId } da sessão", async () => {
    const token = await buildAuthToken();

    const response = await POST(buildRequest({ method: "POST", url: URL_CHECKOUT, token }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(checkoutCriado);
    expect(assinaturaService.criarCheckout).toHaveBeenCalledWith(testAuthPayload.empresaId);
  });

  it("C-08: o tenant cobrado vem da sessão mesmo com outro empresaId no corpo", async () => {
    const token = await buildAuthToken();

    const response = await POST(
      buildRequest({
        method: "POST",
        url: URL_CHECKOUT,
        token,
        body: { empresaId: "empresa-maliciosa" },
      })
    );

    expect(response.status).toBe(200);
    expect(assinaturaService.criarCheckout).toHaveBeenCalledTimes(1);
    // Asserção EXATA sobre o argumento: `objectContaining` deixaria passar uma
    // implementação que espalhasse o corpo e sobrescrevesse o tenant.
    expect(assinaturaService.criarCheckout).toHaveBeenCalledWith(testAuthPayload.empresaId);
    expect(assinaturaService.criarCheckout).not.toHaveBeenCalledWith("empresa-maliciosa");
  });

  it("D-07: propaga o 502 do gateway com a mensagem genérica do HttpError", async () => {
    const token = await buildAuthToken();

    vi.mocked(assinaturaService.criarCheckout).mockRejectedValue(
      new HttpError("Não foi possível iniciar o pagamento. Tente novamente.", 502)
    );

    const response = await POST(buildRequest({ method: "POST", url: URL_CHECKOUT, token }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ message: "Não foi possível iniciar o pagamento. Tente novamente." });
  });

  it("empresa inexistente: o 404 do service chega ao cliente como 404", async () => {
    const token = await buildAuthToken();

    vi.mocked(assinaturaService.criarCheckout).mockRejectedValue(
      new HttpError("Empresa não encontrada.", 404)
    );

    const response = await POST(buildRequest({ method: "POST", url: URL_CHECKOUT, token }));

    expect(response.status).toBe(404);
  });

  it("Pitfall 1: empresa BLOQUEADA consegue iniciar o checkout", async () => {
    const token = await buildAuthToken();

    // Assinatura vencida há muito: exatamente o cliente que precisa pagar.
    prismaMock.usuario.findFirst.mockResolvedValue({
      id: "user-1",
      email: "admin@teste.com",
      role: "ADMIN",
      empresaId: "empresa-1",
      updatedAt: new Date("2020-01-01T00:00:00.000Z"),
      // Termos em dia (mesmo `id` do vigente que o stub global devolve): este
      // caso mede o opt-out do gate de ASSINATURA, e só ele. Sem isto o gate de
      // termos da Fase 6 responderia 403 antes de o handler ser alcançado, e o
      // caso passaria a medir a coisa errada.
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

    const response = await POST(buildRequest({ method: "POST", url: URL_CHECKOUT, token }));

    // Bloquear o caminho de pagamento trancaria o cliente do lado de fora sem
    // como voltar (T-04-10): este é o único endpoint que opta por sair da guarda.
    expect(response.status).not.toBe(402);
    expect(response.status).toBe(200);
    expect(assinaturaService.criarCheckout).toHaveBeenCalledWith(testAuthPayload.empresaId);
  });

  it("empresa CANCELADA também consegue iniciar o checkout", async () => {
    const token = await buildAuthToken();

    prismaMock.usuario.findFirst.mockResolvedValue({
      id: "user-1",
      email: "admin@teste.com",
      role: "ADMIN",
      empresaId: "empresa-1",
      updatedAt: new Date("2020-01-01T00:00:00.000Z"),
      // Termos em dia, pelo mesmo motivo do caso acima.
      termoAceitoId: "termo-1",
      empresa: {
        slug: "empresa-teste",
        acessoAte: new Date("2020-01-01T03:00:00.000Z"),
        trialFim: null,
        canceladoEm: new Date("2020-06-01T03:00:00.000Z"),
        acessoVitalicio: false,
        ultimoStatusAuditado: "CANCELADO",
      },
    } as never);

    const response = await POST(buildRequest({ method: "POST", url: URL_CHECKOUT, token }));

    expect(response.status).toBe(200);
    expect(assinaturaService.criarCheckout).toHaveBeenCalledTimes(1);
  });

  it("o opt-out não dispensa a revalidação: conta revogada continua 401", async () => {
    const token = await buildAuthToken();
    prismaMock.usuario.findFirst.mockResolvedValue(null as never);

    const response = await POST(buildRequest({ method: "POST", url: URL_CHECKOUT, token }));

    expect(response.status).toBe(401);
    expect(assinaturaService.criarCheckout).not.toHaveBeenCalled();
  });

  it("erro inesperado: 500 genérico ao cliente, detalhe apenas no console.error", async () => {
    const token = await buildAuthToken();
    const detalhe = "connect ECONNREFUSED 127.0.0.1:5432";

    vi.mocked(assinaturaService.criarCheckout).mockRejectedValue(new Error(detalhe));

    const response = await POST(buildRequest({ method: "POST", url: URL_CHECKOUT, token }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain(detalhe);
    expect(console.error).toHaveBeenCalled();
  });
});
