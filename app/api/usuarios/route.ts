import { usuarioService } from "../../services/usuario.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { HttpError } from "@/lib/http-error";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const usuarios = await usuarioService.list(auth.empresaId);

    return NextResponse.json(usuarios);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const usuario = await usuarioService.create(body);

    return NextResponse.json(usuario, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

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
