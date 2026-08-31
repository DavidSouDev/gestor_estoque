// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest } from "@/tests/helpers/request";
import { envelopePagamento } from "@/tests/helpers/asaas";

/**
 * Primeiro teste de route handler de webhook do projeto.
 *
 * O contrato de resposta aqui é OPOSTO ao do resto da API: todo caminho
 * autenticado devolve exatamente 200, inclusive payload malformado, evento
 * desconhecido e entrega duplicada. Quinze respostas não-200 consecutivas
 * pausam a fila de sincronização do Asaas, e eventos parados por 14 dias são
 * apagados permanentemente — um cliente que pagou nunca teria `acessoAte`
 * estendido (Pitfall 2). O único não-200 deliberado é a falha de persistência.
 */

vi.mock("@/app/services/webhook-asaas.service", () => ({
  webhookAsaasService: {
    registrarEvento: vi.fn(),
    processar: vi.fn(),
  },
}));

vi.mock("@/lib/agendar-pos-resposta", () => ({
  agendarPosResposta: vi.fn(),
}));

const { POST } = await import("./route");
const { webhookAsaasService } = await import(
  "@/app/services/webhook-asaas.service"
);
const { agendarPosResposta } = await import("@/lib/agendar-pos-resposta");

const registrarEvento = vi.mocked(webhookAsaasService.registrarEvento);
const processar = vi.mocked(webhookAsaasService.processar);
const agendar = vi.mocked(agendarPosResposta);

const TOKEN = "a".repeat(64);
/** Mesmo comprimento do correto: prova que a comparação não vaza por tamanho. */
const TOKEN_ERRADO_MESMO_TAMANHO = "b".repeat(64);
const TOKEN_ERRADO_OUTRO_TAMANHO = "curto";

const URL_WEBHOOK = "http://localhost/api/webhooks/asaas";

function requisicao(options: {
  token?: string | null;
  body?: unknown;
  rawBody?: string;
}): Request {
  const headers: Record<string, string> = {};
  if (options.token) headers["asaas-access-token"] = options.token;

  return buildRequest({
    method: "POST",
    url: URL_WEBHOOK,
    body: options.body,
    rawBody: options.rawBody,
    headers,
  });
}

const ENVELOPE = { id: "evt_abc&1", event: "PAYMENT_CONFIRMED" };

let erroLogado: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN);
  erroLogado = vi.spyOn(console, "error").mockImplementation(() => {});
  registrarEvento.mockResolvedValue("NOVO");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/asaas — autenticidade (T-03-21, T-03-22)", () => {
  it("sem o header asaas-access-token: 401 e nenhum rastro no banco", async () => {
    const response = await POST(requisicao({ body: ENVELOPE }));

    expect(response.status).toBe(401);
    expect(registrarEvento).not.toHaveBeenCalled();
    expect(agendar).not.toHaveBeenCalled();
  });

  it("token errado de MESMO comprimento: 401, nenhum insert", async () => {
    const response = await POST(
      requisicao({ token: TOKEN_ERRADO_MESMO_TAMANHO, body: ENVELOPE })
    );

    expect(response.status).toBe(401);
    expect(registrarEvento).not.toHaveBeenCalled();
  });

  it("token errado de comprimento DIFERENTE: 401 sem lançar — o hash iguala o tamanho dos buffers", async () => {
    // `timingSafeEqual` lança com buffers de tamanhos diferentes. Como os dois
    // lados são hashes SHA-256, isso nunca acontece — e o próprio tamanho do
    // segredo deixa de ser observável.
    const response = await POST(
      requisicao({ token: TOKEN_ERRADO_OUTRO_TAMANHO, body: ENVELOPE })
    );

    expect(response.status).toBe(401);
    expect(registrarEvento).not.toHaveBeenCalled();
  });

  it("o 401 não carrega corpo algum", async () => {
    const response = await POST(requisicao({ body: ENVELOPE }));

    expect(await response.text()).toBe("");
  });
});

