import { notFound } from "next/navigation";
import { getEmpresaCatalogo } from "../../../_lib/empresa";
import { ProdutoDetalhe } from "../../_components/produto-detalhe";
import { instagramLink } from "@/lib/contato";

export default async function ProdutoDetalhePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const empresa = await getEmpresaCatalogo(slug);

  const produtoEncontrado = empresa.produtos.find((produto) => produto.id === id);

  if (!produtoEncontrado) {
    notFound();
  }

  let precoPromocional: number | undefined;

  for (const promocao of empresa.promocoes) {
    for (const item of promocao.itens) {
      if (item.produto?.id === id) {
        precoPromocional = Number(item.preco);
      }
    }
  }

  const produto = {
    ...produtoEncontrado,
    precoVarejo: Number(produtoEncontrado.precoVarejo),
    variantes: produtoEncontrado.variantes.map((variante) => ({
      ...variante,
      precoVarejo: variante.precoVarejo !== null ? Number(variante.precoVarejo) : null,
      precoAtacado: variante.precoAtacado !== null ? Number(variante.precoAtacado) : null,
    })),
  };

  const linkInstagram = empresa.instagram ? instagramLink(empresa.instagram) : null;

  return (
    <ProdutoDetalhe
      slug={slug}
      produto={produto}
      precoPromocional={precoPromocional}
      telefoneEmpresa={empresa.telefone}
      nomeEmpresa={empresa.nome}
      linkInstagram={linkInstagram}
    />
  );
}
