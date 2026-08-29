"use client";

import { useActionState } from "react";
import { formatCurrency } from "@/lib/format";
import type { PromocaoFormState } from "../actions";
import type { PromocaoAdminDetalhe, ProdutoAdmin, ComboAdmin } from "../../../_lib/types";

const INPUT_CLASS =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/20";

function toDatetimeLocal(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function PromocaoForm({
  action,
  promocao,
  produtos,
  combos,
}: {
  action: (state: PromocaoFormState, formData: FormData) => Promise<PromocaoFormState>;
  promocao?: PromocaoAdminDetalhe;
  produtos: ProdutoAdmin[];
  combos: ComboAdmin[];
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const precoPorProduto = new Map(
    (promocao?.itens ?? [])
      .filter((item) => item.produtoId)
      .map((item) => [item.produtoId as string, Number(item.preco)])
  );
  const precoPorCombo = new Map(
    (promocao?.itens ?? [])
      .filter((item) => item.comboId)
      .map((item) => [item.comboId as string, Number(item.preco)])
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="nome" className="text-sm font-medium text-slate-600">
          Nome
        </label>
        <input id="nome" name="nome" required defaultValue={promocao?.nome} className={INPUT_CLASS} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="dataInicio" className="text-sm font-medium text-slate-600">
            Início
          </label>
          <input
            id="dataInicio"
            name="dataInicio"
            type="datetime-local"
            required
            defaultValue={promocao ? toDatetimeLocal(new Date(promocao.dataInicio)) : undefined}
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="dataFim" className="text-sm font-medium text-slate-600">
            Fim
          </label>
          <input
            id="dataFim"
            name="dataFim"
            type="datetime-local"
            required
            defaultValue={promocao ? toDatetimeLocal(new Date(promocao.dataFim)) : undefined}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-600">Produtos</p>
        {produtos.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum produto cadastrado.</p>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
            {produtos.map((produto) => {
              const precoAtual = precoPorProduto.get(produto.id);

              return (
                <label key={produto.id} className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name={`item-produto-${produto.id}`}
                    defaultChecked={precoAtual !== undefined}
                  />
                  <span className="flex-1">
                    {produto.nome}{" "}
                    <span className="text-slate-400">({formatCurrency(produto.precoVarejo)})</span>
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    name={`preco-produto-${produto.id}`}
                    defaultValue={precoAtual ?? Number(produto.precoVarejo)}
                    className={`w-28 ${INPUT_CLASS}`}
                  />
                </label>
              );
            })}
          </div>
        )}
      </div>

      {combos.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-600">Combos</p>
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
            {combos.map((combo) => {
              const precoAtual = precoPorCombo.get(combo.id);

              return (
                <label key={combo.id} className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name={`item-combo-${combo.id}`}
                    defaultChecked={precoAtual !== undefined}
                  />
                  <span className="flex-1">
                    {combo.nome} <span className="text-slate-400">({formatCurrency(combo.preco)})</span>
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    name={`preco-combo-${combo.id}`}
                    defaultValue={precoAtual ?? Number(combo.preco)}
                    className={`w-28 ${INPUT_CLASS}`}
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
