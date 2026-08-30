import { signAuthToken, type AuthTokenPayload } from "@/lib/jwt";

export const testAuthPayload: AuthTokenPayload = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: "empresa-teste",
  email: "admin@teste.com",
  role: "ADMIN",
};

export async function buildAuthToken(overrides: Partial<AuthTokenPayload> = {}) {
  return signAuthToken({ ...testAuthPayload, ...overrides });
}
