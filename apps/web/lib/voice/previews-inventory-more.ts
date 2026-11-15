import { inventoryEditor } from "@camp404/core";
import {
  getInventoryItem,
  listBookableItems,
  listInventoryLoans,
  listInventoryNeeds,
  listPendingProposals,
} from "../inventory";
import {
  bookingState,
  CONDITION_LABELS,
  INVENTORY_BOOKINGS_PATH,
  INVENTORY_LOANS_PATH,
  INVENTORY_NEEDS_PATH,
  LOCATION_LABELS,
  inventoryItemPath,
} from "../inventory-copy";
import { scopeActor } from "../mcp/scope";
import { readTeamLabels } from "./reads";
import {
  blocked,
  quote,
  shown,
  str,
  type Args,
  type PreviewCtx,
  type PreviewFn,
} from "./preview-kit";

// The Inventory page's needs, pledges, bookings, loans and reviews: each
// preview reads the real need, item, suggestion or loan, writes the row from
// it, fills in the version a need's edit names, and says when the person
// cannot do it for that team (the write would refuse it too).

const NOT_EDITOR = "Only captains and that team's leads can change this.";

const mayEdit = (ctx: PreviewCtx, team: string) =>
  inventoryEditor(team as Parameters<typeof inventoryEditor>[0]).allows(
    scopeActor(ctx.scope),
  );

async function findNeed(id: string) {
  return (await listInventoryNeeds()).find((n) => n.id === id) ?? null;
}

const goneNeed = (sentence: string, args: Args) =>
  blocked(
    sentence,
    "That need isn't on the list now.",
    args,
    INVENTORY_NEEDS_PATH,
  );

