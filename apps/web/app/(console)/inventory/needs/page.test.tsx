import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Needs this year (#246), as the approved mock-up draws it (option A, owner
// 2026-10-01): one table, the teams as header rows naming their leads, and
// every row's ONE button in the same slot: "Pledge", "Edit my pledge" once
// you have, or a quiet "Covered". Edit and remove sit behind "···" in a
// narrow column of their own, there only for someone who may use it. A
// member who cannot add needs sees no Add button at all.

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
vi.mock("@/lib/roster", () => ({ listTeamPeople: vi.fn() }));

import { inventoryViewer } from "@/lib/inventory-viewer";
import { listInventoryNeeds } from "@/lib/inventory";
import { captainPageGate } from "@/lib/captain-gate";
import { listTeamPeople } from "@/lib/roster";
import InventoryNeedsPage from "./page";

function need(
  id: string,
  name: string,
  pledges: { userId: string; quantity: number }[] = [],
  quantity = 4,
) {
  return {
    id,
    team: "kitchen" as const,
    name,
    quantity,
    itemId: null,
    itemName: null,
    have: 0,
    boughtQuantity: 0,
    note: null,
    pledges: pledges.map((p) => ({
      userId: p.userId,
      displayName: "Sam Sound",
      quantity: p.quantity,
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
    teamOrder: () => 0,
  });
  vi.mocked(listInventoryNeeds).mockResolvedValue([
    need("n1", "Cooler boxes", [{ userId: "viewer", quantity: 1 }]),
    need("n2", "Gas bottles"),
    need("n3", "Tent pegs", [{ userId: "sam", quantity: 2 }], 2),
  ] as never);
  vi.mocked(listTeamPeople).mockResolvedValue([
    {
      id: "kim",
      displayName: "Kim Kitchen",
      handle: null,
      rank: "member",
      isLead: true,
    },
    {
      id: "sam",
      displayName: "Sam Sound",
      handle: null,
      rank: "member",
      isLead: false,
    },
  ]);
  render(await InventoryNeedsPage({ searchParams: Promise.resolve({}) }));
}

/** The desktop table (the phone list repeats the rows). */
function table() {
  return screen.getByRole("table", { name: "What the teams need this year" });
}

/** A row's cells in the table. */
function cells(name: string) {
  return within(table())
    .getByRole("row", { name: new RegExp(`^${name}`) })
    .querySelectorAll("td");
}

afterEach(cleanup);

describe("Needs this year", () => {
  it("shows a member no Add button and no tools column, only the list", async () => {
    await renderAs(false);
    expect(screen.queryByRole("button", { name: /Add need/ })).toBeNull();
    expect(
      within(table().querySelector("thead")!).getAllByRole("columnheader"),
    ).toHaveLength(4);
    expect(
      within(table()).queryByRole("button", { name: /Edit or remove/ }),
    ).toBeNull();
  });

  it("puts one action in the same slot on every row: Pledge, Edit my pledge or Covered", async () => {
    await renderAs(false);
    const slot = (name: string) => cells(name)[3] as HTMLElement;
    expect(
      within(slot("Cooler boxes"))
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Edit my pledge for Cooler boxes"]);
    expect(
      within(slot("Gas bottles"))
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Pledge Gas bottles"]);
    // Nothing left to find and no pledge of yours: a quiet word, no button.
    expect(within(slot("Tent pegs")).queryAllByRole("button")).toHaveLength(0);
    expect(slot("Tent pegs").textContent).toContain("Covered");
  });

  it("names the team's leads in its header row", async () => {
    await renderAs(false);
    expect(
      within(table()).getByRole("columnheader", { name: /Kitchen/ })
        .textContent,
    ).toContain("Lead: Kim Kitchen");
  });

  it("gives a Kitchen lead Add need, and Edit or remove behind ··· in its own column", async () => {
    await renderAs(true);
    expect(screen.getByRole("button", { name: "Add need" })).toBeTruthy();
    expect(
      within(table().querySelector("thead")!).getAllByRole("columnheader"),
    ).toHaveLength(5);
    expect(
      within(cells("Gas bottles")[4] as HTMLElement)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Edit or remove Gas bottles"]);
  });
});
