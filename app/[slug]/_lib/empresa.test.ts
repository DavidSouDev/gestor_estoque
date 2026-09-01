// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const { notFoundMock } = vi.hoisted(() => {
  // `notFound()` do Next interrompe o render lançando. O mock lança um erro
  // identificável para que o teste possa afirmar "esta leitura vira 404" sem
  // depender do runtime de renderização do Next.
  const notFoundMock = vi.fn(() => {
    throw new Error("NOT_FOUND");
  });

  return { notFoundMock };
});

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/app/services/empresa.service", () => ({
  empresaService: {
    findBySlug: vi.fn(),
    findBrandingBySlug: vi.fn(),
  },
}));

import { empresaService } from "@/app/services/empresa.service";
import { getEmpresaBranding, getEmpresaCatalogo } from "./empresa";

/** Corpo que `findBySlug` devolve para uma empresa que PODE publicar. */
const CATALOGO_PUBLICAVEL = {
  id: "empresa-1",
  nome: "Loja Saudável",
  slug: "saudavel",
  logo: null,
  banner: null,
  descricao: null,
  telefone: null,
  instagram: null,
  primaryColor: "#ff0000",
  accentColor: "#00ff00",
  produtos: [],
  combos: [],
  promocoes: [],
};

/** Corpo que `findBrandingBySlug` devolve para uma empresa BLOQUEADA. */
const BRANDING_BLOQUEADA = {
  id: "empresa-2",
  nome: "Loja Bloqueada",
  slug: "bloqueada",
  logo: null,
  banner: null,
  descricao: null,
  telefone: null,
  instagram: null,
  primaryColor: "#ff0000",
  accentColor: "#00ff00",
  bloqueada: true,
};

describe("app/[slug]/_lib/empresa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getEmpresaCatalogo — caminho GATEADO (ACC-03 / D-07)", () => {
    it("chama notFound quando a empresa está bloqueada", async () => {
      // O gate mora em `findBySlug` (plano 04-01): bloqueada devolve null.
      vi.mocked(empresaService.findBySlug).mockResolvedValue(null);

      await expect(getEmpresaCatalogo("bloqueada")).rejects.toThrow("NOT_FOUND");
      expect(notFoundMock).toHaveBeenCalledTimes(1);
    });

    it("chama notFound quando o slug nunca existiu — comportamento idêntico ao bloqueado", async () => {
      vi.mocked(empresaService.findBySlug).mockResolvedValue(null);

      await expect(getEmpresaCatalogo("inexistente")).rejects.toThrow("NOT_FOUND");
      expect(notFoundMock).toHaveBeenCalledTimes(1);
    });

    it("devolve o catálogo quando a empresa pode publicar", async () => {
      vi.mocked(empresaService.findBySlug).mockResolvedValue(CATALOGO_PUBLICAVEL as never);

      await expect(getEmpresaCatalogo("saudavel")).resolves.toEqual(CATALOGO_PUBLICAVEL);
      expect(notFoundMock).not.toHaveBeenCalled();
    });
  });

  describe("getEmpresaBranding — caminho DELIBERADAMENTE não gateado (D-09)", () => {
    it("NÃO chama notFound para empresa bloqueada: devolve o branding com bloqueada: true", async () => {
      vi.mocked(empresaService.findBrandingBySlug).mockResolvedValue(BRANDING_BLOQUEADA as never);

      // Este é o Achado crítico 2 do 04-RESEARCH.md: se esta leitura virasse 404,
      // o cliente bloqueado não conseguiria nem chegar na tela de login para pagar.
      await expect(getEmpresaBranding("bloqueada")).resolves.toEqual(BRANDING_BLOQUEADA);
      expect(notFoundMock).not.toHaveBeenCalled();
    });

    it("chama notFound quando o slug nunca existiu", async () => {
      vi.mocked(empresaService.findBrandingBySlug).mockResolvedValue(null);

      await expect(getEmpresaBranding("inexistente")).rejects.toThrow("NOT_FOUND");
      expect(notFoundMock).toHaveBeenCalledTimes(1);
    });

    it("consome findBrandingBySlug e nunca findBySlug", async () => {
      vi.mocked(empresaService.findBrandingBySlug).mockResolvedValue({
        ...BRANDING_BLOQUEADA,
        slug: "so-branding",
        bloqueada: false,
      } as never);

      await getEmpresaBranding("so-branding");

      expect(empresaService.findBrandingBySlug).toHaveBeenCalledWith("so-branding");
      expect(empresaService.findBySlug).not.toHaveBeenCalled();
    });
  });
});