export const INVENTORY_MORE_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async review_inventory_change(args, ctx) {
    const approve = str(args.decision) === "approved";
    const proposal = (await listPendingProposals()).find(
      (p) => p.id === str(args.updateId),
    );
    if (!proposal) {
      return blocked(
        approve ? "Approve a suggested change" : "Turn down a suggested change",
        "That suggestion isn't waiting for a review now.",
        args,
        "/inventory",
      );
    }
    const sentence = `${approve ? "Approve" : "Turn down"} ${proposal.proposedByName ?? "a member"}'s change to ${quote(proposal.itemName)}`;
    if (!mayEdit(ctx, proposal.team)) {
      return blocked(sentence, NOT_EDITOR, args, "/inventory");
    }
    const item = proposal.itemId
      ? await getInventoryItem(proposal.itemId)
      : null;
    const to = [
      `count ${proposal.quantity}`,
      proposal.condition
        ? CONDITION_LABELS[proposal.condition].toLowerCase()
        : null,
      proposal.location
        ? LOCATION_LABELS[proposal.location].toLowerCase()
        : null,
      proposal.storageLocation,
    ].filter(Boolean);
    return {
      sentence,
      facts: `Inventory · suggested: ${to.join(", ")}${item ? ` · now ${item.quantity}, ${CONDITION_LABELS[item.condition].toLowerCase()}, ${LOCATION_LABELS[item.location].toLowerCase()}` : ""}`,
      ...(args.reviewNote
        ? { change: [`Note: ${shown(args.reviewNote)}`] }
        : {}),
      path: proposal.itemId ? inventoryItemPath(proposal.itemId) : "/inventory",
      args,
      keys: [`suggestion:${proposal.id}`, `item:${proposal.itemId ?? ""}`],
    };
  },

  async add_inventory_need(args, ctx) {
    const labels = await readTeamLabels();
    const team = str(args.team);
    const sentence = `Add a need to ${labels[team] ?? team}: ${args.quantity} × ${quote(str(args.name))}`;
    if (!mayEdit(ctx, team)) {
      return blocked(sentence, NOT_EDITOR, args, INVENTORY_NEEDS_PATH);
    }
    const item = args.itemId ? await getInventoryItem(str(args.itemId)) : null;
    return {
      sentence,
      facts: `Inventory · needs this year${item ? ` · covered by ${quote(item.name)}` : ""}${typeof args.boughtQuantity === "number" && args.boughtQuantity > 0 ? ` · ${args.boughtQuantity} bought` : ""}`,
      ...(args.note ? { change: [`Note: ${shown(args.note)}`] } : {}),
      path: INVENTORY_NEEDS_PATH,
      args,
      keys: [],
    };
  },

  async update_inventory_need(args, ctx) {
    const need = await findNeed(str(args.needId));
    if (!need) return goneNeed("Change a team's need", args);
    const sentence = `Change the need ${quote(need.name)}`;
    if (!mayEdit(ctx, need.team)) {
      return blocked(sentence, NOT_EDITOR, args, INVENTORY_NEEDS_PATH);
    }
    const change = Object.entries(args)
      .filter(([key]) => key !== "needId" && key !== "expectedVersion")
      .map(([key, value]) => `${key}: ${shown(value)}`);
    return {
      sentence,
      facts: `Inventory · now ${need.quantity} needed, ${need.boughtQuantity} bought, ${need.have} the camp has`,
      change,
      path: INVENTORY_NEEDS_PATH,
      args: { ...args, expectedVersion: need.version },
      keys: [`need:${need.id}`],
    };
  },

  async pledge_to_need(args, ctx) {
    const need = await findNeed(str(args.needId));
    if (!need) return goneNeed("Pledge to bring something", args);
    const mine = need.pledges.find((p) => p.userId === ctx.scope.campUserId);
    return {
      sentence: `Say you'll bring ${args.quantity} × ${quote(need.name)}`,
      facts: `Inventory · ${need.quantity} needed${mine ? ` · replaces your pledge of ${mine.quantity}` : ""}`,
      ...(args.note ? { change: [`Note: ${shown(args.note)}`] } : {}),
      path: INVENTORY_NEEDS_PATH,
      args,
      keys: [`pledge:${need.id}`],
    };
  },

  async withdraw_my_pledge(args, ctx) {
    const need = await findNeed(str(args.needId));
    if (!need) return goneNeed("Take back your pledge", args);
    const mine = need.pledges.find((p) => p.userId === ctx.scope.campUserId);
    const sentence = `Take back your pledge to bring ${quote(need.name)}`;
    if (!mine) {
      return blocked(
        sentence,
        "You have no pledge on that need.",
        args,
        INVENTORY_NEEDS_PATH,
      );
    }
    return {
      sentence,
      facts: `Inventory · you said you'd bring ${mine.quantity}`,
      path: INVENTORY_NEEDS_PATH,
      args,
      keys: [`pledge:${need.id}`],
    };
  },

  async book_inventory_item(args, ctx) {
    const item = (await listBookableItems(ctx.scope.campUserId)).find(
      (i) => i.itemId === str(args.itemId),
    );
    if (!item) {
      return blocked(
        "Book an item of gear",
        "That item can't be booked.",
        args,
        INVENTORY_BOOKINGS_PATH,
      );
    }
    const sentence = `Book ${quote(item.name)} for you for this burn`;
    if (item.myBookingId) {
      return blocked(
        sentence,
        "You've already booked this.",
        args,
        INVENTORY_BOOKINGS_PATH,
      );
    }
    const state = bookingState(item);
    return {
      sentence,
      facts: `Inventory · ${state.left} left · ${state.why}`,
      ...(args.note ? { change: [`Note: ${shown(args.note)}`] } : {}),
      path: INVENTORY_BOOKINGS_PATH,
      args,
      keys: [`booking:${item.itemId}`],
      ...(state.left === 0 ? { blocked: "None is left to book." } : {}),
    };
  },

  async cancel_my_booking(args, ctx) {
    const item = (await listBookableItems(ctx.scope.campUserId)).find(
      (i) => i.itemId === str(args.itemId),
    );
    const sentence = item
      ? `Cancel your booking of ${quote(item.name)}`
      : "Cancel your booking";
    if (!item?.myBookingId) {
      return blocked(
        sentence,
        "You have no booking of that item this year.",
        args,
        INVENTORY_BOOKINGS_PATH,
      );
    }
    return {
      sentence,
      facts: "Inventory · someone else may book it then",
      path: INVENTORY_BOOKINGS_PATH,
      args,
      keys: [`booking:${item.itemId}`],
    };
  },

  async lend_inventory_item(args, ctx) {
    const item = await getInventoryItem(str(args.itemId));
    if (!item || item.archivedAt) {
      return blocked(
        "Lend gear to another camp",
        "That gear item isn't in the inventory.",
        args,
        INVENTORY_LOANS_PATH,
      );
    }
    const sentence = `Lend ${args.quantity} × ${quote(item.name)} to ${quote(str(args.borrowerCamp))} at ${quote(str(args.borrowerAddress))}`;
    if (!mayEdit(ctx, item.team)) {
      return blocked(sentence, NOT_EDITOR, args, INVENTORY_LOANS_PATH);
    }
    const out = (await listInventoryLoans(item.id))
      .filter((l) => l.returnedAt === null)
      .reduce((sum, l) => sum + l.quantity, 0);
    return {
      sentence,
      facts: `Inventory · the camp has ${item.quantity}${out > 0 ? `, ${out} already lent out` : ""}`,
      path: INVENTORY_LOANS_PATH,
      args,
      keys: [`item:${item.id}`],
    };
  },

  async return_inventory_loan(args, ctx) {
    const loan = (await listInventoryLoans()).find(
      (l) => l.id === str(args.loanId),
    );
    if (!loan) {
      return blocked(
        "Mark lent gear as back",
        "That loan isn't there now.",
        args,
        INVENTORY_LOANS_PATH,
      );
    }
    const sentence = `Mark ${loan.quantity} × ${quote(loan.itemName)} back from ${quote(loan.borrowerCamp)}`;
    if (loan.returnedAt !== null) {
      return blocked(
        sentence,
        "It's already marked as returned.",
        args,
        INVENTORY_LOANS_PATH,
      );
    }
    if (!mayEdit(ctx, loan.team)) {
      return blocked(sentence, NOT_EDITOR, args, INVENTORY_LOANS_PATH);
    }
    return {
      sentence,
      facts: `Inventory · lent at ${quote(loan.borrowerAddress)}`,
      path: INVENTORY_LOANS_PATH,
      args,
      keys: [`loan:${loan.id}`, `item:${loan.itemId}`],
    };
  },
};
