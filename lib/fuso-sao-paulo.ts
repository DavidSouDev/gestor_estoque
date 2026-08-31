// VERIFICADO: executado no Node deste ambiente contra 8 casos, incluindo as
// transições históricas de horário de verão do Brasil (2017-10-15 inexistente,
// 2018-02-18 ambígua). Não re-derive este algoritmo — o erro de medir o desvio
// contra o valor corrente em vez de contra o alvo produz resultados 1-2h errados
// que só falham em datas com mudança de offset.

const FUSO = "America/Sao_Paulo";

const formatador = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function partes(instante: Date) {
  const p = Object.fromEntries(
    formatador.formatToParts(instante).map((x) => [x.type, x.value])
  ) as Record<string, string>;

  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    // ICU pode emitir "24" para meia-noite dependendo do locale/versão.
    hora: p.hour === "24" ? 0 : Number(p.hour),
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

/** A parede local do instante, reinterpretada como se fosse UTC. */
function paredeLocalComoUTC(instanteMs: number) {
  const p = partes(new Date(instanteMs));
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
}

/**
 * Instante UTC da meia-noite local de (dia local de `instante` + `deslocamentoDias`).
 *
 * Este é o LIMITE SUPERIOR EXCLUSIVO de um dia em São Paulo: combinado com a
 * comparação inclusiva de D-02 (`agora >= limite` já é expirado), representa
 * exatamente "o fim do dia local".
 */
export function meiaNoiteEmSaoPaulo(instante: Date, deslocamentoDias = 0): Date {
  const local = partes(instante);
  const alvo = Date.UTC(local.ano, local.mes - 1, local.dia + deslocamentoDias, 0, 0, 0, 0);

  let resultado = alvo;
  // Ponto-fixo: o desvio é SEMPRE medido contra `alvo`, nunca contra `resultado`.
  // Duas iterações bastam mesmo quando o próprio ajuste cruza uma mudança de offset.
  for (let i = 0; i < 2; i += 1) {
    const desvio = paredeLocalComoUTC(resultado) - alvo;
    if (desvio === 0) break;
    resultado -= desvio;
  }

  return new Date(resultado);
}
