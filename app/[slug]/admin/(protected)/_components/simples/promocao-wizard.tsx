"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ProdutoAdmin, PromocaoAdmin } from "../../../_lib/types";
import { criarPromocaoSimples, atualizarPromocaoSimples } from "../../_lib/simples-actions";
import { WizardShell } from "./wizard-shell";
import { ItemPicker } from "./item-picker";

const INPUT_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center text-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/20";

const TOTAL_STEPS = 5;

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function daquiUmaSemana() {
  const data = new Date();
  data.setDate(data.getDate() + 7);
  return data.toISOString().slice(0, 10);
}

function paraDataInput(data: Date | string) {
  return new Date(data).toISOString().slice(0, 10);
}

export function PromocaoWizard({
  slug,
  produtos,
  existing,
  onDone,
  onCancel,
}: {
  slug: string;
  produtos: ProdutoAdmin[];
  existing?: PromocaoAdmin;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const itemExistente = existing?.itens[0];
  const [step, setStep] = useState(0);
  const [produtoId, setProdutoId] = useState<string | null>(itemExistente?.produtoId ?? null);
  const [preco, setPreco] = useState(itemExistente ? String(itemExistente.preco) : "");
  const [dataInicio, setDataInicio] = useState(existing ? paraDataInput(existing.dataInicio) : hoje());
  const [dataFim, setDataFim] = useState(existing ? paraDataInput(existing.dataFim) : daquiUmaSemana());
  const [error, setError] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const produto = produtos.find((item) => item.id === produtoId);
  const precoNumero = Number(preco.replace(",", "."));

  function salvar() {
    if (!produtoId) return;

    setError(null);

    startTransition(async () => {
      const dados = { produtoId, preco: precoNumero, dataInicio, dataFim };

      const resultado = existing
        ? await atualizarPromocaoSimples(slug, existing.id, dados)
        : await criarPromocaoSimples(slug, dados);

      if (resultado.error) {
        setError(resultado.error);
        return;
      }

      setSalvo(true);
      router.refresh();
    });
  }

  if (salvo && produto) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
        <p className="text-5xl">{existing ? "✅" : "🏷️"}</p>
        <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">
          {existing ? "Promoção atualizada!" : "Promoção salva!"}
        </h1>
        <p className="text-slate-500">
          {produto.nome} por {formatCurrency(precoNumero)} até {formatDate(`${dataFim}T00:00:00`)}.
        </p>

        <button
          type="button"
          onClick={onDone}
          className="mt-4 rounded-2xl bg-slate-900 px-8 py-4 text-lg font-semibold text-white shadow-md hover:opacity-90"
        >
          Voltar ao início
        </button>
      </div>
    );
  }

  if (step === 0) {
    return (
      <ItemPicker
        items={produtos}
        title="Qual produto vai entrar em promoção?"
        emptyMessage="Você ainda não tem produtos cadastrados."
        getKey={(item) => item.id}
        getLabel={(item) => item.nome}
        getSublabel={(item) => formatCurrency(item.precoVarejo)}
        onSelect={(item) => {
          setProdutoId(item.id);
          if (!itemExistente) {
            setPreco(String(item.precoVarejo));
          }
          setStep(1);
        }}
        onBack={onCancel}
      />
    );
  }

  if (step === 1) {
    return (
      <WizardShell
        step={1}
        totalSteps={TOTAL_STEPS}
        title="Qual vai ser o preço promocional?"
        subtitle={produto?.nome}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        nextDisabled={!(precoNumero > 0)}
      >
        <input
          autoFocus
          inputMode="decimal"
          value={preco}
          onChange={(event) => setPreco(event.target.value)}
          placeholder="0,00"
          className={INPUT_CLASS}
        />
      </WizardShell>
    );
  }

  if (step === 2) {
    return (
      <WizardShell
        step={2}
        totalSteps={TOTAL_STEPS}
        title="Quando começa a promoção?"
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
        nextDisabled={!dataInicio}
      >
        <input
          type="date"
          value={dataInicio}
          onChange={(event) => setDataInicio(event.target.value)}
          className={INPUT_CLASS}
        />
      </WizardShell>
    );
  }

  if (step === 3) {
    return (
      <WizardShell
        step={3}
        totalSteps={TOTAL_STEPS}
        title="Quando termina a promoção?"
        onBack={() => setStep(2)}
        onNext={() => setStep(4)}
        nextDisabled={!dataFim}
      >
        <input
          type="date"
          value={dataFim}
          min={dataInicio}
          onChange={(event) => setDataFim(event.target.value)}
          className={INPUT_CLASS}
        />
      </WizardShell>
    );
  }

  return (
    <WizardShell
      step={4}
      totalSteps={TOTAL_STEPS}
      title="Confirma esses dados?"
      onBack={() => setStep(3)}
      onNext={salvar}
      nextLabel={existing ? "Salvar alterações" : "Salvar promoção"}
      nextPending={pending}
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-left">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">Produto</p>
          <p className="text-lg font-semibold text-slate-800">{produto?.nome}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">Preço promocional</p>
          <p className="text-lg font-semibold text-slate-800">{formatCurrency(precoNumero)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">Período</p>
          <p className="text-lg font-semibold text-slate-800">
            {formatDate(`${dataInicio}T00:00:00`)} até {formatDate(`${dataFim}T00:00:00`)}
          </p>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </WizardShell>
  );
}
