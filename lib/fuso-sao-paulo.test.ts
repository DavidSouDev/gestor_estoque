import { describe, expect, it } from "vitest";
import { meiaNoiteEmSaoPaulo } from "./fuso-sao-paulo";

/**
 * Tabela de casos verificados em 02-RESEARCH.md § Code Examples #1.
 *
 * As entradas são SEMPRE instantes UTC explícitos (`Date.UTC` ou ISO terminado
 * em `Z`): `new Date("2026-08-31T12:00:00")` sem `Z` resolveria pelo fuso do
 * processo (UTC no CI, outro em produção) e tornaria o teste não determinístico.
 */
const casos: Array<{
  nota: string;
  entrada: string;
  deslocamento: number;
  esperado: string;
}> = [
  // Dia normal, sem horário de verão.
  {
    nota: "dia normal",
    entrada: "2026-08-31T12:00:00Z",
    deslocamento: 1,
    esperado: "2026-09-01T03:00:00.000Z",
  },
  {
    nota: "dia normal, 15 dias à frente",
    entrada: "2026-08-31T12:00:00Z",
    deslocamento: 15,
    esperado: "2026-09-15T03:00:00.000Z",
  },
  // 02:30Z é 23:30 do dia ANTERIOR em São Paulo: o dia local é o 30, não o 31.
  {
    nota: "instante que em SP ainda é o dia anterior",
    entrada: "2026-08-31T02:30:00Z",
    deslocamento: 1,
    esperado: "2026-08-31T03:00:00.000Z",
  },
  {
    nota: "instante que em SP ainda é o dia anterior, 15 dias à frente",
    entrada: "2026-08-31T02:30:00Z",
    deslocamento: 15,
    esperado: "2026-09-14T03:00:00.000Z",
  },
  {
    nota: "virada de ano",
    entrada: "2026-12-31T20:00:00Z",
    deslocamento: 1,
    esperado: "2027-01-01T03:00:00.000Z",
  },
  {
    nota: "virada de ano, 15 dias à frente",
    entrada: "2026-12-31T20:00:00Z",
    deslocamento: 15,
    esperado: "2027-01-15T03:00:00.000Z",
  },
  {
    nota: "ano bissexto",
    entrada: "2028-02-28T20:00:00Z",
    deslocamento: 1,
    esperado: "2028-02-29T03:00:00.000Z",
  },
  {
    nota: "ano bissexto, 15 dias à frente",
    entrada: "2028-02-28T20:00:00Z",
    deslocamento: 15,
    esperado: "2028-03-14T03:00:00.000Z",
  },
];

/**
 * As transições históricas de horário de verão do Brasil.
 *
 * Obrigatórias mesmo o produto só lidando com datas futuras: o Brasil aboliu o
 * horário de verão em 2019, então TODOS os casos de 2026+ passam também com um
 * algoritmo errado. Estes três são a única prova de que a implementação é a
 * correta, e não a que "acerta por sorte" (02-RESEARCH.md § Pitfall 2).
 */
const casosDeHorarioDeVerao: typeof casos = [
  {
    nota: "dentro do horário de verão antigo (offset −02)",
    entrada: "2018-02-16T12:00:00Z",
    deslocamento: 1,
    esperado: "2018-02-17T02:00:00.000Z",
  },
  {
    nota: "dentro do horário de verão antigo, com o alvo +15d já fora dele",
    entrada: "2018-02-16T12:00:00Z",
    deslocamento: 15,
    esperado: "2018-03-03T03:00:00.000Z",
  },
  {
    nota: "meia-noite ambígua (fim do horário de verão de 2018)",
    entrada: "2018-02-17T12:00:00Z",
    deslocamento: 1,
    esperado: "2018-02-18T03:00:00.000Z",
  },
  {
    nota: "meia-noite ambígua, 15 dias à frente",
    entrada: "2018-02-17T12:00:00Z",
    deslocamento: 15,
    esperado: "2018-03-04T03:00:00.000Z",
  },
  {
    nota: "meia-noite inexistente (início do horário de verão de 2017)",
    entrada: "2017-10-14T12:00:00Z",
    deslocamento: 1,
    esperado: "2017-10-15T02:00:00.000Z",
  },
  {
    nota: "meia-noite inexistente, 15 dias à frente",
    entrada: "2017-10-14T12:00:00Z",
    deslocamento: 15,
    esperado: "2017-10-29T02:00:00.000Z",
  },
];

describe("meiaNoiteEmSaoPaulo", () => {
  it.each(casos)(
    "$nota: $entrada + $deslocamento dia(s) → $esperado",
    ({ entrada, deslocamento, esperado }) => {
      expect(
        meiaNoiteEmSaoPaulo(new Date(entrada), deslocamento).toISOString()
      ).toBe(esperado);
    }
  );

  describe("transições históricas de horário de verão", () => {
    it.each(casosDeHorarioDeVerao)(
      "$nota: $entrada + $deslocamento dia(s) → $esperado",
      ({ entrada, deslocamento, esperado }) => {
        expect(
          meiaNoiteEmSaoPaulo(new Date(entrada), deslocamento).toISOString()
        ).toBe(esperado);
      }
    );
  });

  it("com deslocamento 0 explícito devolve a meia-noite do próprio dia local", () => {
    const instante = new Date(Date.UTC(2026, 7, 31, 12, 0));

    expect(meiaNoiteEmSaoPaulo(instante, 0).toISOString()).toBe(
      "2026-08-31T03:00:00.000Z"
    );
  });

  it("usa 0 como default quando chamada com um único argumento", () => {
    const instante = new Date(Date.UTC(2026, 7, 31, 12, 0));

    expect(meiaNoiteEmSaoPaulo(instante).toISOString()).toBe(
      meiaNoiteEmSaoPaulo(instante, 0).toISOString()
    );
    expect(meiaNoiteEmSaoPaulo(instante).toISOString()).toBe(
      "2026-08-31T03:00:00.000Z"
    );
  });

  it("é pura: a mesma entrada devolve o mesmo instante e o argumento não é mutado", () => {
    const instante = new Date(Date.UTC(2026, 7, 31, 12, 0));
    const copia = new Date(instante.getTime());

    const primeira = meiaNoiteEmSaoPaulo(instante, 15);
    const segunda = meiaNoiteEmSaoPaulo(instante, 15);

    expect(primeira.getTime()).toBe(segunda.getTime());
    expect(instante.getTime()).toBe(copia.getTime());
  });
});
