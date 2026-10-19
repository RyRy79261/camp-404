// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALREADY_BOOKED,
  CUSTODIAN_UNKNOWN,
  FULLY_BOOKED,
  ITEM_BROKEN,
  ITEM_CHANGED,
  ITEM_GONE,
  LOAN_RETURNED,
  LOAN_TOO_MANY,
  NEED_CHANGED,
  NEED_GONE,
  NONE_FREE,
  NOT_AN_INVENTORY_EDITOR,
  NOT_BOOKABLE,
  NOT_YOUR_BOOKING,
  PROPOSAL_DECIDED,
} from "@camp404/db/inventory";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CONDITIONS,
  INVENTORY_LOCATIONS,
  InventoryItemInput,
  Team,
} from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// The inventory (#246), through lib/inventory.ts, on the database and on the
// E2E store: the same people, the same writes, the same answers and refusal
// sentences. Who may edit is one rule (inventoryEditor) and the booking and
// lending checks one function each (bookingProblem, loanProblem); this holds
// the rest equal. The items are the Kitchen's, so the Kitchen lead is this
// domain's lead and the Finance lead a lead of ANOTHER team, refused. See
// _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  addInventoryItem,
  addInventoryNeed,
  archiveInventoryItem,
  bookInventoryItem,
  cancelInventoryBooking,
  getInventoryItem,
  lendInventoryItem,
  listBookableItems,
  listInventoryItems,
  listInventoryLoans,
  listInventoryNeeds,
  listItemBookings,
  listPendingProposals,
  pledgeToNeed,
  proposeInventoryChange,
  removeInventoryNeed,
  returnInventoryLoan,
  reviewInventoryChange,
  updateInventoryItem,
  updateInventoryNeed,
  withdrawPledge,
} from "../inventory";

const [GOOD, , BROKEN] = INVENTORY_CONDITIONS;
const [STORAGE, HOME] = INVENTORY_LOCATIONS;

const item = (input: Partial<InventoryItemInput> = {}): InventoryItemInput =>
  InventoryItemInput.parse({
    name: "Gas burner",
    team: Team.enum.kitchen,
    category: INVENTORY_CATEGORIES[0],
    condition: GOOD,
    quantity: 3,
    location: STORAGE,
    ...input,
  });

/** The id a write handed back, or a throw naming the refusal. */
function idOf(result: { ok: true; id: string } | { ok: false; error: string }) {
  if (!result.ok) throw new Error(result.error);
  return result.id;
}

