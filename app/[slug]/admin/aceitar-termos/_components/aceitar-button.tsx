"use client";

import { useFormStatus } from "react-dom";

/**
 * CTA de aceite dos Termos de Uso (TERM-04).
 *
 * Ele vive SEMPRE dentro de um `<form action={aceitarTermos.bind(null, slug)}>`:
 * é o modelo zero-rede do projeto inteiro — nenhum client component deste
 * repositório faz chamada de rede por conta própria, toda mutação é Server
 * Action.
 *
 * O hook usado é `useFormStatus`, e não o hook de estado de action: a action
 * devolve `void` e termina em `redirect()`, então não existe estado nenhum para
 * renderizar de volta — só o "estou enviando" do form que envolve este botão.
 * (Mesma escolha, pelo mesmo motivo, de `_components/pagar-button.tsx`.)
 *
 * A string de classe abaixo é **caractere-a-caractere** a da variante
 * `bloqueado` de `PagarButton`, que por sua vez é a do submit do login
 * (`login-form.tsx:71`) acrescida de `focus:ring-2`. Reuso deliberado: o usuário
 * reconhece o mesmo botão que acabou de usar para entrar. `py-3` com `text-sm`
 * fecha exatamente os 44px de alvo de toque.
 */
const CLASSE =
  "w-full rounded-xl py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60 focus:ring-2";

export interface AceitarButtonProps {
  primaryColor: string;
}

export function AceitarButton({ primaryColor }: AceitarButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={CLASSE}
      style={
        {
          backgroundColor: primaryColor,
          "--tw-ring-color": primaryColor,
        } as React.CSSProperties
      }
    >
      {pending ? "Registrando aceite..." : "Aceitar e continuar"}
    </button>
  );
}
