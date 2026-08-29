import { requireAdminSession } from "@/lib/session";
import { empresaService } from "@/app/services/empresa.service";
import { logout } from "../_lib/auth-actions";
import { AdminNav } from "./_components/admin-nav";
import { SimplesTopBar } from "./_components/simples/simples-top-bar";

export default async function AdminProtectedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);
  const empresa = await empresaService.findHeaderData(session.empresaId);

  if (empresa?.modoInterface === "SIMPLES") {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <SimplesTopBar
          slug={slug}
          empresaNome={empresa?.nome ?? slug}
          primaryColor={empresa?.primaryColor ?? "#18181b"}
          logoutAction={logout.bind(null, slug)}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">
      <AdminNav
        slug={slug}
        empresaNome={empresa?.nome ?? slug}
        email={session.email}
        primaryColor={empresa?.primaryColor ?? "#18181b"}
        logoutAction={logout.bind(null, slug)}
      />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
