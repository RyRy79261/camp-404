import { renderShareImage, SHARE_ALT, SHARE_SIZE } from "@/lib/share-image";

// The same card for X (Twitter).
export const alt = SHARE_ALT;
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default function TwitterImage() {
  return renderShareImage();
}
