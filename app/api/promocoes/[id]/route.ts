import { promocaoService } from "../../../services/promocao.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * `UpdatePromocaoDTO` não tem `itens` — a troca de itens é exclusiva da Server
 * Action (`updateItens`), nunca exposta por este PATCH. O schema reflete
 * exatamente isso: aceitar `itens` aqui seria reabrir uma superfície que o
 * DTO já fecha deliberadamente.
 */
const CorpoAtualizacaoPromocao = z
  .object({
    nome: z.string().trim().min(1).max(200),
    dataInicio: z.coerce.date(),
    dataFim: z.coerce.date(),
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

    const promocao = await promocaoService.findById(id);

    if (!promocao || promocao.empresaId !== auth.empresaId) {
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
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

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
    const auth = await requireAuth(request);

    const { id } = await params;

    const existente = await promocaoService.findById(id);

    if (!existente || existente.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Promoção não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    const dados = CorpoAtualizacaoPromocao.parse(await request.json());

    const promocao = await promocaoService.update(id, dados);

    return NextResponse.json(promocao);
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
    const auth = await requireAuth(request);

    const { id } = await params;

    const existente = await promocaoService.findById(id);

    if (!existente || existente.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Promoção não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    await promocaoService.delete(id);

    return NextResponse.json({
      message: "Promoção removida com sucesso.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

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
