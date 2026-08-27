import { AuthTokenPayload, verifyAuthToken } from "@/lib/jwt";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireAuth(request: Request): Promise<AuthTokenPayload> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new AuthError("Não autenticado.");
  }

  try {
    return await verifyAuthToken(token);
  } catch {
    throw new AuthError("Token inválido ou expirado.");
  }
}
