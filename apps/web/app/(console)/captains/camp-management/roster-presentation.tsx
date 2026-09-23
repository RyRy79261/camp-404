import type { ReactNode } from "react";
import { X } from "lucide-react";
import { humanizeKey, initialsFrom } from "@camp404/core";
import { Badge, type BadgeProps } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { cn } from "@camp404/ui/lib/utils";
import {
  PUBLIC_STANDING_LABEL,
  type PublicStanding,
  type RosterStatus,
} from "@/lib/camp-roster";
import { COUNTRIES } from "@/lib/countries";

// Shared presentational helpers for the roster (the AfrikaBurn console's
// badge vocabulary): the member avatar, the three-rank role badge, team chips
// and the per-status badge. Pure presentation — no state, no I/O — so the
// row/list/profile components stay thin. Identity colours (avatar tints, team
// dots) are intentional brand hex, not semantic status tokens.

// The active team list is no longer hardcoded here — it comes from the camp
// config (`getTeamsConfig`), resolved server-side and threaded into the toolbar
// filter. `teamLabel` below stays as the humanizer for rendering a stored enum
// key as a chip (and it seeds the config's default labels).

/**
 * Humanise a team enum value: "art_and_activities" → "Art and Activities".
 * A thin alias over the shared humanizer in @camp404/core: the same fallback
 * `audienceLabel` (@camp404/db/camp-config) applies when a key has no config
 * entry, so a chip here and a send target there can never read differently.
 * This file is bundled client-side, which is why the shared rule lives in core
 * (pure, DB-free) rather than beside the config it backstops.
 */
export const teamLabel = humanizeKey;

// A small, stable identity palette (avatar and team hues). Picked by hashing an
// id so a member keeps the same tint across renders.
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

/** A stable per-member avatar tint (the initials sit on this). */
export function avatarTintFor(id: string): string {
  return (
    IDENTITY_TINTS[hashIndex(id, IDENTITY_TINTS.length)] ?? IDENTITY_TINTS[0]
  );
}

/** A stable dot colour for a team chip. */
export function teamColorFor(team: string): string {
  return (
    IDENTITY_TINTS[hashIndex(team, IDENTITY_TINTS.length)] ?? IDENTITY_TINTS[0]
  );
}

// The roster row carries the resolved country *name* (not the ISO code), so to
// draw a flag glyph we reverse-resolve the name back to its alpha-2 code —
// purely presentational, no view-model change.
const CODE_BY_NAME = new Map(COUNTRIES.map((c) => [c.label, c.value]));

/** The flag emoji for a resolved country name, or "" when it can't be mapped. */
export function countryFlag(name: string | null): string {
  const code = name ? CODE_BY_NAME.get(name) : undefined;
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/**
 * A member's overall standing (spec §4) → Badge variant, the way AfrikaBurn's
 * `StatusBadge` maps a registration: cleared is success, rejected is
 * destructive, a decision waiting on a captain is the primary tint, an
 * unfinished required action is a warning, and onboarding is quiet.
 */
const STATUS_VARIANT: Record<RosterStatus, BadgeVariant> = {
  ready: "success",
  rejected: "destructive",
  awaiting_approval: "default",
  pending: "warning",
  onboarding: "outline",
};

/**
 * The standing pill a MEMBER sees on someone who is not (yet) in camp: the
 * primary tint for an applicant waiting on a captain, destructive for a
 * declined one. It reads the same as the captain's equivalent status badge, by
 * taking the same two variants — the member's version simply cannot express
 * onboarding progress or outstanding actions, because `PublicStanding` has no
 * value for them.
 */
const STANDING_VARIANT: Record<PublicStanding, BadgeVariant> = {
  pending: STATUS_VARIANT.awaiting_approval,
  rejected: STATUS_VARIANT.rejected,
};

/** A standing pill for the member roster ("Pending" / "Declined"). */
export function StandingBadge({
  standing,
  className,
}: {
  standing: PublicStanding;
  className?: string;
}) {
  return (
    <Badge variant={STANDING_VARIANT[standing]} className={className}>
      {PUBLIC_STANDING_LABEL[standing]}
    </Badge>
  );
}

/** A roster status pill (captain view — the full triage vocabulary). */
export function RosterStatusBadge({
  status,
  label,
  className,
}: {
  status: RosterStatus;
  label: string;
  className?: string;
}) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {label}
    </Badge>
  );
}

