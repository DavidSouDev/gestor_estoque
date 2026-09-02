import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Módulo NEUTRO de propósito: a leitura da versão vigente dos Termos de Uso
 * (D-07), deduplicada por request.
 *
 * **Por que mora aqui e não dentro de `lib/auth-guard.ts`.** O RESEARCH pede a
 * função "ao lado de `revalidarConta`", e "ao lado" é resolvido como módulo
 * irmão na mesma camada — não como mais um export do guard. Quatro consumidores
 * precisam do vigente e três **não** são de autorização: `app/registro/page.tsx`
 * (funil pré-autenticação), `app/services/empresa.service.ts` (registro atômico
 * de TERM-01) e `app/[slug]/admin/aceitar-termos/page.tsx`. Fazer o serviço de
 * registro importar a DAL de sessão acoplaria o cadastro ao guard do admin sem
 * ganho nenhum.
 *
 * Quatro pontos normativos:
 *
 * 1. **`React.cache` e SÓ ele.** `unstable_cache` e `'use cache'` são
 *    cross-request. Com qualquer um dos dois, um termo recém-publicado demoraria
 *    a valer e — pior — um usuário que ACABOU de aceitar continuaria sendo
 *    redirecionado para a tela de aceite até o cache expirar. É a mesma
 *    armadilha que T-04-08 documenta para o catálogo, e a decisão `[01-02]` do
 *    STATE.md já proíbe os dois nominalmente.
 *
 * 2. **`null` quando NÃO há nenhum termo publicado, e esse `null` NÃO gateia
 *    ninguém.** A assimetria é deliberada: o gate de TERM-04 falha **ABERTO**
 *    (gatear contra um documento inexistente derrubaria todos os tenants de uma
 *    vez, e a recuperação dependeria de o SUPERADMIN conseguir logar), enquanto
 *    o registro de TERM-01 falha **FECHADO** (a falha atinge um cadastro, e
 *    criar conta sem aceite viola TERM-01 diretamente). Está escrito nos dois
 *    lugares de propósito, para que um leitor futuro não "corrija" um dos lados
 *    para casar com o outro.
 *
 * 3. **Chamada de dentro de `revalidarConta`, esta query cai no `try/catch`
 *    fail-closed dela.** É o comportamento certo (erro de banco não autoriza),
 *    mas significa que uma falha na tabela de termos derruba a **sessão
 *    inteira**, não só o gate. O prefixo `[auth-guard]` nos logs é a ferramenta
 *    prevista para distinguir "termos quebrados" de "conta revogada".
 *
 * 4. **O desempate por `versao` existe porque `publicadoEm` sozinho pode
 *    empatar** e depende do relógio do servidor. D-07 pede "a mais recente por
 *    data de publicação"; acrescentar `versao` como segundo critério satisfaz
 *    isso de forma determinística, sem deixar o desempate a cargo da ordem
 *    física da tabela.
 */
export const termoVigente = cache(async () => {
  return prisma.termoDeUso.findFirst({
    // A ORDEM dos critérios é o contrato: `publicadoEm` decide, `versao` só
    // desempata.
    orderBy: [{ publicadoEm: "desc" }, { versao: "desc" }],
    // `select` explícito, nunca `include` (C-06).
    select: { id: true, versao: true, conteudo: true, publicadoEm: true },
  });
});

/**
 * O que `termoVigente()` devolve quando existe termo publicado.
 *
 * Exportado para que os consumidores (página de registro, card de aceite) tipem
 * props sem re-derivar a projeção — e para que uma mudança no `select` acima
 * quebre o `tsc` deles em vez de passar silenciosamente.
 */
export type TermoVigente = NonNullable<Awaited<ReturnType<typeof termoVigente>>>;
