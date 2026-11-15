import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { inventoryEditor } from "@camp404/core";
import { NEED_CHANGED, NEED_GONE } from "@camp404/db/inventory";
import {
  EditInventoryNeedInput,
  InventoryBookingInput,
  InventoryLoanInput,
  InventoryNeedInput,
  InventoryPledgeInput,
  InventoryReviewInput,
} from "@camp404/types";
import { getTeamsConfig, teamLabelMap } from "../../camp-config";
import {
  addInventoryNeed,
  bookInventoryItem,
  cancelInventoryBooking,
  lendInventoryItem,
  listBookableItems,
  listInventoryLoans,
  listInventoryNeeds,
  listPendingProposals,
  pledgeToNeed,
  returnInventoryLoan,
  reviewInventoryChange,
  updateInventoryNeed,
  withdrawPledge,
} from "../../inventory";
import {
  bookingState,
  CHECK_CHANGE,
  CHECK_ITEM,
  CHECK_LOAN,
  CHECK_NEED,
  INVENTORY_BOOKINGS_PATH,
  INVENTORY_LOANS_PATH,
  INVENTORY_NEEDS_PATH,
  inventoryItemPath,
} from "../../inventory-copy";
import { siteUrl } from "../capabilities";
import { scopeActor } from "../scope";
import { runTool, ToolError } from "../tool-utils";

// The Inventory page's needs, pledges, bookings, loans and suggestion reviews
// over MCP (#246), each the page's own write (lib/inventory.ts, through
// twin() so E2E's store answers too) with the signed-in person's id alone.
// Who may decide on a team's gear (a captain or a lead of that team) is the
// write's own check, inside its transaction (inventoryEditor on the item's or
// the need's team); nothing here passes a rank or a team list.
//
//  - Reviewing a suggestion is a compare-and-set on it still waiting, with its
//    audit row, as on the page.
//  - A need's edit takes only what changes and fills the rest from the need
//    AT the version the caller read; the write compares the version again.
//  - A pledge, a booking and their undo are always the caller's own: the
//    booking to cancel is found from the caller's own bookings, never taken
//    by id (the page lets an editor cancel anyone's; that stays there).
//  - A loan names the borrowing camp and its site address only, never a
//    person (InventoryLoanInput has nowhere to type one).
//  - Archiving an item and taking a need off the list stay on the page.

const firstIssue = (error: z.ZodError, fallback: string) =>
  error.issues[0]?.message ?? fallback;

const NO_BOOKING = "You have no booking of that item this year.";
const NO_PLEDGE = "You have no pledge on that need.";

/** The caller's own pledge on a need, without their id. */
function ownPledge(
  pledges: readonly { userId: string; quantity: number; note: string | null }[],
  userId: string,
): { quantity: number; note: string | null } | null {
  const mine = pledges.find((p) => p.userId === userId);
  return mine ? { quantity: mine.quantity, note: mine.note } : null;
}

/** The fields a need's Edit dialog sends. */
const NEED_KEYS = [
  "team",
  "name",
  "quantity",
  "itemId",
  "boughtQuantity",
  "note",
] as const;

