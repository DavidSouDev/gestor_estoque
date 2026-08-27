import { produtoService } from "../../../../services/produto.service";
import { NextResponse } from "next/server";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;

    const produto = await produtoService.findCatalogoById(id);

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
