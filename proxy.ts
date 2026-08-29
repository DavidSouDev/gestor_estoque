import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAuthToken } from "@/lib/jwt";

const SESSION_COOKIE = "admin_session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const match = pathname.match(/^\/([^/]+)\/admin(?:\/(.*))?$/);

  if (!match) {
    return NextResponse.next();
  }

  const [, slug, rest] = match;

  // Login precisa ficar acessível sem sessão.
  if (rest === "login") {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const loginUrl = new URL(`/${slug}/admin/login`, request.url);

  if (!token) {
    return NextResponse.redirect(loginUrl);
  }

  try {
    const payload = await verifyAuthToken(token);

    // Vínculo tenant<->sessão: um token emitido para outra empresa jamais
    // pode autenticar o admin sob um slug diferente do seu.
    if (payload.empresaSlug !== slug) {
      return NextResponse.redirect(loginUrl);
    }
  } catch {
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:slug/admin/:path*"],
};
