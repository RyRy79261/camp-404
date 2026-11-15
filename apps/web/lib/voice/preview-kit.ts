import type { McpScope } from "../mcp/scope";
import { readNames } from "./reads";

// The shared shape and helpers of a voice preview (lib/voice/previews.ts and
// each domain's previews-<domain>.ts): what the captain reads before Do.

export interface Preview {
  sentence: string;
  facts: string;
  /**
   * What a write that replaces a whole field will leave there, one line per
   * field ("Text: …"), so the captain reads the new value before Do (owner,
   * audit 2 voice-mcp-2). Shown, never sealed: Do runs the sealed arguments.
   */
  change?: string[];
  path: string | null;
  /** The arguments to run with, compare-and-set values filled in. */
  args: Record<string, unknown>;
  /** What the action touches, so a later action on the same can wait for it. */
  keys: string[];
  /** Keys of earlier actions this one needs to have worked (default `keys`). */
  needs?: string[];
  /** It cannot be done as things stand, and why. */
  blocked?: string;
}

export interface PreviewCtx {
  scope: McpScope;
  now: Date;
}

export type Args = Record<string, unknown>;
export type PreviewFn = (args: Args, ctx: PreviewCtx) => Promise<Preview>;

export const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const quote = (s: string) => `“${s}”`;

export const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
/** "2027-04-28" as "Wed 28 Apr". */
export function dayLabel(key: string | null | undefined): string {
  if (!key) return "no date";
  const d = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? key : DAY.format(d).replace(",", "");
}
export function dayRange(start: string | null, end: string | null): string {
  if (!start) return "no days set";
  return start === end || !end
    ? dayLabel(start)
    : `${dayLabel(start)} – ${dayLabel(end)}`;
}

/** The longest a value is shown in a row before it is cut. */
export const SHOWN_MAX = 300;

/**
 * A value as the row shows it: one line, quoted when it is words, cut after
 * SHOWN_MAX characters with how much more there is.
 */
export function shown(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.length === 0
      ? "(none)"
      : value.map((v) => (typeof v === "string" ? v : shown(v))).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= SHOWN_MAX) return quote(text);
  const more = text.length - SHOWN_MAX;
  return `${quote(`${text.slice(0, SHOWN_MAX).trimEnd()}…`)} (${more} more character${more === 1 ? "" : "s"})`;
}

/** A list as the row shows it, each item on its own after a bullet. */
export function listed(items: readonly string[]): string {
  return items.length === 0 ? "(none)" : items.join(" · ");
}

export async function personName(id: unknown): Promise<string> {
  const names = await readNames([str(id)]);
  return names.get(str(id)) ?? "someone not on the roster";
}

/** Blocked rows still need a sentence the captain can read. */
export function blocked(
  sentence: string,
  reason: string,
  args: Args,
  path: string | null,
): Preview {
  return { sentence, facts: "", path, args, keys: [], blocked: reason };
}
