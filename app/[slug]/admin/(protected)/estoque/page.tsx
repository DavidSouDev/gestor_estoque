import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { movimentacaoEstoqueService } from "@/app/services/movimentacao-estoque.service";
import { formatDateTime } from "@/lib/format";
import { serializeDecimals } from "@/lib/serialize";
import { MovimentacaoForm } from "./_components/movimentacao-form";
import { registrarMovimentacao } from "./actions";

const TIPO_LABEL: Record<string, string> = {
  ENTRADA: "bg-emerald-50 text-emerald-700",
  SAIDA: "bg-red-50 text-red-600",
  AJUSTE: "bg-amber-50 text-amber-700",
};

export default async function AdminEstoquePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);

  const [produtos, movimentacoes] = await Promise.all([
    produtoService.list(session.empresaId),
    movimentacaoEstoqueService.list(session.empresaId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h1 className="mb-4 font-bold text-slate-800">Registrar movimentação</h1>
        <MovimentacaoForm
          action={registrarMovimentacao.bind(null, slug)}
          produtos={serializeDecimals(produtos)}
        />
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <h2 className="p-5 pb-0 font-semibold text-slate-700">Histórico</h2>
        {movimentacoes.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Nenhuma movimentação registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Produto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Quantidade
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Motivo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Usuário
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Data
                  </th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((movimentacao) => (
                  <tr key={movimentacao.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {movimentacao.produto.nome}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          TIPO_LABEL[movimentacao.tipo] ?? "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {movimentacao.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{movimentacao.quantidade}</td>
                    <td className="px-4 py-3 text-slate-500">{movimentacao.motivo ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{movimentacao.usuario.nome}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateTime(movimentacao.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
