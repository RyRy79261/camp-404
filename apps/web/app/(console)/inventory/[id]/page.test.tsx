import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One item's page (#246). Every member reads it, may suggest a change and may
// book it. Only a captain or a lead of the item's OWN team sees Edit, Lend
// out, Archive and the Approve / Reject buttons; a lead of another team stands
// on the same team_lead rung and still sees none of them. Who booked is read
// with names only for an editor: the page asks for them by that flag.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/app/(console)/inventory/actions", () => ({
  addItemAction: vi.fn(),
  updateItemAction: vi.fn(),
  archiveItemAction: vi.fn(),
  proposeChangeAction: vi.fn(),
  reviewChangeAction: vi.fn(),
  bookItemAction: vi.fn(),
  cancelBookingAction: vi.fn(),
  lendItemAction: vi.fn(),
  returnLoanAction: vi.fn(),
}));
vi.mock("@/lib/captain-gate", () => ({ captainPageGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/tasks", () => ({
  listAssignableMembers: vi.fn(async () => [{ id: "u-1", displayName: "Sam" }]),
}));
vi.mock("@/lib/camp-config", () => {
  const teams = [
    { key: "kitchen", label: "Kitchen", archived: false, order: 0 },
    { key: "sound", label: "Sound", archived: false, order: 1 },
  ];
  return {
    getTeamsConfig: vi.fn(async () => ({ teams })),
    activeTeams: (config: { teams: typeof teams }) => config.teams,
    teamLabelMap: (config: { teams: typeof teams }) =>
      Object.fromEntries(config.teams.map((t) => [t.key, t.label])),
  };
});
vi.mock("@/lib/inventory", () => ({
  getInventoryItem: vi.fn(),
  listItemUpdates: vi.fn(async () => []),
  listItemBookings: vi.fn(async () => []),
  listInventoryLoans: vi.fn(async () => []),
}));

import { captainPageGate } from "@/lib/captain-gate";
import {
  getInventoryItem,
  listInventoryLoans,
  listItemBookings,
  listItemUpdates,
} from "@/lib/inventory";
import { getLeadTeams } from "@/lib/users";
import InventoryItemPage from "./page";

const ITEM_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const ITEM = {
  id: ITEM_ID,
  name: "Cooler box",
  details: null,
  team: "kitchen",
  category: "cooling",
  condition: "good",
  quantity: 4,
  unit: null,
  weightKg: null,
  wattsEach: null,
  location: "storage_unit",
  custodianUserId: null,
  custodianName: null,
  storageLocation: "Shelf 3",
  requiresMaintenance: false,
  maintenanceIntervalDays: null,
  lastMaintainedAt: null,
  nextMaintenanceDueAt: null,
  lastCheckedAt: null,
  bookableCount: 2,
  archivedAt: null,
  version: 1,
  updatedAt: new Date("2026-09-20T08:00:00Z"),
};

const PROPOSAL = {
  id: "p-1",
  itemId: ITEM_ID,
  itemName: "Cooler box",
  team: "kitchen",
  status: "pending",
  quantity: 3,
  condition: "needs_repair",
  location: "storage_unit",
  custodianUserId: null,
  custodianName: null,
  storageLocation: "Shelf 3",
  maintenancePerformedAt: null,
  note: "One lid cracked",
  proposedById: "u-2",
  proposedByName: "Alex",
  reviewedByName: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: new Date("2026-09-21T08:00:00Z"),
};

