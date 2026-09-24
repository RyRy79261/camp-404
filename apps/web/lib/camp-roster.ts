import type { CampManagementMember } from "@camp404/db/roster";
import type { ParticipationStatus } from "@camp404/types";
import { COUNTRIES } from "./countries";
import { requiredActionName } from "./required-actions";

// View-model for one row in the captains' camp-management roster. Keeps the
// rendering layer dumb: every flag/label a cell needs is derived here, in one
// pure pass that's cheap to unit test.

export type RosterStatus =
  | "ready"
  | "onboarding"
  | "awaiting_approval"
  | "rejected"
  | "pending";

// --- Who a member may see, and what of their standing ------------------------

/**
 * ─── THE OWNER'S FLIP. ONE LINE. ───────────────────────────────────────────
 * Whether a DECLINED sign-up appears on the roster a non-captain browses.
 *
 * The owner ruled (2026-09-22) "I think everyone should be able to see the
 * applicants" — applicants being the people still waiting on a captain. A
 * rejection is a different thing: a captain's decision about somebody who is
 * not in camp, and putting that in front of the whole camp is a social call
 * nobody asked for. So by default a rejected person is not on a member's
 * roster at all, and their "Declined" standing therefore cannot leak.
 *
 * Set this to `true` and rejected people reach a member's roster and export,
 * because the two row filters (`rosterForViewer` and the member export) read
 * this one flag. THREE things do not follow by themselves, and whoever flips it
 * owns them:
 *   1. There is no "Declined" filter chip — `PublicRosterChip` is
 *      all / pending / captains — so a declined row appears only under All,
 *      wearing the "Declined" badge from `PUBLIC_STANDING_LABEL`.
 *   2. `derivePublicRosterStats` counts members, captains and pending. It does
 *      not count declined, so the strip will not report them.
 *   3. The e2e case "a member sees who applied, and not who was declined"
 *      asserts the default, and has to be rewritten to assert the flip.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const MEMBERS_SEE_REJECTED: boolean = false;

/**
 * The ONLY approval facet a non-captain may read about someone else
 * (`users.approvalStatus` is `camp_member` in MEMBER_FIELD_READERS). It is
 * deliberately NOT `RosterStatus`: onboarding progress and outstanding
 * required actions stay captain-only, and this type makes assigning one of
 * them to a public row a typecheck error rather than a review question.
 */
export type PublicStanding = "pending" | "rejected";

/** What each standing is called on a chip or badge. */
export const PUBLIC_STANDING_LABEL: Record<PublicStanding, string> = {
  pending: "Pending",
  rejected: "Declined",
};

/**
 * Whether one person belongs on the roster a NON-captain browses. Everyone who
 * has applied or been approved does; a declined sign-up does only when the
 * owner has flipped `MEMBERS_SEE_REJECTED`.
 *
 * `seeRejected` exists so the flip itself is testable from both sides —
 * production callers pass one argument and take the constant.
 */
export function visibleToMembers(
  member: Pick<CampManagementMember, "approvalStatus">,
  seeRejected: boolean = MEMBERS_SEE_REJECTED,
): boolean {
  return seeRejected || member.approvalStatus !== "rejected";
}

/**
 * The members a viewer of this rank may see AT ALL — the row-level half of the
 * privacy rule, where `toPublicRosterRow` is the column-level half. A captain
 * sees everyone. Used by the roster page and by the member export, so the file
 * and the screen list the same people.
 *
 * `seeRejected` defaults to the constant, so production passes two arguments
 * and cannot drift from it; a test passes the third to drive BOTH sides of the
 * owner's flip without editing the module.
 */
export function membersVisibleTo<
  T extends Pick<CampManagementMember, "approvalStatus">,
>(
  members: readonly T[],
  isCaptain: boolean,
  seeRejected: boolean = MEMBERS_SEE_REJECTED,
): T[] {
  return isCaptain
    ? [...members]
    : members.filter((m) => visibleToMembers(m, seeRejected));
}

/**
 * The member-safe subset of a roster row: identity, team context and the
 * applicant standing that any approved camp member may see. The page sends
 * ONLY this shape to non-captains (server-enforced redaction) — the
 * captain-only facets on `RosterRow` never cross the wire for a member.
 */
