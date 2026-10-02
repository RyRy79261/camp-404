import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The site plan on A4 (the approved redesign's Print plan): the plan to scale
// with its numbered key, for every approved member, landscape; with no saved
// plan, a refusal drawn outside the sheet so no empty PDF is ever made.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/camp-layout", () => ({ getCampLayout: vi.fn() }));

import { emptyLayout, newPiece } from "@camp404/core";
import { captainPageGate } from "@/lib/captain-gate";
import { getCampLayout } from "@/lib/camp-layout";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import CampLayoutPrintPage from "./page";

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank: "camp_member",
    cleared: true,
  } as never);
});

describe("the site plan print", () => {
  it("prints the plan and its numbered key on a landscape sheet", async () => {
    const layout = emptyLayout();
    layout.pieces = [
      { ...newPiece("kitchen", "k", layout.plot), label: "Kitchen" },
      { ...newPiece("tent", "t", layout.plot), x: 2, y: 2, label: "Zanele" },
    ];
    vi.mocked(getCampLayout).mockResolvedValue({
      cycle: 2027,
      version: 4,
      layout,
      note: null,
      savedAt: new Date("2027-03-01T10:00:00Z"),
      savedByName: "Sipho",
      shared: false,
    });
    const { container } = render(await CampLayoutPrintPage());
    expect(captainPageGate).toHaveBeenCalledWith("camp_member");
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
    expect(container.innerHTML).toContain("A4 landscape");
    expect(
      screen.getByRole("heading", { name: "Site plan 2027" }),
    ).toBeTruthy();
    expect(screen.getByText(/Version 4 · saved 1 March 2027/)).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Camp pieces" })).getByText(
        "Kitchen",
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Tents" })).getByText("Zanele"),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /Site plan, 28 m by 60 m/ }),
    ).toBeTruthy();
  });

  it("refuses, outside the sheet, while the year has no plan", async () => {
    vi.mocked(getCampLayout).mockResolvedValue({
      cycle: 2027,
      version: 0,
      layout: null,
      note: null,
      savedAt: null,
      savedByName: null,
      shared: false,
    });
    const { container } = render(await CampLayoutPrintPage());
    expect(screen.getByText(/no site plan for this year yet/)).toBeTruthy();
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeNull();
  });
});
