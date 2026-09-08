import { usuarioService } from "../../../services/usuario.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { HttpError } from "@/lib/http-error";
import { NextResponse } from "next/server";
import { z } from "zod";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

/**
 * `senhaAtual` só é exigida (pelo SERVICE, não aqui — `usuarioService.update`)
 * quando `senha` está presente; o schema aceita os dois como opcionais
 * independentes porque a checagem de "presente junto" é regra de negócio, não
 * de forma. `z.object()` no modo default preserva "ignora chave desconhecida".
 */
const CorpoAtualizacaoUsuario = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().min(1).max(320).email().optional(),
  senha: z.string().min(6).max(200).optional(),
  senhaAtual: z.string().min(1).max(200).optional(),
  ativo: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: Params
) {
  try {
    const auth = await requireAuth(request);

    const { id } = await params;

    const usuario = await usuarioService.findById(id);

    if (!usuario || usuario.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Usuário não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(usuario);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao buscar usuário.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: Params
) {
  try {
    const auth = await requireAuth(request);

    const { id } = await params;

    const existente = await usuarioService.findById(id);

    if (!existente || existente.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Usuário não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const dados = CorpoAtualizacaoUsuario.parse(await request.json());

    const usuario = await usuarioService.update(id, dados);

    return NextResponse.json(usuario);
  } catch (error) {
    if (error instanceof AuthError || error instanceof HttpError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Corpo inválido." }, { status: 400 });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao atualizar usuário.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: Params
) {
  try {
    const auth = await requireAuth(request);

    const { id } = await params;

    const existente = await usuarioService.findById(id);

    if (!existente || existente.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Usuário não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    await usuarioService.delete(id);

    return NextResponse.json({
      message: "Usuário removido com sucesso.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao remover usuário.",
      },
      {
        status: 500,
      }
    );
  }
}
