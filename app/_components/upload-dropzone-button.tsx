"use client";

import { useRef, type ChangeEvent } from "react";

/**
 * Botão de upload com cara de área clicável (borda tracejada, ícone, texto de
 * ação) — um `<input type="file">` puro renderiza como texto simples do
 * navegador ("Escolher arquivos" / "Nenhum arquivo escolhido"), sem indicar
 * que é interativo. O input real fica oculto (`hidden`, nunca
 * `display:none` via CSS custom) e é acionado pelo clique no botão — mesma
 * técnica usada pelos outros campos de upload do admin
 * (`image-upload-field.tsx`), só com o gatilho visível sendo um botão em vez
 * de um input nativo visível.
 */
export function UploadDropzoneButton({
  onFilesSelected,
  disabled,
  label = "Clique para adicionar fotos",
  hint = "JPG, PNG ou WEBP — pode escolher várias de uma vez",
}: {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length > 0) {
      onFilesSelected(files);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden className="text-xl">
          📷
        </span>
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <span className="text-xs text-slate-400">{hint}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
    </>
  );
}
