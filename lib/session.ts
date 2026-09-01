import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthTokenPayload, signAuthToken, verifyAuthToken } from "@/lib/jwt";
import { revalidarConta } from "@/lib/auth-guard";
import { acessoBloqueado } from "@/lib/avaliar-acesso";

const SESSION_COOKIE = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7d, mesma janela do JWT

export async function createAdminSession(payload: AuthTokenPayload) {
  const token = await signAuthToken(payload);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Checagem "segura": lê e decodifica o cookie, sem redirecionar.
 * Retorna null se não houver sessão válida.
 */
export async function getSession(): Promise<AuthTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    return await verifyAuthToken(token);
  } catch {
    return null;
  }
}

/**
 * Versão "verificada no banco" do `getSession`: além de decodificar o cookie,
 * confirma via `revalidarConta` que a conta ainda existe e está ativa.
 *
 * Use nas telas PÚBLICAS que precisam decidir "esse usuário já está logado?"
 * — login e registro. Devolver o payload ali com base apenas no `getSession`
 * recria um loop infinito de redirect: o layout do admin passa a rejeitar a
 * conta revogada e manda para o login, o login vê um JWT ainda válido e
 * devolve o usuário para o admin, indefinidamente.
 *
 * Não redireciona: o chamador decide o que fazer com o `null`.
 */
export async function getVerifiedSession(): Promise<AuthTokenPayload | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const conta = await revalidarConta(session.sub, session.empresaId);

  return conta ? session : null;
}

/**
 * DAL principal do admin: toda page/layout/Server Action do admin deve
 * chamar isso antes de tocar dados. Garante três coisas ao mesmo tempo:
 * usuário autenticado, token pertencente à MESMA empresa do slug da URL, e
 * conta confirmada no banco no request atual — nunca confia apenas no Proxy
 * (que só faz a checagem otimista) nem na janela de 7 dias do JWT.
 *
 * Ordem deliberada: o banco só é consultado depois de o token ser válido E o
 * slug bater, para que um cookie forjado ou de outro tenant nunca gere query
 * (auth não pode virar vetor de carga no banco).
 *
 * A comparação extra do slug FRESCO vindo do banco contra o da URL fecha a
 * janela do slug obsoleto: `slug` é mutável via `PATCH /api/empresas/[id]`,
 * então um token de 7 dias pode carregar um slug que já não existe.
 *
 * O cookie stale NÃO é apagado aqui: `cookies().delete()` só é legal em
 * Server Function ou Route Handler e esta função roda em layout/page — dali,
 * lança. A limpeza do cookie fica só na Server Action de logout, e o cookie
 * stale é inofensivo porque toda superfície que o consome revalida.
 *
 * ---
 *
 * ACC-02: depois de a sessão ser aceita, a assinatura da empresa é conferida e
 * um SEGUNDO `redirect` manda quem está suspenso para a tela de bloqueio. D-04
 * e D-06: os dois rótulos de suspensão recebem tratamento IDÊNTICO aqui — a
 * distinção entre eles é só trilha de auditoria (D-08 da Fase 2), nunca regra
 * de acesso. Quem decide é o predicado único de `lib/avaliar-acesso.ts`; este
 * arquivo não compara status à mão.
 *
 * Por que o destino mora FORA do grupo `(protected)`: o layout daquele grupo
 * chama esta mesma função. Se a rota `bloqueado` estivesse dentro dele, entrar
 * nela dispararia a guarda que acabou de mandar o usuário para lá, que
 * redirecionaria de novo — `ERR_TOO_MANY_REDIRECTS`, e o cliente que quer
 * pagar fica preso. É a mesma classe de loop que a Fase 1 já sofreu e que está
 * registrada no bloco de `getVerifiedSession` acima (T-04-14). Mover a pasta
 * para dentro do grupo reintroduz o bug sem alterar uma linha daqui.
 *
 * Por que a guarda mora AQUI e não em `layout.tsx`: um layout não é boundary de
 * autorização. Os docs empacotados do Next 16.3.0
 * (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`) são
 * textuais — segmentos filhos e slots paralelos continuam sendo renderizados
 * pelo router e continuam aparecendo no RSC Payload mesmo que o layout troque
 * ou esconda `{children}`, e um layout não re-renderiza em navegação
 * client-side, então a sessão não seria conferida a cada troca de rota. Trocar
 * `{children}` por uma tela de aviso é explicitamente desaconselhado ali
 * (T-04-06). O `redirect` daqui, ao contrário, roda em cada page e em cada
 * Server Action.
 *
 * Por que não em `proxy.ts`: os mesmos docs dizem que o proxy não deve ser
 * usado como solução completa de sessão ou autorização — ele faz a checagem
 * otimista de cookie e nada mais. Somar I/O de banco lá abriria conexão a cada
 * request, inclusive de asset estático (T-04-18).
 */
export async function requireAdminSession(slug: string): Promise<AuthTokenPayload> {
  const session = await getSession();

  const conta =
    session && session.empresaSlug === slug
      ? await revalidarConta(session.sub, session.empresaId)
      : null;

  // redirect() lança NEXT_REDIRECT — mantenha-o FORA de qualquer try/catch.
  if (!session || !conta || conta.empresaSlug !== slug) {
    redirect(`/${slug}/admin/login`);
  }

  // ACC-02 / D-04 / D-06. Fica DEPOIS do redirect de login de propósito: uma
  // sessão inválida nunca chega a ver a tela de bloqueio.
  if (acessoBloqueado(conta.statusAcesso)) {
    redirect(`/${slug}/admin/bloqueado`);
  }

  return session;
}
