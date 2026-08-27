import { usuarioService } from "../../../services/usuario.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

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

    console.error(error);

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

    const body = await request.json();

    const usuario = await usuarioService.update(id, body);

    return NextResponse.json(usuario);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

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

    console.error(error);

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
