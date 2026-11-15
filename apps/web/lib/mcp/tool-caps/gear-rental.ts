import { RENTAL_MANAGER } from "@camp404/core";
import { RENTAL_REFUSAL } from "../../rental-copy";
import { byRule, type Gate, type ToolCapability } from "../gates";

// The captains' gear rental catalogue and tent labels over MCP: the gate is
// the one the page's actions ask at the door (rentalActionGate:
// RENTAL_MANAGER, with its refusal). The rental tools sit under "Claims and
// budgets", beside the website-only "Charge for gear rental": the area of the
// captains' rental page (/captains/gear-rental); a member's own order is
// under "You".

const rental: Gate = {
  who: "Captains",
  allows: byRule(RENTAL_MANAGER),
  refusal: RENTAL_REFUSAL,
};

const CATALOGUE = "/captains/gear-rental/catalogue";

export const GEAR_RENTAL_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  get_gear_rental_catalogue: {
    kind: "read",
    area: "Claims and budgets",
    gate: rental,
    does: "This year's gear rental catalogue with prices, camp stock and reserves, and the camp tents on confirmed orders with their labels.",
    page: CATALOGUE,
  },
  add_rental_item: {
    kind: "write",
    area: "Claims and budgets",
    gate: rental,
    does: "Add an item to this year's gear rental catalogue.",
    page: CATALOGUE,
  },
  update_rental_item: {
    kind: "write",
    area: "Claims and budgets",
    gate: rental,
    does: "Change a gear rental item's name, prices, stock, size or reserve, from the item as you read it.",
    page: CATALOGUE,
  },
  set_tent_label: {
    kind: "write",
    area: "Claims and budgets",
    gate: rental,
    does: "Label a camp tent on a confirmed order (or take the label off), from the label you read.",
    page: "/captains/gear-rental",
  },
};
