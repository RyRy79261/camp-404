// Client-side image preprocessing for avatar uploads. Cuts the square the
// member chose in "Fit your photo" (lib/photo-crop.ts; the middle square when
// there is no choice) and downscales to a fixed edge length, exporting WebP to keep
// uploads small. Runs entirely in the browser (canvas) so the server only
// ever receives an already-normalised image. No external dependency.

import { toSourceRect, type SquareCrop } from "./photo-crop";

export interface CropResizeOptions {
  /** Output edge length in CSS pixels. Defaults to 512. */
  size?: number;
  /** WebP quality 0–1. Defaults to 0.85. */
  quality?: number;
}

/**
 * Cut `crop` (source pixels; the middle square when absent) from `file` and
 * resize it to `size`×`size`, returning a WebP Blob. A crop that strays off
 * the image is pulled back inside it. Rejects if the file can't be decoded as
 * an image.
 */
export async function cropResizeToSquare(
  file: File,
  crop?: SquareCrop,
  { size = 512, quality = 0.85 }: CropResizeOptions = {},
): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  try {
    const rect = toSourceRect(crop, {
      width: bitmap.width,
      height: bitmap.height,
    });
    const edge = rect.size;
    const sx = rect.x;
    const sy = rect.y;

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
