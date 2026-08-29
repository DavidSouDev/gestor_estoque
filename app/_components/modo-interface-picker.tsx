"use client";

type ModoInterfaceValue = "SIMPLES" | "COMPLETO";

const OPCOES: {
  value: ModoInterfaceValue;
  titulo: string;
  descricao: string;
}[] = [
  {
    value: "COMPLETO",
    titulo: "Completo",
    descricao: "Todos os recursos e relatórios detalhados. Ideal para quem já usa o sistema ou quer controle total.",
  },
  {
    value: "SIMPLES",
    titulo: "Simples",
    descricao: "Um painel mais direto ao ponto, com ações rápidas em destaque. Pensado pra quem tá começando agora.",
  },
];

export function ModoInterfacePicker({
  value,
  onChange,
}: {
  value: ModoInterfaceValue;
  onChange: (value: ModoInterfaceValue) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {OPCOES.map((opcao) => {
        const selecionado = opcao.value === value;

        return (
          <button
            key={opcao.value}
            type="button"
            onClick={() => onChange(opcao.value)}
            className={`rounded-2xl border p-4 text-left transition-all ${
              selecionado
                ? "border-slate-800 bg-slate-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">{opcao.titulo}</span>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  selecionado ? "border-slate-800 bg-slate-800" : "border-slate-300"
                }`}
              >
                {selecionado && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{opcao.descricao}</p>
          </button>
        );
      })}
    </div>
  );
}
