"use client";

export function HubMenu({
  title,
  onNovo,
  onEditar,
  onRemover,
  onBack,
}: {
  title: string;
  onNovo: () => void;
  onEditar: () => void;
  onRemover: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 w-fit rounded-2xl px-4 py-2 text-lg font-semibold text-slate-500 hover:bg-slate-100"
      >
        ← Voltar
      </button>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">{title}</h1>

        <div className="flex w-full max-w-sm flex-col gap-4">
          <button
            type="button"
            onClick={onNovo}
            className="rounded-2xl bg-slate-900 py-5 text-lg font-semibold text-white shadow-md transition-opacity hover:opacity-90"
          >
            Adicionar novo
          </button>
          <button
            type="button"
            onClick={onEditar}
            className="rounded-2xl border border-slate-200 bg-white py-5 text-lg font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={onRemover}
            className="rounded-2xl border border-red-200 bg-white py-5 text-lg font-semibold text-red-600 shadow-sm transition-colors hover:bg-red-50"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}