describe("POST /api/webhooks/asaas — contrato de resposta 200 (T-03-25)", () => {
  it("envelope válido: status EXATAMENTE 200 (não 201/202/204)", async () => {
    const response = await POST(requisicao({ token: TOKEN, body: ENVELOPE }));

    expect(response.status).toBe(200);
  });

  it("corpo que não é JSON: 200, nenhum insert, log com prefixo", async () => {
    const response = await POST(
      requisicao({ token: TOKEN, rawBody: "isto{ nao ]e json" })
    );

    expect(response.status).toBe(200);
    expect(registrarEvento).not.toHaveBeenCalled();
    expect(agendar).not.toHaveBeenCalled();
    expect(erroLogado).toHaveBeenCalledWith(
      expect.stringContaining("[webhook-asaas]")
    );
  });

  it("envelope sem `id`: 200 e nenhum insert", async () => {
    const response = await POST(
      requisicao({ token: TOKEN, body: { event: "PAYMENT_CONFIRMED" } })
    );

    expect(response.status).toBe(200);
    expect(registrarEvento).not.toHaveBeenCalled();
  });

  it("envelope sem `event`: 200 e nenhum insert", async () => {
    const response = await POST(
      requisicao({ token: TOKEN, body: { id: "evt_abc&1" } })
    );

    expect(response.status).toBe(200);
    expect(registrarEvento).not.toHaveBeenCalled();
  });

  it("campo desconhecido extra: 200 e insert normal (tolerância do plano 03-03)", async () => {
    const corpo = { ...ENVELOPE, campoNovoDoAsaas: "surpresa" };

    const response = await POST(requisicao({ token: TOKEN, body: corpo }));

    expect(response.status).toBe(200);
    // O envelope BRUTO (não a versão estreitada pelo schema) chega ao service:
    // é ele que `redigirEnvelope` precisa para copiar `payment`/`checkout`.
    expect(registrarEvento).toHaveBeenCalledWith(
      ENVELOPE.id,
      ENVELOPE.event,
      corpo
    );
  });

  it("evento desconhecido: 200 e insert normal — rejeitar pausaria a fila", async () => {
    const corpo = { id: "evt_novo&1", event: "EVENTO_QUE_NAO_EXISTE_AINDA" };

    const response = await POST(requisicao({ token: TOKEN, body: corpo }));

    expect(response.status).toBe(200);
    expect(registrarEvento).toHaveBeenCalledWith(
      "evt_novo&1",
      "EVENTO_QUE_NAO_EXISTE_AINDA",
      corpo
    );
  });

  it("T-03-27: o corpo do 200 é idêntico e opaco em todos os caminhos", async () => {
    registrarEvento.mockResolvedValue("NOVO");
    const novo = await POST(requisicao({ token: TOKEN, body: ENVELOPE }));

    registrarEvento.mockResolvedValue("DUPLICADO");
    const duplicado = await POST(requisicao({ token: TOKEN, body: ENVELOPE }));

    const malformado = await POST(
      requisicao({ token: TOKEN, rawBody: "nao json" })
    );

    registrarEvento.mockResolvedValue("NOVO");
    const desconhecido = await POST(
      requisicao({ token: TOKEN, body: { id: "e&1", event: "SEI_LA" } })
    );

    for (const response of [novo, duplicado, malformado, desconhecido]) {
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("");
    }
  });
});

describe("POST /api/webhooks/asaas — persist-then-ack (Pattern 2)", () => {
  it("registrarEvento é invocado ANTES de agendarPosResposta", async () => {
    await POST(requisicao({ token: TOKEN, body: ENVELOPE }));

    expect(registrarEvento.mock.invocationCallOrder[0]).toBeLessThan(
      agendar.mock.invocationCallOrder[0]
    );
  });

  it("a Response só é construída depois que a persistência resolve", async () => {
    let liberar!: (valor: "NOVO") => void;
    registrarEvento.mockReturnValue(
      new Promise<"NOVO">((resolve) => {
        liberar = resolve;
      })
    );

    let concluido = false;
    const promessa = POST(requisicao({ token: TOKEN, body: ENVELOPE })).then(
      (response) => {
        concluido = true;
        return response;
      }
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(registrarEvento).toHaveBeenCalled();
    // Sem a linha no ledger, confirmar o recebimento perderia o evento: o Asaas
    // nunca reenvia depois de um 200.
    expect(concluido).toBe(false);

    liberar("NOVO");
    const response = await promessa;

    expect(response.status).toBe(200);
  });

  it("o processamento é DELEGADO, nunca await-ado no caminho do request", async () => {
    await POST(requisicao({ token: TOKEN, body: ENVELOPE }));

    expect(agendar).toHaveBeenCalledTimes(1);
    const tarefa = agendar.mock.calls[0][0];
    expect(typeof tarefa).toBe("function");
    // Nada rodou dentro do request: o timeout do Asaas é de 10 s.
    expect(processar).not.toHaveBeenCalled();

    await tarefa();

    expect(processar).toHaveBeenCalledWith(ENVELOPE.id);
  });

  it("T-03-24: entrega duplicada devolve 200 e NÃO agenda processamento", async () => {
    registrarEvento.mockResolvedValue("DUPLICADO");

    const response = await POST(requisicao({ token: TOKEN, body: ENVELOPE }));

    expect(response.status).toBe(200);
    expect(agendar).not.toHaveBeenCalled();
  });

  it("falha de persistência é o ÚNICO caminho autenticado não-200: 500 para o Asaas reenviar", async () => {
    registrarEvento.mockRejectedValue(new Error("banco fora"));

    const response = await POST(requisicao({ token: TOKEN, body: ENVELOPE }));

    expect(response.status).toBe(500);
    expect(agendar).not.toHaveBeenCalled();
    expect(erroLogado).toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/asaas — envelope real do Asaas", () => {
  it("aceita o fixture completo de PAYMENT_CONFIRMED e repassa o bruto ao service", async () => {
    const envelope = envelopePagamento();

    const response = await POST(requisicao({ token: TOKEN, body: envelope }));

    expect(response.status).toBe(200);
    expect(registrarEvento).toHaveBeenCalledWith(
      envelope.id,
      envelope.event,
      envelope
    );
  });
});