export interface PublicRosterRow {
  id: string;
  displayName: string;
  /** Display handle (reuses telegram_handle); null when unset. */
  handle: string | null;
  /** Highest rank label: Captain > Team Lead > Member. */
  rankLabel: string;
  rank: "captain" | "member";
  isLead: boolean;
  teams: string[];
  /** Resolved home-country name, or NULL when unanswered. */
  country: string | null;
  inSouthAfrica: boolean;
  /**
   * Applicant standing: "pending" while a captain has not decided, "rejected"
   * for a declined sign-up (which only reaches a non-captain when
   * MEMBERS_SEE_REJECTED is on), and NULL for everyone already in camp. The
   * owner's 2026-09-22 ruling, and the one approval fact on this row.
   */
  standing: PublicStanding | null;
  /**
   * Where the member stands for THIS year (camp_participations), or null when
   * they have not answered. Team lead and up (`campParticipations.status` in
   * MEMBER_FIELD_READERS), so the key is ABSENT on a plain member's row, not
   * merely null: `toPublicRosterRow` sets it only when asked to.
   */
  thisYear?: ParticipationStatus | null;
}

/**
 * A full roster row — the captain view. Extends the public row with the
 * approval / onboarding / driver facets a captain triages by. Every added field
 * is captain-only and must never be mapped for a non-captain viewer.
 */
export interface RosterRow extends PublicRosterRow {
  /** Sign-in email (captains assign DDT tickets by it); null when unknown. */
  email: string | null;
  /** Overall signup standing, for the status pill. */
  status: RosterStatus;
  statusLabel: string;
  /** Captain-approval lifecycle. */
  approvalStatus: "pending" | "approved" | "rejected";
  /** Awaiting a captain's vetting decision — the "unapproved" filter. */
  awaitingApproval: boolean;
  onboardingComplete: boolean;
  pendingRequiredActions: number;
  /**
   * What the member still owes, by name and oldest first ("Burner profile",
   * "Dietary questionnaire"), so a captain can say what to finish. Captain-
   * only: it is never mapped onto a PublicRosterRow.
   */
  outstanding: string[];
  /** All blocking questionnaires/actions done. */
  requiredComplete: boolean;
  isDriver: boolean;
  driverProfileComplete: boolean;
  /** Dues settled for this year in the payments ledger (received or waived). */
  duesPaid: boolean;
  /** This year's attendance status; always present on a captain's row. */
  thisYear: ParticipationStatus | null;
}

/**
 * The row shape the responsive table/list render. The captain-only `status` is
 * OPTIONAL so the same components serve both the member view (no status bar) and
 * the captain view (coloured status bar) — a `RosterRow` widens to it, a
 * `PublicRosterRow` satisfies it with `status` simply absent.
 */
export type RosterDisplayRow = PublicRosterRow & {
  status?: RosterStatus;
  statusLabel?: string;
};

const COUNTRY_NAME = new Map(COUNTRIES.map((c) => [c.value, c.label]));

const STATUS_LABEL: Record<RosterStatus, string> = {
  ready: "Ready",
  onboarding: "Onboarding",
  awaiting_approval: "Awaiting approval",
  rejected: "Rejected",
  pending: "Action needed",
};

/**
 * Collapse a member's facets into the view-model the roster table renders.
 * Pure — no DB, no I/O — so the status/derivation rules are unit-testable.
 *
 * Status precedence: onboarding (profile unfinished) → the captain-approval
 * lifecycle (awaiting / rejected) → outstanding required actions → ready.
 * Approval sits above generic actions because it's the gate that blocks the
 * member from the app entirely.
 */
export function toRosterRow(member: CampManagementMember): RosterRow {
  const requiredComplete = member.pendingRequiredActions === 0;
  const awaitingApproval = member.approvalStatus === "pending";
  const status: RosterStatus = !member.onboardingComplete
    ? "onboarding"
    : awaitingApproval
      ? "awaiting_approval"
      : member.approvalStatus === "rejected"
        ? "rejected"
        : requiredComplete
          ? "ready"
          : "pending";

  return {
    ...toPublicRosterRow(member),
    thisYear: member.participation,
    email: member.email ?? null,
    status,
    statusLabel: STATUS_LABEL[status],
    approvalStatus: member.approvalStatus,
    awaitingApproval,
    onboardingComplete: member.onboardingComplete,
    pendingRequiredActions: member.pendingRequiredActions,
    outstanding: member.pendingRequiredActionItems.map((a) =>
      requiredActionName(a.key, a.title),
    ),
    requiredComplete,
    isDriver: member.intendsToDrive,
    driverProfileComplete: member.driverProfileComplete,
    duesPaid: member.duesPaid,
  };
}

