import { movimentacaoEstoqueService } from "../../../services/movimentacao-estoque.service";
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

    const movimentacao = await movimentacaoEstoqueService.findById(id);

    if (!movimentacao) {
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
    console.error(error);

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
    const { id } = await params;

    await movimentacaoEstoqueService.delete(id);

    return NextResponse.json({
      message: "Movimentação removida com sucesso.",
    });
  } catch (error) {
    console.error(error);

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