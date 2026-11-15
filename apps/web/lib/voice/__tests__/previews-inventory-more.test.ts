// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../inventory", () => ({
  getInventoryItem: vi.fn(),
  listBookableItems: vi.fn(),
  listInventoryLoans: vi.fn(),
  listInventoryNeeds: vi.fn(),
  listPendingProposals: vi.fn(),
}));
vi.mock("../reads", () => ({
  readNames: vi.fn(async () => new Map()),
  readTeamLabels: vi.fn(async () => ({ kitchen: "Kitchen" })),
  readTeamPeople: vi.fn(async () => []),
}));

import {
  listBookableItems,
  listInventoryLoans,
  listInventoryNeeds,
  listPendingProposals,
} from "../../inventory";
import type { McpScope } from "../../mcp/scope";
import { INVENTORY_MORE_PREVIEWS as P } from "../previews-inventory-more";

// The Inventory page's needs, pledges, bookings, loans and reviews as voice
// previews: the row comes from the real need, item or suggestion, the version
// Do runs with is the one read, and a team the person may not edit is
// stopped before Do.

const ME = "11111111-1111-4111-8111-111111111111";
const scope = (leadTeams: McpScope["leadTeams"]): McpScope => ({
  campUserId: ME,
  rank: "member",
  viewerRank: leadTeams.length > 0 ? "team_lead" : "camp_member",
  leadTeams,
  memberTeams: leadTeams,
  isDriver: false,
  isCaptain: false,
});
const cook = { scope: scope(["kitchen"]), now: new Date() };
const plain = { scope: scope([]), now: new Date() };
const NEED = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

function needs() {
  vi.mocked(listInventoryNeeds).mockResolvedValue([
    {
      id: NEED,
      team: "kitchen",
      name: "Pots",
      quantity: 4,
      itemId: null,
      itemName: null,
      have: 0,
      boughtQuantity: 1,
      note: null,
      pledges: [{ userId: ME, displayName: "Me", quantity: 2, note: null }],
      version: 7,
    },
  ]);
}

describe("inventory previews", () => {
  it("runs a need's edit on the version it read, and stops a lead of another team", async () => {
    needs();
    const p = await P.update_inventory_need!(
      { needId: NEED, expectedVersion: 1, quantity: 6 },
      cook,
    );
    expect(p.sentence).toBe("Change the need “Pots”");
    expect(p.args.expectedVersion).toBe(7);
    expect(p.change).toEqual(["quantity: 6"]);
    const other = await P.update_inventory_need!(
      { needId: NEED, expectedVersion: 7, quantity: 6 },
      { scope: scope(["structures"]), now: new Date() },
    );
    expect(other.blocked).toBe(
      "Only captains and that team's leads can change this.",
    );
  });

  it("says what the caller pledged, and stops withdrawing a pledge they do not have", async () => {
    needs();
    const again = await P.pledge_to_need!({ needId: NEED, quantity: 3 }, plain);
    expect(again.facts).toContain("replaces your pledge of 2");
    vi.mocked(listInventoryNeeds).mockResolvedValue([]);
    const gone = await P.withdraw_my_pledge!({ needId: NEED }, plain);
    expect(gone.blocked).toBe("That need isn't on the list now.");
  });

  it("names whose suggestion a review decides, and stops one already decided", async () => {
    vi.mocked(listPendingProposals).mockResolvedValue([
      {
        id: NEED,
        itemId: ITEM,
        itemName: "Gazebo",
        team: "kitchen",
        status: "pending",
        quantity: 3,
        condition: "broken",
        location: "storage_unit",
        custodianUserId: null,
        custodianName: null,
        storageLocation: null,
        maintenancePerformedAt: null,
        note: null,
        proposedById: ME,
        proposedByName: "Ann",
        reviewedByName: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: new Date(),
      },
    ]);
    const p = await P.review_inventory_change!(
      { updateId: NEED, decision: "approved" },
      cook,
    );
    expect(p.sentence).toBe("Approve Ann's change to “Gazebo”");
    expect(p.facts).toContain("count 3, broken, storage unit");
    vi.mocked(listPendingProposals).mockResolvedValue([]);
    const done = await P.review_inventory_change!(
      { updateId: NEED, decision: "rejected" },
      cook,
    );
    expect(done.blocked).toBe(
      "That suggestion isn't waiting for a review now.",
    );
  });

  it("books only what is left, and cancels only the caller's own booking", async () => {
    const row = {
      itemId: ITEM,
      name: "Gazebo",
      team: "kitchen" as const,
      bookableCount: 1,
      quantity: 1,
      condition: "good" as const,
      lentOut: 0,
      booked: 1,
      myBookingId: null,
    };
    vi.mocked(listBookableItems).mockResolvedValue([row]);
    expect(
      (await P.book_inventory_item!({ itemId: ITEM }, plain)).blocked,
    ).toBe("None is left to book.");
    expect((await P.cancel_my_booking!({ itemId: ITEM }, plain)).blocked).toBe(
      "You have no booking of that item this year.",
    );
    vi.mocked(listBookableItems).mockResolvedValue([
      { ...row, myBookingId: NEED },
    ]);
    const mine = await P.cancel_my_booking!({ itemId: ITEM }, plain);
    expect(mine.sentence).toBe("Cancel your booking of “Gazebo”");
    expect(mine.blocked).toBeUndefined();
  });

  it("stops marking back a loan that is already back", async () => {
    vi.mocked(listInventoryLoans).mockResolvedValue([
      {
        id: NEED,
        itemId: ITEM,
        itemName: "Gazebo",
        team: "kitchen",
        quantity: 1,
        borrowerCamp: "Camp Tea",
        borrowerAddress: "7:30 and C",
        lentAt: new Date(),
        lentByName: null,
        returnedAt: new Date(),
      },
    ]);
    const p = await P.return_inventory_loan!({ loanId: NEED }, cook);
    expect(p.sentence).toBe("Mark 1 × “Gazebo” back from “Camp Tea”");
    expect(p.blocked).toBe("It's already marked as returned.");
  });
});
