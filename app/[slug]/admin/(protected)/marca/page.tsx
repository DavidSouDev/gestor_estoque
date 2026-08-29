import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/session";
import { empresaService } from "@/app/services/empresa.service";
import { MarcaForm } from "./_components/marca-form";
import { updateBranding } from "./actions";

export default async function AdminMarcaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);
  const empresa = await empresaService.findBranding(session.empresaId);

  if (!empresa) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-slate-800">Personalização da Marca</h1>
        <p className="text-sm text-slate-500">
          Configure a identidade visual da sua loja. As alterações são refletidas no catálogo e no
          painel administrativo.
        </p>
      </div>

      <MarcaForm action={updateBranding.bind(null, slug)} empresa={empresa} />
    </div>
  );
}
