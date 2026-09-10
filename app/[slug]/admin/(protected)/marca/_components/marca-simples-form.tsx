"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { BrandingFormState } from "../actions";
import { ModoInterfacePicker } from "@/app/_components/modo-interface-picker";
import { ImageUploadField } from "@/app/_components/image-upload-field";
import { formatInstagramHandle, formatPhoneInput } from "@/lib/format";

const INPUT_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/20";

const PRESET_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#dc2626",
  "#ea580c",
  "#0891b2",
  "#be185d",
  "#1e293b",
];

type EmpresaBranding = {
  nome: string;
  descricao: string | null;
  logo: string | null;
  telefone: string | null;
  instagram: string | null;
  primaryColor: string;
  accentColor: string;
  modoInterface: "SIMPLES" | "COMPLETO";
};

export function MarcaSimplesForm({
  slug,
  action,
  empresa,
  nomeUsuario,
}: {
  slug: string;
  action: (state: BrandingFormState, formData: FormData) => Promise<BrandingFormState>;
  empresa: EmpresaBranding;
  nomeUsuario: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [modo, setModo] = useState(empresa.modoInterface);
  const [telefone, setTelefone] = useState(formatPhoneInput(empresa.telefone ?? ""));
  const [instagram, setInstagram] = useState(formatInstagramHandle(empresa.instagram ?? ""));
  const [primaryColor, setPrimaryColor] = useState(empresa.primaryColor);
  const [accentColor, setAccentColor] = useState(empresa.accentColor);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <Link
        href={`/${slug}/admin`}
        className="w-fit rounded-2xl px-4 py-2 text-lg font-semibold text-slate-500 hover:bg-slate-100"
      >
        ← Voltar
      </Link>

      <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">Configurações</h1>

      <form action={formAction} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="nomeUsuario" className="text-sm font-semibold text-slate-600">
            Seu nome
          </label>
          <input
            id="nomeUsuario"
            name="nomeUsuario"
            required
            defaultValue={nomeUsuario}
            className={INPUT_CLASS}
          />
          <p className="text-sm text-slate-400">É o nome usado pra te cumprimentar na tela inicial.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="nome" className="text-sm font-semibold text-slate-600">
            Nome da loja
          </label>
          <input id="nome" name="nome" required defaultValue={empresa.nome} className={INPUT_CLASS} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="descricao" className="text-sm font-semibold text-slate-600">
            Descrição
          </label>
          <textarea
            id="descricao"
            name="descricao"
            rows={3}
            defaultValue={empresa.descricao ?? ""}
            placeholder="Ex: Produtos frescos direto pra você!"
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="logoFile" className="text-sm font-semibold text-slate-600">
            Foto/logo da loja
          </label>
          <input type="hidden" name="logo" defaultValue={empresa.logo ?? ""} />
          <ImageUploadField
            id="logoFile"
            name="logoFile"
            defaultPreviewUrl={empresa.logo}
            aspectRatio={1}
            inputClassName={INPUT_CLASS}
            previewClassName="h-20 w-20 rounded-2xl object-cover"
            alt="Prévia da logo da loja"
          />
          <p className="text-sm text-slate-400">Deixe vazio pra usar a inicial do nome da loja.</p>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <input type="checkbox" name="removerLogo" />
            Remover logo atual
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="telefone" className="text-sm font-semibold text-slate-600">
            Telefone (WhatsApp)
          </label>
          <input
            id="telefone"
            name="telefone"
            type="tel"
            inputMode="numeric"
            value={telefone}
            onChange={(event) => setTelefone(formatPhoneInput(event.target.value))}
            placeholder="(11) 91234-5678"
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="instagram" className="text-sm font-semibold text-slate-600">
            Instagram
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-lg text-slate-400">
              @
            </span>
            <input
              id="instagram"
              name="instagram"
              placeholder="usuario"
              value={instagram}
              onChange={(event) => setInstagram(formatInstagramHandle(event.target.value))}
              className={`${INPUT_CLASS} pl-9`}
            />
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-slate-600">Cor principal da loja</p>
          <div className="mb-3 flex flex-wrap gap-3">
            {PRESET_COLORS.map((cor) => (
              <button
                key={cor}
                type="button"
                onClick={() => setPrimaryColor(cor)}
                className="h-12 w-12 rounded-2xl ring-2 ring-offset-2 transition-transform hover:scale-110"
                style={
                  {
                    backgroundColor: cor,
                    "--tw-ring-color": primaryColor === cor ? cor : "transparent",
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(event) => setPrimaryColor(event.target.value)}
              className="h-14 w-14 shrink-0 cursor-pointer rounded-2xl border border-slate-200"
            />
            <input
              name="primaryColor"
              value={primaryColor}
              onChange={(event) => setPrimaryColor(event.target.value)}
              className={`${INPUT_CLASS} font-mono`}
            />
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-slate-600">Cor de destaque</p>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={accentColor}
              onChange={(event) => setAccentColor(event.target.value)}
              className="h-14 w-14 shrink-0 cursor-pointer rounded-2xl border border-slate-200"
            />
            <input
              name="accentColor"
              value={accentColor}
              onChange={(event) => setAccentColor(event.target.value)}
              className={`${INPUT_CLASS} font-mono`}
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold text-slate-600">Modo de uso</p>
          <p className="mb-3 text-sm text-slate-500">Você pode trocar isso quando quiser, sem perder nenhum dado.</p>
          <ModoInterfacePicker value={modo} onChange={setModo} />
          <input type="hidden" name="modoInterface" value={modo} />
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-2xl bg-slate-900 py-4 text-lg font-semibold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Salvando..." : state.success ? "Salvo!" : "Salvar alterações"}
        </button>
      </form>
    </div>
  );
}
