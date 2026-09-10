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
  // Mesmo ícone de engrenagem do botão "Configurações" de `simples-top-bar.tsx`
  // (dois `<path>`, por isso os dois entram aqui como array) — ver o comentário
  // do link de Minha Loja/Configurações abaixo para o porquê da troca.
  configuracoes: [
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  ],
  assinatura: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  termos:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  sair: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  collapse: "M11 19l-7-7 7-7m8 14l-7-7 7-7",
  expand: "M13 5l7 7-7 7M5 5l7 7-7 7",
};

function buildNavItems(slug: string) {
  return [
    { href: `/${slug}/admin`, label: "Início", icon: ICONS.dashboard },
    { href: `/${slug}/admin/produtos`, label: "Meus Produtos", icon: ICONS.produtos },
    { href: `/${slug}/admin/combos`, label: "Combos", icon: ICONS.combos },
    { href: `/${slug}/admin/promocoes`, label: "Promoções", icon: ICONS.promocoes },
    { href: `/${slug}/admin/estoque`, label: "Estoque", icon: ICONS.estoque },
    // "Minha Loja" saiu desta lista — vira o ícone de engrenagem no cabeçalho
    // (ver comentário no link de Configurações, abaixo), mesmo tratamento que
    // `simples-top-bar.tsx` já dá à mesma página. A página em si não mudou.
    // Último de propósito: os cinco acima estão ordenados por frequência diária de
    // uso, e assinatura é o destino menos visitado do produto — pertence ao fim
    // desse gradiente, junto dos controles de nível de conta.
    { href: `/${slug}/admin/assinatura`, label: "Assinatura", icon: ICONS.assinatura },
    // Último de todos, pelo mesmo critério: releitura de contrato pertence ao
    // agrupamento de "controles de nível de conta" que assinatura abre, e é o
    // destino MENOS visitado do produto inteiro — a tela existe para consulta
    // eventual, não para uso diário.
    { href: `/${slug}/admin/termos`, label: "Termos de Uso", icon: ICONS.termos },
  ];
}

export function AdminNav({
  slug,
  empresaNome,
  email,
  logo,
  primaryColor,
  logoutAction,
}: {
  slug: string;
  empresaNome: string;
  email: string;
  logo?: string | null;
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
      {/*
        Colapsada, a sidebar tem 64px (`md:w-16`) — depois do padding sobra
        ~32px, o suficiente para UM quadrado de 32px, não para vários lado a
        lado. Por isso o `flex-col` quando `!open`: avatar, engrenagem e
        colapsar empilham em vez de disputar a mesma linha, que era o que
        antes fazia a engrenagem "vazar" pra fora da sidebar por cima do
        conteúdo (só o `open` já tinha logo+nome cabendo na horizontal).
      */}
      <div
        className={`flex border-b border-slate-100 p-4 ${
          open ? "items-center gap-3" : "flex-col items-center gap-3"
        }`}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-sm font-bold text-white"
          style={{ backgroundColor: primaryColor }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={empresaNome} className="h-full w-full object-cover" />
          ) : (
            empresaNome.charAt(0).toUpperCase()
          )}
        </div>
        {open && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">{empresaNome}</p>
            <p className="truncate text-xs text-slate-400">{email}</p>
          </div>
        )}

        <div className={`flex items-center gap-1 ${open ? "ml-auto" : "flex-col"}`}>
          {/* "Minha Loja" saiu da lista de navegação (pouco intuitiva como
              item de lista) e virou só este ícone — a página em `marca/` não
              mudou em nada, só o ponto de entrada. Mesmo ícone e mesmo
              destino que o botão de "Configurações" de `simples-top-bar.tsx`,
              pela mesma razão: sem `open &&` porque o modo colapsado esconde
              só o RÓTULO dos itens de navegação (o ícone continua visível), e
              este link precisa da mesma garantia — senão o modo colapsado
              ficaria sem NENHUM caminho até `/admin/marca`. */}
          <Link
            href={`/${slug}/admin/marca`}
            title="Configurações"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={ICONS.configuracoes[0]}
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={ICONS.configuracoes[1]}
              />
            </svg>
          </Link>

          <button
            onClick={() => setOpen(!open)}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:flex"
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
