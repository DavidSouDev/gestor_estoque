"use client";

import { useMemo, useState } from "react";
import { ProdutoCard } from "./produto-card";
import { ComboCard } from "./combo-card";
import type { ComboCatalogoSerializado, ProdutoCatalogoSerializado } from "../../_lib/types";

export type ProdutoComPromocao = ProdutoCatalogoSerializado & { precoPromocional?: number };
export type ComboComPromocao = ComboCatalogoSerializado & { precoPromocional?: number };

export function CatalogoClient({
  produtos,
  combos,
  categorias,
  primaryColor,
}: {
  produtos: ProdutoComPromocao[];
  combos: ComboComPromocao[];
  categorias: string[];
  primaryColor: string;
}) {
  const [busca, setBusca] = useState("");
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("Todos");
  const [somenteDisponiveis, setSomenteDisponiveis] = useState(false);
  const [somentePromocao, setSomentePromocao] = useState(false);
  const [aba, setAba] = useState<"produtos" | "combos">("produtos");

  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase();

    return produtos.filter((produto) => {
      const buscaOk =
        produto.nome.toLowerCase().includes(termo) ||
        (produto.descricao ?? "").toLowerCase().includes(termo);
      const categoriaOk =
        categoriaSelecionada === "Todos" || produto.categoria === categoriaSelecionada;
      const disponivelOk = !somenteDisponiveis || produto.estoque > 0;
      const promocaoOk = !somentePromocao || produto.precoPromocional !== undefined;

      return buscaOk && categoriaOk && disponivelOk && promocaoOk;
    });
  }, [produtos, busca, categoriaSelecionada, somenteDisponiveis, somentePromocao]);

  const todasCategorias = ["Todos", ...categorias];

  return (
    <div>
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setAba("produtos")}
          className={`rounded-xl px-5 py-2 text-sm font-semibold transition-all ${
            aba === "produtos"
              ? "text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300"
          }`}
          style={aba === "produtos" ? { backgroundColor: primaryColor } : {}}
        >
          Produtos
        </button>
        <button
          onClick={() => setAba("combos")}
          className={`flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold transition-all ${
            aba === "combos"
              ? "text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300"
          }`}
          style={aba === "combos" ? { backgroundColor: primaryColor } : {}}
        >
          Combos
          <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-xs leading-none text-amber-900">
            {combos.length}
          </span>
        </button>
      </div>

      {aba === "produtos" && (
        <>
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Buscar produtos..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
              />
            </div>
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input
                type="checkbox"
                checked={somenteDisponiveis}
                onChange={(e) => setSomenteDisponiveis(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-slate-600">Só disponíveis</span>
            </label>
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input
                type="checkbox"
                checked={somentePromocao}
                onChange={(e) => setSomentePromocao(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-slate-600">Em promoção</span>
            </label>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {todasCategorias.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoriaSelecionada(cat)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  categoriaSelecionada === cat
                    ? "text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                }`}
                style={categoriaSelecionada === cat ? { backgroundColor: primaryColor } : {}}
              >
                {cat}
              </button>
            ))}
          </div>

          <p className="mb-4 text-sm text-slate-500">
            {filtrados.length} produto{filtrados.length !== 1 ? "s" : ""} encontrado
            {filtrados.length !== 1 ? "s" : ""}
          </p>

          {filtrados.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filtrados.map((produto) => (
                <ProdutoCard
                  key={produto.id}
                  produto={produto}
                  precoPromocional={produto.precoPromocional}
                />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center text-slate-400">
              <p className="font-medium">Nenhum produto encontrado</p>
              <p className="mt-1 text-sm">Tente ajustar os filtros</p>
            </div>
          )}
        </>
      )}

      {aba === "combos" && (
        <>
          <p className="mb-4 text-sm text-slate-500">
            Combos especiais com preços exclusivos
          </p>
          {combos.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {combos.map((combo) => (
                <ComboCard
                  key={combo.id}
                  combo={combo}
                  precoPromocional={combo.precoPromocional}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Nenhum combo disponível no momento.</p>
          )}
        </>
      )}
    </div>
  );
}
