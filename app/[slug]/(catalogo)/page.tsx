import { getEmpresaCatalogo } from "../_lib/empresa";
import { CatalogoClient } from "./_components/catalogo-client";
import type { ProdutoCatalogo } from "../_lib/types";

// Card do catálogo não exibe preço/imagem por variante (fora de escopo da
// primeira versão) — só converte `Decimal` pra `number` mesmo assim, porque
// `ProdutoCatalogoSerializado` cruza a fronteira Server -> Client e precisa
// de um objeto plano em qualquer profundidade.
function serializarVariantes(variantes: ProdutoCatalogo["variantes"]) {
  return variantes.map((variante) => ({
    ...variante,
    precoVarejo: variante.precoVarejo !== null ? Number(variante.precoVarejo) : null,
    precoAtacado: variante.precoAtacado !== null ? Number(variante.precoAtacado) : null,
  }));
}

export default async function CatalogoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const empresa = await getEmpresaCatalogo(slug);

  const precosPromocionais = new Map<string, number>();

  for (const promocao of empresa.promocoes) {
    for (const item of promocao.itens) {
      const alvoId = item.produto?.id ?? item.combo?.id;

      if (alvoId) {
        precosPromocionais.set(alvoId, Number(item.preco));
      }
    }
  }

  const produtos = [...empresa.produtos]
    .sort((a, b) => Number(b.destaque) - Number(a.destaque))
    .map((produto) => ({
      ...produto,
      precoVarejo: Number(produto.precoVarejo),
      variantes: serializarVariantes(produto.variantes),
      precoPromocional: precosPromocionais.get(produto.id),
    }));

  const combos = [...empresa.combos]
    .sort((a, b) => Number(b.destaque) - Number(a.destaque))
    .map((combo) => ({
      ...combo,
      preco: Number(combo.preco),
      itens: combo.itens.map((item) => ({
        ...item,
        produto: {
          ...item.produto,
          precoVarejo: Number(item.produto.precoVarejo),
          variantes: serializarVariantes(item.produto.variantes),
        },
      })),
      precoPromocional: precosPromocionais.get(combo.id),
    }));

  const categorias = [...new Set(produtos.map((produto) => produto.categoria))].sort();

  return (
    <CatalogoClient
      slug={slug}
      produtos={produtos}
      combos={combos}
      categorias={categorias}
      primaryColor={empresa.primaryColor}
      nomeEmpresa={empresa.nome}
      telefoneEmpresa={empresa.telefone}
    />
  );
}
