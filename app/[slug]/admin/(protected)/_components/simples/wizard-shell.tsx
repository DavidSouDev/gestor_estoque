"use client";

export function WizardShell({
  step,
  totalSteps,
  title,
  subtitle,
  onBack,
  onNext,
  nextLabel = "Próximo",
  nextDisabled,
  nextPending,
  hideNext,
  children,
}: {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextPending?: boolean;
  hideNext?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="mb-8 flex items-center gap-2">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <span
            key={index}
            className={`h-2 flex-1 rounded-full ${
              index <= step ? "bg-slate-800" : "bg-slate-200"
            }`}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-base text-slate-500">{subtitle}</p>}
        </div>

        <div className="w-full max-w-md">{children}</div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-2xl px-6 py-4 text-lg font-semibold text-slate-500 transition-colors hover:bg-slate-100"
          >
            Voltar
          </button>
        ) : (
          <span />
        )}

        {!hideNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || nextPending}
            className="ml-auto rounded-2xl bg-slate-900 px-8 py-4 text-lg font-semibold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {nextPending ? "Aguarde..." : nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
