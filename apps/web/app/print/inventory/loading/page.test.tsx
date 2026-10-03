import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The loading checklist print (#249, Option A of
// design/print-loading-checklist.html with the owner's change: grouped by
// the inventory's categories, not shelves). One sheet per Pack day, the
// trailers and their cars on top, every item with how many, its weight where
// known and a blank "Went in". People by first name only. Every member reads
// the inventory and Transport, so every member prints it.

vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/inventory-viewer", () => ({ inventoryViewer: vi.fn() }));
vi.mock("@/lib/inventory", () => ({ listInventoryItems: vi.fn() }));
vi.mock("@/lib/logistics", () => ({ listLogisticsPhases: vi.fn() }));
vi.mock("@/lib/transport", () => ({ getTransportBoard: vi.fn() }));

import { captainPageGate } from "@/lib/captain-gate";
import { listInventoryItems } from "@/lib/inventory";
import { inventoryViewer } from "@/lib/inventory-viewer";
import { listLogisticsPhases } from "@/lib/logistics";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import { getTransportBoard } from "@/lib/transport";
import LoadingChecklistPrintPage from "./page";

const LABELS: Record<string, string> = {
  kitchen: "Kitchen",
  structures: "Structures",
  power_and_lighting: "Power and Lighting",
};

function item(
  name: string,
  team: string,
  category: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id: name,
    name,
    team,
    category,
    condition: "good",
    quantity: 1,
    unit: null,
    weightKg: null,
    location: "storage_unit",
    custodianName: null,
    storageLocation: "Shelf 3",
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "member" },
    rank: "camp_member",
    cleared: true,
  } as never);
  vi.mocked(inventoryViewer).mockResolvedValue({
    teamLabel: (t: string) => LABELS[t] ?? t,
  } as never);
  vi.mocked(listInventoryItems).mockResolvedValue([
    item("Steel poles, 3 m", "structures", "structures", {
      quantity: 24,
      unit: "pole",
      weightKg: 130,
    }),
    item("Gas burners", "kitchen", "kitchen", {
      quantity: 4,
      unit: "burner",
      weightKg: 36.5,
    }),
    item("Chest freezer", "kitchen", "cooling", {
      weightKg: 45,
      location: "custodian_home",
      custodianName: "Pat Kruger",
    }),
    item("Spare inverter", "power_and_lighting", "power", {
      condition: "broken",
    }),
    item("Potjies, 25 L", "kitchen", "kitchen", {
      quantity: 3,
      unit: "pot",
      condition: "needs_repair",
    }),
  ] as never);
  vi.mocked(listLogisticsPhases).mockResolvedValue([
    {
      phase: "pack",
      startDate: "2027-04-17",
      endDate: "2027-04-18",
      place: "Storage unit, Ndabeni",
    },
    { phase: "strike", startDate: "2027-05-02", endDate: "2027-05-03" },
  ] as never);
  vi.mocked(getTransportBoard).mockResolvedValue({
    cycle: 2027,
    cars: [{ driverUserId: "a" }, { driverUserId: "b" }, { driverUserId: "c" }],
    trailers: [
      { id: "t1", name: "Big Red", towedByName: "Pat Kruger" },
      { id: "t2", name: "Long trailer", towedByName: null },
    ],
  } as never);
});

afterEach(cleanup);

describe("the loading checklist print", () => {
  it("lets any member print it: a sheet per Pack day", async () => {
    const { container } = render(await LoadingChecklistPrintPage());
    expect(captainPageGate).toHaveBeenCalledWith("camp_member");
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeTruthy();
    const sheets = screen.getAllByRole("region", { name: /Loading checklist/ });
    expect(sheets.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Loading checklist, Sat 17 Apr",
      "Loading checklist, Sun 18 Apr",
    ]);
    expect(sheets[0]!.textContent).toContain(
      "Sat 17 Apr · Storage unit, Ndabeni · 5 items · 211,5 kg where weighed",
    );
    expect(sheets[1]!.textContent).toContain("sheet 2 of 2");
  });

  it("groups every item by the inventory's categories, in the Gear tab's order", async () => {
    render(await LoadingChecklistPrintPage());
    const sheet = screen.getAllByRole("region", {
      name: /Loading checklist/,
    })[0]!;
    const groups = within(sheet)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(groups).toEqual(
      expect.arrayContaining([
        "Kitchen2 items",
        "Cooler boxes and fridges1 item",
        "Structures and flooring1 item",
        "Power and cables1 item",
      ]),
    );
    const rows = within(sheet)
      .getAllByTestId("loading-item")
      .map((r) => r.textContent);
    expect(rows).toEqual([
      "Gas burners · Kitchen4 burners36,5 kg",
      "Potjies, 25 L · Kitchenneeds repair3 pots",
      "Chest freezer · Kitchen · at Pat's home145 kg",
      "Steel poles, 3 m · Structures24 poles130 kg",
      "Spare inverter · Power and Lightingbroken1",
    ]);
    // No shelves or spots: the owner's categories only.
    expect(sheet.textContent).not.toContain("Shelf 3");
  });

  it("puts the trailers and their cars on top, by first name", async () => {
    render(await LoadingChecklistPrintPage());
    const top = screen.getAllByTestId("loading-vehicles")[0]!;
    expect(top.textContent).toBe(
      "Trailers: Big Red, behind Pat's car · Long trailer, no car yetCars: 3 drivers this year (Transport)",
    );
    const sheet = screen.getAllByRole("region", {
      name: /Loading checklist/,
    })[0]!;
    expect(sheet.textContent).not.toContain("Kruger");
    expect(sheet.textContent).toContain(
      "Every item the camp owns is listed: cross out what stays home.",
    );
    expect(
      within(sheet).getByRole("columnheader", { name: "Went in" }),
    ).toBeTruthy();
  });

  it("prints one sheet saying the Pack day is not set, when it is not", async () => {
    vi.mocked(listLogisticsPhases).mockResolvedValue([]);
    render(await LoadingChecklistPrintPage());
    const sheets = screen.getAllByRole("region", { name: /Loading checklist/ });
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.textContent).toContain(
      "Pack day not set on Logistics yet",
    );
  });
});
