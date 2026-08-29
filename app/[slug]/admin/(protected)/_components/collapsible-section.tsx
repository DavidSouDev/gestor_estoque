export function CollapsibleSection({
  title = "Mais opções",
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
      <summary className="cursor-pointer select-none text-sm font-medium text-slate-600">
        {title}
      </summary>
      <div className="mt-3 flex flex-col gap-4 pb-1">{children}</div>
    </details>
  );
}
