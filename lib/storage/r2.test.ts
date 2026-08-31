import { describe, expect, it, vi, beforeEach } from "vitest";

const send = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class PutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  class DeleteObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }

  class S3Client {
    send = send;
  }

  return { S3Client, PutObjectCommand, DeleteObjectCommand };
});

process.env.R2_ACCOUNT_ID = "account-teste";
process.env.R2_ACCESS_KEY_ID = "key-teste";
process.env.R2_SECRET_ACCESS_KEY = "secret-teste";
process.env.R2_BUCKET = "bucket-teste";
process.env.R2_PUBLIC_URL = "https://cdn.teste.com";

const { uploadImage, deleteImage, UploadError } = await import("./r2");

function buildFile(options: { type?: string; sizeBytes?: number } = {}) {
  const { type = "image/png", sizeBytes = 1024 } = options;
  return new File([new Uint8Array(sizeBytes)], "foto.png", { type });
}

describe("uploadImage", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
  });

  it("rejeita um tipo de arquivo não permitido", async () => {
    await expect(uploadImage(buildFile({ type: "application/pdf" }), "produtos")).rejects.toThrow(
      UploadError
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("rejeita um arquivo maior que o limite", async () => {
    await expect(
      uploadImage(buildFile({ sizeBytes: 5 * 1024 * 1024 }), "produtos")
    ).rejects.toThrow(/tamanho máximo/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("envia um arquivo válido e retorna a URL pública", async () => {
    const url = await uploadImage(buildFile(), "produtos");

    expect(send).toHaveBeenCalledTimes(1);
    expect(url).toMatch(/^https:\/\/cdn\.teste\.com\/produtos\/.+\.png$/);
  });

  it("transforma um erro do SDK em um UploadError amigável", async () => {
    send.mockRejectedValueOnce(new Error("falha de rede"));

    await expect(uploadImage(buildFile(), "produtos")).rejects.toThrow(UploadError);
  });
});

describe("deleteImage", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
  });

  it("apaga o objeto quando a URL pertence ao bucket público configurado", async () => {
    await deleteImage("https://cdn.teste.com/produtos/foto-123.png");

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("ignora URLs que não pertencem ao bucket público (ex: URL digitada manualmente)", async () => {
    await deleteImage("https://outro-site.com/foto.png");

    expect(send).not.toHaveBeenCalled();
  });

  it("não propaga erro do SDK — é best-effort", async () => {
    send.mockRejectedValueOnce(new Error("falha de rede"));

    await expect(deleteImage("https://cdn.teste.com/produtos/foto-123.png")).resolves.toBeUndefined();
  });
});
