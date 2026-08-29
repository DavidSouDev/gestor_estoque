import Link from "next/link";

const ICONS = {
  estoque:
    "M4 7v10a1 1 0 001 1h14a1 1 0 001-1V7M4 7l8-4 8 4M4 7l8 4m0 0l8-4m-8 4v10",
  produtos:
    "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10",
  promocoes:
    "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
};

const ACOES = [
  { label: "Registrar venda", href: "estoque", icon: ICONS.estoque, color: "#2563eb" },
  { label: "Adicionar produto", href: "produtos", icon: ICONS.produtos, color: "#7c3aed" },
  { label: "Ver promoções", href: "promocoes", icon: ICONS.promocoes, color: "#059669" },
];

export function QuickActions({ slug }: { slug: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-semibold text-slate-700">Ações rápidas</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ACOES.map((acao) => (
          <Link
            key={acao.href}
            href={`/${slug}/admin/${acao.href}`}
            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: acao.color }}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={acao.icon} />
              </svg>
            </span>
            {acao.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
