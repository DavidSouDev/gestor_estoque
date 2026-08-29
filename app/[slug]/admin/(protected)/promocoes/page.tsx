import Link from "next/link";
import { requireAdminSession } from "@/lib/session";
import { promocaoService } from "@/app/services/promocao.service";
import { formatDateTime } from "@/lib/format";
import { ConfirmSubmitButton } from "../_components/confirm-submit-button";
import { deletePromocao } from "./actions";

export default async function AdminPromocoesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);
  const promocoes = await promocaoService.list(session.empresaId);
  const agora = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-slate-800">Promoções</h1>
        <Link
          href={`/${slug}/admin/promocoes/novo`}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          Nova promoção
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {promocoes.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Nenhuma promoção cadastrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Promoção
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Período
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Itens
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Status
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {promocoes.map((promocao) => {
                  const vigente = promocao.dataInicio <= agora && promocao.dataFim >= agora;

                  return (
                    <tr key={promocao.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        <Link href={`/${slug}/admin/promocoes/${promocao.id}`} className="hover:underline">
                          {promocao.nome}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDateTime(promocao.dataInicio)} — {formatDateTime(promocao.dataFim)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{promocao.itens.length} item(ns)</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            vigente ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {vigente ? "Vigente" : "Fora do período"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <form action={deletePromocao.bind(null, slug, promocao.id)}>
                          <ConfirmSubmitButton
                            confirmMessage={`Remover a promoção "${promocao.nome}"?`}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
                          >
                            Remover
                          </ConfirmSubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
