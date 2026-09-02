import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterForm } from "./register-form";

/**
 * O termo vigente que a page (`app/registro/page.tsx`) passa por prop. Os três
 * campos são exatamente a projeção que `termoVigente()` devolve menos
 * `publicadoEm`, que esta tela não usa.
 */
const TERMO = {
  id: "termo-vigente-1",
  versao: 3,
  conteudo: "Primeira cláusula dos termos.\n\nSegunda cláusula dos termos.",
};

describe("RegisterForm", () => {
  it("renderiza os campos obrigatórios do formulário", () => {
    render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

    expect(screen.getByLabelText("Nome da empresa")).toBeRequired();
    expect(screen.getByLabelText("Seu nome")).toBeRequired();
    expect(screen.getByLabelText("E-mail")).toBeRequired();
    expect(screen.getByLabelText("Senha")).toBeRequired();
    expect(screen.getByLabelText("Confirmar senha")).toBeRequired();
  });

  it("renderiza o seletor de modo de interface com as duas opções", () => {
    render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

    expect(screen.getByText("Completo")).toBeInTheDocument();
    expect(screen.getByText("Simples")).toBeInTheDocument();
  });

  it("atualiza o input escondido modoInterface ao trocar o modo", async () => {
    const user = userEvent.setup();
    render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

    const hiddenInput = document.querySelector('input[name="modoInterface"]') as HTMLInputElement;
    expect(hiddenInput.value).toBe("COMPLETO");

    await user.click(screen.getByText("Simples"));

    expect(hiddenInput.value).toBe("SIMPLES");
  });

  it("não exibe mensagem de erro quando a action ainda não retornou erro", () => {
    render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

    expect(screen.queryByText(/erro/i)).not.toBeInTheDocument();
  });

  it("exibe a mensagem de erro retornada pela action", async () => {
    const action = vi.fn().mockResolvedValue({ error: "E-mail já cadastrado" });
    const user = userEvent.setup();

    render(<RegisterForm action={action} termo={TERMO} />);

    await user.type(screen.getByLabelText("Nome da empresa"), "Mercearia São José");
    await user.type(screen.getByLabelText("Seu nome"), "David");
    await user.type(screen.getByLabelText("E-mail"), "david@teste.com");
    await user.type(screen.getByLabelText("Senha"), "senha1234");
    await user.type(screen.getByLabelText("Confirmar senha"), "senha1234");
    // Sem isto o submit nem dispara: o checkbox `required` faz a validação
    // nativa barrar o formulário antes da action. É a mesma linha que os 9
    // specs e2e passaram a precisar — a metade client de D-11 funcionando.
    await user.click(screen.getByLabelText(/Li e aceito os Termos de Uso/));

    await user.click(screen.getByRole("button", { name: /criar minha loja/i }));

    expect(await screen.findByText("E-mail já cadastrado")).toBeInTheDocument();
    expect(action).toHaveBeenCalled();
  });

  describe("bloco de Termos de Uso (D-11, metade client)", () => {
    it("renderiza o disclosure com o número da versão recebida", () => {
      render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

      const disclosure = screen.getByText("Ler os Termos de Uso (versão 3)");

      expect(disclosure).toBeInTheDocument();
      expect(disclosure.tagName).toBe("SUMMARY");
    });

    it("mantém o disclosure fechado por padrão", () => {
      const { container } = render(
        <RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />
      );

      const details = container.querySelector("details") as HTMLDetailsElement;

      expect(details).not.toBeNull();
      expect(details.open).toBe(false);
    });

    it("renderiza o texto completo do termo dentro de uma região rolável e focável", () => {
      render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

      const regiao = screen.getByRole("region", { name: "Texto dos Termos de Uso" });

      expect(regiao).toHaveTextContent("Primeira cláusula dos termos.");
      expect(regiao).toHaveTextContent("Segunda cláusula dos termos.");
      expect(regiao).toHaveAttribute("tabindex", "0");
    });

    it("exige o checkbox de aceite antes do submit", () => {
      render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

      const checkbox = screen.getByLabelText(/Li e aceito os Termos de Uso/) as HTMLInputElement;

      expect(checkbox).toBeInTheDocument();
      expect(checkbox.type).toBe("checkbox");
      expect(checkbox.name).toBe("aceiteTermos");
      expect(checkbox).toBeRequired();
      expect(checkbox.checked).toBe(false);
    });

    it("envia o id do termo que o usuário viu num input escondido", () => {
      render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

      const hidden = document.querySelector('input[name="termoId"]') as HTMLInputElement;

      expect(hidden).not.toBeNull();
      expect(hidden.type).toBe("hidden");
      expect(hidden.value).toBe("termo-vigente-1");
    });

    it("não renderiza o texto do termo por HTML bruto (D-05, sem XSS)", () => {
      const termoComMarcacao = {
        ...TERMO,
        conteudo: '<img src=x onerror="alert(1)"> cláusula',
      };

      const { container } = render(
        <RegisterForm action={vi.fn().mockResolvedValue({})} termo={termoComMarcacao} />
      );

      expect(container.querySelector("img")).toBeNull();
      expect(
        screen.getByRole("region", { name: "Texto dos Termos de Uso" })
      ).toHaveTextContent('<img src=x onerror="alert(1)"> cláusula');
    });

    it("mantém o rótulo do botão de submit intacto (13 locators e2e dependem dele)", () => {
      render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

      expect(screen.getByRole("button", { name: "Criar minha loja" })).toBeInTheDocument();
    });
  });
});
