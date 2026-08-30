import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberStepper } from "./number-stepper";

describe("NumberStepper", () => {
  it("chama onChange com o valor incrementado ao clicar em +", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<NumberStepper value={5} onChange={onChange} />);
    await user.click(screen.getByText("+"));

    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("chama onChange com o valor decrementado ao clicar em −", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<NumberStepper value={5} onChange={onChange} />);
    await user.click(screen.getByText("−"));

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("não deixa o valor ir abaixo do mínimo ao decrementar", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<NumberStepper value={0} onChange={onChange} min={0} />);
    await user.click(screen.getByText("−"));

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("usa o mínimo como fallback quando o input recebe um valor inválido", () => {
    const onChange = vi.fn();

    render(<NumberStepper value={5} onChange={onChange} min={2} />);
    const input = screen.getByRole("spinbutton");

    fireEvent.change(input, { target: { value: "" } });

    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it("respeita o mínimo customizado ao digitar um valor menor que o permitido", () => {
    const onChange = vi.fn();

    render(<NumberStepper value={5} onChange={onChange} min={3} />);
    const input = screen.getByRole("spinbutton");

    fireEvent.change(input, { target: { value: "1" } });

    expect(onChange).toHaveBeenLastCalledWith(3);
  });
});
