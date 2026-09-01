import { createHash, timingSafeEqual } from "node:crypto";
import { CausaTransicaoAcesso } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cronSecret } from "@/lib/billing/cron-config";
import { acessoService } from "@/app/services/acesso.service";
import {
  LIMIAR_DE_BLOQUEIO_EM_MASSA,
  PISO_DE_BLOQUEIO_EM_MASSA,
  planejarReconciliacao,
  type Transicao,
} from "@/app/services/reconciliacao.service";

/**
 * Worker diário de reconciliação (WRK-01, WRK-02).
 *
 * A Fase 4 já bloqueia a cada request autenticado. Este endpoint é a rede de
 * segurança para quem NÃO aparece: a empresa cujo trial venceu e cujo admin
 * nunca mais fez login continuaria com o catálogo público no ar para sempre,
 * porque nenhum request dispararia a reavaliação. É por isso que o worker
 * existe — e é só por isso.
 *
 * ============================================================================
 * SETE COISAS QUE UM REFACTOR BEM-INTENCIONADO DESFARIA. Leia antes de mexer.
 * ============================================================================
 *
 * **1. Por que `GET` muta estado.** O instinto REST diz `POST`, e o instinto
 * está errado aqui. O Vercel Cron dispara EXCLUSIVAMENTE `GET` e não há como
 * configurar outro método; um endpoint `POST`-only aparece no painel com 405 e
 * o critério de sucesso #3 desta fase ("funciona igual nos dois hosts sem
 * mudança de código") fica falso já na primeira das duas plataformas
 * candidatas (Pitfall 3 / D-08). Se alguém precisar de `POST` por higiene
 * semântica, exportar os DOIS delegando à MESMA função — nunca substituir o
 * `GET`.
 *
 * **2. Por que não passa por `requireAuth`.** Aquele guard verifica JWT de
 * sessão e, desde a Fase 4, também status de assinatura. Um worker que
 * reconcilia assinaturas gateado por status de assinatura seria um impasse: a
 * empresa bloqueada nunca poderia ser reavaliada. É exatamente o argumento já
 * escrito em `lib/api-auth.ts` sobre o webhook do gateway, aplicado à segunda
 * porta não-autenticada-por-JWT do sistema.
 *
 * **3. Por que este é o único caminho do sistema que cruza `empresaId`.** Todo
 * o resto do projeto isola por tenant (C-07 do CLAUDE.md): toda query de
 * service filtra por `empresaId` e toda rota confere posse antes de mutar. O
 * worker opera sobre a base inteira por definição — é a exceção legítima e
 * única (T-05-08 / ASVS V4). Sem esta linha escrita, o arquivo parece uma
 * regressão de isolamento para quem o ler daqui a seis meses.
 *
 * **4. Por que NÃO há query param.** Nada de `?empresaId=`, `?dryRun=true`,
 * `?limite=`. Cada parâmetro vira superfície de ataque atrás de um único
 * segredo compartilhado — em particular, um seletor de tenant transformaria a
 * exceção do ponto 3 em arma direcionável pelo chamador. Não há corpo nem query
 * a validar (ASVS V5), e é também por isso que `zod` não entra neste arquivo.
 *
 * **5. Por que NÃO usa o agendamento pós-resposta.** Enfileirar o trabalho para
 * depois do `return` é o padrão do projeto para auditoria em `revalidarConta`,
 * e o JSDoc daquele helper até menciona "o worker HTTP da Fase 5" — mas menciona
 * no contexto do fallback fora de escopo de request, não como recomendação de
 * uso. Aqui o corpo JSON é a ÚNICA superfície de observabilidade autorizada por
 * D-04: responder antes de as escritas terminarem reportaria contagens vazias,
 * com as transições aparecendo no banco depois e ninguém sabendo (Pitfall 4).
 * O trabalho não está no caminho do TTFB — o trabalho É a resposta.
 *
 * **6. De onde saem as contagens.** Da lista materializada por
 * `planejarReconciliacao`, NUNCA do retorno de `registrarTransicao`. Aquele
 * devolve `null` em dois casos indistinguíveis entre si — não houve transição, e
 * outro processo ganhou a corrida do compare-and-swap — então contar `!== null`
 * reportaria "0 aplicadas" numa execução concorrente e pareceria bug (Pitfall
 * 5).
 *
 * **7. Nenhuma chamada ao gateway de pagamento.** D-06: o worker reavalia
 * exclusivamente os 4 fatos de billing já salvos na Empresa. A fila de eventos
 * de webhook pendentes NÃO é drenada aqui, e nenhuma cobrança é consultada.
 *
 * ---
 *
 * **`ultimoStatusAuditado` é bookkeeping do compare-and-swap**, nunca fonte da
 * verdade de acesso. Quem decide o status é o motor de avaliação sobre os 4
 * fatos (BILL-01 / T-02-03 / T-05-09); esta rota só o lê para preencher o
 * `anterior` da transição.
 *
 * **Agendamento sugerido — documentação, não configuração.** `10 3 * * *` em
 * UTC (00:10 em São Paulo no horário padrão, com folga confortável depois da
 * virada local, que é quando os status mudam). O equivalente num crontab de VPS:
 *
 * ```
 * 10 3 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *   https://APP_BASE_URL/api/cron/reconciliacao-diaria
 * ```
 *
 * NÃO criar arquivo de configuração de plataforma: a escolha de host é adiada
 * por D-07, e a corretude vem da avaliação dos fatos contra `agora`, não do
 * instante exato do agendamento — pular um dia não muda o resultado do dia
 * seguinte.
 *
 * O path é EXATO e sem barra final. Um 308 de normalização terminaria o job de
 * cron sem executar nada e sem erro visível, porque jobs de cron não seguem
 * redirects (Pitfall 7).
 */

