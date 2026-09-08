"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import type { ProdutoCatalogoSerializado } from "../../_lib/types";

export function ProdutoDetalhe({
  slug,
  produto,
  precoPromocional,
  linkWhatsapp,
  linkInstagram,
}: {
  slug: string;
  produto: ProdutoCatalogoSerializado;
  precoPromocional?: number;
  linkWhatsapp?: string | null;
  linkInstagram?: string | null;
}) {
  const imagens = [
    ...(produto.fotoCapa ? [{ id: "capa", url: produto.fotoCapa, alt: produto.nome }] : []),
    ...produto.imagens
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((imagem) => ({ id: imagem.id, url: imagem.url, alt: imagem.alt ?? produto.nome })),
  ];

  const [imagemAtiva, setImagemAtiva] = useState(0);

  const precoOriginal = produto.precoVarejo;
  const emPromocao = precoPromocional !== undefined && precoPromocional < precoOriginal;
  const percentualOff = emPromocao
    ? Math.round((1 - precoPromocional / precoOriginal) * 100)
    : 0;
  const semEstoque = produto.estoque <= 0;

  return (
    <div>
      <Link
        href={`/${slug}`}
        className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        ← Voltar para o catálogo
      </Link>

      <div className="grid grid-cols-1 gap-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:grid-cols-2">
        <div>
          <div className="relative h-72 w-full overflow-hidden rounded-xl bg-slate-100 sm:h-96">
            {imagens.length > 0 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagens[imagemAtiva].url}
                alt={imagens[imagemAtiva].alt}
                className="h-full w-full object-cover"
              />
            )}
            {semEstoque && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
                <span className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
                  Fora de estoque
                </span>
              </div>
            )}
          </div>

          {imagens.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {imagens.map((imagem, index) => (
                <button
                  key={imagem.id}
                  onClick={() => setImagemAtiva(index)}
                  aria-label={`Ver imagem ${index + 1}`}
                  className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 ${
                    index === imagemAtiva ? "border-slate-800" : "border-transparent"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagem.url} alt={imagem.alt} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <span className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            {produto.categoria}
          </span>
          <h1 className="mb-3 text-2xl font-bold text-slate-800">{produto.nome}</h1>

          {produto.descricao && (
            <p className="mb-6 text-sm leading-relaxed text-slate-500">{produto.descricao}</p>
          )}

          <div className="mt-auto flex flex-col gap-4">
            <div>
              {emPromocao && (
                <span className="mr-2 text-sm text-slate-400 line-through">
                  {formatCurrency(precoOriginal)}
                </span>
              )}
              {emPromocao && (
                <span className="rounded-full bg-amber-400 px-2 py-1 text-xs font-bold text-amber-900">
                  {percentualOff}% OFF
                </span>
              )}
              <p className="text-3xl font-bold text-slate-800">
                {formatCurrency(emPromocao ? precoPromocional : precoOriginal)}
              </p>
            </div>

            <span
              className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                semEstoque ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {semEstoque ? "Indisponível" : `${produto.estoque} em estoque`}
            </span>

            {(linkWhatsapp || linkInstagram) && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-slate-600">Quer comprar este produto?</p>
                <div className="flex flex-wrap gap-2">
                  {linkWhatsapp && (
                    <a
                      href={linkWhatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
                    >
                      Comprar pelo WhatsApp
                    </a>
                  )}
                  {linkInstagram && (
                    <a
                      href={linkInstagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300"
                    >
                      Ver no Instagram
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
