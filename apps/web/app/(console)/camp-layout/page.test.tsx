import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The camp layout page (#271). Every approved member reads the plan; a
// captain or a Structures lead edits it; everyone else sees the tools PRESENT
// BUT DISABLED, pointing at one refusal line. The neighbour link is read only
// for a captain, so no one else's page ever holds it.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(console)/camp-layout/actions", () => ({
  saveLayoutAction: vi.fn(),
  restoreLayoutVersionAction: vi.fn(),
  copyLastYearLayoutAction: vi.fn(),
  shareLayoutAction: vi.fn(),
  unshareLayoutAction: vi.fn(),
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/camp-layout", () => ({
  getCampLayout: vi.fn(),
  getLayoutShare: vi.fn(),
  layoutArrivalCounts: vi.fn(async () => []),
  listLayoutVersions: vi.fn(async () => []),
  previousLayoutCycle: vi.fn(async () => null),
}));

import { LAYOUT_TEAM, emptyLayout, newPiece } from "@camp404/core";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getCampLayout,
  getLayoutShare,
  layoutArrivalCounts,
  listLayoutVersions,
} from "@/lib/camp-layout";
import { LAYOUT_REFUSAL } from "@/lib/camp-layout-copy";
import { getLeadTeams } from "@/lib/users";
import CampLayoutPage from "./page";

const TOKEN = "k".repeat(32);

function plan() {
  const layout = emptyLayout();
  return {
    ...layout,
    pieces: [
      { ...newPiece("kitchen", "p-1", layout.plot), label: "Main kitchen" },
    ],
  };
}

async function renderAs(
  rank: "camp_member" | "team_lead" | "captain",
  leads: string[] = [],
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads);
  render(await CampLayoutPage({ searchParams: Promise.resolve({}) }));
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCampLayout).mockResolvedValue({
    cycle: 2027,
    version: 2,
    layout: plan(),
    note: null,
    savedAt: new Date("2027-03-01T10:00:00Z"),
    savedByName: "Sipho",
    shared: true,
  });
  vi.mocked(getLayoutShare).mockResolvedValue({
    token: TOKEN,
    sharedAt: new Date(),
  });
  vi.mocked(listLayoutVersions).mockResolvedValue([
    {
      number: 2,
      note: null,
      savedAt: new Date("2027-03-01T10:00:00Z"),
      savedByName: "Sipho",
      pieces: 1,
    },
    {
      number: 1,
      note: "First go",
      savedAt: new Date("2027-02-01T10:00:00Z"),
      savedByName: "Sipho",
      pieces: 0,
    },
  ]);
  vi.mocked(layoutArrivalCounts).mockResolvedValue([
    { day: "2027-04-26", count: 3 },
  ]);
});

describe("the camp layout page", () => {
  it("shows a member the plan with every tool disabled, pointing at the refusal", async () => {
    await renderAs("camp_member");
    const refusal = screen.getByText(LAYOUT_REFUSAL);
    // Present first: the plan and its piece.
    expect(
      screen.getByRole("img", { name: /Camp layout: a plot/ }),
    ).toBeTruthy();
    expect(screen.getAllByText("Main kitchen").length).toBeGreaterThan(0);
    const add = screen.getByRole("button", { name: /^Add piece/ });
    expect(add).toHaveProperty("disabled", true);
    expect(add.getAttribute("aria-describedby")).toBe(refusal.id);
    // Then the absences: no save, no bring-back, no link.
    expect(screen.queryByRole("button", { name: /Save layout/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Bring back/ })).toBeNull();
    expect(getLayoutShare).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue(new RegExp(TOKEN))).toBeNull();
    expect(
      screen.getByText("A captain has shared it with neighbours."),
    ).toBeTruthy();
  });

  it("lets a Structures lead edit, but gives them no neighbour link", async () => {
    await renderAs("team_lead", [LAYOUT_TEAM]);
    expect(screen.queryByText(LAYOUT_REFUSAL)).toBeNull();
    expect(screen.getByRole("button", { name: /^Add piece/ })).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.getByRole("button", { name: /Save layout/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Bring back version 1" }),
    ).toBeTruthy();
    expect(getLayoutShare).not.toHaveBeenCalled();
  });

  it("refuses a Kitchen lead as it refuses a member", async () => {
    await renderAs("team_lead", ["kitchen"]);
    expect(screen.getByText(LAYOUT_REFUSAL)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Add piece/ })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("gives a captain the neighbour link", async () => {
    await renderAs("captain");
    expect(getLayoutShare).toHaveBeenCalled();
    const neighbours = screen
      .getByRole("heading", { name: "Neighbours" })
      .closest("div")!.parentElement!;
    expect(
      within(neighbours).getByRole("button", { name: /Stop sharing/ }),
    ).toBeTruthy();
    expect(within(neighbours).getByLabelText("Neighbour link")).toBeTruthy();
  });

  it("shows the arrival counts to everyone", async () => {
    await renderAs("camp_member");
    const list = screen.getByRole("list", { name: "Arrivals by day" });
    expect(list.textContent).toContain("Mon 26 Apr");
    expect(list.textContent).toContain("3");
  });
});