// `node:crypto` e o Prisma exigem runtime Node; o Edge não serve.
export const runtime = "nodejs";
// Nenhuma resposta deste endpoint pode ser reaproveitada de cache. Em Next 16 o
// GET já é dinâmico por default (mudou em v15.0.0-RC), mas a declaração
// explícita é o idioma do projeto e imuniza contra regressão de configuração.
export const dynamic = "force-dynamic";
// Hint lido pela plataforma de deploy a partir do build output. O Next documenta
// o default como "Set by deployment platform", então num VPS a linha é inerte —
// incluí-la não viola a agnosticidade de plataforma de D-07.
export const maxDuration = 300;

const PREFIXO = "[cron-reconciliacao]";

/**
 * Quantas transições são persistidas em paralelo. Fica confortavelmente abaixo
 * do `max = 10` default do pool do driver do Postgres — ver o JSDoc de `aplicar`.
 */
const CONCORRENCIA = 5;

interface ErroPorEmpresa {
  empresaId: string;
  mensagem: string;
}

/**
 * Confere a autenticidade do agendador (WRK-02, T-05-01, T-05-02).
 *
 * `Authorization: Bearer` NÃO é concessão a fornecedor nenhum: é o formato que
 * o Vercel Cron envia AUTOMATICAMENTE quando a env var `CRON_SECRET` existe, e é
 * trivialmente reproduzível por `curl -H "Authorization: Bearer $CRON_SECRET"`
 * num crontab de VPS. Um header customizado (`x-cron-secret`, por exemplo)
 * quebraria o primeiro caso de graça e violaria o critério de sucesso #3 (D-08).
 *
 * Comparar as duas strings com `===` é PROIBIDO: comparação de string
 * curto-circuita no primeiro byte divergente e vaza o segredo por timing (ASVS
 * V6). O SHA-256 dos dois lados resolve duas coisas de uma vez — a comparação de
 * tempo constante exige buffers de mesmo tamanho, o que quebraria com qualquer
 * segredo de comprimento inesperado, e o próprio comprimento do segredo deixa de
 * ser observável, já que todo hash tem 32 bytes.
 *
 * O throw de `cronSecret()` NÃO é capturado, e isso é deliberado: com o segredo
 * não configurado o endpoint está quebrado, e um 500 deixa claro que a causa é
 * configuração — melhor que um 401 silencioso, que também falharia, porém sem
 * distinguir "segredo errado" de "segredo ausente no servidor". É a mesma decisão
 * registrada no gate do webhook do gateway (T-05-03).
 */
function segredoValido(authorization: string | null): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;

  const recebido = createHash("sha256").update(authorization.slice(7)).digest();
  const esperado = createHash("sha256").update(cronSecret()).digest();

  return timingSafeEqual(recebido, esperado);
}

/**
 * Persiste as transições aprovadas, em lotes, com isolamento de falha por
 * empresa (D-05).
 *
 * Três decisões, cada uma com um custo real por trás:
 *
 * (a) **`allSettled` e NÃO `all`.** `all` aborta na primeira rejeição e mataria
 *     o processamento das demais empresas do lote — uma empresa com o banco
 *     resistindo derrubaria a reconciliação das outras quatro, o que viola D-05
 *     diretamente. `allSettled` também garante que nenhuma rejeição vire
 *     `unhandledRejection`: toda promise do array é observada.
 *
 * (b) **LOTES, e não a lista inteira de uma vez.** Cada `registrarTransicao`
 *     abre uma transação interativa, que segura uma conexão do pool do início ao
 *     fim. O pool do driver tem `max = 10` por default e `lib/prisma.ts` não o
 *     dimensiona (D-07 adia isso); simultaneamente, o `maxWait` de transação
 *     interativa do Prisma é 2000 ms. Disparar duzentas de uma vez faria as
 *     excedentes esperarem por conexão e as que passassem de 2 s falharem com
 *     erro de AQUISIÇÃO de conexão — enchendo a lista de erros de falhas que não
 *     são falhas de negócio, e ainda por cima depois de o freio de segurança já
 *     ter aprovado as escritas (Pitfall 2 / T-05-05).
 *
 * (c) **Só a `.message` do erro, nunca o objeto.** Um erro conhecido do Prisma
 *     pode carregar a query e metadados de conexão, e esta resposta acaba em log
 *     de TERCEIRO — o painel do agendador, o log do runner de CI. D-04 pede
 *     "sem dado sensível", e serializar o objeto inteiro entregaria a topologia
 *     do banco a quem só deveria ver contagens (Pitfall 9 / T-05-06).
 */
