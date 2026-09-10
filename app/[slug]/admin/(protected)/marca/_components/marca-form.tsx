"use client";

import { useActionState, useState } from "react";
import type { BrandingFormState } from "../actions";
import { ModoInterfacePicker } from "@/app/_components/modo-interface-picker";
import { ImageUploadField } from "@/app/_components/image-upload-field";
import { formatInstagramHandle, formatPhoneInput } from "@/lib/format";

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

export function MarcaForm({
  action,
  empresa,
  nomeUsuario,
}: {
  action: (state: BrandingFormState, formData: FormData) => Promise<BrandingFormState>;
  empresa: EmpresaBranding;
  nomeUsuario: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [nome, setNome] = useState(empresa.nome);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [descricao, setDescricao] = useState(empresa.descricao ?? "");
  const [telefone, setTelefone] = useState(formatPhoneInput(empresa.telefone ?? ""));
  const [instagram, setInstagram] = useState(formatInstagramHandle(empresa.instagram ?? ""));
  const [primaryColor, setPrimaryColor] = useState(empresa.primaryColor);
  const [accentColor, setAccentColor] = useState(empresa.accentColor);
  const [modo, setModo] = useState(empresa.modoInterface);
  const logo = logoPreview ?? empresa.logo ?? "";

  return (
    <form action={formAction} className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-700">Seu perfil</h3>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Seu nome</label>
          <input
            name="nomeUsuario"
            defaultValue={nomeUsuario}
            required
            className="w-full max-w-sm rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
          />
          <p className="mt-1 text-xs text-slate-400">É o nome usado pra te cumprimentar no painel.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-700">Identidade</h3>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Nome da empresa
            </label>
            <input
              name="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Descrição</label>
            <input
              name="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
              placeholder="Ex: Produtos frescos direto pra você!"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Logo</label>
            <input type="hidden" name="logo" defaultValue={empresa.logo ?? ""} />
            <ImageUploadField
              id="logoFile"
              name="logoFile"
              aspectRatio={1}
              inputClassName="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
              previewClassName="hidden"
              alt="Prévia da logo"
              onPreviewChange={setLogoPreview}
            />
            <p className="mt-1 text-xs text-slate-400">Deixe vazio para usar a inicial do nome</p>
            <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" name="removerLogo" />
              Remover logo atual
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Telefone (WhatsApp)
              </label>
              <input
                name="telefone"
                type="tel"
                inputMode="numeric"
                value={telefone}
                onChange={(e) => setTelefone(formatPhoneInput(e.target.value))}
                placeholder="(11) 91234-5678"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Instagram</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
                  @
                </span>
                <input
                  name="instagram"
                  value={instagram}
                  onChange={(e) => setInstagram(formatInstagramHandle(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 py-2 pl-7 pr-3 text-sm focus:outline-none focus:ring-2"
                  placeholder="usuario"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-700">Cores</h3>

          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-600">Cor principal</label>
            <div className="mb-3 flex flex-wrap gap-2">
              {PRESET_COLORS.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => setPrimaryColor(cor)}
                  className="h-8 w-8 rounded-full ring-2 ring-offset-2 transition-transform hover:scale-110"
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
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-10 cursor-pointer rounded-xl border border-slate-200"
              />
              <input
                name="primaryColor"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-600">Cor de destaque</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-10 cursor-pointer rounded-xl border border-slate-200"
              />
              <input
                name="accentColor"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:col-span-2">
          <h3 className="mb-1 font-semibold text-slate-700">Modo de uso</h3>
          <p className="mb-4 text-xs text-slate-500">
            Você pode trocar isso quando quiser, sem perder nenhum dado.
          </p>
          <ModoInterfacePicker value={modo} onChange={setModo} />
          <input type="hidden" name="modoInterface" value={modo} />
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-700">Preview do cabeçalho</h3>
          <div
            className="flex items-center justify-between rounded-xl p-4"
            style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 130%)` }}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 overflow-hidden rounded-xl bg-white/20 flex items-center justify-center font-bold text-white">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  nome.charAt(0).toUpperCase() || "?"
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{nome || "Sua empresa"}</p>
                <p className="text-xs text-white/70">{descricao}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: primaryColor }}
        >
          {pending ? "Salvando..." : state.success ? "Salvo!" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
