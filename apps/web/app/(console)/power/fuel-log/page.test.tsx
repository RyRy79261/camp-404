import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Refuelling in the approved redesign (option B). There is no signal at the
// burn, so the paper sheet taped to the generator is the record on site: the
// page's main button prints it for everyone, and an editor types the lines in
// after the burn ("Type in from the sheet"). It opens on the fuel in stock
// against what the burn needs, then the cans, then the log. Everyone else
// reads the same page with no button at all. The camp is the mock-up's own
// (tests/power-camp.ts): 8 cans holding 111 L, one empty and two part full.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/test-mode", () => ({
  usesTestStore: () => true,
  isE2ETestMode: () => true,
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/app/(console)/power/fuel-log/actions");

import { captainPageGate } from "@/lib/captain-gate";
import { POWER_READ_ONLY, PRINT_REFUEL_SHEET_PATH } from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";
import { setUpPowerCamp, type PowerCamp } from "@/tests/power-camp";
import { renderServer } from "@/tests/render-server";
import PowerFuelLogPage from "./page";

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
  await renderServer(PowerFuelLogPage());
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  camp = setUpPowerCamp();
});

describe("refuelling", () => {
  it("opens on the fuel in stock against what the burn needs", async () => {
    await renderAs("mem", "camp_member");
    const answer = screen.getByRole("region", { name: "The answer" });
    expect(answer.textContent).toContain(
      "111 L in stock of the 446 L the burn needs.",
    );
    expect(within(answer).getByText("25%")).toBeTruthy();
    for (const line of ["Full 5", "Part full 2", "Empty 1"]) {
      expect(within(answer).getByText(line)).toBeTruthy();
    }
  });

  it("lists each can with what is in it, one line each", async () => {
    await renderAs("mem", "camp_member");
    const cans = screen.getByRole("list", { name: "Cans" });
    expect(within(cans).getAllByRole("listitem")).toHaveLength(8);
    expect(
      within(cans).getByRole("listitem", { name: "Can 1" }).textContent,
    ).toContain("0 of 20 L");
    expect(
      within(cans).getByRole("listitem", { name: "Can 2" }).textContent,
    ).toContain("5 of 20 L");
  });

  it("gives everyone the paper sheet, and a reader nothing else", async () => {
    await renderAs("mem", "camp_member");
    expect(
      screen
        .getByRole("link", { name: "Print the log sheet" })
        .getAttribute("href"),
    ).toBe(PRINT_REFUEL_SHEET_PATH);
    expect(screen.getByText(POWER_READ_ONLY)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    // Nothing typed in yet: the sheet is the record, typed in after.
    expect(screen.getByText("Nothing typed in yet.")).toBeTruthy();
    expect(
      screen.getByText(
        /The sheet taped to the generator is the record on site/,
      ),
    ).toBeTruthy();
  });

  it("gives a Kitchen lead the same read", async () => {
    await renderAs("kim", "team_lead", ["kitchen"]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "Print the log sheet" }),
    ).toBeTruthy();
  });

  it("gives a Power & Lighting lead the typing-in and the cans to keep", async () => {
    await renderAs("pat", "team_lead", ["power_and_lighting"]);
    expect(screen.queryByText(POWER_READ_ONLY)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Type in from the sheet" }),
    ).toBeTruthy();
    // No "Log refuelling" as if the app were used live on site.
    expect(screen.queryByRole("button", { name: /Log refuelling/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Add cans" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Count the cans" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Count Can 4" })).toBeTruthy();
  });

  it("lists the typed-in lines, newest first, each with one Correct for an editor", async () => {
    camp = setUpPowerCamp({ withLog: true });
    await renderAs("pat", "team_lead", ["power_and_lighting"]);
    const log = screen.getByRole("list", { name: "Refuelling log" });
    const rows = within(log).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // 19:00 before 07:30 the same morning.
    expect(rows[0]!.textContent).toContain("15.0 L");
    expect(rows[0]!.textContent).toContain("Filled from the spare drum");
    expect(rows[1]!.textContent).toContain("12.0 L");
    expect(rows[1]!.textContent).toContain("from Can 4");
    expect(rows[1]!.textContent).toContain("meter 412.5 h");
    for (const row of rows) {
      expect(
        within(row)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["Correct"]);
    }
  });

  it("lists the same lines to a member, with no Correct", async () => {
    camp = setUpPowerCamp({ withLog: true });
    await renderAs("mem", "camp_member");
    const log = screen.getByRole("list", { name: "Refuelling log" });
    expect(within(log).getAllByRole("listitem")).toHaveLength(2);
    expect(within(log).queryAllByRole("button")).toHaveLength(0);
  });
});
