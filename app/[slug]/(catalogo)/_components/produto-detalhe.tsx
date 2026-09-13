"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { whatsappLink } from "@/lib/contato";
import type { ProdutoCatalogoSerializado } from "../../_lib/types";

export function ProdutoDetalhe({
  slug,
  produto,
  precoPromocional,
  telefoneEmpresa,
  nomeEmpresa,
  linkInstagram,
}: {
  slug: string;
  produto: ProdutoCatalogoSerializado;
  precoPromocional?: number;
  telefoneEmpresa?: string | null;
  nomeEmpresa: string;
  linkInstagram?: string | null;
}) {
  const [varianteSelecionadaId, setVarianteSelecionadaId] = useState<string | null>(null);
  const [imagemAtiva, setImagemAtiva] = useState(0);

  const varianteAtiva = produto.variantes.find((variante) => variante.id === varianteSelecionadaId);

  function selecionarVariante(id: string) {
    setVarianteSelecionadaId((atual) => (atual === id ? null : id));
    setImagemAtiva(0);
  }

  const imagensProduto = [
    ...(produto.fotoCapa ? [{ id: "capa", url: produto.fotoCapa, alt: produto.nome }] : []),
    ...produto.imagens
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((imagem) => ({ id: imagem.id, url: imagem.url, alt: imagem.alt ?? produto.nome })),
  ];

  // Variante sem foto própria cai de volta pras imagens do produto — não faz
  // sentido deixar a galeria vazia só porque essa variante específica ainda
  // não tem imagem cadastrada.
  const imagens =
    varianteAtiva && varianteAtiva.imagens.length > 0
      ? varianteAtiva.imagens
          .slice()
          .sort((a, b) => a.ordem - b.ordem)
          .map((imagem) => ({ id: imagem.id, url: imagem.url, alt: imagem.alt ?? varianteAtiva.nome }))
      : imagensProduto;

  const precoBase = varianteAtiva?.precoVarejo ?? produto.precoVarejo;

  // Promoções são configuradas em cima do preço do produto — se a variante
  // selecionada tem um preço próprio (sobrescrito), o valor promocional
  // calculado pra outro preço não se aplica a ela, então a promoção só
  // aparece quando a variante ativa não sobrescreve o preço (ou nenhuma está
  // selecionada).
  const emPromocao =
    (varianteAtiva?.precoVarejo ?? null) === null &&
    precoPromocional !== undefined &&
    precoPromocional < precoBase;
  const percentualOff = emPromocao ? Math.round((1 - precoPromocional! / precoBase) * 100) : 0;
  const precoFinal = emPromocao ? precoPromocional! : precoBase;

  const estoqueExibido =
    varianteAtiva && produto.controlaEstoquePorVariante ? varianteAtiva.estoque : produto.estoque;
  const semEstoque = estoqueExibido <= 0;

  const nomeParaMensagem = varianteAtiva ? `${produto.nome} (${varianteAtiva.nome})` : produto.nome;
  const mensagemWhatsapp = `Olá! Quero comprar o produto "${nomeParaMensagem}" (${formatCurrency(
    precoFinal
  )}) da loja ${nomeEmpresa}.`;
  const linkWhatsapp = telefoneEmpresa ? whatsappLink(telefoneEmpresa, mensagemWhatsapp) : null;

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
                src={imagens[imagemAtiva]?.url ?? imagens[0].url}
                alt={imagens[imagemAtiva]?.alt ?? imagens[0].alt}
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

          {produto.variantes.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-slate-600">Variantes</p>
              <div className="flex flex-wrap gap-2">
                {produto.variantes.map((variante) => {
                  const capaVariante = variante.imagens.slice().sort((a, b) => a.ordem - b.ordem)[0];
                  const selecionada = variante.id === varianteSelecionadaId;

                  return (
                    <button
                      key={variante.id}
                      onClick={() => selecionarVariante(variante.id)}
                      className={`flex items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-sm font-medium transition-colors ${
                        selecionada
                          ? "border-slate-800 bg-slate-800 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                      }`}
                    >
                      {capaVariante ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={capaVariante.url}
                          alt={variante.nome}
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          className={`h-7 w-7 rounded-full ${selecionada ? "bg-slate-700" : "bg-slate-100"}`}
                        />
                      )}
                      {variante.nome}
                    </button>
                  );
                })}
              </div>
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
                  {formatCurrency(precoBase)}
                </span>
              )}
              {emPromocao && (
                <span className="rounded-full bg-amber-400 px-2 py-1 text-xs font-bold text-amber-900">
                  {percentualOff}% OFF
                </span>
              )}
              <p className="text-3xl font-bold text-slate-800">{formatCurrency(precoFinal)}</p>
            </div>

            <span
              className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                semEstoque ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {semEstoque ? "Indisponível" : `${estoqueExibido} em estoque`}
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
