// Gear rental's paths and shared sentences (#241). A plain module, not a
// "use server" file, so pages, actions and components can all import it.

/** The member's own gear order. */
export const MY_GEAR_PATH = "/gear";
/** The captains' tools: the orders first. */
export const RENTAL_PATH = "/captains/gear-rental";
export const RENTAL_SUMMARY_PATH = "/captains/gear-rental/summary";
export const RENTAL_CATALOGUE_PATH = "/captains/gear-rental/catalogue";
/** The sheets to print: what to order, what to take out, and the tents. */
export const RENTAL_PRINT_PATH = "/print/gear-rental";

/** One member's order in the captains' tools. */
export function rentalOrderPath(userId: string): string {
  return `${RENTAL_PATH}/orders/${encodeURIComponent(userId)}`;
}

/** Said to anyone who is not a captain. */
export const RENTAL_REFUSAL = "Gear rental is for captains.";

/** The tabs across the top of the captains' tools, in order. */
export const RENTAL_TABS = [
  { href: RENTAL_PATH, label: "Orders" },
  { href: RENTAL_SUMMARY_PATH, label: "Summary" },
  { href: RENTAL_CATALOGUE_PATH, label: "Catalogue" },
] as const;
