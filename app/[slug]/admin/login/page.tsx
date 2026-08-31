import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";
import { getEmpresaCatalogo } from "../../_lib/empresa";
import { login } from "../_lib/auth-actions";
import { LoginForm } from "../_components/login-form";

export default async function AdminLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getVerifiedSession();

  if (session && session.empresaSlug === slug) {
    redirect(`/${slug}/admin`);
  }

  const empresa = await getEmpresaCatalogo(slug);
  const loginAction = login.bind(null, slug);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl">
          <div
            className="h-2"
            style={{
              background: `linear-gradient(90deg, ${empresa.primaryColor}, ${empresa.accentColor})`,
            }}
          />

          <div className="p-8">
            <div className="mb-8 text-center">
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg"
                style={{ backgroundColor: empresa.primaryColor }}
              >
                {empresa.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={empresa.logo}
                    alt="Logo"
                    className="h-full w-full rounded-2xl object-cover"
                  />
                ) : (
                  empresa.nome.charAt(0)
                )}
              </div>
              <h1 className="text-xl font-bold text-slate-800">{empresa.nome}</h1>
              <p className="mt-1 text-sm text-slate-500">Painel Administrativo</p>
            </div>

            <div className="mb-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <svg
                className="h-4 w-4 shrink-0 text-emerald-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span className="text-xs text-slate-500">
                Autenticação segura via <span className="font-semibold text-slate-700">JWT</span>
              </span>
            </div>

            <LoginForm action={loginAction} primaryColor={empresa.primaryColor} />

            <a
              href={`/${slug}`}
              className="mt-4 block w-full py-2 text-center text-sm text-slate-400 transition-colors hover:text-slate-600"
            >
              ← Voltar ao catálogo
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
