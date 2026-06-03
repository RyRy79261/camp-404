import { Bell, Megaphone, MessageSquare, type LucideIcon } from "lucide-react";
import type { InboxItem } from "@/lib/notifications";

// Maps a delivery's presentation kind onto its inbox-row glyph. Returns the
// lucide component (not JSX) so the row can frame it in an icon circle.
export function presentationIcon(
  presentation: InboxItem["presentation"],
): LucideIcon {
  if (presentation === "acknowledge") return Megaphone;
  if (presentation === "popup") return MessageSquare;
  return Bell;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Relative timestamp for inbox rows ("Just now", "5m ago", "2d ago"), falling
// back to a locale date past a week. `now` is injectable for deterministic
// tests. Pure — no next/* or I/O.
export function formatRelativeTime(
  date: Date | string | number,
  now: Date = new Date(),
): string {
  const then = date instanceof Date ? date : new Date(date);
  const diff = now.getTime() - then.getTime();
  if (Number.isNaN(diff)) return "";
  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return then.toLocaleDateString();
}
