import {
  renderShareImage,
  SHARE_ALT,
  SHARE_CONTENT_TYPE,
  SHARE_SIZE,
} from "@/lib/og-image";

// X / Twitter uses its own image tag (summary_large_image) — same artwork.
export const alt = SHARE_ALT;
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;

export default function TwitterImage() {
  return renderShareImage();
}
