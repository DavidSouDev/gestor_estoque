import { produtoService } from "../../../services/produto.service";
import { empresaService } from "../../../services/empresa.service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    let empresaId = searchParams.get("empresaId");

    if (!empresaId && slug) {
      empresaId = await empresaService.resolveIdBySlug(slug);
    }

    if (!empresaId) {
      return NextResponse.json(
        {
          message: "Informe o parâmetro empresaId ou slug.",
        },
        {
          status: 400,
        }
      );
    }

    const produtos = await produtoService.listCatalogo(empresaId);

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
