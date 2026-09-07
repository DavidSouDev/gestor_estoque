export interface TermoLeituraCardProps {
  /**
   * A versão vigente dos Termos de Uso, ou `null` quando nenhuma foi publicada.
   *
   * TRÊS AUSÊNCIAS DELIBERADAS neste contrato:
   *
   * (a) **Não existe `id`.** Nada é submetido nesta tela. `termoId` só faz
   *     sentido dentro de um formulário de aceite — recebê-lo aqui seria um
   *     convite silencioso a acrescentar um.
   *
   * (b) **Não existe prop de cor (`primaryColor`/`accentColor`).** A tela vive
   *     dentro do chrome do admin, que já carrega a identidade do tenant, e o
   *     orçamento de cor de tenant desta superfície já está gasto (Gate 4 da
   *     Fase 6 / 07-UI-SPEC).
   *
   * (c) **A data chega FORMATADA do servidor**, como em `AceiteCard`. Nenhuma
   *     construção de `Date` acontece dentro deste arquivo, o que o mantém
   *     testável sem fake timers.
   */
  termo: {
    versao: number;
    conteudo: string;
    /** Já formatado como `dd/mm/aaaa` no servidor — ver o item (c) acima. */
    publicadoEmFormatado: string;
  } | null;
}

/**
 * Releitura dos Termos de Uso vigentes dentro do painel protegido.
 *
 * **É uma tela de LEITURA, não um segundo gate.** Quem chega aqui já está em dia
 * com os termos — `requireAdminSession` garante isso antes de a page renderizar.
 * Por isso este componente é puro e não tem `"use client"`: sem estado, sem
 * handler, e renderizado por um server component.
 *
 * TRÊS PROIBIÇÕES, e o motivo de cada uma:
 *
 * 1. **`dangerouslySetInnerHTML`.** D-05 torna `conteudo` texto puro exatamente
 *    para eliminar essa superfície. O texto é nó de texto React — escape
 *    automático — e o teste de escape com `<b>negrito</b>` literal é a prova
 *    executável disso (T-fhk-02).
 * 2. **Qualquer utilitário `amber-`.** Âmbar é o vocabulário de PAGAMENTO desta
 *    aplicação, ensinado pela Fase 4; usá-lo numa superfície de TERMOS faz a cor
 *    significar duas coisas na mesma sessão. É o Gate 4 de
 *    `scripts/gates-fase-06.mjs`, e esta pasta entrou no escopo dele.
 * 3. **Qualquer `<form>`, `<button>` ou action.** Um formulário aqui seria um
 *    segundo caminho de escrita para `AceiteTermo`, que a Fase 6 manteve único
 *    de propósito (T-fhk-04). O único caminho de escrita continua sendo
 *    `aceitar-termos/actions.ts`.
 *
 * A COPY DO CABEÇALHO É NEUTRA DE PROPÓSITO. Escrever "os termos que você
 * aceitou" seria falso para o SUPERADMIN, que é isento do gate por D-03 e mesmo
 * assim alcança esta tela. É a mesma disciplina de cópia única que
 * `aceite-card.tsx` documenta.
 */
export function TermoLeituraCard({ termo }: TermoLeituraCardProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl/[1.2] font-semibold text-slate-800">Termos de Uso</h1>
        <p className="mt-2 text-sm/[1.5] text-slate-500">
          Esta é a versão vigente dos Termos de Uso da plataforma. Leia o texto completo abaixo.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6">
        {termo ? (
          <>
            <p className="text-xs text-slate-500">
              Versão {termo.versao} · publicada em {termo.publicadoEmFormatado}
            </p>

            {/* Bloco copiado de `aceite-card.tsx` trocando SÓ a altura máxima:
                `max-h-72` virou `max-h-[60vh]` porque aqui a leitura é o
                propósito da tela, não um passo intermediário de um formulário.
                O `tabIndex` não é enfeite: uma caixa rolável sem filho focável é
                inalcançável por teclado. */}
            <div
              role="region"
              aria-label="Texto dos Termos de Uso"
              tabIndex={0}
              className="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm/[1.5] text-slate-700"
            >
              {termo.conteudo}
            </div>
          </>
        ) : (
          // Sem ícone de erro e sem tinta vermelha: não é falha do usuário, e em
          // operação normal este ramo é inalcançável. Nada de versão ou data
          // inventada — um estado vazio honesto é a resposta correta.
          <div>
            <p className="text-sm/[1.5] text-slate-500">
              Nenhuma versão dos Termos de Uso está publicada no momento.
            </p>
            <p className="mt-1 text-sm/[1.5] text-slate-500">
              Assim que uma versão for publicada, ela aparece aqui.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
