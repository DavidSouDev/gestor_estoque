import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { comboService } from "@/app/services/combo.service";
import { serializeDecimals } from "@/lib/serialize";
import { PromocaoForm } from "../_components/promocao-form";
import { createPromocao } from "../actions";

export default async function NovaPromocaoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);

  const [produtos, combos] = await Promise.all([
    produtoService.list(session.empresaId),
    comboService.list(session.empresaId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-bold text-slate-800">Nova promoção</h1>
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <PromocaoForm
          action={createPromocao.bind(null, slug)}
          produtos={serializeDecimals(produtos)}
          combos={serializeDecimals(combos)}
        />
      </div>
    </div>
  );
}
