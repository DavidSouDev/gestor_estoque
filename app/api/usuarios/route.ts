import { usuarioService } from "../../services/usuario.service";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const usuarios = await usuarioService.list();

    return NextResponse.json(usuarios);
  } catch (error) {
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