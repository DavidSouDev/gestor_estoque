import { empresaService } from "../../services/empresa.service";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const empresas = await empresaService.list();

    return NextResponse.json(empresas);
  } catch (error) {
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
    const body = await request.json();

    const empresa = await empresaService.create(body);

    return NextResponse.json(empresa, {
      status: 201,
    });
  } catch (error) {
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