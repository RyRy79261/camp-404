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
  // One light on the list, so the glance has figures to show.
  listPowerLoads: vi.fn(async () => [
    {
      area: "camp",
      category: "other",
      quantity: 1,
      wattsEach: 100,
      dutyPct: 100,
      schedule: "full_time",
    },
  ]),
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
import { listTeamPeople } from "@/lib/roster";
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

  it("says in one line that there is no power plan yet, and only an editor may start it", async () => {
    vi.mocked(listPowerLoads)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    viewAs("camp_member");
    await show("power_and_lighting");
    expect(screen.getByText("No power plan yet.")).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Power plan at a glance" }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Start the load list" }),
    ).toBeNull();
    cleanup();
    viewAs("team_lead", ["power_and_lighting"]);
    await show("power_and_lighting");
    expect(
      screen
        .getByRole("link", { name: "Start the load list" })
        .getAttribute("href"),
    ).toBe("/power/loads");
  });

  it("gives the team's lead the Edit control and the power tool's edit links", async () => {
    viewAs("team_lead", ["power_and_lighting"]);
    await show("power_and_lighting");
    expect(screen.getByRole("button", { name: EDIT })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Edit the load list" }),
    ).toBeTruthy();
  });

  it("lays the cards out by use: about first, the budget last", async () => {
    viewAs("camp_member");
    await show("water");
    const titles = [...document.querySelectorAll("[data-slot='card-title']")]
      .map((el) => el.textContent?.trim())
      .filter((t) => t !== "People this year");
    expect(titles).toEqual([
      "About this team",
      "Coming up",
      "Open tasks",
      "Meetings",
      "Announcements",
      "Budget",
    ]);
  });

  it("gives a lead of this team Add task and Write announcement on this team, and no one else", async () => {
    viewAs("team_lead", ["water"]);
    await show("water");
    expect(
      screen.getByRole("link", { name: "Add task" }).getAttribute("href"),
    ).toBe("/tasks?team=water&add=1");
    expect(
      screen
        .getByRole("link", { name: "Write announcement" })
        .getAttribute("href"),
    ).toBe("/captains/announcements?audience=team%3Awater");
    expect(
      screen
        .getByRole("link", { name: "See all of this team’s tasks" })
        .getAttribute("href"),
    ).toBe("/tasks?team=water");
    for (const [rank, led] of [
      ["camp_member", []],
      ["team_lead", ["kitchen"]],
    ] as const) {
      cleanup();
      viewAs(rank, [...led]);
      await show("water");
      expect(screen.queryByRole("link", { name: "Add task" })).toBeNull();
      expect(
        screen.queryByRole("link", { name: "Write announcement" }),
      ).toBeNull();
    }
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
    const figures = budgetFigures();
    expect(figures).toEqual({
      Budget: "R\u00a01\u00a0000,00",
      Spent: "R\u00a0300,00",
      Left: "R\u00a0700,00",
      Waiting: "R\u00a050,00",
    });
    expect(screen.getByText("1 claim")).toBeTruthy();
    // Not on the team: a claim is for money spent for it.
    expect(screen.queryByRole("link", { name: "Claim money back" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /Claims to approve/ }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Set budgets" })).toBeNull();
    // A member reads every team's totals on the Budgets page.
    expect(
      screen.getByRole("link", { name: "Every team's budget" }),
    ).toBeTruthy();
  });

  it("offers Claim money back to the team's own people, on this team", async () => {
    vi.mocked(listTeamPeople).mockResolvedValueOnce([
      {
        id: "viewer",
        displayName: "Me",
        handle: null,
        isLead: false,
        rank: "member",
      },
    ] as never);
    viewAs("camp_member");
    await show("water");
    expect(
      screen
        .getByRole("link", { name: "Claim money back" })
        .getAttribute("href"),
    ).toBe("/claims?team=water");
  });

  it("gives the team's own lead the approvals link with its count, and a lead of another team nothing", async () => {
    viewAs("team_lead", ["water"]);
    await show("water");
    expect(
      screen.getByRole("link", { name: "Claims to approve (1)" }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Set budgets" })).toBeNull();
    cleanup();
    viewAs("team_lead", ["kitchen"]);
    await show("water");
    expect(
      screen.queryByRole("link", { name: /Claims to approve/ }),
    ).toBeNull();
  });

  it("says in one line that a team has no budget, with no empty figures or links", async () => {
    viewAs("team_lead", ["power_and_lighting"]);
    await show("power_and_lighting");
    expect(screen.getByText("No budget set yet.")).toBeTruthy();
    expect(screen.queryByTestId("budget-stats")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /Claims to approve/ }),
    ).toBeNull();
  });

  it("gives a Finance lead the budgets link", async () => {
    viewAs("team_lead", ["finance"]);
    await show("water");
    expect(screen.getByRole("link", { name: "Set budgets" })).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: /Claims to approve/ }),
    ).toBeNull();
  });
});

/** The Budget box's four figures, by their labels. */
function budgetFigures(): Record<string, string> {
  const row = screen.getByTestId("budget-stats");
  const out: Record<string, string> = {};
  for (const dt of row.querySelectorAll("dt")) {
    const dd = dt.nextElementSibling;
    out[dt.textContent!.trim()] = dd!.textContent!.trim();
  }
  return out;
}
