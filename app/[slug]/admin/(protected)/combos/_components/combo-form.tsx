"use client";

import { useActionState } from "react";
import type { ComboFormState } from "../actions";
import type { ComboAdminDetalhe, ProdutoAdmin } from "../../../_lib/types";
import { CollapsibleSection } from "../../_components/collapsible-section";

const INPUT_CLASS =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/20";

export function ComboForm({
  action,
  combo,
  produtos,
}: {
  action: (state: ComboFormState, formData: FormData) => Promise<ComboFormState>;
  combo?: ComboAdminDetalhe;
  produtos: ProdutoAdmin[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const quantidadePorProduto = new Map(
    (combo?.itens ?? []).map((item) => [item.produtoId, item.quantidade])
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="nome" className="text-sm font-medium text-slate-600">
          Nome
        </label>
        <input id="nome" name="nome" required defaultValue={combo?.nome} className={INPUT_CLASS} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="preco" className="text-sm font-medium text-slate-600">
          Preço
        </label>
        <input
          id="preco"
          name="preco"
          type="number"
          step="0.01"
          required
          defaultValue={combo ? Number(combo.preco) : undefined}
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-600">Quais produtos entram no combo?</p>
        {produtos.length === 0 ? (
          <p className="text-sm text-slate-500">Cadastre produtos antes de criar um combo.</p>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
            {produtos.map((produto) => {
              const quantidadeAtual = quantidadePorProduto.get(produto.id);

              return (
                <label key={produto.id} className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name={`item-${produto.id}`}
                    defaultChecked={quantidadeAtual !== undefined}
                  />
                  <span className="flex-1">{produto.nome}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <CollapsibleSection>
        <div className="flex flex-col gap-1">
          <label htmlFor="descricao" className="text-sm font-medium text-slate-600">
            Descrição
          </label>
          <textarea
            id="descricao"
            name="descricao"
            rows={3}
            defaultValue={combo?.descricao ?? ""}
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="fotoCapa" className="text-sm font-medium text-slate-600">
            Foto (URL)
          </label>
          <input
            id="fotoCapa"
            name="fotoCapa"
            defaultValue={combo?.fotoCapa ?? ""}
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="destaque" defaultChecked={combo?.destaque ?? false} />
            Destaque
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="visivel" defaultChecked={combo?.visivel ?? true} />
            Visível no catálogo
          </label>
        </div>
      </CollapsibleSection>

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
