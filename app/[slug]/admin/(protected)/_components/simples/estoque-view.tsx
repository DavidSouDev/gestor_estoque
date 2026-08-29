"use client";

import type { ProdutoAdmin } from "../../../_lib/types";

const ESTOQUE_BAIXO_LIMITE = 5;

function badgeClass(estoque: number) {
  if (estoque === 0) return "bg-red-50 text-red-600";
  if (estoque <= ESTOQUE_BAIXO_LIMITE) return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

export function EstoqueView({ produtos, onBack }: { produtos: ProdutoAdmin[]; onBack: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 w-fit rounded-2xl px-4 py-2 text-lg font-semibold text-slate-500 hover:bg-slate-100"
      >
        ← Voltar
      </button>

      <h1 className="mb-6 text-2xl font-bold text-slate-800 sm:text-3xl">Seu estoque</h1>

      {produtos.length === 0 ? (
        <p className="text-slate-500">Você ainda não tem produtos cadastrados.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {produtos.map((produto) => (
            <div
              key={produto.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4"
            >
              <span className="text-lg font-semibold text-slate-800">{produto.nome}</span>
              <span className={`rounded-full px-4 py-1.5 text-base font-bold ${badgeClass(produto.estoque)}`}>
                {produto.estoque} un.
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
