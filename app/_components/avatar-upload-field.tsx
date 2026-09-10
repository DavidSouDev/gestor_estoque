"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ImageCropModal } from "./image-crop-modal";

/**
 * Variante em avatar de `ImageUploadField`: em vez de um `<input type="file">`
 * visível, o próprio quadrado clicável É o gatilho (via `<label htmlFor>`
 * envolvendo um input `sr-only`) — pensado para telas como o cadastro, onde a
 * imagem de perfil da empresa é o primeiro elemento do formulário, não um
 * campo a mais. Mesmo mecanismo de recorte + input oculto com `DataTransfer`
 * de `ImageUploadField`; só a apresentação do gatilho muda.
 */
export function AvatarUploadField({
  id,
  name,
  aspectRatio = 1,
  sizeClassName = "h-16 w-16",
  placeholder,
  alt,
  onPreviewChange,
}: {
  id: string;
  name: string;
  aspectRatio?: number;
  sizeClassName?: string;
  placeholder: ReactNode;
  alt: string;
  onPreviewChange?: (previewUrl: string) => void;
}) {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (file) setRawFile(file);
  }

  function handleCropConfirm(croppedFile: File) {
    setRawFile(null);
    const url = URL.createObjectURL(croppedFile);
    setPreviewUrl(url);
    onPreviewChange?.(url);

    if (hiddenInputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(croppedFile);
      hiddenInputRef.current.files = dataTransfer.files;
    }
  }

  return (
    <div className="mx-auto flex flex-col items-center gap-2">
      <input ref={hiddenInputRef} type="file" name={name} className="hidden" tabIndex={-1} aria-hidden />

      <label
        htmlFor={id}
        className={`group relative flex ${sizeClassName} cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-slate-800 text-2xl font-bold text-white shadow-lg transition-opacity hover:opacity-90`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={alt} className="h-full w-full object-cover" />
        ) : (
          placeholder
        )}

        {/* Badge sempre visível (não só no hover) — em touch não existe hover
            para sinalizar que o quadrado é clicável. */}
        <span className="absolute bottom-0 right-0 flex h-5 w-5 translate-x-1/4 translate-y-1/4 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-[10px] leading-none text-white">
          ✎
        </span>

        <input
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePick}
          className="sr-only"
        />
      </label>

      {rawFile && (
        <ImageCropModal
          file={rawFile}
          aspectRatio={aspectRatio}
          onCancel={() => setRawFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
