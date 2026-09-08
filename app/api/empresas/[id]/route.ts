import { empresaService } from "../../../services/empresa.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { HttpError } from "@/lib/http-error";
import { ModoInterface } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

/**
 * Diferente das demais rotas de escrita do projeto, este endpoint não tinha
 * NENHUMA validação de forma — `body` chegava como `any` de `request.json()`
 * direto em `empresaService.update`. Mass assignment já estava coberto pela
 * allowlist do service (`app/services/empresa.service.ts:548-587`), mas
 * qualquer tipo/tamanho passava: `{"nome": {"a":1}}`, `descricao` de
 * megabytes, etc. `z.object()` no modo default (não `.strict()`) preserva o
 * comportamento de ignorar chaves desconhecidas.
 */
const CorpoAtualizacaoEmpresa = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().min(1).max(200).optional(),
  logo: z.string().trim().max(2048).optional(),
  banner: z.string().trim().max(2048).optional(),
  descricao: z.string().trim().max(5000).optional(),
  telefone: z.string().trim().max(30).optional(),
  instagram: z.string().trim().max(100).optional(),
  primaryColor: z.string().trim().max(20).optional(),
  accentColor: z.string().trim().max(20).optional(),
  modoInterface: z.enum(ModoInterface).optional(),
});

export async function GET(
  request: Request,
  { params }: Params
) {
  try {
    const auth = await requireAuth(request);

    const { id } = await params;

    if (id !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Empresa não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    const empresa = await empresaService.findById(id);

    if (!empresa) {
      return NextResponse.json(
        {
          message: "Empresa não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(empresa);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao buscar empresa.",
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

    if (id !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Empresa não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    const dados = CorpoAtualizacaoEmpresa.parse(await request.json());

    const empresa = await empresaService.update(id, dados);

    return NextResponse.json(empresa);
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
        message: "Erro ao atualizar empresa.",
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

    if (id !== auth.empresaId) {
      return NextResponse.json(
        {
          message: "Empresa não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    await empresaService.delete(id);

    return NextResponse.json({
      message: "Empresa removida com sucesso.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        message: "Erro ao remover empresa.",
      },
      {
        status: 500,
      }
    );
  }
}
