import { assinaturaService } from "@/app/services/assinatura.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { HttpError } from "@/lib/http-error";
import { NextResponse } from "next/server";

/**
 * Único ponto de entrada de pagamento do produto (GTW-01).
 *
 * D-04: esta fase entrega SÓ o backend. Não existe tela, botão ou Server Action
 * chamando este endpoint hoje — o consumidor de UI é a Fase 4 (banner de
 * carência, ACC-01) ou a Fase 7 (gestão de assinatura). Um endpoint sem
 * consumidor é o esperado aqui, não um esquecimento.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    // C-08: `auth.empresaId` é a ÚNICA fonte de tenant. O corpo do request é
    // ignorado por completo — de propósito, e não por não haver campo útil: ler
    // qualquer coisa dele abriria o caminho para um admin autenticado iniciar
    // (e mais tarde vincular) uma cobrança na empresa de outro (T-03-15).
    const { url, checkoutId } = await assinaturaService.criarCheckout(auth.empresaId);

    // 200, não 201: do ponto de vista do chamador nenhum recurso nosso é criado
    // — a resposta é um redirecionamento de pagamento.
    return NextResponse.json({ url, checkoutId }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    // Ramo ausente no analog (`app/api/produtos/route.ts`): sem ele o 502 de
    // D-07 e o 404 de empresa inexistente virariam 500 genérico, e o usuário
    // não saberia distinguir "gateway fora do ar" de "bug nosso".
    // A mensagem já é genérica na origem (C-05), então repassá-la não vaza nada
    // do gateway.
    if (error instanceof HttpError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

    return NextResponse.json(
      {
        message: "Erro ao iniciar o pagamento.",
      },
      {
        status: 500,
      }
    );
  }
}
