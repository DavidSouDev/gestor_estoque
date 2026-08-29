import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { movimentacaoEstoqueService } from "@/app/services/movimentacao-estoque.service";
import { formatDateTime } from "@/lib/format";
import { serializeDecimals } from "@/lib/serialize";
import { ProdutoForm } from "../_components/produto-form";
import { updateProduto } from "../actions";

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await requireAdminSession(slug);

  const produto = await produtoService.findById(id);

  if (!produto || produto.empresaId !== session.empresaId) {
    notFound();
  }

  const movimentacoes = await movimentacaoEstoqueService.listByProduto(id);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <h1 className="font-bold text-slate-800">Editar produto</h1>
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <ProdutoForm action={updateProduto.bind(null, slug, id)} produto={serializeDecimals(produto)} />
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-500">Histórico de movimentações</h2>
        {movimentacoes.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma movimentação registrada.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm text-slate-700">
            {movimentacoes.map((movimentacao) => (
              <li
                key={movimentacao.id}
                className="flex flex-col justify-between gap-1 rounded-xl border border-slate-100 bg-white px-3 py-2 sm:flex-row sm:items-center"
              >
                <span>
                  {movimentacao.tipo} · {movimentacao.quantidade} un.
                  {movimentacao.motivo ? ` · ${movimentacao.motivo}` : ""}
                </span>
                <span className="text-slate-500">
                  {formatDateTime(movimentacao.createdAt)} · {movimentacao.usuario.nome}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
