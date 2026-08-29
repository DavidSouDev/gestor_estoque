"use client";

import { useActionState } from "react";
import type { LoginState } from "../_lib/auth-actions";

export function LoginForm({
  action,
  primaryColor,
}: {
  action: (state: LoginState, formData: FormData) => Promise<LoginState>;
  primaryColor: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
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
          placeholder="admin@empresa.com"
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2"
          style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
        />
      </div>

      <div>
        <label htmlFor="senha" className="mb-1.5 block text-xs font-semibold text-slate-600">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2"
          style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
        />
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
        className="w-full rounded-xl py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60"
        style={{ backgroundColor: primaryColor }}
      >
        {pending ? "Autenticando..." : "Entrar no painel"}
      </button>
    </form>
  );
}
