"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { getCroppedImageFile } from "@/lib/image/crop-image";

export function ImageCropModal({
  file,
  aspectRatio = 1,
  onCancel,
  onConfirm,
}: {
  file: File;
  aspectRatio?: number;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const imageUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const handleCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;

    setProcessing(true);
    setError(null);

    try {
      const croppedFile = await getCroppedImageFile(imageUrl, croppedAreaPixels, file.name, file.type);
      onConfirm(croppedFile);
    } catch {
      setError("Não foi possível processar a imagem. Tente novamente.");
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4 sm:items-center sm:justify-center">
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-700">Ajustar imagem</h2>

        <div className="relative h-72 w-full overflow-hidden rounded-xl bg-slate-100 sm:h-80">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspectRatio}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="flex-1"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={processing || !croppedAreaPixels}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {processing ? "Processando..." : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
