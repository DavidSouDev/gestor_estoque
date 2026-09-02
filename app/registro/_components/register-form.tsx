"use client";

import { useState } from "react";
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

        Disclosure nativo do HTML, não modal: o projeto não tem sistema de modais
        (focus trap, scroll lock, Escape, return-focus, portal) e criar um para
        revelar um bloco de texto seria inventar um design system. O disclosure
        nativo satisfaz D-11 literalmente e continua funcionando com JS
        desabilitado — o que importa nesta, a única tela do produto sem sessão.
      */}
      <div>
        <details className="rounded-xl border border-slate-200 bg-slate-50/60 px-3">
          <summary className="cursor-pointer select-none py-3 text-sm/[1.5] font-semibold text-slate-600">
            Ler os Termos de Uso (versão {termo.versao})
          </summary>
          {/*
            `role="region"` + `aria-label` + `tabIndex` porque uma caixa rolável
            sem conteúdo focável é inalcançável pelo teclado.

            O texto é nó de texto React, com escape automático: injetar HTML
            bruto é PROIBIDO nesta fase (D-05 torna o conteúdo texto puro
            justamente para eliminar essa superfície).
          */}
          <div
            role="region"
            aria-label="Texto dos Termos de Uso"
            tabIndex={0}
            className="mb-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm/[1.5] text-slate-700"
          >
            {termo.conteudo}
          </div>
        </details>

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
