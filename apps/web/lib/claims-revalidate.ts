import "server-only";

import { revalidatePath } from "next/cache";
import {
  CLAIM_APPROVALS_PATH,
  MY_CLAIMS_PATH,
  PAYMENTS_BUDGETS_PATH,
  PAYMENTS_CLAIMS_PATH,
} from "./claims-copy";

/**
 * After any claim or budget write: the member's claims, the approvals, the
 * Finance tabs, and every team's page, whose budget panel reads the totals.
 */
export function revalidateClaims(): void {
  for (const path of [
    MY_CLAIMS_PATH,
    CLAIM_APPROVALS_PATH,
    PAYMENTS_BUDGETS_PATH,
    PAYMENTS_CLAIMS_PATH,
  ]) {
    revalidatePath(path);
  }
  revalidatePath("/teams/[key]", "page");
}
