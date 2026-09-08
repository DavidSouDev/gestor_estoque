/**
 * Tela de assinatura (SUB-01) e único ponto de entrada do cancelamento (SUB-02).
 *
 * **A rota vive DENTRO de `(protected)`, e isso é deliberado.** Aquele grupo é
 * fechado por `acessoBloqueado`, então uma empresa suspensa (ou cancelada com o
 * período já expirado) é mandada para `/bloqueado` — que já tem o botão de pagar
 * da Fase 4 e agora também a tira de convergência. Esta tela serve TRIAL, EM_DIA,
 * CARENCIA, VITALICIO e cancelada-com-acesso-residual, que é exatamente o público
 * dos critérios de sucesso da fase. Mover a pasta para FORA de `(protected)`
 * reintroduz a classe `ERR_TOO_MANY_REDIRECTS` registrada em `lib/session.ts` e
 * no cabeçalho de `bloqueado/page.tsx` — e qualquer e2e que espere alcançar esta
 * rota como empresa bloqueada está afirmando um bug.
 *
 * A guarda simétrica de `bloqueado/page.tsx` NÃO é replicada aqui: dentro do
 * grupo protegido quem faz isso é `requireAdminSession`, chamado logo abaixo NA
 * PRÓPRIA PAGE. O layout não é — e não pode virar — o boundary de autorização
 * (T-04-06).
 */
