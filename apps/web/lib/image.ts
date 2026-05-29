// Client-side image preprocessing for avatar uploads. Centre-crops to a
// square and downscales to a fixed edge length, exporting WebP to keep
// uploads small. Runs entirely in the browser (canvas) so the server only
// ever receives an already-normalised image. No external dependency.

export interface CropResizeOptions {
  /** Output edge length in CSS pixels. Defaults to 512. */
  size?: number;
  /** WebP quality 0–1. Defaults to 0.85. */
  quality?: number;
}

/**
 * Centre-crop `file` to a square and resize to `size`×`size`, returning a
 * WebP Blob. Rejects if the file can't be decoded as an image.
 */
export async function cropResizeToSquare(
  file: File,
  { size = 512, quality = 0.85 }: CropResizeOptions = {},
): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  try {
    const edge = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - edge) / 2;
    const sy = (bitmap.height - edge) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob) throw new Error("Failed to encode image");
    return blob;
  } finally {
    bitmap.close?.();
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap & { close?: () => void }> {
  // createImageBitmap is the fast path and is widely supported; fall back
  // to an <img> + object URL where it isn't.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not load image"));
      el.src = url;
    });
    // Shim the ImageBitmap shape we use (width/height/drawImage source).
    return Object.assign(img, {
      close: () => URL.revokeObjectURL(url),
    }) as unknown as ImageBitmap & { close?: () => void };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}
