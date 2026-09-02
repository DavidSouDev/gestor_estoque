import { PagarButton } from "../../../_components/pagar-button";
import { PollerDeStatus } from "../../../_components/poller-de-status";
import { CancelarAssinatura } from "./cancelar-assinatura";

/**
 * Copy travada pela UI-SPEC § Error strings.
 *
 * E1 é DELIBERADAMENTE duas frases. A primeira, sozinha, é lida como "minha
 * conta quebrou" — e não quebrou: a Zona 1 continua na tela e continua correta.
 * A segunda frase é factual, não decorativa, e não pode ser removida.
 *
 * E3 é byte-idêntica à de `bloqueado-card.tsx`, já entregue na Fase 4 para a
 * MESMA falha da MESMA chamada. Não parafrasear: duas paráfrases de um fato só
 * seriam duas coisas para manter verdadeiras.
 */
const COPY = {
  erroGateway:
    "Não foi possível carregar os dados de cobrança agora. Seu acesso não foi afetado.",
  erroCheckout:
    "Não foi possível abrir o pagamento agora. Tente novamente em alguns instantes.",
} as const;

/**
 * Rampas do pill, uma por tom. Nenhuma delas usa a cor do tenant: `primaryColor`
 * é hex livre, sem validação de contraste, e a UI-SPEC § Color reserva o accent
 * para exatamente três coisas — nenhuma delas é o pill.
 */
const PILL_CLASSES = {
  positivo: "bg-emerald-50 text-emerald-700",
  atencao: "bg-amber-50 text-amber-800",
  neutro: "bg-slate-100 text-slate-600",
} as const;

/**
 * Um glifo por tom, `h-4 w-4`, cor herdada por `currentColor` do próprio pill —
 * nenhuma classe `text-*` no `<svg>`.
 *
 * O triângulo de aviso é copiado de `aviso-carencia.tsx:77`, para que o sinal de
 * carência seja o mesmo desenho nas duas superfícies.
 *
 * O cadeado de `bloqueado-card.tsx` NÃO aparece aqui: é o vocabulário da Fase 4
 * para acesso revogado, e ninguém que alcança esta tela teve acesso revogado.
 */
const PILL_PATHS = {
  positivo: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  atencao:
    "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  neutro: "M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z",
} as const;

/**
 * O único padrão de mensagem de erro do projeto, reproduzido caractere-a-caractere
 * de `bloqueado-card.tsx:97-114` (que por sua vez o herdou de `login-form.tsx`).
 * Combinar com o padrão existente em vez de inventar um quarto.
 */
function InlineError({ copy }: { copy: string }) {
  return (
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
      <svg
        className="h-4 w-4 shrink-0 text-red-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className="text-xs text-red-600">{copy}</span>
    </div>
  );
}

export interface AssinaturaCardProps {
  /**
   * A decisão JÁ TOMADA pela page, na ordem normativa da pesquisa § Pattern 3.
   * Este componente não a recalcula e não sabe como ela foi tomada.
   */
  estado: "vitalicio" | "aguardando" | "cancelada" | "ativa" | "degradado";
  /** Texto do pill, resolvido no servidor. */
  rotuloStatus: string;
  /** Rampa do pill, resolvida no servidor a partir do status LOCAL. */
  tomStatus: "positivo" | "atencao" | "neutro";
  /**
   * Último dia de acesso, JÁ formatado `dd/mm/aaaa` em `America/Sao_Paulo` por
   * `ultimoDiaDeAcessoEmSaoPaulo`. `null` significa "não há data de término"
   * (acesso permanente), nunca "não sabemos".
   */
  ultimoDiaDeAcesso: string | null;
  /** Preço mensal JÁ formatado por `formatCurrency`. Nunca um literal na tela. */
  precoMensal: string;
  /**
   * Zona 2 — os fatos do gateway, a ÚNICA parte da tela que pode faltar.
   * `disponivel: false` é o estado explícito de degradação de D-02b, não um erro.
   */
  gateway: { proximaCobranca: string | null; ciclo: string | null; disponivel: boolean };
  podePagar: boolean;
  rotuloPagar: string;
  podeCancelar: boolean;
  /** Cor do tenant, aplicada exclusivamente ao botão de pagamento. */
  primaryColor: string;
  /** E3 — o checkout anterior falhou e a URL voltou marcada. */
  erroCheckout: boolean;
  pagarAction: () => Promise<void>;
  cancelarAction: () => Promise<{ error?: string }>;
  consultarStatusAction: () => Promise<{ liberado: boolean }>;
}

