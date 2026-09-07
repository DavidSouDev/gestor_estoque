// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest, buildParams } from "../../../../../tests/helpers/request";

vi.mock("../../../../services/produto.service", () => ({
  produtoService: {
    findCatalogoById: vi.fn(),
  },
}));

import { produtoService } from "../../../../services/produto.service";
import { GET } from "./route";

describe("GET /api/catalogo/produtos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 quando o produto não existe no catálogo", async () => {
    vi.mocked(produtoService.findCatalogoById).mockResolvedValue(null);

    const response = await GET(buildRequest({}), buildParams({ id: "inexistente" }));
    expect(response.status).toBe(404);
  });

  // T-04-04. O gate mora no service (que devolve `null` para empresa bloqueada);
  // o handler não ganha branch novo, e é justamente isso que torna as duas
  // respostas byte-idênticas. NÃO usar `notFound()` aqui: o try/catch em volta o
  // converteria em 500 — fail-open (Pitfall 3 / T-04-07).
  it("responde 404 com o MESMO corpo do id inexistente quando a empresa está bloqueada", async () => {
    vi.mocked(produtoService.findCatalogoById).mockResolvedValue(null);

    const inexistente = await GET(buildRequest({}), buildParams({ id: "inexistente" }));
    const corpoInexistente = await inexistente.json();

    const bloqueada = await GET(buildRequest({}), buildParams({ id: "produto-de-empresa-bloqueada" }));
    const corpoBloqueada = await bloqueada.json();

    expect(bloqueada.status).toBe(404);
    expect(corpoBloqueada).toEqual({ message: "Produto não encontrado." });
    expect(corpoBloqueada).toEqual(corpoInexistente);
    expect(inexistente.status).toBe(bloqueada.status);
  });

  it("retorna o produto do catálogo quando encontrado", async () => {
    vi.mocked(produtoService.findCatalogoById).mockResolvedValue({ id: "produto-1" } as never);

    const response = await GET(buildRequest({}), buildParams({ id: "produto-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: "produto-1" });
    expect(produtoService.findCatalogoById).toHaveBeenCalledWith("produto-1");
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    vi.mocked(produtoService.findCatalogoById).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({}), buildParams({ id: "produto-1" }));
    expect(response.status).toBe(500);
  });
});
