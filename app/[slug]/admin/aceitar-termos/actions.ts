"use server";

import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";
import { termoVigente } from "@/lib/termo-vigente";
import { termoService } from "@/app/services/termo.service";

/**
 * Server Action de aceite dos Termos de Uso (TERM-04, D-10).
 *
 * Quatro decisões estão travadas aqui, e nenhuma delas é preferência de estilo.
 *
 * **(a) Esta action se autoriza sozinha (Pitfall 8 / T-06-29).** Ela mora FORA
 * do grupo `(protected)`, então NENHUM guard a cobre. Os docs do Next 16.3.0 são
 * explícitos: *"Treat Server Actions with the same security considerations as
 * public-facing API endpoints, and verify if the user is allowed to perform a
 * mutation."* Sem o `getVerifiedSession()` abaixo, qualquer pessoa com um
 * `admin_session` válido conseguiria disparar um aceite; e sem derivar o
 * `usuarioId` da sessão, conseguiria gravá-lo em nome de outro usuário. É o
 * mesmo par de checagens que `iniciarPagamento` faz em
 * `app/[slug]/admin/_lib/assinatura-actions.ts:29-37`, pelo mesmo motivo.
 *
 * **(b) O `usuarioId` vem de `session.sub` e de mais lugar nenhum (T-06-06).**
 * NÃO existe e NÃO pode existir input `usuarioId` no formulário. Isto é regra,
 * não observação: o formulário de `_components/aceite-card.tsx` carrega UM único
 * campo — o `termoId` escondido — e acrescentar um segundo campo de identidade
 * reabriria exatamente o vetor que a checagem acima fecha.
 *
 * **(c) TOCTOU (Pitfall 4 / T-06-07).** O `termoId` do hidden input é dado
 * CONTROLADO PELO CLIENTE. A checagem é IGUALDADE contra o vigente lido do
 * servidor, nunca "usa o que veio": não há caminho para o cliente escolher qual
 * versão aceitar. A janela é minúscula — publicações são raras — e o custo do
 * bug é um registro de consentimento inválido, que é o pior tipo de bug num
 * sistema cujo único produto é o registro de consentimento. Em divergência nada
 * é gravado e a tela re-renderiza com o texto NOVO e a cópia E1.
 *
 * **(d) O retorno é `/{slug}/admin` fixo, sem parâmetro `?next=` (D-10 /
 * T-06-10).** Um `?next=` seria vetor de open redirect e exigiria validação de
 * destino (allowlist de path relativo, começar com `/${slug}/admin`, não conter
 * `//` nem `:`) — custo desproporcional ao ganho de UX, e o RESEARCH já o
 * rejeitou nominalmente na `## Máquina de Estados do Gate`.
 */
export async function aceitarTermos(slug: string, formData: FormData): Promise<void> {
  const session = await getVerifiedSession();

  // C-08 / T-04-17: o tenant sai da sessão e de mais lugar nenhum. O `slug` da
  // URL só serve para confirmar que a sessão pertence a ESTA empresa, e a
  // confirmação vem ANTES de qualquer I/O de termos.
  if (!session || session.empresaSlug !== slug) {
    redirect(`/${slug}/admin/login`);
  }

  const vigente = await termoVigente();

  // Sem documento publicado não há o que aceitar. Consistente com o gate de
  // TERM-04, que falha ABERTO pelo mesmo `null` (a assimetria com o registro,
  // que falha FECHADO, está comentada nos dois lados de propósito).
  if (!vigente) {
    redirect(`/${slug}/admin`);
  }

  const termoId = String(formData.get("termoId") ?? "");

  // Ausente, vazio ou divergente caem todos aqui: só a igualdade exata grava.
  if (termoId !== vigente.id) {
    redirect(`/${slug}/admin/aceitar-termos?erro=termos-atualizados`);
  }

  let falhou = false;

  try {
    // `vigente.id`, NÃO o `termoId` recebido — mesmo depois de comprovada a
    // igualdade. É o valor do servidor que grava.
    await termoService.registrarAceite(session.sub, vigente.id);
  } catch (erro) {
    // Uma falha real do banco (P2002 já é absorvido pelo service como
    // idempotência) vira log de servidor e uma tela legível, nunca uma tela de
    // erro do Next.
    console.error("[termos] falha ao registrar aceite", erro);
    falhou = true;
  }

  // FORA do `try` de propósito: `redirect()` sinaliza lançando `NEXT_REDIRECT`,
  // e o `catch` acima o engoliria — a navegação simplesmente não aconteceria.
  // Mesma convenção documentada em `lib/session.ts` e já seguida por
  // `iniciarPagamento` e por `login`.
  redirect(falhou ? `/${slug}/admin/aceitar-termos?erro=termos-atualizados` : `/${slug}/admin`);
}
