import { comboService } from "../../services/combo.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Mesmo raciocínio de `app/api/produtos/route.ts`: sem isto, preço negativo,
 * `NaN` ou `Infinity` chegavam ao Prisma sem checagem. Modo default (não
 * `.strict()`) preserva "ignora `empresaId` do body".
 */
const CorpoCriacaoCombo = z.object({
  nome: z.string().trim().min(1).max(200),
  descricao: z.string().trim().max(5000).optional(),
  preco: z.number().nonnegative(),
  fotoCapa: z.string().trim().max(2048).optional(),
  ordemCatalogo: z.number().int().optional(),
  destaque: z.boolean().optional(),
  ativo: z.boolean().optional(),
  visivel: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const combos = await comboService.list(auth.empresaId);

    return NextResponse.json(combos);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

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

    const dados = CorpoCriacaoCombo.parse(await request.json());

    const combo = await comboService.create({
      ...dados,
      empresaId: auth.empresaId,
    });

    return NextResponse.json(combo, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Corpo inválido." }, { status: 400 });
    }

    console.error(error instanceof Error ? error.message : error);

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
