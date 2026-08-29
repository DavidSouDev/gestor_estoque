import Link from "next/link";
import { requireAdminSession } from "@/lib/session";
import { comboService } from "@/app/services/combo.service";
import { formatCurrency } from "@/lib/format";
import { ConfirmSubmitButton } from "../_components/confirm-submit-button";
import { deleteCombo, toggleComboCatalogo, toggleComboDestaque } from "./actions";

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

export default async function AdminCombosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);
  const combos = await comboService.list(session.empresaId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-slate-800">Combos</h1>
        <Link
          href={`/${slug}/admin/combos/novo`}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          Novo combo
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {combos.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Nenhum combo cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Combo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Itens
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Preço
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
                {combos.map((combo) => (
                  <tr key={combo.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                          {combo.fotoCapa && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={combo.fotoCapa}
                              alt={combo.nome}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <Link
                          href={`/${slug}/admin/combos/${combo.id}`}
                          className="font-semibold text-slate-800 hover:underline"
                        >
                          {combo.nome}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{combo.itens.length} produto(s)</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {formatCurrency(combo.preco)}
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleComboCatalogo.bind(null, slug, combo.id)}>
                        <button type="submit">
                          <Pill active={combo.visivel}>{combo.visivel ? "Visível" : "Oculto"}</Pill>
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleComboDestaque.bind(null, slug, combo.id)}>
                        <button type="submit">
                          <Pill active={combo.destaque}>{combo.destaque ? "Sim" : "Não"}</Pill>
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteCombo.bind(null, slug, combo.id)}>
                        <ConfirmSubmitButton
                          confirmMessage={`Remover o combo "${combo.nome}"?`}
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
