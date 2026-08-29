import { formatCurrency } from "@/lib/format";
import type { ProdutoCatalogoSerializado } from "../../_lib/types";

export function ProdutoCard({
  produto,
  precoPromocional,
}: {
  produto: ProdutoCatalogoSerializado;
  precoPromocional?: number;
}) {
  const precoOriginal = produto.precoVarejo;
  const emPromocao = precoPromocional !== undefined && precoPromocional < precoOriginal;
  const percentualOff = emPromocao
    ? Math.round((1 - precoPromocional / precoOriginal) * 100)
    : 0;
  const semEstoque = produto.estoque <= 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="relative">
        <div className="h-44 w-full bg-slate-100">
          {produto.fotoCapa && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={produto.fotoCapa}
              alt={produto.nome}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        {emPromocao && (
          <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-2 py-1 text-xs font-bold text-amber-900">
            {percentualOff}% OFF
          </span>
        )}
        {semEstoque && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
            <span className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
              Fora de estoque
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <span className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          {produto.categoria}
        </span>
        <h3 className="mb-1 text-sm font-semibold leading-snug text-slate-800">
          {produto.nome}
        </h3>
        {produto.descricao && (
          <p className="mb-3 line-clamp-2 flex-1 text-xs text-slate-500">
            {produto.descricao}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between">
          <div>
            {emPromocao && (
              <span className="block text-xs text-slate-400 line-through">
                {formatCurrency(precoOriginal)}
              </span>
            )}
            <span className="text-lg font-bold text-slate-800">
              {formatCurrency(emPromocao ? precoPromocional : precoOriginal)}
            </span>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              semEstoque ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {semEstoque ? "Indisponível" : `${produto.estoque} em estoque`}
          </span>
        </div>
      </div>
    </div>
  );
}
