import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The grid in the approved redesign (option B): the answer first (which run
// is over its rating, by how much), then a card per point with what feeds it,
// how hard its cable works and what plugs in, then the loads not plugged in
// yet, then the cables and adapters, none counted as the camp's until someone
// says so (the audit found "we have the cable" ticked by default). The camp is
// the mock-up's own (tests/power-camp.ts): Kitchen carries 12.0 A on a 10 A
// reel, the main junction 14.1 A of 16, and three loads have no point yet.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/test-mode", () => ({
  usesTestStore: () => true,
  isE2ETestMode: () => true,
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/app/(console)/power/grid/actions");

import { updateGridNodeAction } from "@/app/(console)/power/grid/actions";
import { captainPageGate } from "@/lib/captain-gate";
import { POWER_READ_ONLY, PRINT_GRID_SHEET_PATH } from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";
import { setUpPowerCamp, type PowerCamp } from "@/tests/power-camp";
import { renderServer } from "@/tests/render-server";
import PowerGridPage from "./page";

let camp: PowerCamp;

async function renderAs(
  who: keyof PowerCamp,
  rank: "camp_member" | "team_lead" | "captain",
  leads: string[] = [],
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: camp[who].id },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads as never);
  await renderServer(PowerGridPage());
}

const point = (name: string) =>
  within(screen.getByRole("list", { name: "Grid points" })).getByRole(
    "listitem",
    { name },
  );

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  camp = setUpPowerCamp();
});

describe("the grid", () => {
  it("names the run that is over its rating, with the amps on it", async () => {
    await renderAs("mem", "camp_member");
    const answer = screen.getByRole("region", { name: "The answer" });
    expect(answer.textContent).toContain(
      "Kitchen is over its rating: 12.0 A on a 10 A run.",
    );
    // The advice names the biggest load there and the next cable up.
    expect(answer.textContent).toContain(
      "Give the coffee urn its own run, or lay a 16 A cable to the Kitchen.",
    );
    for (const line of [
      "Over 1",
      "Near limit 1",
      "Fine 2",
      "Not plugged in 3",
    ]) {
      expect(within(answer).getByText(line)).toBeTruthy();
    }
  });

  it("draws each point with what feeds it, its load and what plugs in", async () => {
    await renderAs("mem", "camp_member");
    const kitchen = point("Kitchen");
    expect(kitchen.textContent).toContain("From Main junction · 15 m reel");
    expect(kitchen.textContent).toContain("12.0 of 10 A");
    expect(within(kitchen).getByText("Over")).toBeTruthy();
    expect(kitchen.textContent).toContain("Coffee urn");
    const main = point("Main junction");
    expect(main.textContent).toContain("14.1 of 16 A");
    expect(within(main).getByText("Near limit")).toBeTruthy();
    expect(main.textContent).toContain("Kitchen run");
    expect(main.textContent).toContain("Lounge run");
  });

  it("lists the loads not plugged in yet, as text for a reader", async () => {
    await renderAs("mem", "camp_member");
    const off = screen.getByRole("list", { name: "Not plugged in yet" });
    expect(
      within(off)
        .getAllByRole("listitem")
        .map((r) => r.getAttribute("aria-label"))
        .sort(),
    ).toEqual(["Angle grinder", "Drinks fridge", "Phone charging station"]);
    expect(within(off).queryAllByRole("combobox")).toHaveLength(0);
  });

  it("counts no cable or adapter as the camp's until someone says so", async () => {
    await renderAs("mem", "camp_member");
    const card = screen.getByRole("region", { name: "Cables and adapters" });
    expect(card.textContent).toContain(
      "5 not checked yet. None counts as ours until someone says so.",
    );
    const rows = within(
      screen.getByRole("list", { name: "Cables and adapters" }),
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(within(row).getByText("Not checked yet")).toBeTruthy();
    }
  });

  it("gives a member and a Kitchen lead the grid sheet and no button", async () => {
    await renderAs("mem", "camp_member");
    expect(screen.getByText(POWER_READ_ONLY)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Print the grid sheet" })
        .getAttribute("href"),
    ).toBe(PRINT_GRID_SHEET_PATH);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    cleanup();
    await renderAs("kim", "team_lead", ["kitchen"]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("gives a Power & Lighting lead the points, the pickers and the checks", async () => {
    await renderAs("pat", "team_lead", ["power_and_lighting"]);
    expect(screen.getByRole("button", { name: "Add a point" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit Kitchen" })).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Where Drinks fridge plugs in" }),
    ).toBeTruthy();
    // Have it / Need to get, neither picked: nobody has checked yet.
    const reel = screen.getByRole("group", { name: "15 m reel" });
    for (const b of within(reel).getAllByRole("button")) {
      expect(b.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("saves one cable's answer without answering its adapter", async () => {
    vi.mocked(updateGridNodeAction).mockResolvedValue({ ok: true } as never);
    await renderAs("pat", "team_lead", ["power_and_lighting"]);
    const cable = screen.getByRole("group", { name: "10 m cable" });
    fireEvent.click(within(cable).getByRole("button", { name: "Have it" }));
    await vi.waitFor(() => expect(updateGridNodeAction).toHaveBeenCalled());
    expect(vi.mocked(updateGridNodeAction).mock.calls[0]![0]).toMatchObject({
      name: "Lounge",
      haveCable: true,
      haveAdapter: null,
    });
  });
});
