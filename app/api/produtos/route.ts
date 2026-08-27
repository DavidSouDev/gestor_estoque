import { produtoService } from "../../services/produto.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const produtos = await produtoService.list(auth.empresaId);

    return NextResponse.json(produtos);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao listar produtos.",
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

    const produto = await produtoService.create({
      ...body,
      empresaId: auth.empresaId,
    });

    return NextResponse.json(produto, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao criar produto.",
      },
      {
        status: 500,
      }
    );
  }
}
