import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { serializeDecimals } from "@/lib/serialize";
import { ComboForm } from "../_components/combo-form";
import { createCombo } from "../actions";

export default async function NovoComboPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);
  const produtos = await produtoService.list(session.empresaId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-bold text-slate-800">Novo combo</h1>
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <ComboForm action={createCombo.bind(null, slug)} produtos={serializeDecimals(produtos)} />
      </div>
    </div>
  );
}
