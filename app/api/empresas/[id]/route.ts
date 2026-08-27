import { empresaService } from "../../../services/empresa.service";
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

    if (id !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Empresa não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

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
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

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
    const auth = await requireAuth(request);

    const { id } = await params;

    if (id !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Empresa não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    const body = await request.json();

    const empresa = await empresaService.update(id, body);

    return NextResponse.json(empresa);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

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
    const auth = await requireAuth(request);

    const { id } = await params;

    if (id !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Empresa não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    await empresaService.delete(id);

    return NextResponse.json({
      message: "Empresa removida com sucesso.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

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
