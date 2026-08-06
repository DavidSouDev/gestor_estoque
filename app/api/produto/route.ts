import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const produtos = await prisma.produto.findMany();

  return NextResponse.json(produtos);
}

export async function POST(request: Request) {
  const body = await request.json();

  const produto = await prisma.produto.create({
    data: {
      nome: body.nome,
      descricao: body.descricao,
      quantidade: body.quantidade,
      precoAtacado: body.precoAtacado,
      precoVarejo: body.precoVarejo,
    },
  });

  return NextResponse.json(produto);
}