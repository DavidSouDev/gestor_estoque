/**
 * Releitura dos Termos de Uso vigentes (TERM-RELEITURA).
 *
 * Tela SÓ-LEITURA. Não é um segundo gate: quem chega aqui já está em dia com os
 * termos, e nenhuma escrita de `AceiteTermo` sai daqui.
 *
 * **1. Por que a rota vive DENTRO de `(protected)`, ao contrário de
 * `aceitar-termos`.** Aquela mora FORA do grupo porque o próprio guard do grupo
 * manda o usuário para ela — pô-la dentro produz `ERR_TOO_MANY_REDIRECTS`
 * (registrado em `lib/session.ts` e no cabeçalho de `aceitar-termos/page.tsx`).
 * Esta é o caso oposto: o destino de quem JÁ passou pelo guard, e portanto
 * incapaz de gerar loop. O modelo estrutural é `(protected)/assinatura/page.tsx`.
 * Mover esta pasta para fora do grupo tiraria o chrome do admin e a autorização
 * de graça, sem ganho nenhum.
 *
 * **2. Por que nenhuma guarda simétrica é replicada.** `requireAdminSession` já
 * cobre sessão válida, empresa não suspensa e aceite de termos em dia. O layout
 * NÃO é — e não pode virar — o boundary de autorização (T-04-06): quem fecha a
 * tela é a chamada abaixo, NA PRÓPRIA PAGE. Repetir aqui qualquer uma das três
 * condições é como se produzem loops de redirect.
 *
 * **3. Por que a ausência de termo NÃO manda o usuário embora.**
 * `aceitar-termos` volta ao painel nesse caso porque lá um termo ausente torna o
 * gate insatisfazível. Aqui a tela é informativa: um estado vazio honesto é a
 * resposta correta, e devolver o usuário ao painel sem explicação seria pior.
 *
 * **4. Por que não existe rota GET de termos.** `app/api/termos/route.ts`
 * registra a superfície REST como deliberadamente mínima (só POST, só
 * SUPERADMIN). Um server component lê o módulo de leitura direto, e nenhum
 * cliente precisa do JSON.
 */
import { requireAdminSession } from "@/lib/session";
import { termoVigente } from "@/lib/termo-vigente";
import { formatDate } from "@/lib/format";
import { TermoLeituraCard } from "./_components/termo-leitura-card";

export default async function AdminTermosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // SEM atribuir a variável, de propósito: nada da sessão é usado aqui.
  // `TermoDeUso` é global (não tem `empresaId`), então não há isolamento de
  // tenant a aplicar sobre a leitura — a chamada existe pela AUTORIZAÇÃO, e é a
  // primeira coisa que acontece.
  await requireAdminSession(slug);

  const vigente = await termoVigente();

  // A data é formatada AQUI, no servidor, pelo mesmo motivo que em
  // `aceitar-termos/page.tsx`: o card fica testável sem fake timers.
  return (
    <TermoLeituraCard
      termo={
        vigente
          ? {
              versao: vigente.versao,
              conteudo: vigente.conteudo,
              publicadoEmFormatado: formatDate(vigente.publicadoEm),
            }
          : null
      }
    />
  );
}
