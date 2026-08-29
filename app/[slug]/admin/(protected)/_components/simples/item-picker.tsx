"use client";

export function ItemPicker<T>({
  items,
  title,
  subtitle,
  emptyMessage,
  getKey,
  getLabel,
  getSublabel,
  onSelect,
  onBack,
}: {
  items: T[];
  title: string;
  subtitle?: string;
  emptyMessage: string;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getSublabel?: (item: T) => string;
  onSelect: (item: T) => void;
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

      <h1 className="mb-2 text-2xl font-bold text-slate-800 sm:text-3xl">{title}</h1>
      {subtitle && <p className="mb-6 text-slate-500">{subtitle}</p>}

      {items.length === 0 ? (
        <p className="text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
          {items.map((item) => (
            <button
              key={getKey(item)}
              type="button"
              onClick={() => onSelect(item)}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition-colors hover:border-slate-400"
            >
              <span className="text-lg font-semibold text-slate-800">{getLabel(item)}</span>
              {getSublabel && <span className="text-sm text-slate-400">{getSublabel(item)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
