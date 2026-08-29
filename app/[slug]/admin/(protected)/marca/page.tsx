import { notFound } from "next/navigation";
import { requireAdminSession } from "@/lib/session";
import { empresaService } from "@/app/services/empresa.service";
import { usuarioService } from "@/app/services/usuario.service";
import { MarcaForm } from "./_components/marca-form";
import { MarcaSimplesForm } from "./_components/marca-simples-form";
import { updateBranding } from "./actions";

export default async function AdminMarcaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);
  const [empresa, usuario] = await Promise.all([
    empresaService.findBranding(session.empresaId),
    usuarioService.findById(session.sub),
  ]);

  if (!empresa) {
    notFound();
  }

  const nomeUsuario = usuario?.nome ?? "";

  if (empresa.modoInterface === "SIMPLES") {
    return (
      <MarcaSimplesForm
        slug={slug}
        action={updateBranding.bind(null, slug)}
        empresa={empresa}
        nomeUsuario={nomeUsuario}
      />
    );
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

      <MarcaForm action={updateBranding.bind(null, slug)} empresa={empresa} nomeUsuario={nomeUsuario} />
    </div>
  );
}
