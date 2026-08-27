import { comboService } from "../../services/combo.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const combos = await comboService.list(auth.empresaId);

    return NextResponse.json(combos);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao listar combos.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    const body = await request.json();

    const combo = await comboService.create({
      ...body,
      empresaId: auth.empresaId,
    });

    return NextResponse.json(combo, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao criar combo.",
      },
      {
        status: 500,
      }
    );
  }
}
