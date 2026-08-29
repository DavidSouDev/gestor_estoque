import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthTokenPayload, signAuthToken, verifyAuthToken } from "@/lib/jwt";

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
 * DAL principal do admin: toda page/layout/Server Action do admin deve
 * chamar isso antes de tocar dados. Garante duas coisas ao mesmo tempo:
 * usuário autenticado E o token pertence à MESMA empresa do slug da URL —
 * nunca confia apenas no Proxy (que só faz a checagem otimista).
 */
export async function requireAdminSession(slug: string): Promise<AuthTokenPayload> {
  const session = await getSession();

  if (!session || session.empresaSlug !== slug) {
    redirect(`/${slug}/admin/login`);
  }

  return session;
}
