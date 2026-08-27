import { produtoService } from "../../../services/produto.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
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

    const produto = await produtoService.findById(id);

    if (!produto || produto.empresaId !== auth.empresaId) {
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
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

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
    const auth = await requireAuth(request);

    const { id } = await params;

    const existente = await produtoService.findById(id);

    if (!existente || existente.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Produto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const body = await request.json();

    const produto = await produtoService.update(id, body);

    return NextResponse.json(produto);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

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
    const auth = await requireAuth(request);

    const { id } = await params;

    const existente = await produtoService.findById(id);

    if (!existente || existente.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Produto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    await produtoService.delete(id);

    return NextResponse.json({
      message: "Produto removido com sucesso.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

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
