import { produtoService } from "../../../services/produto.service";
import { empresaService } from "../../../services/empresa.service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const empresaIdParam = searchParams.get("empresaId");

    // Exatamente UMA ida ao banco em qualquer caminho, inclusive nos de rejeição
    // (T-04-02 / Pitfall 2). Nunca resolver por slug e depois re-resolver por id:
    // isso daria a "existe mas está bloqueada" um custo diferente de "não existe",
    // e um visitante anônimo enumeraria tenants pelo relógio.
    // A precedência de `empresaId` sobre `slug` é o comportamento vigente.
    const empresa = empresaIdParam
      ? await empresaService.findPublicavelById(empresaIdParam)
      : slug
        ? await empresaService.findPublicavelBySlug(slug)
        : null;

    // Um único 400 para os três casos: nenhum parâmetro, slug inexistente e slug
    // de empresa bloqueada. A mensagem é literalmente a mesma que já existia —
    // é o que a tabela de paridade do 04-RESEARCH.md exige (T-04-01).
    if (!empresaIdParam && !empresa) {
      return NextResponse.json(
        {
          message: "Informe o parâmetro empresaId ou slug.",
        },
        {
          status: 400,
        }
      );
    }

    // Resta só o branch `?empresaId=` que não resolveu (inexistente OU bloqueada):
    // 200 com corpo vazio, exatamente o que a query sem resultados produzia antes.
    // Devolver 404 aqui tornaria a empresa bloqueada MAIS distinguível, não menos.
    if (!empresa) {
      return NextResponse.json([]);
    }

    const produtos = await produtoService.listCatalogo(empresa.id);

    return NextResponse.json(produtos);
  } catch (error) {
    console.error(error);

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
