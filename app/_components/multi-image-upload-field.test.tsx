import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./image-crop-modal", () => ({
  ImageCropModal: ({ file, onConfirm }: { file: File; onConfirm: (file: File) => void }) => (
    <button type="button" onClick={() => onConfirm(file)}>
      Aplicar recorte (mock)
    </button>
  ),
}));

import { MultiImageUploadField } from "./multi-image-upload-field";

function makeFile(name: string) {
  return new File(["conteudo"], name, { type: "image/png" });
}

describe("MultiImageUploadField", () => {
  it("com fieldName, renderiza um input hidden por foto pra participar do submit de um <form>", async () => {
    const uploadAction = vi.fn().mockResolvedValue({ url: "https://exemplo.com/a.png" });
    const user = userEvent.setup();
    render(<MultiImageUploadField slug="loja" uploadAction={uploadAction} fieldName="imagemUrl" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile("a.png"));
    await user.click(screen.getByRole("button", { name: "Aplicar recorte (mock)" }));

    const hidden = await screen.findByDisplayValue("https://exemplo.com/a.png");
    expect(hidden).toHaveAttribute("type", "hidden");
    expect(hidden).toHaveAttribute("name", "imagemUrl");
  });

  it("uma foto sozinha passa pelo recorte; selecionar 2+ de uma vez pula direto pro upload", async () => {
    const uploadAction = vi
      .fn()
      .mockResolvedValueOnce({ url: "https://exemplo.com/a.png" })
      .mockResolvedValueOnce({ url: "https://exemplo.com/b.png" });
    const user = userEvent.setup();
    render(<MultiImageUploadField slug="loja" uploadAction={uploadAction} fieldName="imagemUrl" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [makeFile("a.png"), makeFile("b.png")]);

    expect(screen.queryByRole("button", { name: "Aplicar recorte (mock)" })).not.toBeInTheDocument();
    expect(await screen.findByText(/2 fotos escolhidas/)).toBeInTheDocument();
    expect(uploadAction).toHaveBeenCalledTimes(2);
  });

  it("remover uma foto tira o input hidden correspondente", async () => {
    const uploadAction = vi.fn().mockResolvedValue({ url: "https://exemplo.com/a.png" });
    const user = userEvent.setup();
    render(<MultiImageUploadField slug="loja" uploadAction={uploadAction} fieldName="imagemUrl" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile("a.png"));
    await user.click(screen.getByRole("button", { name: "Aplicar recorte (mock)" }));
    await screen.findByDisplayValue("https://exemplo.com/a.png");

    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(screen.queryByDisplayValue("https://exemplo.com/a.png")).not.toBeInTheDocument();
  });

  it("chama onChange com a lista atual de fotos a cada mudança", async () => {
    const uploadAction = vi.fn().mockResolvedValue({ url: "https://exemplo.com/a.png" });
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MultiImageUploadField slug="loja" uploadAction={uploadAction} onChange={onChange} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile("a.png"));
    await user.click(screen.getByRole("button", { name: "Aplicar recorte (mock)" }));

    expect(onChange).toHaveBeenLastCalledWith(["https://exemplo.com/a.png"]);
  });

  it("mostra o erro devolvido pela action de upload", async () => {
    const uploadAction = vi.fn().mockResolvedValue({ error: "Formato inválido." });
    const user = userEvent.setup();
    render(<MultiImageUploadField slug="loja" uploadAction={uploadAction} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, makeFile("a.png"));
    await user.click(screen.getByRole("button", { name: "Aplicar recorte (mock)" }));

    expect(await screen.findByText("Formato inválido.")).toBeInTheDocument();
  });
});
