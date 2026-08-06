import { produtoService } from "../../../services/produto.service";
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

    const produto = await produtoService.findById(id);

    if (!produto) {
      return NextResponse.json(
        {
          message: "Produto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(produto);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao buscar produto.",
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

    const produto = await produtoService.update(id, body);

    return NextResponse.json(produto);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao atualizar produto.",
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

    await produtoService.delete(id);

    return NextResponse.json({
      message: "Produto removido com sucesso.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao remover produto.",
      },
      {
        status: 500,
      }
    );
  }
}