import "server-only";

import { revalidatePath } from "next/cache";
import { revalidateDues } from "./dues-revalidate";
import {
  MY_GEAR_PATH,
  RENTAL_CATALOGUE_PATH,
  RENTAL_PATH,
  RENTAL_PRINT_PATH,
  RENTAL_SUMMARY_PATH,
} from "./rental-copy";

/**
 * After a gear rental write: the member's page, the captains' tools and the
 * print sheets. `money` also refreshes the dues pages, for a confirmation or
 * a reopening, which change what a member owes.
 */
export function revalidateRental(options: { money?: boolean } = {}): void {
  for (const path of [
    MY_GEAR_PATH,
    RENTAL_PATH,
    RENTAL_SUMMARY_PATH,
    RENTAL_CATALOGUE_PATH,
    RENTAL_PRINT_PATH,
  ]) {
    revalidatePath(path);
  }
  revalidatePath(`${RENTAL_PATH}/orders/[userId]`, "page");
  if (options.money) revalidateDues();
}
