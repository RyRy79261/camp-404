import { renderShareImage, SHARE_ALT, SHARE_SIZE } from "@/lib/share-image";

// The link preview on WhatsApp, Telegram, Facebook, Slack and the rest.
export const alt = SHARE_ALT;
export const size = SHARE_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return renderShareImage();
}
