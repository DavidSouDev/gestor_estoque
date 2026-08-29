"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProdutoAdmin } from "../../../_lib/types";
import { removerProdutoSimples } from "../../_lib/simples-actions";
import { HubMenu } from "./hub-menu";
import { ItemPicker } from "./item-picker";
import { ConfirmarRemocao } from "./confirmar-remocao";
import { ProdutoWizard } from "./produto-wizard";

type Sub = "menu" | "novo" | "editar-lista" | "editar" | "remover-lista" | "remover";

export function ProdutoHub({
  slug,
  produtos,
  onDone,
}: {
  slug: string;
  produtos: ProdutoAdmin[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sub, setSub] = useState<Sub>("menu");
  const [selecionado, setSelecionado] = useState<ProdutoAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (sub === "menu") {
    return (
      <HubMenu
        title="Produtos"
        onNovo={() => setSub("novo")}
        onEditar={() => setSub("editar-lista")}
        onRemover={() => setSub("remover-lista")}
        onBack={onDone}
      />
    );
  }

  if (sub === "novo") {
    return <ProdutoWizard slug={slug} onDone={onDone} onCancel={() => setSub("menu")} />;
  }

  if (sub === "editar-lista") {
    return (
      <ItemPicker
        items={produtos}
        title="Qual produto você quer editar?"
        emptyMessage="Você ainda não tem produtos cadastrados."
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
      <ProdutoWizard slug={slug} existing={selecionado} onDone={onDone} onCancel={() => setSub("menu")} />
    );
  }

  if (sub === "remover-lista") {
    return (
      <ItemPicker
        items={produtos}
        title="Qual produto você quer remover?"
        emptyMessage="Você ainda não tem produtos cadastrados."
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
        titulo="Remover produto?"
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
            const resultado = await removerProdutoSimples(slug, selecionado.id);

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
