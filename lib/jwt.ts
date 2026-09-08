import { SignJWT, jwtVerify } from "jose";
import { UserRole } from "@prisma/client";

const JWT_EXPIRATION = "7d";

export interface AuthTokenPayload {
  sub: string;
  empresaId: string;
  empresaSlug: string;
  email: string;
  role: UserRole;
}

/**
 * `AuthTokenPayload` mais o `iat` que o `jose` grava na assinatura — só existe
 * depois de VERIFICAR um token, nunca antes (por isso não faz parte do tipo de
 * entrada de `signAuthToken`, que ainda não tem esse valor para oferecer).
 *
 * Usado por `revalidarConta` (`lib/auth-guard.ts`) para invalidar sessões cujo
 * token foi emitido ANTES da última alteração na própria conta — fecha a
 * janela de até 7 dias em que um cookie/Bearer token vazado continuava válido
 * mesmo depois de "trocar a senha".
 */
export interface VerifiedAuthTokenPayload extends AuthTokenPayload {
  /** Unix timestamp em SEGUNDOS (arredondado para baixo pelo `jose`). */
  iat: number;
}

function getSecretKey() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET não configurado.");
  }

  return new TextEncoder().encode(secret);
}

export async function signAuthToken(payload: AuthTokenPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(getSecretKey());
}

export async function verifyAuthToken(token: string): Promise<VerifiedAuthTokenPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });

  return {
    sub: payload.sub as string,
    empresaId: payload.empresaId as string,
    empresaSlug: payload.empresaSlug as string,
    email: payload.email as string,
    role: payload.role as UserRole,
    iat: payload.iat as number,
  };
}
