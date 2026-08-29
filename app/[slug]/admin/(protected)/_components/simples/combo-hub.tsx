"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProdutoAdmin, ComboAdmin } from "../../../_lib/types";
import { removerComboSimples } from "../../_lib/simples-actions";
import { HubMenu } from "./hub-menu";
import { ItemPicker } from "./item-picker";
import { ConfirmarRemocao } from "./confirmar-remocao";
import { ComboWizard } from "./combo-wizard";

type Sub = "menu" | "novo" | "editar-lista" | "editar" | "remover-lista" | "remover";

export function ComboHub({
  slug,
  produtos,
  combos,
  onDone,
}: {
  slug: string;
  produtos: ProdutoAdmin[];
  combos: ComboAdmin[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sub, setSub] = useState<Sub>("menu");
  const [selecionado, setSelecionado] = useState<ComboAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (sub === "menu") {
    return (
      <HubMenu
        title="Combos"
        onNovo={() => setSub("novo")}
        onEditar={() => setSub("editar-lista")}
        onRemover={() => setSub("remover-lista")}
        onBack={onDone}
      />
    );
  }

  if (sub === "novo") {
    return <ComboWizard slug={slug} produtos={produtos} onDone={onDone} onCancel={() => setSub("menu")} />;
  }

  if (sub === "editar-lista") {
    return (
      <ItemPicker
        items={combos}
        title="Qual combo você quer editar?"
        emptyMessage="Você ainda não tem combos cadastrados."
        getKey={(item) => item.id}
        getLabel={(item) => item.nome}
        onSelect={(item) => {
          setSelecionado(item);
          setSub("editar");
        }}
        onBack={() => setSub("menu")}
      />
    );
  }

  if (sub === "editar" && selecionado) {
    return (
      <ComboWizard
        slug={slug}
        produtos={produtos}
        existing={selecionado}
        onDone={onDone}
        onCancel={() => setSub("menu")}
      />
    );
  }

  if (sub === "remover-lista") {
    return (
      <ItemPicker
        items={combos}
        title="Qual combo você quer remover?"
        emptyMessage="Você ainda não tem combos cadastrados."
        getKey={(item) => item.id}
        getLabel={(item) => item.nome}
        onSelect={(item) => {
          setSelecionado(item);
          setSub("remover");
        }}
        onBack={() => setSub("menu")}
      />
    );
  }

  if (sub === "remover" && selecionado) {
    return (
      <ConfirmarRemocao
        titulo="Remover combo?"
        mensagem={`Tem certeza que quer remover "${selecionado.nome}"?`}
        pending={pending}
        error={error}
        onCancelar={() => {
          setError(null);
          setSub("menu");
        }}
        onConfirmar={() => {
          setError(null);

          startTransition(async () => {
            const resultado = await removerComboSimples(slug, selecionado.id);

            if (resultado.error) {
              setError(resultado.error);
              return;
            }

            router.refresh();
            onDone();
          });
        }}
      />
    );
  }

  return null;
}
