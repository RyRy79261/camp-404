import type { CampManagementMember } from "@camp404/db/roster";
import { COUNTRIES } from "./countries";

// View-model for one row in the captains' camp-management roster. Keeps the
// rendering layer dumb: every flag/label a cell needs is derived here, in one
// pure pass that's cheap to unit test.

export type RosterStatus =
  | "ready"
  | "onboarding"
  | "awaiting_approval"
  | "rejected"
  | "pending";

/**
 * The member-safe subset of a roster row: identity + team context that any
 * approved camp member may see. The page sends ONLY this shape to non-captains
 * (server-enforced redaction) — the captain-only facets on `RosterRow` never
 * cross the wire for a member.
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
}

/**
 * A full roster row — the captain view. Extends the public row with the
 * approval / onboarding / driver facets a captain triages by. Every added field
 * is captain-only and must never be mapped for a non-captain viewer.
 */
export interface RosterRow extends PublicRosterRow {
  /** Overall signup standing, for the status pill. */
  status: RosterStatus;
  statusLabel: string;
  /** Captain-approval lifecycle. */
  approvalStatus: "pending" | "approved" | "rejected";
  /** Awaiting a captain's vetting decision — the "unapproved" filter. */
  awaitingApproval: boolean;
  onboardingComplete: boolean;
  pendingRequiredActions: number;
  /** All blocking questionnaires/actions done. */
  requiredComplete: boolean;
  isDriver: boolean;
  driverProfileComplete: boolean;
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
    status,
    statusLabel: STATUS_LABEL[status],
    approvalStatus: member.approvalStatus,
    awaitingApproval,
    onboardingComplete: member.onboardingComplete,
    pendingRequiredActions: member.pendingRequiredActions,
    requiredComplete,
    isDriver: member.intendsToDrive,
    driverProfileComplete: member.driverProfileComplete,
  };
}

/**
 * Map a member to the member-safe PUBLIC row — identity + team context only.
 * This is the projection the page sends to non-captain viewers; it carries none
 * of the approval / onboarding / driver facets, so those private fields are
 * impossible to leak to a member through the row. Single-sourced by `toRosterRow`
 * (the captain row spreads this), so the public columns can never drift apart.
 */
export function toPublicRosterRow(member: CampManagementMember): PublicRosterRow {
  return {
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
  };
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

/** Whether a row is a member of the given team (the parameterised Team filter). */
export function matchesTeam(row: PublicRosterRow, team: string): boolean {
  return row.teams.includes(team);
}

/**
 * Free-text roster search over name, handle, country, and team values. Pure +
 * two-arg (plan 05 line 239). Email search is intentionally absent until the PII
 * decision lands (spec OQ#1) — there's no email on the row yet. Empty/whitespace
 * query matches everything.
 */
export function matchesRosterQuery(row: PublicRosterRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.displayName.toLowerCase().includes(q) ||
    (row.handle?.toLowerCase().includes(q) ?? false) ||
    row.rankLabel.toLowerCase().includes(q) ||
    (row.country?.toLowerCase().includes(q) ?? false) ||
    row.teams.some((t) => t.toLowerCase().includes(q))
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
 * The member-view chip counts: total members + captains only. The approval-
 * derived counts (approved / incomplete / pending / outstanding) are captain-
 * only, so they are deliberately absent here — a member's toolbar only shows the
 * All and Captains chips, computed from public fields.
 */
export function derivePublicRosterStats(
  rows: readonly PublicRosterRow[],
): { members: number; captains: number } {
  let captains = 0;
  for (const row of rows) if (row.rank === "captain") captains++;
  return { members: rows.length, captains };
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
 */
export function rosterForViewer(
  members: CampManagementMember[],
  isCaptain: boolean,
): RosterForViewer {
  return isCaptain
    ? { isCaptain: true, rows: members.map(toRosterRow) }
    : { isCaptain: false, rows: members.map(toPublicRosterRow) };
}
