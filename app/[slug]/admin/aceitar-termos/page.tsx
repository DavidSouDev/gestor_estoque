/**
 * Rota de aceite obrigatório dos Termos de Uso — deliberadamente FORA do grupo
 * `(protected)`.
 *
 * O layout daquele grupo chama a DAL de sessão do admin, e é ela que (a partir
 * do plano 06-04) manda o usuário com termos pendentes para cá. Se esta página
 * morasse dentro do grupo, entrar nela dispararia o mesmo guard que acabou de
 * mandar o usuário para ela: `ERR_TOO_MANY_REDIRECTS`. O projeto já pagou por
 * essa classe de loop na Fase 1 — o comentário de `lib/session.ts` sobre o login
 * que devolvia ao admin e o admin que devolvia ao login é o registro do
 * incidente. A posição deste arquivo na árvore é a mitigação (T-06-26); mover a
 * pasta para dentro de `(protected)` reintroduz o bug sem alterar uma linha de
 * código.
 *
 * `proxy.ts` já exige cookie válido para qualquer `/:slug/admin/:path*` que não
 * seja o login, então esta rota herda o pré-filtro de graça. Ele é otimista
 * (não toca no banco) e NÃO substitui a guarda simétrica abaixo.
 *
 * Específico desta rota: **`bloqueado/page.tsx` NÃO checa termos, e essa
 * ausência é REQUISITO, não esquecimento.** Se ela checasse, o estado
 * (bloqueado, pendente) viraria `/bloqueado` -> `/aceitar-termos` ->
 * `/bloqueado` indefinidamente. Este arquivo NÃO deve motivar nenhuma edição
 * naquele — há um caso em `page.test.ts` que lê o arquivo e falha se alguém
 * tentar.
 */
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";
import { revalidarConta } from "@/lib/auth-guard";
import { acessoBloqueado } from "@/lib/avaliar-acesso";
import { termoVigente } from "@/lib/termo-vigente";
import { formatDate } from "@/lib/format";
import { empresaService } from "@/app/services/empresa.service";
import { logout } from "../_lib/auth-actions";
import { aceitarTermos } from "./actions";
import { AceiteCard } from "./_components/aceite-card";

export default async function AdminAceitarTermosPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { slug } = await params;
  const { erro } = await searchParams;

  // Guarda simétrica própria, com os `redirect()` fora de qualquer `try`: a
  // rota está fora do grupo protegido, então ninguém a protege por ela. A ORDEM
  // das cinco condições é a especificação da máquina de estados do RESEARCH e
  // não pode ser reordenada.
  const session = await getVerifiedSession();

  if (!session || session.empresaSlug !== slug) {
    redirect(`/${slug}/admin/login`);
  }

  const conta = await revalidarConta(session.sub, session.empresaId);

  if (!conta) {
    redirect(`/${slug}/admin`);
  }

  // Bloqueio ANTES de termos, aqui e nos dois guards: quem está suspenso tem
  // que chegar à tela de pagamento, e inserir um passo entre o cliente e a
  // receita é a negação de serviço auto-infligida que a Fase 4 já pagou para
  // aprender (T-04-10).
  if (acessoBloqueado(conta.statusAcesso)) {
    redirect(`/${slug}/admin/bloqueado`);
  }

  // Quem não deve nada aos termos não tem o que fazer aqui.
  if (!conta.termosPendentes) {
    redirect(`/${slug}/admin`);
  }

  // Sem documento publicado a tela é inalcançável por construção (o gate falha
  // ABERTO e `termosPendentes` já seria `false`). A condição existe para que a
  // guarda seja simétrica mesmo assim.
  const vigente = await termoVigente();

  if (!vigente) {
    redirect(`/${slug}/admin`);
  }

  // Mesma convenção de fallback do layout do painel: a tela precisa desenhar
  // mesmo para uma empresa sem cores configuradas.
  const empresa = await empresaService.findHeaderData(session.empresaId);

  return (
    <AceiteCard
      primaryColor={empresa?.primaryColor ?? "#18181b"}
      accentColor={empresa?.accentColor ?? "#3f3f46"}
      termo={{
        id: vigente.id,
        versao: vigente.versao,
        conteudo: vigente.conteudo,
        // Formatada AQUI, no servidor: o card não constrói datas, para
        // permanecer testável sem fake timers.
        publicadoEmFormatado: formatDate(vigente.publicadoEm),
      }}
      erro={erro === "termos-atualizados"}
      aceitarAction={aceitarTermos.bind(null, slug)}
      // A action `logout` EXISTENTE, não uma nova: ela não chama
      // `requireAdminSession`, então funciona a partir de uma sessão gateada —
      // e é essa propriedade que garante que o usuário nunca fique preso aqui.
      logoutAction={logout.bind(null, slug)}
    />
  );
}
