import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/session";
import { comboService } from "@/app/services/combo.service";
import { produtoService } from "@/app/services/produto.service";
import { serializeDecimals } from "@/lib/serialize";
import { ComboForm } from "../_components/combo-form";
import { updateCombo } from "../actions";

export default async function EditarComboPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await requireAdminSession(slug);

  const combo = await comboService.findById(id);

  if (!combo || combo.empresaId !== session.empresaId) {
    notFound();
  }

  const produtos = await produtoService.list(session.empresaId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-bold text-slate-800">Editar combo</h1>
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <ComboForm
          action={updateCombo.bind(null, slug, id)}
          combo={serializeDecimals(combo)}
          produtos={serializeDecimals(produtos)}
        />
      </div>
    </div>
  );
}
