import type { ReactNode } from "react";
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The load list in the approved redesign (option B, the answer rail): the
// rail beside it with every section's answer, the answer first ("Over the
// generator"), then the loads grouped by area with one Edit in a fixed column
// for an editor. Every approved member reads it; only a captain or a Power &
// Lighting lead edits it. Everyone else gets the same page as content: one
// quiet line under the heading and no buttons at all, never a greyed form. A
// lead of another team stands on the team_lead rung and still only reads.
// The camp is the mock-up's own (tests/power-camp.ts), from the test store.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/test-mode", () => ({
  usesTestStore: () => true,
  isE2ETestMode: () => true,
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/app/(console)/power/actions");

import { captainPageGate } from "@/lib/captain-gate";
import { POWER_READ_ONLY } from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";
import { setUpPowerCamp, type PowerCamp } from "@/tests/power-camp";
import { renderServer } from "@/tests/render-server";
import PowerPage from "../page";
import PowerLoadsPage from "./page";

let camp: PowerCamp;

async function renderAs(
  who: keyof PowerCamp,
  rank: "camp_member" | "team_lead" | "captain",
  leads: string[] = [],
  page: () => ReactNode = PowerLoadsPage,
) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: camp[who].id },
    rank,
    cleared: true,
  } as never);
  vi.mocked(getLeadTeams).mockResolvedValue(leads as never);
  await renderServer(page());
}

const loadsList = () => screen.getByRole("list", { name: "Loads" });

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  camp = setUpPowerCamp();
});

describe("the answer rail", () => {
  it("writes every section's answer in the rail, in the mock-up's order", async () => {
    await renderAs("mem", "camp_member");
    const rail = screen.getByRole("navigation", { name: "Power" });
    const links = within(rail).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/power/loads",
      "/power/fuel",
      "/power/fuel-log",
      "/power/grid",
      "/power/readiness",
      "/power/sharing",
    ]);
    // The open section is marked; its line answers the question.
    expect(links[0]!.getAttribute("aria-current")).toBe("page");
    expect(links[0]!.textContent).toContain("6.5 of 5.5 kVA");
    // The rail names the generator by its make, so the line fits the rail.
    expect(links[0]!.textContent).toContain("1.0 kVA over the Honda");
    expect(links[0]!.textContent).not.toContain("EU70is");
    expect(links[3]!.textContent).toContain("1 run over");
    expect(links[3]!.textContent).toContain("3 loads not plugged in");
    expect(links[4]!.textContent).toContain("3 of 9 done");
    expect(links[5]!.textContent).toContain("Not agreed yet");
    expect(links[5]!.textContent).toContain("Camp Moonbeam");
  });

  it("is the home list at /power, beside the load list", async () => {
    await renderAs("mem", "camp_member", [], PowerPage);
    expect(screen.getByRole("navigation", { name: "Power" })).toBeTruthy();
    // No way back on the home: it is where the way back leads.
    expect(screen.queryByRole("link", { name: "‹ All of Power" })).toBeNull();
    expect(loadsList()).toBeTruthy();
  });

  it("offers a way back to the rail from a section, for a phone", async () => {
    await renderAs("mem", "camp_member");
    expect(
      screen.getByRole("link", { name: "‹ All of Power" }).getAttribute("href"),
    ).toBe("/power");
  });
});

describe("the load list", () => {
  it("answers first: over the generator, by how much", async () => {
    await renderAs("mem", "camp_member");
    const answer = screen.getByRole("region", { name: "The answer" });
    expect(answer.textContent).toContain("Over the generator.");
    expect(answer.textContent).toContain(
      "Everything on at once needs 6.5 kVA; the Honda EU70is gives 5.5 kVA.",
    );
    expect(within(answer).getByText("118%")).toBeTruthy();
    expect(within(answer).getByText("Peak 6.5 kVA")).toBeTruthy();
    expect(within(answer).getByText("32.6 kWh a day")).toBeTruthy();
  });

  it("groups the loads by area, the busiest first, with each area's total", async () => {
    await renderAs("mem", "camp_member");
    const text = loadsList().textContent ?? "";
    const order = ["Kitchen", "Workshop", "Dome", "Lounge", "Bar"].map((a) =>
      text.indexOf(a),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text).toContain("2,760 W · 20.3 kWh a day");
    const freezer = within(loadsList()).getByRole("listitem", {
      name: "Chest freezer",
    });
    expect(freezer.textContent).toContain("2 × 320 W");
    expect(freezer.textContent).toContain("640 W");
    expect(freezer.textContent).toContain("15.36");
    expect(
      screen.getByText(/Every day is the same\. No load is set to some days/),
    ).toBeTruthy();
  });

  it("shows a member the list as content: no button at all, one quiet line", async () => {
    await renderAs("mem", "camp_member");
    expect(screen.getByText(POWER_READ_ONLY)).toBeTruthy();
    // It names who to ask: this year's Power & Lighting lead.
    expect(screen.getByText("Ask Pat Mokoena.")).toBeTruthy();
    expect(screen.getByText("Power & Lighting · 2027")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("gives a Kitchen lead the same read, though their rung is team_lead", async () => {
    await renderAs("kim", "team_lead", ["kitchen"]);
    expect(screen.getByText(POWER_READ_ONLY)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("gives a Power & Lighting lead Add a load and one Edit on every row", async () => {
    await renderAs("pat", "team_lead", ["kitchen", "power_and_lighting"]);
    expect(screen.queryByText(POWER_READ_ONLY)).toBeNull();
    expect(screen.getByRole("button", { name: "Add a load" })).toBeTruthy();
    const rows = within(loadsList()).getAllByRole("listitem");
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      const buttons = within(row).getAllByRole("button");
      expect(buttons.map((b) => b.textContent)).toEqual(["Edit"]);
    }
  });

  it("gives a captain the same controls", async () => {
    await renderAs("cap", "captain");
    expect(screen.getByRole("button", { name: "Add a load" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Edit Coffee urn" }),
    ).toBeTruthy();
  });

  it("says what to do on an empty year, and the rail says so too", async () => {
    camp = setUpPowerCamp({ empty: true });
    await renderAs("pat", "team_lead", ["power_and_lighting"]);
    expect(screen.getByText("No loads yet.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "The answer" })).toBeNull();
    const rail = screen.getByRole("navigation", { name: "Power" });
    expect(within(rail).getAllByRole("link")[0]!.textContent).toContain(
      "No loads yet",
    );
  });
});
