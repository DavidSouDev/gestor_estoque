import { movimentacaoEstoqueService } from "../../services/movimentacao-estoque.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { HttpError } from "@/lib/http-error";
import { TipoMovimentacao } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Sem isto, `quantidade` negativa passava sem checagem: `{tipo:"SAIDA",
 * quantidade:-500}` invertia a subtração em soma (`estoque -= (-500)`),
 * inflando o estoque enquanto o registro de auditoria mostrava uma "saída" —
 * e sem passar pela checagem de estoque insuficiente, que só existe para
 * quantidade positiva. `.positive()` fecha os dois sentidos de uma vez: nunca
 * zero, nunca negativo, para ENTRADA/SAIDA/AJUSTE igualmente — mesmo contrato
 * que `app/[slug]/admin/(protected)/estoque/actions.ts` já aplica
 * (`quantidade <= 0` é rejeitado lá).
 */
const CorpoCriacaoMovimentacao = z.object({
  produtoId: z.string().trim().min(1),
  tipo: z.enum(TipoMovimentacao),
  quantidade: z.number().positive(),
  motivo: z.string().trim().max(500).optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const movimentacoes = await movimentacaoEstoqueService.list(auth.empresaId);

    return NextResponse.json(movimentacoes);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao listar movimentações.",
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

    const dados = CorpoCriacaoMovimentacao.parse(await request.json());

    const movimentacao = await movimentacaoEstoqueService.create({
      ...dados,
      usuarioId: auth.sub,
      empresaId: auth.empresaId,
    });

    return NextResponse.json(movimentacao, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof AuthError || error instanceof HttpError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Corpo inválido." }, { status: 400 });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao registrar movimentação.",
      },
      {
        status: 500,
      }
    );
  }
}
