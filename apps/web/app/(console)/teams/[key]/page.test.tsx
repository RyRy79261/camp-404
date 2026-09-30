import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A team's program as each viewer gets it (owner's rulings 1-3, 2026-09-27).
// Every member reads the description, the announcements and, on
// Power and Lighting, the power plan at a glance. Only a captain or a lead OF
// THAT TEAM gets the Edit control; a lead of another team does not.

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("./actions", () => ({ saveTeamProgramAction: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/camp-config", () => ({
  getTeamsConfig: vi.fn(async () => ({
    teams: [
      {
        key: "power_and_lighting",
        label: "Power and Lighting",
        order: 0,
        archived: false,
      },
      { key: "water", label: "Water", order: 1, archived: false },
    ],
  })),
}));
vi.mock("@/lib/roster", () => ({ listTeamPeople: vi.fn(async () => []) }));
vi.mock("@/lib/payments", () => ({ ledgerCycle: vi.fn(async () => 2027) }));
vi.mock("@/lib/claims", async () => {
  const { budgetTotals } = await import("@camp404/core");
  const { Team } = await import("@camp404/types");
  return {
    listBudgetTotals: vi.fn(async () =>
      Object.fromEntries(
        Team.options.map((t) => [
          t,
          t === "water"
            ? budgetTotals(1000_00, [
                { status: "paid", amountCents: 300_00 },
                { status: "submitted", amountCents: 50_00 },
              ])
            : budgetTotals(null, []),
        ]),
      ),
    ),
  };
});
vi.mock("@/lib/camp-calendar", () => ({
  getUpcomingEvents: vi.fn(async () => ({ status: "not_configured" })),
}));
vi.mock("@/lib/tasks", () => ({ listBoardTasks: vi.fn(async () => []) }));
vi.mock("@/lib/meeting-notes", () => ({
  listMeetingNotes: vi.fn(async () => []),
}));
vi.mock("@/lib/team-programs", () => ({
  getTeamProgram: vi.fn(async (team: string) => ({
    team,
    description: "We keep the lights on.",
    version: 1,
    updatedAt: new Date(),
  })),
  listTeamAnnouncements: vi.fn(async () => ({
    items: [
      {
        id: "a1",
        title: "Generator test Saturday",
        body: "Bring ear plugs.",
        senderName: "Pat",
        sentAt: new Date("2026-09-20T08:00:00Z"),
      },
    ],
    more: false,
  })),
}));
vi.mock("@/lib/power", () => ({
  listPowerLoads: vi.fn(async () => []),
  getPowerPlan: vi.fn(async () => ({
    generatorId: null,
    powerFactor: 0.8,
    daysOnSite: 11,
    lowLoadFactor: 1,
    safetyMarginPct: 20,
    canLitres: 20,
    cansOwned: 0,
    runFromHour: null,
    runToHour: null,
  })),
  getGenerator: vi.fn(async () => null),
}));

import type { ViewerRank } from "@camp404/types";
import { captainPageGate } from "@/lib/captain-gate";
import { listPowerLoads } from "@/lib/power";
import { getLeadTeams } from "@/lib/users";
import TeamPage from "./page";

function viewAs(rank: ViewerRank, led: string[] = []) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

async function show(key: string) {
  render(await TeamPage({ params: Promise.resolve({ key }) }));
}

const EDIT = /^Edit what .* does$/;

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("a team's program", () => {
  it("shows a member the description, announcements and power plan, with no edit controls", async () => {
    viewAs("camp_member");
    await show("power_and_lighting");
    expect(screen.getByText("We keep the lights on.")).toBeTruthy();
    expect(screen.getByText("Generator test Saturday")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Power plan at a glance" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "See the load list" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: EDIT })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Edit the/ })).toBeNull();
  });

  it("gives the team's lead the Edit control and the power tool's edit links", async () => {
    viewAs("team_lead", ["power_and_lighting"]);
    await show("power_and_lighting");
    expect(screen.getByRole("button", { name: EDIT })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Edit the load list" }),
    ).toBeTruthy();
  });

  it("gives a lead of another team no Edit control", async () => {
    viewAs("team_lead", ["kitchen"]);
    await show("power_and_lighting");
    expect(screen.queryByRole("button", { name: EDIT })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Edit the/ })).toBeNull();
  });

  it("gives a captain the Edit control on any team", async () => {
    viewAs("captain");
    await show("water");
    expect(screen.getByRole("button", { name: EDIT })).toBeTruthy();
  });

  it("shows the power plan only on Power and Lighting", async () => {
    viewAs("camp_member");
    await show("water");
    expect(screen.getByText("Generator test Saturday")).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Power plan at a glance" }),
    ).toBeNull();
  });

  it("keeps the shared cards when the team's own panel fails", async () => {
    viewAs("camp_member");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(listPowerLoads).mockRejectedValueOnce(new Error("down"));
    await show("power_and_lighting");
    expect(screen.getByText("We keep the lights on.")).toBeTruthy();
    expect(screen.getByText("Generator test Saturday")).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Power plan at a glance" }),
    ).toBeNull();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("shows every member the team's budget totals, and only the links they may use", async () => {
    viewAs("camp_member");
    await show("water");
    expect(screen.getByTestId("team-budget").textContent).toMatch(
      /R\s300,00 of R\s1\s000,00 spent/,
    );
    expect(screen.getByText(/R\s700,00 left/)).toBeTruthy();
    expect(screen.getByText(/1 claim waiting for a yes/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Claim money back" })).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Claims to approve" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Set budgets" })).toBeNull();
  });

  it("gives the team's own lead the approvals link, and a lead of another team nothing", async () => {
    viewAs("team_lead", ["water"]);
    await show("water");
    expect(
      screen.getByRole("link", { name: "Claims to approve" }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Set budgets" })).toBeNull();
    cleanup();
    viewAs("team_lead", ["kitchen"]);
    await show("water");
    expect(
      screen.queryByRole("link", { name: "Claims to approve" }),
    ).toBeNull();
  });

  it("gives a Finance lead the budgets link", async () => {
    viewAs("team_lead", ["finance"]);
    await show("water");
    expect(screen.getByRole("link", { name: "Set budgets" })).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Claims to approve" }),
    ).toBeNull();
  });
});
