import { GATES, type ToolCapability } from "../gates";

// The Inventory page's needs, pledges, bookings, loans and suggestion reviews
// over MCP. Each gate is the page's own door: every inventory action is open
// to any approved member at the door (inventory/actions.ts `act`), and which
// team's gear a person may decide on, lend or keep needs for is the write's
// own check (inventoryEditor on the item's or need's team, inside its
// transaction). The tools that only an editor can ever use say so with
// GATES.inventoryEditor, so what_can_i_do does not offer them to a member.

const PAGE = "/inventory";

export const INVENTORY_MORE_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  list_inventory_needs: {
    kind: "read",
    area: "Inventory",
    gate: GATES.member,
    does: "This year's needs by team, what covers each, and who pledged to bring what.",
    page: "/inventory/needs",
  },
  list_bookable_gear: {
    kind: "read",
    area: "Inventory",
    gate: GATES.member,
    does: "Gear members can book for the burn, how many are free, and your own bookings.",
    page: "/inventory/bookings",
  },
  list_inventory_loans: {
    kind: "read",
    area: "Inventory",
    gate: GATES.member,
    does: "Gear lent to other camps this year: which camp, where, and whether it is back.",
    page: "/inventory/lent",
  },
  review_inventory_change: {
    kind: "write",
    area: "Inventory",
    gate: GATES.inventoryEditor,
    does: "Approve or turn down a suggested change to an item of a team you may edit.",
    page: PAGE,
  },
  add_inventory_need: {
    kind: "write",
    area: "Inventory",
    gate: GATES.inventoryEditor,
    does: "Add one of a team's needs for this year (captains: any team; leads: their own).",
    page: "/inventory/needs",
  },
  update_inventory_need: {
    kind: "write",
    area: "Inventory",
    gate: GATES.inventoryEditor,
    does: "Change a team's need, on the version you read.",
    page: "/inventory/needs",
  },
  pledge_to_need: {
    kind: "write",
    area: "Inventory",
    gate: GATES.member,
    does: "Say you will bring some of what a team needs (pledging again changes your pledge).",
    page: "/inventory/needs",
  },
  withdraw_my_pledge: {
    kind: "write",
    area: "Inventory",
    gate: GATES.member,
    does: "Take back your own pledge to a need.",
    page: "/inventory/needs",
  },
  book_inventory_item: {
    kind: "write",
    area: "Inventory",
    gate: GATES.member,
    does: "Book one of a bookable item for yourself for this burn.",
    page: "/inventory/bookings",
  },
  cancel_my_booking: {
    kind: "write",
    area: "Inventory",
    gate: GATES.member,
    does: "Cancel your own booking of an item.",
    page: "/inventory/bookings",
  },
  lend_inventory_item: {
    kind: "write",
    area: "Inventory",
    gate: GATES.inventoryEditor,
    does: "Log gear of a team you may edit as lent to another camp (their camp and site address only).",
    page: "/inventory/lent",
  },
  return_inventory_loan: {
    kind: "write",
    area: "Inventory",
    gate: GATES.inventoryEditor,
    does: "Mark gear lent to another camp as back.",
    page: "/inventory/lent",
  },
};