import { notFound, redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/session";
import { revalidarConta } from "@/lib/auth-guard";
import { ultimoDiaDeAcessoEmSaoPaulo } from "@/lib/avaliar-acesso";
import { formatCurrency } from "@/lib/format";
import { VALOR_PLANO_MENSAL } from "@/lib/billing/asaas/config";
import { assinaturaService } from "@/app/services/assinatura.service";
import { empresaService } from "@/app/services/empresa.service";
import { consultarStatusAcesso, iniciarPagamento } from "../../_lib/assinatura-actions";
import { cancelarAssinatura } from "./actions";
import { AssinaturaCard, type AssinaturaCardProps } from "./_components/assinatura-card";

export default async function AdminAssinaturaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { slug } = await params;
  const { erro } = await searchParams;

  // Já garante sessão válida, empresa não bloqueada e termos aceitos. Nenhuma
  // dessas três guardas é replicada abaixo.
  const session = await requireAdminSession(slug);

  // Gratuito: memoizado por `React.cache` e portanto compartilhado com a chamada
  // que `requireAdminSession` acabou de fazer no mesmo request. É daqui que sai
  // `conta.statusAcesso`, a única autoridade de status da fase (BILL-01) — o
  // rótulo do pill NUNCA vem do gateway.
  const conta = await revalidarConta(session.sub, session.empresaId, session.iat);

  // FORA de qualquer `try`: `redirect()` sinaliza lançando e um `catch` o
  // engoliria.
  if (!conta) {
    redirect(`/${slug}/admin/login`);
  }

  // Toda leitura de billing passa pelo service, que projeta com `select`
  // explícito e filtra `deletedAt` no mesmo `where` — esta page não fala com o
  // banco por conta própria.
  const fatos = await assinaturaService.fatosDeAssinatura(session.empresaId);

  if (!fatos) {
    notFound();
  }

  // Mesma convenção de fallback do layout do painel e da tela de bloqueio: a
  // tela precisa desenhar mesmo para uma empresa sem cores configuradas.
  const empresa = await empresaService.findHeaderData(session.empresaId);

  // A derivação da data mora em `lib/`, nunca aqui e nunca no componente:
  // `acessoAte` é um limite superior EXCLUSIVO, e exibi-lo cru produz um
  // off-by-one invisível em code review e visível para todo usuário.
  const ultimoDiaDeAcesso = ultimoDiaDeAcessoEmSaoPaulo(fatos);

  let estado: AssinaturaCardProps["estado"];
  let gateway: AssinaturaCardProps["gateway"] = {
    proximaCobranca: null,
    ciclo: null,
    disponivel: false,
  };

  // ─── ORDEM NORMATIVA (pesquisa § Pattern 3) ───────────────────────────────
  // Os TRÊS primeiros ramos saem sem tocar o gateway, e só o quarto faz I/O.
  //
  // Inverter os dois primeiros com o último faria o produto consultar o Asaas
  // com o id de uma assinatura que ele mesmo acabou de remover — e a doc do
  // fornecedor é ambígua sobre o que aquele `GET` devolve depois da remoção
  // (suposição A2, ainda não confirmada contra o sandbox). Ramificar antes torna
  // esta tela independente daquela resposta.
  // ──────────────────────────────────────────────────────────────────────────
  if (fatos.acessoVitalicio) {
    estado = "vitalicio";
  } else if (fatos.canceladoEm !== null) {
    estado = "cancelada";
  } else if (fatos.asaasSubscriptionId === null) {
    // O primeiro minuto de todo assinante novo, não um caso de borda: a
    // confirmação do pagamento chega antes do evento que escreve o id.
    estado = "aguardando";
  } else {
    const statusGateway = await assinaturaService.consultarAssinatura(fatos.asaasSubscriptionId);
    const respondeu = statusGateway.origem === "asaas";

    estado = respondeu ? "ativa" : "degradado";
    gateway = {
      proximaCobranca: statusGateway.proximaCobranca,
      ciclo: statusGateway.ciclo,
      disponivel: respondeu,
    };
  }

  let rotuloStatus: string;
  let tomStatus: AssinaturaCardProps["tomStatus"];

  if (estado === "vitalicio") {
    rotuloStatus = "Acesso permanente";
    tomStatus = "positivo";
  } else if (estado === "cancelada") {
    // Nem âmbar, nem vermelho: uma empresa cancelada mas ainda paga não está em
    // apuros — o painel e o catálogo seguem no ar até a data que a Zona 1 mostra.
    rotuloStatus = "Cancelada";
    tomStatus = "neutro";
  } else if (estado === "aguardando") {
    rotuloStatus = "Sem assinatura";
    tomStatus = "neutro";
  } else if (conta.statusAcesso === "CARENCIA") {
    // Derivado do status LOCAL, nos estados "ativa" E "degradado" por igual — o
    // tom nunca vem do gateway.
    rotuloStatus = "Pagamento pendente";
    tomStatus = "atencao";
  } else {
    rotuloStatus = "Ativa";
    tomStatus = "positivo";
  }

  const podePagar = estado === "aguardando" || estado === "cancelada";
  const rotuloPagar = estado === "cancelada" ? "Reativar assinatura" : "Assinar agora";
  // Sem data, D-03 é insatisfazível — uma confirmação que não sabe dizer até
  // quando o acesso continua vale menos do que nenhum botão.
  const podeCancelar =
    (estado === "ativa" || estado === "degradado") && ultimoDiaDeAcesso !== null;

  return (
    <AssinaturaCard
      estado={estado}
      rotuloStatus={rotuloStatus}
      tomStatus={tomStatus}
      ultimoDiaDeAcesso={ultimoDiaDeAcesso}
      // O preço mora em `VALOR_PLANO_MENSAL`. Um literal aqui viraria um segundo
      // lugar para mudar quando o plano subir de preço.
      precoMensal={formatCurrency(VALOR_PLANO_MENSAL)}
      gateway={gateway}
      podePagar={podePagar}
      rotuloPagar={rotuloPagar}
      podeCancelar={podeCancelar}
      primaryColor={empresa?.primaryColor ?? "#18181b"}
      erroCheckout={erro === "checkout"}
      pagarAction={iniciarPagamento.bind(null, slug)}
      cancelarAction={cancelarAssinatura.bind(null, slug)}
      consultarStatusAction={consultarStatusAcesso.bind(null, slug)}
    />
  );
}
