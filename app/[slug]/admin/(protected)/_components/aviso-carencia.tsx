import { PagarButton } from "../../_components/pagar-button";

export interface AvisoCarenciaProps {
  /**
   * Já calculado pelo chamador, a partir de `carenciaAte`, com
   * `diasRestantesDeCarencia` (`lib/avaliar-acesso.ts`). Sempre >= 0.
   */
  diasRestantes: number;
  pagarAction: () => Promise<void>;
}

/**
 * Copy travada pela UI-SPEC §Copywriting Contract → "Grace banner copy (ACC-01)".
 * Não parafrasear, não mexer na pontuação e não remover a menção ao catálogo: ela
 * é verdadeira (ACC-03 despublica o catálogo junto com o painel) e é o motivador
 * honesto mais forte disponível.
 */
function corpoDoAviso(diasRestantes: number): string {
  if (diasRestantes <= 0) {
    return "Seu acesso vence hoje. Depois disso, o painel e o catálogo da sua loja saem do ar.";
  }

  if (diasRestantes === 1) {
    return "Seu acesso vence amanhã. Depois disso, o painel e o catálogo da sua loja saem do ar.";
  }

  return `Seu acesso vence em ${diasRestantes} dias. Depois disso, o painel e o catálogo da sua loja saem do ar.`;
}

/**
 * Banner de carência (ACC-01) — o primeiro padrão de aviso do projeto.
 *
 * Server component: o único pedaço interativo é o `PagarButton`, que já é
 * client. Nada aqui precisa de navegador.
 *
 * **É uma função pura de um número.** Este componente não lê o relógio do
 * sistema por conta própria, não formata datas e não faz aritmética de fuso —
 * tudo isso mora em `diasRestantesDeCarencia`, que recebe o instante atual por
 * parâmetro (mesmo contrato de relógio injetado de `avaliarAcesso`, T-02-13).
 * É exatamente isso que torna as três variantes de cópia testáveis sem nenhum
 * controle artificial de tempo, e que evita o off-by-one de fuso que a pesquisa
 * desta fase registra como Pitfall 5.
 *
 * **Não é dispensável.** Sem botão de fechar, sem adiar, sem estado de cliente e
 * sem nada gravado no navegador: ACC-01 exige o aviso em *toda* tela do admin, e
 * um controle de dispensar derrota o requisito em vez de implementá-lo.
 *
 * O papel anunciado é `status` (região viva *polite*) e nunca o papel assertivo
 * de alerta: este é um aviso persistente, e interromper quem usa leitor de tela a
 * cada carregamento de página seria hostil (UI-SPEC §Accessibility).
 *
 * **Limitação aceita (Pitfall 4 / suposição A3):** por partial rendering do App
 * Router, layouts não re-renderizam em navegação client-side, então
 * `diasRestantes` pode ficar desatualizado dentro de uma sessão. É aceitável
 * porque o boundary de autorização é a DAL de sessão chamada por CADA page, não
 * este banner, e porque o retorno do checkout é uma navegação de documento
 * completa de volta para `/{slug}/admin` — que re-renderiza o layout inteiro e
 * cobre o caso que mais importa ("paguei, quero ver o aviso sumir"). NÃO
 * acrescentar polling nem temporizador de cliente para "corrigir" isso.
 */
export function AvisoCarencia({ diasRestantes, pagarAction }: AvisoCarenciaProps) {
  return (
    <section
      role="status"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
    >
      <svg
        className="h-5 w-5 shrink-0 text-amber-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>

      <div className="min-w-0 flex-1">
        <p className="text-xl/[1.2] font-semibold text-amber-900">Pagamento pendente</p>
        <p className="mt-1 text-sm/[1.5] text-amber-800">{corpoDoAviso(diasRestantes)}</p>
      </div>

      {/* Mesmo CTA da tela de suspensão: um único botão de pagamento no projeto,
          na variante âmbar fixa — a cor do tenant é hex livre e sumiria sobre
          `amber-50` (UI-SPEC §Color). */}
      <form action={pagarAction} className="w-full sm:w-auto">
        <PagarButton variant="banner" />
      </form>
    </section>
  );
}
