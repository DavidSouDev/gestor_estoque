import { comboService } from "../../../services/combo.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Mesmo raciocínio de `app/api/produtos/[id]/route.ts`: PATCH parcial, modo
 * default (não `.strict()`) descarta qualquer chave desconhecida do corpo —
 * inclusive uma tentativa de mover o combo para outra empresa via
 * `{ empresaId: "..." }`.
 */
const CorpoAtualizacaoCombo = z
  .object({
    nome: z.string().trim().min(1).max(200),
    descricao: z.string().trim().max(5000),
    preco: z.number().nonnegative(),
    fotoCapa: z.string().trim().max(2048),
    ordemCatalogo: z.number().int(),
    destaque: z.boolean(),
    ativo: z.boolean(),
    visivel: z.boolean(),
  })
  .partial();

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

    console.error(error instanceof Error ? error.message : error);

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

    const dados = CorpoAtualizacaoCombo.parse(await request.json());

    const combo = await comboService.update(id, dados);

    return NextResponse.json(combo);
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

    console.error(error instanceof Error ? error.message : error);

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
