import { produtoService } from "../../../services/produto.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Mesma validação de `app/api/produtos/route.ts`, com todos os campos
 * opcionais (PATCH parcial). Nenhum campo aqui inclui `empresaId`: o modo
 * default (não `.strict()`) do Zod descarta qualquer chave desconhecida do
 * corpo, então um PATCH tentando mover o produto para outra empresa via
 * `{ empresaId: "..." }` é silenciosamente ignorado — antes desta validação,
 * `body` seguia inteiro (`any`) direto para `prisma.produto.update`.
 */
const CorpoAtualizacaoProduto = z
  .object({
    codigo: z.string().trim().min(1).max(100),
    nome: z.string().trim().min(1).max(200),
    descricao: z.string().trim().max(5000),
    categoria: z.string().trim().min(1).max(100),
    precoVarejo: z.number().nonnegative(),
    precoAtacado: z.number().nonnegative(),
    estoque: z.number().int().nonnegative(),
    fotoCapa: z.string().trim().max(2048),
    ordemCatalogo: z.number().int(),
    destaque: z.boolean(),
    ativo: z.boolean(),
    visivelCatalogo: z.boolean(),
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

    const produto = await produtoService.findById(id);

    if (!produto || produto.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Produto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(produto);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao buscar produto.",
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

    const existente = await produtoService.findById(id);

    if (!existente || existente.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Produto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const dados = CorpoAtualizacaoProduto.parse(await request.json());

    const produto = await produtoService.update(id, dados);

    return NextResponse.json(produto);
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
        message: "Erro ao atualizar produto.",
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

    const existente = await produtoService.findById(id);

    if (!existente || existente.empresaId !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Produto não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    await produtoService.delete(id);

    return NextResponse.json({
      message: "Produto removido com sucesso.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao remover produto.",
      },
      {
        status: 500,
      }
    );
  }
}
