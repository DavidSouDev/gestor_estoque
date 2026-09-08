import { movimentacaoEstoqueService } from "../../../services/movimentacao-estoque.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { HttpError } from "@/lib/http-error";
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

    const movimentacao = await movimentacaoEstoqueService.findById(id);

    if (!movimentacao || movimentacao.produto.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Movimentação não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(movimentacao);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao buscar movimentação.",
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

    const existente = await movimentacaoEstoqueService.findById(id);

    if (!existente || existente.produto.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Movimentação não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    await movimentacaoEstoqueService.delete(id);

    return NextResponse.json({
      message: "Movimentação removida com sucesso.",
    });
  } catch (error) {
    if (error instanceof AuthError || error instanceof HttpError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao remover movimentação.",
      },
      {
        status: 500,
      }
    );
  }
}
