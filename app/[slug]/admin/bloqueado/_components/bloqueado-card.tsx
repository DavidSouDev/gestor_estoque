import { PagarButton } from "../../_components/pagar-button";
import { PollerDeStatus } from "../../_components/poller-de-status";

export interface BloqueadoCardProps {
  primaryColor: string;
  accentColor: string;
  erroCheckout: boolean;
  pagarAction: () => Promise<void>;
  logoutAction: () => Promise<void>;
  /**
   * D-01. Chega já vinculada ao slug pelo servidor, no mesmo idioma das duas
   * actions acima — este componente nunca escolhe de qual empresa fala.
   */
  consultarStatusAction: () => Promise<{ liberado: boolean }>;
}

/**
 * Tela de suspensão de acesso (ACC-02).
 *
 * Server component sem chrome de admin: nenhuma barra lateral, nenhuma barra
 * superior. A rota vive fora do grupo protegido, então não herda nada — e não
 * pode importar a navegação do painel, que assumiria um acesso que esta pessoa
 * justamente não tem.
 *
 * UMA cópia para os dois rótulos de suspensão (D-06). Este componente não
 * recebe — e não pode receber — o rótulo de acesso da empresa: um branch de
 * texto aqui é a violação exata que o contrato proíbe. Por isso a prop que
 * chega é a decisão já tomada, não o estado bruto.
 *
 * O shell repete o da tela de login de propósito (mesmo fundo, mesmo card,
 * mesma barra de gradiente): o usuário reconhece a superfície pela qual acabou
 * de passar. O tile âmbar amarra esta tela ao banner de carência — a mesma cor
 * de aviso escalando de uma tira para uma tela inteira.
 */
export function BloqueadoCard({
  primaryColor,
  accentColor,
  erroCheckout,
  pagarAction,
  logoutAction,
  consultarStatusAction,
}: BloqueadoCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl">
          <div
            className="h-2"
            style={{
              background: `linear-gradient(90deg, ${primaryColor}, ${accentColor})`,
            }}
          />

          <div className="p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
              <svg
                className="h-8 w-8 text-amber-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>

            <h1 className="text-center text-xl/[1.2] font-semibold text-slate-800">
              Acesso suspenso
            </h1>
            <p className="mt-2 text-center text-sm/[1.5] text-slate-500">
              O painel da sua loja está suspenso por falta de pagamento, e o catálogo saiu do ar.
              Assim que o pagamento for confirmado, tudo volta automaticamente.
            </p>

            {/* D-01, montado INCONDICIONALMENTE. Esta é a tela de retorno do
                checkout para o cliente inadimplente que acabou de pagar — o caso
                que envolve dinheiro —, porque a `successUrl` aponta para
                `/{slug}/admin` e a DAL manda quem está suspenso para cá.

                Não é condicionado a um marcador de `searchParams` porque isso
                exigiria mudar a `successUrl`, que a UI-SPEC e o Achado 7 mandam
                explicitamente NÃO mudar; e o custo é baixo (uma leitura local
                por tick, com teto de 7). Quando o status destrava,
                `router.refresh()` faz esta page reexecutar a guarda que JÁ
                existe e o próprio Next devolve o usuário ao painel — nenhuma
                lógica de navegação nova. */}
            <PollerDeStatus consultarAction={consultarStatusAction} />

            {erroCheckout && (
              // Mesmo bloco de erro do login e do registro — o único padrão de
              // mensagem de erro do projeto. A frase é genérica de propósito: o
              // detalhe do gateway fica só no log do servidor (T-04-16).
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
                <span className="text-xs text-red-600">
                  Não foi possível abrir o pagamento agora. Tente novamente em alguns instantes.
                </span>
              </div>
            )}

            <form action={pagarAction} className="mt-6">
              <PagarButton variant="bloqueado" primaryColor={primaryColor} />
            </form>

            {/* Sair não é ação destrutiva: encerra a sessão e é desfeito por um
                novo login. Sem confirmação e sem tinta vermelha — os controles
                de saída que já existem no painel também não têm nenhuma. */}
            <form action={logoutAction}>
              <button
                type="submit"
                className="mt-3 w-full rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                Sair da conta
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
