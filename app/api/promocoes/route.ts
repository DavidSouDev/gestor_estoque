import { promocaoService } from "../../services/promocao.service";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const promocoes = await promocaoService.list();

    return NextResponse.json(promocoes);
  } catch (error) {
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
    const body = await request.json();

    const promocao = await promocaoService.create(body);

    return NextResponse.json(promocao, {
      status: 201,
    });
  } catch (error) {
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