// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CausaTransicaoAcesso, StatusAcesso } from "@prisma/client";
import { DIAS_DE_TRIAL, type FatosDeAcesso } from "@/lib/avaliar-acesso";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";
import { buildRequest } from "@/tests/helpers/request";

/**
 * Testes do worker diário de reconciliação (WRK-01, WRK-02, D-04, D-05).
 *
 * `// @vitest-environment node` na primeira linha é OBRIGATÓRIO: o default do
 * projeto é jsdom, e `node:crypto` e `Request` se comportam melhor em ambiente
 * node. O precedente direto é `app/api/webhooks/asaas/route.test.ts:1`.
 *
 * Mockamos o SERVICE de acesso, e não o Prisma bruto, para as asserções de "quem
 * foi transicionado": deixa a asserção legível e evita depender do shape interno
 * da transação interativa que `registrarTransicao` abre. O `findMany`, esse sim,
 * continua vindo do `prismaMock` global — é o argumento dele que prova o filtro
 * de soft-delete e o `select` fechado.
 */

vi.mock("@/app/services/acesso.service", () => ({
  acessoService: { registrarTransicao: vi.fn() },
}));

/**
 * `route.ts` NÃO importa este módulo, e é justamente esse o ponto: a asserção
 * negativa de `agendarPosResposta` é o que transforma Pitfall 4 (responder antes
 * de as escritas terminarem) em regressão detectável em vez de código de revisão.
 */
vi.mock("@/lib/agendar-pos-resposta", () => ({
  agendarPosResposta: vi.fn(),
}));

const { GET } = await import("./route");
const { acessoService } = await import("@/app/services/acesso.service");
const { agendarPosResposta } = await import("@/lib/agendar-pos-resposta");
const { prismaMock } = await import("@/tests/setup/prisma-mock");

const registrarTransicao = vi.mocked(acessoService.registrarTransicao);
const agendar = vi.mocked(agendarPosResposta);

const SEGREDO = "a".repeat(64);
/** Mesmo comprimento do correto: prova que a comparação não vaza por tamanho. */
const SEGREDO_ERRADO_MESMO_TAMANHO = "b".repeat(64);
const SEGREDO_ERRADO_OUTRO_TAMANHO = "curto";

const URL_WORKER = "http://localhost/api/cron/reconciliacao-diaria";

/**
 * O `select` exato que o handler tem que mandar ao banco. Existe como constante
 * porque a asserção é feita sobre o objeto INTEIRO, nunca por matcher parcial:
 * é assim que o teste prova ao mesmo tempo o filtro de soft-delete de Pitfall 8
 * e que nenhuma coluna a mais está sendo trazida.
 *
 * NOTA SOBRE OS COMENTÁRIOS: a prosa deste arquivo evita escrever o nome literal
 * do matcher parcial do vitest, pela mesma convenção registrada em
 * `app/api/webhooks/asaas/route.ts` — o gate de grep do plano precisa continuar
 * sendo sinal real sobre as asserções, não ruído vindo dos comentários.
 */
const CONSULTA_ESPERADA = {
  where: { deletedAt: null },
  select: {
    id: true,
    acessoAte: true,
    trialFim: true,
    canceladoEm: true,
    acessoVitalicio: true,
    ultimoStatusAuditado: true,
  },
};

/**
 * Todos os fatos são DERIVADOS de `agora`, nunca literais escritos à mão — o
 * motivo está em `scripts/seed-fatos-billing.ts`: "uma fixture com data escrita
 * à mão passa hoje e vira 'bloqueado' sozinha daqui a um mês". A aritmética
 * abaixo é a mesma daquele script e de `reconciliacao.service.test.ts`, copiada
 * e não importada: um arquivo de teste não é módulo de produção para ninguém.
 */
const agora = new Date();

const SEM_FATOS: FatosDeAcesso = {
  acessoAte: null,
  trialFim: null,
  canceladoEm: null,
  acessoVitalicio: false,
};

/** D-18: o `+1` é o mesmo de `empresaService.registerComUsuario`. */
function fatosDeTrial(): FatosDeAcesso {
  return { ...SEM_FATOS, trialFim: meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1) };
}

function fatosEmDia(): FatosDeAcesso {
  return { ...SEM_FATOS, acessoAte: meiaNoiteEmSaoPaulo(agora, 31) };
}

