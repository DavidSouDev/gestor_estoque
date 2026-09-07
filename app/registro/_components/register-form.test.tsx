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

/**
 * Nome acessível do botão de submit. Sempre como STRING, nunca como regex: o
 * rótulo do botão de aceite CONTÉM este texto como substring, e uma regex casaria
 * parcialmente com os dois assim que o modal estivesse aberto.
 */
const SUBMIT = "Criar minha loja";
const ACEITAR = "Li e aceito, criar minha loja";

type Usuario = ReturnType<typeof userEvent.setup>;

/**
 * Preencher os cinco campos obrigatórios é PRÉ-REQUISITO de todo teste que
 * espera o modal abrir. O jsdom roda `reportValidity()` antes de disparar o
 * evento `submit`: com um `required` vazio nenhum submit acontece, e o gate do
 * modal — que vive no `onSubmit` — nunca seria alcançado.
 */
async function preencherObrigatorios(user: Usuario) {
  const campos: [string, string][] = [
    ["Nome da empresa", "Mercearia São José"],
    ["Seu nome", "David"],
    ["E-mail", "david@teste.com"],
    ["Senha", "senha1234"],
    ["Confirmar senha", "senha1234"],
  ];

  for (const [rotulo, valor] of campos) {
    const campo = screen.getByLabelText(rotulo);

    // `clear()` antes de digitar torna o helper reutilizável DENTRO do mesmo
    // teste. Depois que uma action termina, o React 19 reseta o formulário e em
    // seguida repõe o valor anterior no campo — digitar por cima concatenaria os
    // dois, produzindo um e-mail inválido que `reportValidity()` barraria antes
    // de qualquer submit.
    await user.clear(campo);
    await user.type(campo, valor);
  }
}

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

    await preencherObrigatorios(user);
    await user.click(screen.getByRole("button", { name: SUBMIT }));
    await user.click(screen.getByRole("button", { name: ACEITAR }));

    expect(await screen.findByText("E-mail já cadastrado")).toBeInTheDocument();
    expect(action).toHaveBeenCalled();
  });

  describe("bloco de Termos de Uso (D-11, metade client)", () => {
    it("não renderiza mais gatilho de leitura separado nem caixa de seleção de aceite", () => {
      render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

      // Com o `<dialog>` fechado ele está sob `display: none` e fora da árvore de
      // acessibilidade: todo botão alcançável aqui é do corpo do formulário. Nenhum
      // deles pode mais falar dos termos — a leitura deixou de ser um passo lateral.
      expect(screen.queryAllByRole("button", { name: /Termos/ })).toHaveLength(0);

      // O aceite deixou de ser um controle marcável: não existe mais NENHUMA caixa
      // de seleção no formulário, o que torna impossível aceitar sem abrir o modal.
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    });

    it("mantém o modal fechado por padrão", () => {
      const { container } = render(
        <RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />
      );

      const dialogos = container.querySelectorAll("dialog");

      expect(dialogos).toHaveLength(1);
      expect((dialogos[0] as HTMLDialogElement).open).toBe(false);
    });

    it("não usa mais disclosure (<details>) para os termos", () => {
      const { container } = render(
        <RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />
      );

      expect(container.querySelector("details")).toBeNull();
    });

    it("mantém o hidden input de prova vazio antes de qualquer aceite", () => {
      render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

      const prova = document.querySelector('input[name="termosAceitos"]') as HTMLInputElement;

      // T-Q08-03: o campo nasce vazio e só é escrito dentro do `onSubmit`, depois
      // do aceite. Um `defaultValue` já preenchido seria elevação de privilégio.
      expect(prova).not.toBeNull();
      expect(prova.type).toBe("hidden");
      expect(prova.value).toBe("");
    });

    it("o primeiro submit válido abre o modal em vez de chamar a action", async () => {
      const action = vi.fn().mockResolvedValue({});
      const user = userEvent.setup();
      const { container } = render(<RegisterForm action={action} termo={TERMO} />);

      const dialogo = container.querySelector("dialog") as HTMLDialogElement;
      expect(dialogo.open).toBe(false);

      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: SUBMIT }));

      expect(dialogo.open).toBe(true);
      expect(action).not.toHaveBeenCalled();
    });

    it("exibe o título com a versão recebida e o texto numa região rolável e focável", async () => {
      const user = userEvent.setup();
      render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

      expect(
        screen.queryByRole("region", { name: "Texto dos Termos de Uso" })
      ).not.toBeInTheDocument();

      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: SUBMIT }));

      expect(
        screen.getByRole("heading", { name: "Termos de Uso (versão 3)" })
      ).toBeInTheDocument();

      const regiao = screen.getByRole("region", { name: "Texto dos Termos de Uso" });

      expect(regiao).toHaveTextContent("Primeira cláusula dos termos.");
      expect(regiao).toHaveTextContent("Segunda cláusula dos termos.");
      expect(regiao).toHaveAttribute("tabindex", "0");
    });

    it("aceitar fecha o modal e chama a action uma vez com a prova e o termoId", async () => {
      const action = vi.fn().mockResolvedValue({});
      const user = userEvent.setup();
      const { container } = render(<RegisterForm action={action} termo={TERMO} />);

      const dialogo = container.querySelector("dialog") as HTMLDialogElement;

      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: SUBMIT }));
      await user.click(screen.getByRole("button", { name: ACEITAR }));

      expect(dialogo.open).toBe(false);
      expect(action).toHaveBeenCalledTimes(1);

      // `calls[0][1]` é o `FormData` que a Server Action recebeu — o payload real,
      // não o DOM. É ele que amarra o contrato com `app/registro/actions.ts`.
      const payload = action.mock.calls[0][1] as FormData;

      expect(payload.get("termosAceitos")).toBe("true");
      expect(payload.get("termoId")).toBe("termo-vigente-1");
    });

    it("não reabre o modal num segundo submit depois do aceite", async () => {
      const action = vi.fn().mockResolvedValue({ error: "E-mail já cadastrado" });
      const user = userEvent.setup();
      const { container } = render(<RegisterForm action={action} termo={TERMO} />);

      const dialogo = container.querySelector("dialog") as HTMLDialogElement;

      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: SUBMIT }));
      await user.click(screen.getByRole("button", { name: ACEITAR }));

      expect(await screen.findByText("E-mail já cadastrado")).toBeInTheDocument();

      // D-C observado de verdade: depois que a action termina, o React 19 reseta
      // o formulário e o hidden input de prova volta a ficar VAZIO. Sem a
      // reescrita dentro do `onSubmit`, este segundo envio chegaria ao servidor
      // sem prova e seria recusado com a E3.
      expect(
        (document.querySelector('input[name="termosAceitos"]') as HTMLInputElement).value
      ).toBe("");

      // Preencher de novo é o que um usuário corrigindo o e-mail faria.
      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: SUBMIT }));

      expect(dialogo.open).toBe(false);
      expect(action).toHaveBeenCalledTimes(2);

      // D-C: o mesmo reset apaga o hidden input de prova. Reescrevê-lo a cada
      // submit autorizado é o que impede o segundo envio de ser recusado com a E3
      // por um motivo que o usuário não teria como entender.
      const segundoPayload = action.mock.calls[1][1] as FormData;

      expect(segundoPayload.get("termosAceitos")).toBe("true");
    });

    it("fecha o modal pelo botão Fechar sem submeter, e o submit seguinte reabre", async () => {
      const action = vi.fn().mockResolvedValue({});
      const user = userEvent.setup();
      const { container } = render(<RegisterForm action={action} termo={TERMO} />);

      const dialogo = container.querySelector("dialog") as HTMLDialogElement;

      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: SUBMIT }));
      expect(dialogo.open).toBe(true);

      await user.click(screen.getByRole("button", { name: "Fechar" }));

      // T-Q08-02: os dois botões do modal vivem DENTRO do `<form>`. Sem
      // `type="button"` explícito, fechar o modal submeteria o cadastro.
      expect(dialogo.open).toBe(false);
      expect(action).not.toHaveBeenCalled();

      // D-D: fechar não é aceitar. O pedágio continua de pé.
      await user.click(screen.getByRole("button", { name: SUBMIT }));

      expect(dialogo.open).toBe(true);
      expect(action).not.toHaveBeenCalled();
    });

    it("envia o id do termo que o usuário viu num input escondido", () => {
      render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

      const hidden = document.querySelector('input[name="termoId"]') as HTMLInputElement;

      expect(hidden).not.toBeNull();
      expect(hidden.type).toBe("hidden");
      expect(hidden.value).toBe("termo-vigente-1");
    });

    it("não renderiza o texto do termo por HTML bruto (D-05, sem XSS)", async () => {
      const termoComMarcacao = {
        ...TERMO,
        conteudo: '<img src=x onerror="alert(1)"> cláusula',
      };
      const user = userEvent.setup();

      const { container } = render(
        <RegisterForm action={vi.fn().mockResolvedValue({})} termo={termoComMarcacao} />
      );

      await preencherObrigatorios(user);
      await user.click(screen.getByRole("button", { name: SUBMIT }));

      expect(container.querySelector("img")).toBeNull();
      expect(
        screen.getByRole("region", { name: "Texto dos Termos de Uso" })
      ).toHaveTextContent('<img src=x onerror="alert(1)"> cláusula');
    });

    it("mantém o rótulo do botão de submit intacto (11 specs e2e dependem dele)", () => {
      render(<RegisterForm action={vi.fn().mockResolvedValue({})} termo={TERMO} />);

      expect(screen.getByRole("button", { name: SUBMIT })).toBeInTheDocument();
    });
  });
});
