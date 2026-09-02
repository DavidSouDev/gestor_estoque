"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Byte-idêntica à frase de `aviso-carencia.tsx` — UI-SPEC § Copy que não muda.
 *
 * Não parafrasear. O usuário provavelmente já leu esta frase exata no banner de
 * carência, e a consequência de cancelar é a MESMA da falta de pagamento (D-06:
 * `CANCELADO` recebe tratamento idêntico a `BLOQUEADO`). Duas paráfrases de um
 * fato só seriam duas coisas para manter verdadeiras. Mantida em constante, e
 * numa única linha, para que a igualdade com a outra tela seja verificável por
 * grep — gate estático candidato do plano 07-07.
 */
const CONSEQUENCIA = "Depois disso, o painel e o catálogo da sua loja saem do ar.";

export interface CancelarAssinaturaProps {
  /**
   * Último dia de acesso, JÁ formatado `dd/mm/aaaa` em `America/Sao_Paulo` pelo
   * servidor. String obrigatória e não-nula.
   *
   * Este componente não formata data, não instancia o relógio do sistema, não
   * constrói formatador de data e hora e não faz aritmética de prazo —
   * `lib/avaliar-acesso.ts` e `lib/fuso-sao-paulo.ts` são os donos únicos disso
   * (plano 07-01), e `acessoAte` é um limite superior EXCLUSIVO cuja exibição
   * crua produz um off-by-one invisível em code review e visível para todo
   * usuário. Os dois construtores proibidos não aparecem neste arquivo nem
   * citados, pelo mesmo motivo de grep registrado no bloco do componente.
   *
   * Se a página não conseguir produzir a data, ela não renderiza este componente
   * (`podeCancelar: false`): uma confirmação que diz "ativo até —" falha D-03
   * abertamente e é pior do que nenhum botão.
   */
  ultimoDiaDeAcesso: string;
  /**
   * Chega JÁ vinculada ao slug pelo servidor e é chamada SEM argumentos (D-05).
   *
   * Nenhum input escondido, nenhuma prop e nenhum argumento pode carregar um
   * identificador de assinatura ou de cliente do gateway — é exatamente o
   * cenário que `PITFALLS.md` § Pitfall 11 nomeia como o IDOR desta fase. Mesmo
   * idioma das actions já vinculadas de `bloqueado-card.tsx`.
   */
  cancelarAction: () => Promise<{ error?: string }>;
}

/**
 * Gatilho + view de confirmação de cancelamento (SUB-02, D-03).
 *
 * **É uma substituição de view, não um overlay.** D-03 pede "modal"; a UI-SPEC
 * implementa a substância — confirmação explícita, dois cliques, data exata
 * visível antes do segundo — trocando a view no lugar de sobrepô-la. O projeto
 * tem ZERO overlays e já tem exatamente este padrão em `confirmar-remocao.tsx`,
 * devolvido NO LUGAR da view anterior por `combo-hub.tsx`. Um overlay de verdade
 * é um sistema (focus trap, scroll lock, Escape, return-focus, portal,
 * background inert) — seria inventar um design system dentro de uma fase que
 * declinou explicitamente inventar um.
 *
 * PROIBIDO aqui: o papel ARIA de diálogo, o atributo de modalidade ARIA, o
 * portal do React DOM, o posicionamento de sobreposição em tela cheia, focus
 * trap, scroll lock e handler de `Escape`. Qualquer um deles começa a construir
 * a primitiva recusada. Cada um é um token verificável por grep, e nenhum
 * aparece neste arquivo — nem sequer citado — justamente para que o gate
 * estático do plano 07-07 possa contá-los sem precisar descartar comentários.
 * Também proibido: emoji (a linguagem de billing das Fases 4 e 6 é SVG inline),
 * chamada de rede direta (o projeto não tem nenhuma partindo de client
 * component) e qualquer dependência nova.
 */