/**
 * A tela de assinatura (SUB-01) e o único ponto de entrada do cancelamento
 * (SUB-02). Server component: os dois pedaços interativos que ele compõe
 * (`PollerDeStatus` e `CancelarAssinatura`) já são client por conta própria, e
 * nada aqui precisa de navegador.
 *
 * **Mesma disciplina de `BloqueadoCard` e do banner de carência: a prop que
 * chega é a decisão já tomada, não o estado bruto.** Este arquivo não contém —
 * e não pode ganhar — leitura do relógio do sistema, construtor de formatação de
 * data e hora, comparação do enum de status de acesso, nem ramo sobre
 * `canceladoEm`. A page toma as cinco decisões na ordem normativa; aqui só se
 * desenha. Cada uma dessas proibições é um token contável por grep, e nenhum
 * deles aparece neste arquivo — nem sequer citado —, justamente para que o gate
 * estático do plano 07-07 possa contá-los sem precisar descartar comentários.
 *
 * **Duas zonas de dado, e só uma degrada.** A Zona 1 (status e "acesso até") vem
 * de fatos locais e NUNCA fica indisponível. A Zona 2 (próxima cobrança) vem da
 * leitura viva do gateway. No estado "degradado" a Zona 1 renderiza idêntica e
 * completa e só a Zona 2 vira um `InlineError`. NÃO esmaecer a Zona 1 e NÃO
 * desabilitar o botão de cancelar: uma leitura que falhou não implica uma
 * escrita que vai falhar, e pré-desabilitar negaria a ação exatamente na tela
 * que existe para oferecê-la.
 *
 * **O shell é o card do dashboard, não o takeover da tela de bloqueio.** Esta
 * tela vive DENTRO do chrome do admin — é uma página, com barra lateral e tudo
 * mais ao redor.
 *
 * PROIBIDO aqui (UI-SPEC § Non-Goals): duplicar o banner de carência, que o
 * layout já renderiza acima de `children` em toda tela do admin — um segundo
 * bloco âmbar dobraria o aviso para quem está em carência; exibir o vocabulário
 * de status do fornecedor, que o usuário não sabe interpretar e que criaria uma
 * segunda autoridade ao lado de `avaliarAcesso` (BILL-01); uma variante SIMPLES
 * da tela; histórico de cobranças; qualquer UI de meio de pagamento; peso de
 * fonte 700; inserção de HTML cru; e qualquer dependência nova.
 */
export function AssinaturaCard({
  estado,
  rotuloStatus,
  tomStatus,
  ultimoDiaDeAcesso,
  precoMensal,
  gateway,
  podePagar,
  rotuloPagar,
  podeCancelar,
  primaryColor,
  erroCheckout,
  pagarAction,
  cancelarAction,
  consultarStatusAction,
}: AssinaturaCardProps) {
  // A Zona 2 só existe quando há uma assinatura viva para descrever. Nos três
  // primeiros estados a page nem chegou a falar com o gateway, então não há o
  // que exibir nem o que degradar.
  const mostraZona2 = estado === "ativa" || estado === "degradado";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl/[1.2] font-semibold text-slate-800">Assinatura</h1>
        <p className="mt-2 text-sm/[1.5] text-slate-500">
          Veja o status da sua assinatura, até quando o acesso está pago e cancele quando quiser.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${PILL_CLASSES[tomStatus]}`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={PILL_PATHS[tomStatus]}
            />
          </svg>
          {rotuloStatus}
        </span>

        {/* ─── ZONA 1 — fatos locais. NUNCA degrada. ─────────────────────────
            Renderiza idêntica nos cinco estados, inclusive no degradado. */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Acesso até
            </p>
            {/* O ÚNICO valor em tamanho Display da tela (UI-SPEC § Typography):
                é a resposta à pergunta que traz o usuário aqui. Sem data de
                término, a linha cai para tamanho Body — nunca um travessão e
                nunca um tile vazio, que leriam como "não sabemos". */}
            {ultimoDiaDeAcesso === null ? (
              <p className="mt-1 text-sm/[1.5] text-slate-800">Sem data de término</p>
            ) : (
              <p className="mt-1 text-2xl/[1.2] font-semibold text-slate-800">
                {ultimoDiaDeAcesso}
              </p>
            )}
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plano</p>
            <p className="mt-1 text-sm/[1.5] text-slate-800">{precoMensal} por mês</p>
          </div>
        </div>

        {estado === "aguardando" && (
          <div className="mt-6">
            {/* Heading secundário, NÃO um segundo `<h1>`: o título da tela
                continua sendo "Assinatura". */}
            <h2 className="text-xl/[1.2] font-semibold text-slate-800">Sem assinatura ativa</h2>
            <p className="mt-2 text-sm/[1.5] text-slate-500">
              Não encontramos uma assinatura para esta loja. Se você acabou de pagar, a confirmação
              pode levar alguns minutos.
            </p>

            {/* Achado 2: este não é caso de borda, é o primeiro minuto de TODO
                assinante novo. `Empresa.asaasSubscriptionId` só é escrito no ramo
                `SUBSCRIPTION_CREATED` do webhook, e a homologação [03-07] provou
                que a confirmação do pagamento chega ANTES dele — então, no
                instante em que o usuário volta do checkout, a consulta viva ao
                gateway literalmente não tem id para consultar. O poller pergunta
                "o painel já destravou?" sobre fatos LOCAIS e resolve a espera em
                segundos. */}
            <PollerDeStatus consultarAction={consultarStatusAction} />
          </div>
        )}

        {/* ─── ZONA 2 — fatos do gateway. A ÚNICA que degrada. ───────────────── */}
        {mostraZona2 &&
          (gateway.disponivel ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Próxima cobrança
              </p>
              <p className="mt-1 text-sm/[1.5] text-slate-800">{gateway.proximaCobranca}</p>
            </div>
          ) : (
            <InlineError copy={COPY.erroGateway} />
          ))}

        {erroCheckout && <InlineError copy={COPY.erroCheckout} />}

        {podePagar && (
          <form action={pagarAction} className="mt-6">
            {/* Variante `bloqueado`: colorida pelo tenant, largura total. A
                variante `banner` tem `amber-600` fixo e pertence à tira de
                carência — não pode aparecer nesta tela. */}
            <PagarButton variant="bloqueado" primaryColor={primaryColor} label={rotuloPagar} />
          </form>
        )}

        {/* `CancelarAssinatura` exige a data não-nula, então esta renderização só
            acontece quando a page conseguiu produzi-la: uma confirmação que diz
            "ativo até —" falha D-03 abertamente e é pior do que nenhum botão. */}
        {podeCancelar && ultimoDiaDeAcesso !== null && (
          <CancelarAssinatura
            ultimoDiaDeAcesso={ultimoDiaDeAcesso}
            cancelarAction={cancelarAction}
          />
        )}
      </div>
    </div>
  );
}
