// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { avaliarAcesso } from "@/lib/avaliar-acesso";
import {
  acessoAteAposPagamento,
  comoDiaEmSaoPaulo,
  primeiraCobrancaEmSaoPaulo,
} from "./datas";

/**
 * Formatador independente da implementação: as asserções sobre "que dia é este
 * instante em São Paulo" não podem usar a mesma máquina que está sob teste.
 */
const emSaoPaulo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Tabela de vencimentos → `acessoAte`.
 *
 * Os instantes esperados foram calculados fora da implementação, procurando o
 * único instante UTC cuja parede em São Paulo é 00:00:00 do dia alvo.
 */
const casos = [
  {
    nota: "vencimento no dia 1 avança um ciclo mensal cheio",
    dueDate: "2021-01-01",
    esperado: "2021-02-01T03:00:00.000Z",
  },
  {
    nota: "2021-01-31 faz clamp para 28/02 (fevereiro não tem dia 31)",
    dueDate: "2021-01-31",
    esperado: "2021-02-28T03:00:00.000Z",
  },
  {
    nota: "2020-01-31 faz clamp para 29/02 em ano bissexto",
    dueDate: "2020-01-31",
    esperado: "2020-02-29T03:00:00.000Z",
  },
  {
    nota: "2021-03-31 faz clamp para 30/04 (abril tem 30 dias)",
    dueDate: "2021-03-31",
    esperado: "2021-04-30T03:00:00.000Z",
  },
  {
    nota: "2021-12-15 vira o ano para 15/01/2022",
    dueDate: "2021-12-15",
    esperado: "2022-01-15T03:00:00.000Z",
  },
  {
    nota: "2021-10-16 (mês de 31 dias para um de 30) → 16/11/2021",
    dueDate: "2021-10-16",
    esperado: "2021-11-16T03:00:00.000Z",
  },
  {
    nota: "2018-02-17 parte de dentro do horário de verão antigo e cai fora dele",
    dueDate: "2018-02-17",
    esperado: "2018-03-17T03:00:00.000Z",
  },
  {
    nota: "2017-10-14 cai DENTRO do horário de verão de 2017 (offset −02)",
    dueDate: "2017-10-14",
    esperado: "2017-11-14T02:00:00.000Z",
  },
];

afterEach(() => {
  vi.useRealTimers();
});

describe("comoDiaEmSaoPaulo", () => {
  it("interpreta '2021-01-01' como o dia 01/01/2021 em São Paulo, não 31/12/2020", () => {
    expect(emSaoPaulo.format(comoDiaEmSaoPaulo("2021-01-01"))).toBe("2021-01-01");
  });

  it("ancora ao meio-dia UTC, mantendo o dia-calendário mesmo em transição de offset", () => {
    expect(comoDiaEmSaoPaulo("2021-01-01").toISOString()).toBe("2021-01-01T12:00:00.000Z");
    expect(emSaoPaulo.format(comoDiaEmSaoPaulo("2017-10-15"))).toBe("2017-10-15");
    expect(emSaoPaulo.format(comoDiaEmSaoPaulo("2018-02-18"))).toBe("2018-02-18");
  });
});

describe("acessoAteAposPagamento", () => {
  it.each(casos)("$nota: $dueDate → $esperado", ({ dueDate, esperado }) => {
    expect(acessoAteAposPagamento(dueDate).toISOString()).toBe(esperado);
  });

  it("nunca produz uma data inválida em nenhum vencimento de dia 29, 30 ou 31 do ano", () => {
    for (let mes = 1; mes <= 12; mes += 1) {
      for (const dia of [28, 29, 30, 31]) {
        const ultimoDia = new Date(Date.UTC(2021, mes, 0)).getUTCDate();
        if (dia > ultimoDia) continue;

        const dueDate = `2021-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

        expect(Number.isNaN(acessoAteAposPagamento(dueDate).getTime())).toBe(false);
      }
    }
  });

  it("é pura: o mesmo dueDate devolve o mesmo instante com o relógio movido entre as chamadas", () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2021-01-05T10:00:00Z"));
    const primeira = acessoAteAposPagamento("2021-01-01");

    vi.setSystemTime(new Date("2021-07-20T23:30:00Z"));
    const segunda = acessoAteAposPagamento("2021-01-01");

    expect(primeira.getTime()).toBe(segunda.getTime());
    expect(primeira.toISOString()).toBe("2021-02-01T03:00:00.000Z");
  });
});

describe("encaixe com avaliarAcesso (motor da Fase 2)", () => {
  it("um pagamento com vencimento em 01/01 mantém a empresa EM_DIA no dia 20/01", () => {
    const resultado = avaliarAcesso(
      {
        acessoAte: acessoAteAposPagamento("2021-01-01"),
        trialFim: null,
        canceladoEm: null,
        acessoVitalicio: false,
      },
      new Date("2021-01-20T12:00:00Z")
    );

    expect(resultado.status).toBe("EM_DIA");
    expect(resultado.carenciaAte).toBeNull();
  });
});

describe("primeiraCobrancaEmSaoPaulo", () => {
  it("devolve o formato 'YYYY-MM-DD HH:mm:ss' do exemplo oficial do Asaas (A4)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));

    expect(primeiraCobrancaEmSaoPaulo(null)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("usa o dia-calendário de São Paulo do fim do trial (D-03)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));

    expect(primeiraCobrancaEmSaoPaulo(new Date("2026-09-15T03:00:00Z"))).toBe(
      "2026-09-15 00:00:00"
    );
  });

  it("cai para o dia de hoje quando não há trial", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));

    expect(primeiraCobrancaEmSaoPaulo(null)).toBe("2026-08-31 00:00:00");
  });

  it("cai para o dia de hoje quando o trial já passou", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));

    expect(primeiraCobrancaEmSaoPaulo(new Date("2026-08-01T03:00:00Z"))).toBe(
      "2026-08-31 00:00:00"
    );
  });

  it("usa o dia de São Paulo, não o dia UTC, perto da virada", () => {
    vi.useFakeTimers();
    // 02:00Z de 01/09 ainda é 23:00 de 31/08 em São Paulo.
    vi.setSystemTime(new Date("2026-09-01T02:00:00Z"));

    expect(primeiraCobrancaEmSaoPaulo(null)).toBe("2026-08-31 00:00:00");
  });
});
