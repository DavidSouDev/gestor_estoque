/**
 * TERM-02 — publicação de uma nova versão dos Termos de Uso.
 *
 * Cinco decisões moram aqui, e a primeira é a razão de este arquivo existir
 * separado de qualquer outro handler do projeto.
 *
 * ---
 *
 * (a) **A role vem do BANCO, nunca do token (D-06 / Pitfall 2).**
 *
 * `requireAuth` devolve deliberadamente o payload do JWT, e não a conta fresca:
 * a decisão `[01-03]` registra que devolver `ContaAtiva` quebraria as ~40 call
 * sites da assinatura pública. Esse payload é assinado uma vez e vale por 7
 * dias — é dado velho por construção. Autorizar a publicação por `auth.role`
 * daria a um SUPERADMIN **rebaixado para ADMIN** uma semana inteira de poder de
 * publicação sobre os termos da plataforma: uma escalação de privilégio com
 * janela de 7 dias, e não um detalhe de estilo.
 *
 * Por isso a fonte da autorização é `revalidarConta`, que lê o banco no request
 * ATUAL. A segunda leitura sai de graça: `requireAuth` acabou de executar a
 * MESMA query e o `React.cache` do DAL a deduplica dentro do request — o JSDoc
 * de `lib/api-auth.ts:61-64` já autoriza nominalmente esta segunda chamada.
 *
 * Consequência normativa: qualquer comparação de papel escrita sobre o payload
 * do token (a forma `auth.role ===`, ou a sua irmã `session.role ===` no lado
 * das Server Actions) é PROIBIDA em código de produção, e a ausência dela é
 * verificada por `npm run gates:fase-06`. O gate descarta linhas de comentário
 * antes de contar (decisão `[04-09]`), que é o que permite este parágrafo citar
 * as duas formas proibidas pelo nome.
 *
 * ---
 *
 * (b) **403 Forbidden, e não o código de "pagamento requerido".**
 *
 * O projeto já tem um código para "assinatura suspensa por falta de pagamento"
 * — a constante exportada por `lib/api-auth.ts` e usada pela guarda quando a
 * empresa está inadimplente. Aquele é o caso em que pagar resolve. Aqui pagar
 * não resolveria absolutamente nada: quem não é SUPERADMIN não vira SUPERADMIN
 * por dinheiro. Este é o caso canônico de 403 Forbidden.
 *
 * A prosa acima evita escrever tanto o NOME daquela constante quanto a sua
 * sequência numérica, de propósito, pela mesma convenção já registrada em
 * `app/api/cron/reconciliacao-diaria/route.test.ts`: o gate de grep da fase
 * precisa continuar sendo sinal real sobre o código, e não ruído vindo dos
 * comentários.
 *
 * A mensagem devolvida é genérica ("Ação não permitida.") de propósito: o corpo
 * NÃO distingue "você não é superadmin" de "você não está autenticado" (ASVS
 * V7). Quem sonda a rota não aprende, pela resposta, se o papel existe.
 *
 * ---
 *
 * (c) **O teto de 200000 caracteres é ASVS V5, não capricho.**
 *
 * O corpo é JSON vindo de fora. Sem limite superior explícito, um `conteudo` de
 * dezenas de MB entra no Postgres e, dali em diante, no RSC Payload de TODA
 * tela de aceite, de TODO usuário — o custo é pago para sempre e por todo
 * mundo, não uma vez por quem publicou.
 *
 * Honestidade sobre o número: 200000 caracteres (~60 páginas) é um valor
 * ESCOLHIDO, não medido. Nenhum experimento estabeleceu esse ponto; ele é uma
 * ordem de grandeza confortável para um documento jurídico e desconfortável
 * para um ataque. Registrado como escolha para que ninguém o cite depois como
 * se fosse resultado de medição.
 *
 * ---
 *
 * (d) **D-04 — esta rota é a superfície INTEIRA de publicação.**
 *
 * Não existe, e não deve existir nesta fase, tela de superadmin. Quem publica
 * usa `curl`, Postman ou script — exatamente o mesmo padrão operacional já
 * aceito para `acessoVitalicio`, que também só é ativado fora da aplicação.
 * Este arquivo exporta `POST` e nada mais: sem `GET`, sem `PATCH`, sem `PUT`,
 * sem `DELETE`. A ausência de `PATCH`/`PUT`/`DELETE` é a metade HTTP da
 * imutabilidade de TERM-03, cuja outra metade são as constraints do banco e a
 * ausência de métodos de escrita em `termo.service.ts`.
 *
 * ---
 *
 * (e) **Não há rate limiting aqui, e isso é consciente.**
 *
 * O chamador é um único humano operando a plataforma, e o projeto não tem
 * nenhuma infraestrutura de rate limiting (nem em memória, nem distribuída).
 * Introduzir uma só para esta rota seria construir a peça mais frágil do
 * sistema no lugar de menor tráfego dele. Registrado no threat model da fase
 * como risco ACEITO (T-06-15), não como esquecimento.
 */
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";

import { requireAuth, AuthError } from "@/lib/api-auth";
import { revalidarConta } from "@/lib/auth-guard";
import { HttpError } from "@/lib/http-error";
import { termoService } from "@/app/services/termo.service";

// O Prisma (via service) exige runtime Node; o Edge não serve.
export const runtime = "nodejs";
// Autorização por request: nada aqui pode ser servido de cache estático.
export const dynamic = "force-dynamic";

/**
 * ASVS V5 (ver decisão (c) no cabeçalho). `.trim()` roda ANTES de `.min(1)`, de
 * modo que um `conteudo` só de espaços é recusado, e o valor que segue para o
 * service é o já aparado — nunca o cru.
 */
const CorpoPublicacao = z.object({
  conteudo: z.string().trim().min(1).max(200_000),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);

    // D-06 / TERM-02: a role vem do BANCO (ver decisão (a) no cabeçalho).
    const conta = await revalidarConta(auth.sub, auth.empresaId);

    if (conta?.role !== UserRole.SUPERADMIN) {
      throw new AuthError("Ação não permitida.", 403);
    }

    const { conteudo } = CorpoPublicacao.parse(await request.json());

    // `publicadoPorId` sai da conta REVALIDADA, nunca do corpo do request: quem
    // publicou é quem esta requisição provou ser, não quem o JSON afirma ser.
    const termo = await termoService.publicar({
      conteudo,
      publicadoPorId: conta.usuarioId,
    });

    return NextResponse.json(termo, { status: 201 });
  } catch (error) {
    // Os dois erros do projeto carregam `status` e mensagem já segura para o
    // cliente — inclusive o 409 de publicação concorrente vindo do service.
    if (error instanceof AuthError || error instanceof HttpError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    // Corpo ausente, malformado, vazio ou grande demais. A mensagem não diz
    // QUAL campo falhou nem por quê: o detalhe do schema é informação sobre a
    // nossa validação, não sobre o erro de quem chamou.
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Corpo inválido." }, { status: 400 });
    }

    // Detalhe real só no servidor; ao cliente, mensagem genérica (CLAUDE.md,
    // seção Error Handling).
    console.error(error);

    return NextResponse.json({ message: "Erro ao publicar termos." }, { status: 500 });
  }
}
