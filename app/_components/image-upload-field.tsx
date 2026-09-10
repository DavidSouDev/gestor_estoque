"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ImageCropModal } from "./image-crop-modal";

/**
 * Substitui um `<input type="file" name="..." />` "seco" nos formulários que
 * enviam a imagem via Server Action (`<form action={formAction}>`): o campo
 * visível apenas escolhe o arquivo (sem `name`, não participa do submit); o
 * recorte roda no modal; o resultado é injetado via `DataTransfer` num input
 * oculto com o `name` real, que é o que o form acaba enviando.
 */
export function ImageUploadField({
  id,
  name,
  defaultPreviewUrl,
  aspectRatio = 1,
  inputClassName,
  previewClassName = "h-24 w-24 rounded-xl object-cover",
  alt,
  onPreviewChange,
}: {
  id: string;
  name: string;
  defaultPreviewUrl?: string | null;
  aspectRatio?: number;
  inputClassName: string;
  previewClassName?: string;
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

  const shownPreview = previewUrl ?? defaultPreviewUrl;

  return (
    <>
      <input ref={hiddenInputRef} type="file" name={name} className="hidden" tabIndex={-1} aria-hidden />

      {shownPreview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shownPreview} alt={alt} className={previewClassName} />
      )}

      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handlePick}
        className={inputClassName}
      />

      {rawFile && (
        <ImageCropModal
          file={rawFile}
          aspectRatio={aspectRatio}
          onCancel={() => setRawFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </>
  );
}