async function aplicar(
  transicoes: Transicao[]
): Promise<{ aplicadas: number; erros: ErroPorEmpresa[] }> {
  const erros: ErroPorEmpresa[] = [];
  let aplicadas = 0;

  for (let i = 0; i < transicoes.length; i += CONCORRENCIA) {
    const lote = transicoes.slice(i, i + CONCORRENCIA);

    const resultados = await Promise.allSettled(
      lote.map((t) =>
        acessoService.registrarTransicao({
          ...t,
          causa: CausaTransicaoAcesso.WORKER_DIARIO,
        })
      )
    );

    resultados.forEach((r, indice) => {
      if (r.status === "rejected") {
        erros.push({
          empresaId: lote[indice].empresaId,
          mensagem:
            r.reason instanceof Error ? r.reason.message : "falha desconhecida",
        });
        return;
      }

      // `null` aqui é no-op legítimo (sem transição, ou corrida perdida no
      // compare-and-swap), não erro — ver o ponto 6 do cabeçalho.
      aplicadas += 1;
    });
  }

  return { aplicadas, erros };
}

export async function GET(request: Request) {
  // (1) Autenticidade. Falha genérica, sem corpo: não revela se o header estava
  // ausente, errado ou com tamanho inesperado (espelha `lib/api-auth.ts` e o
  // gate do webhook do gateway — T-05-07).
  if (!segredoValido(request.headers.get("authorization"))) {
    return new Response(null, { status: 401 });
  }

  const inicio = Date.now();

  // (2) Um único instante para TODAS as avaliações. Se cada empresa lesse o
  // relógio de novo, uma virada de meia-noite no meio do laço colocaria duas
  // empresas com fatos idênticos em status diferentes — e importa mais aqui do
  // que em qualquer outro lugar do projeto, porque as viradas de status
  // acontecem exatamente na meia-noite de `America/Sao_Paulo` e este job roda
  // perto dela. Com o relógio relido por empresa, o resultado passaria a
  // depender da ordem em que o banco devolveu as linhas.
  const agora = new Date();

  // (3) O filtro de soft-delete é OBRIGATÓRIO, não higiene: empresas apagadas
  // diluiriam o denominador do freio e — por terem ficado sem status auditado no
  // backfill da Fase 2, cujo UPDATE também filtrou por elas — cairiam como
  // transição de "nunca auditada" para BLOQUEADO, sendo contadas como perdas de
  // acesso perigosas (Pitfall 8).
  const empresas = await prisma.empresa.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      acessoAte: true,
      trialFim: true,
      canceladoEm: true,
      acessoVitalicio: true,
      ultimoStatusAuditado: true,
    },
  });

  // (4) Passada pura: uma avaliação por empresa, o freio decidido sobre a lista
  // materializada, e nada de I/O.
  const plano = planejarReconciliacao(empresas, agora);

  // (5) Anomalia registrada antes de qualquer escrita. Contagens apenas — nunca
  // o header, nunca o segredo (T-05-16).
  if (plano.freio.disparou) {
    console.error(
      `${PREFIXO} FREIO DE SEGURANÇA ARMADO — ${plano.perigosas.length} de ` +
        `${plano.avaliadas} empresas perderiam acesso nesta execução. ` +
        `Nenhuma perda de acesso foi aplicada.`
    );
  }

  // (6) AGUARDADO, não agendado — ver o ponto 5 do cabeçalho.
  const { aplicadas, erros } = await aplicar(plano.aplicaveis);

  // (7) O contrato de D-04: sete chaves no topo, cinco no freio. Acrescentar
  // campo aqui é acrescentar superfície num corpo que vai para log de terceiro.
  return Response.json({
    instante: agora.toISOString(),
    duracaoMs: Date.now() - inicio,
    avaliadas: plano.avaliadas,
    transicoesDetectadas: plano.transicoes.length,
    aplicadas,
    freio: {
      disparou: plano.freio.disparou,
      limiar: LIMIAR_DE_BLOQUEIO_EM_MASSA,
      piso: PISO_DE_BLOQUEIO_EM_MASSA,
      perdasDeAcessoDetectadas: plano.perigosas.length,
      perdasDeAcessoSuprimidas: plano.freio.suprimidas,
    },
    erros,
  });
}
