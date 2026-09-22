import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamsConfig } from "@camp404/db/camp-config";

// What the page does with `?team=` — the Overview's coverage rail links here
// with a team key on the URL, and the page is the only thing that decides
// whether that key is honoured. Three cases matter: an active team filters, an
// ARCHIVED team the config still names filters AND gains an option in the
// dropdown (a select whose value is not one of its options renders blank over a
// filtered list), and a key the config does not name at all opens the WHOLE
// roster — so it must never be linked to as if it filtered.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/roster", () => ({ getCampManagementRoster: vi.fn() }));
vi.mock("@/lib/camp-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/camp-config")>()),
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
  MemberRoster: (props: { initialTeam: string | null }) => (
    <div
      data-testid="member-roster"
      data-initial-team={props.initialTeam ?? ""}
    />
  ),
}));
vi.mock("@/components/export-csv-button", () => ({
  ExportCsvButton: () => null,
}));

import { captainPageGate } from "@/lib/captain-gate";
import { getCampManagementRoster } from "@/lib/roster";
import { getTeamsConfig } from "@/lib/camp-config";
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
