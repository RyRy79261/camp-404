import {
  renderShareImage,
  SHARE_ALT,
  SHARE_CONTENT_TYPE,
  SHARE_SIZE,
} from "@/lib/og-image";

// Open Graph card consumed by Facebook, Telegram, WhatsApp, LinkedIn,
// iMessage, Slack, Discord, etc.
export const alt = SHARE_ALT;
export const size = SHARE_SIZE;
export const contentType = SHARE_CONTENT_TYPE;

export default function OpengraphImage() {
  return renderShareImage();
}
