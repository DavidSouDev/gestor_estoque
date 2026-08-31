import { cache } from "react";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface ContaAtiva {
  usuarioId: string;
  empresaId: string;
  empresaSlug: string;
  email: string;
  role: UserRole;
}

/**
 * Confirma no banco que a conta do token ainda existe e está ativa.
 *
 * Fail-closed (D-01): devolve `null` tanto para "não existe / usuário inativo /
 * empresa removida" quanto para qualquer erro de banco. Quem chama nunca
 * autoriza um `null` — o erro é logado com o prefixo `[auth-guard]` para que,
 * em produção, "conta revogada" e "banco fora do ar" sejam distinguíveis.
 *
 * Deduplicada por request via React.cache (D-07): layout + page + componentes
 * do mesmo render compartilham UMA query. Ressalva (D-08): uma Server Action
 * disparada pelo browser é um request HTTP separado e portanto dispara a sua
 * própria query — o cache é por request, nunca cross-request.
 *
 * Ponto de extensão da Fase 2 (D-04): é aqui que `avaliarAcesso` (a avaliação
 * de pagamento sobre os campos de billing da Empresa) será plugada. Hoje NÃO
 * existe nenhuma lógica de pagamento nesta função.
 */
export const revalidarConta = cache(
  async (usuarioId: string, empresaId: string): Promise<ContaAtiva | null> => {
    try {
      const usuario = await prisma.usuario.findFirst({
        where: {
          id: usuarioId,
          empresaId, // isolamento multi-tenant (C-07): nunca `id` sozinho
          ativo: true, // D-02
          empresa: {
            deletedAt: null, // D-02
          },
        },
        select: {
          // select explícito: nunca traz senhaHash (C-06). `include` é proibido
          // no modelo Usuario justamente porque arrastaria o hash da senha.
          id: true,
          email: true,
          role: true,
          empresaId: true,
          empresa: {
            select: { slug: true },
          },
        },
      });

      if (!usuario) {
        return null;
      }

      return {
        usuarioId: usuario.id,
        empresaId: usuario.empresaId,
        empresaSlug: usuario.empresa.slug,
        email: usuario.email,
        role: usuario.role,
      };
    } catch (error) {
      // Fail-closed: erro de banco NÃO autoriza (D-01).
      console.error("[auth-guard] falha ao revalidar conta:", error);
      return null;
    }
  }
);
