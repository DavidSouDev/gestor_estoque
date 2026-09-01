/**
 * Rota de suspensão de acesso — deliberadamente FORA do grupo `(protected)`.
 *
 * O layout daquele grupo chama a DAL de sessão do admin, e é ela que (a partir
 * do plano 04-06) manda a empresa bloqueada para cá. Se esta página morasse
 * dentro do grupo, entrar nela dispararia o mesmo guard que acabou de mandar o
 * usuário para ela: `ERR_TOO_MANY_REDIRECTS`. O projeto já pagou por essa
 * classe de loop na Fase 1 — o comentário de `lib/session.ts` sobre o login que
 * devolvia ao admin e o admin que devolvia ao login é o registro do incidente.
 * A posição deste arquivo na árvore é a mitigação (T-04-14); mover a pasta para
 * dentro de `(protected)` reintroduz o bug sem alterar uma linha de código.
 *
 * `proxy.ts` já exige cookie válido para qualquer `/:slug/admin/:path*` que não
 * seja o login, então esta rota herda o pré-filtro de graça. Ele é otimista
 * (não toca no banco) e NÃO substitui a guarda simétrica abaixo.
 */
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";
import { revalidarConta } from "@/lib/auth-guard";
import { acessoBloqueado } from "@/lib/avaliar-acesso";
import { empresaService } from "@/app/services/empresa.service";
import { iniciarPagamento } from "../_lib/assinatura-actions";
import { logout } from "../_lib/auth-actions";
import { BloqueadoCard } from "./_components/bloqueado-card";

export default async function AdminBloqueadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { slug } = await params;
  const { erro } = await searchParams;

  // Guarda simétrica própria, com os `redirect()` fora de qualquer `try`:
  // a rota está fora do grupo protegido, então ninguém a protege por ela.
  const session = await getVerifiedSession();

  if (!session || session.empresaSlug !== slug) {
    redirect(`/${slug}/admin/login`);
  }

  const conta = await revalidarConta(session.sub, session.empresaId);

  // Quem está em dia não tem o que fazer aqui: esta tela só existe para quem
  // perdeu o acesso. Uma condição só, e ela é o predicado único da fase — sem
  // comparar rótulos à mão em lugar nenhum (ACC-02).
  if (!conta || !acessoBloqueado(conta.statusAcesso)) {
    redirect(`/${slug}/admin`);
  }

  // Mesma convenção de fallback do layout do painel: a tela precisa desenhar
  // mesmo para uma empresa sem cores configuradas.
  const empresa = await empresaService.findHeaderData(session.empresaId);

  return (
    <BloqueadoCard
      primaryColor={empresa?.primaryColor ?? "#18181b"}
      accentColor={empresa?.accentColor ?? "#3f3f46"}
      erroCheckout={erro === "checkout"}
      pagarAction={iniciarPagamento.bind(null, slug)}
      logoutAction={logout.bind(null, slug)}
    />
  );
}
