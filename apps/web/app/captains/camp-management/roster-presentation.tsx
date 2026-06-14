import { initialsFrom } from "@camp404/core";
import { cn } from "@camp404/ui/lib/utils";
import type { RosterStatus } from "@/lib/camp-roster";
import { COUNTRIES } from "@/lib/countries";

// Shared presentational helpers for the terminal-console roster (board S17,
// iteration B): the mono-tinted member avatar, the three-rank role badge, team
// chips and the per-status colour bar. Pure presentation — no state, no I/O — so
// the row/list/profile components stay thin. Identity colours (avatar tints,
// team dots) are intentional brand hex, not semantic status tokens.

// The active team list is no longer hardcoded here — it comes from the camp
// config (`getTeamsConfig`), resolved server-side and threaded into the toolbar
// filter. `teamLabel` below stays as the humanizer for rendering a stored enum
// key as a chip (and it seeds the config's default labels).

/** Humanise a team enum value: "art_and_activities" → "Art and Activities". */
export function teamLabel(team: string): string {
  return team
    .split("_")
    .map((w, i) =>
      i > 0 && (w === "and" || w === "of")
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

// A small, stable identity palette (the board's avatar/team hues). Picked by
// hashing an id so a member keeps the same tint across renders.
const IDENTITY_TINTS = [
  "#ff008c",
  "#00dcff",
  "#751888",
  "#e0a800",
  "#3fd07a",
  "#ff8c42",
  "#7c5cff",
  "#f83e5a",
] as const;

function hashIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** A stable per-member avatar tint (mono initials sit on this). */
export function avatarTintFor(id: string): string {
  return IDENTITY_TINTS[hashIndex(id, IDENTITY_TINTS.length)] ?? IDENTITY_TINTS[0];
}

/** A stable dot colour for a team chip. */
export function teamColorFor(team: string): string {
  return (
    IDENTITY_TINTS[hashIndex(team, IDENTITY_TINTS.length)] ?? IDENTITY_TINTS[0]
  );
}

// The roster row carries the resolved country *name* (not the ISO code), so to
// draw the board's flag glyph we reverse-resolve the name back to its alpha-2
// code — purely presentational, no view-model change.
const CODE_BY_NAME = new Map(COUNTRIES.map((c) => [c.label, c.value]));

/** The flag emoji for a resolved country name, or "" when it can't be mapped. */
export function countryFlag(name: string | null): string {
  const code = name ? CODE_BY_NAME.get(name) : undefined;
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

/**
 * The 4px row status bar colour, by overall standing (spec §4): green when
 * cleared/ready, destructive when rejected/blocked, accent otherwise
 * (onboarding / awaiting a decision / action needed).
 */
export function statusBarClass(status: RosterStatus): string {
  switch (status) {
    case "ready":
      return "bg-success";
    case "rejected":
      return "bg-destructive";
    default:
      return "bg-accent";
  }
}

export interface Role {
  emoji: string;
  label: string;
  className: string;
}

/**
 * The roster's three-rank role badge (presentation only — the store has just
 * captain|member; Lead is derived from team `is_lead`). Captain 🦩, Lead 🪄,
 * Member 🐱.
 */
export function roleFor(rank: "captain" | "member", isLead: boolean): Role {
  if (rank === "captain")
    return { emoji: "🦩", label: "Captain", className: "text-primary" };
  if (isLead)
    return { emoji: "🪄", label: "Lead", className: "text-secondary-foreground" };
  return { emoji: "🐱", label: "Member", className: "text-muted-foreground" };
}

/** A mono-initialled avatar tile on the member's identity tint. */
export function RosterAvatar({
  name,
  id,
  px,
  radius = 6,
  className,
}: {
  name: string;
  id: string;
  px: number;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-mono font-bold leading-none text-white",
        className,
      )}
      style={{
        width: px,
        height: px,
        borderRadius: radius,
        fontSize: Math.round(px * 0.4),
        backgroundColor: avatarTintFor(id),
      }}
    >
      {initialsFrom(name)}
    </span>
  );
}

/**
 * A team membership chip — coloured dot + name. Prefers the camp config's label
 * (so a captain's relabel shows here too); falls back to the humanizer for keys
 * the caller didn't resolve (e.g. a profile rendered without the label map).
 */
export function TeamBadge({ team, label }: { team: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 font-mono text-micro font-bold text-foreground">
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: teamColorFor(team) }}
      />
      {label ?? teamLabel(team)}
    </span>
  );
}

/** The role badge as rendered in a row / profile head (emoji + label). */
export function RoleBadge({
  rank,
  isLead,
  className,
}: {
  rank: "captain" | "member";
  isLead: boolean;
  className?: string;
}) {
  const role = roleFor(rank, isLead);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden className="text-[15px] leading-none">
        {role.emoji}
      </span>
      <span className={cn("text-sm font-semibold", role.className)}>
        {role.label}
      </span>
    </span>
  );
}

/**
 * Return keyboard focus to the roster row control that opened a profile panel,
 * after the panel unmounts (a11y: focus must not fall to `<body>`). The row
 * controls carry `data-roster-trigger={id}`; called from the island's close
 * handler once selection clears.
 */
export function focusRosterTrigger(id: string): void {
  if (typeof document === "undefined") return;
  requestAnimationFrame(() => {
    // Both the ≥sm table and the <sm list render a trigger with this id; only one
    // is visible per breakpoint. Focus the VISIBLE one — focusing the hidden
    // (display:none) variant is a silent no-op that drops focus to <body>.
    const selector = `[data-roster-trigger="${CSS.escape(id)}"]`;
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    );
    const target =
      candidates.find((el) => el.getClientRects().length > 0) ??
      candidates[0] ??
      null;
    target?.focus();
  });
}
