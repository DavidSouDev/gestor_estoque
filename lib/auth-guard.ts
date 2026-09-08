import { cache } from "react";
import type { StatusAcesso } from "@prisma/client";
import { CausaTransicaoAcesso, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { avaliarAcesso } from "@/lib/avaliar-acesso";
import { termoVigente } from "@/lib/termo-vigente";
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
  /**
   * TERM-04. Resolvido aqui (e não re-derivado pelo chamador) pelo MESMO motivo
   * de `carenciaAte`: os DOIS guards — `requireAdminSession` (web) e
   * `requireAuth` (REST) — precisam deste booleano, e nenhum deles pode
   * reimplementar a comparação, senão existiriam duas cópias da regra livres
   * para divergir.
   *
   * SUPERADMIN é sempre `false` (D-03), e a isenção mora AQUI e só aqui.
   */
  termosPendentes: boolean;
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
 *
 * Custo do caminho autenticado, a partir da Fase 6 (TERM-04): passou de 1 para
 * 2 queries por request — a segunda é `termoVigente()`. A alternativa de ler o
 * último aceite por relação aninhada custaria 3, porque o Prisma carrega
 * relações com queries separadas por padrão e o preview `relationJoins` NÃO
 * está habilitado neste projeto; a coluna escalar `termoAceitoId` entra no
 * `select` que já existe de graça. Consequência aceita (T-06-27): uma falha na
 * tabela de termos cai no MESMO `catch` fail-closed abaixo e portanto derruba a
 * sessão inteira, não só o gate de termos — o prefixo `[auth-guard]` nos logs é
 * a ferramenta de distinguir "termos quebrados" de "conta revogada".
 *
 * `tokenEmitidoEm` (opcional, `iat` em segundos de um JWT já verificado) fecha
 * uma lacuna que existia até aqui: nada invalidava um cookie/Bearer token
 * vazado depois de uma troca de senha — a única forma de matar uma sessão
 * comprometida era desativar a conta inteira, o que também derruba o dono
 * legítimo. Com o parâmetro presente, uma conta cujo `updatedAt` é mais recente
 * que a emissão do token é tratada como revogada (mesmo fail-closed de D-01),
 * forçando novo login. É deliberadamente GROSSEIRO — qualquer escrita em
 * `Usuario` (nome, email, senha, ativo/inativo) invalida a sessão corrente, não
 * só troca de senha — porque não existe hoje uma coluna dedicada tipo
 * `senhaAlteradaEm`, e usar `updatedAt` (que já existe, `@updatedAt`) evita uma
 * migration para fechar esta lacuna. É opcional porque nem toda chamada desta
 * função parte de um JWT recém-verificado: `app/api/empresas/route.ts`,
 * `app/api/termos/route.ts` e `app/api/usuarios/route.ts` reconsultam a role
 * fresca dentro do MESMO request que `requireAuth` já autenticou — devem
 * passar o `iat` daquele mesmo token (preserva o reaproveitamento via
 * `React.cache`, documentado acima), nunca omiti-lo.
 */
const TOLERANCIA_INVALIDACAO_MS = 5_000;

export const revalidarConta = cache(
  async (
    usuarioId: string,
    empresaId: string,
    tokenEmitidoEm?: number
  ): Promise<ContaAtiva | null> => {
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
          updatedAt: true,
          // TERM-04: coluna ESCALAR, então entra no `select` que já existe de
          // graça — nenhuma query nova por causa dela. É por isso que a opção
          // da relação aninhada foi descartada: o Prisma carrega relações com
          // queries separadas por padrão.
          termoAceitoId: true,
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

      // Sessão emitida ANTES da última mudança na conta: trata como revogada.
      // A TOLERANCIA absorve o descompasso de granularidade entre `updatedAt`
      // (ms, escrito pelo Postgres) e `iat` (arredondado para baixo em
      // segundos pelo `jose`) — sem ela, um login/registro legítimo seguido de
      // QUALQUER escrita na mesma conta dentro do mesmo segundo se
      // autoinvalidaria no request seguinte.
      if (
        tokenEmitidoEm !== undefined &&
        usuario.updatedAt.getTime() > tokenEmitidoEm * 1000 + TOLERANCIA_INVALIDACAO_MS
      ) {
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

      // TERM-04: a SEGUNDA (e única outra) query do caminho autenticado. Só é
      // disparada depois do guard de `!usuario` acima — um token de conta
      // revogada não paga por ela.
      const vigente = await termoVigente();

      // A ordem dos três termos do curto-circuito é deliberada:
      //
      // 1. `role !== SUPERADMIN` primeiro — é a isenção de D-03, e ela é
      //    MITIGAÇÃO DE IMPASSE, não conveniência (Pitfall 9): o SUPERADMIN é
      //    quem publica a versão vigente, e gateá-lo pela própria publicação
      //    tranca a plataforma inteira, sem ninguém capaz de destravá-la. A
      //    cadeia gêmea é D-02 (`acessoVitalicio` na empresa interna), no gate
      //    de pagamento. "Simplificar removendo o caso especial" TRAVA A
      //    PLATAFORMA — não é limpeza, é indisponibilidade total.
      //
      // 2. `vigente !== null` depois — é a assimetria deliberada. Este gate
      //    falha ABERTO porque gatear contra um documento inexistente derrubaria
      //    TODOS os tenants de uma vez e a recuperação dependeria de alguém
      //    publicar. O registro (`empresaService.registerComUsuario`) falha
      //    FECHADO pelo motivo oposto: ali a falha atinge UM cadastro, e criar
      //    conta sem aceite viola TERM-01 diretamente. A assimetria é
      //    intencional e está comentada nos DOIS lugares justamente para que um
      //    leitor futuro não "corrija" um deles para casar com o outro.
      //
      // 3. comparação de `id` por último — nunca `versao`, nunca `publicadoEm`.
      //    O `id` é o único identificador estável do documento que a pessoa
      //    aceitou.
      const termosPendentes =
        usuario.role !== UserRole.SUPERADMIN &&
        vigente !== null &&
        usuario.termoAceitoId !== vigente.id;

      return {
        usuarioId: usuario.id,
        empresaId: usuario.empresaId,
        empresaSlug: usuario.empresa.slug,
        email: usuario.email,
        role: usuario.role,
        statusAcesso: acesso.status,
        acessoExpiraEm: acesso.expiraEm,
        carenciaAte: acesso.carenciaAte,
        termosPendentes,
      };
    } catch (error) {
      // Fail-closed: erro de banco NÃO autoriza (D-01).
      console.error("[auth-guard] falha ao revalidar conta:", error);
      return null;
    }
  }
);
