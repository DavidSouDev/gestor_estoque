import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/session";
import { promocaoService } from "@/app/services/promocao.service";
import { produtoService } from "@/app/services/produto.service";
import { comboService } from "@/app/services/combo.service";
import { serializeDecimals } from "@/lib/serialize";
import { PromocaoForm } from "../_components/promocao-form";
import { updatePromocao } from "../actions";

export default async function EditarPromocaoPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await requireAdminSession(slug);

  const promocao = await promocaoService.findById(id);

  if (!promocao || promocao.empresaId !== session.empresaId) {
    notFound();
  }

  const [produtos, combos] = await Promise.all([
    produtoService.list(session.empresaId),
    comboService.list(session.empresaId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-bold text-slate-800">Editar promoção</h1>
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <PromocaoForm
          action={updatePromocao.bind(null, slug, id)}
          promocao={serializeDecimals(promocao)}
          produtos={serializeDecimals(produtos)}
          combos={serializeDecimals(combos)}
        />
      </div>
    </div>
  );
}
