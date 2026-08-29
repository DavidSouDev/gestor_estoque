"use client";

import { useState } from "react";
import type { ProdutoAdmin, ComboAdmin, PromocaoAdmin } from "../../../_lib/types";
import { ProdutoHub } from "./produto-hub";
import { MovimentacaoWizard } from "./movimentacao-wizard";
import { EstoqueView } from "./estoque-view";
import { PromocaoHub } from "./promocao-hub";
import { ComboHub } from "./combo-hub";

type Screen = "home" | "produto" | "venda" | "entrada" | "estoque" | "promocao" | "combo";

const ICONS = {
  venda: "M9 7h6m0 10v-3m-3 3v-3m-3 3v-3m10-8H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z",
  entrada: "M12 4v12m0 0l-4-4m4 4l4-4M4 20h16",
  produto: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  estoque: "M4 7v10a1 1 0 001 1h14a1 1 0 001-1V7M4 7l8-4 8 4M4 7l8 4m0 0l8-4m-8 4v10",
  promocao:
    "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  combo: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
};

function AcaoCard({
  icon,
  label,
  color,
  onClick,
}: {
  icon: string;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center gap-3 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{ backgroundColor: color }}
      >
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </span>
      <span className="text-lg font-semibold text-slate-800">{label}</span>
    </button>
  );
}

export function SimplesAssistant({
  slug,
  nome,
  produtos,
  combos,
  promocoes,
}: {
  slug: string;
  nome: string;
  produtos: ProdutoAdmin[];
  combos: ComboAdmin[];
  promocoes: PromocaoAdmin[];
}) {
  const [screen, setScreen] = useState<Screen>("home");

  if (screen === "produto") {
    return <ProdutoHub slug={slug} produtos={produtos} onDone={() => setScreen("home")} />;
  }

  if (screen === "venda") {
    return (
      <MovimentacaoWizard slug={slug} produtos={produtos} tipo="SAIDA" onDone={() => setScreen("home")} />
    );
  }

  if (screen === "entrada") {
    return (
      <MovimentacaoWizard slug={slug} produtos={produtos} tipo="ENTRADA" onDone={() => setScreen("home")} />
    );
  }

  if (screen === "estoque") {
    return <EstoqueView produtos={produtos} onBack={() => setScreen("home")} />;
  }

  if (screen === "promocao") {
    return (
      <PromocaoHub slug={slug} produtos={produtos} promocoes={promocoes} onDone={() => setScreen("home")} />
    );
  }

  if (screen === "combo") {
    return <ComboHub slug={slug} produtos={produtos} combos={combos} onDone={() => setScreen("home")} />;
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-10 text-center">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">Olá, {nome}!</h1>
        <p className="mt-2 text-base text-slate-500">O que você deseja fazer hoje?</p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
        <AcaoCard icon={ICONS.venda} label="Registrar venda" color="#2563eb" onClick={() => setScreen("venda")} />
        <AcaoCard
          icon={ICONS.entrada}
          label="Adicionar ao estoque"
          color="#0891b2"
          onClick={() => setScreen("entrada")}
        />
        <AcaoCard icon={ICONS.produto} label="Produtos" color="#7c3aed" onClick={() => setScreen("produto")} />
        <AcaoCard
          icon={ICONS.estoque}
          label="Conferir estoque"
          color="#059669"
          onClick={() => setScreen("estoque")}
        />
        <AcaoCard icon={ICONS.promocao} label="Promoções" color="#d97706" onClick={() => setScreen("promocao")} />
        <AcaoCard icon={ICONS.combo} label="Combos" color="#db2777" onClick={() => setScreen("combo")} />
      </div>
    </div>
  );
}
