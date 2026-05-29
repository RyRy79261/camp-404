import type { CampManagementMember } from "@camp404/db/roster";
import { COUNTRIES } from "./countries";

// View-model for one row in the captains' camp-management roster. Keeps the
// rendering layer dumb: every flag/label a cell needs is derived here, in one
// pure pass that's cheap to unit test.

export type RosterStatus = "ready" | "onboarding" | "pending";

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
  pending: "Action needed",
};

/**
 * Collapse a member's facets into the view-model the roster table renders.
 * Pure — no DB, no I/O — so the status/derivation rules are unit-testable.
 */
export function toRosterRow(member: CampManagementMember): RosterRow {
  const requiredComplete = member.pendingRequiredActions === 0;
  const status: RosterStatus = !member.onboardingComplete
    ? "onboarding"
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
