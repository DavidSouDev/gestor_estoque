import { empresaService } from "../../services/empresa.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const empresa = await empresaService.findById(auth.empresaId);

    return NextResponse.json(empresa ? [empresa] : []);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao listar empresas.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth(request);

    const body = await request.json();

    const empresa = await empresaService.create(body);

    return NextResponse.json(empresa, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao criar empresa.",
      },
      {
        status: 500,
      }
    );
  }
}
