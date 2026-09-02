"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Backoff da convergência pós-checkout (D-01). 7 tentativas em ~45 s — decidido
 * na UI-SPEC sob a discricionariedade que D-01 deixa aberta: converge em
 * SEGUNDOS, tem teto finito, e o total cabe dentro do tempo de atenção de quem
 * acabou de voltar de um checkout.
 *
 * O teto não é conforto de UI: um loop sem limite vira uma aba aberta batendo no
 * servidor indefinidamente (T-07-08).
 */
const INTERVALOS_MS = [2000, 3000, 4000, 6000, 8000, 10000, 12000] as const;

/**
 * Copy travada pela UI-SPEC §5.
 *
 * **A copy não pressupõe nada.** O poller monta para TODO visitante bloqueado, e
 * a maioria deles não acabou de pagar. Por isso o texto de polling é
 * "Verificando o status do seu acesso..." e o de fallback abre com "Se você
 * acabou de pagar": afirmar "Confirmando seu pagamento" seria simplesmente falso
 * para a maior parte de quem lê.
 */
const COPY = {
  verificando: "Verificando o status do seu acesso...",
  esgotou:
    "Se você acabou de pagar, a confirmação pode levar alguns minutos. Atualize a página em instantes.",
} as const;

export interface PollerDeStatusProps {
  /**
   * Chega JÁ vinculada ao slug pelo servidor
   * (`consultarStatusAcesso.bind(null, slug)`), no mesmo idioma que
   * `BloqueadoCardProps` usa para `pagarAction` e `logoutAction`.
   *
   * Deliberadamente SEM `slug` e sem nenhum id: é isso que mantém o componente
   * incapaz de escolher qual empresa consultar (T-07-06).
   */
  consultarAction: () => Promise<{ liberado: boolean }>;
}

/**
 * Convergência pós-checkout (D-01): descobre sozinho, em segundos, que o acesso
 * foi liberado — sem esperar o próximo webhook nem o worker do dia seguinte.
 *
 * A pergunta que este loop faz é "o painel já destravou?", e a resposta vem de
 * fatos LOCAIS via `consultarStatusAcesso`. Nenhuma tentativa toca a API do
 * Asaas: além de multiplicar requests contra a quota de 25.000/12 h (RESEARCH §
 * Pitfall 3), o gateway não saberia responder — `asaasSubscriptionId` está nulo
 * justamente nos segundos em que este componente mais roda (§ Achado 2).
 *
 * Quando destrava, `router.refresh()` faz a page reexecutar a guarda que JÁ
 * existe (`if (!conta || !acessoBloqueado(...)) redirect(...)`) e o próprio Next
 * devolve o usuário ao painel — nenhuma lógica de navegação nova é escrita aqui.
 *
 * Sem spinner, sem animação, sem barra de progresso: a tira é uma linha estática
 * que muda UMA vez, ao esgotar (UI-SPEC §5).
 */
export function PollerDeStatus({ consultarAction }: PollerDeStatusProps) {
  const router = useRouter();
  const [tentativa, setTentativa] = useState(0);
  const esgotou = tentativa >= INTERVALOS_MS.length;

  useEffect(() => {
    if (esgotou) {
      return;
    }

    const timer = setTimeout(async () => {
      const { liberado } = await consultarAction();

      if (liberado) {
        // Não incrementa `tentativa`: sem mudança de estado o efeito não roda de
        // novo, e o loop termina aqui.
        router.refresh();
        return;
      }

      setTentativa((n) => n + 1);
    }, INTERVALOS_MS[tentativa]);

    // Obrigatório, e não defensivo: sem este `clearTimeout` uma navegação deixa
    // um timer vivo chamando uma Server Action contra uma árvore desmontada.
    return () => clearTimeout(timer);
  }, [tentativa, esgotou, consultarAction, router]);

  return (
    <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-center">
      {/* O papel anunciado é `status` (live region *polite*) e nunca o papel
          assertivo de alerta, que interromperia quem usa leitor de tela a cada
          poucos segundos — mesma regra já seguida por `aviso-carencia.tsx`. */}
      <p role="status" className="text-xs text-slate-500">
        {esgotou ? COPY.esgotou : COPY.verificando}
      </p>
    </div>
  );
}
