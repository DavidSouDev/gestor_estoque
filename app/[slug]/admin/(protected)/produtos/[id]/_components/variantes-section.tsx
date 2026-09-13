"use client";

import { useState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import { VarianteForm, type VarianteFormData } from "./variante-form";
import {
  createVariante,
  updateVariante,
  deleteVariante,
  toggleVarianteAtivo,
} from "../variantes-actions";

export interface VarianteAdmin extends VarianteFormData {
  id: string;
  ativo: boolean;
}

export function VariantesSection({
  slug,
  produtoId,
  produtoPrecoVarejo,
  controlaEstoquePorVariante,
  variantes,
}: {
  slug: string;
  produtoId: string;
  produtoPrecoVarejo: number;
  controlaEstoquePorVariante: boolean;
  variantes: VarianteAdmin[];
}) {
  const [novaAberta, setNovaAberta] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">Variantes</h2>
        {!novaAberta && (
          <button
            type="button"
            onClick={() => setNovaAberta(true)}
            className="text-sm font-medium text-slate-700 underline"
          >
            + Nova variante
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Use variantes para vender o mesmo produto em tamanhos, estampas ou cores diferentes, cada
        uma com suas próprias fotos.
      </p>

      {variantes.length === 0 && !novaAberta && (
        <p className="text-sm text-slate-500">Nenhuma variante cadastrada ainda.</p>
      )}

      <div className="flex flex-col gap-3">
        {variantes.map((variante) =>
          editandoId === variante.id ? (
            <VarianteForm
              key={variante.id}
              slug={slug}
              action={updateVariante.bind(null, slug, variante.id)}
              controlaEstoquePorVariante={controlaEstoquePorVariante}
              variante={variante}
              onCancel={() => setEditandoId(null)}
              onSuccess={() => setEditandoId(null)}
            />
          ) : (
            <div
              key={variante.id}
              className={`flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${
                variante.ativo ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                {variante.imagens[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={variante.imagens[0].url}
                    alt={variante.nome}
                    className="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
                  />
                )}
                <div>
                  <p className="font-semibold text-slate-800">{variante.nome}</p>
                  <p className="text-xs text-slate-500">
                    {variante.atributos
                      .map((atributo) => `${atributo.nome}: ${atributo.valor}`)
                      .join(" · ")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatCurrency(variante.precoVarejo ?? produtoPrecoVarejo)}
                    {controlaEstoquePorVariante && ` · ${variante.estoque} em estoque`}
                    {!variante.ativo && " · Desativada"}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => setEditandoId(variante.id)}
                  className="font-medium text-slate-600 underline"
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => toggleVarianteAtivo(slug, variante.id))}
                  className="font-medium text-slate-600 underline disabled:opacity-50"
                >
                  {variante.ativo ? "Desativar" : "Ativar"}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (confirm(`Remover a variante "${variante.nome}"?`)) {
                      startTransition(() => deleteVariante(slug, variante.id));
                    }
                  }}
                  className="font-medium text-red-500 underline disabled:opacity-50"
                >
                  Remover
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {novaAberta && (
        <VarianteForm
          slug={slug}
          action={createVariante.bind(null, slug, produtoId)}
          controlaEstoquePorVariante={controlaEstoquePorVariante}
          onCancel={() => setNovaAberta(false)}
          onSuccess={() => setNovaAberta(false)}
        />
      )}
    </section>
  );
}