describe("the inventory: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("adds, edits and archives an item for a captain or that team's lead only", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const pending = await seed.user("Late", { approval: "pending" });
      const otherLead = await addInventoryItem({
        ...item(),
        actorId: p.financeLead,
      });
      const member = await addInventoryItem({ ...item(), actorId: p.member });
      const notAMember = await addInventoryItem({
        ...item({ location: HOME, custodianUserId: pending }),
        actorId: p.kitchenLead,
      });
      const added = await addInventoryItem({
        ...item({ location: HOME, custodianUserId: p.member }),
        actorId: p.kitchenLead,
      });
      const itemId = idOf(added);
      const edit = (actorId: string, input: Partial<InventoryItemInput> = {}) =>
        updateInventoryItem({
          ...item({ quantity: 4, ...input }),
          itemId,
          expectedVersion: 1,
          actorId,
        });
      const editOtherLead = await edit(p.financeLead);
      const moveToFinance = await edit(p.kitchenLead, {
        team: Team.enum.finance,
      });
      const edited = await edit(p.kitchenLead);
      const stale = await edit(p.captain);
      const gone = await updateInventoryItem({
        ...item(),
        itemId: randomUUID(),
        expectedVersion: 1,
        actorId: p.captain,
      });
      const afterEdit = await getInventoryItem(itemId);
      const second = idOf(
        await addInventoryItem({
          ...item({ name: "Arm chair", team: Team.enum.finance }),
          actorId: p.financeLead,
        }),
      );
      const archiveMember = await archiveInventoryItem({
        actorId: p.member,
        itemId: second,
        expectedVersion: 1,
      });
      const archiveStale = await archiveInventoryItem({
        actorId: p.captain,
        itemId: second,
        expectedVersion: 2,
      });
      const archived = await archiveInventoryItem({
        actorId: p.captain,
        itemId: second,
        expectedVersion: 1,
      });
      const archivedAgain = await archiveInventoryItem({
        actorId: p.captain,
        itemId: second,
        expectedVersion: 2,
      });
      return {
        otherLead,
        member,
        notAMember,
        added,
        editOtherLead,
        moveToFinance,
        edited,
        stale,
        gone,
        afterEdit,
        archiveMember,
        archiveStale,
        archived,
        archivedAgain,
        items: await listInventoryItems(),
        archivedItem: await getInventoryItem(second),
      };
    });
    expect(db).toMatchObject({
      otherLead: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      member: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      notAMember: { ok: false, error: CUSTODIAN_UNKNOWN },
      added: { ok: true },
      editOtherLead: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      moveToFinance: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      edited: { ok: true, version: 2 },
      stale: { ok: false, error: ITEM_CHANGED },
      gone: { ok: false, error: ITEM_GONE },
      afterEdit: { quantity: 4, custodianUserId: null, version: 2 },
      archiveMember: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      archiveStale: { ok: false, error: ITEM_CHANGED },
      archived: { ok: true },
      archivedAgain: { ok: false, error: ITEM_GONE },
      items: [{ name: "Gas burner" }],
      archivedItem: { name: "Arm chair", version: 2 },
    });
    expect(store).toEqual(db);
  });

  it("takes any member's proposed change, and lets only that team's editors review it once", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const itemId = idOf(
        await addInventoryItem({ ...item(), actorId: p.kitchenLead }),
      );
      const proposed = await proposeInventoryChange({
        itemId,
        quantity: 2,
        condition: BROKEN,
        location: STORAGE,
        custodianUserId: null,
        storageLocation: "Shelf 3",
        maintenanceDone: false,
        note: "One cracked",
        actorId: p.member,
      });
      const updateId = idOf(proposed);
      const waiting = await listPendingProposals();
      const review = (actorId: string) =>
        reviewInventoryChange({
          updateId,
          decision: "approved",
          reviewNote: null,
          actorId,
        });
      const otherLead = await review(p.financeLead);
      const member = await review(p.member);
      const approved = await review(p.kitchenLead);
      const again = await review(p.captain);
      const after = await getInventoryItem(itemId);
      return {
        waiting: waiting.map((u) => ({
          itemName: u.itemName,
          team: u.team,
          status: u.status,
          quantity: u.quantity,
          condition: u.condition,
          storageLocation: u.storageLocation,
          note: u.note,
          proposedById: u.proposedById,
          proposedByName: u.proposedByName,
        })),
        otherLead,
        member,
        approved,
        again,
        after: {
          quantity: after?.quantity,
          condition: after?.condition,
          storageLocation: after?.storageLocation,
          version: after?.version,
        },
        stillWaiting: await listPendingProposals(),
      };
    });
    expect(db).toMatchObject({
      waiting: [{ quantity: 2, status: "pending", proposedById: "@member" }],
      otherLead: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      member: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      approved: { ok: true },
      again: { ok: false, error: PROPOSAL_DECIDED },
      after: { quantity: 2, condition: BROKEN, version: 2 },
      stillWaiting: [],
    });
    expect(store).toEqual(db);
  });

  it("keeps a team's needs for its editors, and every member's own pledge", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const itemId = idOf(
        await addInventoryItem({ ...item(), actorId: p.kitchenLead }),
      );
      const need = {
        team: Team.enum.kitchen,
        name: "Burners",
        quantity: 6,
        itemId,
        boughtQuantity: 1,
        note: null,
      };
      const otherLead = await addInventoryNeed({
        ...need,
        actorId: p.financeLead,
      });
      const noItem = await addInventoryNeed({
        ...need,
        itemId: randomUUID(),
        actorId: p.kitchenLead,
      });
      const needId = idOf(
        await addInventoryNeed({ ...need, actorId: p.kitchenLead }),
      );
      await pledgeToNeed({
        needId,
        quantity: 1,
        note: null,
        actorId: p.member,
      });
      await pledgeToNeed({
        needId,
        quantity: 2,
        note: "Two of mine",
        actorId: p.member,
      });
      await pledgeToNeed({ needId, quantity: 1, note: null, actorId: p.other });
      const pledged = await listInventoryNeeds();
      await withdrawPledge({ needId, actorId: p.other });
      const pledgeGone = await pledgeToNeed({
        needId: randomUUID(),
        quantity: 1,
        note: null,
        actorId: p.member,
      });
      const edit = (actorId: string, expectedVersion = 1) =>
        updateInventoryNeed({
          ...need,
          quantity: 8,
          needId,
          expectedVersion,
          actorId,
        });
      const editMember = await edit(p.member);
      const edited = await edit(p.captain);
      const stale = await edit(p.kitchenLead);
      const removeOtherLead = await removeInventoryNeed({
        actorId: p.financeLead,
        needId,
        expectedVersion: 2,
      });
      const removeStale = await removeInventoryNeed({
        actorId: p.kitchenLead,
        needId,
        expectedVersion: 1,
      });
      const afterEdit = await listInventoryNeeds();
      const removed = await removeInventoryNeed({
        actorId: p.kitchenLead,
        needId,
        expectedVersion: 2,
      });
      const withdrawGone = await withdrawPledge({
        needId,
        actorId: p.member,
      });
      return {
        otherLead,
        noItem,
        pledged,
        pledgeGone,
        editMember,
        edited,
        stale,
        removeOtherLead,
        removeStale,
        afterEdit,
        removed,
        withdrawGone,
        needs: await listInventoryNeeds(),
      };
    });
    expect(db).toMatchObject({
      otherLead: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      noItem: { ok: false, error: ITEM_GONE },
      pledged: [
        {
          name: "Burners",
          have: 3,
          pledges: [
            { userId: "@member", quantity: 2, note: "Two of mine" },
            { userId: "@other", quantity: 1 },
          ],
        },
      ],
      pledgeGone: { ok: false, error: NEED_GONE },
      editMember: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      edited: { ok: true },
      stale: { ok: false, error: NEED_CHANGED },
      removeOtherLead: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      removeStale: { ok: false, error: NEED_CHANGED },
      afterEdit: [
        { quantity: 8, version: 2, pledges: [{ userId: "@member" }] },
      ],
      removed: { ok: true },
      withdrawGone: { ok: false, error: NEED_GONE },
      needs: [],
    });
    expect(store).toEqual(db);
  });

  it("books one each up to the limit, less what is lent out, and lends no more than the camp has", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const third = await seed.user("Moss");
      const plain = idOf(
        await addInventoryItem({ ...item(), actorId: p.kitchenLead }),
      );
      const itemId = idOf(
        await addInventoryItem({
          ...item({ name: "Shade tent", bookableCount: 2 }),
          actorId: p.kitchenLead,
        }),
      );
      const broken = idOf(
        await addInventoryItem({
          ...item({ name: "Cooler", bookableCount: 5, condition: BROKEN }),
          actorId: p.kitchenLead,
        }),
      );
      const book = (actorId: string, id = itemId) =>
        bookInventoryItem({ itemId: id, note: null, actorId });
      const notBookable = await book(p.member, plain);
      const brokenOne = await book(p.member, broken);
      const first = await book(p.member);
      const twice = await book(p.member);
      const lendMember = await lendInventoryItem({
        itemId,
        quantity: 1,
        borrowerCamp: "Camp Dust",
        borrowerAddress: "7:30 and C",
        actorId: p.member,
      });
      const lendTooMany = await lendInventoryItem({
        itemId,
        quantity: 4,
        borrowerCamp: "Camp Dust",
        borrowerAddress: "7:30 and C",
        actorId: p.kitchenLead,
      });
      const lent = await lendInventoryItem({
        itemId,
        quantity: 2,
        borrowerCamp: "Camp Dust",
        borrowerAddress: "7:30 and C",
        actorId: p.kitchenLead,
      });
      const noneFree = await book(p.other);
      const loanId = idOf(lent);
      const returnMember = await returnInventoryLoan({
        actorId: p.member,
        loanId,
      });
      const returned = await returnInventoryLoan({
        actorId: p.captain,
        loanId,
      });
      const returnedAgain = await returnInventoryLoan({
        actorId: p.captain,
        loanId,
      });
      const second = await book(p.other);
      const full = await book(third);
      const bookable = await listBookableItems(p.member);
      const named = await listItemBookings(itemId, p.kitchenLead, true);
      const unnamed = await listItemBookings(itemId, p.member, false);
      const otherBooking = (unnamed.find((b) => !b.mine) ?? unnamed[0])!.id;
      const cancelMember = await cancelInventoryBooking({
        actorId: p.member,
        bookingId: otherBooking,
      });
      const cancelOtherLead = await cancelInventoryBooking({
        actorId: p.financeLead,
        bookingId: otherBooking,
      });
      const cancelled = await cancelInventoryBooking({
        actorId: p.kitchenLead,
        bookingId: otherBooking,
      });
      return {
        notBookable,
        brokenOne,
        first,
        twice,
        lendMember,
        lendTooMany,
        lent,
        noneFree,
        returnMember,
        returned,
        returnedAgain,
        second,
        full,
        bookable,
        named,
        unnamed,
        cancelMember,
        cancelOtherLead,
        cancelled,
        afterCancel: await listItemBookings(itemId, p.captain, true),
        loans: await listInventoryLoans(itemId),
      };
    });
    expect(db).toMatchObject({
      notBookable: { ok: false, error: NOT_BOOKABLE },
      brokenOne: { ok: false, error: ITEM_BROKEN },
      first: { ok: true },
      twice: { ok: false, error: ALREADY_BOOKED },
      lendMember: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      lendTooMany: { ok: false, error: LOAN_TOO_MANY },
      lent: { ok: true },
      noneFree: { ok: false, error: NONE_FREE },
      returnMember: { ok: false, error: NOT_AN_INVENTORY_EDITOR },
      returned: { ok: true },
      returnedAgain: { ok: false, error: LOAN_RETURNED },
      second: { ok: true },
      full: { ok: false, error: FULLY_BOOKED },
      named: [{ userId: "@member" }, { userId: "@other" }],
      unnamed: [{ mine: true }, { userId: null, displayName: null }],
      cancelMember: { ok: false, error: NOT_YOUR_BOOKING },
      cancelOtherLead: { ok: false, error: NOT_YOUR_BOOKING },
      cancelled: { ok: true },
      afterCancel: [{ userId: "@member" }],
    });
    expect(store).toEqual(db);
  });
});
