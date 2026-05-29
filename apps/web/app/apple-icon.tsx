import { renderSquareIcon } from "@/lib/og-image";

// iOS home-screen icon. Apple requires PNG and ignores transparency, so the
// renderer fills the midnight-violet background edge to edge.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderSquareIcon(180);
}
