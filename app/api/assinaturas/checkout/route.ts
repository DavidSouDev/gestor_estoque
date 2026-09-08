import { assinaturaService } from "@/app/services/assinatura.service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { HttpError } from "@/lib/http-error";
import { NextResponse } from "next/server";

/**
 * Único ponto de entrada de pagamento do produto (GTW-01).
 *
 * ATUALIZAÇÃO DA FASE 4 — a afirmação original deste bloco ("não existe tela,
 * botão ou Server Action chamando este endpoint hoje", D-04 da Fase 3) ficou
 * FALSA. A Fase 4 construiu a Server Action `iniciarPagamento`
 * (`app/[slug]/admin/_lib/assinatura-actions.ts`), que é quem serve o botão de
 * pagamento do painel — e ela chama `assinaturaService.criarCheckout` DIRETO,
 * sem passar por HTTP.
 *
 * O motivo de a UI não consumir esta rota: o cookie de sessão do admin é
 * `httpOnly`, então o JavaScript do browser não tem Bearer token para mandar
 * aqui. As alternativas seriam expor o JWT ao cliente (regressão de segurança)
 * ou fazer a guarda de API aceitar cookie (novo vetor de CSRF na função mais
 * crítica do sistema). Nenhuma das duas se paga.
 *
 * Este continua sendo o endpoint canônico de checkout para consumidores que
 * TÊM token — a Fase 7 (gestão de assinatura) pode consumi-lo.
 */
export async function POST(request: Request) {
  try {
    // ÚNICO call site do repositório autorizado a passar esta flag: o caminho
    // de pagamento tem que sobreviver ao bloqueio, senão o cliente suspenso que
    // quer pagar fica trancado do lado de fora, sem como voltar. Uma segunda
    // ocorrência desta flag em produção é um bug (Pitfall 1 / T-04-10 / T-04-13).
    const auth = await requireAuth(request, { permitirEmpresaBloqueada: true });

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

    console.error(error instanceof Error ? error.message : error);

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
