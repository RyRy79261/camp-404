// The maths behind "Fit your photo" (issue #276). A member's photo sits under
// a fixed round frame; they move it and zoom it, and the square around the
// circle is what gets cut and resized (lib/image.ts). Everything here is in
// the SOURCE image's pixels, so the view's size never matters except when a
// drag in screen pixels is turned into a move of the photo.
//
// The one rule: the square never leaves the photo, so the circle never shows
// a gap. Every function returns a crop that has been through clampCrop.

/** A square of the source image, in its own pixels. */
export interface SquareCrop {
  x: number;
  y: number;
  size: number;
}

/** The source image's natural size. */
export interface ImageSize {
  width: number;
  height: number;
}

/** Zoom 1 is the photo's short side filling the circle; this is the most. */
export const MAX_ZOOM = 3;
export const MIN_ZOOM = 1;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The largest square the photo has: its short side. */
function fullSize(image: ImageSize): number {
  return Math.min(image.width, image.height);
}

/**
 * Pull a crop back inside the photo: its size between the short side (zoom 1)
 * and the short side over MAX_ZOOM, and its corner so the square stays whole.
 */
export function clampCrop(crop: SquareCrop, image: ImageSize): SquareCrop {
  const full = fullSize(image);
  const size = clampNumber(crop.size, full / MAX_ZOOM, full);
  return {
    size,
    x: clampNumber(crop.x, 0, image.width - size),
    y: clampNumber(crop.y, 0, image.height - size),
  };
}

/** The opening crop: zoom 1, centred (what the app used to cut silently). */
export function initialCrop(image: ImageSize): SquareCrop {
  const size = fullSize(image);
  return {
    size,
    x: (image.width - size) / 2,
    y: (image.height - size) / 2,
  };
}

/** The zoom a crop stands at, 1 to MAX_ZOOM. */
export function zoomOf(crop: SquareCrop, image: ImageSize): number {
  return fullSize(image) / crop.size;
}

/** Zoom to `zoom`, keeping the middle of the circle on the same spot. */
export function zoomTo(
  crop: SquareCrop,
  zoom: number,
  image: ImageSize,
): SquareCrop {
  const size = fullSize(image) / clampNumber(zoom, MIN_ZOOM, MAX_ZOOM);
  const cx = crop.x + crop.size / 2;
  const cy = crop.y + crop.size / 2;
  return clampCrop({ size, x: cx - size / 2, y: cy - size / 2 }, image);
}

/**
 * Move the photo by (dx, dy) screen pixels in a frame `viewSize` pixels wide.
 * The photo moving right means the square moves left over it.
 */
export function panBy(
  crop: SquareCrop,
  dx: number,
  dy: number,
  viewSize: number,
  image: ImageSize,
): SquareCrop {
  if (viewSize <= 0) return clampCrop(crop, image);
  const perPixel = crop.size / viewSize;
  return clampCrop(
    { size: crop.size, x: crop.x - dx * perPixel, y: crop.y - dy * perPixel },
    image,
  );
}

/**
 * Where the photo goes inside a square view of any size, as percentages of
 * that view: the frame, the previews and the saved file all agree.
 */
export function cropToViewPercent(
  crop: SquareCrop,
  image: ImageSize,
): { left: number; top: number; width: number; height: number } {
  return {
    left: (-crop.x / crop.size) * 100,
    top: (-crop.y / crop.size) * 100,
    width: (image.width / crop.size) * 100,
    height: (image.height / crop.size) * 100,
  };
}

/**
 * The whole-pixel square to cut from the source, for canvas drawImage. Any
 * crop (a stale one, or none) comes back inside the image.
 */
export function toSourceRect(
  crop: SquareCrop | undefined,
  image: ImageSize,
): SquareCrop {
  const safe = clampCrop(crop ?? initialCrop(image), image);
  const size = Math.max(1, Math.floor(safe.size));
  return {
    size,
    x: clampNumber(Math.round(safe.x), 0, image.width - size),
    y: clampNumber(Math.round(safe.y), 0, image.height - size),
  };
}
