import { notFound } from "next/navigation";
import { getEmpresaCatalogo } from "../../../_lib/empresa";
import { ProdutoDetalhe } from "../../_components/produto-detalhe";
import { instagramLink, whatsappLink } from "@/lib/contato";
import { formatCurrency } from "@/lib/format";

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
  };

  const emPromocao = precoPromocional !== undefined && precoPromocional < produto.precoVarejo;
  const precoFinal = emPromocao ? precoPromocional : produto.precoVarejo;

  const mensagemWhatsapp = `Olá! Quero comprar o produto "${produto.nome}" (${formatCurrency(
    precoFinal
  )}) da loja ${empresa.nome}.`;
  const linkWhatsapp = empresa.telefone ? whatsappLink(empresa.telefone, mensagemWhatsapp) : null;
  const linkInstagram = empresa.instagram ? instagramLink(empresa.instagram) : null;

  return (
    <ProdutoDetalhe
      slug={slug}
      produto={produto}
      precoPromocional={precoPromocional}
      linkWhatsapp={linkWhatsapp}
      linkInstagram={linkInstagram}
    />
  );
}