/**
 * Meia-noite de HOJE em São Paulo é o limite superior EXCLUSIVO de ontem: o
 * acesso pago já venceu, mas os 10 dias de carência mal começaram a correr.
 */
function fatosDeCarencia(): FatosDeAcesso {
  return { ...SEM_FATOS, acessoAte: meiaNoiteEmSaoPaulo(agora, 0) };
}

/** 30 dias além do vencimento: bem depois dos 10 de carência. */
function fatosDeBloqueio(): FatosDeAcesso {
  return { ...SEM_FATOS, acessoAte: meiaNoiteEmSaoPaulo(agora, -30) };
}

/**
 * Trial que venceu há 30 dias — a fixture do caso que dá nome à fase: a empresa
 * que nunca mais fez login e por isso nunca foi reavaliada por request.
 */
function fatosDeTrialVencido(): FatosDeAcesso {
  return { ...SEM_FATOS, trialFim: meiaNoiteEmSaoPaulo(agora, -30) };
}

interface EmpresaMockada extends FatosDeAcesso {
  id: string;
  ultimoStatusAuditado: StatusAcesso | null;
}

function empresa(over: Partial<EmpresaMockada> = {}): EmpresaMockada {
  return {
    id: crypto.randomUUID(),
    ...SEM_FATOS,
    ultimoStatusAuditado: StatusAcesso.TRIAL,
    ...over,
  };
}

function comEmpresas(lote: EmpresaMockada[]): void {
  prismaMock.empresa.findMany.mockResolvedValue(lote as never);
}

/**
 * O caminho normal: `buildRequest` já monta `Authorization: Bearer <token>` a
 * partir da opção `token`. Diferente do webhook do gateway, este endpoint usa
 * exatamente esse header, sem nada custom (D-08).
 */
function requisicao(segredo: string | null = SEGREDO): Request {
  return buildRequest({
    method: "GET",
    url: URL_WORKER,
    token: segredo ?? undefined,
  });
}

