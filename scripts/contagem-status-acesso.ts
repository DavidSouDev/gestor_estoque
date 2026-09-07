/**
 * Conta, READ-ONLY, quantas empresas cada status de acesso classificaria HOJE.
 *
 * Rodar com `npm run acesso:contagem`.
 *
 * POR QUE ISTO EXISTE: `revalidarConta` já deriva `statusAcesso` dos 4 fatos de
 * billing a cada request autenticado — hoje, em produção, antes desta fase. A
 * única coisa que ele não faz é AGIR sobre o resultado. A partir do merge da
 * Fase 4 ele age. Isso significa que toda empresa cujos fatos estejam vencidos
 * há mais de `DIAS_DE_CARENCIA` perde o admin e tem o catálogo fora do ar no
 * PRIMEIRO request depois do deploy — retroativamente, de uma vez, sem aviso.
 *
 * O ROADMAP INDUZ AO ERRO AQUI, e vale dizê-lo em voz alta: ele registra que
 * "enforcement (Fase 4) precisa estar validado em produção antes de o worker
 * (Fase 5) poder bloquear alguém", o que se lê como bloqueio gradual, primeiro
 * observando e só depois agindo. NÃO É. A Fase 4 sozinha já bloqueia. O worker
 * da Fase 5 é rede de segurança para empresas que NÃO fazem request (auditoria e
 * e-mail); ele não é o gatilho, e esperar por ele não adia nada.
 *
 * Daí este script: a diferença entre um deploy e um incidente é saber o número
 * antes. É o mesmo papel do checkpoint de `pg_stat_activity` da Fase 1 e do de
 * homologação em sandbox da Fase 3 — medir o mundo real antes de ligar a chave.
 * 04-RESEARCH.md §Achado crítico 5 e §Pitfall 8.
 *
 * QUEM DECIDE O STATUS É `avaliarAcesso`, SEMPRE. Traduzir a regra para um
 * `WHERE` de SQL seria mais curto e produziria um número FALSO: a precedência de
 * `acessoVitalicio` sobre tudo (D-03), o trial que sobrevive a um `acessoAte`
 * futuro (D-05), a carência contada a partir do fato que venceu por último
 * (Pitfall 5) e as meias-noites de `America/Sao_Paulo` são quatro chances de a
 * cópia divergir da aplicação. Uma medição que existe para evitar um incidente é
 * o último lugar do projeto onde vale reimplementar a regra.
 *
 * READ-ONLY POR CONSTRUÇÃO: um único `findMany`. Nenhum `update`, nenhuma
 * escrita crua. É esperado que este script rode contra o banco de PRODUÇÃO.
 *
 * POR QUE ELE RODA PELO RESOLVEDOR DO PROJETO: o `.env` tem que ser lido pelo
 * MESMO leitor que a aplicação usa (`@next/env`, via `scripts/resolvedor-ts.mjs`).
 * Ler por `--env-file` do Node produz valores DIFERENTES para a mesma linha do
 * arquivo — o cabeçalho de `resolvedor-ts.mjs` registra o incidente. Aqui isso é
 * ainda mais importante que no seed: o banco que este script mede tem que ser,
 * por construção, o mesmo que a aplicação vai ler depois do deploy.
 */
import { StatusAcesso } from "@prisma/client";

import { avaliarAcesso } from "@/lib/avaliar-acesso";
import { prisma } from "@/lib/prisma";

/** Ordem de exibição: do mais saudável ao mais grave, e não a ordem do enum. */
const ORDEM_DE_EXIBICAO: readonly StatusAcesso[] = [
  StatusAcesso.TRIAL,
  StatusAcesso.EM_DIA,
  StatusAcesso.VITALICIO,
  StatusAcesso.CARENCIA,
  StatusAcesso.BLOQUEADO,
  StatusAcesso.CANCELADO,
];

/** Quantas empresas afetadas listar nominalmente antes de resumir o resto. */
const LIMITE_DA_AMOSTRA = 20;

/**
 * A senha nunca vai para o terminal, para o histórico do shell nem para o log
 * que a pessoa vai colar no checkpoint. O host e o nome do banco ficam visíveis
 * de propósito: a pergunta que este script responde só tem sentido se quem o
 * roda souber contra QUAL banco rodou (T-04-22).
 */
function alvoMascarado(): string {
  const url = process.env.DATABASE_URL;

  if (!url) return "(DATABASE_URL ausente)";

  return url.replace(/:[^:@/]*@/, ":***@");
}

async function principal(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(
      "[acesso:contagem] DATABASE_URL ausente. Aponte o `.env` para o banco que " +
        "vai receber este deploy antes de tirar conclusões da contagem."
    );
    process.exitCode = 1;
    return;
  }

  // Um único instante para TODAS as avaliações. Se cada empresa lesse o relógio
  // de novo, uma virada de meia-noite no meio do laço colocaria duas empresas
  // com fatos idênticos em status diferentes — e o número perderia o sentido
  // justamente na fronteira que interessa.
  const agora = new Date();

  const empresas = await prisma.empresa.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      nome: true,
      slug: true,
      acessoAte: true,
      trialFim: true,
      canceladoEm: true,
      acessoVitalicio: true,
    },
    orderBy: { slug: "asc" },
  });

  const contagem = new Map<StatusAcesso, number>(
    ORDEM_DE_EXIBICAO.map((status) => [status, 0])
  );
  const afetadas: { slug: string; nome: string; status: StatusAcesso }[] = [];

  for (const empresa of empresas) {
    const { status } = avaliarAcesso(empresa, agora);

    contagem.set(status, (contagem.get(status) ?? 0) + 1);

    if (status === StatusAcesso.BLOQUEADO || status === StatusAcesso.CANCELADO) {
      afetadas.push({ slug: empresa.slug, nome: empresa.nome, status });
    }
  }

  const emCarencia = contagem.get(StatusAcesso.CARENCIA) ?? 0;

  console.log("Contagem de status de acesso (read-only)");
  console.log(`  banco    ${alvoMascarado()}`);
  console.log(`  instante ${agora.toISOString()}`);
  console.log("");

  for (const status of ORDEM_DE_EXIBICAO) {
    console.log(`  ${status.padEnd(10)} ${String(contagem.get(status) ?? 0).padStart(6)}`);
  }

  console.log(`  ${"TOTAL".padEnd(10)} ${String(empresas.length).padStart(6)}`);
  console.log("");

  console.log(
    `>> Empresas que perderiam admin e catálogo no PRIMEIRO request após o deploy: ${afetadas.length}`
  );

  if (afetadas.length > 0) {
    console.log(
      "   Reconheça a lista abaixo antes de aprovar o merge: são empresas de teste/" +
        "abandonadas, ou clientes reais que ficariam fora do ar no dia do deploy?"
    );

    for (const empresa of afetadas.slice(0, LIMITE_DA_AMOSTRA)) {
      console.log(`   - ${empresa.status.padEnd(10)} ${empresa.slug}  (${empresa.nome})`);
    }

    if (afetadas.length > LIMITE_DA_AMOSTRA) {
      console.log(`   ... e mais ${afetadas.length - LIMITE_DA_AMOSTRA}.`);
    }
  }

  console.log("");
  console.log(
    `>> Empresas que veriam o banner de carência imediatamente: ${emCarencia}`
  );
  console.log(
    "   Estas NÃO são bloqueadas (D-03): mantêm admin e catálogo durante a carência."
  );
}

principal()
  .catch((falha: unknown) => {
    console.error(
      `[acesso:contagem] ${falha instanceof Error ? falha.message : "falha desconhecida"}`
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