export function CancelarAssinatura({
  ultimoDiaDeAcesso,
  cancelarAction,
}: CancelarAssinaturaProps) {
  const [view, setView] = useState<"padrao" | "confirmando">("padrao");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Impede que a montagem inicial (que já é `view === "padrao"`) roube o foco de
  // quem estiver em outro ponto da página.
  const jaAbriu = useRef(false);

  // Gestão de foco no swap de view (UI-SPEC § Accessibility). É o ÚNICO
  // comportamento que um overlay daria de graça e que, por isso, precisa ser
  // implementado de propósito: sem ele, quem usa teclado aperta um botão e o
  // foco cai em `<body>`.
  useEffect(() => {
    if (view === "confirmando") {
      jaAbriu.current = true;
      headingRef.current?.focus();
      return;
    }

    if (jaAbriu.current) {
      gatilhoRef.current?.focus();
    }
  }, [view]);

  if (view === "padrao") {
    return (
      // Sem vermelho em repouso: cancelar é uma escolha que o produto oferece,
      // não um perigo. A tinta vermelha chega no momento da consequência.
      <button
        ref={gatilhoRef}
        type="button"
        onClick={() => {
          setError(null);
          setView("confirmando");
        }}
        className="mt-6 w-full rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        Cancelar assinatura
      </button>
    );
  }

  return (
    <div className="py-8 text-center">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-xl/[1.2] font-semibold text-slate-800"
      >
        Cancelar a assinatura?
      </h1>

      {/* Copy TRAVADA (UI-SPEC § Locked block). Montada como uma única string
          para que a frase final permaneça byte-idêntica à de `aviso-carencia.tsx`
          e para que o parágrafo seja um único nó de texto. */}
      <p className="mx-auto mt-2 max-w-md text-sm/[1.5] text-slate-500">
        {`Seu acesso continua ativo até ${ultimoDiaDeAcesso} e a assinatura não será renovada. ${CONSEQUENCIA}`}
      </p>

      {error && (
        // O único padrão de mensagem de erro do projeto, reproduzido de
        // `bloqueado-card.tsx`. A frase é genérica por construção: o detalhe do
        // gateway fica só no log do servidor (T-04-16 / T-07-29).
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
          <span className="text-xs text-red-600">{error}</span>
        </div>
      )}

      {/* Confirmar ANTES de abortar na ordem do DOM (UI-SPEC § Accessibility).
          `pending` desabilita os DOIS: sem isso, quem apertar "Manter
          assinatura" no meio do voo veria a view fechar enquanto um
          cancelamento termina por trás (T-07-31). */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);

            startTransition(async () => {
              // Chamada SEM argumentos: a action já veio vinculada ao slug pelo
              // servidor (D-05). Mesmo idioma de `combo-hub.tsx`, que também
              // precisa da string de erro devolvida — por isso `type="button"`
              // com `onClick`, e não submit de form.
              const resultado = await cancelarAction();

              if (resultado.error) {
                // PERMANECE na view de confirmação. Fechá-la numa falha leria
                // como sucesso, e nenhum estado otimista de "cancelada" é
                // renderizado: a escrita local é a única coisa que torna aquilo
                // verdadeiro, e a variante otimista é nomeada em § Pitfall 1
                // como o pior desfecho possível (T-07-30).
                setError(resultado.error);
                return;
              }

              router.refresh();
            });
          }}
          className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Cancelando..." : "Sim, cancelar assinatura"}
        </button>

        {/* NUNCA rotulado "Cancelar". Numa tela cujo assunto é um cancelamento,
            esse rótulo lê igualmente como "cancelar a assinatura" e "cancelar
            este diálogo", e os dois significam o oposto um do outro — quem o
            lê errado ou cancela uma assinatura que queria manter, ou deixa de
            cancelar uma que queria encerrar. Os dois desfechos terminam em
            chamado de suporte ou chargeback, que é exatamente a falha que D-03
            existe para evitar. "Manter assinatura" declara o resultado de
            apertá-lo e não pode ser mal lido. */}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setView("padrao");
          }}
          className="rounded-xl px-6 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          Manter assinatura
        </button>
      </div>
    </div>
  );
}
