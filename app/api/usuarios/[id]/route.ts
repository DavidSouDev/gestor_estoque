import { usuarioService } from "../../../services/usuario.service";
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
    const { id } = await params;

    const usuario = await usuarioService.findById(id);

    if (!usuario) {
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
    const { id } = await params;

    const body = await request.json();

    const usuario = await usuarioService.update(id, body);

    return NextResponse.json(usuario);
  } catch (error) {
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
    const { id } = await params;

    await usuarioService.delete(id);

    return NextResponse.json({
      message: "Usuário removido com sucesso.",
    });
  } catch (error) {
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