import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Camp sheet page: a viewer below captain gets the heading and a lock and
// no member's data is read; a captain gets the sheet; and when the sheet's
// audit row cannot be written the page fails rather than draw it.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/camp-sheet", () => ({ buildCampSheet: vi.fn() }));
vi.mock("@/lib/camp-config", () => ({
  getTeamsConfig: vi.fn(async () => ({})),
  activeTeams: () => [
    { key: "kitchen", label: "Kitchen", order: 0, archived: false },
  ],
}));

import { buildCampSheet } from "@/lib/camp-sheet";
import { captainPageGate } from "@/lib/captain-gate";
import CampSheetPage from "./page";

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(buildCampSheet).mockReset();
  vi.mocked(buildCampSheet).mockResolvedValue({
    columns: [
      { key: "name", header: "Name", group: "who", private: false },
      {
        key: "emergency_contact_1",
        header: "Emergency contact 1",
        group: "safety",
        private: true,
      },
    ],
    rows: [
      {
        id: "m1",
        cells: ["Nova Reyes", "Sam (Sister), 082 000 0000"],
        teams: ["kitchen"],
        thisYear: "accepted",
      },
    ],
  });
});

function gateAs(cleared: boolean) {
  vi.mocked(captainPageGate).mockResolvedValue({
    cleared,
    rank: cleared ? "captain" : "team_lead",
    campUser: { id: cleared ? "cap-1" : "lead-1" },
  } as never);
}

describe("Camp sheet page", () => {
  it("gates at the captain bar", async () => {
    gateAs(true);
    await CampSheetPage();
    expect(captainPageGate).toHaveBeenCalledWith("captain");
  });

  it("locks a viewer below captain and reads no member's data", async () => {
    gateAs(false);
    render(await CampSheetPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Camp sheet" }),
    ).toBeTruthy();
    expect(screen.getByText(/camp sheet is captain-only/)).toBeTruthy();
    expect(buildCampSheet).not.toHaveBeenCalled();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.queryByText("Nova Reyes")).toBeNull();
    expect(screen.queryByRole("link", { name: /Export CSV/ })).toBeNull();
  });

  it("shows a captain the sheet, the audit note and the export", async () => {
    gateAs(true);
    render(await CampSheetPage());

    expect(buildCampSheet).toHaveBeenCalledWith({ userId: "cap-1" });
    expect(
      screen.getByText(/Opening this sheet is written to the audit log/),
    ).toBeTruthy();
    expect(screen.getByRole("grid", { name: "Camp sheet" })).toBeTruthy();
    expect(screen.getByText("Nova Reyes")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Export CSV/ }).getAttribute("href"),
    ).toBe("/captains/camp-management/export");
    expect(screen.getByRole("option", { name: "Kitchen" })).toBeTruthy();
  });

  it("fails closed when the sheet's audit row cannot be written", async () => {
    gateAs(true);
    vi.mocked(buildCampSheet).mockRejectedValue(new Error("audit down"));
    await expect(CampSheetPage()).rejects.toThrow("audit down");
  });
});
