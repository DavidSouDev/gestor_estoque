import { comboService } from "../../../services/combo.service";
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

    const combo = await comboService.findById(id);

    if (!combo || combo.empresaId !== auth.empresaId) {
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
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

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
    const auth = await requireAuth(request);

    const { id } = await params;

    const existente = await comboService.findById(id);

    if (!existente || existente.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Combo não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const body = await request.json();

    const combo = await comboService.update(id, body);

    return NextResponse.json(combo);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

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
    const auth = await requireAuth(request);

    const { id } = await params;

    const existente = await comboService.findById(id);

    if (!existente || existente.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Combo não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    await comboService.delete(id);

    return NextResponse.json({
      message: "Combo removido com sucesso.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

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
