import { formatCurrency } from "@/lib/format";
import type { ComboCatalogoSerializado } from "../../_lib/types";

export function ComboCard({
  combo,
  precoPromocional,
}: {
  combo: ComboCatalogoSerializado;
  precoPromocional?: number;
}) {
  const precoOriginal = combo.preco;
  const emPromocao = precoPromocional !== undefined && precoPromocional < precoOriginal;
  const precoFinal = emPromocao ? precoPromocional : precoOriginal;
  const percentualOff = Math.round(((precoOriginal - precoFinal) / precoOriginal) * 100);

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 transition-all duration-200 hover:shadow-md">
      <div className="relative">
        <div className="h-40 w-full bg-slate-100">
          {combo.fotoCapa && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={combo.fotoCapa}
              alt={combo.nome}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        {percentualOff > 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold text-amber-900">
            COMBO -{percentualOff}%
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="mb-1 font-bold text-slate-800">{combo.nome}</h3>
        {combo.descricao && (
          <p className="mb-3 text-xs text-slate-500">{combo.descricao}</p>
        )}
        <div className="mb-3 flex flex-wrap gap-1">
          {combo.itens.map((item) => (
            <span
              key={item.id}
              className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-xs text-amber-800"
            >
              {item.quantidade}x {item.produto.nome}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {emPromocao && (
            <span className="text-xs text-slate-400 line-through">
              {formatCurrency(precoOriginal)}
            </span>
          )}
          <span className="text-lg font-bold text-slate-800">
            {formatCurrency(precoFinal)}
          </span>
        </div>
      </div>
    </div>
  );
}
