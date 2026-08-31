import { AuthTokenPayload, verifyAuthToken } from "@/lib/jwt";
import { revalidarConta } from "@/lib/auth-guard";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Guarda de autenticação de todas as rotas `app/api/*`.
 *
 * Além de verificar a assinatura do Bearer token, confirma no banco que a
 * conta ainda existe e está ativa — a janela de 7 dias do JWT não autoriza
 * sozinha. O banco só é consultado depois de a assinatura ser válida, para
 * que a auth não vire vetor de carga no Postgres.
 *
 * O retorno continua sendo o payload do token (não a conta fresca): a
 * assinatura pública é consumida por todas as rotas. Quem precisar dos dados
 * frescos chama `revalidarConta` diretamente — sai de graça, o `React.cache`
 * já tem o resultado no mesmo request.
 */
export async function requireAuth(request: Request): Promise<AuthTokenPayload> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new AuthError("Não autenticado.");
  }

  let payload: AuthTokenPayload;

  try {
    payload = await verifyAuthToken(token);
  } catch {
    throw new AuthError("Token inválido ou expirado.");
  }

  const conta = await revalidarConta(payload.sub, payload.empresaId);

  if (!conta) {
    // Mensagem única e genérica: cobre conta inativa, empresa removida E erro
    // de banco (D-01). Não vazar qual dos três é ao cliente.
    throw new AuthError("Sessão inválida.", 401);
  }

  return payload;
}