/**
 * Map a member to the member-safe PUBLIC row — identity, team context and the
 * applicant `standing`. This is the projection the page sends to non-captain
 * viewers; it carries none of the other approval facets and none of the
 * onboarding / driver / dues ones, so those private fields are impossible to
 * leak to a member through the row. Single-sourced by `toRosterRow`
 * (the captain row spreads this), so the public columns can never drift apart.
 *
 * `withThisYear` adds this year's attendance status, for a viewer who may read
 * it (a team lead). Without it the `thisYear` key is left off entirely, so a
 * plain member's row does not even say that there is something withheld.
 */
export function toPublicRosterRow(
  member: CampManagementMember,
  { withThisYear = false }: { withThisYear?: boolean } = {},
): PublicRosterRow {
  const row: PublicRosterRow = {
    id: member.id,
    displayName: member.displayName?.trim() || "Unnamed burner",
    handle: member.handle,
    rankLabel: rankLabel(member.rank, member.isLead),
    rank: member.rank,
    isLead: member.isLead,
    teams: member.teams,
    country: member.country
      ? (COUNTRY_NAME.get(member.country) ?? member.country)
      : null,
    inSouthAfrica: member.country === "ZA",
    // The one approval fact a member may read. "approved" carries no standing
    // — being in camp is the ordinary case and wears no chip.
    standing:
      member.approvalStatus === "pending"
        ? "pending"
        : member.approvalStatus === "rejected"
          ? "rejected"
          : null,
  };
  if (withThisYear) row.thisYear = member.participation;
  return row;
}

/** Captain outranks team lead outranks plain member. */
export function rankLabel(rank: "captain" | "member", isLead: boolean): string {
  if (rank === "captain") return "Captain";
  if (isLead) return "Team Lead";
  return "Member";
}

// --- Roster filtering + stats (pure; P7 wires these to the client's chips,
// search box, and counts strip — service-layer plan 05). ----------------------

/** The roster filter chips (the parameterised "Team:" filter is `matchesTeam`). */
export type RosterChip = "all" | "pending" | "captains" | "outstanding";

/**
 * Headline counts for the roster stats strip + chip badges, all from one pass so
 * they reconcile (plan 05 §Validation). Per the OQ#5 reconciliation: Incomplete
 * (stat) and Outstanding (chip) are the same predicate — still has a blocking
 * required action (`pendingRequiredActions > 0`).
 */
export interface RosterStats {
  members: number;
  approved: number;
  incomplete: number;
  pending: number;
  captains: number;
  outstanding: number;
}

/**
 * Whether a row belongs under a filter chip. `pending` = awaiting a captain's
 * vetting decision; `captains` = current captains; `outstanding` = still has a
 * blocking required action. Total over every chip.
 */
export function matchesChip(row: RosterRow, chip: RosterChip): boolean {
  switch (chip) {
    case "all":
      return true;
    case "pending":
      return row.awaitingApproval;
    case "captains":
      return row.rank === "captain";
    case "outstanding":
      return !row.requiredComplete;
    default: {
      const _exhaustive: never = chip;
      return _exhaustive;
    }
  }
}

/**
 * The filter chips a NON-captain gets: the same All / Pending / Captains
 * toggles, minus Outstanding (a blocking-actions facet that stays captain-only).
 * A subset of `RosterChip` so the shared toolbar takes either.
 */
export type PublicRosterChip = Extract<
  RosterChip,
  "all" | "pending" | "captains"
>;

/**
 * Whether a public row belongs under a member's filter chip. `pending` reads
 * the row's own `standing`, so the chip can only ever show people the member
 * already has — the count and the list cannot disagree.
 */
