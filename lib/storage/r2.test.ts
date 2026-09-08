import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

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
    await expect(
      uploadImage(buildFile({ type: "application/pdf" }), "empresa-1", "produtos")
    ).rejects.toThrow(UploadError);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejeita um arquivo maior que o limite", async () => {
    await expect(
      uploadImage(buildFile({ sizeBytes: 5 * 1024 * 1024 }), "empresa-1", "produtos")
    ).rejects.toThrow(/tamanho máximo/i);
    expect(send).not.toHaveBeenCalled();
  });

  it("envia um arquivo válido e retorna a URL pública com o empresaId como prefixo da key", async () => {
    const url = await uploadImage(buildFile(), "empresa-1", "produtos");

    expect(send).toHaveBeenCalledTimes(1);
    expect(url).toMatch(/^https:\/\/cdn\.teste\.com\/empresa-1\/produtos\/.+\.png$/);
  });

  it("transforma um erro do SDK em um UploadError amigável", async () => {
    send.mockRejectedValueOnce(new Error("falha de rede"));

    await expect(uploadImage(buildFile(), "empresa-1", "produtos")).rejects.toThrow(UploadError);
  });
});

/**
 * `vi.resetModules()` + reimport isolado em cada caso: `getClient()` memoiza o
 * client num `let` de módulo, então testar o caminho de "env var ausente"
 * exige uma instância NOVA do módulo por caso — reaproveitar a importação do
 * topo do arquivo testaria um client já construído (e cacheado) por um caso
 * anterior.
 */
describe("uploadImage — credenciais obrigatórias (nunca autenticar com valor vazio)", () => {
  const VARIAVEIS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
  let ambienteOriginal: NodeJS.ProcessEnv;

  beforeEach(() => {
    ambienteOriginal = { ...process.env };
    send.mockReset();
    send.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = ambienteOriginal;
  });

  it.each(VARIAVEIS)(
    "lança [r2] citando %s quando ela está ausente, sem chegar a chamar o SDK",
    async (variavel) => {
      delete process.env[variavel];
      vi.resetModules();

      const { uploadImage: uploadImageIsolado } = await import("./r2");

      await expect(
        uploadImageIsolado(buildFile(), "empresa-1", "produtos")
      ).rejects.toThrow(new RegExp(`\\[r2\\].*${variavel}`));
      expect(send).not.toHaveBeenCalled();
    }
  );

  it.each(VARIAVEIS)(
    "trata %s vazia como ausente (nunca autentica com string vazia)",
    async (variavel) => {
      process.env[variavel] = "";
      vi.resetModules();

      const { uploadImage: uploadImageIsolado } = await import("./r2");

      await expect(
        uploadImageIsolado(buildFile(), "empresa-1", "produtos")
      ).rejects.toThrow(new RegExp(`\\[r2\\].*${variavel}`));
    }
  );
});

describe("deleteImage", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
  });

  it("apaga o objeto quando a URL pertence ao bucket público e ao empresaId informado", async () => {
    await deleteImage("https://cdn.teste.com/empresa-1/produtos/foto-123.png", "empresa-1");

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("ignora URLs que não pertencem ao bucket público (ex: URL digitada manualmente)", async () => {
    await deleteImage("https://outro-site.com/foto.png", "empresa-1");

    expect(send).not.toHaveBeenCalled();
  });

  it("ignora URL de outra empresa mesmo pertencendo ao bucket público (isolamento multi-tenant)", async () => {
    await deleteImage("https://cdn.teste.com/empresa-2/produtos/foto-123.png", "empresa-1");

    expect(send).not.toHaveBeenCalled();
  });

  it("não propaga erro do SDK — é best-effort", async () => {
    send.mockRejectedValueOnce(new Error("falha de rede"));

    await expect(
      deleteImage("https://cdn.teste.com/empresa-1/produtos/foto-123.png", "empresa-1")
    ).resolves.toBeUndefined();
  });
});
