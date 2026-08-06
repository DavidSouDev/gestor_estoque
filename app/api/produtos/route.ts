import { produtoService } from "../../services/produto.service";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const produtos = await produtoService.list();

    return NextResponse.json(produtos);
  } catch (error) {
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
    const body = await request.json();

    const produto = await produtoService.create(body);

    return NextResponse.json(produto, {
      status: 201,
    });
  } catch (error) {
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