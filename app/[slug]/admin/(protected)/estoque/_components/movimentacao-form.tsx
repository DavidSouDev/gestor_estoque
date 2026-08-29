"use client";

import { useActionState } from "react";
import type { MovimentacaoFormState } from "../actions";
import type { ProdutoAdmin } from "../../../_lib/types";

const INPUT_CLASS =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/20";

const TIPO_LABELS = {
  ENTRADA: "Entrada (chegou mercadoria)",
  SAIDA: "Saída (venda ou perda)",
  AJUSTE: "Ajustar quantidade (corrigir contagem)",
};

export function MovimentacaoForm({
  action,
  produtos,
}: {
  action: (state: MovimentacaoFormState, formData: FormData) => Promise<MovimentacaoFormState>;
  produtos: ProdutoAdmin[];
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="produtoId" className="text-sm font-medium text-slate-600">
          Produto
        </label>
        <select id="produtoId" name="produtoId" required className={INPUT_CLASS}>
          <option value="">Selecione...</option>
          {produtos.map((produto) => (
            <option key={produto.id} value={produto.id}>
              {produto.nome} (estoque atual: {produto.estoque})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="tipo" className="text-sm font-medium text-slate-600">
            Tipo
          </label>
          <select id="tipo" name="tipo" required className={INPUT_CLASS}>
            <option value="ENTRADA">{TIPO_LABELS.ENTRADA}</option>
            <option value="SAIDA">{TIPO_LABELS.SAIDA}</option>
            <option value="AJUSTE">{TIPO_LABELS.AJUSTE}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="quantidade" className="text-sm font-medium text-slate-600">
            Quantidade
          </label>
          <input
            id="quantidade"
            name="quantidade"
            type="number"
            min={1}
            required
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="motivo" className="text-sm font-medium text-slate-600">
          Motivo (opcional)
        </label>
        <input id="motivo" name="motivo" className={INPUT_CLASS} />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Registrando..." : "Registrar"}
      </button>
    </form>
  );
}