export function registerInventoryMoreTools(server: McpServer): void {
  server.registerTool(
    "list_inventory_needs",
    {
      title: "List the teams' needs",
      description:
        "This year's needs as the Needs page lists them: per team, how many are needed, the camp's item that covers it and how many it has, how many were bought, and who pledged to bring what. `version` is what update_inventory_need takes; `youMayEdit` says whether you may change it; `myPledge` is your own.",
      inputSchema: z.object({ team: z.string().max(80).optional() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "list_inventory_needs",
        extra,
        argsForAudit: { team: args.team ?? null },
        handler: async ({ scope }) => {
          const [needs, config] = await Promise.all([
            listInventoryNeeds(),
            getTeamsConfig(),
          ]);
          const labels = teamLabelMap(config);
          const actor = scopeActor(scope);
          return {
            needs: needs
              .filter((n) => !args.team || n.team === args.team)
              .map((n) => ({
                id: n.id,
                team: n.team,
                teamLabel: labels[n.team] ?? n.team,
                name: n.name,
                quantity: n.quantity,
                itemId: n.itemId,
                itemName: n.itemName,
                have: n.have,
                bought: n.boughtQuantity,
                pledged: n.pledges.reduce((sum, p) => sum + p.quantity, 0),
                note: n.note,
                pledges: n.pledges.map((p) => ({
                  name: p.displayName,
                  quantity: p.quantity,
                  note: p.note,
                })),
                myPledge: ownPledge(n.pledges, scope.campUserId),
                version: n.version,
                youMayEdit: inventoryEditor(n.team).allows(actor),
              })),
            url: siteUrl(INVENTORY_NEEDS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "list_bookable_gear",
    {
      title: "List gear you can book",
      description:
        "The gear members can book for the burn, as the Bookings page shows it: how many may be booked, how many are free now and left, why some are not (broken, lent out), and `myBooking`: whether you have booked it.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_bookable_gear",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const items = await listBookableItems(scope.campUserId);
          return {
            items: items.map((i) => {
              const state = bookingState(i);
              return {
                itemId: i.itemId,
                name: i.name,
                team: i.team,
                bookable: i.bookableCount,
                booked: i.booked,
                left: state.left,
                why: state.why,
                myBooking: i.myBookingId !== null,
                url: siteUrl(inventoryItemPath(i.itemId)),
              };
            }),
            url: siteUrl(INVENTORY_BOOKINGS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "list_inventory_loans",
    {
      title: "List gear lent out",
      description:
        "Gear lent to other camps, as the Lent out page lists it: open loans first (they carry over into a new year), then this year's returned ones. Each names the item, how many, the borrowing camp and its site address, and `returnedAt`. `id` is what return_inventory_loan takes.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_inventory_loans",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const loans = await listInventoryLoans();
          const actor = scopeActor(scope);
          return {
            loans: loans.map((l) => ({
              id: l.id,
              itemId: l.itemId,
              itemName: l.itemName,
              team: l.team,
              quantity: l.quantity,
              borrowerCamp: l.borrowerCamp,
              borrowerAddress: l.borrowerAddress,
              lentAt: l.lentAt,
              lentBy: l.lentByName,
              returnedAt: l.returnedAt,
              youMayMarkReturned:
                l.returnedAt === null && inventoryEditor(l.team).allows(actor),
            })),
            url: siteUrl(INVENTORY_LOANS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "review_inventory_change",
    {
      title: "Approve or turn down a suggested change",
      description:
        "Decides a change a member suggested to an item (list_inventory_items' `toReview`): `decision` approved (the item takes the count, condition and place) or rejected, with an optional `reviewNote`. Only a captain or a lead of the item's team; if someone decided it first, it is refused.",
      inputSchema: z.object({
        updateId: z.string(),
        decision: z.enum(["approved", "rejected"]),
        reviewNote: z.string().max(300).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "review_inventory_change",
        extra,
        argsForAudit: { updateId: args.updateId, decision: args.decision },
        handler: async ({ scope }) => {
          const parsed = InventoryReviewInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_CHANGE));
          }
          const proposal = (await listPendingProposals()).find(
            (p) => p.id === parsed.data.updateId,
          );
          const result = await reviewInventoryChange({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            updateId: parsed.data.updateId,
            decision: parsed.data.decision,
            item: proposal?.itemName ?? null,
            url: proposal?.itemId
              ? siteUrl(inventoryItemPath(proposal.itemId))
              : null,
          };
        },
      }),
  );

  server.registerTool(
    "add_inventory_need",
    {
      title: "Add a team's need",
      description:
        "Adds one of a team's needs for this year, for a team you may edit (a captain any team, a lead their own): `name`, `quantity`, optionally the camp's `itemId` that covers it, how many were already bought (`boughtQuantity`) and a `note`.",
      inputSchema: z.object({
        team: z.string().max(80),
        name: z.string().min(1).max(80),
        quantity: z.number().int().min(1),
        itemId: z.string().nullable().optional(),
        boughtQuantity: z.number().int().min(0).optional(),
        note: z.string().max(300).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "add_inventory_need",
        extra,
        argsForAudit: { team: args.team },
        handler: async ({ scope }) => {
          const parsed = InventoryNeedInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_NEED));
          }
          const result = await addInventoryNeed({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: result.id,
            team: parsed.data.team,
            name: parsed.data.name,
            url: siteUrl(INVENTORY_NEEDS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "update_inventory_need",
    {
      title: "Change a team's need",
      description:
        "Changes a need as the Needs page's Edit does, for a team you may edit. Give `needId`, the `expectedVersion` you read (list_inventory_needs) and only the fields that change; null clears `itemId` or `note`. If someone changed it since, it is refused: read again.",
      inputSchema: z.object({
        needId: z.string(),
        expectedVersion: z.number().int().min(1),
        team: z.string().max(80).optional(),
        name: z.string().min(1).max(80).optional(),
        quantity: z.number().int().min(1).optional(),
        itemId: z.string().nullable().optional(),
        boughtQuantity: z.number().int().min(0).optional(),
        note: z.string().max(300).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_inventory_need",
        extra,
        argsForAudit: {
          needId: args.needId,
          expectedVersion: args.expectedVersion,
          fields: NEED_KEYS.filter((k) => args[k] !== undefined),
        },
        handler: async ({ scope }) => {
          const need = (await listInventoryNeeds()).find(
            (n) => n.id === args.needId,
          );
          if (!need) throw new ToolError(NEED_GONE);
          if (need.version !== args.expectedVersion) {
            throw new ToolError(NEED_CHANGED);
          }
          const now: Record<(typeof NEED_KEYS)[number], unknown> = {
            team: need.team,
            name: need.name,
            quantity: need.quantity,
            itemId: need.itemId,
            boughtQuantity: need.boughtQuantity,
            note: need.note,
          };
          const whole: Record<string, unknown> = {
            needId: args.needId,
            expectedVersion: args.expectedVersion,
          };
          for (const key of NEED_KEYS) {
            whole[key] = args[key] !== undefined ? args[key] : now[key];
          }
          const parsed = EditInventoryNeedInput.safeParse(whole);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_NEED));
          }
          const result = await updateInventoryNeed({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: args.needId,
            name: parsed.data.name,
            version: args.expectedVersion + 1,
            url: siteUrl(INVENTORY_NEEDS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "pledge_to_need",
    {
      title: "Pledge to bring something",
      description:
        "Says you will bring `quantity` of what a team needs (`needId` from list_inventory_needs), with an optional `note`. Pledging again changes your pledge. Always your own pledge.",
      inputSchema: z.object({
        needId: z.string(),
        quantity: z.number().int().min(1),
        note: z.string().max(200).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "pledge_to_need",
        extra,
        argsForAudit: { needId: args.needId, quantity: args.quantity },
        handler: async ({ scope }) => {
          const parsed = InventoryPledgeInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_NEED));
          }
          const result = await pledgeToNeed({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            needId: parsed.data.needId,
            quantity: parsed.data.quantity,
            url: siteUrl(INVENTORY_NEEDS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "withdraw_my_pledge",
    {
      title: "Take back your pledge",
      description:
        "Takes back your own pledge to a need (`needId`). Pledging again puts it back.",
      inputSchema: z.object({ needId: z.string() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "withdraw_my_pledge",
        extra,
        argsForAudit: { needId: args.needId },
        handler: async ({ scope }) => {
          const need = (await listInventoryNeeds()).find(
            (n) => n.id === args.needId,
          );
          if (!need) throw new ToolError(NEED_GONE);
          if (!need.pledges.some((p) => p.userId === scope.campUserId)) {
            throw new ToolError(NO_PLEDGE);
          }
          const result = await withdrawPledge({
            needId: args.needId,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { needId: args.needId, url: siteUrl(INVENTORY_NEEDS_PATH) };
        },
      }),
  );

  server.registerTool(
    "book_inventory_item",
    {
      title: "Book an item of gear",
      description:
        "Books one of a bookable item (list_bookable_gear's `itemId`) for you for this burn, with an optional `note`. Refused when none is left, it is broken, or you already booked it.",
      inputSchema: z.object({
        itemId: z.string(),
        note: z.string().max(200).nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "book_inventory_item",
        extra,
        argsForAudit: { itemId: args.itemId },
        handler: async ({ scope }) => {
          const parsed = InventoryBookingInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_ITEM));
          }
          const result = await bookInventoryItem({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: result.id,
            itemId: parsed.data.itemId,
            url: siteUrl(INVENTORY_BOOKINGS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "cancel_my_booking",
    {
      title: "Cancel your booking",
      description:
        "Cancels your own booking of an item (`itemId` from list_bookable_gear). Booking it again is book_inventory_item, if one is still free.",
      inputSchema: z.object({ itemId: z.string() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "cancel_my_booking",
        extra,
        argsForAudit: { itemId: args.itemId },
        handler: async ({ scope }) => {
          const item = (await listBookableItems(scope.campUserId)).find(
            (i) => i.itemId === args.itemId,
          );
          if (!item?.myBookingId) throw new ToolError(NO_BOOKING);
          const result = await cancelInventoryBooking({
            bookingId: item.myBookingId,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            itemId: args.itemId,
            name: item.name,
            url: siteUrl(INVENTORY_BOOKINGS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "lend_inventory_item",
    {
      title: "Lend gear to another camp",
      description:
        "Logs `quantity` of an item (of a team you may edit) as lent to another camp: the camp's name (`borrowerCamp`) and its site address (`borrowerAddress`) only, never a person's name or number. Refused when the camp does not have that many here.",
      inputSchema: z.object({
        itemId: z.string(),
        quantity: z.number().int().min(1),
        borrowerCamp: z.string().min(1).max(80),
        borrowerAddress: z.string().min(1).max(80),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "lend_inventory_item",
        extra,
        argsForAudit: { itemId: args.itemId, quantity: args.quantity },
        handler: async ({ scope }) => {
          const parsed = InventoryLoanInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_LOAN));
          }
          const result = await lendInventoryItem({
            ...parsed.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: result.id,
            itemId: parsed.data.itemId,
            url: siteUrl(INVENTORY_LOANS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "return_inventory_loan",
    {
      title: "Mark lent gear as back",
      description:
        "Marks a loan to another camp as returned (`loanId` from list_inventory_loans), for gear of a team you may edit. Refused if it is already marked back.",
      inputSchema: z.object({ loanId: z.string() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "return_inventory_loan",
        extra,
        argsForAudit: { loanId: args.loanId },
        handler: async ({ scope }) => {
          const result = await returnInventoryLoan({
            loanId: args.loanId,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { loanId: args.loanId, url: siteUrl(INVENTORY_LOANS_PATH) };
        },
      }),
  );
}
