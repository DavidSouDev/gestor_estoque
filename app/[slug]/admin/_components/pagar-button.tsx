"use client";

import { useFormStatus } from "react-dom";

/**
 * CTA único de pagamento, compartilhado pelo banner de carência e pela tela de
 * bloqueio. Ele vive SEMPRE dentro de um `<form action={iniciarPagamento.bind(null, slug)}>`:
 * é o modelo zero-rede do projeto inteiro — nenhum client component deste
 * repositório faz chamada de rede por conta própria, toda mutação é Server
 * Action (T-04-09).
 *
 * O hook usado é `useFormStatus`, e não o hook de estado de action: a action
 * devolve `void` e termina em `redirect()`, então não existe estado nenhum para
 * renderizar de volta — só o "estou enviando" do form que envolve este botão.
 */

/**
 * Strings de classe copiadas literalmente da UI-SPEC §Component Contracts → 2.
 *
 * A variante `bloqueado` repete caractere-a-caractere o botão de submit do
 * login (`login-form.tsx:71`), acrescida de `focus:ring-2` — reuso deliberado,
 * para que o usuário reconheça o mesmo botão que acabou de usar para entrar.
 * `py-3` com `text-sm` fecha exatamente os 44px de alvo de toque; o padding
 * vertical de 10px usado nos inputs do login rende 40px e é proibido em botões
 * nesta fase.
 *
 * As props `label`/`pendingLabel` (Fase 7) afetam APENAS o texto — nenhuma delas
 * alcança este objeto, e nenhuma variante nova foi criada para elas. A tela de
 * assinatura usa a variante `bloqueado` (colorida pelo tenant, largura total,
 * `focus:ring-2`), porque o `amber-600` fixo da variante `banner` pertence à tira
 * de carência e não pode aparecer naquela tela (UI-SPEC §Component Contracts → 4).
 */
const CLASSES = {
  banner:
    "w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-amber-700 hover:shadow-lg active:scale-[0.98] disabled:opacity-60 sm:w-auto",
  bloqueado:
    "w-full rounded-xl py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60 focus:ring-2",
} as const;

export interface PagarButtonProps {
  variant: "banner" | "bloqueado";
  primaryColor?: string;
  /**
   * Os defaults são byte-idênticos às strings originais de propósito:
   * `aviso-carencia.tsx` e `bloqueado-card.tsx` não passam nenhuma das duas, e os
   * testes de componente da Fase 4 e os locators dos specs e2e dependem de
   * "Pagar agora". Não parafrasear, não mexer na pontuação (T-07-14).
   */
  label?: string;
  pendingLabel?: string;
}

export function PagarButton({
  variant,
  primaryColor,
  label = "Pagar agora",
  pendingLabel = "Redirecionando...",
}: PagarButtonProps) {
  const { pending } = useFormStatus();
  const ehBloqueado = variant === "bloqueado";

  return (
    <button
      type="submit"
      disabled={pending}
      className={CLASSES[variant]}
      // Só a tela de bloqueio recebe a cor do tenant. No banner, o fundo é
      // `amber-600` fixo: `primaryColor` é hex livre, sem nenhuma validação de
      // contraste no sistema, e sobre `amber-50` uma cor pálida faria sumir o
      // único controle que precisa converter.
      style={
        ehBloqueado
          ? ({
              backgroundColor: primaryColor,
              "--tw-ring-color": primaryColor,
            } as React.CSSProperties)
          : undefined
      }
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
