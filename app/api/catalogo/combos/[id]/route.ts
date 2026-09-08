import { comboService } from "../../../../services/combo.service";
import { NextResponse } from "next/server";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;

    const combo = await comboService.findCatalogoById(id);

    if (!combo) {
      return NextResponse.json(
        {
          message: "Combo não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(combo);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao buscar combo.",
      },
      {
        status: 500,
      }
    );
  }
}
