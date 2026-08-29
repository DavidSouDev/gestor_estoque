"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS = {
  dashboard:
    "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  produtos:
    "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  combos:
    "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  promocoes:
    "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  estoque:
    "M4 7v10a1 1 0 001 1h14a1 1 0 001-1V7M4 7l8-4 8 4M4 7l8 4m0 0l8-4m-8 4v10",
  marca:
    "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01",
  sair: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  collapse: "M11 19l-7-7 7-7m8 14l-7-7 7-7",
  expand: "M13 5l7 7-7 7M5 5l7 7-7 7",
};

function buildNavItems(slug: string) {
  return [
    { href: `/${slug}/admin`, label: "Visão Geral", icon: ICONS.dashboard },
    { href: `/${slug}/admin/produtos`, label: "Produtos", icon: ICONS.produtos },
    { href: `/${slug}/admin/combos`, label: "Combos", icon: ICONS.combos },
    { href: `/${slug}/admin/promocoes`, label: "Promoções", icon: ICONS.promocoes },
    { href: `/${slug}/admin/estoque`, label: "Estoque", icon: ICONS.estoque },
    { href: `/${slug}/admin/marca`, label: "Marca", icon: ICONS.marca },
  ];
}

export function AdminNav({
  slug,
  empresaNome,
  email,
  primaryColor,
  logoutAction,
}: {
  slug: string;
  empresaNome: string;
  email: string;
  primaryColor: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const items = buildNavItems(slug);
  const dashboardHref = `/${slug}/admin`;

  return (
    <aside
      className={`${
        open ? "md:w-60" : "md:w-16"
      } flex w-full shrink-0 flex-col border-b border-slate-100 bg-white transition-all duration-200 md:h-screen md:border-b-0 md:border-r`}
    >
      <div className="flex items-center gap-3 border-b border-slate-100 p-4">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {empresaNome.charAt(0).toUpperCase()}
        </div>
        {open && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">{empresaNome}</p>
            <p className="truncate text-xs text-slate-400">{email}</p>
          </div>
        )}
        <button
          onClick={() => setOpen(!open)}
          className="ml-auto hidden shrink-0 text-slate-400 hover:text-slate-600 md:block"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={open ? ICONS.collapse : ICONS.expand}
            />
          </svg>
        </button>
      </div>

      <nav className="flex flex-1 flex-row gap-1 overflow-x-auto p-3 md:flex-col">
        {items.map((item) => {
          const active =
            item.href === dashboardHref
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={!open ? item.label : undefined}
              className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                active ? "text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
              style={active ? { backgroundColor: primaryColor } : {}}
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              {open && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <form action={logoutAction} className="border-t border-slate-100 p-3">
        <button
          type="submit"
          title={!open ? "Sair" : undefined}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS.sair} />
          </svg>
          {open && <span>Sair</span>}
        </button>
      </form>
    </aside>
  );
}