export function matchesPublicChip(
  row: PublicRosterRow,
  chip: PublicRosterChip,
): boolean {
  switch (chip) {
    case "all":
      return true;
    case "pending":
      return row.standing === "pending";
    case "captains":
      return row.rank === "captain";
    default: {
      const _exhaustive: never = chip;
      return _exhaustive;
    }
  }
}

/** Whether a row is a member of the given team (the parameterised Team filter). */
export function matchesTeam(row: PublicRosterRow, team: string): boolean {
  return row.teams.includes(team);
}

/**
 * The captain's "This year" filter: any row, one attendance status, or `none`
 * for a member with no answer for the year.
 */
export type ThisYearFilter = "any" | ParticipationStatus | "none";

/** Whether a row belongs under the "This year" filter. */
export function matchesThisYear(
  row: Pick<PublicRosterRow, "thisYear">,
  filter: ThisYearFilter,
): boolean {
  if (filter === "any") return true;
  const status = row.thisYear ?? null;
  return filter === "none" ? status === null : status === filter;
}

/** The Overview's "This year" counts, one per status plus the unanswered. */
export interface ThisYearCounts {
  /** Said Yes (`applied`), not yet decided by a captain. */
  coming: number;
  maybe: number;
  accepted: number;
  waitlisted: number;
  notComing: number;
  notAnswered: number;
  /** Every approved member: the sum of the six above. */
  total: number;
}

/**
 * Who is coming this year, counted over APPROVED members only: the people the
 * "Everyone" audience reaches, so a count here is a count of people a send
 * asked. A pending or declined sign-up is not in camp, whatever they answered.
 */
export function deriveThisYear(
  rows: readonly Pick<RosterRow, "approvalStatus" | "thisYear">[],
): ThisYearCounts {
  const counts: ThisYearCounts = {
    coming: 0,
    maybe: 0,
    accepted: 0,
    waitlisted: 0,
    notComing: 0,
    notAnswered: 0,
    total: 0,
  };
  for (const row of rows) {
    if (row.approvalStatus !== "approved") continue;
    counts.total++;
    switch (row.thisYear) {
      case "applied":
        counts.coming++;
        break;
      case "maybe":
        counts.maybe++;
        break;
      case "accepted":
        counts.accepted++;
        break;
      case "waitlisted":
        counts.waitlisted++;
        break;
      case "not_attending":
        counts.notComing++;
        break;
      case null:
        counts.notAnswered++;
        break;
      default: {
        const _exhaustive: never = row.thisYear;
        return _exhaustive;
      }
    }
  }
  return counts;
}

/**
 * Free-text roster search over name, handle, rank, country, team (its key and
 * its configured label, so "Cuisine" finds a relabelled kitchen) and, on a
 * captain's row, email. A member's row carries no email, so a member can never
 * search by one. Empty/whitespace query matches everything.
 */
export function matchesRosterQuery(
  row: PublicRosterRow & { email?: string | null },
  query: string,
  teamLabels: Record<string, string> = {},
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.displayName.toLowerCase().includes(q) ||
    (row.handle?.toLowerCase().includes(q) ?? false) ||
    row.rankLabel.toLowerCase().includes(q) ||
    (row.country?.toLowerCase().includes(q) ?? false) ||
    row.teams.some(
      (t) =>
        t.toLowerCase().includes(q) ||
        (teamLabels[t]?.toLowerCase().includes(q) ?? false),
    ) ||
    (row.email?.toLowerCase().includes(q) ?? false)
  );
}

/**
 * All the roster counts the stats strip and chip badges need, in one pass so
 * they reconcile (plan 05 line 321): Members = all; Approved = approved;
 * Incomplete/Outstanding = a blocking action remains; Pending = awaiting a
 * vetting decision; Captains = current captains.
 */
export function deriveRosterStats(rows: readonly RosterRow[]): RosterStats {
  let approved = 0;
  let incomplete = 0;
  let pending = 0;
  let captains = 0;
  for (const row of rows) {
    if (row.approvalStatus === "approved") approved++;
    if (!row.requiredComplete) incomplete++;
    if (row.awaitingApproval) pending++;
    if (row.rank === "captain") captains++;
  }
  // Incomplete and Outstanding are the same predicate per OQ#5.
  return {
    members: rows.length,
    approved,
    incomplete,
    pending,
    captains,
    outstanding: incomplete,
  };
}

