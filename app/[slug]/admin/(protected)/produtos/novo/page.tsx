import { requireAdminSession } from "@/lib/session";
import { ProdutoForm } from "../_components/produto-form";
import { createProduto } from "../actions";

export default async function NovoProdutoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminSession(slug);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-bold text-slate-800">Novo produto</h1>
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <ProdutoForm action={createProduto.bind(null, slug)} />
      </div>
    </div>
  );
}
