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

export interface RosterRow {
  id: string;
  displayName: string;
  /** Display handle (reuses telegram_handle); null when unset. */
  handle: string | null;
  /** Highest rank label: Captain > Team Lead > Member. */
  rankLabel: string;
  rank: "captain" | "member";
  isLead: boolean;
  teams: string[];
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
  /** Resolved home-country name, or NULL when unanswered. */
  country: string | null;
  inSouthAfrica: boolean;
}

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
    id: member.id,
    displayName: member.displayName?.trim() || "Unnamed burner",
    handle: member.handle,
    rankLabel: rankLabel(member.rank, member.isLead),
    rank: member.rank,
    isLead: member.isLead,
    teams: member.teams,
    status,
    statusLabel: STATUS_LABEL[status],
    approvalStatus: member.approvalStatus,
    awaitingApproval,
    onboardingComplete: member.onboardingComplete,
    pendingRequiredActions: member.pendingRequiredActions,
    requiredComplete,
    isDriver: member.intendsToDrive,
    driverProfileComplete: member.driverProfileComplete,
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
export function matchesTeam(row: RosterRow, team: string): boolean {
  return row.teams.includes(team);
}

/**
 * Free-text roster search over name, handle, country, and team values. Pure +
 * two-arg (plan 05 line 239). Email search is intentionally absent until the PII
 * decision lands (spec OQ#1) — there's no email on the row yet. Empty/whitespace
 * query matches everything.
 */
export function matchesRosterQuery(row: RosterRow, query: string): boolean {
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
