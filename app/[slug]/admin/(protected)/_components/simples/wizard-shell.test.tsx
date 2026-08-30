import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WizardShell } from "./wizard-shell";

describe("WizardShell", () => {
  it("renderiza título e subtítulo", () => {
    render(
      <WizardShell step={0} totalSteps={3} title="Título do passo" subtitle="Uma explicação">
        <p>conteúdo</p>
      </WizardShell>
    );

    expect(screen.getByRole("heading", { name: "Título do passo" })).toBeInTheDocument();
    expect(screen.getByText("Uma explicação")).toBeInTheDocument();
  });

  it("não renderiza subtítulo quando não é passado", () => {
    render(
      <WizardShell step={0} totalSteps={3} title="Título">
        <p>conteúdo</p>
      </WizardShell>
    );

    expect(screen.queryByText("Uma explicação")).not.toBeInTheDocument();
  });

  it("renderiza o botão Voltar e chama onBack ao clicar", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(
      <WizardShell step={1} totalSteps={3} title="Título" onBack={onBack}>
        <p>conteúdo</p>
      </WizardShell>
    );

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("não renderiza o botão Voltar quando onBack não é passado", () => {
    render(
      <WizardShell step={0} totalSteps={3} title="Título">
        <p>conteúdo</p>
      </WizardShell>
    );

    expect(screen.queryByRole("button", { name: "Voltar" })).not.toBeInTheDocument();
  });

  it("chama onNext ao clicar no botão de avançar", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();

    render(
      <WizardShell step={0} totalSteps={3} title="Título" onNext={onNext}>
        <p>conteúdo</p>
      </WizardShell>
    );

    await user.click(screen.getByRole("button", { name: "Próximo" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("usa nextLabel customizado", () => {
    render(
      <WizardShell step={0} totalSteps={3} title="Título" nextLabel="Salvar combo">
        <p>conteúdo</p>
      </WizardShell>
    );

    expect(screen.getByRole("button", { name: "Salvar combo" })).toBeInTheDocument();
  });

  it("desabilita o botão de avançar quando nextDisabled é verdadeiro", () => {
    render(
      <WizardShell step={0} totalSteps={3} title="Título" nextDisabled>
        <p>conteúdo</p>
      </WizardShell>
    );

    expect(screen.getByRole("button", { name: "Próximo" })).toBeDisabled();
  });

  it("mostra 'Aguarde...' e desabilita o botão quando nextPending é verdadeiro", () => {
    render(
      <WizardShell step={0} totalSteps={3} title="Título" nextPending nextLabel="Salvar">
        <p>conteúdo</p>
      </WizardShell>
    );

    const button = screen.getByRole("button", { name: "Aguarde..." });
    expect(button).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
  });

  it("não renderiza o botão de avançar quando hideNext é verdadeiro", () => {
    render(
      <WizardShell step={0} totalSteps={3} title="Título" hideNext>
        <p>conteúdo</p>
      </WizardShell>
    );

    expect(screen.queryByRole("button", { name: "Próximo" })).not.toBeInTheDocument();
  });

  it("marca como ativos apenas os indicadores até o passo atual", () => {
    const { container } = render(
      <WizardShell step={1} totalSteps={4} title="Título">
        <p>conteúdo</p>
      </WizardShell>
    );

    const indicadores = container.querySelectorAll(".mb-8 > span");
    expect(indicadores).toHaveLength(4);
    expect(indicadores[0]).toHaveClass("bg-slate-800");
    expect(indicadores[1]).toHaveClass("bg-slate-800");
    expect(indicadores[2]).toHaveClass("bg-slate-200");
    expect(indicadores[3]).toHaveClass("bg-slate-200");
  });
});