function as(rank: string, led: string[] = []) {
  vi.mocked(captainPageGate).mockResolvedValue({
    authUser: {} as never,
    campUser: { id: "viewer" } as never,
    rank: rank as never,
    cleared: true,
  });
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

async function renderPage() {
  render(await InventoryItemPage({ params: Promise.resolve({ id: ITEM_ID }) }));
}

beforeEach(() => {
  vi.mocked(getInventoryItem).mockResolvedValue(ITEM as never);
  vi.mocked(listItemUpdates).mockResolvedValue([PROPOSAL] as never);
  vi.mocked(listInventoryLoans).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("inventory item page", () => {
  it("gives a plain member the facts, Suggest and Book, and nothing that changes the item", async () => {
    as("camp_member");
    await renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "Cooler box" }),
    ).toBeTruthy();
    expect(screen.getByText("Kitchen · Storage unit, Shelf 3")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Suggest a change" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Book Cooler box" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lend out" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
    // Their suggestion waits, said beside the author line.
    expect(screen.getByText("Waiting for review")).toBeTruthy();
    // Names are not asked for.
    expect(listItemBookings).toHaveBeenCalledWith(ITEM_ID, "viewer", false);
  });

  it("says an archived item can't be booked, not that it is fully booked", async () => {
    vi.mocked(getInventoryItem).mockResolvedValue({
      ...ITEM,
      archivedAt: new Date("2026-09-22T08:00:00Z"),
    } as never);
    as("camp_member");
    await renderPage();
    expect(
      screen.getByText("It can't be booked: the camp no longer keeps it."),
    ).toBeTruthy();
    expect(screen.queryByText(/fully booked/)).toBeNull();
    expect(screen.queryByText(/Nobody has booked/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Book Cooler box" }),
    ).toBeNull();
  });

  it("offers no Book on a broken item, and says why", async () => {
    vi.mocked(getInventoryItem).mockResolvedValue({
      ...ITEM,
      condition: "broken",
    } as never);
    as("camp_member");
    await renderPage();
    expect(
      screen.getByText(
        "It's marked broken, so it can't be booked until it's fixed.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Book Cooler box" }),
    ).toBeNull();
  });

  it("takes units lent to another camp off what can be booked", async () => {
    vi.mocked(getInventoryItem).mockResolvedValue({
      ...ITEM,
      bookableCount: 4,
    } as never);
    vi.mocked(listInventoryLoans).mockResolvedValue([
      {
        id: "l-1",
        itemId: ITEM_ID,
        itemName: "Cooler box",
        team: "kitchen",
        quantity: 3,
        borrowerCamp: "Camp Sunshine Disco",
        borrowerAddress: "7:30 & Binnekring",
        lentAt: new Date("2026-09-20T08:00:00Z"),
        lentByName: "Kim",
        returnedAt: null,
      },
    ] as never);
    as("camp_member");
    await renderPage();
    const facts = screen.getByRole("region", { name: "What we have" });
    expect(within(facts).getByText("3, to Camp Sunshine Disco")).toBeTruthy();
    expect(
      within(facts).getByText("Can be booked").nextSibling?.textContent,
    ).toContain("1 of 4");
  });

  it("refuses a lead of another team the same way", async () => {
    as("team_lead", ["sound"]);
    await renderPage();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^More for/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Suggest a change" }),
    ).toBeTruthy();
    expect(listItemBookings).toHaveBeenCalledWith(ITEM_ID, "viewer", false);
  });

  it("gives the item's own team lead Edit, the menu, Lend out and the review as a before and after", async () => {
    as("team_lead", ["kitchen"]);
    await renderPage();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "More for Cooler box: Lend out, Archive",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lend out" })).toBeTruthy();
    // An editor edits; they are not offered a suggestion.
    expect(
      screen.queryByRole("button", { name: "Suggest a change" }),
    ).toBeNull();
    const suggested = screen.getByRole("region", { name: "Suggested change" });
    expect(
      within(suggested).getByRole("button", {
        name: "Approve the change to Cooler box",
      }),
    ).toBeTruthy();
    // Only what changes, before and after.
    expect(within(suggested).getByText("How many")).toBeTruthy();
    expect(within(suggested).getByText("4")).toBeTruthy();
    expect(within(suggested).getByText("3")).toBeTruthy();
    expect(within(suggested).getByText("Needs repair")).toBeTruthy();
    expect(within(suggested).queryByText("Where")).toBeNull();
    expect(screen.queryByText("Waiting for review")).toBeNull();
    expect(listItemBookings).toHaveBeenCalledWith(ITEM_ID, "viewer", true);
  });

  it("shows a captain the editor's controls on any team's item", async () => {
    as("captain");
    await renderPage();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });
});
