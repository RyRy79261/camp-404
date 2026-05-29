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
