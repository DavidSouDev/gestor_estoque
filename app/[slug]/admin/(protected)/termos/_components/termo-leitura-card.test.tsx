import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TermoLeituraCard } from "./termo-leitura-card";

const termo = {
  versao: 3,
  conteudo: "Texto da v3.",
  publicadoEmFormatado: "05/09/2026",
};

describe("TermoLeituraCard", () => {
  describe("com termo vigente", () => {
    it("renderiza o título da tela como heading de nível 1", () => {
      render(<TermoLeituraCard termo={termo} />);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Termos de Uso");
    });

    it("mostra versão e data de publicação na mesma frase da tela de aceite", () => {
      render(<TermoLeituraCard termo={termo} />);

      // Mesmo separador `·` de `aceite-card.tsx`: uma frase só, aprendida uma vez.
      expect(screen.getByText("Versão 3 · publicada em 05/09/2026")).toBeInTheDocument();
    });

    it("põe o texto numa região rolável alcançável por teclado", () => {
      render(<TermoLeituraCard termo={termo} />);

      const regiao = screen.getByRole("region", { name: "Texto dos Termos de Uso" });

      // `tabIndex` não é enfeite: uma caixa rolável sem filho focável é
      // inalcançável por teclado.
      expect(regiao).toHaveAttribute("tabindex", "0");
      expect(regiao.className).toContain("whitespace-pre-wrap");
      expect(regiao.className).toContain("overflow-y-auto");
      expect(regiao).toHaveTextContent("Texto da v3.");
    });

    it("ESCAPE: marcação embutida no conteúdo aparece LITERAL, nunca como HTML", () => {
      // A prova de que `dangerouslySetInnerHTML` não existe neste componente
      // (D-05 / T-fhk-02). O `conteudo` é controlado pelo SUPERADMIN, mas a
      // superfície de injeção some por construção, não por confiança.
      const { container } = render(
        <TermoLeituraCard termo={{ ...termo, conteudo: "Antes <b>negrito</b> depois" }} />
      );

      const regiao = screen.getByRole("region", { name: "Texto dos Termos de Uso" });

      expect(regiao).toHaveTextContent("<b>negrito</b>");
      expect(container.querySelector("b")).toBeNull();
    });

    it("SÓ-LEITURA: nenhum botão e nenhum formulário", () => {
      // Um formulário aqui seria um SEGUNDO caminho de escrita para
      // `AceiteTermo`, que a Fase 6 manteve único de propósito (T-fhk-04).
      const { container } = render(<TermoLeituraCard termo={termo} />);

      expect(screen.queryAllByRole("button")).toHaveLength(0);
      expect(container.querySelector("form")).toBeNull();
    });
  });

  describe("sem termo publicado", () => {
    it("mostra um estado vazio honesto, sem região de texto", () => {
      render(<TermoLeituraCard termo={null} />);

      expect(
        screen.getByText("Nenhuma versão dos Termos de Uso está publicada no momento.")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "Texto dos Termos de Uso" })
      ).toBeNull();
    });

    it("não inventa versão nem data", () => {
      const { container } = render(<TermoLeituraCard termo={null} />);

      expect(container.textContent).not.toMatch(/Versão \d/);
    });
  });
});
