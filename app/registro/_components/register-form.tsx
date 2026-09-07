"use client";

import { useRef, useState, type FormEvent } from "react";
import { useActionState } from "react";
import type { RegisterState } from "../actions";
import { ModoInterfacePicker } from "@/app/_components/modo-interface-picker";

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm transition-all focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200";

export function RegisterForm({
  action,
  termo,
}: {
  action: (state: RegisterState, formData: FormData) => Promise<RegisterState>;
  // REQUERIDO, não opcional: o caso `null` (banco sem termo publicado) é tratado
  // por `app/registro/page.tsx`, que renderiza o estado degradado no lugar deste
  // formulário. Tornar a prop opcional devolveria a este componente a
  // possibilidade de renderizar meio estado — um formulário sem aceite, que o
  // servidor recusaria (E3) só depois do usuário preencher tudo.
  termo: { id: string; versao: number; conteudo: string };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [modo, setModo] = useState<"SIMPLES" | "COMPLETO">("COMPLETO");
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const formularioRef = useRef<HTMLFormElement>(null);
  const provaRef = useRef<HTMLInputElement>(null);

  // A memória do aceite é um REF, não estado (D-B): `setState` é assíncrono e o
  // `requestSubmit()` disparado logo em seguida leria o valor velho. Este ref é a
  // única fonte de verdade do "já aceitou"; o hidden input é só a projeção dele
  // no payload.
  const jaAceitouRef = useRef(false);

  /**
   * O gate do aceite (D-A). Mora no `onSubmit` do `<form>`, e não no `onClick` do
   * botão, por dois motivos: o browser roda a validação nativa ANTES de disparar
   * o submit, então o modal só aparece com o resto do formulário já preenchido;
   * e o submit implícito por Enter num campo de texto também passa por aqui.
   *
   * `preventDefault()` num handler de `onSubmit` CANCELA a Server Action: o React
   * despacha este plugin antes do de form action e testa `defaultPrevented` antes
   * de invocá-la.
   */
  function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    if (!jaAceitouRef.current) {
      evento.preventDefault();
      dialogoRef.current?.showModal();
      return;
    }

    // Escrever aqui, e não no clique do modal, é o que mantém o SEGUNDO submit
    // válido (D-C): o React 19 reseta os campos não controlados depois de cada
    // action, apagando este valor. O `FormData` só é montado depois deste
    // handler, então a escrita entra a tempo.
    if (provaRef.current) {
      provaRef.current.value = "true";
    }
  }

  /**
   * Fecha o modal e reentra no `onSubmit` acima — que desta vez deixa passar.
   * Nenhuma lógica de submissão duplicada: o caminho é o mesmo do formulário.
   */
  function aoAceitar() {
    jaAceitouRef.current = true;
    dialogoRef.current?.close();
    formularioRef.current?.requestSubmit();
  }

  return (
    <form ref={formularioRef} action={formAction} onSubmit={aoSubmeter} className="space-y-4">
      <div>
        <label htmlFor="nomeEmpresa" className="mb-1.5 block text-xs font-semibold text-slate-600">
          Nome da empresa
        </label>
        <input
          id="nomeEmpresa"
          name="nomeEmpresa"
          type="text"
          required
          placeholder="Mercearia São José"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="nomeResponsavel" className="mb-1.5 block text-xs font-semibold text-slate-600">
          Seu nome
        </label>
        <input
          id="nomeResponsavel"
          name="nomeResponsavel"
          type="text"
          required
          placeholder="Seu nome completo"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-600">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="voce@empresa.com"
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="senha" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="confirmarSenha" className="mb-1.5 block text-xs font-semibold text-slate-600">
            Confirmar senha
          </label>
          <input
            id="confirmarSenha"
            name="confirmarSenha"
            type="password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div>
        <p className="mb-1.5 block text-xs font-semibold text-slate-600">
          Como você prefere usar o sistema?
        </p>
        <ModoInterfacePicker value={modo} onChange={setModo} />
        <input type="hidden" name="modoInterface" value={modo} />
      </div>

      {/*
        Metade CLIENT de D-11. O gate é o próprio submit: o primeiro clique em
        "Criar minha loja" abre este modal em vez de disparar a action, e a prova
        de aceite só é escrita no submit que vem DEPOIS do botão de aceite. A
        segunda metade vive em `app/registro/actions.ts` (E3) e existe porque um
        submit por cliente próprio ou com JS desabilitado nunca passa por esta.

        Amarrar a leitura ao caminho obrigatório do cadastro é o ponto: enquanto
        o aceite era um controle marcável ao lado de um botão de leitura opcional,
        dava para consentir sem nunca abrir o texto.

        MODAL, não disclosure: o texto expandindo inline empurrava o formulário
        para baixo dentro do card, e em mobile o usuário perdia o contexto do
        cadastro. O overlay separa "ler" de "preencher".

        `<dialog>` NATIVO, e não uma biblioteca: focus trap, Escape, retorno de
        foco, top layer e backdrop vêm prontos do browser. Instalar headlessui,
        radix ou react-modal derrubaria o Gate 5 de `npm run gates:fase-06`, que
        fixa a contagem de dependências — e escrever focus trap à mão seria
        inventar um design system para revelar um bloco de texto.

        CUSTO ACEITO: com JS desabilitado o modal não abre. O desfecho, porém, é
        falha FECHADA — sem JS a Server Action de `useActionState` não roda de
        qualquer forma, e um POST montado à mão chega ao servidor sem a prova e é
        recusado pela copy E3. Nunca existe conta criada sem aceite.
      */}
      <div>
        {/*
          Sem estado React para aberto/fechado: o próprio `<dialog>` é a única
          fonte de verdade. Escape fecha o elemento nativamente, sem passar pelo
          React — um `useState` paralelo dessincronizaria no primeiro Escape.

          O `onClick` no próprio `<dialog>` fecha por clique no backdrop: o
          backdrop É o elemento, então cliques no conteúdo têm `target` interno.
        */}
        <dialog
          ref={dialogoRef}
          aria-labelledby="titulo-termos-de-uso"
          onClick={(event) => {
            if (event.target === dialogoRef.current) {
              dialogoRef.current?.close();
            }
          }}
          className="m-auto w-[calc(100vw-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/50"
        >
          {/*
            `max-h-[85vh]` no wrapper é o que garante mobile: o texto rola dentro
            da caixa em vez de a caixa crescer para fora da tela.
          */}
          <div className="flex max-h-[85vh] flex-col gap-4 p-6">
            <h2 id="titulo-termos-de-uso" className="text-base font-semibold text-slate-800">
              Termos de Uso (versão {termo.versao})
            </h2>

            {/*
              `role="region"` + `aria-label` + `tabIndex` porque uma caixa rolável
              sem conteúdo focável é inalcançável pelo teclado.

              O texto é nó de texto React, com escape automático: injetar HTML
              bruto é PROIBIDO nesta fase (D-05 torna o conteúdo texto puro
              justamente para eliminar essa superfície).

              `min-h-0` é o que faz o `overflow-y-auto` funcionar dentro do flex
              column acima.
            */}
            <div
              role="region"
              aria-label="Texto dos Termos de Uso"
              tabIndex={0}
              className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-sm/[1.5] text-slate-700"
            >
              {termo.conteudo}
            </div>

            {/*
              `type="button"` nos DOIS botões é requisito, não estilo: o
              `<dialog>` vive dentro do `<form>`, e um `<button>` sem `type`
              dentro de form é `submit` por padrão — fechar o modal dispararia o
              cadastro, e o de aceite submeteria DUAS vezes (T-Q08-02).

              "Fechar" permanece, como secundário (D-D): sem ele, Escape e clique
              no backdrop virariam as únicas saídas — descobríveis por quem já
              sabe, invisíveis para todo mundo. Fechar não é aceitar: o próximo
              submit reabre o modal.
            */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => dialogoRef.current?.close()}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Fechar
              </button>

              <button
                type="button"
                onClick={aoAceitar}
                className="flex-1 rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-md active:scale-[0.98]"
              >
                Li e aceito, criar minha loja
              </button>
            </div>
          </div>
        </dialog>

        {/*
          A prova de aceite (D-B). NÃO CONTROLADO de propósito: o valor é escrito
          por ref dentro do `onSubmit`, e `setState` seguido de `requestSubmit()`
          imediato enviaria o valor velho.

          `defaultValue=""` é a garantia de T-Q08-03: o campo nasce vazio e o
          único caminho para ele valer `"true"` no DOM real é o clique no botão
          de aceite do modal. É a mesma força que o controle marcável dava — nem
          mais, nem menos (D-E): um POST montado à mão sempre pôde forjar o valor,
          e é para isso que existe a validação server-side.
        */}
        <input type="hidden" name="termosAceitos" defaultValue="" ref={provaRef} />

        {/*
          Dado CONTROLADO PELO CLIENTE. O servidor compara por igualdade contra
          o vigente dele e recusa na divergência (E2) — nunca usa este valor
          como seletor.
        */}
        <input type="hidden" name="termoId" value={termo.id} />
      </div>

      {state.error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
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
          <span className="text-xs text-red-600">{state.error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-slate-800 py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Criando conta..." : "Criar minha loja"}
      </button>
    </form>
  );
}
