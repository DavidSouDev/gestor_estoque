import Link from "next/link";
import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { formatCurrency } from "@/lib/format";
import { ConfirmSubmitButton } from "../_components/confirm-submit-button";
import { deleteProduto, toggleProdutoCatalogo, toggleProdutoDestaque } from "./actions";

function Pill({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {children}
    </span>
  );
}

export default async function AdminProdutosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);
  const produtos = await produtoService.list(session.empresaId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-slate-800">Produtos</h1>
        <Link
          href={`/${slug}/admin/produtos/novo`}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          Novo produto
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {produtos.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Nenhum produto cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Produto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Categoria
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Preço varejo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Estoque
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Catálogo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Destaque
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {produtos.map((produto) => (
                  <tr key={produto.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                          {produto.fotoCapa && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={produto.fotoCapa}
                              alt={produto.nome}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <Link
                          href={`/${slug}/admin/produtos/${produto.id}`}
                          className="font-semibold text-slate-800 hover:underline"
                        >
                          {produto.nome}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{produto.categoria}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {formatCurrency(produto.precoVarejo)}
                    </td>
                    <td className="px-4 py-3">
                      <Pill active={produto.estoque > 0}>{produto.estoque} un.</Pill>
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleProdutoCatalogo.bind(null, slug, produto.id)}>
                        <button type="submit">
                          <Pill active={produto.visivelCatalogo}>
                            {produto.visivelCatalogo ? "Visível" : "Oculto"}
                          </Pill>
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleProdutoDestaque.bind(null, slug, produto.id)}>
                        <button type="submit">
                          <Pill active={produto.destaque}>{produto.destaque ? "Sim" : "Não"}</Pill>
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteProduto.bind(null, slug, produto.id)}>
                        <ConfirmSubmitButton
                          confirmMessage={`Remover "${produto.nome}"?`}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
                        >
                          Remover
                        </ConfirmSubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
