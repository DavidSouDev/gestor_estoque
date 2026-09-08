import { usuarioService } from "../../services/usuario.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { revalidarConta } from "@/lib/auth-guard";
import { HttpError } from "@/lib/http-error";
import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Diferente das demais rotas de criação do projeto, este endpoint não tinha
 * NENHUMA validação de forma — `body` chegava como `any` de `request.json()`
 * direto em `usuarioService.create`. Mass assignment já era impossível (o DTO
 * só aceita os 4 campos abaixo), mas tipo/tamanho/formato passavam livres.
 */
const CorpoCriacaoUsuario = z.object({
  nome: z.string().trim().min(1).max(200),
  email: z.string().trim().min(1).max(320).email(),
  senha: z.string().min(6).max(200),
  empresaId: z.string().trim().min(1),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const usuarios = await usuarioService.list(auth.empresaId);

    return NextResponse.json(usuarios);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao listar usuários.",
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * Provisionamento administrativo de um usuário para uma empresa existente —
 * caminho DIFERENTE do cadastro público (`empresaService.registerComUsuario`),
 * que cria empresa+usuário juntos e já registra o aceite dos Termos de Uso.
 *
 * Exigir SUPERADMIN aqui não é conveniência: sem essa checagem, qualquer
 * chamador não autenticado que soubesse (ou adivinhasse) o `empresaId` de uma
 * empresa ainda sem administrador poderia se auto-nomear ADMIN dela — o
 * `@@unique([empresaId])` do modelo só impede duplicar, nunca impede o
 * primeiro cadastro por essa via. A role vem do BANCO via `revalidarConta`,
 * nunca de `auth.role` (mesmo raciocínio de `app/api/termos/route.ts`): um
 * SUPERADMIN rebaixado continua com um JWT de 7 dias que ainda carrega a role
 * antiga.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    const conta = await revalidarConta(auth.sub, auth.empresaId, auth.iat);

    if (conta?.role !== UserRole.SUPERADMIN) {
      throw new AuthError("Ação não permitida.", 403);
    }

    const dados = CorpoCriacaoUsuario.parse(await request.json());

    const usuario = await usuarioService.create(dados);

    return NextResponse.json(usuario, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    if (error instanceof HttpError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Corpo inválido." }, { status: 400 });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao criar usuário.",
      },
      {
        status: 500,
      }
    );
  }
}
