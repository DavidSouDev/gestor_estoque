import { empresaService } from "../../../../services/empresa.service";
import { NextResponse } from "next/server";

interface Params {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { slug } = await params;

    const empresa = await empresaService.findBySlug(slug);

    if (!empresa) {
      return NextResponse.json(
        {
          message: "Empresa não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(empresa);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao buscar empresa.",
      },
      {
        status: 500,
      }
    );
  }
}
