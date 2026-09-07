"use client";

import { useRef, useState } from "react";
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

  return (
    <form action={formAction} className="space-y-4">
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
        Metade CLIENT de D-11. O `required` do checkbox é a primeira das duas
        validações; a segunda vive em `app/registro/actions.ts` (E3) e existe
        porque um submit por cliente próprio ou com JS desabilitado nunca passa
        por esta.

        Posição deliberada: logo DEPOIS do seletor de modo e logo ANTES do bloco
        de erro, para que uma recusa server-side (E2/E3) apareça imediatamente
        acima do botão de submit, onde o erro já aparece hoje.

        MODAL, não mais disclosure: o texto expandindo inline empurrava o
        formulário para baixo dentro do card, e em mobile o usuário perdia o
        contexto do cadastro. O overlay separa "ler" de "preencher".

        `<dialog>` NATIVO, e não uma biblioteca: focus trap, Escape, retorno de
        foco, top layer e backdrop vêm prontos do browser. Instalar headlessui,
        radix ou react-modal derrubaria o Gate 5 de `npm run gates:fase-06`, que
        fixa a contagem de dependências — e escrever focus trap à mão seria
        inventar um design system para revelar um bloco de texto.

        CUSTO ACEITO: com JS desabilitado o modal não abre — regressão real em
        relação ao `<details>`, nesta que é a única tela do produto sem sessão.
        Aceita porque o aceite não depende do modal abrir: o `required` do
        checkbox e a validação server-side (E3) continuam sendo as duas guardas,
        e nenhuma delas passa por aqui.
      */}
      <div>
        <button
          type="button"
          onClick={() => dialogoRef.current?.showModal()}
          className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-left text-sm/[1.5] font-semibold text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
        >
          Ler os Termos de Uso (versão {termo.versao})
        </button>

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
              dentro de form é `submit` por padrão — abrir ou fechar o modal
              dispararia o cadastro (T-Q07-02).
            */}
            <button
              type="button"
              onClick={() => dialogoRef.current?.close()}
              className="w-full rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-md active:scale-[0.98]"
            >
              Fechar
            </button>
          </div>
        </dialog>

        {/*
          O input fica DENTRO do `<label>`: a linha inteira de 45px vira área de
          clique e nenhum par `htmlFor`/`id` é necessário.
        */}
        <label className="flex cursor-pointer items-start gap-3 py-3 text-sm/[1.5] text-slate-600">
          <input
            type="checkbox"
            name="aceiteTermos"
            required
            className="h-5 w-5 shrink-0 rounded border-slate-300 accent-slate-800"
          />
          <span>
            Li e aceito os <span className="font-semibold text-slate-800">Termos de Uso</span>
          </span>
        </label>

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
