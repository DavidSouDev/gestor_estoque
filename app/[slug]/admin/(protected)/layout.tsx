import { StatusAcesso } from "@prisma/client";
import { requireAdminSession } from "@/lib/session";
import { revalidarConta } from "@/lib/auth-guard";
import { diasRestantesDeCarencia } from "@/lib/avaliar-acesso";
import { empresaService } from "@/app/services/empresa.service";
import { logout } from "../_lib/auth-actions";
import { iniciarPagamento } from "../_lib/assinatura-actions";
import { AdminNav } from "./_components/admin-nav";
import { AvisoCarencia } from "./_components/aviso-carencia";
import { SimplesTopBar } from "./_components/simples/simples-top-bar";

// Este layout hospeda APENAS UI. Ele não é — e não pode virar — o boundary de
// autorização da fase: no App Router, um layout não controla se o resto da rota
// renderiza. Os segmentos filhos continuam executando e continuam saindo no RSC
// Payload mesmo que o layout renderize outra coisa no lugar do conteúdo da rota
// e, por partial rendering, layouts não re-renderizam em navegação client-side.
// Substituir o conteúdo filho por uma tela de suspensão aqui produziria uma
// barreira puramente visual sobre dados que já vazaram (T-04-06).
// Fonte: node_modules/next/dist/docs/01-app/02-guides/authentication.md
// Quem fecha o painel é a DAL de sessão chamada por CADA page (plano 04-06).
export default async function AdminProtectedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);

  // NÃO custa uma segunda query: `requireAdminSession` já revalidou a conta
  // neste mesmo request e a revalidação é deduplicada por `React.cache`, então
  // esta chamada devolve o MESMO resultado (comentário normativo em
  // `lib/api-auth.ts:20-24`). Aqui ela serve só para ler o status vivo e a data
  // de fim da carência, que a sessão do cookie não carrega.
  // `conta` nunca é `null` neste ponto — `requireAdminSession` já teria
  // redirecionado —, mas o acesso é feito com optional chaining por segurança
  // de tipos, e não porque o caso seja alcançável.
  const conta = await revalidarConta(session.sub, session.empresaId);
  const empresa = await empresaService.findHeaderData(session.empresaId);

  // O relógio é lido AQUI, no chamador impuro, e injetado na função pura — mesmo
  // contrato de `revalidarConta`/`avaliarAcesso` (T-02-13). Nunca dentro do
  // componente de aviso, que é uma função pura de um número (T-04-20).
  const carenciaAte = conta?.statusAcesso === StatusAcesso.CARENCIA ? conta.carenciaAte : null;
  const emCarencia = carenciaAte !== null;
  const diasRestantes = emCarencia ? diasRestantesDeCarencia(carenciaAte, new Date()) : 0;

  // Um único nó, renderizado nos DOIS branches abaixo: ACC-01 exige o aviso em
  // TODAS as telas do admin, e o modo de interface é escolha do tenant (D-02).
  // Ele nunca atravessa para `app/[slug]/(catalogo)` — durante a carência o
  // catálogo continua no ar e inteiramente livre de cobrança (D-03 / D-07).
  const bannerCarencia = emCarencia ? (
    <AvisoCarencia diasRestantes={diasRestantes} pagarAction={iniciarPagamento.bind(null, slug)} />
  ) : null;

  if (empresa?.modoInterface === "SIMPLES") {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <SimplesTopBar
          slug={slug}
          empresaNome={empresa?.nome ?? slug}
          primaryColor={empresa?.primaryColor ?? "#18181b"}
          logoutAction={logout.bind(null, slug)}
        />
        <main className="flex-1 p-6">
          {bannerCarencia}
          {children}
        </main>
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
      <main className="flex-1 p-6">
        {bannerCarencia}
        {children}
      </main>
    </div>
  );
}
