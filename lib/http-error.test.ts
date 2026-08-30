import { describe, expect, it } from "vitest";
import { HttpError } from "./http-error";

describe("HttpError", () => {
  it("usa status 400 por padrão", () => {
    const error = new HttpError("mensagem");
    expect(error.status).toBe(400);
    expect(error.message).toBe("mensagem");
  });

  it("aceita status customizado", () => {
    const error = new HttpError("não encontrado", 404);
    expect(error.status).toBe(404);
  });

  it("é uma instância de Error", () => {
    const error = new HttpError("falha");
    expect(error).toBeInstanceOf(Error);
  });
});