export interface Role {
  emoji: string;
  label: string;
  variant: BadgeVariant;
}

/**
 * The roster's three-rank role badge (presentation only — the store has just
 * captain|member; Lead is derived from team `is_lead`). Captain 🦩, Lead 🪄,
 * Member 🐱.
 */
export function roleFor(rank: "captain" | "member", isLead: boolean): Role {
  if (rank === "captain")
    return { emoji: "🦩", label: "Captain", variant: "default" };
  if (isLead) return { emoji: "🪄", label: "Lead", variant: "secondary" };
  return { emoji: "🐱", label: "Member", variant: "outline" };
}

/** An initialled round avatar on the member's identity tint. */
export function RosterAvatar({
  name,
  id,
  px,
  className,
}: {
  name: string;
  id: string;
  px: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none text-white",
        className,
      )}
      style={{
        width: px,
        height: px,
        fontSize: Math.round(px * 0.38),
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
    <Badge variant="outline" className="gap-1.5 text-foreground">
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: teamColorFor(team) }}
      />
      {label ?? teamLabel(team)}
    </Badge>
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
    <Badge variant={role.variant} className={cn("gap-1.5", className)}>
      <span aria-hidden className="text-sm leading-none">
        {role.emoji}
      </span>
      {role.label}
    </Badge>
  );
}

/**
 * The head of a member's profile panel, laid out like the AfrikaBurn review
 * header: an eyebrow, the name with its badges inline, then a muted meta line
 * (@handle · country) and the team chips. Paints from the roster row, so it is
 * on screen before the detail loads. `badges` goes beside the name (the
 * captain view's approval badge). The close control sits top right.
 */
export function ProfileHead({
  row,
  index,
  teamLabels,
  badges,
  onClose,
}: {
  row: {
    id: string;
    displayName: string;
    handle: string | null;
    country: string | null;
    rank: "captain" | "member";
    isLead: boolean;
    teams: readonly string[];
  };
  /** The member's stable position in the full roster. */
  index: number;
  teamLabels: Record<string, string>;
  badges?: ReactNode;
  onClose: () => void;
}) {
  const flag = countryFlag(row.country);
  return (
    <header className="flex items-start gap-4">
      <RosterAvatar name={row.displayName} id={row.id} px={56} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">
          Record #{String(index).padStart(2, "0")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            {row.displayName}
          </h2>
          {badges}
          <RoleBadge rank={row.rank} isLead={row.isLead} />
        </div>
        {(row.handle || row.country) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {row.handle && (
              // The handle is a Telegram username: open the chat with them.
              <a
                href={`https://t.me/${row.handle}`}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                @{row.handle}
              </a>
            )}
            {row.handle && row.country && <span aria-hidden>·</span>}
            {row.country && (
              <span className="inline-flex items-center gap-1.5">
                {flag && <span aria-hidden>{flag}</span>}
                {row.country}
              </span>
            )}
          </div>
        )}
        {row.teams.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {row.teams.map((team) => (
              <TeamBadge key={team} team={team} label={teamLabels[team]} />
            ))}
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label="Close profile"
        className="-mr-2 -mt-2 shrink-0"
      >
        <X aria-hidden />
      </Button>
    </header>
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
    // Both the ≥md table and the <md card list render a trigger with this id;
    // only one is visible per breakpoint. Focus the VISIBLE one — focusing the
    // hidden (display:none) variant is a silent no-op that drops focus to
    // <body>.
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
