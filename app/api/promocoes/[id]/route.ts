import { promocaoService } from "../../../services/promocao.service";
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

    const promocao = await promocaoService.findById(id);

    if (!promocao) {
      return NextResponse.json(
        {
          message: "Promoção não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(promocao);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao buscar promoção.",
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

    const promocao = await promocaoService.update(id, body);

    return NextResponse.json(promocao);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao atualizar promoção.",
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

    await promocaoService.delete(id);

    return NextResponse.json({
      message: "Promoção removida com sucesso.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao remover promoção.",
      },
      {
        status: 500,
      }
    );
  }
}