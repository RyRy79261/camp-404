import { Bell, Megaphone, MessageSquare, type LucideProps } from "lucide-react";
import type { InboxItem } from "@/lib/notifications";

// The inbox-row glyph for a delivery's presentation kind, as an element: a
// fixed component per kind (`presentationIcon` in ./presentation-meta names
// the same mapping), so no component is picked during a parent's render.
export function PresentationIcon({
  presentation,
  ...props
}: { presentation: InboxItem["presentation"] } & LucideProps) {
  if (presentation === "acknowledge") return <Megaphone {...props} />;
  if (presentation === "popup") return <MessageSquare {...props} />;
  return <Bell {...props} />;
}
