"use client";

import { useState } from "react";
import { useActionState } from "react";
import type { RegisterState } from "../actions";
import { ModoInterfacePicker } from "@/app/_components/modo-interface-picker";

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm transition-all focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200";

export function RegisterForm({
  action,
}: {
  action: (state: RegisterState, formData: FormData) => Promise<RegisterState>;
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
