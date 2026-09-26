"use client";

import { OsAvatar } from "./os-avatar";

/**
 * The lead line under the member's name (owner, 2026-09-25: one person can
 * lead many teams): the team's name for exactly one, a count for more, and
 * nothing for none.
 */
export function leadsLine(labels: readonly string[]): string | null {
  if (labels.length === 0) return null;
  return labels.length === 1
    ? `Leads ${labels[0]}`
    : `Leads ${labels.length} teams`;
}

/** The chip's name, read out: who, their rank, and every team they lead. */
export function accountChipName(
  name: string,
  rank: string,
  leads: readonly string[],
): string {
  const led = leads.length > 0 ? `. Leads ${leads.join(", ")}` : "";
  return `${name}, ${rank}${led}. Open My account`;
}

/**
 * The account chip at the top right (the approved prototype's header): the
 * member's initials, their name and, for a lead, "Leads Kitchen" or "Leads 3
 * teams" under it, then a solid magenta rank chip. The full list of led teams
 * shows in a tooltip on hover and on keyboard focus, and is in the chip's
 * accessible name. All of it is the member's own, drawn from what the server
 * sent; none of it decides anything. A press opens My account. On a phone
 * only the initials and the rank show.
 */
export function AccountChip({
  name,
  rank,
  leads,
  onOpen,
}: {
  name: string;
  rank: string;
  /** The teams they lead this year, by name, in the camp's order. */
  leads: readonly string[];
  onOpen: () => void;
}) {
  const line = leadsLine(leads);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={accountChipName(name, rank, leads)}
      data-os-account
      className="group relative flex h-8 shrink-0 select-none items-center gap-2 border border-os-line bg-os-panel pl-1 pr-2 text-left outline-none hover:border-os-primary focus-visible:border-os-primary"
    >
      <OsAvatar name={name} />
      <span
        aria-hidden
        className="flex min-w-0 flex-col leading-tight max-md:hidden"
      >
        <span className="max-w-48 truncate text-xs text-os-fg">{name}</span>
        {line && (
          <span className="max-w-48 truncate text-[10px] text-os-muted">
            {line}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className="inline-flex h-5 shrink-0 items-center border border-os-primary bg-os-primary px-1.5 font-pixel text-[10px] uppercase leading-none tracking-wide text-os-bg"
      >
        {rank}
      </span>
      {leads.length > 1 && (
        // The full list, on hover and on focus. Hidden from the reader: the
        // chip's own name already carries every team.
        <span
          aria-hidden
          data-os-tooltip
          className="pointer-events-none absolute right-0 top-full z-[95] mt-1 hidden w-max max-w-72 select-text border border-os-line bg-os-panel px-2 py-1 text-xs text-os-fg shadow-[4px_4px_0_0_rgb(0_0_0/0.4)] group-hover:block group-focus-visible:block"
        >
          Leads {leads.join(", ")}
        </span>
      )}
    </button>
  );
}
