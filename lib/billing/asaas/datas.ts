import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";

/**
 * Aritmética das datas que o Asaas envia.
 *
 * Todo fuso é delegado a `meiaNoiteEmSaoPaulo` — o arquivo tem aviso normativo
 * explícito de não re-derivar o algoritmo, e nada aqui calcula offset na mão.
 */

const FUSO = "America/Sao_Paulo";

const formatadorDeDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Interpreta uma data-calendário `"YYYY-MM-DD"` do Asaas como o dia local de
 * São Paulo, ancorando-a ao meio-dia UTC.
 *
 * Sem a âncora, `new Date("2021-01-01")` é meia-noite UTC = 31/12 às 21:00 em
 * São Paulo; passar esse instante para `meiaNoiteEmSaoPaulo` devolveria a
 * meia-noite do dia ANTERIOR, custando um dia inteiro de acesso ao cliente que
 * pagou. Meio-dia UTC é 09:00 em São Paulo — o mesmo dia-calendário, com folga
 * de 9 h para cada lado, o que torna a conversão imune a qualquer transição de
 * offset, inclusive as meia-noites inexistentes e ambíguas do horário de verão
 * antigo (Pitfall 6). Mesmo calibre do comentário D-18 em `empresa.service.ts`.
 */
export function comoDiaEmSaoPaulo(dataAsaas: string): Date {
  return new Date(`${dataAsaas}T12:00:00Z`);
}

/** Dia-calendário `"YYYY-MM-DD"` de um instante, na parede de São Paulo. */
function diaCalendarioEmSaoPaulo(instante: Date): string {
  const partes = Object.fromEntries(
    formatadorDeDia.formatToParts(instante).map((x) => [x.type, x.value])
  ) as Record<string, string>;

  // `toISOString().slice(0, 10)` devolveria o dia UTC, que às 22:00 de São Paulo
  // já é o dia seguinte — um dia inteiro de erro na virada.
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/**
 * `acessoAte` = meia-noite de São Paulo do dia do vencimento + 1 ciclo mensal
 * (GTW-03). É o LIMITE SUPERIOR EXCLUSIVO consumido por `avaliarAcesso`, que
 * compara `agora < acessoAte`.
 *
 * Função PURA do `dueDate` do evento: nunca lê o relógio. É exatamente isso que
 * torna a escrita monotônica do plano 03-06 idempotente sob reentrega — o mesmo
 * webhook entregue de novo em março produz o mesmo instante de fevereiro, que
 * não é maior que o valor corrente, e a escrita vira no-op. Derivar de
 * `new Date()` daria acesso extra a cada reentrega (Pitfall 5).
 *
 * Duas armadilhas evitadas de propósito:
 * - Os mutadores de mês nativos do `Date` fazem overflow silencioso: 31/01 + 1
 *   mês vira 02/03 ou 03/03. Por isso são proibidos aqui, e o dia é limitado ao
 *   último dia do mês alvo (31/01 → 28/02, ou 29/02 em ano bissexto).
 * - Somar 30 dias em milissegundos desalinha do ciclo `MONTHLY` do Asaas em
 *   cerca de cinco meses.
 */
export function acessoAteAposPagamento(dueDate: string): Date {
  const [ano, mes, dia] = dueDate.split("-").map(Number);

  const anoAlvo = mes === 12 ? ano + 1 : ano;
  const mesAlvo = mes === 12 ? 1 : mes + 1;

  // `Date.UTC(ano, mes + 1, 0)` é o dia 0 do mês SEGUINTE ao alvo, ou seja, o
  // último dia do mês alvo (`mes` chega 1-based, então `mes + 1` já é o índice
  // 0-based do mês posterior ao alvo). O índice 13 em dezembro faz o rollover de
  // ano sozinho.
  const ultimoDiaDoMesAlvo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const diaAlvo = Math.min(dia, ultimoDiaDoMesAlvo);

  const alvo = `${anoAlvo}-${String(mesAlvo).padStart(2, "0")}-${String(diaAlvo).padStart(2, "0")}`;

  return meiaNoiteEmSaoPaulo(comoDiaEmSaoPaulo(alvo));
}

/**
 * `nextDueDate` a enviar no objeto `subscription` do checkout, no formato
 * `"YYYY-MM-DD HH:mm:ss"` do exemplo oficial do Asaas (A4 do Assumptions Log:
 * o formato só-data não está documentado como aceito).
 *
 * D-03: a primeira cobrança cai no FIM DO TRIAL, não no registro. `trialFim` já
 * é a meia-noite de São Paulo do dia em que o trial acaba, então o dia-calendário
 * dele é a data de cobrança. Sem trial vigente (nulo ou já vencido), a cobrança
 * é hoje.
 */
export function primeiraCobrancaEmSaoPaulo(trialFim: Date | null): string {
  const agora = new Date();
  const base = trialFim && trialFim.getTime() > agora.getTime() ? trialFim : agora;

  return `${diaCalendarioEmSaoPaulo(base)} 00:00:00`;
}
