import { cache } from "react";
import type { StatusAcesso, UserRole } from "@prisma/client";
import { CausaTransicaoAcesso } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { avaliarAcesso } from "@/lib/avaliar-acesso";
import { agendarPosResposta } from "@/lib/agendar-pos-resposta";
import { acessoService } from "@/app/services/acesso.service";

export interface ContaAtiva {
  usuarioId: string;
  empresaId: string;
  empresaSlug: string;
  email: string;
  role: UserRole;
  statusAcesso: StatusAcesso;
  acessoExpiraEm: Date | null;
  /**
   * Devolvido aqui (e não re-derivado pelo chamador) porque o banner de
   * "dias restantes" de ACC-01, na Fase 4, precisa exatamente deste valor.
   */
  carenciaAte: Date | null;
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
 * Ponto de extensão da Fase 2 (D-04), agora ocupado: a cada request autenticado
 * o status de acesso da empresa é derivado por `avaliarAcesso` sobre os 4 fatos
 * de billing projetados abaixo — nunca lido de `ultimoStatusAuditado`, que é só
 * bookkeeping do compare-and-swap da auditoria (BILL-01). O status calculado sai
 * em `ContaAtiva`, e uma transição observada durante o request agenda UMA linha
 * de auditoria fora do ciclo do response (D-16 e D-19).
 *
 * Esta função NÃO bloqueia ninguém: a conta continua sendo devolvida qualquer
 * que seja o status de acesso. Aplicar bloqueio (banner, admin fechado,
 * catálogo despublicado) é ACC-01..ACC-04, na Fase 4.
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
            select: {
              slug: true,
              acessoAte: true,
              trialFim: true,
              canceladoEm: true,
              acessoVitalicio: true,
              ultimoStatusAuditado: true,
            },
          },
        },
      });

      if (!usuario) {
        return null;
      }

      // O relógio é lido aqui, no chamador impuro, e injetado na função pura —
      // `avaliarAcesso` nunca chama `new Date` por conta própria (T-02-13).
      const agora = new Date();

      const acesso = avaliarAcesso(
        {
          acessoAte: usuario.empresa.acessoAte,
          trialFim: usuario.empresa.trialFim,
          canceladoEm: usuario.empresa.canceladoEm,
          acessoVitalicio: usuario.empresa.acessoVitalicio,
        },
        agora
      );

      // D-16: comparar com o estado persistido é responsabilidade DESTE
      // chamador, não da função pura. Sem esta guarda, cada page view do admin
      // viraria uma linha de auditoria. O agendamento tira a escrita do caminho
      // do response (T-02-17) e já embute o `.catch` com log `[acesso]`, então
      // uma falha de auditoria nunca derruba o request (ASVS V7).
      if (acesso.status !== usuario.empresa.ultimoStatusAuditado) {
        agendarPosResposta(() =>
          acessoService.registrarTransicao({
            empresaId: usuario.empresaId,
            anterior: usuario.empresa.ultimoStatusAuditado,
            novo: acesso.status,
            causa: CausaTransicaoAcesso.AVALIACAO_SESSAO,
          })
        );
      }

      return {
        usuarioId: usuario.id,
        empresaId: usuario.empresaId,
        empresaSlug: usuario.empresa.slug,
        email: usuario.email,
        role: usuario.role,
        statusAcesso: acesso.status,
        acessoExpiraEm: acesso.expiraEm,
        carenciaAte: acesso.carenciaAte,
      };
    } catch (error) {
      // Fail-closed: erro de banco NÃO autoriza (D-01).
      console.error("[auth-guard] falha ao revalidar conta:", error);
      return null;
    }
  }
);
