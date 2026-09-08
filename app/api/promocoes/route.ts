import { promocaoService } from "../../services/promocao.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { HttpError } from "@/lib/http-error";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Mesmo raciocínio de `app/api/produtos/route.ts`. `produtoId`/`comboId` em si
 * não são validados contra a empresa aqui — isso é responsabilidade de
 * `promocaoService.create` (defesa contra referenciar item de outro tenant);
 * este schema só garante a FORMA do corpo (preço não-negativo, datas válidas,
 * ao menos um item).
 */
const ItemPromocao = z
  .object({
    produtoId: z.string().trim().min(1).optional(),
    comboId: z.string().trim().min(1).optional(),
    preco: z.number().nonnegative(),
  })
  .refine((item) => Boolean(item.produtoId) !== Boolean(item.comboId), {
    message: "Informe produtoId ou comboId, nunca os dois nem nenhum.",
  });

const CorpoCriacaoPromocao = z
  .object({
    nome: z.string().trim().min(1).max(200),
    dataInicio: z.coerce.date(),
    dataFim: z.coerce.date(),
    itens: z.array(ItemPromocao).min(1),
  })
  .refine((dados) => dados.dataFim > dados.dataInicio, {
    message: "A data final precisa ser depois da data inicial.",
    path: ["dataFim"],
  });

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);

    const promocoes = await promocaoService.list(auth.empresaId);

    return NextResponse.json(promocoes);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao listar promoções.",
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

    const dados = CorpoCriacaoPromocao.parse(await request.json());

    const promocao = await promocaoService.create({
      ...dados,
      empresaId: auth.empresaId,
    });

    return NextResponse.json(promocao, {
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
        message: "Erro ao criar promoção.",
      },
      {
        status: 500,
      }
    );
  }
}
