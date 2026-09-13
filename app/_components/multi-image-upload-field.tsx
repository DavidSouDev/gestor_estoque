"use client";

import { useEffect, useState } from "react";
import { ImageCropModal } from "./image-crop-modal";
import { UploadDropzoneButton } from "./upload-dropzone-button";

/**
 * Campo de fotos do produto: aceita uma ou várias de uma vez.
 *
 * - Só a PRIMEIRA foto, escolhida sozinha (nenhuma outra ainda selecionada),
 *   passa pelo recorte 1:1 — mantém a experiência de "uma foto de capa"
 *   intacta pro caso comum.
 * - Duas ou mais de uma vez (ou adicionar mais depois da primeira) pulam o
 *   recorte e vão direto pro upload: cada foto vira uma variante do produto
 *   (ver `produtoVarianteService.sincronizarAutomaticas`), e forçar o mesmo
 *   enquadramento em todas não ajuda — quem escolhe qual "olhar" é o cliente
 *   final no catálogo.
 *
 * Upload é IMEDIATO por arquivo (nunca em lote): Next.js despacha Server
 * Actions do mesmo cliente uma de cada vez, então a lista é enviada num loop
 * sequencial. Se `fieldName` for passado, cada URL atual vira um
 * `<input type="hidden">` com esse nome — é assim que este campo participa
 * do submit de um `<form action={formAction}>` comum (mesmo padrão do resto
 * do admin), sem precisar que o componente pai gerencie o estado.
 */
export function MultiImageUploadField({
  slug,
  uploadAction,
  initialUrls = [],
  fieldName,
  onChange,
}: {
  slug: string;
  uploadAction: (slug: string, formData: FormData) => Promise<{ url?: string; error?: string }>;
  initialUrls?: string[];
  fieldName?: string;
  onChange?: (urls: string[]) => void;
}) {
  const [fotos, setFotos] = useState<string[]>(initialUrls);
  const [rawFoto, setRawFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    onChange?.(fotos);
  }, [fotos, onChange]);

  async function enviarFotos(files: File[]) {
    setErro(null);
    setEnviando(true);

    // Sequencial de propósito — ver nota da doc do componente.
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      const resultado = await uploadAction(slug, formData);

      if (resultado.error) {
        setErro(resultado.error);
        continue;
      }

      if (resultado.url) {
        const url = resultado.url;
        setFotos((atual) => [...atual, url]);
      }
    }

    setEnviando(false);
  }

  function handleFilesSelected(files: File[]) {
    if (fotos.length === 0 && files.length === 1) {
      setRawFoto(files[0]);
      return;
    }

    void enviarFotos(files);
  }

  async function handleCropConfirm(croppedFile: File) {
    setRawFoto(null);
    await enviarFotos([croppedFile]);
  }

  function removerFoto(url: string) {
    setFotos((atual) => atual.filter((foto) => foto !== url));
  }

  return (
    <div>
      {fotos.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-3">
          {fotos.map((foto) => (
            <div key={foto} className="flex flex-col items-center gap-1">
              {fieldName && <input type="hidden" name={fieldName} value={foto} />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto} alt="" className="h-20 w-20 rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => removerFoto(foto)}
                className="text-xs font-semibold text-slate-500 underline"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}

      <UploadDropzoneButton onFilesSelected={handleFilesSelected} disabled={enviando} />

      {fotos.length >= 2 && (
        <p className="mt-2 text-xs text-emerald-600">
          {fotos.length} fotos escolhidas — cada uma vira uma variante que o cliente pode selecionar
          no catálogo.
        </p>
      )}
      {enviando && <p className="mt-2 text-xs text-slate-500">Enviando...</p>}
      {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}

      {rawFoto && (
        <ImageCropModal
          file={rawFoto}
          aspectRatio={1}
          onCancel={() => setRawFoto(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
