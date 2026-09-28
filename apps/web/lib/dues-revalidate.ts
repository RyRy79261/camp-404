import "server-only";

import { revalidatePath } from "next/cache";
import {
  MY_DUES_PATH,
  PAYMENTS_IMPORT_PATH,
  PAYMENTS_OWING_PATH,
  PAYMENTS_PATH,
  PAYMENTS_SETTINGS_PATH,
  PAYMENTS_SETTLE_UP_PATH,
} from "./dues-copy";

/**
 * After any dues write: the Finance tools, the member's own page and
 * profile, and the roster, whose "Dues this year" reads the balance.
 */
export function revalidateDues(): void {
  for (const path of [
    PAYMENTS_PATH,
    PAYMENTS_OWING_PATH,
    PAYMENTS_IMPORT_PATH,
    PAYMENTS_SETTLE_UP_PATH,
    PAYMENTS_SETTINGS_PATH,
    MY_DUES_PATH,
    "/profile",
    "/captains/camp-management",
  ]) {
    revalidatePath(path);
  }
  revalidatePath(`${PAYMENTS_OWING_PATH}/[userId]`, "page");
}
