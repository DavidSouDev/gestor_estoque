import { movimentacaoEstoqueService } from "../../services/movimentacao-estoque.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const movimentacoes = await movimentacaoEstoqueService.list(auth.empresaId);

    return NextResponse.json(movimentacoes);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

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
    const auth = await requireAuth(request);

    const body = await request.json();

    const movimentacao = await movimentacaoEstoqueService.create({
      ...body,
      usuarioId: auth.sub,
      empresaId: auth.empresaId,
    });

    return NextResponse.json(movimentacao, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

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
