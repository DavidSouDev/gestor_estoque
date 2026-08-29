"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import type { ProdutoAdmin, ComboAdmin } from "../../../_lib/types";
import { criarComboSimples, atualizarComboSimples } from "../../_lib/simples-actions";
import { WizardShell } from "./wizard-shell";

const INPUT_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center text-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/20";

const TOTAL_STEPS = 4;

export function ComboWizard({
  slug,
  produtos,
  existing,
  onDone,
  onCancel,
}: {
  slug: string;
  produtos: ProdutoAdmin[];
  existing?: ComboAdmin;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [nome, setNome] = useState(existing?.nome ?? "");
  const [selecionados, setSelecionados] = useState<string[]>(
    existing?.itens.map((item) => item.produtoId) ?? []
  );
  const [preco, setPreco] = useState(existing ? String(existing.preco) : "");
  const [error, setError] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const precoNumero = Number(preco.replace(",", "."));

  function alternarProduto(id: string) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]
    );
  }

  function salvar() {
    setError(null);

    startTransition(async () => {
      const dados = { nome, preco: precoNumero, produtoIds: selecionados };

      const resultado = existing
        ? await atualizarComboSimples(slug, existing.id, dados)
        : await criarComboSimples(slug, dados);

      if (resultado.error) {
        setError(resultado.error);
        return;
      }

      setSalvo(true);
      router.refresh();
    });
  }

  if (salvo) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
        <p className="text-5xl">{existing ? "✅" : "🎁"}</p>
        <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">
          {existing ? "Combo atualizado!" : "Combo salvo!"}
        </h1>
        <p className="text-slate-500">
          &quot;{nome}&quot; com {selecionados.length}{" "}
          {selecionados.length === 1 ? "produto" : "produtos"} por {formatCurrency(precoNumero)}.
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
      <WizardShell
        step={0}
        totalSteps={TOTAL_STEPS}
        title="Como vai se chamar o combo?"
        onBack={onCancel}
        onNext={() => setStep(1)}
        nextDisabled={!nome.trim()}
      >
        <input
          autoFocus
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          placeholder="Ex: Combo Lanche"
          className={INPUT_CLASS}
        />
      </WizardShell>
    );
  }

  if (step === 1) {
    return (
      <WizardShell
        step={1}
        totalSteps={TOTAL_STEPS}
        title="Quais produtos entram nesse combo?"
        subtitle="Toque em todos que fizerem parte."
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        nextDisabled={selecionados.length === 0}
      >
        {produtos.length === 0 ? (
          <p className="text-slate-500">Você ainda não tem produtos cadastrados.</p>
        ) : (
          <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto">
            {produtos.map((item) => {
              const marcado = selecionados.includes(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => alternarProduto(item.id)}
                  className={`flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors ${
                    marcado ? "border-slate-800 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-400"
                  }`}
                >
                  <span className="text-lg font-semibold text-slate-800">{item.nome}</span>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                      marcado ? "border-slate-800 bg-slate-800" : "border-slate-300"
                    }`}
                  >
                    {marcado && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </WizardShell>
    );
  }

  if (step === 2) {
    return (
      <WizardShell
        step={2}
        totalSteps={TOTAL_STEPS}
        title="Qual vai ser o preço do combo?"
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
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

  return (
    <WizardShell
      step={3}
      totalSteps={TOTAL_STEPS}
      title="Confirma esses dados?"
      onBack={() => setStep(2)}
      onNext={salvar}
      nextLabel={existing ? "Salvar alterações" : "Salvar combo"}
      nextPending={pending}
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-left">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">Nome</p>
          <p className="text-lg font-semibold text-slate-800">{nome}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">Produtos</p>
          <p className="text-lg font-semibold text-slate-800">{selecionados.length} selecionados</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">Preço</p>
          <p className="text-lg font-semibold text-slate-800">{formatCurrency(precoNumero)}</p>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </WizardShell>
  );
}
