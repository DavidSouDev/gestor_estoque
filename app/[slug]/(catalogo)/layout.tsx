import { getEmpresaCatalogo } from "../_lib/empresa";

export default async function CatalogoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const empresa = await getEmpresaCatalogo(slug);

  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <header
        className="text-white shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${empresa.primaryColor} 0%, ${empresa.accentColor} 130%)`,
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            {empresa.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={empresa.logo}
                alt={empresa.nome}
                className="h-11 w-11 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-lg font-bold">
                {empresa.nome.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-lg font-bold leading-none">{empresa.nome}</p>
              {empresa.descricao && (
                <p className="mt-1 text-xs text-white/70">{empresa.descricao}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <div
        className="py-2 text-center text-sm font-medium text-white"
        style={{ backgroundColor: empresa.accentColor }}
      >
        Confira nossas promoções e combos especiais!
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      <footer className="border-t border-slate-200 px-6 py-6 text-center text-sm text-slate-500">
        {empresa.telefone && <p>{empresa.telefone}</p>}
        {empresa.instagram && <p>@{empresa.instagram}</p>}
      </footer>
    </div>
  );
}
