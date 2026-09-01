import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";
import { getEmpresaBranding } from "../../_lib/empresa";
import { login } from "../_lib/auth-actions";
import { LoginForm } from "../_components/login-form";

/**
 * Branding do SISTEMA (não da loja), aplicado quando a empresa está bloqueada.
 *
 * `#18181b` é exatamente o mesmo fallback que `(protected)/layout.tsx` já usa
 * quando a empresa não tem cor própria, e `#3f3f46` é o `zinc-700` do mesmo
 * ramp — nenhuma cor nova entra no sistema por causa desta variante.
 */
const BRANDING_GENERICO = {
  primaryColor: "#18181b",
  accentColor: "#3f3f46",
};

/**
 * D-09 / T-04-12. Esta tela responde 200 mesmo para uma empresa bloqueada, de
 * propósito: é por aqui que o cliente entra para regularizar a situação. Um 404
 * aqui trancaria do lado de fora justamente quem quer voltar — o objetivo da
 * fase se inverteria (04-RESEARCH.md, Achado crítico 2).
 *
 * Isso deixa um oráculo residual: `/{slug}` devolve 404 e `/{slug}/admin/login`
 * devolve 200, o que distingue "bloqueada" de "nunca existiu". O vazamento é
 * ACEITO e mitigado renderizando branding genérico — o visitante anônimo
 * aprende que existe uma porta de admin, não a identidade nem a marca do
 * negócio.
 *
 * Por isso NENHUMA palavra sobre pagamento, assinatura, suspensão ou cobrança
 * pode aparecer nesta tela: ela é pré-autenticação e pública, e nomear o motivo
 * aqui devolveria por texto exatamente a informação que a variante genérica
 * existe para esconder. A explicação real mora atrás do login, na tela de
 * bloqueio.
 */
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

  const empresa = await getEmpresaBranding(slug);
  const loginAction = login.bind(null, slug);

  const bloqueada = empresa.bloqueada;
  const primaryColor = bloqueada ? BRANDING_GENERICO.primaryColor : empresa.primaryColor;
  const accentColor = bloqueada ? BRANDING_GENERICO.accentColor : empresa.accentColor;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl">
          <div
            className="h-2"
            style={{
              background: `linear-gradient(90deg, ${primaryColor}, ${accentColor})`,
            }}
          />

          <div className="p-8">
            <div className="mb-8 text-center">
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg"
                style={{ backgroundColor: primaryColor }}
              >
                {bloqueada ? (
                  <svg
                    className="h-8 w-8"
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
                ) : empresa.logo ? (
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
              <h1 className="text-xl font-bold text-slate-800">{bloqueada ? "Painel Administrativo" : empresa.nome}</h1>
              {!bloqueada && <p className="mt-1 text-sm text-slate-500">Painel Administrativo</p>}
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

            <LoginForm action={loginAction} primaryColor={primaryColor} />

            {!bloqueada && (
              <a
                href={`/${slug}`}
                className="mt-4 block w-full py-2 text-center text-sm text-slate-400 transition-colors hover:text-slate-600"
              >
                ← Voltar ao catálogo
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
