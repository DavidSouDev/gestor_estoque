"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import type { ProdutoAdmin } from "../../../_lib/types";
import { criarProdutoSimples, atualizarProdutoSimples } from "../../_lib/simples-actions";
import { WizardShell } from "./wizard-shell";
import { NumberStepper } from "./number-stepper";

const INPUT_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center text-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/20";

const TOTAL_STEPS = 5;

export function ProdutoWizard({
  slug,
  existing,
  onDone,
  onCancel,
}: {
  slug: string;
  existing?: ProdutoAdmin;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [nome, setNome] = useState(existing?.nome ?? "");
  const [preco, setPreco] = useState(existing ? String(existing.precoVarejo) : "");
  const [estoque, setEstoque] = useState(existing?.estoque ?? 0);
  const [fotoCapa, setFotoCapa] = useState(existing?.fotoCapa ?? "");
  const [error, setError] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const precoNumero = Number(preco.replace(",", "."));

  function salvar() {
    setError(null);

    startTransition(async () => {
      const dados = {
        nome,
        precoVarejo: precoNumero,
        estoque,
        fotoCapa: fotoCapa || undefined,
      };

      const resultado = existing
        ? await atualizarProdutoSimples(slug, existing.id, dados)
        : await criarProdutoSimples(slug, dados);

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
        <p className="text-5xl">{existing ? "✅" : "🎉"}</p>
        <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">
          {existing ? "Produto atualizado!" : "Produto salvo!"}
        </h1>
        <p className="text-slate-500">&quot;{nome}&quot; já está no seu catálogo.</p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {!existing && (
            <button
              type="button"
              onClick={() => {
                setStep(0);
                setNome("");
                setPreco("");
                setEstoque(0);
                setFotoCapa("");
                setSalvo(false);
              }}
              className="rounded-2xl bg-slate-900 px-8 py-4 text-lg font-semibold text-white shadow-md hover:opacity-90"
            >
              Adicionar outro
            </button>
          )}
          <button
            type="button"
            onClick={onDone}
            className="rounded-2xl px-8 py-4 text-lg font-semibold text-slate-500 hover:bg-slate-100"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }

  if (step === 0) {
    return (
      <WizardShell
        step={0}
        totalSteps={TOTAL_STEPS}
        title="Como se chama o produto?"
        onBack={onCancel}
        onNext={() => setStep(1)}
        nextDisabled={!nome.trim()}
      >
        <input
          autoFocus
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          placeholder="Ex: Arroz 5kg"
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
        title="Qual o preço de venda?"
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
        title="Quantos você tem em estoque agora?"
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
      >
        <NumberStepper value={estoque} onChange={setEstoque} />
      </WizardShell>
    );
  }

  if (step === 3) {
    return (
      <WizardShell
        step={3}
        totalSteps={TOTAL_STEPS}
        title="Quer adicionar uma foto?"
        subtitle="Se não tiver o link de uma foto agora, pode pular essa parte."
        onBack={() => setStep(2)}
        onNext={() => setStep(4)}
        nextLabel={fotoCapa ? "Próximo" : "Pular"}
      >
        <input
          value={fotoCapa}
          onChange={(event) => setFotoCapa(event.target.value)}
          placeholder="https://..."
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
      nextLabel={existing ? "Salvar alterações" : "Salvar produto"}
      nextPending={pending}
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-left">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">Nome</p>
          <p className="text-lg font-semibold text-slate-800">{nome}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">Preço</p>
          <p className="text-lg font-semibold text-slate-800">{formatCurrency(precoNumero)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">Estoque</p>
          <p className="text-lg font-semibold text-slate-800">{estoque} unidades</p>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </WizardShell>
  );
}
