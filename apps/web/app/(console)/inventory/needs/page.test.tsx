import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Needs this year (#246), after the audit of 2026-10-01. Every member pledges,
// so every row has the one main button, "I'll bring some" (or "Change
// pledge"), in the same slot. Taking a pledge back, Edit and Remove are quiet
// icons in a slot of their own. A member who cannot add needs sees no Add
// button at all, greyed or not, and no lock line.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/inventory/needs",
}));
vi.mock("@/app/(console)/inventory/actions", () => ({
  addNeedAction: vi.fn(),
  updateNeedAction: vi.fn(),
  removeNeedAction: vi.fn(),
  pledgeAction: vi.fn(),
  withdrawPledgeAction: vi.fn(),
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/inventory-viewer", () => ({ inventoryViewer: vi.fn() }));
vi.mock("@/lib/inventory", () => ({
  listInventoryNeeds: vi.fn(),
  listInventoryItems: vi.fn(async () => []),
}));

import { inventoryViewer } from "@/lib/inventory-viewer";
import { listInventoryNeeds } from "@/lib/inventory";
import { captainPageGate } from "@/lib/captain-gate";
import InventoryNeedsPage from "./page";

function need(id: string, name: string, pledges: { userId: string }[] = []) {
  return {
    id,
    team: "kitchen" as const,
    name,
    quantity: 4,
    itemId: null,
    itemName: null,
    have: 0,
    boughtQuantity: 0,
    note: null,
    pledges: pledges.map((p) => ({
      userId: p.userId,
      displayName: "Sam Sound",
      quantity: 1,
      note: null,
    })),
    version: 1,
  };
}

async function renderAs(editsKitchen: boolean) {
  vi.mocked(captainPageGate).mockResolvedValue({
    campUser: { id: "viewer" },
    rank: editsKitchen ? "team_lead" : "camp_member",
    cleared: true,
  } as never);
  vi.mocked(inventoryViewer).mockResolvedValue({
    userId: "viewer",
    rank: editsKitchen ? "team_lead" : "camp_member",
    canEdit: (team: string) => editsKitchen && team === "kitchen",
    teamLabel: () => "Kitchen",
    editableTeams: editsKitchen ? [{ value: "kitchen", label: "Kitchen" }] : [],
  });
  vi.mocked(listInventoryNeeds).mockResolvedValue([
    need("n1", "Cooler boxes", [{ userId: "viewer" }]),
    need("n2", "Gas bottles"),
  ] as never);
  render(await InventoryNeedsPage());
}

/** The row's action group in the table (the cards repeat it). */
function actions(name: string) {
  const table = screen.getByRole("table", { name: "Kitchen needs" });
  return within(table).getByRole("group", { name: `Actions for ${name}` });
}

afterEach(cleanup);

describe("Needs this year", () => {
  it("shows a member no Add button and no lock line, only the list", async () => {
    await renderAs(false);
    expect(screen.getByRole("table", { name: "Kitchen needs" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add need/ })).toBeNull();
    expect(screen.queryByText(/Only captains and team leads/)).toBeNull();
    expect(
      within(actions("Gas bottles")).queryByRole("button", { name: /Edit/ }),
    ).toBeNull();
  });

  it("puts the one main button first on every row, whether pledged or not", async () => {
    await renderAs(false);
    for (const [name, label] of [
      ["Cooler boxes", "Change my pledge for Cooler boxes"],
      ["Gas bottles", "Pledge Gas bottles"],
    ] as const) {
      const group = actions(name);
      const primary = group.querySelector('[data-slot="row-actions-primary"]')!;
      expect(
        within(primary as HTMLElement)
          .getByRole("button")
          .getAttribute("aria-label"),
      ).toBe(label);
    }
    // Taking it back is a quiet icon in the secondary slot, not a second
    // button that pushes the main one aside.
    const secondary = actions("Cooler boxes").querySelector(
      '[data-slot="row-actions-secondary"]',
    )!;
    expect(
      within(secondary as HTMLElement).getByRole("button", {
        name: "Take back my pledge for Cooler boxes",
      }),
    ).toBeTruthy();
  });

  it("gives a Kitchen lead Add, and Edit and Remove beside the main button", async () => {
    await renderAs(true);
    expect(screen.getByRole("button", { name: "Add need" })).toBeTruthy();
    const secondary = actions("Gas bottles").querySelector(
      '[data-slot="row-actions-secondary"]',
    )!;
    expect(
      within(secondary as HTMLElement)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Edit Gas bottles", "Remove Gas bottles"]);
  });
});
