import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModoInterfacePicker } from "./modo-interface-picker";

describe("ModoInterfacePicker", () => {
  it("renderiza as duas opções de modo", () => {
    render(<ModoInterfacePicker value="COMPLETO" onChange={vi.fn()} />);

    expect(screen.getByText("Completo")).toBeInTheDocument();
    expect(screen.getByText("Simples")).toBeInTheDocument();
  });

  it("chama onChange com SIMPLES ao clicar na opção Simples", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ModoInterfacePicker value="COMPLETO" onChange={onChange} />);
    await user.click(screen.getByText("Simples"));

    expect(onChange).toHaveBeenCalledWith("SIMPLES");
  });

  it("chama onChange com COMPLETO ao clicar na opção Completo", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ModoInterfacePicker value="SIMPLES" onChange={onChange} />);
    await user.click(screen.getByText("Completo"));

    expect(onChange).toHaveBeenCalledWith("COMPLETO");
  });
});
