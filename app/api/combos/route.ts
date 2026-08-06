import { comboService } from "../../services/combo.service";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const combos = await comboService.list();

    return NextResponse.json(combos);
  } catch (error) {
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
    const body = await request.json();

    const combo = await comboService.create(body);

    return NextResponse.json(combo, {
      status: 201,
    });
  } catch (error) {
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