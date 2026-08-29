"use client";

export function NumberStepper({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-3xl font-bold text-slate-600 transition-colors hover:bg-slate-50"
      >
        −
      </button>

      <input
        type="number"
        value={value}
        min={min}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          onChange(Number.isFinite(parsed) ? Math.max(min, parsed) : min);
        }}
        className="w-28 rounded-2xl border border-slate-200 bg-white py-4 text-center text-3xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800/20"
      />

      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-3xl font-bold text-slate-600 transition-colors hover:bg-slate-50"
      >
        +
      </button>
    </div>
  );
}
