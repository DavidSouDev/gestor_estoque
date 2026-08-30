import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleSection } from "./collapsible-section";

describe("CollapsibleSection", () => {
  it("renderiza fechado por padrão", () => {
    render(
      <CollapsibleSection>
        <p>Conteúdo extra</p>
      </CollapsibleSection>
    );

    const details = screen.getByText("Mais opções").closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
  });

  it("usa o título padrão 'Mais opções' quando nenhum título é informado", () => {
    render(
      <CollapsibleSection>
        <p>Conteúdo extra</p>
      </CollapsibleSection>
    );

    expect(screen.getByText("Mais opções")).toBeInTheDocument();
  });

  it("usa o título customizado quando informado", () => {
    render(
      <CollapsibleSection title="Detalhes avançados">
        <p>Conteúdo extra</p>
      </CollapsibleSection>
    );

    expect(screen.getByText("Detalhes avançados")).toBeInTheDocument();
  });

  it("expande ao clicar no título", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection>
        <p>Conteúdo extra</p>
      </CollapsibleSection>
    );

    const summary = screen.getByText("Mais opções");
    const details = summary.closest("details") as HTMLDetailsElement;

    await user.click(summary);

    expect(details.open).toBe(true);
  });

  it("colapsa novamente ao clicar duas vezes no título", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection>
        <p>Conteúdo extra</p>
      </CollapsibleSection>
    );

    const summary = screen.getByText("Mais opções");
    const details = summary.closest("details") as HTMLDetailsElement;

    await user.click(summary);
    expect(details.open).toBe(true);

    await user.click(summary);
    expect(details.open).toBe(false);
  });
});