/**
 * The member-view chip counts: total, captains and the people still waiting on
 * a captain's decision (the owner's 2026-09-22 ruling). The remaining
 * approval-derived counts — approved / incomplete / outstanding — stay
 * captain-only and are deliberately absent.
 *
 * Counted over the rows the member ACTUALLY HAS, never over the full roster,
 * so a "Pending 3" chip can never sit above a list of two.
 */
export function derivePublicRosterStats(rows: readonly PublicRosterRow[]): {
  members: number;
  captains: number;
  pending: number;
} {
  let captains = 0;
  let pending = 0;
  for (const row of rows) {
    if (row.rank === "captain") captains++;
    if (row.standing === "pending") pending++;
  }
  return { members: rows.length, captains, pending };
}

/** The viewer-scoped roster the page hands its island. */
export type RosterForViewer =
  | { isCaptain: true; rows: RosterRow[] }
  | { isCaptain: false; rows: PublicRosterRow[] };

/**
 * The page's captain-vs-member fork, centralised + discriminated so the member
 * branch can ONLY ever carry the redacted public projection — the one place a
 * private field could reach a non-captain, made explicit and unit-testable. The
 * caller narrows on `isCaptain` to render the matching island.
 *
 * Two cuts, not one: `membersVisibleTo` decides WHO is on the member's roster
 * (declined sign-ups are not, per MEMBERS_SEE_REJECTED), and
 * `toPublicRosterRow` decides WHAT of each of them crosses the wire.
 *
 * `seeRejected` defaults to the constant; only a test passes it, so that the
 * owner's flip is exercised through the REAL fork rather than trusted.
 *
 * `thisYearForLead` is for a non-captain who leads a team (any team: the role
 * is camp-wide): their public rows also carry this year's attendance status,
 * and nothing else of the captain's view. A plain member's rows never do.
 */
export function rosterForViewer(
  members: CampManagementMember[],
  isCaptain: boolean,
  seeRejected: boolean = MEMBERS_SEE_REJECTED,
  { thisYearForLead = false }: { thisYearForLead?: boolean } = {},
): RosterForViewer {
  return isCaptain
    ? { isCaptain: true, rows: members.map(toRosterRow) }
    : {
        isCaptain: false,
        rows: membersVisibleTo(members, false, seeRejected).map((m) =>
          toPublicRosterRow(m, { withThisYear: thisYearForLead }),
        ),
      };
}

// --- Sort ---------------------------------------------------------------

/** What the captain roster can be sorted by. */
export type RosterSortKey = "name" | "handle" | "country" | "role" | "status";

export interface RosterSort {
  key: RosterSortKey;
  direction: "asc" | "desc";
}

/** The order the server sends, and the order the roster opens in. */
export const DEFAULT_ROSTER_SORT: RosterSort = {
  key: "name",
  direction: "asc",
};

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

// Ascending role order puts the people who run the camp first.
const ROLE_ORDER = { captain: 0, lead: 1, member: 2 } as const;

// Ascending status order is triage order: what a captain must act on first.
const STATUS_ORDER: Record<RosterStatus, number> = {
  awaiting_approval: 0,
  pending: 1,
  onboarding: 2,
  rejected: 3,
  ready: 4,
};

function sortValue(
  row: RosterDisplayRow,
  key: RosterSortKey,
): string | number | null {
  switch (key) {
    case "name":
      return row.displayName;
    case "handle":
      return row.handle;
    case "country":
      return row.country;
    case "role":
      return ROLE_ORDER[
        row.rank === "captain" ? "captain" : row.isLead ? "lead" : "member"
      ];
    case "status":
      return row.status ? STATUS_ORDER[row.status] : null;
  }
}

/**
 * The rows in the order the captain asked for. A missing value (no handle, no
 * country) sorts last in either direction, so flipping the direction never
 * floods the top with blanks. Ties fall back to name, then id, so the order is
 * stable between renders.
 */
export function sortRosterRows<T extends RosterDisplayRow>(
  rows: readonly T[],
  sort: RosterSort,
): T[] {
  const flip = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else {
      const order =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : collator.compare(String(va), String(vb));
      if (order !== 0) return order * flip;
    }
    return (
      collator.compare(a.displayName, b.displayName) || a.id.localeCompare(b.id)
    );
  });
}
