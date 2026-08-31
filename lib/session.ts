import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthTokenPayload, signAuthToken, verifyAuthToken } from "@/lib/jwt";
import { revalidarConta } from "@/lib/auth-guard";

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

  return session;
}
