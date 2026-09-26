import "server-only";

import { revalidatePath } from "next/cache";

/**
 * Re-render the acting member's console layout, so their header, Home tiles
 * (and, from PR C, their desktop) are drawn from a fresh program manifest.
 * Next keeps a layout mounted across navigation, so an action that changes a
 * manifest input (an approval, a promotion, a team or lead change, the team
 * settings, the year, a finished gate, a pin) must say so, or the member keeps
 * the old nav until a hard load. The pattern of commit 12eb18e.
 *
 * It refreshes only the member who acted. Everyone else whose manifest the
 * action changed catches up on their next hard load or refused gate (design
 * doc, "Staleness"); every page gate still refuses in the meantime.
 *
 * A plain module, never a "use server" file: exported from one, a sync
 * function breaks the page under `next dev`, and an async one becomes a
 * server-action endpoint any client could call.
 * lib/__tests__/manifest-revalidate.test.ts keeps the list of actions that
 * must call it.
 */
export function revalidateManifest(): void {
  revalidatePath("/", "layout");
}
