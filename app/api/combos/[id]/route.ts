import { comboService } from "../../../services/combo.service";
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

    const combo = await comboService.findById(id);

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
    console.error(error);

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

export async function PATCH(
  request: Request,
  { params }: Params
) {
  try {
    const { id } = await params;

    const body = await request.json();

    const combo = await comboService.update(id, body);

    return NextResponse.json(combo);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao atualizar combo.",
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

    await comboService.delete(id);

    return NextResponse.json({
      message: "Combo removido com sucesso.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao remover combo.",
      },
      {
        status: 500,
      }
    );
  }
}