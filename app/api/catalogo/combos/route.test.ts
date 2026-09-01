// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRequest } from "../../../../tests/helpers/request";

vi.mock("../../../services/combo.service", () => ({
  comboService: {
    listCatalogo: vi.fn(),
  },
}));

// O mock continua sendo pela MESMA string relativa que o handler importa. Trocar
// o import do handler para `@/` quebraria este mock silenciosamente.
vi.mock("../../../services/empresa.service", () => ({
  empresaService: {
    findPublicavelById: vi.fn(),
    findPublicavelBySlug: vi.fn(),
  },
}));

import { comboService } from "../../../services/combo.service";
import { empresaService } from "../../../services/empresa.service";
import { GET } from "./route";

const MENSAGEM_400 = "Informe o parâmetro empresaId ou slug.";

describe("GET /api/catalogo/combos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 400 quando nenhum dos parâmetros empresaId ou slug é informado", async () => {
    const response = await GET(buildRequest({ url: "http://localhost/api/test" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ message: MENSAGEM_400 });
    expect(comboService.listCatalogo).not.toHaveBeenCalled();
  });

  it("lista combos do catálogo usando o empresaId informado na query", async () => {
    vi.mocked(empresaService.findPublicavelById).mockResolvedValue({ id: "empresa-1" });
    vi.mocked(comboService.listCatalogo).mockResolvedValue([{ id: "combo-1" }] as never);

    const response = await GET(buildRequest({ url: "http://localhost/api/test?empresaId=empresa-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "combo-1" }]);
    expect(empresaService.findPublicavelById).toHaveBeenCalledWith("empresa-1");
    expect(comboService.listCatalogo).toHaveBeenCalledWith("empresa-1");
    // T-04-02: o branch do id NUNCA passa pelo resolvedor de slug.
    expect(empresaService.findPublicavelBySlug).not.toHaveBeenCalled();
  });

  it("resolve o empresaId a partir do slug quando empresaId não é informado", async () => {
    vi.mocked(empresaService.findPublicavelBySlug).mockResolvedValue({ id: "empresa-1" });
    vi.mocked(comboService.listCatalogo).mockResolvedValue([{ id: "combo-1" }] as never);

    const response = await GET(buildRequest({ url: "http://localhost/api/test?slug=empresa-teste" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: "combo-1" }]);
    expect(empresaService.findPublicavelBySlug).toHaveBeenCalledWith("empresa-teste");
    expect(comboService.listCatalogo).toHaveBeenCalledWith("empresa-1");
    // T-04-02: resolveu por slug e usou o id devolvido — não re-resolveu por id.
    expect(empresaService.findPublicavelById).not.toHaveBeenCalled();
  });

  it("retorna 400 quando o slug informado não resolve nenhuma empresa", async () => {
    vi.mocked(empresaService.findPublicavelBySlug).mockResolvedValue(null);

    const response = await GET(buildRequest({ url: "http://localhost/api/test?slug=inexistente" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ message: MENSAGEM_400 });
    expect(comboService.listCatalogo).not.toHaveBeenCalled();
    expect(empresaService.findPublicavelBySlug).toHaveBeenCalledTimes(1);
  });

  it("responde a slug de empresa BLOQUEADA exatamente como a slug inexistente (400, mesma mensagem)", async () => {
    // O funil `findPublicavelBySlug` devolve `null` tanto para "não existe" quanto
    // para "bloqueada" (04-01) — o handler não consegue distinguir os dois nem se
    // quisesse, que é precisamente a mitigação de T-04-01.
    vi.mocked(empresaService.findPublicavelBySlug).mockResolvedValue(null);

    const response = await GET(buildRequest({ url: "http://localhost/api/test?slug=loja-bloqueada" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ message: MENSAGEM_400 });
    expect(comboService.listCatalogo).not.toHaveBeenCalled();
    // Paridade de round trips: uma única resolução de tenant, igual ao caso feliz.
    expect(empresaService.findPublicavelBySlug).toHaveBeenCalledTimes(1);
    expect(empresaService.findPublicavelById).not.toHaveBeenCalled();
  });

  it("retorna 200 com corpo vazio quando o empresaId informado não resolve nenhuma empresa", async () => {
    // Linha 6 da tabela de paridade do 04-RESEARCH.md: hoje um empresaId
    // inexistente produz uma query sem resultados → 200 []. Preservado.
    vi.mocked(empresaService.findPublicavelById).mockResolvedValue(null);

    const response = await GET(buildRequest({ url: "http://localhost/api/test?empresaId=nao-existe" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
    expect(comboService.listCatalogo).not.toHaveBeenCalled();
  });

  it("responde a empresaId de empresa BLOQUEADA exatamente como a empresaId inexistente (200, corpo vazio)", async () => {
    // T-04-04: `empresaId` já é exposto no corpo público do catálogo, então
    // assume-se que o atacante o possui. Devolver 404 aqui tornaria a empresa
    // bloqueada MAIS distinguível, não menos.
    vi.mocked(empresaService.findPublicavelById).mockResolvedValue(null);

    const response = await GET(buildRequest({ url: "http://localhost/api/test?empresaId=empresa-bloqueada" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
    expect(comboService.listCatalogo).not.toHaveBeenCalled();
    expect(empresaService.findPublicavelById).toHaveBeenCalledTimes(1);
    expect(empresaService.findPublicavelBySlug).not.toHaveBeenCalled();
  });

  it("dá precedência ao empresaId quando slug e empresaId são informados juntos", async () => {
    vi.mocked(empresaService.findPublicavelById).mockResolvedValue({ id: "empresa-1" });
    vi.mocked(comboService.listCatalogo).mockResolvedValue([{ id: "combo-1" }] as never);

    const response = await GET(
      buildRequest({ url: "http://localhost/api/test?empresaId=empresa-1&slug=outra-loja" })
    );

    expect(response.status).toBe(200);
    expect(empresaService.findPublicavelById).toHaveBeenCalledWith("empresa-1");
    expect(empresaService.findPublicavelBySlug).not.toHaveBeenCalled();
  });

  it("retorna 500 quando o service lança um erro inesperado", async () => {
    vi.mocked(empresaService.findPublicavelById).mockResolvedValue({ id: "empresa-1" });
    vi.mocked(comboService.listCatalogo).mockRejectedValue(new Error("falha no banco"));

    const response = await GET(buildRequest({ url: "http://localhost/api/test?empresaId=empresa-1" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ message: "Erro ao listar combos." });
  });
});
