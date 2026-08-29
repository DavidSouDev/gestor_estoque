"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import type { ProdutoAdmin, PromocaoAdmin } from "../../../_lib/types";
import { removerPromocaoSimples } from "../../_lib/simples-actions";
import { HubMenu } from "./hub-menu";
import { ItemPicker } from "./item-picker";
import { ConfirmarRemocao } from "./confirmar-remocao";
import { PromocaoWizard } from "./promocao-wizard";

type Sub = "menu" | "novo" | "editar-lista" | "editar" | "remover-lista" | "remover";

export function PromocaoHub({
  slug,
  produtos,
  promocoes,
  onDone,
}: {
  slug: string;
  produtos: ProdutoAdmin[];
  promocoes: PromocaoAdmin[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sub, setSub] = useState<Sub>("menu");
  const [selecionada, setSelecionada] = useState<PromocaoAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);

  // O modo Simples só sabe criar promoção de 1 produto — não mexe em
  // promoções multi-item/de combo feitas pelo admin corporativo.
  const editaveis = promocoes.filter((promocao) => promocao.itens.length === 1 && promocao.itens[0].produtoId);

  if (sub === "menu") {
    return (
      <HubMenu
        title="Promoções"
        onNovo={() => setSub("novo")}
        onEditar={() => setSub("editar-lista")}
        onRemover={() => setSub("remover-lista")}
        onBack={onDone}
      />
    );
  }

  if (sub === "novo") {
    return <PromocaoWizard slug={slug} produtos={produtos} onDone={onDone} onCancel={() => setSub("menu")} />;
  }

  if (sub === "editar-lista") {
    return (
      <ItemPicker
        items={editaveis}
        title="Qual promoção você quer editar?"
        emptyMessage="Você ainda não tem promoções cadastradas."
        getKey={(item) => item.id}
        getLabel={(item) => item.nome}
        getSublabel={(item) => `até ${formatDate(item.dataFim)}`}
        onSelect={(item) => {
          setSelecionada(item);
          setSub("editar");
        }}
        onBack={() => setSub("menu")}
      />
    );
  }

  if (sub === "editar" && selecionada) {
    return (
      <PromocaoWizard
        slug={slug}
        produtos={produtos}
        existing={selecionada}
        onDone={onDone}
        onCancel={() => setSub("menu")}
      />
    );
  }

  if (sub === "remover-lista") {
    return (
      <ItemPicker
        items={editaveis}
        title="Qual promoção você quer remover?"
        emptyMessage="Você ainda não tem promoções cadastradas."
        getKey={(item) => item.id}
        getLabel={(item) => item.nome}
        getSublabel={(item) => `até ${formatDate(item.dataFim)}`}
        onSelect={(item) => {
          setSelecionada(item);
          setSub("remover");
        }}
        onBack={() => setSub("menu")}
      />
    );
  }

  if (sub === "remover" && selecionada) {
    return (
      <ConfirmarRemocao
        titulo="Remover promoção?"
        mensagem={`Tem certeza que quer remover "${selecionada.nome}"?`}
        pending={pending}
        error={error}
        onCancelar={() => {
          setError(null);
          setSub("menu");
        }}
        onConfirmar={() => {
          setError(null);

          startTransition(async () => {
            const resultado = await removerPromocaoSimples(slug, selecionada.id);

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
