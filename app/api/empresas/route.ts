import { empresaService } from "../../services/empresa.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { revalidarConta } from "@/lib/auth-guard";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const empresa = await empresaService.findById(auth.empresaId);

    return NextResponse.json(empresa ? [empresa] : []);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao listar empresas.",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * Provisionamento administrativo de uma empresa fora do fluxo público de
 * cadastro (`app/registro/actions.ts` → `empresaService.registerComUsuario`),
 * que cria empresa+usuário atomicamente e já registra o aceite dos Termos de
 * Uso. Restrito a SUPERADMIN: sem essa checagem, qualquer usuário autenticado
 * de QUALQUER tenant poderia criar empresas arbitrárias sem administrador — e,
 * combinado com `POST /api/usuarios`, virar administrador delas. A role vem do
 * BANCO via `revalidarConta`, nunca de `auth.role` (mesmo raciocínio de
 * `app/api/termos/route.ts`).
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    const conta = await revalidarConta(auth.sub, auth.empresaId, auth.iat);

    if (conta?.role !== UserRole.SUPERADMIN) {
      throw new AuthError("Ação não permitida.", 403);
    }

    const body = await request.json();

    const empresa = await empresaService.create(body);

    return NextResponse.json(empresa, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao criar empresa.",
      },
      {
        status: 500,
      }
    );
  }
}
