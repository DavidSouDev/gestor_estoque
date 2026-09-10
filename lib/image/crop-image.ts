export type PixelArea = { x: number; y: number; width: number; height: number };

const MAX_OUTPUT_DIMENSION = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Não foi possível carregar a imagem.")));
    image.src = src;
  });
}

/**
 * `mimeType` só é preservado quando já está entre os formatos aceitos pelo
 * upload (`lib/storage/r2.ts`) — mantém o `File` resultante compatível com a
 * validação de servidor sem precisar duplicar a lista aqui.
 */
export async function getCroppedImageFile(
  imageSrc: string,
  area: PixelArea,
  fileName: string,
  mimeType: string
): Promise<File> {
  const image = await loadImage(imageSrc);
  const outputType = ["image/jpeg", "image/png", "image/webp"].includes(mimeType)
    ? mimeType
    : "image/jpeg";

  const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(area.width, area.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width * scale);
  canvas.height = Math.round(area.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Não foi possível processar a imagem.");
  }

  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Falha ao gerar a imagem recortada."))),
      outputType,
      0.9
    );
  });

  return new File([blob], fileName, { type: blob.type });
}