/** Header presente, porém sem o prefixo `Bearer ` — o quarto caso do gate. */
function requisicaoSemPrefixo(segredo: string = SEGREDO): Request {
  return buildRequest({
    method: "GET",
    url: URL_WORKER,
    headers: { authorization: segredo },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SEGREDO);
  vi.spyOn(console, "error").mockImplementation(() => {});
  comEmpresas([]);
  registrarTransicao.mockResolvedValue(null as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/reconciliacao-diaria — autenticidade (WRK-02, T-05-01, T-05-02, T-05-07)", () => {
  it("sem o header Authorization: 401, corpo vazio e nenhuma query", async () => {
    const response = await GET(requisicao(null));

    expect(response.status).toBe(401);
    expect(response.body).toBeNull();
    expect(prismaMock.empresa.findMany).not.toHaveBeenCalled();
    expect(registrarTransicao).not.toHaveBeenCalled();
  });

  it("segredo errado de MESMO comprimento: 401, corpo vazio e nenhuma query", async () => {
    const response = await GET(requisicao(SEGREDO_ERRADO_MESMO_TAMANHO));

    expect(response.status).toBe(401);
    expect(response.body).toBeNull();
    expect(prismaMock.empresa.findMany).not.toHaveBeenCalled();
  });

  it("segredo errado de comprimento DIFERENTE: 401 sem lançar — o hash iguala o tamanho dos buffers", async () => {
    // A comparação de tempo constante lança com buffers de tamanhos diferentes.
    // Como os dois lados são hashes SHA-256, isso nunca acontece — e o próprio
    // comprimento do segredo deixa de ser observável (T-05-02).
    const response = await GET(requisicao(SEGREDO_ERRADO_OUTRO_TAMANHO));

    expect(response.status).toBe(401);
    expect(response.body).toBeNull();
    expect(prismaMock.empresa.findMany).not.toHaveBeenCalled();
  });

  it("Authorization com o segredo CERTO mas sem o prefixo Bearer: 401", async () => {
    const response = await GET(requisicaoSemPrefixo());

    expect(response.status).toBe(401);
    expect(response.body).toBeNull();
    expect(prismaMock.empresa.findMany).not.toHaveBeenCalled();
  });

  it("segredo correto via Bearer: 200 — o formato que o agendador envia e que um curl reproduz", async () => {
    const response = await GET(requisicao());

    expect(response.status).toBe(200);
  });
});

describe("GET /api/cron/reconciliacao-diaria — transições (WRK-01, D-09)", () => {
  it("consulta o banco com o filtro de soft-delete e o select fechado dos 6 campos", async () => {
    await GET(requisicao());

    // Asserção sobre o objeto INTEIRO, de propósito: um matcher parcial deixaria
    // passar tanto a remoção do filtro de soft-delete (Pitfall 8) quanto a
    // adição silenciosa de colunas.
    expect(prismaMock.empresa.findMany).toHaveBeenCalledWith(CONSULTA_ESPERADA);
  });

  it("trial vencido há 30 dias: UMA transição TRIAL→BLOQUEADO, sem passo CARENCIA intermediário", async () => {
    const alvo = empresa({
      ...fatosDeTrialVencido(),
      ultimoStatusAuditado: StatusAcesso.TRIAL,
    });
    comEmpresas([alvo]);

    await GET(requisicao());

    expect(registrarTransicao).toHaveBeenCalledTimes(1);
    // Exata, sem matcher parcial: a causa é metade do que este teste prova, e
    // a ausência da linha `CARENCIA` é a outra metade (Achado crítico 1 — a
    // trilha registra transições OBSERVADAS, nunca simuladas).
    expect(registrarTransicao).toHaveBeenCalledWith({
      empresaId: alvo.id,
      anterior: StatusAcesso.TRIAL,
      novo: StatusAcesso.BLOQUEADO,
      causa: CausaTransicaoAcesso.WORKER_DIARIO,
    });
  });

  it("status derivado igual ao último auditado: zero escritas, zero I/O de auditoria", async () => {
    comEmpresas([
      empresa({ ...fatosEmDia(), ultimoStatusAuditado: StatusAcesso.EM_DIA }),
      empresa({ ...fatosDeTrial(), ultimoStatusAuditado: StatusAcesso.TRIAL }),
      empresa({ ...fatosDeCarencia(), ultimoStatusAuditado: StatusAcesso.CARENCIA }),
    ]);

    const response = await GET(requisicao());
    const corpo = await response.json();

    expect(registrarTransicao).not.toHaveBeenCalled();
    expect(corpo.avaliadas).toBe(3);
    expect(corpo.transicoesDetectadas).toBe(0);
  });

  it("duas invocações seguidas: a segunda não escreve nada (idempotência de WRK-01)", async () => {
    const alvo = empresa({
      ...fatosDeTrialVencido(),
      ultimoStatusAuditado: StatusAcesso.TRIAL,
    });
    comEmpresas([alvo]);

    await GET(requisicao());
    expect(registrarTransicao).toHaveBeenCalledTimes(1);

    // O mock passa a refletir o estado que o compare-and-swap teria gravado na
    // primeira execução. Esta é a expressão em mock da prova do Achado crítico
    // 1: a idempotência NÃO vem de infraestrutura construída nesta fase (não há
    // ledger de execução nem marca d'água de "rodei ontem") — ela é consequência
    // da pureza de `avaliarAcesso` sobre (fatos, instante) somada ao
    // compare-and-swap de `registrarTransicao`. Construir um ledger aqui
    // introduziria o bug que ele pretenderia evitar: pular um dia passaria a
    // importar.
    comEmpresas([{ ...alvo, ultimoStatusAuditado: StatusAcesso.BLOQUEADO }]);

    const segunda = await GET(requisicao());
    const corpo = await segunda.json();

    expect(registrarTransicao).toHaveBeenCalledTimes(1);
    expect(corpo.transicoesDetectadas).toBe(0);
    expect(corpo.aplicadas).toBe(0);
  });

  it("nunca agenda trabalho para depois da resposta, mesmo com transições aplicadas (Pitfall 4)", async () => {
    comEmpresas([
      empresa({ ...fatosDeTrialVencido(), ultimoStatusAuditado: StatusAcesso.TRIAL }),
    ]);

    const response = await GET(requisicao());
    const corpo = await response.json();

    expect(corpo.aplicadas).toBe(1);
    // As escritas são AGUARDADAS. Se alguém trocar o `await aplicar(...)` por um
    // agendamento pós-resposta, o corpo passaria a reportar contagens vazias — e
    // o corpo é a única superfície de observabilidade autorizada por D-04.
    expect(agendar).not.toHaveBeenCalled();
  });
});
