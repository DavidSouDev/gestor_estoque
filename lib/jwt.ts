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

export async function verifyAuthToken(token: string): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, getSecretKey());

  return {
    sub: payload.sub as string,
    empresaId: payload.empresaId as string,
    empresaSlug: payload.empresaSlug as string,
    email: payload.email as string,
    role: payload.role as UserRole,
  };
}
