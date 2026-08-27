import { promocaoService } from "../../services/promocao.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const promocoes = await promocaoService.list(auth.empresaId);

    return NextResponse.json(promocoes);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao listar promoções.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json();

    const promocao = await promocaoService.create({
      ...body,
      empresaId: auth.empresaId,
    });

    return NextResponse.json(promocao, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao criar promoção.",
      },
      {
        status: 500,
      }
    );
  }
}
