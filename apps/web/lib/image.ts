// Client-side image preprocessing before an upload. Runs entirely in the
// browser (canvas), so the server receives an already-normalised picture. No
// external dependency.
//
// - Avatars: cuts the square the member chose in "Fit your photo"
//   (lib/photo-crop.ts; the middle square when there is no choice) and
//   downscales to a fixed edge length, exported as WebP.
// - Builder pictures and receipts (`downscaleForUpload`): the whole picture,
//   no wider or taller than a maximum edge, re-encoded.
//
// A canvas export carries none of the camera's EXIF (GPS position, time,
// make), so the re-encode is also what keeps a photo's location off the
// camp's store. The upload routes strip it again on the server
// (lib/image-metadata.ts) for a file that arrives without being re-encoded.

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

export interface DownscaleOptions {
  /** The longest edge of the result, in pixels. */
  maxEdge: number;
  type: "image/jpeg" | "image/webp";
  /** Encoder quality 0–1. */
  quality: number;
}

/** A builder questionnaire's picture: up to 1600 px, WebP. */
export const BUILDER_IMAGE_UPLOAD: DownscaleOptions = {
  maxEdge: 1600,
  type: "image/webp",
  quality: 0.85,
};

/** A receipt or a proof of payment: up to 2000 px (the small print stays
 * readable), JPEG, which every reader opens. */
export const RECEIPT_UPLOAD: DownscaleOptions = {
  maxEdge: 2000,
  type: "image/jpeg",
  quality: 0.85,
};

/** A bug report's screenshot over the upload limit: up to 2560 px (a laptop
 * screen at full size, its words still readable), WebP. */
export const SCREENSHOT_UPLOAD: DownscaleOptions = {
  maxEdge: 2560,
  type: "image/webp",
  quality: 0.85,
};

const REENCODABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * `file` re-encoded no larger than `maxEdge` on its longest side, without its
 * metadata, keeping its name (with the new type's extension). The camera's
 * orientation is applied to the pixels first, so the photo stays the right
 * way up once its EXIF is gone.
 *
 * Anything that is not a JPEG, PNG or WebP (a PDF), and any picture the
 * browser cannot decode, is handed back as it is: the server checks it and
 * strips it. So is a re-encode that came out bigger than the original (a
 * small screenshot), since the server strips that one's metadata too.
 */
export async function downscaleForUpload(
  file: File,
  { maxEdge, type, quality }: DownscaleOptions,
): Promise<File> {
  if (!REENCODABLE.has(file.type) || typeof createImageBitmap !== "function") {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    // "from-image" turns the photo the way its EXIF orientation says (the
    // default in today's browsers, said outright for older ones).
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    const encode = (as: DownscaleOptions["type"]) => {
      if (as === "image/jpeg") {
        // JPEG has no transparency: a PNG's clear parts become white, not black.
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      return new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, as, quality),
      );
    };
    let blob = await encode(type);
    // Safari before 17 cannot encode WebP and quietly hands back a PNG.
    if (blob && blob.type !== type && type !== "image/jpeg") {
      blob = await encode("image/jpeg");
    }
    if (!blob || (blob.type !== "image/jpeg" && blob.type !== "image/webp")) {
      return file;
    }
    if (blob.size >= file.size && scale === 1) return file;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const name = file.name.replace(/\.[^./\\]*$/, "") || "picture";
    return new File([blob], `${name}.${ext}`, {
      type: blob.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

async function loadBitmap(
  file: File,
): Promise<ImageBitmap & { close?: () => void }> {
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
