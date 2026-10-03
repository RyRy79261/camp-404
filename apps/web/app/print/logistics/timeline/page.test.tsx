import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The burn timeline print (#249, Option A of design/print-burn-timeline.html,
// A4 landscape): a strip of days Pack to Unpack from Logistics, the phase
// bands, ALL HANDS days, and counts only. The reads carry members' names (the
// attendance board names who said what); the sheet never prints one. Every
// member reads Logistics, so every member prints it.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/camp-config", () => ({ getCurrentCycle: vi.fn() }));
vi.mock("@/lib/payments", () => ({ ledgerCycle: vi.fn(async () => 2027) }));
vi.mock("@/lib/logistics", () => ({
  countAcceptedMembers: vi.fn(),
  getAttendanceView: vi.fn(),
  listLogisticsPhases: vi.fn(),
}));

import { captainPageGate } from "@/lib/captain-gate";
import { getCurrentCycle } from "@/lib/camp-config";
import {
  countAcceptedMembers,
  getAttendanceView,
  listLogisticsPhases,
} from "@/lib/logistics";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import BurnTimelinePrintPage from "./page";

const row = (
  phase: string,
  startDate: string,
  endDate: string,
  place: string | null,
  note: string | null,
) => ({ phase, startDate, endDate, place, note });

const board = (phase: string, going: string[], maybe: string[]) => ({
  phase,
  names: { going, maybe, cant: ["Kyle Adams"] },
  notAnswered: ["Megan van der Berg"],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "member" },
    rank: "camp_member",
    cleared: true,
  } as never);
  vi.mocked(getCurrentCycle).mockResolvedValue({
    year: 2027,
    burnStart: "2027-04-25",
    burnEnd: "2027-04-26",
  } as never);
  vi.mocked(listLogisticsPhases).mockResolvedValue([
    row(
      "pack",
      "2027-04-17",
      "2027-04-17",
      "Storage unit, Ndabeni",
      "Load the trailer.",
    ),
    row("travel", "2027-04-21", "2027-04-21", "Cape Town to Tankwa", null),
    row("build", "2027-04-22", "2027-04-24", "On site", "Shade first."),
    row("strike", "2027-04-27", "2027-04-27", "On site", null),
  ] as never);
  vi.mocked(getAttendanceView).mockResolvedValue({
    phases: [
      board("pack", ["Pat Kruger", "Sam Botha"], ["Lerato Mokoena"]),
      board("build", ["Pat Kruger", "Sam Botha", "Sipho Dlamini"], []),
      board("strike", ["Ayesha Patel"], ["Ben Nel", "Jess Smith"]),
      board("unpack", [], []),
    ],
    mine: {},
    namesWhoHaveNotAnswered: false,
    notAnsweredCount: { pack: 1, build: 1, strike: 1, unpack: 1 },
  } as never);
  vi.mocked(countAcceptedMembers).mockResolvedValue(42);
});

afterEach(cleanup);

describe("the burn timeline print", () => {
  it("lets any member print it, landscape, with counts and no names", async () => {
    const { container } = render(await BurnTimelinePrintPage());
    expect(captainPageGate).toHaveBeenCalledWith("camp_member");
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
    expect(container.innerHTML).toContain("A4 landscape");
    expect(countAcceptedMembers).toHaveBeenCalledWith(2027);
    const text = container.textContent ?? "";
    for (const name of [
      "Pat",
      "Sam",
      "Lerato",
      "Sipho",
      "Ayesha",
      "Ben",
      "Jess",
      "Kyle",
      "Megan",
    ]) {
      expect(text).not.toContain(name);
    }
    expect(text).toContain("AfrikaBurn 2027 · 42 members accepted");
  });

  it("draws a day per column, a gap as one column, and the counts per day", async () => {
    render(await BurnTimelinePrintPage());
    const strip = screen.getByTestId("timeline-strip");
    // Pack, gap (18–20), travel, build ×3, burn ×2 (the year's dates), strike.
    expect(
      within(strip)
        .getAllByTestId("timeline-people")
        .map((c) => c.textContent),
    ).toEqual(["2", "–", "3", "3", "3", "42", "42", "1"]);
    const rows = within(strip).getAllByRole("row");
    expect(rows.map((r) => r.querySelector("th")?.textContent)).toEqual([
      "Day",
      "Phase",
      "All hands",
      "People",
      "+ maybe",
    ]);
    // 1 label + 8 days + 1 gap.
    expect(rows[0]!.querySelectorAll("td")).toHaveLength(9);
    expect(rows[1]!.textContent).toBe("PhasePackTravelBuildBurnStrike");
    expect(rows[2]!.textContent).toBe(
      "All handsALL HANDSALL HANDSALL HANDSALL HANDSALL HANDS",
    );
    expect(rows[4]!.textContent).toBe("+ maybe+1+2");
  });

  it("lists each phase with its days, place and note", async () => {
    render(await BurnTimelinePrintPage());
    const table = screen.getByRole("table", { name: "Phases" });
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((r) => r.textContent),
    ).toEqual([
      "Pack (all hands)Sat 17 AprStorage unit, NdabeniLoad the trailer.",
      "TravelWed 21 AprCape Town to Tankwa",
      "Build (all hands)Thu 22 – Sat 24 AprOn siteShade first.",
      "BurnSun 25 – Mon 26 Apr",
      "Strike (all hands)Tue 27 AprOn site",
    ]);
  });

  it("says when no days are set", async () => {
    vi.mocked(listLogisticsPhases).mockResolvedValue([]);
    vi.mocked(getCurrentCycle).mockResolvedValue({ year: 2027 } as never);
    render(await BurnTimelinePrintPage());
    expect(screen.getByText(/No days are set yet/)).toBeTruthy();
  });
});
