import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamsConfig } from "@camp404/db/camp-config";
import type * as CampConfig from "@/lib/camp-config";

// What the page does with `?team=` — the camp overview's coverage rail links here
// with a team key on the URL, and the page is the only thing that decides
// whether that key is honoured. Three cases matter: an active team filters, an
// ARCHIVED team the config still names filters AND gains an option in the
// dropdown (a select whose value is not one of its options renders blank over a
// filtered list), and a key the config does not name at all opens the WHOLE
// roster — so it must never be linked to as if it filtered.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/roster", () => ({ getCampManagementRoster: vi.fn() }));
vi.mock("@/lib/users", () => ({ isTeamLead: vi.fn() }));
vi.mock("@/lib/camp-config", async (importOriginal) => ({
  ...(await importOriginal<typeof CampConfig>()),
  getTeamsConfig: vi.fn(),
}));
// The islands are exercised in their own tests; here only the props matter.
vi.mock("./camp-management-roster", () => ({
  CampManagementRoster: (props: {
    teams: readonly { key: string; label: string }[];
    initialTeam: string | null;
  }) => (
    <div
      data-testid="captain-roster"
      data-initial-team={props.initialTeam ?? ""}
      data-team-options={props.teams.map((t) => t.key).join(",")}
    />
  ),
}));
vi.mock("./member-roster", () => ({
  MemberRoster: (props: {
    initialTeam: string | null;
    rows: Record<string, unknown>[];
  }) => (
    <div
      data-testid="member-roster"
      data-initial-team={props.initialTeam ?? ""}
      data-this-year={props.rows
        .map((r) => ("thisYear" in r ? String(r.thisYear) : "absent"))
        .join(",")}
    />
  ),
}));
vi.mock("@/components/export-csv-button", () => ({
  ExportCsvButton: () => null,
}));

import { captainPageGate } from "@/lib/captain-gate";
import { getCampManagementRoster } from "@/lib/roster";
import { getTeamsConfig } from "@/lib/camp-config";
import { isTeamLead } from "@/lib/users";
import type { CampManagementMember } from "@camp404/db/roster";
import CampManagementPage from "./page";

const CONFIG: TeamsConfig = {
  teams: [
    { key: "kitchen", label: "Kitchen", order: 0, archived: false },
    { key: "structures", label: "Structures", order: 1, archived: false },
    { key: "bar", label: "Bar", order: 2, archived: true },
  ],
} as TeamsConfig;

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(captainPageGate).mockResolvedValue({
    rank: "captain",
    cleared: true,
  } as never);
  vi.mocked(getCampManagementRoster).mockResolvedValue([]);
  vi.mocked(getTeamsConfig).mockResolvedValue(CONFIG);
  vi.mocked(isTeamLead).mockReset().mockResolvedValue(false);
});

async function openWith(team?: string) {
  render(await CampManagementPage({ searchParams: Promise.resolve({ team }) }));
  return screen.getByTestId("captain-roster");
}

describe("camp-management ?team=", () => {
  it("opens filtered to an active team, with the usual dropdown", async () => {
    const roster = await openWith("structures");
    expect(roster.dataset.initialTeam).toBe("structures");
    expect(roster.dataset.teamOptions).toBe("kitchen,structures");
  });

  it("honours an archived team and puts it in the dropdown", async () => {
    // The rail links here for an archived team that still has members on it.
    const roster = await openWith("bar");
    expect(roster.dataset.initialTeam).toBe("bar");
    expect(roster.dataset.teamOptions).toBe("kitchen,structures,bar");
  });

  it("ignores a key the config does not name, and opens the full roster", async () => {
    const roster = await openWith("ministry_of_memes");
    expect(roster.dataset.initialTeam).toBe("");
    expect(roster.dataset.teamOptions).toBe("kitchen,structures");
  });

  it("opens unfiltered with no ?team= at all", async () => {
    const roster = await openWith(undefined);
    expect(roster.dataset.initialTeam).toBe("");
  });

  it("passes the same filter to the member projection", async () => {
    vi.mocked(captainPageGate).mockResolvedValue({
      rank: "camp_member",
      cleared: false,
      campUser: { id: "viewer-1" },
    } as never);
    render(
      await CampManagementPage({
        searchParams: Promise.resolve({ team: "kitchen" }),
      }),
    );
    expect(screen.getByTestId("member-roster").dataset.initialTeam).toBe(
      "kitchen",
    );
  });
});

describe("camp-management: this year's status on a non-captain's roster", () => {
  const coming = {
    id: "m1",
    displayName: "Nova",
    handle: null,
    rank: "member",
    approvalStatus: "approved",
    isLead: false,
    teams: [],
    duesPaid: false,
    membershipTier: null,
    onboardingComplete: true,
    pendingRequiredActions: 0,
    pendingRequiredActionItems: [],
    intendsToDrive: false,
    driverProfileComplete: false,
    country: null,
    participation: "applied",
    createdAt: new Date("2026-01-01"),
  } satisfies CampManagementMember;

  async function asNonCaptain(lead: boolean) {
    vi.mocked(captainPageGate).mockResolvedValue({
      rank: lead ? "team_lead" : "camp_member",
      cleared: false,
      campUser: { id: "viewer-1" },
    } as never);
    vi.mocked(getCampManagementRoster).mockResolvedValue([coming]);
    vi.mocked(isTeamLead).mockResolvedValue(lead);
    render(await CampManagementPage({ searchParams: Promise.resolve({}) }));
    return screen.getByTestId("member-roster").dataset.thisYear;
  }

  it("hands a team lead each member's status (any team: the role is camp-wide)", async () => {
    expect(await asNonCaptain(true)).toBe("applied");
    expect(isTeamLead).toHaveBeenCalledWith("viewer-1");
  });

  it("hands a plain member rows with no status key at all", async () => {
    expect(await asNonCaptain(false)).toBe("absent");
  });

  it("does not ask whether a captain leads a team", async () => {
    render(await CampManagementPage({ searchParams: Promise.resolve({}) }));
    expect(isTeamLead).not.toHaveBeenCalled();
  });
});
