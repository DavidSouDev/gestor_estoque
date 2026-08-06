import { empresaService } from "../../../services/empresa.service";
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

    const empresa = await empresaService.findById(id);

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
    console.error(error);

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

export async function PATCH(
  request: Request,
  { params }: Params
) {
  try {
    const { id } = await params;

    const body = await request.json();

    const empresa = await empresaService.update(id, body);

    return NextResponse.json(empresa);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao atualizar empresa.",
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

    await empresaService.delete(id);

    return NextResponse.json({
      message: "Empresa removida com sucesso.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao remover empresa.",
      },
      {
        status: 500,
      }
    );
  }
}