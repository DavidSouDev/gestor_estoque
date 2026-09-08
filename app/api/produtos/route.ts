import { produtoService } from "../../services/produto.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Sem esta validação, `body` chega como `any` de `request.json()` e é
 * espalhado direto em `produtoService.create` — preço/estoque negativos,
 * `NaN` ou `Infinity` passavam sem checagem nenhuma. `z.object()` no modo
 * default (não `.strict()`) já descarta chaves desconhecidas do corpo — é o
 * que preserva o comportamento de "ignora `empresaId` do body" (o valor
 * autoritativo vem sempre do token, sobrescrito DEPOIS do parse).
 */
const CorpoCriacaoProduto = z.object({
  codigo: z.string().trim().min(1).max(100),
  nome: z.string().trim().min(1).max(200),
  descricao: z.string().trim().max(5000).optional(),
  categoria: z.string().trim().min(1).max(100).optional(),
  precoVarejo: z.number().nonnegative(),
  precoAtacado: z.number().nonnegative(),
  estoque: z.number().int().nonnegative().optional(),
  fotoCapa: z.string().trim().max(2048).optional(),
  ordemCatalogo: z.number().int().optional(),
  destaque: z.boolean().optional(),
  ativo: z.boolean().optional(),
  visivelCatalogo: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const produtos = await produtoService.list(auth.empresaId);

    return NextResponse.json(produtos);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao listar produtos.",
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

    const dados = CorpoCriacaoProduto.parse(await request.json());

    const produto = await produtoService.create({
      ...dados,
      empresaId: auth.empresaId,
    });

    return NextResponse.json(produto, {
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
        message: "Erro ao criar produto.",
      },
      {
        status: 500,
      }
    );
  }
}
