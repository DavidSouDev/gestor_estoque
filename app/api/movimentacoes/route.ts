import { movimentacaoEstoqueService } from "../../services/movimentacao-estoque.service";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const movimentacoes = await movimentacaoEstoqueService.list();

    return NextResponse.json(movimentacoes);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao listar movimentações.",
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

    const movimentacao = await movimentacaoEstoqueService.create(body);

    return NextResponse.json(movimentacao, {
      status: 201,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao registrar movimentação.",
      },
      {
        status: 500,
      }
    );
  }
}