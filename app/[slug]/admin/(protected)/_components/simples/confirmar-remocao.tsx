"use client";

export function ConfirmarRemocao({
  titulo,
  mensagem,
  pending,
  error,
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  mensagem: string;
  pending: boolean;
  error: string | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <p className="text-5xl">🗑️</p>
      <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">{titulo}</h1>
      <p className="text-slate-500">{mensagem}</p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onConfirmar}
          disabled={pending}
          className="rounded-2xl bg-red-600 px-8 py-4 text-lg font-semibold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Removendo..." : "Sim, remover"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-2xl px-8 py-4 text-lg font-semibold text-slate-500 hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
