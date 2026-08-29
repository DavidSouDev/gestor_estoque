"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProdutoAdmin } from "../../../_lib/types";
import { registrarMovimentacaoSimples } from "../../_lib/simples-actions";
import { WizardShell } from "./wizard-shell";
import { NumberStepper } from "./number-stepper";
import { ItemPicker } from "./item-picker";

const TOTAL_STEPS = 3;

const COPY = {
  SAIDA: {
    perguntaProduto: "Qual produto foi vendido?",
    perguntaQuantidade: "Quantas unidades?",
    confirmar: (quantidade: number, nome: string) => `Confirma a venda de ${quantidade}x ${nome}?`,
    botaoConfirmar: "Confirmar venda",
    emoji: "✅",
    tituloSucesso: "Venda registrada!",
    mensagemSucesso: (quantidade: number, nome: string) => `${quantidade}x ${nome}`,
    botaoRepetir: "Registrar outra venda",
  },
  ENTRADA: {
    perguntaProduto: "Qual produto vai receber estoque?",
    perguntaQuantidade: "Quantas unidades chegaram?",
    confirmar: (quantidade: number, nome: string) => `Confirma a entrada de ${quantidade}x ${nome}?`,
    botaoConfirmar: "Confirmar entrada",
    emoji: "📦",
    tituloSucesso: "Estoque atualizado!",
    mensagemSucesso: (quantidade: number, nome: string) => `+${quantidade}x ${nome}`,
    botaoRepetir: "Adicionar mais",
  },
} as const;

export function MovimentacaoWizard({
  slug,
  produtos,
  tipo,
  onDone,
}: {
  slug: string;
  produtos: ProdutoAdmin[];
  tipo: "ENTRADA" | "SAIDA";
  onDone: () => void;
}) {
  const router = useRouter();
  const copy = COPY[tipo];
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [concluida, setConcluida] = useState(false);

  const produto = produtos.find((item) => item.id === produtoId);

  function confirmar() {
    if (!produtoId) return;

    setError(null);

    startTransition(async () => {
      const resultado = await registrarMovimentacaoSimples(slug, { produtoId, quantidade, tipo });

      if (resultado.error) {
        setError(resultado.error);
        return;
      }

      setConcluida(true);
      router.refresh();
    });
  }

  if (concluida && produto) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
        <p className="text-5xl">{copy.emoji}</p>
        <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">{copy.tituloSucesso}</h1>
        <p className="text-slate-500">{copy.mensagemSucesso(quantidade, produto.nome)}</p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              setStep(0);
              setProdutoId(null);
              setQuantidade(1);
              setConcluida(false);
            }}
            className="rounded-2xl bg-slate-900 px-8 py-4 text-lg font-semibold text-white shadow-md hover:opacity-90"
          >
            {copy.botaoRepetir}
          </button>
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
      <ItemPicker
        items={produtos}
        title={copy.perguntaProduto}
        emptyMessage="Você ainda não tem produtos cadastrados."
        getKey={(item) => item.id}
        getLabel={(item) => item.nome}
        getSublabel={(item) => `estoque: ${item.estoque}`}
        onSelect={(item) => {
          setProdutoId(item.id);
          setStep(1);
        }}
        onBack={onDone}
      />
    );
  }

  if (step === 1) {
    return (
      <WizardShell
        step={1}
        totalSteps={TOTAL_STEPS}
        title={copy.perguntaQuantidade}
        subtitle={produto?.nome}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
      >
        <NumberStepper value={quantidade} onChange={setQuantidade} min={1} />
      </WizardShell>
    );
  }

  return (
    <WizardShell
      step={2}
      totalSteps={TOTAL_STEPS}
      title={produto ? copy.confirmar(quantidade, produto.nome) : ""}
      onBack={() => setStep(1)}
      onNext={confirmar}
      nextLabel={copy.botaoConfirmar}
      nextPending={pending}
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
    </WizardShell>
  );
}
