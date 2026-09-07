import { AceitarButton } from "./aceitar-button";

export interface AceiteCardProps {
  primaryColor: string;
  accentColor: string;
  termo: {
    id: string;
    versao: number;
    conteudo: string;
    /** Já formatado como `dd/mm/aaaa` no servidor — ver o JSDoc abaixo. */
    publicadoEmFormatado: string;
  };
  erro: boolean;
  aceitarAction: (formData: FormData) => Promise<void>;
  logoutAction: () => Promise<void>;
}

/**
 * Tela de aceite obrigatório dos Termos de Uso (TERM-04).
 *
 * Server component sem chrome de admin: nenhuma barra lateral, nenhuma barra
 * superior. A rota vive fora do grupo protegido, então não herda nada — e não
 * pode importar a navegação do painel, que assumiria um acesso que este usuário
 * ainda não tem.
 *
 * UMA cópia para as duas populações. Este componente não recebe — e não pode
 * receber — a informação de "já aceitou antes?": o gate dispara tanto para quem
 * tem um aceite desatualizado quanto para todo usuário existente no primeiro
 * deploy, e a frase única é verdadeira para os dois. Um branch de texto aqui é a
 * violação exata que o contrato de cópia proíbe, pela mesma disciplina que a
 * Fase 4 aplicou a `BLOQUEADO`/`CANCELADO`. Por isso as props que chegam são
 * decisões já tomadas, não estado bruto.
 *
 * Pela mesma razão, **nenhuma construção de data acontece dentro deste
 * arquivo**: `publicadoEmFormatado` chega pronto do servidor. É a regra que a
 * Fase 4 pôs em `AvisoCarencia`, e pelo mesmo motivo — o componente fica
 * testável sem fake timers.
 *
 * O shell repete o da tela de bloqueio de propósito (mesmo fundo, mesmo card,
 * mesma barra de gradiente): o usuário reconhece a superfície. O que **não** se
 * repete é a cor: o tile é slate com glifo de documento, nunca o cadeado da Fase
 * 4 — aquele é o vocabulário de acesso revogado, e esta pessoa não perdeu nada.
 */
export function AceiteCard({
  primaryColor,
  accentColor,
  termo,
  erro,
  aceitarAction,
  logoutAction,
}: AceiteCardProps) {
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
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <svg
                className="h-8 w-8 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>

            <h1 className="text-center text-xl/[1.2] font-semibold text-slate-800">
              Termos de Uso
            </h1>
            <p className="mt-1 text-center text-xs text-slate-500">
              Versão {termo.versao} · publicada em {termo.publicadoEmFormatado}
            </p>
            <p className="mt-2 text-center text-sm/[1.5] text-slate-500">
              Publicamos uma versão dos termos que você ainda não aceitou. Leia o texto abaixo e
              aceite para voltar ao painel.
            </p>

            {/* O texto é nó de texto React — escape automático. Injetar HTML
                cru aqui é PROIBIDO nesta fase, nas duas superfícies: D-05 torna
                o conteúdo texto puro precisamente para remover essa superfície,
                e a ausência do prop de HTML cru é verificada por grep (T-06-08).
                O `tabIndex` não é enfeite: uma caixa rolável sem filho focável
                é inalcançável por teclado. */}
            <div
              role="region"
              aria-label="Texto dos Termos de Uso"
              tabIndex={0}
              className="mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm/[1.5] text-slate-700"
            >
              {termo.conteudo}
            </div>

            {erro && (
              // Mesmo bloco de erro do login, do registro e da tela de bloqueio
              // — o único padrão de mensagem de erro do projeto. A frase manda
              // reler porque a caixa acima já mostra o texto NOVO (E1): um erro
              // que diz "leia a nova versão" exibindo a antiga é pior que erro
              // nenhum.
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
                  Os termos foram atualizados enquanto você lia. Leia a nova versão e aceite
                  novamente.
                </span>
              </div>
            )}

            {/* UM único campo: a versão que esta pessoa está vendo. Nenhum campo
                de identidade viaja neste formulário — quem aceita é derivado da
                sessão dentro da própria action (T-06-06). */}
            <form action={aceitarAction} className="mt-6">
              <input type="hidden" name="termoId" value={termo.id} />
              <AceitarButton primaryColor={primaryColor} />
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
